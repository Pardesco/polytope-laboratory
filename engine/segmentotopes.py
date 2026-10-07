"""Bounded convex parallel-layer joins, not crossed segmentotope incidence."""
from copy import deepcopy
import hashlib
import json
import math
import sys
import uuid

import numpy as np

from .compounds import _check_source, _colors
from .convex_classification import analyze_convex_boundary
from .formats import validate_project
from .geometry import GeometryError, TOLERANCE, canonical_cycle, hull, identity, validate
from .history import _json_bytes, canonical_model

VERSION = '0.1.0'
MAX_INPUT_VERTICES = 64
MAX_PAYLOAD_BYTES = 64 * 1024 * 1024
MAX_COORDINATE = 1e100
RECORD_FORMAT = 'polytope-layer-source'
KINDS = ('vertices', 'edges', 'faces', 'cells')


def _number(value, label, bound=MAX_COORDINATE):
    if type(value) not in (int, float) or not -bound <= value <= bound or not math.isfinite(value):
        raise GeometryError(f'Layer join {label} must be a finite number bounded to {bound:g}.')
    return float(value)


def _point(value, label):
    if type(value) not in (list, tuple) or len(value) != 3:
        raise GeometryError(f'Layer join {label} requires three coordinates.')
    return [_number(x, label) for x in value]


def _bounded_json(value):
    """Guard the complete source before copying, including traversal UTF-8."""
    try:
        return _json_bytes(value, MAX_PAYLOAD_BYTES)
    except GeometryError:
        raise
    except (UnicodeError, RecursionError, OverflowError, TypeError, ValueError) as exc:
        raise GeometryError('Layer source requires bounded finite UTF-8 JSON data.') from exc


def _record(points, dimension, source_id, metadata):
    if source_id is None:
        source_id = str(uuid.uuid4())
    if type(source_id) is not str or not 1 <= len(source_id) <= 256:
        raise GeometryError('Layer source ID must be a nonempty string of at most 256 characters.')
    if metadata is None:
        metadata = {}
    if type(metadata) is not dict:
        raise GeometryError('Layer source metadata must be an object.')
    result = {'format': RECORD_FORMAT, 'version': 1, 'id': source_id,
              'dimension': dimension, 'embeddingDimension': 3,
              'vertices': points, 'edges': [[0, 1]] if dimension == 1 else [],
              'faces': [], 'cells': [], 'metadata': metadata}
    # The native JSON walker rejects depth, cycles, nonplain values and byte
    # overflow before a potentially large or recursive metadata copy occurs.
    _bounded_json(result)
    try:
        result['metadata'] = deepcopy(metadata)
    except (UnicodeError, RecursionError, OverflowError, TypeError, ValueError) as exc:
        raise GeometryError('Layer source metadata cannot be detached within its JSON bounds.') from exc
    return result


def point_source(coordinates=(0, 0, 0), *, source_id=None, metadata=None):
    """Strict 0D layer record; this is deliberately not a native Model."""
    return _record([_point(coordinates, 'point source')], 0, source_id, metadata)


def edge_source(start, end, *, source_id=None, metadata=None):
    """Strict ordered 1D layer record, with no inferred interior points."""
    points = [_point(start, 'edge start'), _point(end, 'edge end')]
    if points[0] == points[1]:
        raise GeometryError('Layer edge endpoints must be distinct.')
    return _record(points, 1, source_id, metadata)


def _json_evidence(evidence):
    result = deepcopy(evidence)
    limits = result.get('resourceBounds', {}).get('referenceVerticesByDimension')
    if limits is not None:
        result['resourceBounds']['referenceVerticesByDimension'] = {str(k): v for k, v in limits.items()}
    return result


