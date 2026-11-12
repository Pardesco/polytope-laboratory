"""Numerical qualification for disjoint convex-boundary fitting sources."""

from collections import Counter

import numpy as np
from scipy.optimize import linprog

from engine.geometry import GeometryError
from engine.geometric_fitting import _qualify

DOMAIN = 'disjoint-convex-boundaries-3d'
SEPARATION_TOLERANCE = 1e-7


def component_maps(source):
    n = len(source['vertices'])
    graph = [set() for _ in range(n)]
    for a, b in source['edges']:
        graph[a].add(b)
        graph[b].add(a)
    remaining = set(range(n))
    maps = []
    while remaining:
        reached = {min(remaining)}
        todo = list(reached)
        while todo:
            for v in graph[todo.pop()] - reached:
                reached.add(v)
                todo.append(v)
        remaining -= reached
        ids = sorted(reached)
        edges = [i for i, e in enumerate(source['edges']) if e[0] in reached]
        faces = [i for i, f in enumerate(source['faces']) if f[0] in reached]
        if len(ids) < 4 or not faces or any(not set(source['faces'][i]) <= reached for i in faces):
            raise GeometryError('Generalized fitting needs closed convex components without leftover strata.')
        counts = Counter(
            tuple(sorted((a, b)))
            for i in faces
            for a, b in zip(source['faces'][i], source['faces'][i][1:] + source['faces'][i][:1])
        )
        if set(counts) != {tuple(sorted(source['edges'][i])) for i in edges} or any(v != 2 for v in counts.values()):
            raise GeometryError('Generalized fitting needs exactly two component faces per edge.')
        maps.append({'vertexIds': ids, 'edgeIds': edges, 'faceIds': faces})
    if not 2 <= len(maps) <= 8:
        raise GeometryError(
            'Generalized fitting supports 2–8 disjoint convex 3D components only; connected nonconvex/star boundaries are unsupported.'
        )
    return maps


def qualify_components(source, p, maps, checkpoint=lambda: None):
    reports = []
    for ci, row in enumerate(maps):
        checkpoint()
        ids = row['vertexIds']
        local = {v: i for i, v in enumerate(ids)}
        piece = {
            'dimension': 3,
            'embeddingDimension': 3,
            'interpretation': 'convex-polytope',
            'vertices': p[ids].tolist(),
            'edges': [[local[v] for v in source['edges'][i]] for i in row['edgeIds']],
            'faces': [[local[v] for v in source['faces'][i]] for i in row['faceIds']],
            'cells': [],
            'numeric': {'mode': 'float64-approximate', 'certified': False},
        }
        try:
            _qualify(piece, p[ids].mean(axis=0))
        except GeometryError as error:
            raise GeometryError('Generalized fitting component ' + str(ci) + ': ' + str(error)) from error
        reports.append({'componentId': ci, **row, 'supportingBoundaryVerified': True})
    separations = []
    for i, a in enumerate(maps):
        for j in range(i + 1, len(maps)):
            checkpoint()
            left = p[a['vertexIds']]
            right = p[maps[j]['vertexIds']]
            # Maximize an L-infinity-bounded separating normal's margin.
            matrix = np.r_[
                np.c_[left, -np.ones(len(left)), np.zeros(len(left))],
                np.c_[-right, np.ones(len(right)), np.ones(len(right))],
            ]
            result = linprog(
                [0, 0, 0, 0, -1],
                A_ub=matrix,
                b_ub=np.zeros(len(matrix)),
                bounds=[(-1, 1)] * 3 + [(None, None), (0, None)],
                method='highs',
            )
            if not result.success:
                raise GeometryError('Generalized component separation is numerically unresolved.')
            axis = result.x[:3]
            norm = float(np.linalg.norm(axis))
            gap = float(np.min(right @ axis) - np.max(left @ axis)) / norm if norm > 0 else 0.0
            if gap <= SEPARATION_TOLERANCE:
                raise GeometryError(
                    'Generalized fitting components touch, intersect, contain one another, or have unresolved separation (component '
                    + str(i)
                    + ', '
                    + str(j)
                    + ').'
                )
            separations.append({'components': [i, j], 'axis': (axis / norm).tolist(), 'gapMeanEdgeUnits': gap})
    return {
        'domain': DOMAIN,
        'components': reports,
        'separations': separations,
        'separationToleranceMeanEdgeUnits': SEPARATION_TOLERANCE,
        'certified': False,
        'definition': 'component supporting convex boundaries and strictly separating planes; float64 predicates',
    }
