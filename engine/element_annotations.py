"""Detached source-bound text/image annotations; not a mounted VIS-04 claim.

All source fields, ordered incidence and RGBA/null are retained. Only verified
embedded PNG is accepted. Net placement uses source-face coordinates in mm,
so moving/rotating a net part carries its content without resizing it.
"""
import base64
from copy import deepcopy
import hashlib
from html import entities
from html.parser import HTMLParser
import io
import json
import math
import re
import struct
import xml.etree.ElementTree as ET
import zlib

import numpy as np
from PIL import Image
from engine.geometry import GeometryError, identity, validate
from engine.nets import net_svg

SVG = 'http://www.w3.org/2000/svg'
ET.register_namespace('', SVG)
MAX_DOCUMENT = 24 * 1024 * 1024
MAX_SOURCE = 8 * 1024 * 1024
MAX_ASSET = 4 * 1024 * 1024
MAX_PIXELS = 8 * 1024 * 1024
MAX_ENTRIES = 1024
MAX_ASSETS = 64
MAX_TOTAL_PIXELS = 16 * 1024 * 1024
MAX_RUNS = 1024
MAX_CHARS = 4096
MAX_DEPTH = 16
COLORS = {'black', 'white', 'red', 'green', 'blue', 'gray', 'grey', 'orange', 'purple', 'yellow', 'cyan', 'magenta'}
FONTS = {'sans-serif', 'serif', 'monospace'}
STYLE = {'sizeMm': 3.0, 'color': 'black', 'font': 'sans-serif', 'bold': False, 'italic': False, 'baseline': 'normal'}


class AnnotationError(GeometryError):
    pass


def _number(value, low, high, name):
    if type(value) not in (int, float) or not low <= value <= high or not math.isfinite(value):
        raise AnnotationError(name + ' is outside its finite supported range.')
    return float(value)


def _string(value, limit=MAX_CHARS):
    if type(value) is not str or len(value) > limit:
        raise AnnotationError('Text exceeds its supported character limit.')
    if any((ord(c) < 32 and c not in '\t\n\r') or 0xD800 <= ord(c) <= 0xDFFF or ord(c) & 0xFFFF in (0xFFFE, 0xFFFF) for c in value):
        raise AnnotationError('Text contains a character that cannot be represented in XML.')
    return value


def _json(value, limit):
    ancestors = set()
    visited = 0
    lower_bytes = 0
    def walk(item, depth=0):
        nonlocal visited, lower_bytes
        visited += 1
        lower_bytes += len(item) + 2 if type(item) is str else 2
        if visited > 250000 or lower_bytes > limit:
            raise AnnotationError('JSON value/byte work exceeds the supported limit.')
        if depth > 64:
            raise AnnotationError('JSON nesting exceeds the supported limit.')
        if type(item) in (dict, list):
            key_id = id(item)
            if key_id in ancestors:
                raise AnnotationError('JSON contains a cyclic container.')
            ancestors.add(key_id)
            if type(item) is dict:
                for key, child in item.items():
                    _string(key, MAX_DOCUMENT)
                    lower_bytes += len(key) + 3
                    walk(child, depth + 1)
            else:
                for child in item:
                    walk(child, depth + 1)
            ancestors.remove(key_id)
        elif type(item) is str:
            _string(item, MAX_DOCUMENT)
        elif item is not None and type(item) not in (bool, int, float, np.float64):
            raise AnnotationError('Document requires ordinary JSON values.')
    walk(value)
    try:
        raw = json.dumps(value, ensure_ascii=False, allow_nan=False, sort_keys=True, separators=(',', ':')).encode('utf-8')
    except (ValueError, UnicodeError, TypeError) as exc:
        raise AnnotationError('Document is not finite valid JSON.') from exc
    if len(raw) > limit:
        raise AnnotationError('Serialized document exceeds its supported byte limit.')
    return raw