def _source(source, role):
    if type(source) is not dict:
        raise GeometryError(f'Layer join {role} requires a source object.')
    vertices = source.get('vertices')
    if type(vertices) is not list or not 1 <= len(vertices) <= MAX_INPUT_VERTICES:
        raise GeometryError(f'Layer join {role} source vertex bound is {MAX_INPUT_VERTICES}.')
    _bounded_json(source)
    if source.get('format') == RECORD_FORMAT:
        required = {'format', 'version', 'id', 'dimension', 'embeddingDimension', 'vertices', 'edges', 'faces', 'cells', 'metadata'}
        dimension = source.get('dimension')
        if (set(source) != required or type(source.get('version')) is not int or source['version'] != 1
                or type(dimension) is not int or dimension not in (0, 1)
                or type(source.get('embeddingDimension')) is not int or source['embeddingDimension'] != 3
                or len(vertices) != dimension + 1 or type(source.get('metadata')) is not dict
                or type(source.get('id')) is not str or not 1 <= len(source['id']) <= 256
                or source.get('faces') != [] or source.get('cells') != []
                or source.get('edges') != ([[0, 1]] if dimension == 1 else [])):
            raise GeometryError('Malformed strict point/edge layer source record.')
        points = [_point(p, 'record coordinate') for p in vertices]
        if dimension == 1 and points[0] == points[1]:
            raise GeometryError('Layer edge endpoints must be distinct.')
        # Validate any source color table even though these records have no faces.
        _colors(source, 'faces'); _colors(source, 'cells')
        return dimension, points, {'status': 'passed', 'numeric': {'certified': False},
                                  'checks': ['literal point or distinct edge endpoints']}
    if type(source.get('id')) is not str or not 1 <= len(source['id']) <= 256:
        raise GeometryError('Layer Model source ID must be a nonempty bounded string.')
    dimension, embedding, _, _ = _check_source(source)
    if (role == 'base' and (dimension, embedding) != (3, 3)) or (role == 'top' and (dimension, embedding) not in ((2, 2), (2, 3), (3, 3))):
        raise GeometryError('Layer join requires a full 3D base and a point, edge, planar polygon or intrinsic 3D top.')
    _colors(source, 'faces'); _colors(source, 'cells')
    projection = None
    predicate_source = source
    if (dimension, embedding) == (2, 3):
        points = np.asarray(vertices, dtype=float)
        origin = points[0]
        scale = float(np.max(np.ptp(points, axis=0)))
        if not scale:
            raise GeometryError('Layer polygon has unresolved planar rank.')
        normalized = (points - origin) / scale
        _, singular, basis = np.linalg.svd(normalized, full_matrices=True)
        if len(singular) < 2 or singular[1] <= TOLERANCE or (len(singular) > 2 and singular[2] > TOLERANCE):
            raise GeometryError('Layer polygon must have resolved rank two and be coplanar.')
        predicate_source = deepcopy(source)
        predicate_source.update(embeddingDimension=2, interpretation='generalized-complex',
                                vertices=((points - origin) @ basis[:2].T).tolist(),
                                numeric={'mode': 'float64-approximate', 'certified': False})
        for key in ('rationalCoordinates', 'facetEquations', 'facetVertices', 'measure', 'validation', 'fingerprint'):
            predicate_source.pop(key, None)
        projection = {'origin': origin.tolist(), 'orthonormalBasis': basis[:2].tolist(),
                      'scale': scale, 'normalizedSingularValues': singular.tolist(),
                      'scope': 'detached boundary predicate only; source coordinates remain unchanged'}
    evidence = _json_evidence(analyze_convex_boundary(predicate_source))
    if evidence['status'] != 'passed':
        message = '; '.join(d['message'] for d in evidence['diagnostics'])
        raise GeometryError(f'Layer join {role} ordered convex source boundary is not verified ({evidence["status"]}): {message}')
    if projection is not None:
        evidence['predicateSourceFingerprint'] = evidence['sourceFingerprint']
        evidence['sourceFingerprint'] = identity(source)
        evidence['projection'] = projection
    points = [list(map(float, p)) + ([0.0] if embedding == 2 else []) for p in vertices]
    return dimension, points, evidence


def _transform(points, matrix, translation, label):
    if matrix is None:
        matrix = np.eye(3).tolist()
    if type(matrix) not in (list, tuple) or len(matrix) != 3 or any(type(row) not in (list, tuple) or len(row) != 3 for row in matrix):
        raise GeometryError(f'Layer {label} matrix requires a 3 by 3 rigid matrix.')
    matrix = [[_number(x, label + ' matrix', 1 + TOLERANCE) for x in row] for row in matrix]
    array = np.asarray(matrix)
    determinant = float(np.linalg.det(array))
    if (np.max(np.abs(array @ array.T - np.eye(3))) > 1e-10 or abs(abs(determinant) - 1) > 1e-10):
        raise GeometryError(f'Layer {label} matrix must be orthogonal, with determinant +1 or -1; scaling and shear are unsupported.')
    translation = _point((0, 0, 0) if translation is None else translation, label + ' translation')
    transformed = (np.asarray(points) @ array.T + np.asarray(translation)).tolist()
    if any(abs(x) > MAX_COORDINATE or not math.isfinite(x) for p in transformed for x in p):
        raise GeometryError('Transformed layer coordinates exceed the bounded finite domain.')
    return transformed, {'matrix': matrix, 'translation': translation, 'determinant': determinant}


