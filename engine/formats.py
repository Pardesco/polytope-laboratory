from pathlib import Path
from copy import deepcopy
from collections import Counter
import json
import os
import tempfile
import uuid
import math
import hashlib
import re
import numpy as np
from .geometry import GeometryError, hull, validate, identity, MAX_VERTICES, canonical_cycle, intrinsic_measures, rank

MAX_FILE_BYTES = 128 * 1024 * 1024


def _off_color(tokens):
    """Use integer byte channels or explicitly decimal unit channels.

    The declared boundary size is authoritative: color suffixes are never
    consumed as incidence. One/two channels and arbitrary attributes fail.
    """
    if len(tokens) not in (3, 4):
        raise GeometryError('OFF boundary color must have exactly RGB or RGBA channels.')
    byte = all(re.fullmatch(r'[+-]?\d+', token) for token in tokens)
    values = [int(token) if byte else float(token) for token in tokens]
    maximum = 255 if byte else 1
    if any(not math.isfinite(value) or not 0 <= value <= maximum for value in values):
        raise GeometryError('OFF boundary color channels must be finite bytes in 0–255 or decimal values in 0–1.')
    return {'encoding': 'byte' if byte else 'unit', 'values': values}


def _off_boundaries(records, count):
    boundaries, colors = [], []
    for record in records:
        tokens = record.split()
        size = int(tokens[0]) if tokens else 0
        if size < 3 or len(tokens) < size + 1:
            raise GeometryError('Invalid boundary size or out-of-range element ID.')
        indices = [int(token) for token in tokens[1:size + 1]]
        if any(not 0 <= index < count for index in indices):
            raise GeometryError('Invalid boundary size or out-of-range element ID.')
        boundaries.append(indices)
        colors.append(_off_color(tokens[size + 1:]) if len(tokens) > size + 1 else None)
    return boundaries, colors


