"""Topology-preserving, bounded approximate condition fitting and deviations."""

from copy import deepcopy
import json
import math

import numpy as np
from scipy.optimize import least_squares

from engine.geometry import GeometryError, identity, validate
from engine.geometric_fitting import LIMITS, VERSION, _clone, _digest, _number, _qualify

CONDITIONS = ('regular-faces', 'planar-faces', 'equal-edges', 'equal-areas')


def _cloud_residual(p, rank):
    q = p - p.mean(axis=0)
    basis = np.linalg.svd(q, full_matrices=False)[2][:rank]
    return q - q @ basis.T @ basis


def _areas(p, faces):
    # Norm of the polygon's oriented bivector; agrees with planar polygon area.
    values = []
    for face in faces:
        q = p[face] - p[face].mean(axis=0)
        r = np.roll(q, -1, axis=0)
        values.append(
            math.sqrt(
                sum(
                    float(np.sum(q[:, i] * r[:, j] - q[:, j] * r[:, i])) ** 2
                    for i in range(p.shape[1])
                    for j in range(i + 1, p.shape[1])
                )
            )
            / 2
        )
    return np.asarray(values)


def condition_arrays(p, edges, faces, selected=None):
    lengths = np.linalg.norm(p[edges[:, 0]] - p[edges[:, 1]], axis=1)
    mean = max(float(lengths.mean()), 1e-15)
    local = []
    angles = []
    chords = []
    planar = []
    chosen = set(range(len(faces)) if selected is None else selected)
    for fi, face in enumerate(faces):
        q = p[face]
        n = len(face)
        side = np.linalg.norm(q - np.roll(q, -1, axis=0), axis=1)
        plan = _cloud_residual(q, 2).ravel() / mean
        planar.extend(plan)
        if fi not in chosen:
            continue
        face_mean = max(float(side.mean()), 1e-15)
        local.extend(side / face_mean - 1)
        a = np.roll(q, 1, axis=0) - q
        b = np.roll(q, -1, axis=0) - q
        cosine = np.sum(a * b, axis=1) / np.maximum(np.linalg.norm(a, axis=1) * np.linalg.norm(b, axis=1), 1e-30)
        angles.extend(np.arccos(np.clip(cosine, -1, 1)) - (n - 2) * math.pi / n)
        for i in range(n):
            for j in range(i + 1, n):
                chords.append(
                    float(np.linalg.norm(q[i] - q[j])) / face_mean
                    - math.sin(math.pi * (j - i) / n) / math.sin(math.pi / n)
                )
    areas = _areas(p, faces)
    area_mean = max(float(areas.mean()), 1e-30)
    return {
        'equal-edges': lengths / mean - 1,
        'equal-areas': areas / area_mean - 1,
        'planar-faces': np.asarray(planar),
        'face-edges': np.asarray(local),
        'face-angles': np.asarray(angles),
        'regular-faces': np.r_[local, np.asarray(angles) / math.pi, chords, planar],
    }


def _stats(values):
    return {
        'maximum': float(np.max(np.abs(values), initial=0)),
        'rms': float(np.sqrt(np.mean(values * values))) if len(values) else 0.0,
    }


