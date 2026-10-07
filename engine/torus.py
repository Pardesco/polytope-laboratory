"""Literal periodic quad ring torus; source incidence never comes from a hull."""
from collections import Counter
from copy import deepcopy
import math
import uuid

import numpy as np

from .compounds import (_colors, MAX_COORDINATE, MAX_ELEMENTS,
                        MAX_INCIDENCES, MAX_PAYLOAD_BYTES)
from .geometry import GeometryError, TOLERANCE, identity, validate
from .history import _json_bytes

VERSION = '0.1.0'
MAX_TORUS_VERTICES = 4000


def _count(value, label):
    if type(value) is not int or not 3 <= value <= MAX_TORUS_VERTICES:
        raise GeometryError(f'Torus {label} must be an integer between 3 and {MAX_TORUS_VERTICES}.')
    return value


def _positive(value, label, maximum):
    # Compare the bound before isfinite/float to reject arbitrary-size integers.
    if type(value) not in (int, float) or not 0 < value <= maximum or not math.isfinite(value):
        raise GeometryError(f'Torus {label} must be finite, positive and at most {maximum:g}.')
    return float(value)


def _topology(vertices, edges, faces):
    edge_set = {tuple(sorted(edge)) for edge in edges}
    boundary = Counter()
    directions = Counter()
    neighbors = [set() for _ in vertices]
    links = [Counter() for _ in vertices]
    for face in faces:
        for j, vertex in enumerate(face):
            following = face[(j+1) % 4]
            boundary[tuple(sorted((vertex, following)))] += 1
            directions[(vertex, following)] += 1
            links[vertex][tuple(sorted((face[j-1], following)))] += 1
    if set(boundary) != edge_set or any(count != 2 for count in boundary.values()):
        raise GeometryError('Torus boundary edges require exactly two face incidences.')
    for a, b in edges:
        if directions[(a,b)] != 1 or directions[(b,a)] != 1:
            raise GeometryError('Torus face orientation is inconsistent across a periodic edge.')
        neighbors[a].add(b); neighbors[b].add(a)
    for vertex, link in enumerate(links):
        degrees = Counter(v for edge in link for v in edge)
        if len(neighbors[vertex]) != 4 or set(degrees) != neighbors[vertex] or set(degrees.values()) != {2} or set(link.values()) != {1}:
            raise GeometryError('Torus vertex link must be a simple four-edge cycle.')
        adjacency = {v:set() for v in degrees}
        for a,b in link:
            adjacency[a].add(b); adjacency[b].add(a)
        seen, pending = set(), [next(iter(adjacency))]
        while pending:
            v = pending.pop()
            if v not in seen:
                seen.add(v); pending.extend(adjacency[v]-seen)
        if len(seen) != 4:
            raise GeometryError('Torus vertex link is disconnected.')
    seen, pending = set(), [0]
    while pending:
        v = pending.pop()
        if v not in seen:
            seen.add(v); pending.extend(neighbors[v]-seen)
    if len(seen) != len(vertices) or len(vertices)-len(edges)+len(faces) != 0:
        raise GeometryError('Torus requires a connected orientable Euler-zero surface.')