def parse_off(text, name='Imported OFF'):
    if len(text.encode('utf-8')) > MAX_FILE_BYTES:
        raise GeometryError('OFF import exceeds the 128 MiB resource limit.')
    lines = [s.split('#', 1)[0].strip() for s in text.splitlines()]
    lines = [s for s in lines if s]
    if not lines or lines[0] not in ('OFF', '4OFF'):
        raise GeometryError('Expected an OFF or 4OFF marker on the first non-comment line.')
    d = 4 if lines[0] == '4OFF' else 3
    try:
        counts = [int(x) for x in lines[1].split()]
        if len(counts) != (4 if d == 4 else 3):
            raise GeometryError('Invalid count header. 4OFF uses V F E C; OFF uses V F E.')
        nv, nf, ne = counts[:3]
        nc = counts[3] if d == 4 else 0
        if not 1 <= nv <= MAX_VERTICES or min(nf, ne, nc) < 0 or max(nf, ne, nc) > 1000000:
            raise GeometryError('Element counts exceed import resource limits.')
        if len(lines) != 2 + nv + nf + nc:
            raise GeometryError('Truncated file or unexpected trailing records.')
        vertices = [[float(x) for x in line.split()] for line in lines[2:2+nv]]
        if any(len(v) != d or not all(math.isfinite(x) for x in v) for v in vertices):
            raise GeometryError(f'Every vertex must have exactly {d} finite coordinates. Color attributes are not supported.')
        faces, face_colors = _off_boundaries(lines[2+nv:2+nv+nf], nv)
        cells, cell_colors = _off_boundaries(lines[2+nv+nf:], nf)
        edges = sorted({tuple(sorted((a,b))) for f in faces for a,b in zip(f, f[1:]+f[:1])})
        if ne and ne != len(edges):
            raise GeometryError(f'Declared edge count {ne} differs from boundary-derived count {len(edges)}.')
        model = {'id': str(uuid.uuid4()), 'name': name, 'dimension': d, 'embeddingDimension': d,
                 'vertices': vertices, 'edges': [list(e) for e in edges], 'faces': faces, 'cells': cells,
                 'interpretation': 'generalized-complex', 'metadata': {'source': name, 'format': lines[0]},
                 'numeric': {'mode': 'float64-approximate', 'tolerance': 1e-8, 'certified': False,
                             'inputInterpretation': 'Supplied decimal coordinates rounded to float64; intended algebraic values are unknown'},
                 'provenance': {'operation': 'import-off', 'algorithmVersion': '0.1.0'}}
        if any(color is not None for color in face_colors + cell_colors):
            model['metadata']['offColors'] = {'faces': face_colors, 'cells': cell_colors}
        report = validate(model)
        if not report['passed']:
            diagnostic = '; '.join(report['errors'])
            if any('not affine dimension 3' in error for error in report['errors']):
                points = np.asarray(vertices)
                normalized = (points - points.mean(axis=0)) / max(float(np.max(np.ptp(points, axis=0))), np.finfo(float).tiny)
                for error in report['errors']:
                    match = re.fullmatch(r'Cell (\d+) is not affine dimension 3\.', error)
                    if match:
                        index = int(match.group(1))
                        ids = sorted({vertex for face in cells[index] for vertex in faces[face]})
                        diagnostic += f' Cell {index} actually spans affine dimension {rank(normalized[ids])} (expected 3).'
                diagnostic += ' Changing the declared edge count cannot repair a cell-dimension mismatch.'
            raise GeometryError('Invalid OFF incidence: ' + diagnostic)
        # Recognize convexity only when complete supplied incidence equals the hull.
        try:
            reference = hull(vertices)
            same = len(reference['vertices']) == len(vertices) and Counter(canonical_cycle(f) for f in reference['faces']) == Counter(canonical_cycle(f) for f in faces)
            if d == 4:
                source_cells = Counter(frozenset(canonical_cycle(faces[f]) for f in c) for c in cells)
                hull_cells = Counter(frozenset(canonical_cycle(reference['faces'][f]) for f in c) for c in reference['cells'])
                same = same and source_cells == hull_cells
            if same:
                model['interpretation'] = 'convex-polytope'
                model['facetVertices'] = reference['facetVertices']
                model['facetEquations'] = reference['facetEquations']
                model['measure'] = reference['measure']
        except GeometryError:
            pass
        model['validation'] = validate(model)
        model['fingerprint'] = identity(model)
        return model
    except (IndexError, ValueError) as exc:
        if isinstance(exc, GeometryError):
            raise
        raise GeometryError('Malformed OFF numeric or incidence record: ' + str(exc)) from exc


def export_off(model):
    d = model['dimension']
    if d not in (3, 4):
        raise GeometryError('OFF export requires a 3D or 4D model.')
    header = '4OFF' if d == 4 else 'OFF'
    counts = [len(model['vertices']), len(model['faces']), len(model['edges'])]
    if d == 4:
        counts.append(len(model['cells']))
    lines = [header, ' '.join(map(str, counts)), '# Coordinates: x y z' + (' w' if d == 4 else '')]
    lines += [' '.join(format(x, '.17g') for x in p) for p in model['vertices']]
    def records(boundaries, key):
        colors = model.get('metadata', {}).get('offColors', {}).get(key)
        if colors is not None and (not isinstance(colors, list) or len(colors) != len(boundaries)):
            raise GeometryError('OFF color metadata does not match the boundary count.')
        for index, boundary in enumerate(boundaries):
            row = str(len(boundary)) + ' ' + ' '.join(map(str, boundary))
            color = colors[index] if colors is not None else None
            if color is not None:
                if not isinstance(color, dict) or color.get('encoding') not in ('byte', 'unit'):
                    raise GeometryError('Invalid OFF color metadata encoding.')
                values = color.get('values')
                if not isinstance(values, list) or len(values) not in (3, 4):
                    raise GeometryError('OFF boundary color must have exactly RGB or RGBA channels.')
                if any(isinstance(value, bool) or not isinstance(value, (int, float)) for value in values):
                    raise GeometryError('OFF color metadata must contain numeric channels.')
                if color['encoding'] == 'byte':
                    if any(type(value) is not int for value in values):
                        raise GeometryError('OFF byte color channels must be integers.')
                    tokens = [str(value) for value in values]
                else:
                    tokens = [repr(float(value)) for value in values]
                _off_color(tokens)
                row += ' ' + ' '.join(tokens)
            yield row
    lines += list(records(model['faces'], 'faces'))
    if d == 4:
        lines += list(records(model['cells'], 'cells'))
    return '\n'.join(lines) + '\n'


