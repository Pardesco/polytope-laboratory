"""Ordered products of disjoint intrinsic polygon cycles, without convexification.

Disconnected leaves have an explicit current-incidence partition. It is not the
historical binary compound schema: component Keep/Delete is intentionally absent.
"""
from collections import Counter
from copy import deepcopy
import hashlib
import json
import math
import uuid

import numpy as np

from .compounds import (_check_source, _colors, _payload_size, KINDS,
                        MAX_COMPONENTS, MAX_COORDINATE, MAX_ELEMENTS,
                        MAX_FACE_VERTICES, MAX_INCIDENCES, MAX_PAYLOAD_BYTES)
from .geometry import GeometryError, TOLERANCE, identity, validate

VERSION = '0.1.0'
MAX_PRODUCT_VERTICES = 4000


def _polygon(source):
    dimension, embedding, _, components = _check_source(source)
    if dimension != 2 or embedding != 2 or source.get('cells'):
        raise GeometryError('Ordered products require intrinsic 2D polygon sources with embedding dimension 2 and no cells.')
    if not source['faces']:
        raise GeometryError('Ordered polygon sources require at least one boundary cycle.')
    edge_ids = {tuple(sorted(edge)): i for i, edge in enumerate(source['edges'])}
    vertex_owner, edge_owner, ordered_edges = {}, {}, []
    for face_id, face in enumerate(source['faces']):
        for vertex in face:
            if vertex in vertex_owner:
                raise GeometryError('Polygon cycles must be vertex-disjoint; shared vertices and filled subdivisions are outside this product domain.')
            vertex_owner[vertex] = face_id
        boundary = []
        for a, b in zip(face, face[1:] + face[:1]):
            edge_id = edge_ids[tuple(sorted((a, b)))]
            if edge_id in edge_owner:
                raise GeometryError('Each polygon edge must belong to exactly one source cycle.')
            edge_owner[edge_id] = face_id
            boundary.append((edge_id, a, b))
        ordered_edges.append(boundary)
    if len(vertex_owner) != len(source['vertices']) or len(edge_owner) != len(source['edges']):
        raise GeometryError('Isolated points, wire edges and unused incidence are outside the ordered polygon product domain.')
    if len(source['faces']) > MAX_COMPONENTS:
        raise GeometryError('Polygon cycle component resource limit exceeded.')
    # Coordinate equality does not weld distinct incidence components. Within an
    # edge it is a numeric degeneracy, even if its other vertices span a plane.
    for a, b in source['edges']:
        if source['vertices'][a] == source['vertices'][b]:
            raise GeometryError('A source edge has coincident coordinates; numeric degeneracy is unsupported.')
    declared_owner = {face: component.get('id') for component in components for face in component['maps']['faces']}
    return ordered_edges, [declared_owner[i] for i in range(len(source['faces']))]


def _budget(vertices, edges, face_arities, cell_arities, components, dimension):
    if vertices > MAX_PRODUCT_VERTICES:
        raise GeometryError(f'Ordered product vertex resource limit is {MAX_PRODUCT_VERTICES}.')
    if max(edges, len(face_arities), len(cell_arities)) > MAX_ELEMENTS:
        raise GeometryError('Ordered product incidence element resource limit exceeded.')
    if components > MAX_COMPONENTS:
        raise GeometryError('Ordered product component resource limit exceeded.')
    if max(face_arities, default=0) > MAX_FACE_VERTICES:
        raise GeometryError('Ordered product face boundary resource limit exceeded.')
    if dimension * vertices + 2 * edges + sum(face_arities) + sum(cell_arities) > MAX_INCIDENCES:
        raise GeometryError('Ordered product aggregate incidence resource limit exceeded.')


def _snapshot(source):
    # Native project JSON can change 1.0 to 1 and -0.0 to 0. Complete snapshot
    # evidence uses the same number equivalence as the existing history hash.
    def numbers(value):
        if type(value) is dict:
            return {key: numbers(item) for key, item in value.items()}
        if type(value) is list:
            return [numbers(item) for item in value]
        if type(value) is float and value.is_integer():
            return int(value)
        return value
    try:
        serialized = json.dumps(numbers(source), allow_nan=False, sort_keys=True, separators=(',', ':')).encode('utf-8')
    except (ValueError, TypeError, OverflowError, RecursionError, UnicodeEncodeError) as exc:
        raise GeometryError('Ordered product source snapshot must be finite, bounded JSON data.') from exc
    return {'sourceModelId': source.get('id'), 'sourceFingerprint': identity(source),
            'sourceSnapshotSha256': hashlib.sha256(serialized).hexdigest()}


