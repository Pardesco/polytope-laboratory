"""Source-preserving selected-entity SO(4) display frames.

First puts the selected outward/radial direction at +W; Last at -W. These
are observation frames, not intrinsic model transformations or symmetry claims.
"""
from copy import deepcopy
import numpy as np

from .geometry import GeometryError, TOLERANCE, identity, points_array, validate
from .measurements import entity_frame

VERSION = 'entity-frame-1'
MAX_SOURCE_VERTICES = 20000
MAX_SOURCE_INCIDENCES = 1000000
MAX_ENTITY_VERTICES = 512


def _unit(value, description):
    try:
        value = np.asarray(value, dtype=float)
    except (TypeError, ValueError) as exc:
        raise GeometryError(description + ' must be numeric.') from exc
    if value.shape != (4,) or not np.isfinite(value).all() or not np.any(value):
        raise GeometryError(description + ' must be a finite nonzero intrinsic 4D vector.')
    value = value / np.max(np.abs(value))
    return value / np.linalg.norm(value)


def _entity_size(model, entity):
    if not isinstance(entity, dict):
        raise GeometryError('Choose a source entity or explicit source-vertex flat.')
    kind, index = entity.get('kind'), entity.get('index')
    field = {'vertex': 'vertices', 'edge': 'edges', 'face': 'faces', 'cell': 'cells'}.get(kind)
    if field:
        if type(index) is not int or not 0 <= index < len(model.get(field, [])):
            raise GeometryError('Source entity index is outside this model.')
        if kind == 'vertex':
            return 1
        if kind == 'cell':
            return len({v for f in model['cells'][index] for v in model['faces'][f]})
        return len(model[field][index])
    return len(entity.get('vertices', [])) if isinstance(entity.get('vertices'), list) else 0


def _append_vector(rows, candidate):
    candidate = candidate.copy()
    # Reorthogonalize once to retain stable constraints for nearly aligned data.
    for _ in range(2):
        for row in rows:
            candidate -= row * (row @ candidate)
    length = np.linalg.norm(candidate)
    if length <= TOLERANCE * 8:
        return False
    rows.append(candidate / length)
    return True


def _reference_roll(matrix, reference, dimension):
    try:
        reference = np.asarray(reference, dtype=float)
    except (TypeError, ValueError) as exc:
        raise GeometryError('Reference display matrix must be numeric.') from exc
    if reference.shape != (4, 4) or not np.isfinite(reference).all() or not np.allclose(reference @ reference.T, np.eye(4), atol=1e-8, rtol=0) or abs(np.linalg.det(reference) - 1) > 1e-8:
        raise GeometryError('Reference display matrix must be a finite SO(4) frame.')
    # Closest reference within proper rotations of the two spatial blocks:
    # selected entity span and its remaining spatial complement. W stays fixed.
    for start, stop in ((0, dimension), (dimension, 3)):
        if stop - start < 2:
            continue
        block = matrix[start:stop]
        u, _, vt = np.linalg.svd(reference[start:stop] @ block.T)
        correction = np.eye(stop - start)
        correction[-1, -1] = np.linalg.det(u @ vt)
        matrix[start:stop] = (u @ correction @ vt) @ block
    return matrix


