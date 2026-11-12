"""Twisted polygonal torus with explicit triangular surface incidence."""

from collections import Counter
from copy import deepcopy
import math
import numpy as np
from .geometry import GeometryError, TOLERANCE, identity, validate
from .torus import polyhedral_torus


def twisted_torus(n, m, ratio, radius, colors, twist):
    model = polyhedral_torus(n, m, ratio, radius, face_colors=colors)
    if 4 * abs(twist) >= n * m:
        raise GeometryError(
            'Twist per ring segment must be less than a quarter arm turn; increase segment counts or reduce twist.'
        )
    vertices = []
    for i in range(n):
        u = math.tau * i / n
        for j in range(m):
            v = math.tau * (j + twist * i / n) / m
            vertices.append(
                [
                    radius * (1 + ratio * math.cos(v)) * math.cos(u),
                    radius * (1 + ratio * math.cos(v)) * math.sin(u),
                    radius * ratio * math.sin(v),
                ]
            )

    def index(i, j):
        return (i % n) * m + (j + (i // n) * twist) % m

    faces = []
    for i in range(n):
        for j in range(m):
            a, b, c, d = index(i, j), index(i + 1, j), index(i + 1, j + 1), index(i, j + 1)
            faces.extend([[a, b, c], [a, c, d]])
    edges = sorted({tuple(sorted((a, b))) for face in faces for a, b in zip(face, face[1:] + face[:1])})
    incidence = Counter(tuple(sorted((a, b))) for face in faces for a, b in zip(face, face[1:] + face[:1]))
    directed = Counter((a, b) for face in faces for a, b in zip(face, face[1:] + face[:1]))
    if (
        len(edges) != 3 * n * m
        or any(v != 2 for v in incidence.values())
        or any(directed[a, b] != 1 or directed[b, a] != 1 for a, b in edges)
    ):
        raise GeometryError('Twisted torus seam failed orientable manifold incidence checks.')
    points = np.asarray(vertices) / radius
    points /= np.max(np.ptp(points, axis=0))
    minimum = min(float(np.linalg.svd(points[face] - points[face[0]], compute_uv=False)[1]) for face in faces)
    if minimum <= 4 * TOLERANCE:
        raise GeometryError('Twisted torus triangle rank is unresolved at normalized float64 tolerance.')
    model.update(
        name=f'Twisted triangular torus {n} × {m} (twist {twist} arm steps)',
        vertices=vertices,
        edges=[list(e) for e in edges],
        faces=faces,
    )
    parameters = model['provenance']['parameters']
    parameters['twist'] = twist
    model['provenance']['definition'] = (
        'Triangulated polygonal ring torus with total twist in arm-vertex steps; seam (n,j)=(0,j+twist). No embeddedness or filled-volume assertion.'
    )
    info = model['metadata']['polyhedralTorus']
    info['parameters']['twist'] = twist
    info['maps']['edges'] = [{'vertexIds': list(e)} for e in edges]
    info['maps']['faces'] = [
        {'ringIndex': i, 'armIndex': j, 'triangle': k} for i in range(n) for j in range(m) for k in range(2)
    ]
    info.update(
        edgeIndexDefinition='lexicographically sorted undirected triangular boundaries',
        faceIndexDefinition='two triangles per grid tile in ring/arm order',
        vertexIndexDefinition='i*m+j; seam advances arm index by twist',
        twistDefinition='v=2*pi*(j+twist*i/n)/m; twist counts arm steps over one ring circuit',
    )
    info['topology']['vertexLink'] = 'simple six-edge cycle'
    info['geometricEvidence'] = {
        'minimumNormalizedTriangleSecondSingularValue': minimum,
        'selfIntersectionsChecked': False,
    }
    model['numeric']['algorithm'] = 'analytic twisted ring coordinates and direct periodic triangular incidence'
    if colors is not None:
        model['metadata']['offColors']['faces'] = [
            deepcopy(c) for c in model['metadata']['offColors']['faces'] for _ in range(2)
        ]
    report = validate(model)
    if not report['passed']:
        raise GeometryError('Twisted torus validation failed: ' + '; '.join(report['errors']))
    model['validation'], model['fingerprint'] = report, identity(model)
    info['sourceFingerprint'] = model['fingerprint']
    return model