def _measure_gate(model):
    measure = model.get('measure')
    if (type(measure) is not dict or measure.get('dimension') != 4
            or any(type(measure.get(key)) not in (int, float)
                   or not sys.float_info.min <= measure[key] <= sys.float_info.max
                   or not math.isfinite(measure[key]) for key in ('content', 'boundaryMeasure'))):
        raise GeometryError('Layer join convex measures must be finite positive normal float64 values.')


def _native_gate(model):
    before = canonical_model(model)
    original_metadata = _json_bytes(model['metadata'], MAX_PAYLOAD_BYTES)
    original_provenance = _json_bytes(model['provenance'], MAX_PAYLOAD_BYTES)
    project = {'format': 'polytope-laboratory', 'version': 1, 'active': 0, 'documents': [{
        'id': 'layer-join-native-gate', 'cursor': 0, 'states': [{'model': model, 'view': {}}]}]}
    try:
        detached = json.loads(_json_bytes(project, MAX_PAYLOAD_BYTES))
        result = validate_project(detached)['documents'][0]['states'][0]['model']
    except (ValueError, ArithmeticError) as exc:
        raise GeometryError('Layer join native convex project gate failed: ' + str(exc)) from exc
    if (canonical_model(result) != before or result['id'] != model['id']
            or _json_bytes(result['metadata'], MAX_PAYLOAD_BYTES) != original_metadata
            or _json_bytes(result['provenance'], MAX_PAYLOAD_BYTES) != original_provenance):
        raise GeometryError('Layer join native project roundtrip changed geometry or source evidence.')
    _measure_gate(result)
    result['fingerprint'] = identity(result)
    result['validation'] = validate(result)
    if not result['validation']['passed']:
        raise GeometryError('Layer join native output validation failed.')
    return result