def orient_entity(model, entity, mode='first', direction=None, reference_matrix=None):
    """Return a row-major matrix for column-vector display ``R @ (p-center)``.

    Source entities vertex/edge/face/cell and measured line/plane/hyperplane
    descriptors are accepted. All frames use finite full-rank 4D source data.
    Centered entities need an explicit perpendicular direction to choose a view.
    """
    if mode not in ('first', 'last'):
        raise GeometryError('Entity display direction is first or last; automatic symmetry orientation is not inferred.')
    if model.get('dimension') != 4 or model.get('embeddingDimension', 4) != 4:
        raise GeometryError('Entity-first/last display frames require an intrinsic 4D source.')
    if any(not isinstance(model.get(field, []), list) for field in ('vertices', 'edges', 'faces', 'cells')) or any(not isinstance(item, list) for field in ('edges', 'faces', 'cells') for item in model.get(field, [])):
        raise GeometryError('Source coordinate and incidence tables must be lists.')
    if len(model.get('vertices', [])) > MAX_SOURCE_VERTICES or sum(len(f) for f in model.get('faces', [])) + sum(len(c) for c in model.get('cells', [])) + 2 * len(model.get('edges', [])) > MAX_SOURCE_INCIDENCES:
        raise GeometryError('Entity orientation exceeds the explicit source resource limit.')
    if not validate(model)['passed']:
        raise GeometryError('Cannot orient invalid source incidence.')
    if _entity_size(model, entity) > MAX_ENTITY_VERTICES:
        raise GeometryError('Entity orientation exceeds the selected-entity vertex resource limit.')
    points = points_array(model['vertices'])
    frame = entity_frame(model, entity, points)
    center = points.mean(axis=0)
    q = (points - center) / frame['scale']
    if int(np.sum(np.linalg.svd(q, compute_uv=False) > TOLERANCE)) != 4:
        raise GeometryError('Source coordinates do not span full affine dimension 4.')
    dimension = frame['dimension']
    if dimension >= 4:
        raise GeometryError('A full-dimensional measured item has no perpendicular observation direction.')
    projector = np.eye(4) - frame['basis'] @ frame['basis'].T
    radial = (frame['origin'] - center) / frame['scale']
    perpendicular = projector @ radial
    centered = np.linalg.norm(perpendicular) <= TOLERANCE * 8
    if direction is not None:
        supplied = _unit(direction, 'Explicit observation direction')
        normal = projector @ supplied
        if np.linalg.norm(normal) <= TOLERANCE * 8:
            raise GeometryError('Explicit observation direction lies in the selected entity span.')
        normal /= np.linalg.norm(normal)
        if not centered:
            facing = normal @ radial
            if abs(facing) <= TOLERANCE * 8:
                raise GeometryError('Explicit direction does not point toward the selected entity; use its radial direction.')
            if facing < 0:
                normal = -normal
        policy = 'supplied direction projected perpendicular to entity; oriented toward its centroid when noncentral'
    elif centered:
        raise GeometryError('Selected entity has no nonzero radial perpendicular direction; supply an explicit intrinsic direction.')
    else:
        normal = perpendicular / np.linalg.norm(perpendicular)
        policy = 'source vertex-mean to entity centroid, projected perpendicular to entity span'

    support = None
    if entity.get('kind') == 'cell' and model.get('interpretation') == 'convex-polytope':
        plane_point = (frame['origin'] - center) / frame['scale']
        residual = (q - plane_point) @ normal
        if centered or np.max(residual) > TOLERANCE * 8:
            raise GeometryError('Selected convex cell is not an outward supporting hyperplane of the complete source.')
        policy = 'outward normal of selected convex source cell, checked against every source vertex'
        support = {'normal': normal.tolist(), 'offset': float(normal @ frame['origin']),
                   'definition': 'n dot p <= offset in intrinsic source coordinates'}

    # Choose roll from source ID order, not arbitrary coordinate-axis choices
    # or SVD signs in repeated singular subspaces. All candidates are intrinsic.
    entity_rows = []
    for vertex in sorted(frame['vertices']):
        _append_vector(entity_rows, frame['basis'] @ (frame['basis'].T @ ((points[vertex] - frame['origin']) / frame['scale'])))
        if len(entity_rows) == dimension:
            break
    if len(entity_rows) != dimension:
        raise GeometryError('Cannot resolve a stable intrinsic frame for the selected entity.')
    spatial = list(entity_rows)
    excluded = [normal] + spatial
    for candidate in q:
        if len(spatial) == 3:
            break
        if _append_vector(excluded, candidate):
            spatial.append(excluded[-1])
    if len(spatial) != 3:
        raise GeometryError('Cannot resolve the observation roll from the full source geometry.')
    sign = 1 if mode == 'first' else -1
    matrix = np.asarray(spatial + [sign * normal])
    if np.linalg.det(matrix) < 0:
        matrix[2] *= -1
    roll_policy = 'source-ID ordered intrinsic Gram-Schmidt; third spatial row fixes positive determinant'
    if reference_matrix is not None:
        matrix = _reference_roll(matrix, reference_matrix, dimension)
        roll_policy = 'closest reference in proper entity-span/complement spatial block rotations'
    determinant = float(np.linalg.det(matrix))
    orthogonality_error = float(np.max(np.abs(matrix @ matrix.T - np.eye(4))))
    direction_error = float(np.linalg.norm(matrix @ normal - np.array([0., 0., 0., sign])))
    span_error = float(np.max(np.abs(matrix[dimension:, :] @ frame['basis']))) if dimension else 0.
    if orthogonality_error > 1e-8 or abs(determinant - 1) > 1e-8 or direction_error > 1e-8 or span_error > 1e-8:
        raise GeometryError('Observation frame failed its numerical SO(4) or selected-span checks.')
    return {'matrix': matrix.tolist(), 'center': center.tolist(), 'sourceDirection': normal.tolist(),
            'targetDirection': [0., 0., 0., float(sign)], 'mode': mode, 'entity': deepcopy(entity),
            'sourceVertexIds': list(frame['vertices']), 'affineDimension': dimension,
            'entityCentroid': frame['origin'].tolist(),
            'displayEntityCentroid': (matrix @ (frame['origin'] - center)).tolist(),
            'centeredEntity': bool(centered), 'directionPolicy': policy, 'rollPolicy': roll_policy,
            'supportingPlane': support, 'sourceFingerprint': identity(model),
            'matrixConvention': 'row-major; display column = matrix @ (source column - center)',
            'numericMode': 'float64-approximate', 'algorithmVersion': VERSION,
            'checks': {'determinant': determinant, 'orthogonalityError': orthogonality_error,
                       'directionResidual': direction_error, 'selectedSpanResidual': span_error}}
