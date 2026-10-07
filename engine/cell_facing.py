"""Source-preserving convex 4D facet facing in a normalized display frame."""
import numpy as np

from .geometry import GeometryError, TOLERANCE, identity, points_array, validate

VERSION = 'cell-facing-1'
MAX_SOURCE_VERTICES = 20000
MAX_SOURCE_INCIDENCES = 1000000
MAX_CELLS = 10000
MAX_SUPPORT_TESTS = 8000000
MAX_CELL_VERTEX_VISITS = 1000000


def _vector(value, description, unit=False):
    try:
        value = np.asarray(value, dtype=float)
    except (ValueError, TypeError) as exc:
        raise GeometryError(description + ' must be numeric.') from exc
    if value.shape != (4,) or not np.isfinite(value).all():
        raise GeometryError(description + ' must be a finite four-component display vector.')
    if unit:
        magnitude = np.max(np.abs(value))
        if not magnitude:
            raise GeometryError(description + ' must be nonzero.')
        value = value / magnitude
        value /= np.linalg.norm(value)
    return value


def _matrix(value):
    if value is None:
        return np.eye(4)
    try:
        value = np.asarray(value, dtype=float)
    except (ValueError, TypeError) as exc:
        raise GeometryError('Display matrix must be numeric.') from exc
    if value.shape != (4, 4) or not np.isfinite(value).all():
        raise GeometryError('Display matrix must be a finite 4 by 4 SO(4) frame.')
    with np.errstate(over='ignore', invalid='ignore'):
        orthogonality = value @ value.T
    if not np.isfinite(orthogonality).all() or not np.allclose(orthogonality, np.eye(4), atol=1e-8, rtol=0) or abs(np.linalg.det(value) - 1) > 1e-8:
        raise GeometryError('Display matrix must be orthogonal with determinant +1 within 1e-8.')
    return value.copy()


