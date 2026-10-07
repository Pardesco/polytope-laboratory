"""Bounded ASCII DXF source geometry. No tessellation, hull or solid inference."""
from itertools import product
from collections import Counter
import hashlib
import math
import re
import uuid

import numpy as np

from .geometry import GeometryError, MAX_VERTICES, TOLERANCE, identity, rank, validate

MAX_FILE_BYTES = 128 * 1024 * 1024
MAX_PAIRS = 1_000_000
MAX_ENTITIES = 100_000
MAX_SOURCE_VERTICES = 100_000
MAX_WELD_COMPARISONS = 1_000_000
MAX_COORDINATE = 1e100
UNITS = ['unitless', 'inches', 'feet', 'miles', 'millimeters', 'centimeters',
         'meters', 'kilometers', 'microinches', 'mils', 'yards', 'angstroms',
         'nanometers', 'micrometers', 'decimeters', 'decameters', 'hectometers',
         'gigameters', 'astronomical-units', 'light-years', 'parsecs',
         'us-survey-feet', 'us-survey-inches', 'us-survey-yards', 'us-survey-miles']


def _integer(value, label):
    if not re.fullmatch(r'[+-]?[0-9]+', value):
        raise GeometryError(f'DXF {label} must be an integer.')
    try:
        return int(value)
    except ValueError as exc:
        raise GeometryError(f'DXF {label} integer exceeds the supported numeric input domain.') from exc


def _number(value, label):
    if not re.fullmatch(r'[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?', value):
        raise GeometryError(f'DXF {label} must use a decimal numeric value.')
    try:
        result = float(value)
    except ValueError as exc:
        raise GeometryError(f'DXF {label} must be numeric.') from exc
    if not math.isfinite(result) or abs(result) > MAX_COORDINATE:
        raise GeometryError(f'DXF {label} must be finite and within ±{MAX_COORDINATE:g}.')
    return result


def _one(fields, code, default=None):
    values = [value for key, value in fields if key == code]
    if len(values) > 1:
        raise GeometryError(f'DXF duplicate group code {code} is ambiguous.')
    return values[0] if values else default


def _int(fields, code, default=0):
    return _integer(_one(fields, code, str(default)), f'group {code}')


def _float(fields, code, default=0):
    return _number(_one(fields, code, str(default)), f'group {code}')


def _point(fields, code=10, required=True):
    if required and (_one(fields, code) is None or _one(fields, code + 10) is None):
        raise GeometryError(f'DXF point groups {code}/{code+10} are required.')
    return [_float(fields, code + offset) for offset in (0, 10, 20)]


def _pairs(text):
    if not isinstance(text, str):
        raise GeometryError('DXF import requires decoded ASCII-format text, not binary data.')
    if '\x00' in text or text.startswith('AutoCAD Binary DXF'):
        raise GeometryError('Binary DXF is unsupported; use ASCII DXF.')
    if len(text) > MAX_FILE_BYTES:
        raise GeometryError('DXF file exceeds the 128 MiB limit.')
    try:
        encoded_size = len(text.encode('utf-8'))
    except UnicodeEncodeError as exc:
        raise GeometryError('DXF text contains an invalid Unicode value.') from exc
    if encoded_size > MAX_FILE_BYTES:
        raise GeometryError('DXF file exceeds the 128 MiB limit.')
    lines = text.lstrip('\ufeff').splitlines()
    while lines and not lines[-1].strip():
        lines.pop()
    if len(lines) % 2:
        raise GeometryError('DXF must contain complete group-code/value pairs.')
    if len(lines) // 2 > MAX_PAIRS:
        raise GeometryError('DXF group-pair resource limit exceeded.')
    pairs = []
    for i in range(0, len(lines), 2):
        code = _integer(lines[i].strip(), f'group code at line {i+1}')
        if not 0 <= code <= 1071:
            raise GeometryError(f'DXF group code {code} is outside the supported range.')
        if code != 999:
            pairs.append((code, lines[i+1].strip()))
    return pairs


