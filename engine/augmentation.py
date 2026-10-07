"""Literal source-preserving face attachment with bounded numerical evidence.

Verified convex 3D source boundaries are joined across one congruent facet.
The hull is only an independent source verifier, never replacement geometry.
Stella's full augmentation/excavation/drilling baseline remains unqualified.
"""
from collections import Counter, defaultdict
from copy import deepcopy
import hashlib
import json
import math
import uuid

import numpy as np

from .compounds import _check_source, _colors
from .convex_classification import analyze_convex_boundary
from .formats import validate_project
from .geometry import GeometryError, TOLERANCE, identity, validate
from .history import _json_bytes

VERSION = '0.1.0'
MAX_SOURCE_VERTICES = 256
MAX_FACE_VERTICES = 64
MAX_INCIDENCES = 16_384
MAX_INPUT_BYTES = 16 * 1024 * 1024
MAX_OUTPUT_BYTES = 64 * 1024 * 1024
MAX_COORDINATE = 1e100
MAX_TOLERANCE = 1e-6


def _bytes(value, limit):
    try:
        return _json_bytes(value, limit)
    except (UnicodeError, RecursionError, OverflowError, ValueError, TypeError) as exc:
        raise GeometryError('Attachment requires finite bounded UTF-8 JSON data.') from exc


def _number(value, label, *, minimum, maximum, inclusive=True):
    if (type(value) not in (int, float) or abs(value) > maximum
            or not math.isfinite(value) or value < minimum
            or (not inclusive and value == minimum)):
        raise GeometryError(f'Attachment {label} is outside its finite bounded numeric domain.')
    return float(value)


def _closed_boundary(model):
    """Closed connected genus-zero surface, including a single cyclic vertex link."""
    faces = model['faces']; edges = model['edges']; vertices = model['vertices']
    counts = Counter(); links = defaultdict(list)
    for face in faces:
        for j, v in enumerate(face):
            counts[tuple(sorted((v, face[(j + 1) % len(face)])))] += 1
            links[v].append(tuple(sorted((face[j - 1], face[(j + 1) % len(face)]))))
    expected = {tuple(sorted(e)) for e in edges}
    if set(counts) != expected or any(n != 2 for n in counts.values()):
        raise GeometryError('Attachment boundary must have exactly two faces on every edge and no leftover strata.')
    adjacency = defaultdict(set)
    for a, b in edges:
        adjacency[a].add(b); adjacency[b].add(a)
    if set(adjacency) != set(range(len(vertices))):
        raise GeometryError('Attachment boundary contains an unowned or isolated vertex.')
    seen = {0}; stack = [0]
    while stack:
        for other in adjacency[stack.pop()] - seen:
            seen.add(other); stack.append(other)
    if len(seen) != len(vertices):
        raise GeometryError('Attachment boundary must be connected.')
    for v in range(len(vertices)):
        link = links[v]; graph = defaultdict(set)
        if len(set(link)) != len(link):
            raise GeometryError('Attachment vertex link contains duplicate edges.')
        for a, b in link:
            graph[a].add(b); graph[b].add(a)
        if set(graph) != adjacency[v] or any(len(row) != 2 for row in graph.values()):
            raise GeometryError('Attachment vertex link must be a cycle.')
        first = next(iter(graph)); reached = {first}; pending = [first]
        while pending:
            for other in graph[pending.pop()] - reached:
                reached.add(other); pending.append(other)
        if reached != set(graph):
            raise GeometryError('Attachment has a disconnected vertex link.')
    if len(vertices) - len(edges) + len(faces) != 2:
        raise GeometryError('Attachment boundary must have Euler characteristic 2 in this initial domain.')
    return {'closed': True, 'connected': True, 'vertexLinks': 'single cycles',
            'facesPerEdge': 2, 'eulerCharacteristic': 2}