def polyhedral_torus(ring_segments=10, arm_segments=8, arm_ratio=0.5,
                     ring_radius=1.0, *, face_colors=None):
    """Generate an untwisted ring torus with outward ordered periodic quads.

    Counts are literal angular subdivisions, not star symbols. arm_ratio is
    minor/major radius; only numerically resolved 0 < ratio < 1 is supported.
    The resulting genus-one surface declares no solid volume or convexity.
    """
    n = _count(ring_segments, 'ring segment count')
    m = _count(arm_segments, 'arm segment count')
    size = n*m
    if size > MAX_TORUS_VERTICES or 2*size > MAX_ELEMENTS or 11*size > MAX_INCIDENCES:
        raise GeometryError(f'Torus output resource limit is {MAX_TORUS_VERTICES} vertices with bounded incidence.')
    ratio = _positive(arm_ratio, 'arm/ring radius ratio', 1.0)
    if ratio >= 1:
        raise GeometryError('Torus requires 0 < arm/ring radius ratio < 1; horn and spindle cases are unsupported.')
    radius = _positive(ring_radius, 'ring radius', MAX_COORDINATE)
    if min(ratio, 1-ratio)/(2*(1+ratio)) <= 4*TOLERANCE:
        raise GeometryError('Torus arm thickness or hole clearance is unresolved at the normalized float64 tolerance.')
    colors = None
    if face_colors is not None:
        if type(face_colors) is not list or len(face_colors) != size:
            raise GeometryError('Torus face color count must equal ring_segments * arm_segments.')
        _json_bytes(face_colors, MAX_PAYLOAD_BYTES)
        colors = deepcopy(_colors({'faces':[None]*size, 'metadata':{'offColors':{'faces':face_colors}}}, 'faces'))
    ring = [(math.cos(2*math.pi*i/n), math.sin(2*math.pi*i/n)) for i in range(n)]
    arm = [(math.cos(2*math.pi*j/m), math.sin(2*math.pi*j/m)) for j in range(m)]
    unit = [[(1+ratio*c)*x, (1+ratio*c)*y, ratio*s] for x,y in ring for c,s in arm]
    vertices = [[radius*x for x in point] for point in unit]
    if any(not math.isfinite(x) or abs(x)>MAX_COORDINATE for point in vertices for x in point):
        raise GeometryError('Torus output coordinates exceed the finite 1e100 resource bound.')
    if len(set(map(tuple,vertices))) != size or max(abs(x/radius-u) for point,expected in zip(vertices,unit) for x,u in zip(point,expected)) > TOLERANCE:
        raise GeometryError('Torus coordinates are unresolved at float64 precision; increase ring radius.')
    index = lambda i,j: (i % n)*m+j % m
    edges = [[index(i,j), index(i+1,j)] for i in range(n) for j in range(m)]
    edges += [[index(i,j), index(i,j+1)] for i in range(n) for j in range(m)]
    faces = [[index(i,j), index(i+1,j), index(i+1,j+1), index(i,j+1)] for i in range(n) for j in range(m)]
    points = np.asarray(vertices, dtype=float)/radius
    scale = float(np.max(np.ptp(points,axis=0)))
    normalized = points/scale
    if np.linalg.matrix_rank(normalized-normalized[0], TOLERANCE) != 3:
        raise GeometryError('Torus full 3D rank is unresolved at the normalized float64 tolerance.')
    minimum_edge = min(float(np.linalg.norm(normalized[b]-normalized[a])) for a,b in edges)
    if minimum_edge <= 4*TOLERANCE:
        raise GeometryError('Torus periodic edges are unresolved at the normalized float64 tolerance.')
    minimum_face_rank, maximum_planarity = math.inf, 0.0
    for face in faces:
        cloud = normalized[face]-normalized[face[0]]
        singular = np.linalg.svd(cloud, compute_uv=False)
        minimum_face_rank = min(minimum_face_rank, float(singular[1]))
        maximum_planarity = max(maximum_planarity, float(singular[2]))
        if singular[1] <= 4*TOLERANCE or singular[2] > TOLERANCE:
            raise GeometryError('Torus periodic quad rank/planarity is unresolved at the normalized float64 tolerance.')
    _topology(vertices,edges,faces)
    parameters = {'ring_segments':n, 'arm_segments':m, 'arm_ratio':ratio, 'ring_radius':radius}
    maps = {'vertices':[{'ringIndex':i, 'armIndex':j} for i in range(n) for j in range(m)],
            'edges':[{'direction':direction, 'ringIndex':i, 'armIndex':j}
                     for direction in ('ring','arm') for i in range(n) for j in range(m)],
            'faces':[{'ringIndex':i, 'armIndex':j} for i in range(n) for j in range(m)], 'cells':[]}
    model = {'id':str(uuid.uuid4()), 'name':f'Polyhedral torus {n} × {m}',
             'dimension':3, 'embeddingDimension':3, 'interpretation':'generalized-complex',
             'vertices':vertices, 'edges':edges, 'faces':faces, 'cells':[],
             'numeric':{'mode':'float64-approximate', 'certified':False, 'tolerance':TOLERANCE,
                        'predicateScale':scale, 'predicateScaleDefinition':'coordinate span in ring-radius units',
                        'algorithm':'analytic ring coordinates and direct ordered periodic quad incidence'},
             'provenance':{'operation':'polyhedral-torus', 'algorithmVersion':VERSION,
                           'parameters':deepcopy(parameters),
                           'definition':'untwisted major/minor circular sampling with literal periodic incidence; no hull, weld or filled-volume inference'},
             'metadata':{'family':'Torus', 'topologicalGenus':1,
               'polyhedralTorus':{'schemaVersion':1, 'algorithmVersion':VERSION,
                'parameters':deepcopy(parameters), 'maps':maps,
                'vertexIndexDefinition':'ringIndex * arm_segments + armIndex; both angular indices wrap',
                'edgeIndexDefinition':'ring edges first in vertex order, then arm edges in vertex order',
                'faceIndexDefinition':'same grid order as vertices; increasing ring then increasing arm direction',
                'angularOriginDefinition':'ring starts on +X, arm starts outward at z=0; positive angles follow right-handed XYZ',
                'topology':{'connectedComponents':1, 'orientable':True, 'genus':1, 'eulerCharacteristic':0,
                            'vertexLink':'simple four-edge cycle', 'edgeFaceDegree':2},
                'geometricEvidence':{'minimumNormalizedEdgeLength':minimum_edge,
                    'minimumNormalizedFaceSecondSingularValue':minimum_face_rank,
                    'maximumNormalizedFaceThirdSingularValue':maximum_planarity,
                    'normalizedAnalyticHoleClearance':(1-ratio)/(2*(1+ratio))},
                'resourceBounds':{'outputVertices':MAX_TORUS_VERTICES,'elementsPerKind':MAX_ELEMENTS,
                                  'incidenceReferences':MAX_INCIDENCES,'payloadBytes':MAX_PAYLOAD_BYTES},
                'colorPolicy':'Optional per-face RGB/RGBA records copied in literal face order.',
                'measureDefinition':'Genus-one generalized surface; no solid content, convex hull volume or exact certificate inferred.'}}}
    if colors is not None:
        model['metadata']['offColors'] = {'faces':colors, 'cells':[]}
        model['provenance']['parameters']['face_colors'] = deepcopy(colors)
    report = validate(model)
    if not report['passed']:
        raise GeometryError('Torus native numeric/incidence validation failed: '+'; '.join(report['errors']))
    model['validation'], model['fingerprint'] = report, identity(model)
    evidence = model['metadata']['polyhedralTorus']
    evidence['sourceModelId'], evidence['sourceFingerprint'] = model['id'], model['fingerprint']
    evidence['evidenceScope'] = 'generated source only; maps and topology evidence apply while current geometry matches sourceFingerprint'
    _json_bytes(model, MAX_PAYLOAD_BYTES)
    return model
