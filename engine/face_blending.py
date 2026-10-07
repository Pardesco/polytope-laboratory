"""Explicit coincidence pairing and bounded planar boundary blending; no hull."""
from collections import defaultdict
from copy import deepcopy
from itertools import product
import math
import uuid

import numpy as np

from .compounds import _check_source, _colors, _payload_size, MAX_PAYLOAD_BYTES, MAX_FACE_VERTICES
from .geometry import GeometryError, TOLERANCE, identity, validate

VERSION = '0.1.0'
MAX_WELD_COMPARISONS = 1_000_000
MAX_BLEND_FACES = 512
MAX_BLEND_CORNERS = 4096
MAX_SEGMENT_COMPARISONS = 1_000_000
PREDICATE_EPSILON = 1e-10


def _tolerance(value):
    if type(value) not in (int, float) or not 0 <= value <= 1e100 or not math.isfinite(value):
        raise GeometryError('Face-editing tolerance must be finite and between zero and 1e100.')
    return float(value)


def _welding(source, tolerance):
    representatives, mapping, exact, grid = [], [], {}, defaultdict(list)
    comparisons = 0
    def cell(point):
        tn, td = tolerance.as_integer_ratio()
        return tuple((float(x).as_integer_ratio()[0]*td)//(float(x).as_integer_ratio()[1]*tn) for x in point)
    for point in source['vertices']:
        key = tuple(point)
        found = exact.get(key)
        bucket = None
        if found is None and tolerance:
            bucket = cell(point)
            candidates = sorted(v for delta in product((-1, 0, 1), repeat=len(point))
                                for v in grid.get(tuple(x+y for x, y in zip(bucket, delta)), []))
            for candidate in candidates:
                comparisons += 1
                if comparisons > MAX_WELD_COMPARISONS:
                    raise GeometryError('Face-editing welding comparison resource limit exceeded.')
                if math.dist(point, source['vertices'][representatives[candidate]]) <= tolerance:
                    found = candidate
                    break
        if found is None:
            found = len(representatives)
            representatives.append(len(mapping))
            if tolerance:
                grid[bucket or cell(point)].append(found)
        exact[key] = found
        mapping.append(found)
    return {'tolerance': tolerance, 'vertexMap': mapping, 'representativeSourceVertices': representatives,
            'method': 'first retained coordinate within absolute distance; no averaging or transitive clustering',
            'comparisons': comparisons}


def _cycle_key(cycle):
    if len(set(cycle)) != len(cycle):
        raise GeometryError('Coordinate welding collapses a source face boundary; operation rejected.')
    position = cycle.index(min(cycle))
    forward = tuple(cycle[position:]+cycle[:position])
    reverse = (forward[0],) + tuple(reversed(forward[1:]))
    return min(forward, reverse)


def analyze_coincidences(source, tolerance=0):
    """Read-only coordinate-cycle equivalence, including reversal; triples pair once."""
    _check_source(source)
    tolerance = _tolerance(tolerance)
    welding = _welding(source, tolerance)
    keys, by_key = [], defaultdict(list)
    for index, face in enumerate(source['faces']):
        key = _cycle_key([welding['vertexMap'][v] for v in face])
        keys.append(list(key))
        by_key[key].append(index)
    groups = [{'faceIds': faces, 'cycleKey': list(key),
               'pairs': [faces[i:i+2] for i in range(0, len(faces)-1, 2)],
               'unpairedFaceIds': faces[-1:] if len(faces) % 2 else []}
              for key, faces in by_key.items() if len(faces) > 1]
    return {'schemaVersion': 1, 'sourceModelId': source.get('id'), 'sourceFingerprint': identity(source),
            'groups': groups, 'pairs': [pair for group in groups for pair in group['pairs']],
            'unpairedFaceIds': [f for group in groups for f in group['unpairedFaceIds']],
            'faceKeys': keys, 'welding': dict(welding, applied=False)}


def _geometry(source, welding, weld):
    if type(weld) is not bool:
        raise GeometryError('Coordinate weld policy must be an explicit boolean.')
    mapping = welding['vertexMap'] if weld else list(range(len(source['vertices'])))
    vertices = deepcopy([source['vertices'][i] for i in welding['representativeSourceVertices']]) if weld else deepcopy(source['vertices'])
    edges, edge_map, indices = [], [], {}
    for a, b in source['edges']:
        a, b = mapping[a], mapping[b]
        if a == b:
            edge_map.append(None)
            continue
        key = tuple(sorted((a, b)))
        if key not in indices:
            indices[key] = len(edges)
            edges.append([a, b])
        edge_map.append(indices[key])
    faces = [[mapping[v] for v in f] for f in source['faces']]
    for face in faces:
        _cycle_key(face)
    return vertices, edges, faces, mapping, edge_map


def _result(source, operation, geometry, faces, face_sources, evidence, color_policy='require-equal', removed_edges=()):
    vertices, old_edges, _, vertex_map, old_edge_map = geometry
    edge_mapping, edges = {}, []
    for i, edge in enumerate(old_edges):
        if i not in removed_edges:
            edge_mapping[i] = len(edges)
            edges.append(edge)
    source_edge_map = [edge_mapping.get(i) if i is not None else None for i in old_edge_map]
    source_face_map = [[] for _ in source['faces']]
    for index, origins in enumerate(face_sources):
        for face in origins:
            source_face_map[face].append(index)
    cells, cell_map, cell_sources = [], [], []
    for index, cell in enumerate(source.get('cells', [])):
        mapped = list(dict.fromkeys(f for old in cell for f in source_face_map[old]))
        if mapped:
            cell_map.append(len(cells))
            cells.append(mapped)
            cell_sources.append(index)
        else:
            cell_map.append(None)
    source_colors = _colors(source, 'faces')
    face_colors = []
    for origins in face_sources:
        colors = [source_colors[i] for i in origins]
        if color_policy == 'require-equal' and any(color != colors[0] for color in colors[1:]):
            raise GeometryError('Blended faces have different source colors; explicitly choose first-source color policy.')
        face_colors.append(deepcopy(colors[0]))
    original_cell_colors = _colors(source, 'cells')
    cell_colors = deepcopy([original_cell_colors[i] for i in cell_sources])
    maps = {'vertices': vertex_map, 'edges': source_edge_map, 'faces': source_face_map, 'cells': cell_map}
    metadata = {'faceEditing': {'schemaVersion': 1, 'sourceModel': deepcopy(source),
                                'sourceMaps': maps, 'faceSources': face_sources, 'evidence': evidence}}
    if any(color is not None for color in face_colors+cell_colors):
        metadata['offColors'] = {'faces': face_colors, 'cells': cell_colors}
    model = {'id': str(uuid.uuid4()), 'name': f"{source.get('name', 'Source')} · {operation}",
             'dimension': source['dimension'], 'embeddingDimension': source.get('embeddingDimension', source['dimension']),
             'interpretation': 'generalized-complex', 'vertices': vertices, 'edges': edges, 'faces': faces, 'cells': cells,
             'metadata': metadata, 'numeric': {'mode': 'float64-approximate', 'certified': False, 'tolerance': TOLERANCE},
             'provenance': {'operation': operation, 'algorithmVersion': VERSION, 'sourceModelId': source.get('id'),
                            'sourceFingerprint': identity(source), 'parameters': {'tolerance': evidence['tolerance'],
                            'coordinateWeld': evidence['coordinateWeld'], 'colorPolicy': color_policy}}}
    model['validation'] = validate(model)
    if not model['validation']['passed']:
        raise GeometryError('Face editing fails source-incidence validation: '+'; '.join(model['validation']['errors']))
    model['fingerprint'] = identity(model)
    if _payload_size(model) > MAX_PAYLOAD_BYTES:
        raise GeometryError('Face-editing result payload resource limit exceeded.')
    return model


def remove_coincident_pairs(source, tolerance=0, *, weld=False):
    """Explicit pair removal. Keep unmatched faces, original wires and vertices."""
    analysis = analyze_coincidences(source, tolerance)
    removed = {face for pair in analysis['pairs'] for face in pair}
    geometry = _geometry(source, analysis['welding'], weld)
    keep = [i for i in range(len(source['faces'])) if i not in removed]
    evidence = {'tolerance': analysis['welding']['tolerance'], 'coordinateWeld': weld,
                'removedPairs': analysis['pairs'], 'removedFaceIds': sorted(removed),
                'unpairedFaceIds': analysis['unpairedFaceIds'], 'welding': dict(analysis['welding'], applied=weld),
                'policy': 'pair ascending source face IDs; do not remove an odd final face'}
    return _result(source, 'remove-coincident-pairs', geometry, [geometry[2][i] for i in keep], [[i] for i in keep], evidence)


def _area(points):
    return sum(float(a[0]*b[1]-a[1]*b[0]) for a, b in zip(points, np.roll(points, -1, axis=0)))/2


def _cross(a, b, c):
    u, v = b-a, c-a
    return float(u[0]*v[1]-u[1]*v[0])


def _on_segment(point, a, b):
    epsilon = PREDICATE_EPSILON
    return abs(_cross(a, b, point)) <= epsilon and bool(np.all(point >= np.minimum(a, b)-epsilon) and np.all(point <= np.maximum(a, b)+epsilon))


def _relation(a, b, c, d):
    epsilon = PREDICATE_EPSILON
    if np.any(np.maximum(np.minimum(a, b), np.minimum(c, d)) > np.minimum(np.maximum(a, b), np.maximum(c, d))+epsilon):
        return 'none'
    turns = [_cross(a, b, c), _cross(a, b, d), _cross(c, d, a), _cross(c, d, b)]
    if all(abs(value) <= epsilon for value in turns):
        axis = int(np.argmax(abs(b-a)))
        overlap = min(max(a[axis], b[axis]), max(c[axis], d[axis]))-max(min(a[axis], b[axis]), min(c[axis], d[axis]))
        return 'overlap' if overlap > epsilon else 'touch' if overlap >= -epsilon else 'none'
    signs = [1 if x > epsilon else -1 if x < -epsilon else 0 for x in turns]
    if signs[0]*signs[1] == -1 and signs[2]*signs[3] == -1:
        return 'cross'
    if any((_on_segment(p, x, y)) for p, x, y in ((a, c, d), (b, c, d), (c, a, b), (d, a, b))):
        return 'touch'
    return 'none'


def _membership(point, polygon):
    """-1 outside, 0 boundary, 1 strictly inside, for a checked simple polygon."""
    inside = False
    for a, b in zip(polygon, np.roll(polygon, -1, axis=0)):
        if _on_segment(point, a, b):
            return 0
        if (a[1] > point[1]) != (b[1] > point[1]):
            x = a[0] + (point[1]-a[1])*(b[0]-a[0])/(b[1]-a[1])
            if x > point[0]:
                inside = not inside
    return 1 if inside else -1


class _Predicates:
    def __init__(self):
        self.comparisons = 0

    def relation(self, a, b, c, d):
        self.comparisons += 1
        if self.comparisons > MAX_SEGMENT_COMPARISONS:
            raise GeometryError('Coplanar blend segment-comparison resource limit exceeded.')
        return _relation(a, b, c, d)


def blend_faces(source, face_ids, tolerance=0, *, weld=False, color_policy='require-equal'):
    """Cancel shared segments of simple coplanar faces; reject holes and overlaps."""
    _check_source(source)
    tolerance = _tolerance(tolerance)
    if color_policy not in ('require-equal', 'first-source'):
        raise GeometryError('Blend color policy must be require-equal or first-source.')
    if not isinstance(face_ids, list) or not 2 <= len(face_ids) <= MAX_BLEND_FACES or any(type(i) is not int or not 0 <= i < len(source['faces']) for i in face_ids) or len(set(face_ids)) != len(face_ids):
        raise GeometryError('Blend requires 2–512 distinct valid source face IDs.')
    selected = sorted(face_ids)
    if sum(len(source['faces'][i]) for i in selected) > MAX_BLEND_CORNERS:
        raise GeometryError('Coplanar blend selected-corner resource limit exceeded.')
    welding = _welding(source, tolerance)
    geometry = _geometry(source, welding, weld)
    vertices, _, source_faces, _, _ = geometry
    p = np.asarray(vertices, dtype=float)
    ids = sorted({v for f in selected for v in source_faces[f]})
    origin = p[ids].mean(axis=0)
    scale = float(np.max(np.ptp(p[ids], axis=0)))
    if not scale:
        raise GeometryError('Selected blend faces have zero coordinate span.')
    cloud = (p[ids]-origin)/scale
    _, singular, vt = np.linalg.svd(cloud, full_matrices=False)
    if len(singular) < 2 or singular[1] <= PREDICATE_EPSILON:
        raise GeometryError('Selected blend faces do not span a resolved polygon plane.')
    projected = (p-origin)/scale @ vt[:2].T
    residual = cloud-(cloud @ vt[:2].T) @ vt[:2]
    if float(np.max(abs(residual))) > PREDICATE_EPSILON:
        raise GeometryError('Selected blend faces are not coplanar in one resolved source plane.')
    predicates = _Predicates()
    oriented, segment_tables, areas = {}, {}, {}
    for f in selected:
        cycle = source_faces[f][:]
        points = projected[cycle]
        area = _area(points)
        if abs(area) <= PREDICATE_EPSILON:
            raise GeometryError('Selected blend face is degenerate or an unresolved star/self-intersecting polygon.')
        segments = list(zip(cycle, cycle[1:]+cycle[:1]))
        for i, (a, b) in enumerate(segments):
            if float(np.linalg.norm(projected[a]-projected[b])) <= PREDICATE_EPSILON:
                raise GeometryError('Selected blend face has a degenerate geometric edge.')
            for j in range(i+1, len(segments)):
                if j == i+1 or i == 0 and j == len(segments)-1:
                    continue
                c, d = segments[j]
                if predicates.relation(projected[a], projected[b], projected[c], projected[d]) != 'none':
                    raise GeometryError('Star/self-intersecting selected face is outside the simple-polygon blend domain.')
        if area < 0:
            cycle.reverse()
        oriented[f] = cycle
        areas[f] = abs(area)
        segment_tables[f] = list(zip(cycle, cycle[1:]+cycle[:1]))
    # Source polygon interiors must be disjoint. T-junction subdivision is not guessed.
    for offset, first in enumerate(selected):
        for second in selected[offset+1:]:
            for a, b in segment_tables[first]:
                for c, d in segment_tables[second]:
                    relation = predicates.relation(projected[a], projected[b], projected[c], projected[d])
                    if relation == 'none':
                        continue
                    if {a, b} == {c, d}:
                        if (a, b) == (c, d):
                            raise GeometryError('Selected faces have overlapping interiors or coincide; remove coincident pairs separately.')
                    elif relation in ('cross', 'overlap'):
                        raise GeometryError('Selected faces cross or have a nonconforming shared segment; explicit coordinate welding or segment subdivision is required.')
                    elif not {a, b} & {c, d}:
                        raise GeometryError('Selected faces touch without shared source vertex IDs; explicit coordinate welding is required.')
            if any(_membership(projected[v], projected[oriented[second]]) == 1 for v in oriented[first]) or any(_membership(projected[v], projected[oriented[first]]) == 1 for v in oriented[second]):
                raise GeometryError('Selected faces overlap or contain another face; overlapping region union is outside this blend domain.')
    uses = defaultdict(list)
    adjacency = {f: set() for f in selected}
    for f in selected:
        for a, b in segment_tables[f]:
            uses[tuple(sorted((a, b)))].append((f, a, b))
    boundary, internal = [], set()
    for edge, records in uses.items():
        if len(records) == 1:
            boundary.append(records[0])
        elif len(records) == 2:
            first, second = records
            if first[1:] != second[1:][::-1]:
                raise GeometryError('Shared blend edge has inconsistent side incidence.')
            internal.add(edge)
            adjacency[first[0]].add(second[0])
            adjacency[second[0]].add(first[0])
        else:
            raise GeometryError('Shared blend edge has more than two source face incidences.')
    next_vertex, previous_vertex, boundary_origin = {}, {}, {}
    for f, a, b in boundary:
        if a in next_vertex or b in previous_vertex:
            raise GeometryError('Blend boundary branches at a shared vertex; vertex-only touching/nonmanifold unions are unsupported.')
        next_vertex[a], previous_vertex[b], boundary_origin[a] = b, a, f
    if not next_vertex or set(next_vertex) != set(previous_vertex):
        raise GeometryError('Blend did not produce closed unambiguous boundary cycles.')
    groups, face_group = [], {}
    for f in selected:
        if f in face_group:
            continue
        group, pending = [], [f]
        while pending:
            current = pending.pop()
            if current in face_group:
                continue
            face_group[current] = len(groups)
            group.append(current)
            pending.extend(sorted(adjacency[current], reverse=True))
        groups.append(sorted(group))
    loops, loop_sources, remaining = [], [], set(next_vertex)
    while remaining:
        start = min(remaining)
        cycle, current = [], start
        while current in remaining:
            cycle.append(current)
            remaining.remove(current)
            current = next_vertex[current]
        if current != start or len(cycle) < 3:
            raise GeometryError('Blend boundary failed to close a simple polygon.')
        group_ids = {face_group[boundary_origin[v]] for v in cycle}
        if len(group_ids) != 1:
            raise GeometryError('Blend boundary has ambiguous source-face connectivity.')
        loops.append(cycle)
        loop_sources.append(groups[next(iter(group_ids))])
    for i, loop in enumerate(loops):
        if len(loop) > MAX_FACE_VERTICES:
            raise GeometryError('Blended face-boundary resource limit exceeded.')
        if _area(projected[loop]) <= PREDICATE_EPSILON or any(_membership(projected[loop[0]], projected[other]) == 1 for j, other in enumerate(loops) if i != j):
            raise GeometryError('Blend produces a hole/nested boundary; native single-cycle faces cannot preserve holes. No filled-hole result returned.')
    source_area = sum(areas.values())
    output_area = sum(_area(projected[loop]) for loop in loops)
    if abs(output_area-source_area) > PREDICATE_EPSILON*max(1, source_area)*max(1, len(selected)):
        raise GeometryError('Blend boundary area disagrees with selected source polygon areas.')
    cell_membership = {f: {i for i, cell in enumerate(source.get('cells', [])) if f in cell} for f in selected}
    for origins in loop_sources:
        if any(cell_membership[f] != cell_membership[origins[0]] for f in origins):
            raise GeometryError('Blending these 4D faces changes distinct source cell boundaries; cell reconstruction is unsupported.')
    output_faces, output_origins, inserted = [], [], False
    for i, face in enumerate(source_faces):
        if i in oriented:
            if not inserted:
                output_faces.extend(loops)
                output_origins.extend(loop_sources)
                inserted = True
        else:
            output_faces.append(face)
            output_origins.append([i])
    used_edges = {tuple(sorted((a, b))) for face in output_faces for a, b in zip(face, face[1:]+face[:1])}
    removed_edges = {i for i, edge in enumerate(geometry[1]) if tuple(sorted(edge)) in internal and tuple(sorted(edge)) not in used_edges}
    evidence = {'tolerance': tolerance, 'coordinateWeld': weld, 'selectedFaceIds': selected,
                'welding': dict(welding, applied=weld), 'removedInternalEdges': [list(edge) for edge in sorted(internal)],
                'sourceFaceGroups': groups, 'boundaryCycles': loops, 'disconnectedRegions': len(loops),
                'normalizedSourceArea': source_area, 'normalizedOutputArea': output_area, 'areaCoordinateScale': scale,
                'predicateEpsilon': PREDICATE_EPSILON, 'segmentComparisons': predicates.comparisons,
                'domain': 'simple coplanar polygons with disjoint interiors, conforming shared source edges, and no holes'}
    return _result(source, 'blend-coplanar-faces', geometry, output_faces, output_origins, evidence, color_policy, removed_edges)