def _source(model):
    if not isinstance(model, dict) or not isinstance(model.get('vertices'), list):
        raise GeometryError('Attachment requires two source Model objects.')
    if not 4 <= len(model['vertices']) <= MAX_SOURCE_VERTICES:
        raise GeometryError('Attachment source vertex resource limit exceeded or source is too small.')
    if not isinstance(model.get('id'), str) or not 1 <= len(model['id']) <= 128:
        raise GeometryError('Attachment source IDs require 1–128 UTF-8 characters.')
    dimension, embedding, incidences, _ = _check_source(model)
    if (dimension, embedding) != (3, 3) or model.get('cells'):
        raise GeometryError('Attachment currently requires intrinsic 3D boundaries without cells.')
    if incidences > MAX_INCIDENCES:
        raise GeometryError('Attachment source incidence resource limit exceeded.')
    proof = analyze_convex_boundary(model)
    if proof['status'] != 'passed':
        message = proof['diagnostics'][0]['message'] if proof['diagnostics'] else proof['status']
        raise GeometryError('Attachment requires an independently verified convex source: ' + message)
    _closed_boundary(model)
    return proof, incidences


def _normal(proof, face_id):
    record = next(row for row in proof['facetSupports'] if row['sourceFacetId'] == face_id)
    normal = np.asarray(record['equation'][:3], dtype=float)
    return normal / np.linalg.norm(normal)


def _frame(points, face, normal):
    edge = points[face[1]] - points[face[0]]
    tangent = edge - np.dot(edge, normal) * normal
    length = float(np.linalg.norm(tangent))
    if not math.isfinite(length) or not length:
        raise GeometryError('Attachment face frame is unresolved.')
    tangent /= length
    return np.column_stack((tangent, np.cross(normal, tangent), normal))


def _orientation(points, face, normal):
    span = float(np.max(np.ptp(points[face], axis=0)))
    cloud = (points[face] - points[face[0]]) / span
    turn = float(np.dot(np.cross(cloud[1], cloud[2]), normal))
    if not math.isfinite(turn) or abs(turn) <= TOLERANCE:
        raise GeometryError('Attachment face traversal orientation is unresolved.')
    return 1 if turn > 0 else -1


def _measures(model, signs):
    """Independent oriented-boundary integration, kept outside native measure."""
    points = np.asarray(model['vertices'], dtype=float)
    scale = float(np.max(np.ptp(points, axis=0)))
    p = (points - points[0]) / scale
    center = p.mean(axis=0); area = 0.; volume = 0.
    for face, sign in zip(model['faces'], signs):
        polygon = p[face]; anchor = polygon[0] - center
        vector = np.zeros(3)
        for j in range(1, len(face) - 1):
            vector += np.cross(polygon[j] - polygon[0], polygon[j + 1] - polygon[0])
            volume += sign * float(np.dot(anchor, np.cross(polygon[j] - center,
                                                          polygon[j + 1] - center))) / 6
        area += float(np.linalg.norm(vector)) / 2
    evidence = {'status': 'unsupported', 'numeric': {'certified': False, 'mode': 'float64-approximate'},
                'definition': 'oriented closed-boundary integration; convex interiors separated by the matched facet',
                'units': model.get('metadata', {}).get('coordinateUnits', 'model'),
                'nativeMeasurePublished': False}
    try:
        content = volume * scale ** 3; surface = area * scale ** 2
        if (math.isfinite(content) and math.isfinite(surface)
                and content >= np.finfo(float).tiny and surface >= np.finfo(float).tiny):
            evidence.update(status='passed', disjointInteriorContent=content, surfaceArea=surface)
        else:
            evidence['diagnostic'] = 'Boundary measures overflowed, underflowed, or were unresolved; no values published.'
    except OverflowError:
        evidence['diagnostic'] = 'Boundary measure scale is unsupported; no values published.'
    return evidence