def _source(source):
    original = _clone(source)
    generalized = (
        type(original) is dict
        and original.get('interpretation') == 'generalized-complex'
        and original.get('dimension') == 3
    )
    if (
        type(original) is not dict
        or type(original.get('dimension')) is not int
        or original['dimension'] not in (3, 4)
        or original.get('embeddingDimension', original['dimension']) != original['dimension']
        or not (original.get('interpretation') == 'convex-polytope' or generalized)
    ):
        raise GeometryError(
            'Condition fitting requires intrinsic convex 3D/4D incidence or disjoint convex 3D components; connected nonconvex/star domains are unsupported.'
        )
    if len(json.dumps(original).encode()) > LIMITS['sourceBytes']:
        raise GeometryError('Condition source exceeds 8 MiB.')
    d = original['dimension']
    for key in ('vertices', 'faces', 'cells'):
        if type(original.get(key)) is not list or len(original[key]) > LIMITS[key]:
            raise GeometryError('Condition source ' + key + ' exceeds its work bound.')
    if d == 3 and original['cells'] or d == 4 and not original['cells']:
        raise GeometryError('Condition source cells disagree with its dimension.')
    if type(original.get('edges')) is not list:
        raise GeometryError('Condition source requires literal edges.')
    if not d + 1 <= len(original['vertices']) <= LIMITS['vertices'] or not original['faces']:
        raise GeometryError('Condition fitting requires 4–64 vertices in 3D or 5–64 in 4D, with faces.')
    if any(
        type(row) is not list
        or len(row) != d
        or any(type(x) not in (int, float) or not math.isfinite(x) or abs(x) > 1e100 for x in row)
        for row in original['vertices']
    ):
        raise GeometryError('Condition fitting requires bounded finite literal coordinates.')
    if any(type(f) is not list or not 3 <= len(f) <= LIMITS['faceVertices'] for f in original['faces']):
        raise GeometryError('Condition faces require 3–32 vertices.')
    check = deepcopy(original)
    for key in ('facetEquations', 'facetVertices', 'rationalCoordinates', 'rationalFacetEquations'):
        check.pop(key, None)
    check['numeric'] = {'mode': 'float64-approximate', 'certified': False}
    errors = validate(check)['errors']
    # Warped starting faces/cells are precisely the defect this operation repairs.
    fatal = [
        e
        for e in errors
        if not (
            e.startswith('Face ')
            and e.endswith(' is not a planar polygon.')
            or e.startswith('Cell ')
            and e.endswith(' is not affine dimension 3.')
        )
    ]
    if fatal:
        raise GeometryError('Invalid condition source: ' + '; '.join(fatal))
    p = np.asarray(original['vertices'], dtype=float)
    edges = np.asarray(original['edges'], dtype=int)
    if not len(edges):
        raise GeometryError('Condition fitting needs source edges.')
    origin = p.mean(axis=0)
    scale = float(np.mean(np.linalg.norm(p[edges[:, 0]] - p[edges[:, 1]], axis=1)))
    if not math.isfinite(scale) or scale <= 1e-100:
        raise GeometryError('Condition source scale is unresolved.')
    q = (p - origin) / scale
    if np.max(np.abs(q)) > LIMITS['normalizedCoordinate']:
        raise GeometryError('Condition source coordinate bound exceeded.')
    distances = np.linalg.norm(q[:, None] - q[None, :], axis=2) + np.eye(len(q))
    if float(distances.min()) < 1e-8:
        raise GeometryError('Condition source has coincident or unresolved vertices.')
    if any(np.linalg.svd(q[f] - q[f].mean(axis=0), compute_uv=False)[1] < 1e-8 for f in original['faces']):
        raise GeometryError('Condition source has a degenerate face.')
    for cell in original['cells']:
        ids = sorted({v for f in cell for v in original['faces'][f]})
        if np.linalg.svd(q[ids] - q[ids].mean(axis=0), compute_uv=False)[2] < 1e-8:
            raise GeometryError('Condition source has a degenerate cell.')
    if generalized:
        from engine.condition_components import component_maps, qualify_components

        qualify_components(original, q, component_maps(original))
    return original, q, edges, origin, scale


def near_miss_deviation(source):
    original, p, edges, _, scale = _source(source)
    arrays = condition_arrays(p, edges, original['faces'])
    local = _stats(arrays['face-edges'])
    angles = _stats(arrays['face-angles'])
    planar = _stats(arrays['planar-faces'])
    return {
        'conditions': {key: _stats(arrays[key]) for key in CONDITIONS},
        'maximumEdgeDeviationPercent': 100 * _stats(arrays['equal-edges'])['maximum'],
        'maximumFaceEdgeDeviationPercent': 100 * local['maximum'],
        'maximumFaceAngleDeviationDegrees': math.degrees(angles['maximum']),
        'maximumPlanarity': planar['maximum'],
        'maximumPlanaritySourceUnits': planar['maximum'] * scale,
        'nearlyRegularFaces': local['maximum'] <= 0.05
        and angles['maximum'] <= math.radians(5)
        and planar['maximum'] <= 1e-4,
        'definition': 'edge deviations relative to mean; angles from regular n-gon; best-fit-plane coordinate residual / mean edge',
        'certified': False,
        'classificationEstablished': False,
    }


