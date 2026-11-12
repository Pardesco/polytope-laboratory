"""Bounded numerical full-symmetry element types; never infer types from shape alone."""

from collections import Counter
import numpy as np
from .geometry import GeometryError, identity
from .symmetry import geometric_symmetry
from .analysis_cache import AnalysisCache

LIMITS = {'vertices': 256, 'entities': 8192, 'incidence': 32768, 'frames': 20000}
_cache = AnalysisCache(max_entries=4)
FIELDS = {'vertex': 'vertices', 'edge': 'edges', 'face': 'faces', 'cell': 'cells'}


def components(model):
    parent = list(range(len(model['vertices'])))

    def root(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for a, b in model['edges']:
        a, b = root(a), root(b)
        if a != b:
            parent[b] = a
    return len({root(i) for i in range(len(parent))})


def description(model, kind, index):
    if kind == 'vertex':
        return 'vertex'
    if kind == 'edge':
        return 'edge'
    if kind == 'face':
        n = len(model['faces'][index])
        return {3: 'triangle', 4: 'quadrilateral', 5: 'pentagon', 6: 'hexagon', 8: 'octagon', 10: 'decagon'}.get(
            n, f'{n}-gon'
        )
    faces = model['cells'][index]
    vertices = {v for f in faces for v in model['faces'][f]}
    histogram = Counter(len(model['faces'][f]) for f in faces)
    boundary = ', '.join(f'{count} {sides}-gons' for sides, count in sorted(histogram.items()))
    return f'{len(vertices)} vertices, {len(faces)} faces ({boundary})'


def _compute(query):
    model = query['model']
    orientation = query['orientation']
    result = {
        'available': False,
        'complete': False,
        'numericMode': 'float64-approximate',
        'orientation': orientation,
        'limits': dict(LIMITS),
        'types': None,
        'componentCount': None,
    }
    if not isinstance(model, dict) or any(not isinstance(model.get(f), list) for f in FIELDS.values()):
        raise GeometryError('Element types require source vertices, edges, faces and cells.')
    from .star_uniform4 import native_star_evidence

    evidence = native_star_evidence(model)
    if evidence is not None:
        result['nativeCellInventory'] = evidence.pop('cellTypes')
        result['nativeStarEvidence'] = evidence
    if (
        len(model['vertices']) > LIMITS['vertices']
        or sum(len(model[f]) for f in FIELDS.values()) > LIMITS['entities']
        or sum(len(row) for f in ('edges', 'faces', 'cells') for row in model[f]) > LIMITS['incidence']
    ):
        return {**result, 'status': 'Unavailable: element-type resource limits exceeded.'}
    try:
        group = geometric_symmetry(model, max_frames=query['max_frames'], orientation=orientation)
    except GeometryError as exc:
        return {**result, 'status': 'Unavailable: ' + str(exc)}
    result.update(
        sourceFingerprint=identity(model),
        componentCount=components(model),
        status=group['status'],
        tolerance=group['tolerance'],
        candidateFramesEvaluated=group['candidateFramesEvaluated'],
        termination=group['termination'],
        method=group['method'],
        symmetryAlgorithmVersion=group['algorithmVersion'],
    )
    if not group['complete']:
        return result
    points = np.asarray(model['vertices'], dtype=float)
    points = (points - points.mean(axis=0)) / np.max(np.ptp(points, axis=0))
    residual = max(
        float(np.max(np.linalg.norm(points @ np.asarray(a['matrix']).T - points[a['permutation']], axis=1)))
        for a in group['actions']
    )
    types = {}
    for kind, orbits in group['entityOrbits'].items():
        types[kind] = [
            dict(
                o,
                typeId=i,
                count=o['size'],
                representative=o['ids'][0],
                description=description(model, kind, o['ids'][0]),
            )
            for i, o in enumerate(orbits)
        ]
    labels = []
    for kind, alias in [('vertex', 'isogonal'), ('edge', 'isotoxal'), ('face', 'isohedral'), ('cell', None)]:
        if len(types[kind]) == 1:
            labels.append(kind + '-transitive' + (f' ({alias})' if alias and model['dimension'] == 3 else ''))
    return {
        **result,
        'available': True,
        'complete': True,
        'types': types,
        'groupOrder': group['order'],
        'transitivity': labels,
        'maxNormalizedVertexResidual': residual,
        'closureVerified': True,
    }


def element_types(model, orientation='all', max_frames=20000):
    if orientation not in ('all', 'proper'):
        raise GeometryError('Element-type orientation is all or proper.')
    if type(max_frames) is not int or not 1 <= max_frames <= LIMITS['frames']:
        raise GeometryError('Element types support 1–20,000 candidate frames.')
    return _cache.resolve({'model': model, 'orientation': orientation, 'max_frames': max_frames}, _compute)