def _sections(pairs):
    sections, i = {}, 0
    while i < len(pairs):
        if pairs[i] == (0, 'EOF'):
            if i != len(pairs) - 1:
                raise GeometryError('DXF has data after EOF.')
            return sections
        if pairs[i] != (0, 'SECTION') or i + 1 >= len(pairs) or pairs[i+1][0] != 2:
            raise GeometryError('DXF expected SECTION/name or final EOF.')
        name = pairs[i+1][1]
        if name in sections:
            raise GeometryError(f'DXF duplicate {name} section.')
        if name not in {'HEADER', 'TABLES', 'BLOCKS', 'ENTITIES', 'CLASSES', 'OBJECTS'}:
            raise GeometryError(f'DXF unsupported section {name}.')
        start = i + 2
        i = start
        while i < len(pairs) and pairs[i] != (0, 'ENDSEC'):
            if pairs[i] in {(0, 'SECTION'), (0, 'EOF')}:
                raise GeometryError(f'DXF unterminated {name} section.')
            i += 1
        if i == len(pairs):
            raise GeometryError(f'DXF missing ENDSEC for {name}.')
        sections[name] = pairs[start:i]
        i += 1
    raise GeometryError('DXF missing final EOF.')


def _records(pairs):
    records = []
    for code, value in pairs:
        if code == 0:
            records.append({'type': value, 'fields': []})
        elif not records:
            raise GeometryError('DXF entity/table record must start with group 0.')
        else:
            records[-1]['fields'].append((code, value))
    return records


def _color(fields, default=256):
    aci = _int(fields, 62, default)
    if not -255 <= aci <= 256:
        raise GeometryError('DXF ACI color must be in -255–256.')
    result = {'aci': abs(aci), 'off': aci < 0,
              'method': 'byblock' if aci == 0 else 'bylayer' if aci == 256 else 'aci'}
    rgb = _one(fields, 420)
    if rgb is not None:
        rgb = _integer(rgb, 'true color')
        if not 0 <= rgb <= 0xffffff:
            raise GeometryError('DXF true color must be a 24-bit RGB value.')
        result.update(method='true-color', trueColor=rgb, rgb=[rgb >> 16, (rgb >> 8) & 255, rgb & 255])
    name = _one(fields, 430)
    if name is not None:
        result['name'] = name
    transparency = _one(fields, 440)
    if transparency is not None:
        transparency = _integer(transparency, 'transparency')
        if not 0 <= transparency <= 0xffffffff:
            raise GeometryError('DXF transparency code is outside its 32-bit domain.')
        result['transparencyCode'] = transparency
    return result


def _header(pairs):
    variables, current = {}, None
    for code, value in pairs:
        if code == 9:
            if value in variables:
                raise GeometryError(f'DXF duplicate HEADER variable {value}.')
            current = value
            variables[current] = []
        elif current is None:
            raise GeometryError('DXF HEADER field has no variable name.')
        else:
            variables[current].append((code, value))
    units = None
    if '$INSUNITS' in variables:
        fields = variables['$INSUNITS']
        if len(fields) != 1 or fields[0][0] != 70:
            raise GeometryError('DXF $INSUNITS requires exactly one group 70.')
        units = _int(fields, 70)
        if not 0 <= units < len(UNITS):
            raise GeometryError('DXF $INSUNITS is outside the supported 0–24 domain.')
    return {'insunits': units, 'unitName': UNITS[units] if units is not None else 'unspecified',
            'acadVersion': _one(variables.get('$ACADVER', []), 1),
            'coordinatesScaled': False}


def _layers(pairs):
    layers, table = {}, None
    for record in _records(pairs):
        kind, fields = record['type'], record['fields']
        if kind == 'TABLE':
            if table is not None:
                raise GeometryError('DXF nested TABLE is malformed.')
            table = _one(fields, 2)
            if not table:
                raise GeometryError('DXF TABLE name is required.')
        elif kind == 'ENDTAB':
            if table is None:
                raise GeometryError('DXF ENDTAB without TABLE.')
            table = None
        elif table is None:
            raise GeometryError('DXF table entry outside TABLE.')
        elif kind != table:
            raise GeometryError(f'DXF {kind} record does not belong in {table} TABLE.')
        elif table == 'LAYER':
            if kind != 'LAYER':
                raise GeometryError('DXF non-LAYER record in LAYER table.')
            name = _one(fields, 2)
            if not name or name in layers:
                raise GeometryError('DXF layer names must be nonempty and unique.')
            flags = _int(fields, 70)
            if not 0 <= flags <= 127:
                raise GeometryError('DXF layer flags are outside the supported domain.')
            layers[name] = {'flags': flags, 'frozen': bool(flags & 1), 'color': _color(fields, 7)}
    if table is not None:
        raise GeometryError('DXF missing ENDTAB.')
    return layers


