"""Bounded triangular equal-length refinement then radial sphere projection.

No hull/weld/source repair. Approximate float64 eligibility predicates, never an
exact/uniform/convex-solid certificate. Each literal source cycle is respected;
independently reversed source face winding is allowed and explicitly recorded.
"""
from copy import deepcopy
from fractions import Fraction
import hashlib
import json
import math
from types import MappingProxyType

VERSION = '0.1.0'
LIMITS = MappingProxyType({'source_vertices': 1000, 'source_edges': 3000, 'source_faces': 2000,
          'vertices': 4000, 'edges': 12000, 'faces': 8000, 'frequency': 128,
          'source_bytes': 16*1024*1024, 'output_bytes': 32*1024*1024,
          'json_depth': 64, 'json_nodes': 200000})
TOLERANCE = 1e-9


class GeodesicRefusal(ValueError):
    def __init__(self, code, message):
        self.code = code
        super().__init__(message)


def _refuse(code, message):
    raise GeodesicRefusal(code, message)


def _json_clone(value):
    nodes = 0
    def visit(obj, depth):
        nonlocal nodes
        nodes += 1
        if depth > LIMITS['json_depth'] or nodes > LIMITS['json_nodes']:
            _refuse('source-resource', 'Source JSON depth or node resource limit exceeded.')
        kind = type(obj)
        if obj is None or kind in (bool, str):
            return
        # Actual native generator support-plane metadata contains numpy.float64,
        # which is a JSON-serializable float subclass. Normalize it through JSON
        # without importing numpy or trusting those historical planes.
        if kind is int or isinstance(obj, float):
            try:
                finite = math.isfinite(obj)
            except OverflowError:
                finite = False
            if not finite:
                _refuse('source-json', 'Source JSON numbers must be finite.')
            return
        if kind is list:
            for item in obj:
                visit(item, depth+1)
            return
        if kind is dict and all(type(k) is str for k in obj):
            for item in obj.values():
                visit(item, depth+1)
            return
        _refuse('source-json', 'Source must be ordinary finite JSON data.')
    visit(value, 0)
    try:
        encoded = json.dumps(value, allow_nan=False, separators=(',', ':'))
        if len(encoded.encode('utf-8')) > LIMITS['source_bytes']:
            _refuse('source-resource', 'Retained source JSON exceeds 16 MiB.')
        return json.loads(encoded)
    except (ValueError, UnicodeError, RecursionError) as exc:
        if isinstance(exc, GeodesicRefusal):
            raise
        _refuse('source-json', 'Source must be bounded finite JSON data.')


def _sub(a, b):
    return [x-y for x, y in zip(a, b)]


def _dot(a, b):
    return math.fsum(x*y for x, y in zip(a, b))


def _cross(a, b):
    return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]


def _norm(a):
    return math.hypot(*a)


