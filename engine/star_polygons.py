"""Literal regular angular vertices and modular step cycles; no convexification."""
from copy import deepcopy
import math
import re
import sys
import uuid

from .compounds import _component_records, _payload_size, add_models, MAX_PAYLOAD_BYTES
from .geometry import GeometryError, TOLERANCE, identity, validate

VERSION = '0.1.0'
MAX_SIDES = 1024
MAX_COORDINATE = 1e100
MAX_SYMBOL_LENGTH = 32


def _pair(n, d):
    if type(n) is not int or not 3 <= n <= MAX_SIDES:
        raise GeometryError(f'Polygon numerator must be an integer between 3 and {MAX_SIDES}.')
    if type(d) is not int or not 0 < abs(d) < n:
        raise GeometryError('Polygon step must be a signed integer with 0 < abs(d) < n.')
    if 2*abs(d) == n:
        raise GeometryError('Half-turn polygons are degenerate digon cycles and are unsupported.')
    return n, d


def parse_polygon_symbol(text):
    """Parse only literal n or n/d, keeping common factors and signed d."""
    if type(text) is not str or len(text) > MAX_SYMBOL_LENGTH:
        raise GeometryError(f'Polygon symbol must be literal text of at most {MAX_SYMBOL_LENGTH} characters.')
    match = re.fullmatch(r'\s*([0-9]+)\s*(?:/\s*([+-]?[0-9]+)\s*)?', text)
    if not match:
        raise GeometryError('Polygon symbol requires a literal positive integer n or n/d; no arithmetic is evaluated.')
    n, d = _pair(int(match[1]), int(match[2]) if match[2] else 1)
    return {'n': n, 'd': d}


def _finish(model):
    report = validate(model)
    if not report['passed']:
        raise GeometryError('Regular polygon incidence failed validation: '+'; '.join(report['errors']))
    model['validation'], model['fingerprint'] = report, identity(model)
    return model


def _base(vertices, faces, n, d, radius, principal):
    edges = [list(edge) for edge in sorted({tuple(sorted((a,b))) for face in faces for a,b in zip(face,face[1:]+face[:1])})]
    model = {'id': str(uuid.uuid4()), 'name': f'Regular polygon {n}/{d}', 'dimension': 2, 'embeddingDimension': 2,
             'interpretation': 'generalized-complex', 'vertices': deepcopy(vertices), 'edges': edges,
             'faces': deepcopy(faces), 'cells': [], 'metadata': {},
             'numeric': {'mode': 'float64-approximate', 'certified': False, 'tolerance': TOLERANCE,
                         'algorithm': 'regular angular positions and exact modular step incidence'},
             'provenance': {'operation': 'regular-star-polygon', 'algorithmVersion': VERSION,
                            'parameters': {'n': n, 'd': d, 'radius': radius},
                            'definition': 'literal unreduced pair, crossings create no vertices; no hull, weld or filled-area inference'}}
    _finish(model)
    area_unit = len(faces[0])*math.sin(2*math.pi*principal/n)/2
    scaled_area = area_unit*radius*radius
    area_status = ('underflow; use unit-radius value and radius separately' if not scaled_area else
                   'subnormal; use unit-radius value and radius separately' if abs(scaled_area)<sys.float_info.min else 'float64-approximate')
    edge_unit = 2*math.sin(math.pi*min(abs(d),n-abs(d))/n)
    edge_length = radius*edge_unit
    model['metadata']['regularStarPolygon'] = {
        'schemaVersion': 1, 'symbol': f'{n}/{d}', 'n': n, 'd': d, 'radius': radius,
        'effectiveStep': d % n, 'principalSignedStep': principal, 'componentCount': len(faces),
        'retrogradeRelativeToInputSign': 2*abs(d)>n, 'originWindingPerCycle': principal//math.gcd(n,abs(d)),
        'angularVertexIds': list(range(len(vertices))), 'orderedCycles': deepcopy(faces),
        'cycleEvidence': [{'faceId': i, 'vertexIds': list(face),
                           'edgeIds': [index for index, edge in enumerate(edges) if edge[0] in face and edge[1] in face],
                           'signedAlgebraicAreaUnitRadius': area_unit,
                           'signedAlgebraicArea': scaled_area if scaled_area else None,
                           'areaStatus': area_status}
                          for i, face in enumerate(faces)],
        'edgeLength': edge_length if edge_length else None, 'edgeLengthUnitRadius': edge_unit,
        'edgeLengthStatus': 'float64-approximate' if edge_length>=sys.float_info.min else 'subnormal or underflow; use unit-radius value and radius separately',
        'sourceModelId': model['id'], 'sourceFingerprint': model['fingerprint'],
        'evidenceScope': 'generated source only; cycle IDs/area evidence apply when current geometry matches sourceFingerprint',
        'areaDefinition': 'signed shoelace integral of each ordered cycle; no nonzero/even-odd/union filled area inferred',
        'windingDefinition': 'integer shortest-angular-turn winding about origin; half-turn edges excluded'}
    return model


