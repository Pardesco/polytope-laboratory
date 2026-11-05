"""Numerical source symmetry directions, bounded to canonical feature directions in 4D."""
import math
import numpy as np
from .geometry import GeometryError, identity, points_array
from .symmetry import geometric_symmetry
from .measurements import entity_frame
from .view_orientation import orient_entity
from .analysis_cache import analysis_cache


def _report(query):
    model = query['model']
    d = model.get('dimension')
    if d not in (3, 4) or model.get('embeddingDimension', d) != d or len(model.get('vertices', [])) > 256:
        raise GeometryError('Symmetry orientation requires full-dimensional 3D/4D sources with at most 256 vertices.')
    if sum(len(model.get(k, [])) for k in ('vertices', 'edges', 'faces', 'cells')) > 8192:
        raise GeometryError('Symmetry orientation exceeds 8,192 source entities.')
    group = geometric_symmetry(model, max_frames=20000)
    if not group['complete']:
        raise GeometryError('Symmetry orientation requires an exhausted group search; resource limit reached.')
    matrices = np.asarray([a['matrix'] for a in group['actions']])
    points = points_array(model['vertices'])
    center = points.mean(axis=0)
    choices = []
    residual = 0.
    if d == 3:
        for action in group['actions']:
            if action['determinant'] != 1:
                continue
            matrix = np.asarray(action['matrix'])
            if np.max(np.abs(matrix - np.eye(3))) < 1e-7:
                continue
            _, _, vt = np.linalg.svd(matrix - np.eye(3))
            axis = vt[-1]
            if next((x for x in axis if abs(x) > 1e-8), 1) < 0:
                axis = -axis
            permutation = action['permutation']; seen = set(); order = 1
            for i in range(len(permutation)):
                j = i; length = 0
                while j not in seen:
                    seen.add(j); length += 1; j = permutation[j]
                if length:
                    order = math.lcm(order, length)
            error = float(np.linalg.norm(matrix @ axis - axis)); residual = max(residual, error)
            existing = next((c for c in choices if abs(np.dot(c['direction'], axis)) > 1 - 1e-8), None)
            if existing:
                existing['order'] = max(existing['order'], order)
            else:
                choices.append({'direction': axis.tolist(), 'order': order})
        choices = [c for c in choices if c['order'] in (2, 3, 4, 5)]
        choices.sort(key=lambda c: (-c['order'], tuple(round(x, 8) for x in c['direction'])))
        for i, c in enumerate(choices):
            c.update(id=str(i), label=f"{c['order']}-fold axis {i+1}")
        definition = 'maximal proper rotation order about each unoriented source axis; orders 2, 3, 4 and 5'
    else:
        # One representative per complete source orbit exhausts equivalent feature directions.
        for kind in ('cell', 'vertex', 'face', 'edge'):
            for orbit in group['entityOrbits'][kind]:
                entity = {'kind': kind, 'index': orbit['ids'][0]}
                frame = entity_frame(model, entity, points)
                direction = (np.eye(d) - frame['basis'] @ frame['basis'].T) @ ((frame['origin'] - center) / frame['scale'])
                length = np.linalg.norm(direction)
                if length < 1e-7:
                    continue
                direction /= length
                errors = np.linalg.norm(matrices @ direction - direction, axis=1)
                fixed = errors < 1e-7
                order = int(np.sum(fixed))
                residual = max(residual, float(np.max(errors[fixed])))
                choices.append({'id': f'{kind}-{entity["index"]}', 'label': f'{kind}-first {entity["index"]} · projected group order {order}',
                                'entity': entity, 'direction': direction.tolist(), 'order': order})
        definition = 'order of the full source orthogonal group fixing the signed projection direction; maximum among perpendicular radial vertex/edge/face/cell directions, one representative per orbit; ties prefer cell, vertex, face, edge'
    if not choices:
        raise GeometryError('This source has no supported noncentral symmetry directions.')
    best = max(choices, key=lambda c: c['order'])
    q = (points-center) / np.max(np.ptp(points, axis=0))
    vertex_residual = max(float(np.max(np.linalg.norm(q @ np.asarray(a['matrix']).T-q[a['permutation']], axis=1))) for a in group['actions'])
    return {'choices': choices, 'greatest': best['id'], 'definition': definition, 'groupOrder': group['order'],
            'complete': True, 'sourceFingerprint': identity(model), 'numericMode': 'float64-approximate',
            'maximumAxisResidual': residual, 'maximumNormalizedVertexResidual': vertex_residual}


def symmetry_orientation(model, choice=None):
    report = analysis_cache.resolve({'model': model}, _report)
    if choice is None:
        return report
    if type(choice) is not str:
        raise GeometryError('Choose a listed symmetry direction or greatest.')
    selected = next((c for c in report['choices'] if c['id'] == (report['greatest'] if choice == 'greatest' else choice)), None)
    if selected is None:
        raise GeometryError('Choose a listed source symmetry direction.')
    report['selected'] = selected
    if model['dimension'] == 4:
        report['frame'] = orient_entity(model, selected['entity'])
    return report
