"""Kepler-Poinsot references from analytic vertices and explicit face cycles.

Coplanar regular pentagonal vertex sets are exhaustively reconstructed. A
pentagram uses step 2 in the angular order, retaining winding and crossings.
The great icosahedron uses the long-edge triangular cycles of the icosahedron.
No convex hull replaces the mathematical boundary of a star reference.
"""
from collections import Counter
from itertools import combinations
import numpy as np
from .geometry import cycle, GeometryError
from .faceting import facet


def kepler_poinsot(key):
    from .generators import regular
    definitions = {
        'small-stellated-dodecahedron': ('icosahedron', 2, [12, 30, 12, 0], '{5/2,5}'),
        'great-dodecahedron': ('icosahedron', 1, [12, 30, 12, 0], '{5,5/2}'),
        'great-stellated-dodecahedron': ('dodecahedron', 2, [20, 30, 12, 0], '{5/2,3}'),
        'great-icosahedron': ('icosahedron', 1, [12, 30, 20, 0], '{3,5/2}')
    }
    if key not in definitions:
        raise GeometryError('Choose one of the four Kepler-Poinsot reference keys.')
    base_key, step, expected, symbol = definitions[key]
    source = regular(base_key)
    points = np.asarray(source['vertices'])
    span = float(np.max(np.ptp(points, axis=0)))
    normalized = (points - points.mean(axis=0)) / span
    if key == 'great-icosahedron':
        distances = np.linalg.norm(normalized[:, None] - normalized[None, :], axis=2)
        levels = sorted(set(np.round(distances.ravel(), 9)))
        # Exclude antipodal pairs: the second-longest level forms 30 edges.
        length = levels[-2]
        faces = [list(ids) for ids in combinations(range(len(points)), 3)
                 if all(abs(distances[a, b] - length) < 1e-8 for a, b in combinations(ids, 2))]
    else:
        planes = {}
        for a, b, c in combinations(range(len(points)), 3):
            normal = np.cross(normalized[b] - normalized[a], normalized[c] - normalized[a])
            norm = float(np.linalg.norm(normal))
            if norm < 1e-10:
                continue
            ids = tuple(np.flatnonzero(abs((normalized - normalized[a]) @ (normal / norm)) < 1e-8))
            if len(ids) == 5:
                planes[ids] = cycle(normalized, ids)
        groups = {}
        for boundary in planes.values():
            face = [boundary[(i * step) % 5] for i in range(5)]
            lengths = [np.linalg.norm(normalized[a] - normalized[b]) for a, b in zip(face, face[1:] + face[:1])]
            if max(lengths) - min(lengths) < 1e-8:
                groups.setdefault(round(lengths[0], 8), []).append(face)
        # The dodecahedral vertex set has two pentagonal plane orbits. The
        # longer star-edge orbit gives the great stellated dodecahedron.
        faces = groups[max(groups)]
    faces = [[int(v) for v in face] for face in faces]
    result = facet(source, faces, key.replace('-', ' ').capitalize())
    incidence = Counter(tuple(sorted((a, b))) for face in faces for a, b in zip(face, face[1:] + face[:1]))
    if [len(result[k]) for k in ('vertices', 'edges', 'faces', 'cells')] != expected or any(n != 2 for n in incidence.values()):
        raise GeometryError('Regular star reconstruction failed its reference counts or two-face edge incidence.')
    result['metadata'].update({
        'key': key, 'family': 'Kepler-Poinsot', 'symbol': symbol,
        'facePolygon': {'sides': 3 if key == 'great-icosahedron' else 5, 'step': step},
        'topologicalGenus': 4 if key in ('small-stellated-dodecahedron', 'great-dodecahedron') else 0,
        'source': 'Independent analytic vertex set and exhaustive regular face cycles',
        'redistribution': 'Original generated geometry',
        'faceInterpretation': 'Ordered regular cycles, including step-2 pentagrams; crossings create no incidence vertices',
        'solidInterpretation': 'No filled-volume, density or star section semantics asserted'
    })
    result['provenance'] = {
        'operation': 'kepler-poinsot', 'algorithmVersion': '0.5.0', 'parameters': {'key': key},
        'analyticVertexSource': base_key, 'sourceFingerprint': source['fingerprint'],
        'faceEnumeration': 'all coplanar regular 5-sets with explicit cyclic step, or all long-edge equilateral triples',
        'convexified': False
    }
    return result