def repair_off_edge_count(text, name='Repaired OFF copy'):
    """Produce a validated copy changing only the edge count header token.

    Coordinates, incidence, comments and colors retain their original spelling.
    This explicit API never writes and never weakens strict parse_off checks.
    """
    if len(text.encode('utf-8')) > MAX_FILE_BYTES:
        raise GeometryError('OFF import exceeds the 128 MiB resource limit.')
    lines = text.splitlines(keepends=True)
    indices = [i for i, line in enumerate(lines) if line.split('#', 1)[0].strip()]
    try:
        marker = lines[indices[0]].split('#', 1)[0].strip()
        if marker not in ('OFF', '4OFF'):
            raise GeometryError('Expected an OFF or 4OFF marker.')
        line_index = indices[1]
        header, separator, comment = lines[line_index].partition('#')
        matches = list(re.finditer(r'\S+', header))
        counts = [int(match.group()) for match in matches]
        if len(counts) != (4 if marker == '4OFF' else 3):
            raise GeometryError('Invalid OFF count header.')
        if not 0 <= counts[2] <= 1000000:
            raise GeometryError('Declared edge count is outside the importer resource limits.')
        # A zero edge count is an unspecified header value allowed by OFF.
        # Use it only on a temporary string to validate all other input first.
        token = matches[2]
        unchecked = lines.copy()
        unchecked[line_index] = header[:token.start()] + '0' + header[token.end():] + separator + comment
        model = parse_off(''.join(unchecked), name)
        actual = len(model['edges'])
        declared = counts[2]
        if declared == actual or declared == 0:
            raise GeometryError('No declared edge-count mismatch to repair.')
        lines[line_index] = header[:token.start()] + str(actual) + header[token.end():] + separator + comment
        corrected = ''.join(lines)
        model = parse_off(corrected, name)
        correction = {'kind': 'declared-edge-count', 'declaredEdges': declared, 'derivedEdges': actual,
                      'sourceSha256': hashlib.sha256(text.encode('utf-8')).hexdigest(),
                      'correctedSha256': hashlib.sha256(corrected.encode('utf-8')).hexdigest(),
                      'sourceModified': False}
        model['metadata']['offRepair'] = correction
        return {'text': corrected, 'model': model, 'correction': correction}
    except (IndexError, ValueError) as exc:
        if isinstance(exc, GeometryError):
            raise
        raise GeometryError('Malformed OFF numeric or incidence record: ' + str(exc)) from exc