def attach_at_faces(base, addition, base_face_id, addition_face_id, *, cycle_offset=0,
                    scale=1.0, tolerance=TOLERANCE, color_policy='preserve', **unsupported):
    """Return a new generalized boundary; never mutate, hull, or silently blend sources.

    Tolerance is relative to the selected face spans, bounded by 1e-6. Only
    paired seam vertices are welded. Source/addition snapshots keep literal
    coordinates; transformed addition IDs map explicitly into the new boundary.
    """
    try:
        return _attach(base, addition, base_face_id, addition_face_id, cycle_offset=cycle_offset,
                       scale=scale, tolerance=tolerance, color_policy=color_policy,
                       unsupported=unsupported)
    except GeometryError:
        raise
    except (ArithmeticError, AttributeError, KeyError, TypeError, ValueError,
            RecursionError, UnicodeError, np.linalg.LinAlgError) as exc:
        raise GeometryError('Attachment could not resolve malformed data or numerical geometry: ' + str(exc)) from exc


def _attach(base, addition, base_face_id, addition_face_id, *, cycle_offset, scale,
            tolerance, color_policy, unsupported):
    if unsupported:
        raise GeometryError('Unknown attachment parameters: ' + ', '.join(sorted(unsupported)))
    if color_policy != 'preserve':
        raise GeometryError('Attachment currently supports only explicit preserve source colors.')
    scale = _number(scale, 'scale', minimum=0, maximum=MAX_COORDINATE, inclusive=False)
    tolerance = _number(tolerance, 'tolerance', minimum=0, maximum=MAX_TOLERANCE)
    source_bytes = _bytes([base, addition], MAX_INPUT_BYTES)  # Before any deepcopy.
    checked = [_source(base), _source(addition)]
    if sum(row[1] for row in checked) > MAX_INCIDENCES:
        raise GeometryError('Attachment combined incidence resource limit exceeded.')
    for source, face_id in ((base, base_face_id), (addition, addition_face_id)):
        if type(face_id) is not int or not 0 <= face_id < len(source['faces']):
            raise GeometryError('Attachment face IDs must be bounded integer source IDs.')
    bf = base['faces'][base_face_id]; af = addition['faces'][addition_face_id]
    if not 3 <= len(bf) == len(af) <= MAX_FACE_VERTICES:
        raise GeometryError('Attachment faces need matching arity within the face resource limit.')
    if type(cycle_offset) is not int or not 0 <= cycle_offset < len(bf):
        raise GeometryError('Attachment cycle offset must be an integer in the selected face cycle.')
    units = [source.get('metadata', {}).get('coordinateUnits') for source in (base, addition)]
    if any(unit is not None and (type(unit) is not str or unit not in ('model', 'mm', 'cm', 'm', 'in', 'ft'))
           for unit in units):
        raise GeometryError('Attachment coordinate unit labels are unsupported or malformed.')
    if units[0] != units[1]:
        raise GeometryError('Attachment source coordinate units differ; no automatic conversion is performed.')
    p = np.asarray(base['vertices'], dtype=float); q = np.asarray(addition['vertices'], dtype=float)
    bn = _normal(checked[0][0], base_face_id); an = _normal(checked[1][0], addition_face_id)
    direction = -_orientation(p, bf, bn) * _orientation(q, af, an)
    targets = [bf[(cycle_offset + direction * j) % len(bf)] for j in range(len(bf))]
    rotation = _frame(p, targets, -bn) @ _frame(q, af, an).T
    determinant = float(np.linalg.det(rotation))
    if (not np.isfinite(rotation).all() or abs(determinant - 1) > 1e-12
            or not np.allclose(rotation.T @ rotation, np.eye(3), atol=1e-12, rtol=0)):
        raise GeometryError('Attachment requires a resolved proper rigid rotation with determinant +1.')
    transformed = ((q - q[af[0]]) * scale) @ rotation.T + p[targets[0]]
    if not np.isfinite(transformed).all() or np.max(np.abs(transformed)) > MAX_COORDINATE:
        raise GeometryError('Attachment transformed coordinates exceed finite resource bounds.')
    face_span = max(float(np.max(np.ptp(p[bf], axis=0))),
                    float(np.max(np.ptp(transformed[af], axis=0))))
    absolute_tolerance = tolerance * face_span
    residuals = [float(np.linalg.norm(transformed[a] - p[b])) for a, b in zip(af, targets)]
    if any(not math.isfinite(r) or r > absolute_tolerance for r in residuals):
        raise GeometryError('Attachment ordered face polygons are incongruent at the requested tolerance.')
    # Convex supporting planes and full matching facets imply disjoint interiors.
    signed_base = (p - p[targets[0]]) @ bn
    signed_addition = (transformed - p[targets[0]]) @ bn
    outside_base = [i for i in range(len(p)) if i not in bf]
    outside_addition = [i for i in range(len(q)) if i not in af]
    if (float(np.max(signed_base)) > absolute_tolerance
            or float(np.min(signed_addition)) < -absolute_tolerance
            or any(signed_base[i] >= -absolute_tolerance for i in outside_base)
            or any(signed_addition[i] <= absolute_tolerance for i in outside_addition)):
        raise GeometryError('Attachment opposite-halfspace separation is unresolved or overlapping.')
    snapped = transformed.copy()
    for a, b in zip(af, targets): snapped[a] = p[b]
    verification = {'id': 'aligned-addition-verification', 'name': 'Aligned addition',
                    'dimension': 3, 'embeddingDimension': 3, 'interpretation': 'generalized-complex',
                    'vertices': snapped.tolist(), 'edges': addition['edges'], 'faces': addition['faces'],
                    'cells': [], 'metadata': {}, 'numeric': {'certified': False}}
    snap_proof = analyze_convex_boundary(verification)
    if snap_proof['status'] != 'passed':
        raise GeometryError('Attachment seam welding invalidates the independently verified addition boundary.')
    vertex_maps = [list(range(len(p))), [None] * len(q)]
    vertices = deepcopy(base['vertices'])
    seam_pairs = []
    for a, b in zip(af, targets):
        vertex_maps[1][a] = b
        seam_pairs.append({'baseVertexId': b, 'additionVertexId': a,
                           'resultVertexId': b, 'snapResidual': residuals[af.index(a)]})
    for i, point in enumerate(snapped):
        if vertex_maps[1][i] is None:
            vertex_maps[1][i] = len(vertices); vertices.append(point.tolist())
    edges = []; edge_lookup = {}; edge_maps = [[], []]
    for si, source in enumerate((base, addition)):
        for edge in source['edges']:
            mapped = [vertex_maps[si][v] for v in edge]; key = tuple(sorted(mapped))
            if key not in edge_lookup:
                edge_lookup[key] = len(edges); edges.append(mapped)
            edge_maps[si].append(edge_lookup[key])
    faces = []; face_maps = [[], []]; colors = []; owners = []; signs = []
    for si, (source, removed, points, proof) in enumerate(((base, base_face_id, p, checked[0][0]),
                                                        (addition, addition_face_id, q, checked[1][0]))):
        source_colors = _colors(source, 'faces')
        for fi, face in enumerate(source['faces']):
            if fi == removed:
                face_maps[si].append(None); continue
            face_maps[si].append(len(faces)); faces.append([vertex_maps[si][v] for v in face])
            owners.append({'sourceIndex': si, 'sourceFaceId': fi})
            colors.append(deepcopy(source_colors[fi]))
            signs.append(_orientation(points, face, _normal(proof, fi)))
    bindings = [{'sourceModelId': source['id'], 'sourceFingerprint': identity(source),
                 'sourceSnapshotSha256': hashlib.sha256(_bytes(source, MAX_INPUT_BYTES)).hexdigest(),
                 'maps': {'vertices': vertex_maps[si], 'edges': edge_maps[si], 'faces': face_maps[si], 'cells': []}}
                for si, source in enumerate((base, addition))]
    translation = p[targets[0]] - scale * (rotation @ q[af[0]])
    evidence = {'schemaVersion': 1, 'sourceModels': [deepcopy(base), deepcopy(addition)],
                'inputs': bindings, 'faceOwners': owners, 'seamVertexPairs': seam_pairs,
                'removedFaces': [{'sourceIndex': 0, 'faceId': base_face_id},
                                 {'sourceIndex': 1, 'faceId': addition_face_id}],
                'alignment': {'rotation': rotation.tolist(), 'translation': translation.tolist(),
                              'sourceAnchor': q[af[0]].tolist(), 'targetAnchor': p[targets[0]].tolist(),
                              'stableTransform': 'scale * rotation * (point - sourceAnchor) + targetAnchor',
                              'scale': scale, 'determinant': determinant, 'targetCycle': targets,
                              'relativeTolerance': tolerance, 'absoluteTolerance': absolute_tolerance,
                              'maximumSnapResidual': max(residuals)},
                'separation': {'status': 'passed', 'method': 'verified convex interiors in opposite facet halfspaces',
                               'maximumBaseResidual': float(np.max(signed_base)),
                               'minimumAdditionResidual': float(np.min(signed_addition))},
                'currentComponents': 'connected boundary; input components are historical snapshots only',
                'resourceBounds': {'sourceVertices': MAX_SOURCE_VERTICES, 'selectedFaceVertices': MAX_FACE_VERTICES,
                                   'combinedIncidenceReferences': MAX_INCIDENCES, 'inputBytes': MAX_INPUT_BYTES,
                                   'outputBytes': MAX_OUTPUT_BYTES},
                'inputByteCount': len(source_bytes)}
    model = {'id': str(uuid.uuid4()), 'name': base.get('name', 'Base') + ' augmented',
             'dimension': 3, 'embeddingDimension': 3, 'interpretation': 'generalized-complex',
             'vertices': vertices, 'edges': edges, 'faces': faces, 'cells': [],
             'metadata': {'augmentation': evidence, 'offColors': {'faces': colors, 'cells': []}},
             'numeric': {'mode': 'float64-approximate', 'tolerance': TOLERANCE, 'certified': False},
             'provenance': {'operation': 'attach-at-faces', 'algorithmVersion': VERSION,
                            'inputs': [{key: row[key] for key in ('sourceModelId', 'sourceFingerprint', 'sourceSnapshotSha256')}
                                       for row in bindings],
                            'parameters': {'base_face_id': base_face_id, 'addition_face_id': addition_face_id,
                                           'cycle_offset': cycle_offset, 'scale': scale, 'tolerance': tolerance,
                                           'color_policy': color_policy, 'weld': 'paired seam only',
                                           'blendCoplanarFaces': False, 'hullReplacement': False}}}
    if units[0] is not None: model['metadata']['coordinateUnits'] = deepcopy(units[0])
    evidence['boundary'] = _closed_boundary(model)
    model['validation'] = validate(model)
    if not model['validation']['passed']:
        raise GeometryError('Attachment result incidence failed native validation: ' + '; '.join(model['validation']['errors']))
    model['fingerprint'] = identity(model)
    evidence['resultModelId'] = model['id']; evidence['resultFingerprint'] = model['fingerprint']
    evidence['measureEvidence'] = _measures(model, signs)
    project = {'format': 'polytope-laboratory', 'version': 1, 'active': 0,
               'documents': [{'id': 'attachment-gate', 'cursor': 0, 'states': [{'model': model, 'view': {}}]}]}
    detached = json.loads(_bytes(project, MAX_OUTPUT_BYTES))
    validate_project(detached)
    restored = detached['documents'][0]['states'][0]['model']
    if restored != model or 'measure' in restored or identity(restored) != model['fingerprint']:
        raise GeometryError('Attachment native project gate changed source geometry or retained attributes.')
    evidence['nativeProjectGate'] = {'passed': True, 'filledMeasurePublished': False}
    _bytes(model, MAX_OUTPUT_BYTES)
    return model