def _options(raw, source):
    allowed = {
        'mode',
        'objectives',
        'target',
        'face_ids',
        'max_evaluations',
        'residual_tolerance',
        'solver_tolerance',
        'keep_symmetry',
        'fix_scale',
    }
    if type(raw) is not dict or set(raw) - allowed:
        raise GeometryError('Unsupported condition fitting controls.')
    objectives = raw.get('objectives', [raw.get('mode', 'regular-faces')])
    if (
        type(objectives) is not list
        or not objectives
        or any(type(x) is not str or x not in CONDITIONS for x in objectives)
        or len(set(objectives)) != len(objectives)
    ):
        raise GeometryError('Select one or more distinct supported fitting objectives.')
    if 'mode' in raw and raw['mode'] not in CONDITIONS:
        raise GeometryError('Unsupported fitting mode.')
    selected = raw.get('face_ids')
    if selected is not None and (
        type(selected) is not list
        or not selected
        or any(type(i) is not int or not 0 <= i < len(source['faces']) for i in selected)
        or len(set(selected)) != len(selected)
        or 'regular-faces' not in objectives
    ):
        raise GeometryError('Select distinct source face IDs for regular-face fitting.')
    for key in ('keep_symmetry', 'fix_scale'):
        if key in raw and type(raw[key]) is not bool:
            raise GeometryError(key + ' must be boolean.')
    maximum = raw.get('max_evaluations', 100)
    if type(maximum) is not int or not 1 <= maximum <= LIMITS['evaluations']:
        raise GeometryError('Fitting evaluations must be an integer from 1 to 400.')
    target = raw.get('target')
    fix = raw.get('fix_scale', True)
    if target is not None:
        target = _number(target, 'Fitting target', 1e-100, 1e100)
        if fix or len(objectives) != 1 or objectives[0] not in ('equal-edges', 'equal-areas'):
            raise GeometryError('An explicit target requires one edge/area objective and Fix scale off.')
    return {
        'objectives': objectives,
        'face_ids': selected,
        'target': target,
        'fix_scale': fix,
        'keep_symmetry': raw.get('keep_symmetry', False),
        'max_evaluations': maximum,
        'residual_tolerance': _number(raw.get('residual_tolerance', 1e-7), 'Residual tolerance', 1e-10, 1e-3),
        'solver_tolerance': _number(raw.get('solver_tolerance', 1e-11), 'Solver tolerance', 1e-13, 1e-3),
    }


def _symmetry_basis(source, p):
    from engine.symmetry import geometric_symmetry

    if not validate(source)['passed']:
        raise GeometryError('Keep symmetry needs a planar valid source; turn it off to repair warped faces.')
    group = geometric_symmetry(source, max_frames=10000)
    if not group['complete'] or not group['closureVerified']:
        raise GeometryError('Source symmetry search did not close within 10,000 frames; turn Keep symmetry off.')
    n, d = p.shape
    projector = np.zeros((n * d, n * d))
    for action in group['actions']:
        matrix = np.asarray(action['matrix'])
        for i, j in enumerate(action['permutation']):
            projector[j * d : (j + 1) * d, i * d : (i + 1) * d] += matrix / len(group['actions'])
    values, vectors = np.linalg.eigh((projector + projector.T) / 2)
    basis = vectors[:, values > 1 - 1e-5]
    if not basis.shape[1]:
        raise GeometryError('Source symmetry-invariant coordinate space is unresolved.')
    return basis, {
        'order': group['order'],
        'complete': True,
        'invariantDimension': basis.shape[1],
        'scope': 'supplied source Euclidean symmetries; no intended higher symmetry inferred',
    }


class _Budget(Exception):
    pass