def export_model(model, format_name):
    if not validate(model)['passed']:
        raise GeometryError('Cannot export invalid incidence.')
    if format_name == 'off':
        return export_off(model)
    if format_name == 'json':
        return json.dumps(model, ensure_ascii=False, indent=2, allow_nan=False)
    if model['dimension'] not in (2, 3):
        raise GeometryError(f'{format_name.upper()} export requires an intrinsic 2D/3D model. Promote a 4D section or cell first; projection would be lossy.')
    p = [list(v) + ([0] if len(v) == 2 else []) for v in model['vertices']]
    if format_name == 'obj':
        return '# Intrinsic geometry; model units\n' + '\n'.join('v ' + ' '.join(format(x, '.17g') for x in v) for v in p) + '\n' + '\n'.join('f ' + ' '.join(str(v+1) for v in f) for f in model['faces']) + '\n'
    if format_name == 'vrml':
        return '#VRML V2.0 utf8\nShape { geometry IndexedFaceSet { solid FALSE coord Coordinate { point [\n' + ',\n'.join(' '.join(map(str,v)) for v in p) + '\n] } coordIndex [\n' + ',\n'.join(', '.join(map(str,f)) + ', -1' for f in model['faces']) + '\n] } }\n'
    if format_name == 'dxf':
        units = model.get('metadata', {}).get('coordinateUnits', 'model')
        codes = {'model':0,'in':1,'ft':2,'mm':4,'cm':5,'m':6}
        if units not in codes: raise GeometryError('DXF output coordinate units are unsupported.')
        lines = ['0','SECTION','2','HEADER','9','$INSUNITS','70',str(codes[units]),'0','ENDSEC',
                 '0', 'SECTION', '2', 'ENTITIES']
        for a,b in model['edges']:
            lines += ['0', 'LINE', '8', '0']
            for code,v in ((10,p[a]),(11,p[b])):
                for axis,x in enumerate(v):
                    lines += [str(code + 10*axis), format(x,'.17g')]
        return '\n'.join(lines + ['0','ENDSEC','0','EOF']) + '\n'
    if format_name in ('stl', 'pov'):
        if model.get('interpretation') != 'convex-polytope' or model['dimension'] != 3:
            raise GeometryError('Triangulated solid export currently supports convex 3D boundaries only.')
        # Orient facets independently of imported cycle orientation.
        center = np.mean(p,axis=0)
        triangles = []
        for f in model['faces']:
            for i in range(1,len(f)-1):
                a,b,c = np.asarray([p[j] for j in (f[0],f[i],f[i+1])])
                normal = np.cross(b-a,c-a)
                if np.dot(normal,(a+b+c)/3-center) < 0:
                    b,c = c,b; normal = -normal
                normal /= np.linalg.norm(normal)
                triangles.append((normal,a,b,c))
        if format_name == 'pov':
            vector = lambda v: '<' + ','.join(map(str,v)) + '>'
            return 'mesh {\n' + '\n'.join('triangle { ' + ', '.join(vector(v) for v in t[1:]) + ' }' for t in triangles) + '\npigment { color rgb <0.2,0.7,0.8> }\n}\n'
        lines = ['solid polytope']
        for n,a,b,c in triangles:
            lines += ['facet normal ' + ' '.join(map(str,n)), 'outer loop']
            lines += ['vertex ' + ' '.join(map(str,v)) for v in (a,b,c)]
            lines += ['endloop','endfacet']
        return '\n'.join(lines + ['endsolid polytope']) + '\n'
    raise GeometryError('Unknown export format: ' + format_name)