def _model(dimension, name, sources, operation, parameters):
    return {'id': str(uuid.uuid4()), 'name': name, 'dimension': dimension, 'embeddingDimension': dimension,
            'interpretation': 'generalized-complex', 'vertices': [], 'edges': [], 'faces': [], 'cells': [],
            'metadata': {'orderedProduct': {'schemaVersion': 1, 'algorithmVersion': VERSION,
                'operation': operation, 'inputs': [_snapshot(source) for source in sources],
                'sourceModels': deepcopy(sources), 'maps': {kind: [] for kind in KINDS},
                'sourceMaps': [{kind: [[] for _ in source.get(kind, [])] for kind in KINDS} for source in sources],
                'componentPartitions': [], 'recoverableCompoundComponents': False,
                'componentDefinition': 'metadata-only disjoint current-incidence partition; IDs are not compound Keep/Delete IDs',
                'colorPolicy': 'Source polygon colors are copied to corresponding caps; product walls and cells are uncolored.',
                'interpretation': 'Literal boundary incidence product; crossings create no vertices; no filled region, hull, weld or union volume inferred.'}},
            'numeric': {'mode': 'float64-approximate', 'certified': False, 'tolerance': TOLERANCE,
                        'algorithm': 'direct ordered cycle and interval incidence product'},
            'provenance': {'operation': operation, 'algorithmVersion': VERSION,
                           'parameters': deepcopy(parameters), 'inputs': [_snapshot(source) for source in sources]}}


def _append(result, kind, value, role, references, interval_endpoint=None):
    index = len(result[kind])
    result[kind].append(value)
    info = result['metadata']['orderedProduct']
    info['maps'][kind].append({'role': role, 'factors': deepcopy(references)})
    if interval_endpoint is not None:
        info['maps'][kind][-1]['intervalEndpoint'] = interval_endpoint
    for source_index, source_kind, source_id in references:
        if source_kind == kind:
            info['sourceMaps'][source_index][kind][source_id].append(index)
    return index


def _partition(result, face_ids, input_component_ids, maps):
    result['metadata']['orderedProduct']['componentPartitions'].append({
        'id': f'partition-{len(result["metadata"]["orderedProduct"]["componentPartitions"])}',
        'sourceFaceIds': list(face_ids), 'sourceComponentIds': list(input_component_ids),
        'maps': {kind: sorted(maps[kind]) for kind in KINDS}})


def _finish(result, colors):
    info = result['metadata']['orderedProduct']
    ownership = {kind: Counter(i for part in info['componentPartitions'] for i in part['maps'][kind]) for kind in KINDS}
    if any(set(table) != set(range(len(result[kind]))) or any(n != 1 for n in table.values()) for kind, table in ownership.items()):
        raise GeometryError('Internal ordered product partition does not cover all incidence exactly once.')
    for part in info['componentPartitions']:
        vertices, faces = set(part['maps']['vertices']), set(part['maps']['faces'])
        if any(not set(result[kind][i]) <= (faces if kind == 'cells' else vertices)
               for kind in ('edges', 'faces', 'cells') for i in part['maps'][kind]):
            raise GeometryError('Internal ordered product incidence crosses component boundaries.')
    if any(color is not None for color in colors):
        result['metadata']['offColors'] = {'faces': colors, 'cells': [None] * len(result['cells'])}
    p = np.asarray(result['vertices'], dtype=float)
    scale = float(np.max(np.ptp(p, axis=0)))
    normalized = (p - p[0]) / scale if scale else p - p[0]
    if not scale or np.linalg.matrix_rank(normalized, TOLERANCE) != result['dimension']:
        raise GeometryError('Product numeric degeneracy: coordinates do not resolve the full intrinsic dimension at float64 tolerance.')
    report = validate(result)
    if not report['passed']:
        raise GeometryError('Ordered product numeric/incidence validation failed: ' + '; '.join(report['errors']))
    edge_counts = Counter(tuple(sorted((a, b))) for face in result['faces'] for a, b in zip(face, face[1:] + face[:1]))
    if result['dimension'] == 3 and (set(edge_counts) != {tuple(sorted(e)) for e in result['edges']} or any(n != 2 for n in edge_counts.values())):
        raise GeometryError('Prism edge links must have exactly two source face incidences.')
    if result['dimension'] == 4:
        face_counts = Counter(f for cell in result['cells'] for f in cell)
        if set(face_counts) != set(range(len(result['faces']))) or any(n != 2 for n in face_counts.values()):
            raise GeometryError('Polygon product ridges must have exactly two source cells.')
        for cell in result['cells']:
            links = Counter(tuple(sorted((a, b))) for f in cell for a, b in zip(result['faces'][f], result['faces'][f][1:] + result['faces'][f][:1]))
            if any(n != 2 for n in links.values()):
                raise GeometryError('Polygon product cell edge links must have exactly two faces.')
    result['validation'], result['fingerprint'] = report, identity(result)
    info['resultSourceModelId'], info['resultSourceFingerprint'] = result['id'], result['fingerprint']
    info['evidenceScope'] = 'generated source only; output IDs and partitions apply while current geometry matches resultSourceFingerprint'
    if _payload_size(result) > MAX_PAYLOAD_BYTES:
        raise GeometryError('Ordered product payload resource limit exceeded, including full preserved sources and maps.')
    return result