def _topology(vertices, edges, faces):
    lookup, uses = {}, [[] for _ in edges]
    for i, edge in enumerate(edges):
        if type(edge) is not list or len(edge) != 2 or any(type(v) is not int or not 0 <= v < len(vertices) for v in edge) or edge[0] == edge[1]:
            _refuse('source-incidence', 'Source edges require distinct valid vertex IDs.')
        key = tuple(sorted(edge))
        if key in lookup:
            _refuse('source-incidence', 'Duplicate source edge identity is unsupported.')
        lookup[key] = i
    seen, vertex_faces, links = set(), [[] for _ in vertices], [[] for _ in vertices]
    for fi, face in enumerate(faces):
        if type(face) is not list or len(face) != 3:
            _refuse('not-triangular', 'Every source face must be an ordered triangle.')
        if any(type(v) is not int or not 0 <= v < len(vertices) for v in face) or len(set(face)) != 3:
            _refuse('source-incidence', 'Source triangle vertex IDs must be distinct and valid.')
        key = tuple(sorted(face))
        if key in seen:
            _refuse('source-incidence', 'Repeated source triangle support is unsupported.')
        seen.add(key)
        for j, a in enumerate(face):
            b = face[(j+1)%3]
            ei = lookup.get(tuple(sorted((a, b))))
            if ei is None:
                _refuse('source-incidence', 'A source triangle boundary edge is absent.')
            uses[ei].append((fi, 1 if edges[ei] == [a, b] else -1))
            vertex_faces[a].append(fi)
            links[a].append((b, face[(j+2)%3]))
    if any(len(u) != 2 for u in uses):
        _refuse('not-closed', 'Each source edge must have exactly two incident faces.')
    adjacent = [set() for _ in faces]
    for (a, _), (b, _) in uses:
        adjacent[a].add(b)
        adjacent[b].add(a)
    reached, queue = set(), [0]
    while queue:
        item = queue.pop()
        if item not in reached:
            reached.add(item)
            queue.extend(adjacent[item]-reached)
    if len(reached) != len(faces):
        _refuse('not-connected', 'Source must be a single connected triangular surface.')
    for link in links:
        graph = {}
        for a, b in link:
            graph.setdefault(a, []).append(b)
            graph.setdefault(b, []).append(a)
        if not graph or any(len(row) != 2 for row in graph.values()):
            _refuse('not-manifold', 'Every source vertex link must be a simple cycle.')
        reached, queue = set(), [next(iter(graph))]
        while queue:
            item = queue.pop()
            if item not in reached:
                reached.add(item)
                queue.extend(v for v in graph[item] if v not in reached)
        if len(reached) != len(graph):
            _refuse('not-manifold', 'Disconnected source vertex link is unsupported.')
    if len(vertices)-len(edges)+len(faces) != 2:
        _refuse('not-spherical-topology', 'Closed source must have Euler characteristic two.')
    return lookup, uses, vertex_faces


def _solve(rows, rhs):
    matrix = [row[:]+[value] for row, value in zip(rows, rhs)]
    for col in range(3):
        pivot = max(range(col, 3), key=lambda i: abs(matrix[i][col]))
        if abs(matrix[pivot][col]) < 1e-10:
            _refuse('ambiguous-sphere', 'Unique sphere center is ill-conditioned at float64 precision.')
        matrix[col], matrix[pivot] = matrix[pivot], matrix[col]
        factor = matrix[col][col]
        matrix[col] = [x/factor for x in matrix[col]]
        for i in range(3):
            if i != col:
                factor = matrix[i][col]
                matrix[i] = [x-factor*y for x, y in zip(matrix[i], matrix[col])]
    return [row[3] for row in matrix]