def fit_conditions(source, options=None, *, cancel=None):
    original, initial, edges, origin, scale = _source(source)
    raw = {} if options is None else options
    args = _options(raw, original)
    source_hash = _digest(original)
    options_hash = _digest(options)
    faces = original['faces']
    n, d = initial.shape
    components = None
    component_evidence = None
    if original['interpretation'] == 'generalized-complex':
        from engine.condition_components import component_maps, qualify_components

        components = component_maps(original)
        if args['keep_symmetry']:
            raise GeometryError('Keep symmetry is unsupported for generalized component fitting; turn it off.')
    if sum(len(f) * (len(f) - 1) // 2 for f in faces) > LIMITS['pairs']:
        raise GeometryError('Regular chord work exceeds 8192 pairs.')
    cells = [sorted({v for f in c for v in faces[f]}) for c in original['cells']] if d == 4 else []
    target = args['target']
    target = None if target is None else target / scale ** (2 if args['objectives'] == ['equal-areas'] else 1)
    basis, symmetry = _symmetry_basis(original, initial) if args['keep_symmetry'] else (None, {'enabled': False})

    def checkpoint(full=False):
        if cancel is not None and cancel():
            raise GeometryError('Condition fitting canceled; no model published.')
        if full and (_digest(source) != source_hash or _digest(options) != options_hash):
            raise GeometryError('Condition source or controls changed; no model published.')

    def coordinates(x):
        p = (x if basis is None else basis @ x).reshape((n, d))
        p = p - p.mean(axis=0)
        if components:
            p = p.copy()
            for row in components:
                ids = row['vertexIds']
                p[ids] += initial[ids].mean(axis=0) - p[ids].mean(axis=0)
        mean = float(np.mean(np.linalg.norm(p[edges[:, 0]] - p[edges[:, 1]], axis=1)))
        if components and args['fix_scale']:
            for row in components:
                ids = row['vertexIds']
                center = initial[ids].mean(axis=0)
                p[ids] = center + (p[ids] - center) / max(mean, 1e-15)
            return p
        return p / max(mean, 1e-15) if args['fix_scale'] else p

    def parts(p):
        arrays = condition_arrays(p, edges, faces, args['face_ids'])
        if target is not None:
            arrays[args['objectives'][0]] = (
                np.linalg.norm(p[edges[:, 0]] - p[edges[:, 1]], axis=1) / target - 1
                if args['objectives'] == ['equal-edges']
                else _areas(p, faces) / target - 1
            )
        return arrays

    # Face/cell planarity is always required for a publishable native boundary.
    # A small displacement preference chooses a nearby point in underdetermined fits.
    calls = 0
    best = initial.copy()
    best_energy = math.inf
    evaluations = 0

    def fun(x):
        nonlocal calls, best, best_energy
        checkpoint()
        calls += 1
        if calls > LIMITS['residualCalls']:
            raise _Budget()
        p = coordinates(x)
        arrays = parts(p)
        cell = np.concatenate([_cloud_residual(p[c], 3).ravel() for c in cells]) if cells else np.array([])
        objective = np.concatenate(
            [arrays[key] for key in args['objectives']]
            + [arrays['planar-faces'] * (100 if components else 10), cell * 10]
        )
        residual = np.r_[objective, 1e-9 * (p - initial).ravel()]
        energy = float(residual @ residual)
        if energy < best_energy:
            best_energy = energy
            best = p.copy()
        return residual

    x0 = initial.ravel() if basis is None else basis.T @ initial.ravel()
    termination = {'success': False, 'status': 0, 'message': 'residual-call limit', 'evaluations': 0}
    try:
        solved = least_squares(
            fun,
            x0,
            method='trf',
            tr_solver='lsmr',
            max_nfev=args['max_evaluations'],
            ftol=args['solver_tolerance'],
            xtol=args['solver_tolerance'],
            gtol=args['solver_tolerance'],
        )
        evaluations = int(solved.nfev)
        termination = {
            'success': bool(solved.success),
            'status': int(solved.status),
            'message': str(solved.message),
            'evaluations': evaluations,
        }
    except _Budget:
        evaluations = None
        termination['evaluations'] = None
    checkpoint(full=True)
    physical = origin + best * scale
    if components:
        best = (physical - origin) / scale
    before = parts(initial)
    after = parts(best)
    conditions = {
        key: {'before': _stats(before[key]), 'after': _stats(after[key])}
        for key in (*CONDITIONS, 'face-edges', 'face-angles')
    }
    cellmax = max((float(np.max(np.abs(_cloud_residual(best[c], 3)))) for c in cells), default=0)
    maximum = max(conditions[k]['after']['maximum'] for k in args['objectives'])
    objective = np.concatenate([after[k] for k in args['objectives']])
    tol = args['residual_tolerance']
    met = maximum <= tol and conditions['planar-faces']['after']['maximum'] <= tol and cellmax <= tol
    candidate = deepcopy(original)
    candidate['vertices'] = physical.tolist()
    for key in (
        'facetEquations',
        'facetVertices',
        'measure',
        'validation',
        'fingerprint',
        'rationalCoordinates',
        'rationalFacetEquations',
        'certificate',
    ):
        candidate.pop(key, None)
    candidate['numeric'] = {'mode': 'float64-approximate', 'certified': False, 'tolerance': 1e-8}
    diagnostics = []
    try:
        if np.max(np.abs(best)) > LIMITS['normalizedCoordinate']:
            raise GeometryError('Fitted coordinate bound exceeded.')
        if np.min(np.linalg.norm(best[:, None] - best[None, :], axis=2) + np.eye(n)) < 1e-8:
            raise GeometryError('Fitted vertices coincide.')
        if d == 3:
            for f in faces:
                a = initial[f]
                b = best[f]
                na = np.cross(a, np.roll(a, -1, axis=0)).sum(axis=0)
                nb = np.cross(b, np.roll(b, -1, axis=0)).sum(axis=0)
                if np.linalg.norm(nb) < 1e-8 or float(na @ nb) <= 0:
                    raise GeometryError('Fitted face is degenerate or its orientation flipped.')
        else:
            from scipy.linalg import qr

            for ids in cells:
                _, _, pivot = qr((initial[ids] - initial[ids[0]]).T, pivoting=True, mode='economic')
                selected = [ids[0]] + [ids[int(i)] for i in pivot[:3]]
                a = initial[selected[1:]] - initial[selected[0]]
                b = best[selected[1:]] - best[selected[0]]
                na = np.asarray([(-1) ** i * np.linalg.det(np.delete(a, i, axis=1)) for i in range(d)])
                nb = np.asarray([(-1) ** i * np.linalg.det(np.delete(b, i, axis=1)) for i in range(d)])
                if np.linalg.norm(nb) < 1e-8 or float(na @ nb) <= 0:
                    raise GeometryError('Fitted cell is degenerate or its orientation flipped.')
        if components:
            if not validate(candidate)['passed']:
                raise GeometryError('Literal fitted component boundary failed native validation.')
            component_evidence = qualify_components(candidate, best, components, checkpoint)
        else:
            _qualify(candidate, origin)
    except GeometryError as error:
        diagnostics.append(str(error))
    valid = not diagnostics
    residuals_met = bool(met)
    met = bool(met and valid)
    from engine.geometric_fitting import scipy

    evidence = {
        'algorithmVersion': VERSION,
        'sourceModelId': original.get('id'),
        'sourceFingerprint': identity(original),
        'sourceSnapshotSha256': source_hash,
        'parameters': args,
        'normalization': {'origin': origin.tolist(), 'meanEdgeLength': scale},
        'conditions': conditions,
        'residualDefinitions': {
            'edges': 'relative to mean edge (or explicit target)',
            'areas': 'relative to mean bivector area (or explicit target)',
            'face-angles': 'radians from regular n-gon interior angle',
            'planarity': 'best-fit-plane coordinate components / mean edge',
            'regular-faces': 'face-relative edges, angle/pi, regular chord ratios, and planarity',
        },
        'residuals': {
            'initialMaximum': max(conditions[k]['before']['maximum'] for k in args['objectives']),
            'maximum': maximum,
            'rms': _stats(objective)['rms'],
            'maximumPlanarity': conditions['planar-faces']['after']['maximum'],
            'maximumCellPlanarity': cellmax,
            'maximumAnchor': float(np.max(np.abs(best.mean(axis=0)))),
        },
        'solverTermination': termination,
        'iterations': evaluations,
        'iterationDefinition': 'least_squares function evaluations; internal iterations unavailable',
        'converged': bool(termination['success'] and met),
        'toleranceMet': met,
        'requestedConstraintsSatisfied': met,
        'geometricValidity': {
            'passed': valid,
            'diagnostics': diagnostics,
            'selfIntersectionCheck': 'component supporting convex boundaries and strict pairwise separating planes'
            if components
            else 'convex supporting facets and simple convex face cycles; no general mesh collision check',
        },
        'symmetry': symmetry,
        'work': {'residualCalls': calls, 'requestedEvaluations': args['max_evaluations']},
        'limits': dict(LIMITS),
        'backend': {'scipy': scipy.__version__, 'numpy': np.__version__, 'solver': 'least_squares/trf/lsmr/2-point'},
        'uniformityEstablished': False,
        'globalFeasibilityEstablished': False,
        'certified': False,
        'hullRepair': False,
    }
    if components:
        evidence['conditionResidualsSatisfied'] = residuals_met
        evidence['generalizedComponents'] = {
            'qualification': component_evidence,
            'maps': components,
            'centroidsPreserved': True,
            'scope': '2–8 disjoint convex 3D boundary components; no connected nonconvex/star boundary or solid-union claim',
        }
    status = (
        'invalid-realization'
        if not valid
        else 'constraints-satisfied'
        if met
        else 'stationary-residual'
        if termination['success']
        else 'work-limit'
    )
    if valid:
        candidate.update(
            id='fit-' + _digest({'source': source_hash, 'parameters': args, 'vertices': candidate['vertices']}),
            name='Fitted ' + original.get('name', 'source'),
            provenance={
                'operation': 'geometry-fit',
                'algorithmVersion': VERSION,
                'sourceModelId': original.get('id'),
                'sourceSnapshotSha256': source_hash,
                'parameters': args,
                'convexified': False,
            },
        )
        metadata = original.get('metadata', {})
        candidate['metadata'] = {'geometryFitting': deepcopy(evidence), 'sourceMetadata': deepcopy(metadata)}
        for key in ('coordinateUnits', 'offColors'):
            if key in metadata:
                candidate['metadata'][key] = deepcopy(metadata[key])
        candidate['fingerprint'] = identity(candidate)
        candidate['validation'] = validate(candidate)
    checkpoint(full=True)
    return {
        'status': status,
        'model': candidate if valid else None,
        'evidence': evidence,
        'preview': None if valid else {'vertices': candidate['vertices'], 'publishable': False},
        'certified': False,
    }