def validate_project(project):
    from .history import _json_bytes
    _json_bytes(project, MAX_FILE_BYTES)
    if not isinstance(project, dict) or project.get('format') != 'polytope-laboratory' or project.get('version') != 1:
        raise GeometryError('Unsupported project format/version. Original file remains unchanged.')
    documents = project.get('documents')
    if not isinstance(documents, list) or not 1 <= len(documents) <= 100:
        raise GeometryError('Project must contain 1–100 documents.')
    from .model_memories import memory_documents
    from .tours import tour_documents
    for doc in documents + memory_documents(project.get('memories')) + tour_documents(project.get('tour')):
        if not isinstance(doc,dict) or not isinstance(doc.get('states'),list) or not 1 <= len(doc['states']) <= 200:
            raise GeometryError('Invalid document history.')
        if type(doc.get('cursor')) is not int or not 0 <= doc['cursor'] < len(doc['states']):
            raise GeometryError('Invalid history cursor.')
        for state in doc['states']:
            if isinstance(state, dict) and 'view' not in state:
                # Original v1 snapshots could omit presentation entirely.
                state['view'] = {}
            if not isinstance(state, dict) or not isinstance(state.get('view'), dict):
                raise GeometryError('Every project state requires geometry and a display-state record.')
            report = validate(state.get('model',{}))
            if not report['passed']:
                raise GeometryError('Project contains invalid geometry: ' + '; '.join(report['errors']))
            state['model']['fingerprint']=identity(state['model'])
            from .display_state import validate_view
            validate_view(state['model'], state['view'])
            recomputed=intrinsic_measures(state['model'])
            if recomputed is None:state['model'].pop('measure',None)
            else:state['model']['measure']=recomputed
            if state.get('netLayout'):
                from .nets import reconstruct_net,net_svg
                # Layout parameters are authoritative; regenerate cached math,
                # fold descriptors and SVG rather than trusting saved buffers.
                net=reconstruct_net(state['model'],state['netLayout'])
                net['svg']=net_svg(net);state['netLayout']=net
                if state.get('netPages'):
                    from .net_printing import pack_net
                    state['netPages']=pack_net(net,**state['netPages']['parameters'])
            if state.get('cellNetLayout'):
                from .cell_nets import reconstruct_cell_net
                state['cellNetLayout']=reconstruct_cell_net(state['model'],state['cellNetLayout'])
            exact=state['model']
            if exact.get('numeric',{}).get('mode')=='rational-exact':
                from .rational import rational_hull
                source=exact.get('certificate',{}).get('sourceCoordinates')
                if not source:
                    raise GeometryError('Exact model is missing its original certificate inputs.')
                rechecked=rational_hull(source)
                if identity(rechecked)!=identity(exact):
                    raise GeometryError('Exact model differs from its independently recomputed input certificate.')
        if any(doc is original for original in documents):
            from .history import validate_document_history
            validate_document_history(doc)
    if type(project.get('active')) is not int or not 0 <= project['active'] < len(documents):
        raise GeometryError('Invalid active document index.')
    return project


def atomic_write(path, text):
    path = Path(path)
    path.parent.mkdir(parents=True,exist_ok=True)
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(mode='w',encoding='utf-8',dir=path.parent,prefix='.'+path.name+'.',suffix='.tmp',delete=False,newline='\n') as out:
            temp_path = out.name
            out.write(text); out.flush(); os.fsync(out.fileno())
        os.replace(temp_path,path)
    finally:
        if temp_path and os.path.exists(temp_path):
            os.unlink(temp_path)


def save_project(path, project):
    validate_project(project)
    atomic_write(path,json.dumps(project,ensure_ascii=False,allow_nan=False,separators=(',',':')))
    return {'path': str(path)}


def load_file(path):
    path = Path(path)
    if path.stat().st_size > MAX_FILE_BYTES:
        raise GeometryError('File exceeds the 128 MiB resource limit.')
    text = path.read_text(encoding='utf-8-sig')
    if path.suffix.lower() == '.off':
        result = parse_off(text,path.stem)
        result['metadata']['sourcePath'] = str(path)
        return {'model': result}
    if path.suffix.lower() == '.dxf':
        from .dxf import parse_dxf
        result = parse_dxf(text, path.stem)
        result['metadata']['sourcePath'] = str(path)
        result['provenance']['sourceFileSha256'] = hashlib.sha256(path.read_bytes()).hexdigest()
        return {'model': result}
    data = json.loads(text)
    if isinstance(data, dict) and data.get('format') == 'polytope-laboratory':
        return {'project': validate_project(data)}
    if path.suffix.lower() == '.json' and isinstance(data, dict) and 'vertices' in data:
        checked = validate_project({'format':'polytope-laboratory','version':1,
            'active':0,'documents':[{'cursor':0,'states':[{'model':data,'view':{}}]}]})
        result = checked['documents'][0]['states'][0]['model']
        result.setdefault('metadata', {})['sourcePath'] = str(path)
        result.setdefault('provenance', {})['sourceFileSha256'] = hashlib.sha256(path.read_bytes()).hexdigest()
        return {'model': result}
    raise GeometryError('JSON must contain a supported project or complete geometry model.')