def _sphere_and_convexity(vertices, faces):
    lo = [min(row[i] for row in vertices) for i in range(3)]
    hi = [max(row[i] for row in vertices) for i in range(3)]
    origin = [a/2+b/2 for a, b in zip(lo, hi)]
    scale = max(_norm(_sub(row, origin)) for row in vertices)
    if scale == 0 or not math.isfinite(scale):
        _refuse('ambiguous-sphere', 'A positive finite source scale is required.')
    points = [[(x-c)/scale for x, c in zip(row, origin)] for row in vertices]
    if len({tuple(p) for p in points}) != len(points):
        _refuse('coincident-source', 'Distinct source IDs have unresolved coincident coordinates.')
    first = points[0]
    i1 = max(range(len(points)), key=lambda i: _norm(_sub(points[i], first)))
    d1 = _sub(points[i1], first)
    i2 = max(range(len(points)), key=lambda i: _norm(_cross(d1, _sub(points[i], first))))
    normal = _cross(d1, _sub(points[i2], first))
    i3 = max(range(len(points)), key=lambda i: abs(_dot(normal, _sub(points[i], first))))
    chosen = [i1, i2, i3]
    center = _solve([_sub(points[i], first) for i in chosen], [(_dot(points[i], points[i])-_dot(first, first))/2 for i in chosen])
    radii = [_norm(_sub(point, center)) for point in points]
    radius = math.fsum(radii)/len(radii)
    if radius <= TOLERANCE or not math.isfinite(radius):
        _refuse('ambiguous-sphere', 'A positive well-resolved common sphere is required.')
    residual = max(abs(r-radius) for r in radii)/radius
    if residual > TOLERANCE:
        _refuse('not-cospherical', 'Source vertices do not lie on one checked common sphere.')
    signs, support_residual, minimum_clearance = [], 0.0, math.inf
    support_groups = {}
    for face in faces:
        a, b, c = [points[i] for i in face]
        n = _cross(_sub(b, a), _sub(c, a))
        length = _norm(n)
        if length < TOLERANCE:
            _refuse('degenerate-face', 'Source triangle area is unresolved at float64 precision.')
        n = [x/length for x in n]
        values = [_dot(n, _sub(point, a)) for point in points]
        if max(values) > TOLERANCE and min(values) < -TOLERANCE:
            _refuse('not-convex', 'A source triangle plane has vertices on both sides.')
        sign = -1 if max(values) > TOLERANCE else 1
        n = [sign*x for x in n]
        # Independently check every supplied vertex against this actual plane;
        # source convex labels/certificates and hull reconstruction are not used.
        residual_face = max(sign*x for x in values)
        if residual_face > TOLERANCE:
            _refuse('not-convex', 'Supplied source triangles are not convex supporting faces containing an interior common-sphere center.')
        clearance = -_dot(n, _sub(center, a))
        if clearance <= TOLERANCE:
            _refuse('ambiguous-origin', 'Common sphere center is not strictly inside every source supporting plane.')
        support_residual = max(support_residual, residual_face)
        minimum_clearance = min(minimum_clearance, clearance)
        signs.append(sign)
        support = tuple(i for i, value in enumerate(values) if abs(value) <= TOLERANCE)
        support_groups.setdefault(support, {'normal': n, 'faces': []})['faces'].append((face, sign))
    # Cospherical support-plane vertices lie on a circle. Verify supplied
    # coplanar triangles cover that convex boundary once, not an overlapping
    # abstract triangulation. Use only supplied edges/cycles; no hull replacement.
    for support, group in support_groups.items():
        oriented_edges = {}
        triangle_area = 0.0
        for face, sign in group['faces']:
            cycle = face if sign == 1 else [face[0], face[2], face[1]]
            a, b, c = [points[i] for i in cycle]
            triangle_area += _dot(_cross(_sub(b, a), _sub(c, a)), group['normal'])/2
            for a, b in zip(cycle, cycle[1:]+cycle[:1]):
                oriented_edges.setdefault(tuple(sorted((a, b))), []).append((a, b))
        boundary = {}
        for arcs in oriented_edges.values():
            if len(arcs) == 2:
                if arcs[0] != tuple(reversed(arcs[1])):
                    _refuse('overlapping-source', 'Coplanar source triangle traversal overlaps.')
            elif len(arcs) == 1:
                a, b = arcs[0]
                if a in boundary:
                    _refuse('overlapping-source', 'Coplanar source boundary branches.')
                boundary[a] = b
            else:
                _refuse('overlapping-source', 'Coplanar source triangle incidence overlaps.')
        if set(boundary) != set(support) or len(group['faces']) != len(support)-2:
            _refuse('incomplete-source', 'Supplied triangles do not cover a full convex support boundary.')
        cycle, cursor = [], support[0]
        while cursor not in cycle:
            cycle.append(cursor)
            cursor = boundary[cursor]
        if cursor != cycle[0] or len(cycle) != len(support):
            _refuse('overlapping-source', 'Coplanar source boundary is not one simple cycle.')
        for i, a in enumerate(cycle):
            b, c = cycle[(i+1)%len(cycle)], cycle[(i+2)%len(cycle)]
            if _dot(_cross(_sub(points[b], points[a]), _sub(points[c], points[b])), group['normal']) <= 1e-14:
                _refuse('overlapping-source', 'Coplanar source boundary is not strictly convex and consistently traversed.')
        first = points[cycle[0]]
        polygon_area = math.fsum(_dot(_cross(_sub(points[cycle[i]], first), _sub(points[cycle[i+1]], first)), group['normal'])/2 for i in range(1, len(cycle)-1))
        if abs(polygon_area-triangle_area) > TOLERANCE*max(1, polygon_area):
            _refuse('overlapping-source', 'Supplied coplanar triangle areas do not cover the support polygon once.')
    sphere_center = [o+scale*c for o, c in zip(origin, center)]
    sphere_radius = scale*radius
    if not all(math.isfinite(x) and abs(x) <= 1e100 for x in sphere_center) or not math.isfinite(sphere_radius):
        _refuse('numeric-overflow', 'Common sphere center/radius reconstruction overflowed.')
    return {'center': sphere_center, 'radius': sphere_radius, 'normalizedCenter': center,
            'normalizedRadius': radius, 'normalizationOrigin': origin, 'normalizationScale': scale,
            'relativeRadiusResidual': residual, 'supportResidualNormalized': support_residual,
            'minimumCenterFaceClearanceNormalized': minimum_clearance, 'sourceFaceOutwardSigns': signs,
            'sphereWitnessVertexIds': [0]+chosen, 'checkedSupportGroups': len(support_groups)}, points


