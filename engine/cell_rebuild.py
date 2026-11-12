"""Literal two-cell union in one 3-flat; exterior cycles are never hulled."""

from copy import deepcopy
import hashlib
import math
import uuid

import numpy as np
from scipy.spatial import ConvexHull, QhullError

from .compounds import _check_source, _colors, _payload_size
from .generalized_concave_cell_nets import qualify_cell_shells
from .generalized_nets import _shell_geometry
from .geometry import GeometryError, TOLERANCE, identity, validate
from .history import _json_bytes

VERSION = '0.1.0'
EPS = 1e-8
OP = 'rebuild-coplanar-cells'


def _require(condition, message):
    if not condition:
        raise GeometryError('Coplanar cell reconstruction: ' + message)


def _convex_shell(points, faces):
    ids = sorted({v for f in faces for v in f})
    mapping = {v: i for i, v in enumerate(ids)}
    cycles = [[mapping[v] for v in f] for f in faces]
    edges = sorted({tuple(sorted(e)) for f in cycles for e in zip(f, f[1:] + f[:1])})
    local = {
        'dimension': 3,
        'embeddingDimension': 3,
        'interpretation': 'generalized-complex',
        'vertices': points[ids].tolist(),
        'edges': [list(e) for e in edges],
        'faces': cycles,
        'cells': [],
    }
    _, normals, _ = _shell_geometry(local)
    p = points[ids]
    span = float(np.max(np.ptp(p, axis=0)))
    q = (p - p.mean(axis=0)) / span
    areas = [float(np.linalg.norm(np.sum(np.cross(q[f], np.roll(q[f], -1, axis=0)), axis=0))) / 2 for f in cycles]
    volume = math.fsum(float(q[f[0]] @ n) * a / 3 for f, n, a in zip(cycles, normals, areas))
    _require(abs(volume) > EPS**2, 'cell has unresolved content.')
    normals = [n * (1 if volume > 0 else -1) for n in normals]
    residual = max(float(np.max((q - q[f[0]]) @ n)) for f, n in zip(cycles, normals))
    _require(residual <= EPS, 'union must be convex; a boundary face does not support all joined vertices.')
    try:
        reference = ConvexHull(q)
    except QhullError as error:
        raise GeometryError('Coplanar cell reconstruction: unresolved convex content.') from error
    error = abs(abs(volume) - float(reference.volume))
    _require(error <= EPS * max(1.0, reference.volume), 'boundary content disagrees with its convex support check.')
    return abs(volume) * span**3, residual, error