def regular_star_polygon(n, d=1, radius=1.0):
    """Generate unreduced n/d as gcd(n,abs(d)) distinct incidence cycles."""
    n, d = _pair(n,d)
    if type(radius) not in (int,float) or not 0 < radius <= MAX_COORDINATE or not math.isfinite(radius):
        raise GeometryError('Polygon radius must be finite, positive and at most 1e100.')
    radius = float(radius)
    units = [[math.cos(2*math.pi*i/n),math.sin(2*math.pi*i/n)] for i in range(n)]
    vertices = [[radius*x,radius*y] for x,y in units]
    if len(set(map(tuple,vertices))) != n or max(abs(value/radius-unit) for row,expected in zip(vertices,units) for value,unit in zip(row,expected)) > TOLERANCE:
        raise GeometryError('Regular angular coordinates are unresolved at float64 precision; increase radius.')
    effective, principal = d % n, d % n
    if 2*principal > n:
        principal -= n
    faces, visited = [], set()
    for seed in range(n):
        if seed in visited:
            continue
        face, current = [], seed
        while current not in visited:
            face.append(current);visited.add(current);current=(current+effective)%n
        faces.append(face)
    if len(faces) == 1:
        return _base(vertices,faces,n,d,radius,principal)
    # Leaf snapshots use literal global coordinates and compact local incidence.
    # Balanced Add trees give every leaf a supported binary historical path.
    leaves = []
    common = math.gcd(n,abs(d))
    for index, face in enumerate(faces):
        source_vertices = sorted(face)
        local = {v:i for i,v in enumerate(source_vertices)}
        leaf = _base([vertices[v] for v in source_vertices],[[local[v] for v in face]],n//common,d//common,radius,principal//common)
        leaf['name'] = f'{n}/{d} cycle {index+1}'
        leaf['metadata']['regularStarPolygon']['angularPhaseTurns'] = {'numerator': index,'denominator': n}
        leaf['provenance']['operation'] = 'regular-star-polygon-cycle'
        leaf['provenance']['parameters'] = {'n': n,'d': d,'radius': radius,'cycle_index': index}
        leaf['provenance']['definition'] = 'literal phase-preserving source cycle of the original unreduced polygon; not a zero-phase reduced generator'
        leaf['provenance']['parentPolygon'] = {'n': n,'d': d,'globalVertexIds': source_vertices,'cycleIndex': index}
        leaves.append(leaf)
    def compose(items):
        if len(items)==1:
            return items[0]
        middle = len(items)//2
        return add_models(compose(items[:middle]),compose(items[middle:]))
    assembled = compose(leaves)
    angular_index = {tuple(point):i for i,point in enumerate(vertices)}
    vertex_map = [angular_index[tuple(point)] for point in assembled['vertices']]
    result = _base(vertices,faces,n,d,radius,principal)
    edge_lookup = {tuple(edge):i for i,edge in enumerate(result['edges'])}
    edge_map = [edge_lookup[tuple(sorted(vertex_map[v] for v in edge))] for edge in assembled['edges']]
    face_lookup = {tuple(face):i for i,face in enumerate(faces)}
    face_map = [face_lookup[tuple(vertex_map[v] for v in face)] for face in assembled['faces']]
    remaps = {'vertices':vertex_map,'edges':edge_map,'faces':face_map,'cells':[]}
    result['components'] = deepcopy(assembled['components'])
    result['metadata']['compound'] = deepcopy(assembled['metadata']['compound'])
    for record in result['components']+result['metadata']['compound']['inputs']:
        record['maps'] = {kind:[remaps[kind][v] for v in ids] for kind,ids in record['maps'].items()}
    _component_records(result)
    if _payload_size(result) > MAX_PAYLOAD_BYTES:
        raise GeometryError('Polygon component history exceeds the 64 MiB payload limit.')
    result['provenance']['componentDefinition'] = 'disjoint modular cycles with original-coordinate leaf snapshots and literal angular current vertex IDs'
    return result
