"""Independent convex snubs from proper Coxeter rotation orbits.

Solve equal squared distances from a positive chamber seed to the three
pairwise mirror products, then exhaust the finite rotational orbit. The
coordinate convention labels the two enantiomorphs A/B, not absolute handedness.
"""
from collections import deque, Counter
import math
import numpy as np
from scipy.optimize import root
from .geometry import hull, GeometryError


def snub(family='B3', enantiomorph='A'):
    if family not in ('B3', 'H3') or enantiomorph not in ('A', 'B'):
        raise GeometryError('Snub families are B3/H3; choose enantiomorph A or B.')
    m = 4 if family == 'B3' else 5
    gram = np.eye(3)
    gram[0, 1] = gram[1, 0] = -math.cos(math.pi / m)
    gram[1, 2] = gram[2, 1] = -.5
    normals = np.linalg.cholesky(gram)
    mirrors = [np.eye(3) - 2 * np.outer(n, n) for n in normals]
    rotations = [mirrors[a] @ mirrors[b] for a, b in ((0, 1), (1, 2), (0, 2))]

    def residual(log_weights):
        seed = np.linalg.solve(normals, [1, *np.exp(log_weights)])
        squared = [float(np.linalg.norm(r @ seed - seed)**2) for r in rotations]
        return [(squared[i] - squared[2]) / squared[2] for i in (0, 1)]

    solved = root(residual, [0, 0], tol=1e-11)
    error = float(np.max(np.abs(residual(solved.x))))
    if not solved.success or not np.isfinite(solved.x).all() or error > 1e-10:
        raise GeometryError('The positive snub seed did not converge to the uniform edge constraints.')
    weights = np.asarray([1, *np.exp(solved.x)])
    seed = np.linalg.solve(normals, weights)
    seed /= np.linalg.norm(rotations[0] @ seed - seed)
    expected = 24 if family == 'B3' else 60
    vertices, queue, seen = [seed], deque([seed]), {tuple(np.round(seed, 9))}
    while queue:
        point = queue.popleft()
        for rotation in rotations:
            image = rotation @ point
            key = tuple(np.round(image, 9))
            if key in seen:
                continue
            if len(vertices) >= expected:
                raise GeometryError('Snub orbit exceeded the independently known finite group order.')
            seen.add(key)
            vertices.append(image)
            queue.append(image)
    if len(vertices) != expected:
        raise GeometryError('Snub rotational orbit failed to exhaust the expected vertex set.')
    points = np.asarray(vertices)
    if enantiomorph == 'B':
        points[:, 0] *= -1
    name = 'Snub cube' if family == 'B3' else 'Snub dodecahedron'
    result = hull(points, name + ' (' + enantiomorph + ')', {
        'family': 'Archimedean', 'chiral': True, 'enantiomorph': enantiomorph,
        'enantiomorphConvention': 'B reflects coordinate x of A; no absolute left/right convention claimed',
        'source': 'Positive equal-edge seed and complete proper Coxeter rotation orbit',
        'redistribution': 'Original generated geometry', 'faceRegularity': 'regular convex polygons'
    })
    lengths = [np.linalg.norm(points[a] - points[b]) for a, b in result['edges']]
    expected_faces = {3: 32, 4: 6} if family == 'B3' else {3: 80, 5: 12}
    if Counter(map(len, result['faces'])) != expected_faces or max(abs(x - 1) for x in lengths) > 1e-8:
        raise GeometryError('Snub orbit did not realize the expected uniform convex boundary.')
    result['provenance'] = {
        'operation': 'snub-rotational-orbit', 'algorithmVersion': '0.5.0',
        'parameters': {'family': family, 'enantiomorph': enantiomorph},
        'mirrorGram': gram.tolist(), 'positiveChamberWeights': weights.tolist(),
        'equalEdgeRelativeResidual': error, 'orbitCompleteWithinFiniteGroup': True,
        'orbitSize': len(vertices), 'referenceEdgeLength': 1,
        'reference': 'https://arxiv.org/abs/1006.3149',
        'numericContract': 'float64 nonlinear solve and finite orbit; not an algebraic certificate'
    }
    return result
