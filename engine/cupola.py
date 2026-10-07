"""Analytic ordinary cupola incidence, independent of catalog assets and hulls."""
import math
import uuid

import numpy as np

from .geometry import GeometryError, TOLERANCE, identity, validate

VERSION = '0.1.0'
MAX_SIDES = 128
MAX_COORDINATE = 1e100


def _positive(value, label):
    if type(value) not in (int, float) or not 0 < value <= MAX_COORDINATE or not math.isfinite(value):
        raise GeometryError(f'Cupola {label} must be a finite positive number at most {MAX_COORDINATE:g}.')
    return float(value)


def cupola(n=3, edge_length=1.0, height=None):
    """Construct an ordinary convex n-cupola with equal upper/lower ring edges.

    Omitted height makes every face regular, and exists only for n=3,4,5.
    Explicit height gives rectangular side quads and isosceles triangles;
    their lateral edges are generally different from the ring edge length.
    """
    if type(n) is not int or not 3 <= n <= MAX_SIDES:
        raise GeometryError(f'Cupola side count must be an integer between 3 and {MAX_SIDES}.')
    edge_length = _positive(edge_length, 'ring edge length')
    delta = math.pi/(2*n)
    upper_radius_unit = 1/(2*math.sin(math.pi/n))
    lower_radius_unit = 1/(2*math.sin(delta))
    # The parallel edges of each quad differ by a perpendicular radial shift.
    radial_shift_unit = lower_radius_unit*math.cos(delta)-upper_radius_unit*math.cos(math.pi/n)
    automatic_height = height is None
    if automatic_height:
        if n not in (3, 4, 5):
            raise GeometryError('A positive regular-face cupola height exists only for n=3,4,5; supply explicit height for n>=6.')
        height = edge_length*math.sqrt(1-radial_shift_unit**2)
    height = _positive(height, 'height')
    upper_radius, lower_radius = upper_radius_unit*edge_length, lower_radius_unit*edge_length
    if max(upper_radius, lower_radius) > MAX_COORDINATE:
        raise GeometryError('Cupola ring radius exceeds the coordinate resource limit.')
    upper = [[upper_radius*math.cos(2*math.pi*i/n), upper_radius*math.sin(2*math.pi*i/n), height/2] for i in range(n)]
    lower = [[lower_radius*math.cos(2*math.pi*j/(2*n)-delta), lower_radius*math.sin(2*math.pi*j/(2*n)-delta), -height/2] for j in range(2*n)]
    vertices = upper+lower
    # Cycles are oriented outward. No support/hull routine chooses the incidence.
    faces = [list(range(n)), list(range(3*n-1, n-1, -1))]
    triangles = [[i, n+2*i, n+(2*i+1)%(2*n)] for i in range(n)]
    quads = [[i, n+(2*i+1)%(2*n), n+(2*i+2)%(2*n), (i+1)%n] for i in range(n)]
    faces.extend(triangles)
    faces.extend(quads)
    edges = [list(edge) for edge in sorted({tuple(sorted((a,b))) for face in faces for a,b in zip(face,face[1:]+face[:1])})]
    edge_roles = {'upperRing': [], 'lowerRing': [], 'lateral': []}
    for index, (a, b) in enumerate(edges):
        edge_roles['upperRing' if b < n else 'lowerRing' if a >= n else 'lateral'].append(index)
    points = np.asarray(vertices)
    scale = float(np.max(np.ptp(points, axis=0)))
    normalized = points/scale
    equations, minimum_gap = [], math.inf
    for index, face in enumerate(faces):
        normal = np.cross(normalized[face[1]]-normalized[face[0]], normalized[face[2]]-normalized[face[0]])
        length = float(np.linalg.norm(normal))
        if length <= TOLERANCE**2:
            raise GeometryError('Cupola face is unresolved at float64 precision; adjust height/edge-length aspect ratio.')
        normal /= length
        offset = -float(np.dot(normal, normalized[face[0]]))
        residual = normalized @ normal+offset
        outside = [v for v in range(len(vertices)) if v not in face]
        gap = -float(max(residual[outside]))
        if max(abs(residual[face])) > TOLERANCE or gap <= 4*TOLERANCE:
            raise GeometryError(f'Cupola facet {index} cannot resolve its complete supporting incidence at the configured tolerance; adjust aspect ratio.')
        minimum_gap = min(minimum_gap, gap)
        equations.append([*normal.tolist(), offset*scale])
    lateral_edge = math.hypot(radial_shift_unit*edge_length, height)
    regular_faces = n in (3,4,5) and math.isclose(lateral_edge, edge_length, rel_tol=1e-12, abs_tol=0)
    model = {'id': str(uuid.uuid4()), 'name': f'{n}-gonal cupola', 'dimension': 3, 'embeddingDimension': 3,
             'interpretation': 'convex-polytope', 'vertices': vertices, 'edges': edges, 'faces': faces, 'cells': [],
             'facetVertices': [list(face) for face in faces], 'facetEquations': equations,
             'metadata': {'cupola': {'schemaVersion': 1, 'n': n, 'ringEdgeLength': edge_length, 'height': height,
                                    'heightMode': 'regular-faces' if automatic_height else 'explicit',
                                    'upperRadius': upper_radius, 'lowerRadius': lower_radius,
                                    'radialSideShift': radial_shift_unit*edge_length, 'lateralEdgeLength': lateral_edge,
                                    'regularFacesWithinFloatTolerance': regular_faces,
                                    'faceRoles': {'upper': [0], 'lower': [1], 'triangles': list(range(2,2+n)),
                                                  'rectangles': list(range(2+n,2+2*n))},
                                    'vertexRoles': {'upper': list(range(n)), 'lower': list(range(n,3*n))},
                                    'edgeRoles': edge_roles,
                                    'originDefinition': 'axis center midway between the two ring planes',
                                    'definition': 'ordinary convex d=1 cupola; regular ring polygons, alternating lateral triangles and rectangles'}},
             'numeric': {'mode': 'float64-approximate', 'tolerance': TOLERANCE, 'certified': False,
                         'predicateScale': scale, 'algorithm': 'analytic ring coordinates and supplied ordered facet supports',
                         'minimumNormalizedNonincidentSupportGap': minimum_gap},
             'provenance': {'operation': 'cupola', 'algorithmVersion': VERSION,
                            'parameters': {'n': n, 'edge_length': edge_length, 'height': None if automatic_height else height},
                            'definition': 'original analytic coordinates and direct incidence; no catalog asset, hull or star inference'}}
    model['validation'] = validate(model)
    if not model['validation']['passed']:
        raise GeometryError('Cupola incidence failed validation: '+'; '.join(model['validation']['errors']))
    model['fingerprint'] = identity(model)
    return model