def _style(record, layers):
    fields = record['fields']
    if _int(fields, 67) != 0:
        raise GeometryError('DXF paper-space geometry is unsupported; export model space.')
    if _float(fields, 39) != 0:
        raise GeometryError('DXF nonzero entity thickness is unsupported.')
    visibility = _int(fields, 60)
    if visibility not in (0, 1):
        raise GeometryError('DXF visibility group 60 must be 0 or 1.')
    layer = _one(fields, 8, '0')
    if not layer:
        raise GeometryError('DXF entity layer name must be nonempty.')
    color = _color(fields)
    if color['method'] == 'bylayer' and layer in layers:
        color['resolvedLayerColor'] = layers[layer]['color'].copy()
    extrusion = [_float(fields, code, default) for code, default in ((210, 0), (220, 0), (230, 1))]
    if not math.hypot(*extrusion):
        raise GeometryError('DXF extrusion direction must be nonzero.')
    return {'type': record['type'], 'handle': _one(fields, 5), 'layer': layer,
            'color': color, 'invisible': bool(visibility), 'extrusionDirection': extrusion}


class _Builder:
    def __init__(self, tolerance):
        self.tolerance = tolerance
        self.vertices, self.sources, self.faces, self.face_sources = [], [], [], []
        self.edges, self.edge_index, self.edge_sources = [], {}, []
        self.exact, self.grid, self.comparisons = {}, {}, 0

    def _cell(self, point):
        tn, td = self.tolerance.as_integer_ratio()
        return tuple((x.as_integer_ratio()[0] * td) // (x.as_integer_ratio()[1] * tn) for x in point)

    def vertex(self, point, entity, slot):
        if len(self.sources) >= MAX_SOURCE_VERTICES:
            raise GeometryError('DXF source-vertex resource limit exceeded.')
        key = tuple(point)
        found = self.exact.get(key)
        cell = None
        if found is None and self.tolerance:
            cell = self._cell(point)
            candidates = sorted(v for delta in product((-1, 0, 1), repeat=3)
                                for v in self.grid.get(tuple(a+b for a, b in zip(cell, delta)), []))
            for candidate in candidates:
                self.comparisons += 1
                if self.comparisons > MAX_WELD_COMPARISONS:
                    raise GeometryError('DXF welding comparison resource limit exceeded.')
                if math.dist(point, self.vertices[candidate]) <= self.tolerance:
                    found = candidate
                    break
        if found is None:
            if len(self.vertices) >= MAX_VERTICES:
                raise GeometryError('DXF retained-vertex resource limit exceeded.')
            found = len(self.vertices)
            self.vertices.append(point)
            if self.tolerance:
                cell = cell or self._cell(point)
                self.grid.setdefault(cell, []).append(found)
        self.exact[key] = found
        source = len(self.sources)
        self.sources.append({'entity': entity, 'slot': slot, 'coordinates': point, 'modelVertex': found})
        return found, source

    def edge(self, a, b, source):
        if a == b:
            raise GeometryError('DXF edge collapsed or has identical endpoints after welding.')
        key = tuple(sorted((a, b)))
        index = self.edge_index.get(key)
        if index is None:
            index = len(self.edges)
            self.edge_index[key] = index
            self.edges.append(list(key))
            self.edge_sources.append([])
        self.edge_sources[index].append(source)
        return index

    def face(self, vertices, entity, raw_hidden, source_vertices):
        if len(vertices) < 3 or len(set(vertices)) != len(vertices):
            raise GeometryError('DXF face has repeated/collapsed boundary vertices after welding.')
        index = len(self.faces)
        self.faces.append(vertices)
        edges = [self.edge(a, b, {'entity': entity, 'face': index, 'boundary': i})
                 for i, (a, b) in enumerate(zip(vertices, vertices[1:]+vertices[:1]))]
        hidden = [i for i, (a, b) in enumerate(zip(vertices, vertices[1:]+vertices[:1]))
                  if (a, b) in raw_hidden]
        self.face_sources.append({'entity': entity, 'sourceVertices': source_vertices,
                                  'edgeIds': edges, 'hiddenBoundaryEdges': hidden})
        return index


def parse_dxf(text, name='DXF import', *, weld_tolerance=0.0):
    """Return a validated WCS XYZ complex. Welding is absolute in source units."""
    if isinstance(weld_tolerance, bool) or not isinstance(weld_tolerance, (int, float)):
        raise GeometryError('DXF welding tolerance must be a finite nonnegative number.')
    try:
        tolerance = float(weld_tolerance)
    except OverflowError as exc:
        raise GeometryError('DXF welding tolerance is outside the finite domain.') from exc
    if not math.isfinite(tolerance) or not 0 <= tolerance <= MAX_COORDINATE:
        raise GeometryError('DXF welding tolerance must be finite, nonnegative and at most 1e100.')
    sections = _sections(_pairs(text))
    if 'ENTITIES' not in sections:
        raise GeometryError('DXF requires an ENTITIES section.')
    block_open = False
    for record in _records(sections.get('BLOCKS', [])):
        if record['type'] == 'BLOCK' and not block_open:
            block_open = True
        elif record['type'] == 'ENDBLK' and block_open:
            block_open = False
        else:
            raise GeometryError('DXF nonempty or malformed BLOCKS are unsupported; explode blocks before export.')
    if block_open:
        raise GeometryError('DXF BLOCK has no ENDBLK.')
    layers, header = _layers(sections.get('TABLES', [])), _header(sections.get('HEADER', []))
    records = _records(sections['ENTITIES'])
    if len(records) > MAX_ENTITIES:
        raise GeometryError('DXF entity resource limit exceeded.')
    builder, entities, warnings = _Builder(tolerance), [], []
    i = 0
    while i < len(records):
        record = records[i]
        kind, fields = record['type'], record['fields']
        if kind not in {'3DFACE', 'LINE', 'POINT', 'POLYLINE'}:
            raise GeometryError(f'DXF unsupported entity {kind} at record {i}; no partial model returned.')
        source_id = len(entities)
        info = _style(record, layers)
        entities.append(info)
        if kind in {'POINT', 'LINE'}:
            points = [_point(fields)] + ([_point(fields, 11)] if kind == 'LINE' else [])
            mapped = [builder.vertex(point, source_id, k) for k, point in enumerate(points)]
            info['modelVertices'] = [v for v, source in mapped]
            if kind == 'LINE':
                info['modelEdges'] = [builder.edge(*info['modelVertices'], {'entity': source_id, 'kind': 'LINE'})]
        elif kind == '3DFACE':
            points = [_point(fields, code) for code in (10, 11, 12)]
            fourth = any(_one(fields, code) is not None for code in (13, 23, 33))
            points.append(_point(fields, 13) if fourth else points[2])
            mask = _int(fields, 70)
            if not 0 <= mask <= 15:
                raise GeometryError('DXF 3DFACE invisible-edge mask must be in 0–15.')
            mapped = [builder.vertex(point, source_id, k) for k, point in enumerate(points)]
            vertices = [v for v, source in mapped]
            hidden = [(vertices[k], vertices[(k+1) % 4]) for k in range(4) if mask & (1 << k)]
            # A triangular 3DFACE repeats its third corner in its fourth slot.
            triangle = points[3] == points[2]
            face = builder.face(vertices[:3] if triangle else vertices, source_id, hidden,
                                [s for v, s in mapped])
            info.update(modelFaces=[face], invisibleEdgeFlags=mask, implicitFourthCorner=not fourth)
        else:
            flags = _int(fields, 70)
            if not flags & 64 or flags & ~(64 | 128):
                raise GeometryError('DXF POLYLINE supports polyface meshes (flag 64) only.')
            declared = [_int(fields, code) for code in (71, 72)]
            if any(count < 0 or count > MAX_SOURCE_VERTICES for count in declared):
                raise GeometryError('DXF polyface declared counts exceed resource limits.')
            local_vertices, face_records = [], []
            i += 1
            while i < len(records) and records[i]['type'] == 'VERTEX':
                vertex = records[i]
                vf = vertex['fields']
                vertex_style = _style(vertex, layers)
                if any(_float(vf, code) != 0 for code in (40, 41, 42, 50)):
                    raise GeometryError('DXF fitted/bulged/widened polyface vertices are unsupported.')
                vflags = _int(vf, 70)
                if vflags == 192:
                    if any(_int(vf, code) for code in (71, 72, 73, 74)):
                        raise GeometryError('DXF coordinate vertex cannot also define a face.')
                    mapped = builder.vertex(_point(vf), source_id, len(local_vertices))
                    local_vertices.append(mapped)
                    builder.sources[mapped[1]]['style'] = vertex_style
                elif vflags == 128:
                    for code in (10, 20, 30):
                        _float(vf, code)  # Dummy coordinates never become model vertices.
                    face_records.append((vf, vertex_style, i))
                else:
                    raise GeometryError('DXF polyface VERTEX flags must be 192 for coordinates or 128 for faces.')
                i += 1
            if i >= len(records) or records[i]['type'] != 'SEQEND':
                raise GeometryError('DXF polyface mesh requires a terminating SEQEND.')
            if not local_vertices or not face_records:
                raise GeometryError('DXF polyface mesh requires coordinate vertices and faces.')
            info.update(declaredCounts={'vertices': declared[0], 'faces': declared[1]},
                        actualCounts={'vertices': len(local_vertices), 'faces': len(face_records)}, modelFaces=[])
            if declared != [len(local_vertices), len(face_records)]:
                warnings.append(f'Polyface entity {source_id} advisory counts {declared} differ from actual [{len(local_vertices)}, {len(face_records)}].')
            for vf, style, record_index in face_records:
                signed = [_int(vf, code) for code in (71, 72, 73, 74)]
                end = next((k for k, value in enumerate(signed) if value == 0), 4)
                if end < 3 or any(signed[end:]):
                    raise GeometryError('DXF polyface needs 3–4 contiguous nonzero face indices.')
                signed = signed[:end]
                if any(not 1 <= abs(value) <= len(local_vertices) for value in signed):
                    raise GeometryError('DXF polyface index is outside its local coordinate-vertex table.')
                mapped = [local_vertices[abs(value)-1] for value in signed]
                vertices = [v for v, source in mapped]
                hidden = [(vertices[k], vertices[(k+1) % len(vertices)]) for k, value in enumerate(signed) if value < 0]
                face = builder.face(vertices, source_id, hidden, [s for v, s in mapped])
                builder.face_sources[face].update(style=style, signedIndices=signed, record=record_index)
                info['modelFaces'].append(face)
        i += 1
    if not builder.vertices:
        raise GeometryError('DXF contains no supported source geometry.')
    points = np.asarray(builder.vertices)
    scale = max(float(np.max(np.ptp(points, axis=0))), np.finfo(float).tiny)
    affine_dimension = rank((points - points.mean(axis=0)) / scale)
    metadata = {'format': 'ASCII-DXF', 'source': name, 'dxf': {
        'schemaVersion': 1, **header, 'affineDimension': affine_dimension,
        'layers': layers, 'entities': entities, 'faces': builder.face_sources,
        'edgeSources': builder.edge_sources, 'sourceVertexMap': builder.sources,
        'welding': {'tolerance': tolerance, 'units': 'supplied coordinates',
                    'method': 'first retained vertex within absolute Euclidean tolerance; no averaging',
                    'sourceVertices': len(builder.sources), 'retainedVertices': len(builder.vertices)},
        'warnings': warnings, 'entityCounts': dict(Counter(info['type'] for info in entities)),
        'ignoredNonGeometrySections': [key for key in ('CLASSES', 'OBJECTS') if key in sections]}}
    model = {'id': str(uuid.uuid4()), 'name': name, 'dimension': 3, 'embeddingDimension': 3,
             'interpretation': 'generalized-complex', 'vertices': builder.vertices,
             'edges': builder.edges, 'faces': builder.faces, 'cells': [], 'metadata': metadata,
             'numeric': {'mode': 'float64-approximate', 'tolerance': TOLERANCE, 'certified': False,
                         'inputInterpretation': 'Supplied DXF WCS decimal coordinates rounded to float64; no solid inferred'},
             'provenance': {'operation': 'import-dxf', 'algorithmVersion': '0.1.0',
                            'sourceSha256': hashlib.sha256(text.encode('utf-8')).hexdigest(),
                            'parameters': {'weldTolerance': tolerance}}}
    model['validation'] = validate(model)
    if not model['validation']['passed']:
        raise GeometryError('Invalid DXF incidence: ' + '; '.join(model['validation']['errors']))
    model['validation']['warnings'].extend(warnings)
    model['fingerprint'] = identity(model)
    return model