def _source(source):
    _json(source, MAX_SOURCE)
    if type(source) is not dict or any(type(source.get(rank)) is not list for rank in ('vertices', 'edges', 'faces', 'cells')):
        raise AnnotationError('Annotations require an explicit source incidence model.')
    if any(len(source[rank]) > 8192 for rank in ('vertices', 'edges', 'faces', 'cells')):
        raise AnnotationError('Source element count exceeds the supported limit.')
    if any(type(row) is not list for rank in ('vertices', 'edges', 'faces', 'cells') for row in source[rank]):
        raise AnnotationError('Source incidence requires ordinary ordered JSON arrays.')
    if sum(len(row) for rank in ('vertices', 'edges', 'faces', 'cells') for row in source[rank]) > 100000:
        raise AnnotationError('Source incidence exceeds the supported work limit.')
    if any(type(index) is not int for rank in ('edges', 'faces', 'cells') for row in source[rank] for index in row):
        raise AnnotationError('Source incidence must contain explicit integer IDs.')
    try:
        if not validate(source).get('passed'):
            raise AnnotationError('Annotations require a validated source model.')
    except (ValueError, TypeError, KeyError, OverflowError) as exc:
        raise AnnotationError('Annotations require a validated source model.') from exc
    def portable(value):
        if type(value) is dict:
            return ['object', [[key, portable(child)] for key, child in sorted(value.items())]]
        if type(value) is list:
            return ['array', [portable(child) for child in value]]
        if type(value) in (int, float, np.float64):
            try:
                number = float(value)
                if not math.isfinite(number) or (type(value) is int and int(number) != value):
                    raise AnnotationError('Source integer is not losslessly representable in JSON binary64.')
            except OverflowError as exc:
                raise AnnotationError('Source number exceeds finite binary64.') from exc
            return ['number', (number if number else 0.0).hex()]
        return ['scalar', value]
    raw = json.dumps(portable(source), ensure_ascii=False, allow_nan=False, separators=(',', ':')).encode('utf-8')
    if len(raw) > MAX_SOURCE * 8:
        raise AnnotationError('Portable source encoding exceeds its supported byte limit.')
    return raw


def _color(value):
    if type(value) is not str or not (value in COLORS or re.fullmatch(r'#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?', value)):
        raise AnnotationError('Color must be an explicit supported name or hex RGB/RGBA.')
    return value


