"""Numerical height fitting for explicitly positioned convex layer sources."""
from copy import deepcopy
import math

from .geometry import GeometryError
from .segmentotopes import (convex_layer_join, analyze_strict_segmentotope,
                            _native_gate, _bounded_json)

TOLERANCE = 1e-8


def fit_strict_layer_join(base, top, *, top_matrix=None, top_translation=None,
                          base_matrix=None, base_translation=None):
    """Solve positive separation; require all strict predicates afterwards.

    An invertible scaling of W preserves the defining convex join incidence.
    Its lateral edges have squared length |delta XYZ|^2 + height^2. Therefore
    one separation can match every edge only when the actual lateral XYZ
    distances agree and both layer boundaries already have the same edge size.
    No orientation, translation, scale or crossed incidence is guessed.
    """
    if type(base) is not dict or not base.get('edges') or not base.get('vertices'):
        raise GeometryError('Strict height fitting requires a 3D base with actual edges.')
    _bounded_json(base)
    try:
        a, b = base['edges'][0]
        target = math.dist(base['vertices'][a], base['vertices'][b])
    except (TypeError, ValueError, IndexError, KeyError, OverflowError) as exc:
        raise GeometryError('Strict height fitting requires a valid finite base edge.') from exc
    if not math.isfinite(target) or target <= 0:
        raise GeometryError('Strict height fitting requires a positive finite base edge.')
    transforms = dict(top_matrix=top_matrix, top_translation=top_translation,
                      base_matrix=base_matrix, base_translation=base_translation)
    trial = convex_layer_join(base, top, target, **transforms)
    info = trial['metadata']['convexLayerJoin']
    owner = info['outputVertexSources']
    layer_edges, lateral_edges = [], []
    for edge_id, (a, b) in enumerate(trial['edges']):
        p, q = trial['vertices'][a], trial['vertices'][b]
        if owner[a]['role'] == owner[b]['role']:
            layer_edges.append((edge_id, math.dist(p[:3], q[:3])/target))
        else:
            lateral_edges.append((edge_id, math.dist(p[:3], q[:3])/target))
    if not layer_edges or not lateral_edges:
        raise GeometryError('Strict height fitting could not resolve both layer and lateral edges.')
    layer_residual = max(abs(length-1) for _, length in layer_edges)
    lateral_ratio = lateral_edges[0][1]
    lateral_residual = max(abs(length-lateral_ratio) for _, length in lateral_edges)
    if not all(math.isfinite(v) for v in (layer_residual, lateral_ratio, lateral_residual)):
        raise GeometryError('Strict height fitting exceeds finite precision.')
    if layer_residual > TOLERANCE:
        raise GeometryError('A height change cannot match unequal edges within the source layers.')
    if lateral_residual > TOLERANCE:
        raise GeometryError('A height change cannot match differing lateral XYZ distances; adjust the explicit top orientation or position.')
    # Factored difference avoids loss from squaring close ratios separately.
    squared_height_ratio = (1-lateral_ratio)*(1+lateral_ratio)
    if squared_height_ratio <= TOLERANCE*TOLERANCE:
        raise GeometryError('No resolved positive height can match these lateral edges to the base edge.')
    height = target*math.sqrt(squared_height_ratio)
    if not math.isfinite(height) or height <= 0:
        raise GeometryError('Strict fitted height is not a positive finite number.')
    result = convex_layer_join(base, top, height, **transforms)
    strict = analyze_strict_segmentotope(result, tolerance=TOLERANCE)
    if strict['status'] != 'passed' or strict['strictPredicatesPassed'] is not True:
        raise GeometryError('Matching edge lengths did not satisfy all numerical strict predicates; no strict join was committed.')
    evidence = {'algorithmVersion':'0.1.0', 'method':'solve common lateral XYZ distance against actual base edge',
        'targetEdgeLength':target, 'resolvedPositiveHeight':height,
        'layerEdgeRelativeResidual':layer_residual,
        'lateralXYRelativeResidual':lateral_residual,
        'lateralXYToTargetRatio':lateral_ratio,
        'layerEdgeCount':len(layer_edges), 'lateralEdgeCount':len(lateral_edges),
        'strictPredicateEvidence':deepcopy(strict), 'certified':False,
        'scope':'approximate positive height fit with supplied XYZ positioning; no automatic orientation, uniformity or Stella preset equivalence'}
    result['metadata']['strictLayerFit'] = evidence
    result['provenance']['operation'] = 'fit-strict-layer-join'
    _bounded_json(result)
    return _native_gate(result)