def rebuild_cells(source, cell_ids=None, color_policy='require-equal'):
    _check_source(source)
    _require(
        source.get('dimension') == 4 and source.get('embeddingDimension', 4) == 4,
        'choose an intrinsic 4D cell boundary.',
    )
    _require(bool(source.get('cells')), 'source must contain complete cells in a closed 4D boundary.')
    _require(
        len(source['vertices']) <= 256 and len(source['faces']) <= 128 and len(source['cells']) <= 32,
        'limit is 256 vertices, 128 faces and 32 cells.',
    )
    _require(
        type(cell_ids) is list
        and len(cell_ids) == 2
        and all(type(i) is int and 0 <= i < len(source['cells']) for i in cell_ids)
        and len(set(cell_ids)) == 2,
        'choose exactly two distinct literal cell IDs.',
    )
    _require(color_policy in ('require-equal', 'first-source'), 'choose require-equal or first-source cell colors.')
    selected = sorted(cell_ids)
    a, b = selected
    qualification = qualify_cell_shells(source)
    _require(all(qualification['cells'][i]['convexBoundary'] for i in selected), 'both source cells must be convex.')
    shared = sorted(set(source['cells'][a]) & set(source['cells'][b]))
    _require(
        len(shared) == 1, 'cells must share exactly one complete literal face; coordinate coincidence is not welded.'
    )
    seam = shared[0]
    _require(
        [i for i, c in enumerate(source['cells']) if seam in c] == selected, 'shared face has an outside cell owner.'
    )
    p = np.asarray(source['vertices'], dtype=float)
    span = float(np.max(np.ptp(p, axis=0)))
    q = (p - p.mean(axis=0)) / span
    ids = sorted({v for i in selected for f in source['cells'][i] for v in source['faces'][f]})
    origin = q[ids].mean(axis=0)
    _, singular, axes = np.linalg.svd(q[ids] - origin, full_matrices=False)
    _require(singular[2] > EPS and singular[3] <= EPS, 'selected cells must occupy one resolved 3D hyperplane in 4D.')
    residual = float(np.max(np.abs((q[ids] - origin) @ axes[3])))
    local = (q - origin) @ axes[:3].T
    contents = [_convex_shell(local, [source['faces'][f] for f in source['cells'][i]])[0] for i in selected]
    boundary = sorted((set(source['cells'][a]) | set(source['cells'][b])) - {seam})
    content, support_error, volume_error = _convex_shell(local, [source['faces'][f] for f in boundary])
    content_error = abs(content - math.fsum(contents))
    _require(content_error <= EPS * max(1.0, content), 'cells overlap or their union content is unresolved.')
    colors = _colors(source, 'cells')
    _require(
        color_policy != 'require-equal' or colors[a] == colors[b],
        'cell colors differ; explicitly choose first-source to use the lower source cell ID color.',
    )
    keep = [i for i in range(len(source['faces'])) if i != seam]
    face_map = [None] * len(source['faces'])
    for i, f in enumerate(keep):
        face_map[f] = i
    cells = []
    cell_map = []
    cell_sources = []
    for i, c in enumerate(source['cells']):
        if i == b:
            cell_map.append(cell_map[a])
            continue
        cell_map.append(len(cells))
        cell_sources.append(selected if i == a else [i])
        cells.append([face_map[f] for f in (boundary if i == a else c)])
    evidence = {
        'schemaVersion': 1,
        'scenarioId': 'con-10-4d-cell-rebuild',
        'sourceFingerprint': identity(source),
        'selectedCellIds': selected,
        'removedFaceIds': [seam],
        'mergedCellId': cell_map[a],
        'sourceMaps': {
            'vertices': list(range(len(p))),
            'edges': list(range(len(source['edges']))),
            'faces': face_map,
            'cells': cell_map,
        },
        'faceSources': keep,
        'cellSources': cell_sources,
        'cellColorSources': [group[0] for group in cell_sources],
        'colorPolicy': color_policy,
        'sourceCellContents': [c * span**3 for c in contents],
        'joinedCellContent': content * span**3,
        'contentResidual': content_error * span**3,
        'hyperplaneResidual': residual * span,
        'relativeSupportResidual': support_error,
        'relativeHullContentResidual': volume_error,
        'relativeTolerance': EPS,
        'definition': 'two convex 3-cells sharing one complete face in one 3-flat; literal exterior cycles retained',
        'contentDefinition': 'intrinsic 3D cell volume; no global 4D filled-volume assertion',
        'coordinatePolicy': 'no weld, averaging, new vertices, face blending or exterior cycle replacement',
        'annotationPolicy': 'unique unchanged exterior elements retain content; changed cells and removed seam retain detached source content with notes/units',
        'certified': False,
    }
    metadata = {
        'cellRebuild': evidence,
        'offColors': {
            'faces': deepcopy([_colors(source, 'faces')[f] for f in keep]),
            'cells': deepcopy([colors[group[0]] for group in cell_sources]),
        },
    }
    if 'coordinateUnits' in source.get('metadata', {}):
        metadata['coordinateUnits'] = deepcopy(source['metadata']['coordinateUnits'])
    params = {'cell_ids': selected, 'color_policy': color_policy}
    result = {
        'id': str(uuid.uuid5(uuid.NAMESPACE_URL, hashlib.sha256(_json_bytes([identity(source), params])).hexdigest())),
        'name': source.get('name', 'Model') + ' · joined cells',
        'dimension': 4,
        'embeddingDimension': 4,
        'interpretation': 'generalized-complex',
        'vertices': deepcopy(source['vertices']),
        'edges': deepcopy(source['edges']),
        'faces': deepcopy([source['faces'][f] for f in keep]),
        'cells': cells,
        'metadata': metadata,
        'numeric': {'mode': 'float64-approximate', 'tolerance': TOLERANCE, 'certified': False},
        'provenance': {
            'operation': OP,
            'algorithmVersion': VERSION,
            'sourceModelId': source['id'],
            'sourceFingerprint': identity(source),
            'parameters': params,
        },
    }
    result['validation'] = validate(result)
    _require(result['validation']['passed'], 'rebuilt incidence failed validation.')
    qualify_cell_shells(result)
    result['fingerprint'] = identity(result)
    _require(_payload_size(result) <= 8 * 1024 * 1024, 'result exceeds 8 MiB.')
    return result


def dispatch_cell_rebuild(request):
    params = request.get('params', {})
    _require(type(params) is dict and not set(params) - {'cell_ids', 'color_policy'}, 'unsupported options.')
    result = rebuild_cells(request.get('model'), **params)
    if request['op'] == OP + '-preview':
        return {'model': result, 'construction': deepcopy(result['metadata']['cellRebuild'])}
    return result