def polygon_prism(source, height=1.0):
    """Lift disjoint intrinsic 2D polygon cycles into a literal 3D prism."""
    boundaries, components = _polygon(source)
    if type(height) not in (int, float) or not 0 < height <= MAX_COORDINATE or not math.isfinite(height):
        raise GeometryError('Prism height must be finite, positive and at most 1e100.')
    height = float(height)
    v, e, f = (len(source[kind]) for kind in ('vertices', 'edges', 'faces'))
    if 2*v > MAX_PRODUCT_VERTICES:
        raise GeometryError(f'Ordered product vertex resource limit is {MAX_PRODUCT_VERTICES}.')
    _budget(2*v, 2*e+v, [len(face) for face in source['faces']]*2+[4]*e, [], f, 3)
    result = _model(3, source.get('name', 'Polygon')+' × interval', [source], 'ordered-polygon-prism', {'height': height})
    result['metadata']['orderedProduct']['interval'] = {'height': height, 'endCoordinates': [-height/2, height/2]}
    colors, source_colors = [], _colors(source, 'faces')
    for layer in range(2):
        for i, point in enumerate(source['vertices']):
            _append(result, 'vertices', list(point)+[(layer-.5)*height], 'vertex×interval-end', [[0, 'vertices', i]], interval_endpoint=layer)
        for i, edge in enumerate(source['edges']):
            _append(result, 'edges', [x+layer*v for x in edge], 'edge×interval-end', [[0, 'edges', i]], interval_endpoint=layer)
        for i, face in enumerate(source['faces']):
            _append(result, 'faces', [x+layer*v for x in (list(reversed(face)) if layer == 0 else face)], 'face×interval-end', [[0, 'faces', i]], interval_endpoint=layer)
            colors.append(deepcopy(source_colors[i]))
    for i in range(v):
        _append(result, 'edges', [i, i+v], 'vertex×interval', [[0, 'vertices', i]])
    side_ids = {}
    for face_id, boundary in enumerate(boundaries):
        for edge_id, a, b in boundary:
            side_ids[edge_id] = _append(result, 'faces', [a, b, b+v, a+v], 'edge×interval', [[0, 'edges', edge_id]])
            colors.append(None)
        vertices = set(source['faces'][face_id]); edges = {item[0] for item in boundary}
        _partition(result, [face_id], [components[face_id]], {
            'vertices': {x+layer*v for x in vertices for layer in (0, 1)},
            'edges': {x+layer*e for x in edges for layer in (0, 1)} | {2*e+x for x in vertices},
            'faces': {face_id, face_id+f} | {side_ids[x] for x in edges}, 'cells': set()})
    return _finish(result, colors)


