"""Independent numerical hull oracle for closed convex 4D morph samples.

This script imports no morph topology or incidence helpers. Qhull supplies
maximal supporting sets; their rank-two intersections supply polygon cycles.
It is verification only, never the production construction.
"""

from collections import Counter, defaultdict
from itertools import combinations
import numpy as np
from scipy.spatial import ConvexHull


def cycle_key(face):
    values = tuple(face)
    return min(seq[i:] + seq[:i] for seq in (values, values[::-1]) for i in range(len(seq)))


def audit(model, tolerance=1e-7):
    points = np.asarray(model['vertices'], dtype=float)
    points = (points - points.mean(axis=0)) / np.max(np.ptp(points, axis=0))
    hull = ConvexHull(points)
    assert set(hull.vertices) == set(range(len(points))), 'Interior/nonextreme or duplicate morph vertex.'
    equations = np.unique(np.round(hull.equations, 9), axis=0)
    facets = set()
    maximum = 0.0
    for first in range(0, len(equations), 128):
        batch = equations[first : first + 128]
        residuals = points @ batch[:, :-1].T + batch[:, -1]
        maximum = max(maximum, float(np.max(residuals)))
        for values in residuals.T:
            facets.add(frozenset(np.flatnonzero(np.abs(values) < tolerance)))
    assert maximum < tolerance, 'Hull support residual exceeds tolerance.'
    supplied = {frozenset(v for f in cell for v in model['faces'][f]) for cell in model['cells']}
    assert len(supplied) == len(model['cells']) and supplied == facets, 'Complete maximal hull facets differ.'
    facets = list(facets)
    postings = defaultdict(list)
    for i, facet in enumerate(facets):
        for v in facet:
            postings[v].append(i)
    pairs = set(pair for ids in postings.values() for pair in combinations(ids, 2))
    polygons = set()
    for a, b in pairs:
        ids = sorted(facets[a] & facets[b])
        if len(ids) < 3:
            continue
        cloud = points[ids] - points[ids[0]]
        _, singular, vt = np.linalg.svd(cloud, full_matrices=False)
        if singular[1] <= tolerance or len(singular) > 2 and singular[2] > tolerance:
            continue
        order = ConvexHull(cloud @ vt[:2].T).vertices
        polygons.add(cycle_key([ids[i] for i in order]))
    assert polygons == {cycle_key(f) for f in model['faces']}, 'Complete ordered hull faces differ.'
    edges = {tuple(sorted((a, b))) for face in polygons for a, b in zip(face, face[1:] + face[:1])}
    assert edges == {tuple(sorted(e)) for e in model['edges']}, 'Complete hull edges differ.'
    ridges = Counter(f for cell in model['cells'] for f in cell)
    assert set(ridges) == set(range(len(model['faces']))) and set(ridges.values()) == {2}
    for cell in model['cells']:
        boundary = Counter(
            tuple(sorted((a, b)))
            for f in cell
            for a, b in zip(model['faces'][f], model['faces'][f][1:] + model['faces'][f][:1])
        )
        vertices = {v for f in cell for v in model['faces'][f]}
        assert set(boundary.values()) == {2} and len(vertices) - len(boundary) + len(cell) == 2
    return {
        'certified': False,
        'oracle': 'SciPy Qhull maximal supports and rank-two intersections',
        'counts': [len(points), len(edges), len(polygons), len(facets)],
        'maximumNormalizedHullSupportViolation': maximum,
        'tolerance': tolerance,
    }