def classify_cells(model, projection='orthographic', matrix=None, eye=None,
                   direction=None, grazing_tolerance=1e-8):
    """Classify complete convex source 3-cells as front, back or grazing.

    q = (p - vertex_mean) / max_vertex_radius; displayed q = matrix @ q.
    Parallel direction points toward the observer, not into the model.
    Finite eyes are expressed in these normalized display coordinates.
    """
    if not isinstance(model, dict) or model.get('dimension') != 4 or model.get('embeddingDimension', 4) != 4:
        raise GeometryError('Cell facing requires an intrinsic 4D source.')
    if model.get('interpretation') != 'convex-polytope':
        raise GeometryError('Cell facing supports validated convex 4D sources only; generalized cells need explicit source-orientation semantics.')
    if projection not in ('orthographic', 'perspective', 'stereographic'):
        raise GeometryError('Cell facing projection is orthographic, perspective or stereographic.')
    if type(grazing_tolerance) not in (int, float) or not np.isfinite(grazing_tolerance) or not 0 < grazing_tolerance <= 1e-3:
        raise GeometryError('Grazing tolerance must be finite, positive and at most 1e-3.')
    rotation = _matrix(matrix)
    if projection == 'orthographic':
        if eye is not None:
            raise GeometryError('A parallel observer uses direction, not a finite eye.')
        observer_vector = _vector([0., 0., 0., 1.] if direction is None else direction, 'Parallel observer direction', unit=True)
        observer = {'kind': 'parallel', 'direction': observer_vector.tolist()}
        band = float(grazing_tolerance)
    else:
        if direction is not None:
            raise GeometryError('A perspective observer uses a finite eye, not a parallel direction.')
        default_w = 3. if projection == 'perspective' else 1.
        observer_vector = _vector([0., 0., 0., default_w] if eye is None else eye, 'Observer eye')
        largest = max(1., float(np.max(np.abs(observer_vector))))
        with np.errstate(over='ignore', invalid='ignore'):
            magnitude = largest * np.linalg.norm(observer_vector / largest)
        if not np.isfinite(magnitude):
            raise GeometryError('Observer eye magnitude exceeds finite arithmetic.')
        observer = {'kind': 'finite-eye', 'eye': observer_vector.tolist(), 'projection': projection}
        band = float(grazing_tolerance * max(1., magnitude))
    if any(not isinstance(model.get(field, []), list) for field in ('vertices', 'edges', 'faces', 'cells')) or any(not isinstance(item, list) for field in ('edges', 'faces', 'cells') for item in model.get(field, [])):
        raise GeometryError('Source coordinate and incidence tables must be lists.')
    count = len(model.get('cells', []))
    incidences = sum(len(f) for f in model.get('faces', [])) + sum(len(c) for c in model.get('cells', [])) + 2 * len(model.get('edges', []))
    if len(model.get('vertices', [])) > MAX_SOURCE_VERTICES or incidences > MAX_SOURCE_INCIDENCES or count > MAX_CELLS or count * len(model.get('vertices', [])) > MAX_SUPPORT_TESTS:
        raise GeometryError('Cell facing exceeds the explicit source/support resource limit.')
    # Bound nested cell-face traversal before existing validation or SVD work.
    visits = 0
    faces = model.get('faces', [])
    for cell in model.get('cells', []):
        for face in cell:
            if type(face) is not int or not 0 <= face < len(faces):
                raise GeometryError('Cell has invalid source face IDs.')
            visits += len(faces[face])
            if visits > MAX_CELL_VERTEX_VISITS:
                raise GeometryError('Cell facing exceeds the explicit cell-vertex traversal resource limit.')
    report = validate(model)
    if not report['passed']:
        raise GeometryError('Cannot classify invalid convex source incidence: ' + '; '.join(report['errors']))
    points = points_array(model['vertices'])
    with np.errstate(over='ignore', invalid='ignore'):
        center = points.mean(axis=0)
        relative = points - center
        radius = float(np.max(np.linalg.norm(relative, axis=1)))
    if not np.isfinite(center).all() or not np.isfinite(radius) or radius <= 0:
        raise GeometryError('Source center/radius normalization is numerically unresolved.')
    q = relative / radius
    if np.linalg.matrix_rank(q, tol=TOLERANCE) != 4 or not count:
        raise GeometryError('Cell facing requires full affine rank 4 and complete source cells.')
    records = []
    for cell_id, cell in enumerate(model['cells']):
        ids = sorted({v for f in cell for v in faces[f]})
        centroid = q[ids].mean(axis=0)
        _, singular, vt = np.linalg.svd(q[ids] - centroid, full_matrices=False)
        if np.sum(singular > TOLERANCE) != 3:
            raise GeometryError(f'Cell {cell_id} has unresolved supporting-hyperplane rank.')
        normal = vt[-1]
        offset = float(normal @ centroid)
        if offset < 0:
            normal = -normal
            offset = -offset
        residual = q @ normal - offset
        support_band = TOLERANCE * 8
        if offset <= support_band or np.max(residual) > support_band or np.max(np.abs(residual[ids])) > support_band:
            raise GeometryError(f'Cell {cell_id} is not a resolved outward supporting hyperplane of the complete source.')
        support_ids = np.flatnonzero(np.abs(residual) <= support_band).tolist()
        if support_ids != ids:
            raise GeometryError(f'Cell {cell_id} does not contain every source vertex on its supporting hyperplane.')
        displayed_normal = rotation @ normal
        if projection == 'orthographic':
            signed = float(displayed_normal @ observer_vector)
        else:
            # Scaled arithmetic avoids unnecessary intermediate overflow.
            eye_scale = max(1., float(np.max(np.abs(observer_vector))))
            signed = float((displayed_normal @ (observer_vector / eye_scale) - offset / eye_scale) * eye_scale)
        source_offset = float(normal @ center + radius * offset)
        if not np.isfinite(signed) or not np.isfinite(source_offset):
            raise GeometryError('Cell facing plane/observer arithmetic exceeds finite precision.')
        facing = 'front' if signed > band else 'back' if signed < -band else 'grazing'
        records.append({'cell': cell_id, 'sourceVertexIds': ids, 'facing': facing,
                        'signedFacing': signed,
                        'sourcePlane': {'normal': normal.tolist(), 'offset': source_offset},
                        'normalizedPlane': {'normal': normal.tolist(), 'offset': offset},
                        'displayPlane': {'normal': displayed_normal.tolist(), 'offset': offset}})
    masks = {kind: [record['facing'] == kind for record in records] for kind in ('front', 'back', 'grazing')}
    return {'sourceCellIds': list(range(count)), 'cells': records, 'masks': masks,
            **{kind + 'CellIds': [i for i, active in enumerate(masks[kind]) if active] for kind in masks},
            'observer': observer, 'matrix': rotation.tolist(), 'classificationTolerance': band,
            'normalization': {'center': center.tolist(), 'radius': radius,
                              'definition': 'source vertex arithmetic mean and maximum Euclidean vertex radius'},
            'definition': 'outward supporting-normal dot direction toward observer; finite eye additionally subtracts normalized plane offset',
            'sourceFingerprint': identity(model), 'diagnostics': list(report['warnings']),
            'numericMode': 'float64-approximate', 'algorithmVersion': VERSION}