def polygon_product(left, right):
    """Construct the ordered intrinsic 4D product of two disjoint cycle models."""
    left_boundary, left_components = _polygon(left)
    right_boundary, right_components = _polygon(right)
    va, ea, fa = (len(left[kind]) for kind in ('vertices', 'edges', 'faces'))
    vb, eb, fb = (len(right[kind]) for kind in ('vertices', 'edges', 'faces'))
    if va*vb > MAX_PRODUCT_VERTICES:
        raise GeometryError(f'Ordered product vertex resource limit is {MAX_PRODUCT_VERTICES}.')
    _budget(va*vb, ea*vb+va*eb,
            [len(face) for face in left['faces'] for _ in range(vb)]+[len(face) for _ in range(va) for face in right['faces']]+[4]*(ea*eb),
            [2+len(face) for face in left['faces'] for _ in range(eb)]+[2+len(face) for _ in range(ea) for face in right['faces']], fa*fb, 4)
    result = _model(4, left.get('name', 'A')+' × '+right.get('name', 'B'), [left, right], 'ordered-polygon-product', {})
    colors, left_colors, right_colors = [], _colors(left, 'faces'), _colors(right, 'faces')
    p = lambda a, b: a*vb+b
    for a, point_a in enumerate(left['vertices']):
        for b, point_b in enumerate(right['vertices']):
            _append(result, 'vertices', list(point_a)+list(point_b), 'vertex×vertex', [[0, 'vertices', a], [1, 'vertices', b]])
    ae, be, af, bf, quad, ac, bc = {}, {}, {}, {}, {}, {}, {}
    for edge_a, (a0, a1) in enumerate(left['edges']):
        for b in range(vb):
            ae[edge_a, b] = _append(result, 'edges', [p(a0,b), p(a1,b)], 'edge×vertex', [[0, 'edges', edge_a], [1, 'vertices', b]])
    for a in range(va):
        for edge_b, (b0, b1) in enumerate(right['edges']):
            be[a, edge_b] = _append(result, 'edges', [p(a,b0), p(a,b1)], 'vertex×edge', [[0, 'vertices', a], [1, 'edges', edge_b]])
    for face_a, face in enumerate(left['faces']):
        for b in range(vb):
            af[face_a, b] = _append(result, 'faces', [p(a,b) for a in face], 'face×vertex', [[0, 'faces', face_a], [1, 'vertices', b]])
            colors.append(deepcopy(left_colors[face_a]))
    for a in range(va):
        for face_b, face in enumerate(right['faces']):
            bf[a, face_b] = _append(result, 'faces', [p(a,b) for b in face], 'vertex×face', [[0, 'vertices', a], [1, 'faces', face_b]])
            colors.append(deepcopy(right_colors[face_b]))
    for edge_a, (a0,a1) in enumerate(left['edges']):
        for edge_b, (b0,b1) in enumerate(right['edges']):
            quad[edge_a,edge_b] = _append(result, 'faces', [p(a0,b0),p(a1,b0),p(a1,b1),p(a0,b1)], 'edge×edge', [[0, 'edges', edge_a], [1, 'edges', edge_b]])
            colors.append(None)
    for face_a, boundary in enumerate(left_boundary):
        for edge_b, (b0,b1) in enumerate(right['edges']):
            ac[face_a,edge_b] = _append(result, 'cells', [af[face_a,b0],af[face_a,b1]]+[quad[edge_a,edge_b] for edge_a,_,_ in boundary],
                                      'face×edge', [[0, 'faces', face_a], [1, 'edges', edge_b]])
    for edge_a, (a0,a1) in enumerate(left['edges']):
        for face_b, boundary in enumerate(right_boundary):
            bc[edge_a,face_b] = _append(result, 'cells', [bf[a0,face_b],bf[a1,face_b]]+[quad[edge_a,edge_b] for edge_b,_,_ in boundary],
                                      'edge×face', [[0, 'edges', edge_a], [1, 'faces', face_b]])
    for face_a, cycle_a in enumerate(left['faces']):
        edges_a = {item[0] for item in left_boundary[face_a]}
        for face_b, cycle_b in enumerate(right['faces']):
            edges_b = {item[0] for item in right_boundary[face_b]}
            _partition(result, [face_a, face_b], [left_components[face_a], right_components[face_b]], {
                'vertices': {p(a,b) for a in cycle_a for b in cycle_b},
                'edges': {ae[a,b] for a in edges_a for b in cycle_b} | {be[a,b] for a in cycle_a for b in edges_b},
                'faces': {af[face_a,b] for b in cycle_b} | {bf[a,face_b] for a in cycle_a} | {quad[a,b] for a in edges_a for b in edges_b},
                'cells': {ac[face_a,b] for b in edges_b} | {bc[a,face_b] for a in edges_a}})
    return _finish(result, colors)