def convex_layer_join(base, top, height=1.0, *, top_matrix=None, top_translation=None,
                      base_matrix=None, base_translation=None, **unsupported):
    """Defining convex hull of explicit parallel layers; no automatic sizing.

    A signed nonzero height places the base at w=-height/2 and top at +height/2.
    Matrices apply in XYZ before translations and may explicitly reflect.
    Every source point and original ordered boundary remains in the evidence.
    """
    if unsupported:
        raise GeometryError('Unsupported layer join options: ' + ', '.join(sorted(unsupported)))
    height = _number(height, 'signed height')
    if height == 0:
        raise GeometryError('Layer join height must be nonzero.')
    if (type(base) is not dict or type(top) is not dict
            or type(base.get('vertices')) is not list or type(top.get('vertices')) is not list
            or len(base['vertices']) + len(top['vertices']) > MAX_INPUT_VERTICES):
        raise GeometryError(f'Layer join total input vertex bound is {MAX_INPUT_VERTICES}.')
    dimensions, layers, source_evidence, transforms = [], [], [], []
    for role, source, matrix, translation in (('base', base, base_matrix, base_translation), ('top', top, top_matrix, top_translation)):
        dimension, points, evidence = _source(source, role)
        if role == 'base' and dimension != 3:
            raise GeometryError('Layer join base must be a full intrinsic 3D Model.')
        transformed, transform = _transform(points, matrix, translation, role)
        dimensions.append(dimension); layers.append(transformed); source_evidence.append(evidence); transforms.append(transform)
    points = [p + [-height / 2] for p in layers[0]] + [p + [height / 2] for p in layers[1]]
    try:
        model = hull(points, 'Convex parallel-layer join')
    except (ValueError, ArithmeticError, np.linalg.LinAlgError) as exc:
        raise GeometryError('Layer join defining 4D hull failed: ' + str(exc)) from exc
    _measure_gate(model)
    hull_evidence = deepcopy(model['provenance'])
    output_to_input = list(hull_evidence['extremeInputIndices'])
    input_to_output = [None] * len(points)
    for output_id, input_id in enumerate(output_to_input):
        if model['vertices'][output_id] != points[input_id]:
            raise GeometryError('Layer hull changed a selected source coordinate.')
        input_to_output[input_id] = output_id
    nonextreme = [i for i, v in enumerate(input_to_output) if v is None]
    if nonextreme:
        raise GeometryError('Numerical layer hull dropped selected convex source vertices; refusing unresolved source maps.')
    edge_lookup = {tuple(sorted(edge)): i for i, edge in enumerate(model['edges'])}
    face_lookup = {tuple(canonical_cycle(face)): i for i, face in enumerate(model['faces'])}
    cell_vertices = [set(v for f in cell for v in model['faces'][f]) for cell in model['cells']]
    face_colors = [None] * len(model['faces'])
    layer_records = []
    offset = 0
    for index, source in enumerate((base, top)):
        vertex_map = input_to_output[offset:offset + len(source['vertices'])]
        edge_map, face_map = [], []
        for edge in source.get('edges', []):
            target = edge_lookup.get(tuple(sorted(vertex_map[v] for v in edge)))
            if target is None:
                raise GeometryError('Layer join failed to retain a selected source edge.')
            edge_map.append(target)
        colors = _colors(source, 'faces')
        for face_id, face in enumerate(source.get('faces', [])):
            target = face_lookup.get(tuple(canonical_cycle([vertex_map[v] for v in face])))
            if target is None:
                raise GeometryError('Layer join failed to retain a selected ordered source face.')
            face_map.append(target); face_colors[target] = deepcopy(colors[face_id])
        caps = [i for i, ids in enumerate(cell_vertices) if ids == set(vertex_map)] if dimensions[index] == 3 else []
        if dimensions[index] == 3 and (len(caps) != 1 or set(model['cells'][caps[0]]) != set(face_map)):
            raise GeometryError('Layer join 3D cap incidence does not match the complete selected shell.')
        snapshot = deepcopy(source)
        layer_records.append({'role': 'base' if index == 0 else 'top', 'dimension': dimensions[index],
                              'sourceModelId': source['id'], 'sourceFingerprint': identity(source) if dimensions[index] >= 2 else None,
                              'sourceSnapshot': snapshot, 'sourceSnapshotSha256': hashlib.sha256(_json_bytes(snapshot, MAX_PAYLOAD_BYTES)).hexdigest(),
                              'predicateEvidence': source_evidence[index], 'transform': transforms[index],
                              'inputPointIds': list(range(offset, offset + len(vertex_map))),
                              'maps': {'vertices': vertex_map, 'edges': edge_map, 'faces': face_map, 'cells': []},
                              'capCellIds': caps})
        offset += len(source['vertices'])
    base_count = len(base['vertices'])
    evidence = {'algorithmVersion': VERSION, 'definition': 'convex hull of two explicit parallel layers',
                'height': height, 'layers': layer_records, 'selectedCoordinates': points,
                'inputToOutputVertexIds': input_to_output, 'outputToInputPointIds': output_to_input,
                'outputVertexSources': [{'role': 'base' if i < base_count else 'top',
                                         'sourceVertexId': i if i < base_count else i - base_count} for i in output_to_input],
                'nonextremeInputPointIds': nonextreme,
                'resourceBounds': {'inputVertices': MAX_INPUT_VERTICES, 'payloadBytes': MAX_PAYLOAD_BYTES},
                'colorPolicy': 'retain matched source faces; lateral faces and output cells uncolored; full source attributes retained in snapshots',
                'scope': 'approximate convex join only; no strict, uniform, crossed, gyro or Stella preset certification'}
    model['metadata'] = {'family': 'Convex layer join', 'convexLayerJoin': evidence,
                         'offColors': {'faces': face_colors, 'cells': [None] * len(model['cells'])}}
    model['provenance'] = {'operation': 'convex-layer-join', 'algorithmVersion': VERSION, 'height': height,
                           'hull': hull_evidence, 'sourceSnapshotSha256': [r['sourceSnapshotSha256'] for r in layer_records]}
    _json_bytes(model, MAX_PAYLOAD_BYTES)
    return _native_gate(model)