class _Markup(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.stack = []
        self.style = deepcopy(STYLE)
        self.runs = []

    def emit(self, value):
        _string(value)
        if not value:
            return
        if self.runs and self.runs[-1]['style'] == self.style:
            self.runs[-1]['text'] += value
        else:
            self.runs.append({'text': value, 'style': deepcopy(self.style)})
        if len(self.runs) > MAX_RUNS or sum(len(r['text']) for r in self.runs) > MAX_CHARS:
            raise AnnotationError('Formatted text exceeds its run/character limit.')

    def handle_starttag(self, tag, attrs):
        if tag == 'br' and not attrs:
            self.emit('\n')
            return
        if tag not in ('b', 'i', 'sub', 'sup', 'font') or len(self.stack) >= MAX_DEPTH:
            raise AnnotationError('Unsupported markup tag or nesting depth.')
        if len({k for k, _ in attrs}) != len(attrs):
            raise AnnotationError('Repeated markup attributes are ambiguous.')
        previous = deepcopy(self.style)
        if tag == 'font':
            if not attrs or any(k not in ('color', 'size', 'face') or v is None for k, v in attrs):
                raise AnnotationError('Font accepts only color, size and generic face attributes.')
            for key, value in attrs:
                if key == 'color':
                    self.style['color'] = _color(value)
                elif key == 'face':
                    if value not in FONTS:
                        raise AnnotationError('Use an explicit generic font family.')
                    self.style['font'] = value
                else:
                    if not re.fullmatch(r'\d+(?:\.\d+)?', value):
                        raise AnnotationError('Font size is an absolute physical millimeter value.')
                    self.style['sizeMm'] = _number(float(value), 0.1, 50, 'Font size')
        elif attrs:
            raise AnnotationError('This formatting tag accepts no attributes.')
        elif tag in ('b', 'i'):
            self.style['bold' if tag == 'b' else 'italic'] = True
        else:
            self.style['baseline'] = tag
        self.stack.append((tag, previous))

    def handle_startendtag(self, tag, attrs):
        if tag != 'br':
            raise AnnotationError('Only br may be self-closing.')
        self.handle_starttag(tag, attrs)

    def handle_endtag(self, tag):
        if not self.stack or self.stack[-1][0] != tag:
            raise AnnotationError('Markup tags must be explicitly balanced and properly nested.')
        _, self.style = self.stack.pop()

    def handle_data(self, data):
        self.emit(data)

    def handle_entityref(self, name):
        if name + ';' not in entities.html5:
            raise AnnotationError('Unknown HTML entity.')
        self.emit(entities.html5[name + ';'])

    def handle_charref(self, name):
        try:
            code = int(name[1:], 16) if name.lower().startswith('x') else int(name, 10)
            if not 0 <= code <= 0x10FFFF:
                raise ValueError()
            self.emit(chr(code))
        except (ValueError, OverflowError) as exc:
            raise AnnotationError('Invalid numeric character entity.') from exc

    def handle_comment(self, data):
        raise AnnotationError('Comments are not formatted text.')

    def handle_decl(self, decl):
        raise AnnotationError('Declarations are not formatted text.')

    def handle_pi(self, data):
        raise AnnotationError('Processing instructions are not formatted text.')

    def unknown_decl(self, data):
        raise AnnotationError('Unknown declarations are not formatted text.')


def compile_text(markup):
    _string(markup)
    parser = _Markup()
    try:
        parser.feed(markup)
        parser.close()
    except (AssertionError, ValueError) as exc:
        if isinstance(exc, AnnotationError):
            raise
        raise AnnotationError('Malformed formatted text.') from exc
    if parser.stack:
        raise AnnotationError('Markup has an unclosed formatting tag.')
    if sum(r['text'].count('\n') for r in parser.runs) >= 64:
        raise AnnotationError('At most 64 text lines are supported.')
    return deepcopy(parser.runs)


def new_document(source):
    raw = _source(source)
    return {'schema': 'polytope-element-annotations', 'version': 1,
            'source': deepcopy(source), 'sourceSha256': hashlib.sha256(raw).hexdigest(),
            'entries': [], 'assets': {}}


def _anchor(source, kind, index):
    names = {'vertex': 'vertices', 'edge': 'edges', 'face': 'faces', 'cell': 'cells'}
    if type(kind) is not str or kind not in names or type(index) is not int or not 0 <= index < len(source.get(names[kind], [])):
        raise AnnotationError('Choose an existing source element with an integer ID.')


def _placement(value):
    if type(value) is not dict or set(value) != {'offsetMm', 'rotationDeg', 'lineHeightMm'}:
        raise AnnotationError('Text placement requires explicit offset, rotation and line height.')
    offset = value['offsetMm']
    if type(offset) is not list or len(offset) != 2:
        raise AnnotationError('Offset needs two physical millimeter coordinates.')
    return {'offsetMm': [_number(x, -1000, 1000, 'Offset') for x in offset],
            'rotationDeg': _number(value['rotationDeg'], -360, 360, 'Rotation'),
            'lineHeightMm': _number(value['lineHeightMm'], 0.1, 100, 'Line height')}


def set_text(document, source, kind, index, markup, placement=None):
    validate_document(document, source)
    _anchor(source, kind, index)
    compile_text(markup)
    placement = _placement({'offsetMm': [0, 0], 'rotationDeg': 0, 'lineHeightMm': 4} if placement is None else placement)
    result = deepcopy(document)
    entry = next((x for x in result['entries'] if x['kind'] == kind and x['index'] == index), None)
    if entry is None:
        entry = {'kind': kind, 'index': index, 'text': None, 'texture': None}
        result['entries'].append(entry)
    entry['text'] = {'markup': markup, 'placement': placement}
    validate_document(result, source)
    return result


def _png(raw):
    if type(raw) is not bytes or len(raw) > MAX_ASSET or not raw.startswith(b'\x89PNG\r\n\x1a\n'):
        raise AnnotationError('Use a bounded embedded PNG image.')
    offset, chunks, has_data, ended = 8, 0, False, False
    while offset < len(raw):
        chunks += 1
        if chunks > 2048 or offset + 12 > len(raw):
            raise AnnotationError('PNG chunk structure is incomplete or exceeds the work limit.')
        length = struct.unpack('>I', raw[offset:offset + 4])[0]
        tag = raw[offset + 4:offset + 8]
        end = offset + 12 + length
        if end > len(raw) or not re.fullmatch(b'[A-Za-z]{4}', tag):
            raise AnnotationError('Invalid PNG chunk length/type.')
        if (chunks == 1 and (tag != b'IHDR' or length != 13)) or (chunks != 1 and tag == b'IHDR'):
            raise AnnotationError('PNG requires a single leading image header.')
        if tag[0] < 97 and tag not in (b'IHDR', b'PLTE', b'IDAT', b'IEND'):
            raise AnnotationError('Unsupported critical PNG chunk.')
        expected_crc = struct.unpack('>I', raw[end - 4:end])[0]
        if zlib.crc32(raw[offset + 4:end - 4]) != expected_crc:
            raise AnnotationError('PNG chunk checksum does not match its bytes.')
        has_data |= tag == b'IDAT'
        if tag == b'IEND':
            if length != 0 or end != len(raw):
                raise AnnotationError('PNG must end exactly at its terminal chunk.')
            ended = True
        offset = end
    if not ended or not has_data:
        raise AnnotationError('PNG requires image data and a complete terminal chunk.')
    try:
        with Image.open(io.BytesIO(raw)) as image:
            width, height = image.size
            if image.format != 'PNG' or getattr(image, 'n_frames', 1) != 1 or not 1 <= width <= 4096 or not 1 <= height <= 4096 or width * height > MAX_PIXELS:
                raise AnnotationError('PNG dimensions or animation exceed the supported domain.')
            image.load()
            output = io.BytesIO()
            rgba = image.convert('RGBA')
            rgba.info.clear()
            rgba.save(output, format='PNG', compress_level=6)
            clean = output.getvalue()
    except AnnotationError:
        raise
    except Exception as exc:
        raise AnnotationError('PNG cannot be decoded.') from exc
    if len(clean) > MAX_ASSET:
        raise AnnotationError('Normalized PNG exceeds the asset byte limit.')
    return clean, width, height


def set_texture(document, source, face_index, png_bytes):
    validate_document(document, source)
    _anchor(source, 'face', face_index)
    clean, width, height = _png(png_bytes)
    key = hashlib.sha256(clean).hexdigest()
    result = deepcopy(document)
    result['assets'][key] = {'mime': 'image/png', 'width': width, 'height': height,
                             'base64': base64.b64encode(clean).decode('ascii')}
    entry = next((x for x in result['entries'] if x['kind'] == 'face' and x['index'] == face_index), None)
    if entry is None:
        entry = {'kind': 'face', 'index': face_index, 'text': None, 'texture': None}
        result['entries'].append(entry)
    entry['texture'] = {'asset': key, 'mapping': 'face-frame-bounds'}
    used = {x['texture']['asset'] for x in result['entries'] if x['texture'] is not None}
    result['assets'] = {key: asset for key, asset in result['assets'].items() if key in used}
    validate_document(result, source)
    return result


def validate_document(document, source):
    raw = _source(source)
    _json(document, MAX_DOCUMENT)
    if type(document) is not dict or set(document) != {'schema', 'version', 'source', 'sourceSha256', 'entries', 'assets'} or document['schema'] != 'polytope-element-annotations' or type(document['version']) is not int or document['version'] != 1:
        raise AnnotationError('Unsupported annotation document schema.')
    if document['sourceSha256'] != hashlib.sha256(raw).hexdigest() or _source(document['source']) != raw:
        raise AnnotationError('Annotation source changed; explicit correspondence/remapping is required.')
    entries, assets = document['entries'], document['assets']
    if type(entries) is not list or len(entries) > MAX_ENTRIES or type(assets) is not dict or len(assets) > MAX_ASSETS:
        raise AnnotationError('Annotation/asset count exceeds the supported limit.')
    seen, used = set(), set()
    for entry in entries:
        if type(entry) is not dict or set(entry) != {'kind', 'index', 'text', 'texture'}:
            raise AnnotationError('Malformed element annotation.')
        _anchor(source, entry['kind'], entry['index'])
        key = (entry['kind'], entry['index'])
        if key in seen:
            raise AnnotationError('Repeated source element annotation.')
        seen.add(key)
        if entry['text'] is not None:
            value = entry['text']
            if type(value) is not dict or set(value) != {'markup', 'placement'}:
                raise AnnotationError('Malformed text content.')
            compile_text(value['markup'])
            _placement(value['placement'])
        if entry['texture'] is not None:
            texture = entry['texture']
            if entry['kind'] != 'face' or type(texture) is not dict or set(texture) != {'asset', 'mapping'} or texture['mapping'] != 'face-frame-bounds' or type(texture['asset']) is not str or texture['asset'] not in assets:
                raise AnnotationError('Texture needs a verified existing face asset.')
            used.add(texture['asset'])
        if entry['texture'] is None and entry['text'] is None:
            raise AnnotationError('Empty entries must be removed explicitly.')
    if set(assets) != used:
        raise AnnotationError('Assets must have exactly the used content identities.')
    total_pixels = 0
    for key, asset in assets.items():
        if type(asset) is not dict or set(asset) != {'mime', 'width', 'height', 'base64'} or asset['mime'] != 'image/png' or type(asset['base64']) is not str:
            raise AnnotationError('Unsupported image asset.')
        try:
            decoded = base64.b64decode(asset['base64'], validate=True)
        except (ValueError, TypeError) as exc:
            raise AnnotationError('Invalid image encoding.') from exc
        clean, width, height = _png(decoded)
        total_pixels += width * height
        if total_pixels > MAX_TOTAL_PIXELS:
            raise AnnotationError('Total decoded image pixels exceed the document work limit.')
        if decoded != clean or hashlib.sha256(clean).hexdigest() != key or type(asset['width']) is not int or type(asset['height']) is not int or (width, height) != (asset['width'], asset['height']):
            raise AnnotationError('Image bytes, dimensions or content identity changed.')
    return True


def serialize(document, source):
    validate_document(document, source)
    return _json(document, MAX_DOCUMENT)


def load(raw, source):
    if type(raw) is not bytes or len(raw) > MAX_DOCUMENT:
        raise AnnotationError('Use bounded serialized annotation bytes.')
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise AnnotationError('Repeated JSON keys are ambiguous.')
            result[key] = value
        return result
    try:
        result = json.loads(raw.decode('utf-8'), object_pairs_hook=pairs,
                            parse_constant=lambda x: (_ for _ in ()).throw(AnnotationError('Nonfinite JSON constant.')))
    except (UnicodeError, ValueError, RecursionError) as exc:
        raise AnnotationError('Invalid annotation JSON.') from exc
    validate_document(result, source)
    return deepcopy(result)


def face_frame(source, index):
    _anchor(source, 'face', index)
    points = np.asarray(source['vertices'], dtype=float)[source['faces'][index]]
    origin = points[0]
    u = points[1] - origin
    length = float(np.linalg.norm(u))
    if not math.isfinite(length) or length <= 0:
        raise AnnotationError('Face has a degenerate first edge.')
    u /= length
    residual = points - origin - np.outer((points - origin) @ u, u)
    pivot = int(np.argmax(np.linalg.norm(residual, axis=1)))
    v = residual[pivot]
    norm = float(np.linalg.norm(v))
    if norm <= length * 1e-10:
        raise AnnotationError('Face has no independent tangent direction.')
    v /= norm
    xy = np.column_stack(((points - origin) @ u, (points - origin) @ v))
    error = np.linalg.norm(points - origin - np.outer(xy[:, 0], u) - np.outer(xy[:, 1], v), axis=1)
    if max(error) > max(1, float(np.max(np.linalg.norm(points - origin, axis=1)))) * 1e-8:
        raise AnnotationError('Face content currently requires a checked planar source face.')
    return {'origin': origin.tolist(), 'u': u.tolist(), 'v': v.tolist(), 'xy': xy.tolist(), 'pivot': pivot}


def _net_frame(source, net, face):
    frame = face_frame(source, face['id'])
    xy = np.asarray(frame['xy'])
    raw_points = face.get('points')
    if type(raw_points) is not list or any(type(row) is not list or len(row) != 2 or any(type(value) not in (int, float) for value in row) for row in raw_points):
        raise AnnotationError('Net points require ordinary numeric coordinate pairs.')
    for row in raw_points:
        for coordinate in row:
            _number(coordinate, -1000000, 1000000, 'Net coordinate')
    points = np.asarray(raw_points, dtype=float)
    cycle = face.get('sourceVertices')
    if points.shape != xy.shape or not np.all(np.isfinite(points)) or type(cycle) is not list or any(type(index) is not int for index in cycle) or cycle != source['faces'][face['id']]:
        raise AnnotationError('Net face source cycle or coordinates changed.')
    edge = np.asarray(source['vertices'][source['edges'][0][1]]) - source['vertices'][source['edges'][0][0]]
    edge_length = float(np.linalg.norm(edge))
    net_edge_length = float(np.linalg.norm(points[1] - points[0]))
    if not math.isfinite(edge_length) or edge_length <= 0 or net_edge_length <= 0 or np.max(np.abs(points)) > 1000000:
        raise AnnotationError('Net has a degenerate edge or exceeds the physical coordinate range.')
    scale = _number(net['referenceEdgeLengthMm'], 1, 1000, 'Reference edge') / edge_length
    u = (points[1] - points[0]) / net_edge_length
    q = points[frame['pivot']] - points[0]
    v = q - u * float(q @ u)
    v_length = float(np.linalg.norm(v))
    if v_length <= 0:
        raise AnnotationError('Net face has no independent tangent direction.')
    v /= v_length
    predicted = points[0] + np.outer(xy[:, 0] * scale, u) + np.outer(xy[:, 1] * scale, v)
    if not np.allclose(predicted, points, rtol=0, atol=max(1, float(np.max(np.linalg.norm(xy * scale, axis=1)))) * 1e-8):
        raise AnnotationError('Net changed source-face shape or physical scale.')
    low = np.asarray(net['bounds'][0], dtype=float)
    origin = points[0] - low + 8
    return xy * scale, origin, u, v


def annotated_net_svg(document, source, net, *, expected_face_ids=None):
    validate_document(document, source)
    _json(net, MAX_DOCUMENT)
    if type(net) is not dict or net.get('sourceFingerprint') != identity(source) or net.get('sourceId') != source.get('id') or net.get('units') != 'mm' or type(net.get('referenceEdge')) is not int or net['referenceEdge'] != 0:
        raise AnnotationError('Net does not belong to the current source/physical scale.')
    ids = list(range(len(source['faces']))) if expected_face_ids is None else expected_face_ids
    if type(ids) is not list or not ids or any(type(i) is not int or not 0 <= i < len(source['faces']) for i in ids) or len(ids) != len(set(ids)):
        raise AnnotationError('Export requires distinct explicit expected source face IDs.')
    records = net.get('faces', [])
    if type(records) is not list or len(records) != len(ids) or any(type(f) is not dict or type(f.get('id')) is not int for f in records) or sorted(f['id'] for f in records) != sorted(ids):
        raise AnnotationError('This export requires every source face exactly once.')
    bounds = net.get('bounds')
    if type(bounds) is not list or len(bounds) != 2 or any(type(row) is not list or len(row) != 2 for row in bounds):
        raise AnnotationError('Net needs two explicit finite physical bounds.')
    for row in bounds:
        for coordinate in row:
            _number(coordinate, -1000000, 1000000, 'Net bound')
    if any(bounds[1][i] <= bounds[0][i] for i in (0, 1)) or type(net.get('tabs')) is not bool:
        raise AnnotationError('Net bounds/tab policy are invalid.')
    edge_ids = {tuple(sorted(edge)): i for i, edge in enumerate(source['edges'])}
    for face in records:
        if type(face.get('component')) is not int or not 0 <= face['component'] < len(source['faces']):
            raise AnnotationError('Net component must be an explicit numeric source component.')
        cycle = source['faces'][face['id']]
        if type(face.get('edges')) is not list or len(face['edges']) != len(cycle):
            raise AnnotationError('Net edge labels must match the complete source face cycle.')
        for record, a, b in zip(face['edges'], cycle, cycle[1:] + cycle[:1]):
            if type(record) is not dict or set(record) != {'id', 'hinge'} or type(record['id']) is not int or record['id'] != edge_ids.get(tuple(sorted((a, b)))) or type(record['hinge']) is not bool:
                raise AnnotationError('Net edge identity/hinge does not match its source cycle.')
    pairs = net.get('tabOverlapPairs', [])
    if type(pairs) is not list or any(type(p) is not dict or set(p) not in ({'edge', 'face'}, {'edge', 'otherTabEdge'}) or any(type(v) is not int or not 0 <= v < (len(source['faces']) if k == 'face' else len(source['edges'])) for k, v in p.items()) for p in pairs):
        raise AnnotationError('Tab diagnostics require explicit bounded source IDs.')
    frames = {face['id']: _net_frame(source, net, face) for face in records}
    cloud = np.concatenate([np.asarray(face['points'], dtype=float) for face in records])
    padding = 8 if expected_face_ids is not None else 0
    if np.any(cloud.min(axis=0) < np.asarray(bounds[0]) - padding - 1e-8) or np.any(cloud.max(axis=0) > np.asarray(bounds[1]) + padding + 1e-8):
        raise AnnotationError('Net bounds omit source face geometry.')
    safe_net = {key: deepcopy(net[key]) for key in ('bounds', 'tabs', 'referenceEdgeLengthMm')}
    safe_net['faces'] = [{key: deepcopy(face[key]) for key in ('id', 'component', 'sourceVertices', 'points', 'edges')} for face in records]
    safe_net['tabOverlapPairs'] = deepcopy(pairs)
    if net.get('tabOptions') is not None:
        from .net_tabs import tab_records_for_faces
        safe_net['tabRecords'] = tab_records_for_faces(source, safe_net, net['tabOptions'])
    elif net.get('tabRecords') is not None:
        from .net_color_printing import legacy_tab_records
        safe_net['tabRecords'] = legacy_tab_records(source, safe_net)
    safe_net['status'] = 'Source-bound face annotations; physical millimeter placement'
    root = ET.fromstring(net_svg(safe_net))
    defs = ET.SubElement(root, '{' + SVG + '}defs')
    groups = {int(g.attrib['data-net-face']): g for g in root.iter('{' + SVG + '}g') if 'data-net-face' in g.attrib}
    for entry in document['entries']:
        if entry['kind'] != 'face' or entry['index'] not in groups:
            continue
        index = entry['index']
        xy, origin, u, v = frames[index]
        group = groups[index]
        polygon = group.find('{' + SVG + '}polygon')
        clip_id = 'annotation-face-' + str(index)
        clip = ET.SubElement(defs, '{' + SVG + '}clipPath', {'id': clip_id, 'clipPathUnits': 'userSpaceOnUse'})
        ET.SubElement(clip, '{' + SVG + '}polygon', {'points': polygon.attrib['points'], 'clip-rule': 'nonzero'})
        layer = ET.Element('{' + SVG + '}g', {'data-annotation-face': str(index), 'clip-path': 'url(#' + clip_id + ')'})
        group.insert(1, layer)
        transform = f'matrix({u[0]:.12g} {u[1]:.12g} {v[0]:.12g} {v[1]:.12g} {origin[0]:.12g} {origin[1]:.12g})'
        local = ET.SubElement(layer, '{' + SVG + '}g', {'transform': transform})
        if entry['texture'] is not None:
            asset = document['assets'][entry['texture']['asset']]
            low, high = xy.min(axis=0), xy.max(axis=0)
            ET.SubElement(local, '{' + SVG + '}image', {'x': format(low[0], '.12g'), 'y': format(low[1], '.12g'),
                'width': format(high[0] - low[0], '.12g'), 'height': format(high[1] - low[1], '.12g'),
                'preserveAspectRatio': 'none', 'href': 'data:image/png;base64,' + asset['base64']})
        if entry['text'] is not None:
            value = entry['text']; placement = value['placement']
            center = xy.mean(axis=0) + placement['offsetMm']
            text_group = ET.SubElement(local, '{' + SVG + '}g', {'transform': f'translate({center[0]:.12g} {center[1]:.12g}) rotate({placement["rotationDeg"]:.12g})'})
            line = 0
            node = ET.SubElement(text_group, '{' + SVG + '}text', {'x': '0', 'y': '0', 'text-anchor': 'middle'})
            for run in compile_text(value['markup']):
                chunks = run['text'].split('\n')
                for part, chunk in enumerate(chunks):
                    if part:
                        line += 1
                        node = ET.SubElement(text_group, '{' + SVG + '}text', {'x': '0', 'y': format(line * placement['lineHeightMm'], '.12g'), 'text-anchor': 'middle'})
                    if chunk:
                        style = run['style']
                        attributes = {'font-size': str(style['sizeMm']), 'font-family': style['font'], 'fill': style['color'],
                            'font-weight': 'bold' if style['bold'] else 'normal', 'font-style': 'italic' if style['italic'] else 'normal'}
                        if style['baseline'] != 'normal':
                            attributes['baseline-shift'] = 'sub' if style['baseline'] == 'sub' else 'super'
                        ET.SubElement(node, '{' + SVG + '}tspan', attributes).text = chunk
    return ET.tostring(root, encoding='unicode'), {'sourceSha256': document['sourceSha256'],
        'allSourceFacesRepresented': sorted(ids) == list(range(len(source['faces']))), 'allExpectedSourceFacesRepresented': True, 'sourceFaceIds': sorted(ids), 'units': 'mm', 'contentScale': 1,
        'annotationFaceIds': [e['index'] for e in document['entries'] if e['kind'] == 'face' and e['index'] in groups],
        'unrenderedElementKinds': sorted({e['kind'] for e in document['entries'] if e['kind'] != 'face'}),
        'wholeStellaTextMarkupSupported': False, 'hardwarePrintQualified': False, 'mounted': False}
