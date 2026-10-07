"""3D plane reciprocation with source vertex links defining the dual cycles.

Closed two-face edge links and one cyclic face link per vertex are required.
Self-crossing cycles and genus are retained. No angular sorting, convex hull,
or filled-solid interpretation is substituted for supplied incidence.
"""
from collections import defaultdict
import math
import numpy as np
from .geometry import points_array, validate, GeometryError, TOLERANCE
from .faceting import facet


def incidence_dual(model, center=None, radius=1):
    if model.get('dimension') == 4:
        from .incidence_dual_4d import incidence_dual_4d
        return incidence_dual_4d(model, center, radius)
    if model.get('dimension') != 3 or model.get('embeddingDimension') != 3 or not validate(model)['passed']:
        raise GeometryError('Incidence dual requires a validated intrinsic 3D polygonal complex.')
    if not 4 <= len(model['faces']) <= 2048:
        raise GeometryError('Incidence dual supports 4–2,048 source face planes.')
    points = points_array(model['vertices'])
    center = points.mean(axis=0) if center is None else np.asarray(center, dtype=float)
    if center.shape != (3,) or not np.isfinite(center).all() or isinstance(radius, bool) or not isinstance(radius, (int, float)) or not math.isfinite(radius) or radius <= 0:
        raise GeometryError('Reciprocation needs a finite 3D center and positive finite radius.')
    relative = points - center
    span = float(np.max(np.ptp(points, axis=0)))
    edge_faces, vertex_faces = defaultdict(list), defaultdict(set)
    for index, face in enumerate(model['faces']):
        for vertex in face:
            vertex_faces[vertex].add(index)
        for a, b in zip(face, face[1:] + face[:1]):
            edge_faces[tuple(sorted((a, b)))].append(index)
    source_edges = [tuple(sorted(e)) for e in model['edges']]
    if set(source_edges) != set(edge_faces) or any(len(fs) != 2 or len(set(fs)) != 2 for fs in edge_faces.values()):
        raise GeometryError('Incidence dual needs exactly two distinct face incidences on every source edge; open/nonmanifold edges are unsupported.')
    faces = []
    for vertex in range(len(points)):
        adjacency = defaultdict(list)
        for edge, incident in edge_faces.items():
            if vertex in edge:
                a, b = incident
                adjacency[a].append(b)
                adjacency[b].append(a)
        if len(adjacency) < 3 or set(adjacency) != vertex_faces[vertex] or any(len(neighbors) != 2 or len(set(neighbors)) != 2 for neighbors in adjacency.values()):
            raise GeometryError(f'Source vertex {vertex} needs a single simple cyclic face link with at least three faces.')
        first = min(adjacency)
        order, previous, current = [first], first, min(adjacency[first])
        while current != first:
            if current in order:
                raise GeometryError(f'Source vertex {vertex} has a disconnected or repeated face link.')
            order.append(current)
            previous, current = current, next(i for i in adjacency[current] if i != previous)
        if set(order) != vertex_faces[vertex]:
            raise GeometryError(f'Source vertex {vertex} has disconnected face-link components.')
        faces.append(order)
    dual_points = []
    offsets = []
    for index, face in enumerate(model['faces']):
        cloud = relative[face]
        _, _, vt = np.linalg.svd((cloud - cloud[0]) / span, full_matrices=False)
        normal = vt[-1]
        distance = float(normal @ cloud.mean(axis=0))
        if abs(distance) <= TOLERANCE * span * 4:
            raise GeometryError(f'Source face {index} passes through or too close to the reciprocation center; its dual vertex is singular.')
        dual_points.append(center + normal * (radius**2 / distance))
        offsets.append(abs(distance))
    dual_points = np.asarray(dual_points)
    dual_span = float(np.max(np.ptp(dual_points, axis=0)))
    distances = np.linalg.norm(dual_points[:, None] - dual_points[None, :], axis=2)
    np.fill_diagonal(distances, np.inf)
    if not dual_span or not np.isfinite(dual_points).all() or np.min(distances) <= TOLERANCE * dual_span * 4:
        raise GeometryError('Coincident or unresolved reciprocal face planes would collapse distinct source face identities.')
    result = facet({'dimension':3,'embeddingDimension':3,'vertices':dual_points.tolist(),
                    'name':model['name'],'id':model['id'],'numeric':{'mode':'float64-approximate','tolerance':TOLERANCE,'certified':False}},
                   faces, 'Incidence dual of ' + model['name'])
    if len(result['edges']) != len(source_edges):
        raise GeometryError('Reciprocal incidence collapsed source edges; no dual was returned.')
    residual = max(abs((dual_points[f] - center) @ relative[v] - radius**2)
                   for v, face in enumerate(faces) for f in face)
    tolerance = max(radius**2, np.finfo(float).tiny) * 1e-7
    if residual > tolerance:
        raise GeometryError('Reciprocal face/vertex polarity failed its numerical residual check.')
    result['metadata'].update({
        'family':'Incidence dual', 'dualSourceFaceIds':list(range(len(model['faces']))),
        'dualSourceVertexIds':list(range(len(points))),
        'dualSourceEdgeIds':[{ 'sourceEdge':i,'dualVertices':edge_faces[edge] } for i, edge in enumerate(source_edges)],
        'solidInterpretation':'Ordered surface incidence retained; no convexity, filled volume or density asserted'
    })
    result['provenance'] = {
        'operation':'incidence-dual','sourceId':model['id'],'sourceFingerprint':model.get('fingerprint'),
        'algorithmVersion':'0.5.0','parameters':{'center':center.tolist(),'radius':radius},
        'boundaryMethod':'One dual vertex per source face plane; dual face order follows the full source vertex link',
        'maximumPolarityResidual':float(residual),'polarityTolerance':tolerance,
        'minimumFaceCenterDistance':min(offsets),'convexified':False
    }
    return result