def _colors(source):
    table = source.get('metadata', {}).get('offColors', {})
    if type(table) is not dict:
        _refuse('source-colors', 'Source OFF colors must be an object.')
    faces = table.get('faces', [None]*len(source['faces']))
    if type(faces) is not list or len(faces) != len(source['faces']):
        _refuse('source-colors', 'Source face color count must match incidence.')
    for color in faces:
        if color is None:
            continue
        if type(color) is not dict or color.get('encoding') not in ('byte', 'unit'):
            _refuse('source-colors', 'Face colors require explicit byte or unit encoding.')
        values = color.get('values')
        maximum = 255 if color['encoding'] == 'byte' else 1
        if type(values) is not list or len(values) not in (3, 4) or any(type(v) not in (int, float) or not math.isfinite(v) or not 0 <= v <= maximum or color['encoding'] == 'byte' and type(v) is not int for v in values):
            _refuse('source-colors', 'Face RGB/RGBA channels are outside their encoding domain.')
    return faces


def _fraction(value, denominator):
    q = Fraction(value, denominator)
    return [q.numerator, q.denominator]


def subdivide_triangular_geodesic(source, frequency=1):
    """Detached approximate Model, exact combinatorial lineage, no hull/measure.

    Frequency1 preserves literal coordinates/edges/cycles, including each source
    face's winding. Sphere-center policy is the independently checked common
    circumsphere, NOT an unverified reproduction of the author's radius policy.
    """
    if type(frequency) is not int or not 1 <= frequency <= LIMITS['frequency']:
        _refuse('frequency', 'Frequency must be a positive integer from 1 to 128.')
    source = _json_clone(source)
    if type(source) is not dict or source.get('dimension') != 3 or type(source.get('dimension')) is not int or source.get('embeddingDimension', 3) != 3 or type(source.get('embeddingDimension', 3)) is not int:
        _refuse('source-dimension', 'Initial prototype requires intrinsic and ambient dimension three.')
    if source.get('components') is not None or source.get('cells', []):
        _refuse('source-components', 'Compound or 4D cell incidence needs a separate hierarchical subdivision contract.')
    vertices, edges, faces = [source.get(kind) for kind in ('vertices', 'edges', 'faces')]
    for kind, rows in zip(('vertices', 'edges', 'faces'), (vertices, edges, faces)):
        if type(rows) is not list or not 1 <= len(rows) <= LIMITS['source_'+kind]:
            _refuse('source-resource', f'Source {kind} is absent, empty, malformed or oversized.')
    if len(vertices) < 4:
        _refuse('ambiguous-sphere', 'At least four affinely independent source vertices are required.')
    if any(type(row) is not list or len(row) != 3 or any(type(x) not in (int, float) or not math.isfinite(x) or abs(x) > 1e100 for x in row) for row in vertices):
        _refuse('source-coordinates', 'Source XYZ must be finite float64 numbers bounded to 1e100.')
    if type(source.get('metadata', {})) is not dict:
        _refuse('source-metadata', 'Source metadata must be an object.')
    edge_lookup, uses, vertex_faces = _topology(vertices, edges, faces)
    sphere, points = _sphere_and_convexity(vertices, faces)
    colors = _colors(source)
    nv = len(vertices)+len(edges)*(frequency-1)+len(faces)*(frequency-1)*(frequency-2)//2
    nf = len(faces)*frequency*frequency
    ne = len(edges)*frequency+len(faces)*3*frequency*(frequency-1)//2
    if any(count > LIMITS[kind] for kind, count in [('vertices', nv), ('edges', ne), ('faces', nf)]):
        _refuse('output-resource', 'Predicted geodesic counts exceed 4000 vertices / 12000 edges / 8000 faces.')
    source_identity = {kind: source.get(kind, []) for kind in ('dimension', 'vertices', 'edges', 'faces', 'cells')}
    source_fingerprint = hashlib.sha256(json.dumps(source_identity, separators=(',', ':'), sort_keys=True).encode()).hexdigest()
    source_attributes_fingerprint = hashlib.sha256(json.dumps(source, separators=(',', ':'), sort_keys=True).encode()).hexdigest()
    result_vertices = deepcopy(vertices)
    vertex_sources = [{'kind': 'source-vertex', 'sourceVertexId': i, 'sourceFaceIds': fs[:]} for i, fs in enumerate(vertex_faces)]
    center, radius = sphere['normalizedCenter'], sphere['normalizedRadius']
    origin, scale = sphere['normalizationOrigin'], sphere['normalizationScale']
    def project(ids, weights):
        planar = [math.fsum(points[i][j]*(w/frequency) for i, w in zip(ids, weights)) for j in range(3)]
        direction = _sub(planar, center)
        length = _norm(direction)
        if length < TOLERANCE or not math.isfinite(length):
            _refuse('ambiguous-origin', 'A barycentric point has unresolved radial direction.')
        q = [c+radius*x/length for c, x in zip(center, direction)]
        output = [o+scale*x for o, x in zip(origin, q)]
        if not all(math.isfinite(x) and abs(x) <= 1e100 for x in output):
            _refuse('numeric-overflow', 'Projected geodesic coordinates overflowed.')
        return output
    chains = []
    for ei, (a, b) in enumerate(edges):
        chain = [a]
        for step in range(1, frequency):
            chain.append(len(result_vertices))
            result_vertices.append(project([a, b], [frequency-step, step]))
            vertex_sources.append({'kind': 'source-edge', 'sourceEdgeId': ei, 'parameter': _fraction(step, frequency),
                                   'sourceFaceIds': [fi for fi, _ in uses[ei]]})
        chain.append(b)
        chains.append(chain)
    result_faces, face_sources, face_maps = [], [], []
    for fi, face in enumerate(faces):
        grid = {}
        for u in range(frequency+1):
            for v in range(frequency-u+1):
                weights = [frequency-u-v, u, v]
                positive = [j for j, w in enumerate(weights) if w]
                if len(positive) == 1:
                    vi = face[positive[0]]
                elif len(positive) == 2:
                    ei = edge_lookup[tuple(sorted(face[j] for j in positive))]
                    last = face.index(edges[ei][1])
                    vi = chains[ei][weights[last]]
                else:
                    vi = len(result_vertices)
                    result_vertices.append(project(face, weights))
                    vertex_sources.append({'kind': 'source-face', 'sourceFaceId': fi,
                                           'barycentric': [_fraction(w, frequency) for w in weights], 'sourceFaceIds': [fi]})
                grid[u, v] = (vi, weights)
        mapped = []
        def triangle(corners):
            entries = [grid[key] for key in corners]
            mapped.append(len(result_faces))
            result_faces.append([entry[0] for entry in entries])
            face_sources.append({'sourceFaceId': fi, 'sourceTraversalSign': sphere['sourceFaceOutwardSigns'][fi],
                                 'cornerBarycentric': [[_fraction(w, frequency) for w in entry[1]] for entry in entries]})
        for u in range(frequency):
            for v in range(frequency-u):
                triangle([(u, v), (u+1, v), (u, v+1)])
                if u+v <= frequency-2:
                    triangle([(u+1, v), (u+1, v+1), (u, v+1)])
        face_maps.append(mapped)
    result_edges, edge_sources, edge_maps, output_edge_lookup = [], [], [], {}
    for ei, chain in enumerate(chains):
        mapped = []
        for step, (a, b) in enumerate(zip(chain, chain[1:])):
            mapped.append(len(result_edges))
            output_edge_lookup[tuple(sorted((a, b)))] = len(result_edges)
            result_edges.append([a, b])
            edge_sources.append({'kind': 'source-edge', 'sourceEdgeId': ei, 'sourceFaceIds': [fi for fi, _ in uses[ei]],
                                 'parameterInterval': [_fraction(step, frequency), _fraction(step+1, frequency)]})
        edge_maps.append(mapped)
    for output_face, source_face in zip(result_faces, face_sources):
        for a, b in zip(output_face, output_face[1:]+output_face[:1]):
            key = tuple(sorted((a, b)))
            if key not in output_edge_lookup:
                output_edge_lookup[key] = len(result_edges)
                result_edges.append([a, b])
                edge_sources.append({'kind': 'source-face', 'sourceFaceId': source_face['sourceFaceId'], 'sourceFaceIds': [source_face['sourceFaceId']]})
    # Literal frequency1 cycles/edge orientation, no source winding repair.
    if frequency == 1:
        result_faces = deepcopy(faces)
    if (len(result_vertices), len(result_edges), len(result_faces)) != (nv, ne, nf):
        _refuse('internal-incidence', 'Predicted and constructed subdivision counts disagree.')
    _, output_uses, _ = _topology(result_vertices, result_edges, result_faces)
    for output_face, lineage in zip(result_faces, face_sources):
        q = [[(x-o)/scale for x, o in zip(result_vertices[i], origin)] for i in output_face]
        n = _cross(_sub(q[1], q[0]), _sub(q[2], q[0]))
        if lineage['sourceTraversalSign']*_dot(n, _sub(q[0], center)) <= 1e-14:
            _refuse('numeric-winding', 'Projected triangle winding/area is unresolved relative to its literal source cycle.')
    radial_residual = max(abs(_norm(_sub([(x-o)/scale for x, o in zip(p, origin)], center))-radius)/radius for p in result_vertices)
    if radial_residual > 2*TOLERANCE:
        _refuse('numeric-sphere', 'Projected radial sphere residual exceeds the float64 policy.')
    metadata = {'triangularGeodesic': {'schemaVersion': 1, 'frequency': frequency, 'sourceModel': source,
                'sourceFingerprint': source_fingerprint, 'sourceAttributesFingerprint': source_attributes_fingerprint,
                'sphere': sphere, 'outputRelativeRadiusResidual': radial_residual,
                'sourceTraversalGloballyConsistent': all(a[1] != b[1] for a, b in uses),
                'outputTraversalGloballyConsistent': all(a[1] != b[1] for a, b in output_uses),
                'vertexSources': vertex_sources, 'edgeSources': edge_sources, 'faceSources': face_sources,
                'sourceMaps': {'vertices': list(range(len(vertices))), 'edges': edge_maps, 'faces': face_maps, 'cells': []},
                'sourceEdgeVertexChains': chains,
                'definition': 'equal-length planar barycentric triangular subdivision, then radial projection to independently checked source circumsphere; no hull/weld'}}
    for field in ('coordinateUnits', 'fillRule'):
        if field in source.get('metadata', {}):
            metadata[field] = deepcopy(source['metadata'][field])
    if any(color is not None for color in colors):
        metadata['offColors'] = {'faces': [deepcopy(colors[entry['sourceFaceId']]) for entry in face_sources], 'cells': []}
    result = {'id': 'geodesic-'+hashlib.sha256((VERSION+':'+source_attributes_fingerprint+':'+str(frequency)).encode()).hexdigest(),
              'name': f"Geodesic frequency {frequency} of {source.get('name', 'source')}",
              'dimension': 3, 'embeddingDimension': 3, 'vertices': result_vertices, 'edges': result_edges,
              'faces': result_faces, 'cells': [], 'interpretation': 'generalized-complex', 'metadata': metadata,
              'numeric': {'mode': 'float64-approximate', 'certified': False, 'tolerance': TOLERANCE,
                          'scope': 'approximate source convex/sphere predicates and radial projection; exact integer/rational incidence lineage only'},
              'provenance': {'operation': 'triangular-geodesic', 'algorithmVersion': VERSION,
                             'sourceModelId': source.get('id'), 'sourceFingerprint': source_fingerprint,
                             'parameters': {'frequency': frequency}, 'solidClassification': 'not-run'}}
    if len(json.dumps(result, allow_nan=False, separators=(',', ':')).encode()) > LIMITS['output_bytes']:
        _refuse('output-resource', 'Geodesic output including full source history exceeds 32 MiB.')
    return result