def analyze_strict_segmentotope(model, tolerance=TOLERANCE):
    """Approximate two-layer/common-sphere/equal-edge/regular-face predicates.

    Never an exact or uniformity certificate. Does not modify the Model.
    """
    tolerance = _number(tolerance, 'analysis tolerance', 1e-4)
    if not 1e-12 <= tolerance <= 1e-4:
        raise GeometryError('Strict layer analysis tolerance must be between 1e-12 and 1e-4.')
    result = {'status': 'unsupported', 'strictPredicatesPassed': False, 'certified': False,
              'algorithmVersion': VERSION, 'numeric': {'mode': 'float64-approximate', 'tolerance': tolerance},
              'sourceModelId': None, 'sourceFingerprint': None, 'checks': {}, 'diagnostics': [],
              'scope': 'numerical published strict predicates only; not an exact or uniformity proof'}
    def reject(status, message):
        result['status'] = status; result['diagnostics'].append({'message': message}); return result
    try:
        if type(model) is not dict or type(model.get('vertices')) is not list or len(model['vertices']) > MAX_INPUT_VERTICES:
            return reject('unsupported', 'Strict predicate input vertex budget exceeded or source malformed.')
        _bounded_json(model)
        dimension, embedding, _, _ = _check_source(model)
        if (dimension, embedding) != (4, 4):
            return reject('unsupported', 'Strict layer predicates require an intrinsic 4D source.')
        result['sourceModelId'] = model.get('id'); result['sourceFingerprint'] = identity(model)
        convex = analyze_convex_boundary(model)
        if convex['status'] != 'passed':
            return reject('unsupported', 'The complete ordered convex boundary is not independently verified.')
        points = np.asarray(model['vertices'], dtype=float)
        origin = points[0].copy(); scale = float(np.max(np.ptp(points, axis=0)))
        q = (points - origin) / scale
        # Generated layers are explicitly parallel in w; this does not search
        # for undocumented alternate layer partitions of arbitrary 4D solids.
        low, high = float(np.min(q[:, 3])), float(np.max(q[:, 3]))
        layer_distance = np.minimum(np.abs(q[:, 3] - low), np.abs(q[:, 3] - high))
        layers_ok = high - low > tolerance and float(np.max(layer_distance)) <= tolerance
        result['checks']['twoParallelLayers'] = {'passed': layers_ok, 'normalizedResidual': float(np.max(layer_distance)),
                                                'normalizedLayerLevels': [low, high]}
        lengths = np.asarray([np.linalg.norm(q[a] - q[b]) for a, b in model['edges']])
        edge_mean = float(np.mean(lengths))
        edge_residual = float(np.max(np.abs(lengths - edge_mean))) / edge_mean
        edges_ok = edge_mean > tolerance and edge_residual <= tolerance
        result['checks']['equalEdges'] = {'passed': edges_ok, 'relativeResidual': edge_residual, 'normalizedMeanLength': edge_mean}
        a = 2 * (q[1:] - q[0]); b = np.sum(q[1:] ** 2, axis=1) - np.sum(q[0] ** 2)
        center, _, rank, _ = np.linalg.lstsq(a, b, rcond=tolerance)
        radii = np.linalg.norm(q - center, axis=1); radius = float(np.mean(radii))
        sphere_residual = float(np.max(np.abs(radii - radius))) / radius if radius else float('inf')
        sphere_ok = rank == 4 and radius > tolerance and sphere_residual <= tolerance
        result['checks']['commonHypersphere'] = {'passed': sphere_ok, 'relativeResidual': sphere_residual,
                                                'normalizedCenter': center.tolist(), 'normalizedRadius': radius,
                                                'coordinateFrame': {'origin': origin.tolist(), 'scale': scale}}
        face_evidence = []
        for face_id, cycle in enumerate(model['faces']):
            p = q[cycle]; directions = np.roll(p, -1, axis=0) - p
            sides = np.linalg.norm(directions, axis=1)
            side_mean = float(np.mean(sides))
            side_residual = float(np.max(np.abs(sides - side_mean))) / side_mean
            # The ordered sequence is already independently convex verified.
            # Regular turns have cos(2pi/n), not merely an equal side set.
            units = directions / sides[:, None]
            angle_residual = float(np.max(np.abs(np.sum(units * np.roll(units, -1, axis=0), axis=1) - math.cos(2 * math.pi / len(cycle)))))
            face_center = np.mean(p, axis=0); circle = np.linalg.norm(p - face_center, axis=1)
            circle_mean = float(np.mean(circle)); circle_residual = float(np.max(np.abs(circle - circle_mean))) / circle_mean
            regular = side_residual <= tolerance and angle_residual <= tolerance and circle_residual <= tolerance
            face_evidence.append({'sourceFaceId': face_id, 'passed': regular, 'sideRelativeResidual': side_residual,
                                  'turnCosineResidual': angle_residual, 'circleRelativeResidual': circle_residual})
        faces_ok = all(f['passed'] for f in face_evidence)
        result['checks']['orderedRegularFaces'] = {'passed': faces_ok, 'faces': face_evidence}
        passed = layers_ok and edges_ok and sphere_ok and faces_ok
        result['strictPredicatesPassed'] = passed; result['status'] = 'passed' if passed else 'not-strict'
        if not passed:
            result['diagnostics'].append({'message': 'At least one approximate strict defining predicate failed; the broader convex join remains valid.'})
        _json_bytes(result, MAX_PAYLOAD_BYTES)
        return result
    except (ValueError, ArithmeticError, np.linalg.LinAlgError) as exc:
        return reject('invalid', 'Strict segmentotope predicate could not be resolved: ' + str(exc))
