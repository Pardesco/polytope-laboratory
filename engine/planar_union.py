"""Bounded winding-rule region unions, encoded as ordinary simple faces."""
import numpy as np
from scipy.spatial import ConvexHull
from .geometry import GeometryError
from .face_blending import (_tolerance, _welding, _geometry, _result, _area,
                            PREDICATE_EPSILON)
from .compounds import _check_source, MAX_FACE_VERTICES
from .visible_surface import _split, _contains, _merge

MAX_CORNERS = 128
MAX_PIECES = 6000
EPS = 2e-8


def union_polygons(polygons, fill_rule='nonzero'):
    """Normalized plane coordinates; union independently filled input cycles."""
    if fill_rule not in ('nonzero', 'even-odd'):
        raise GeometryError('Planar union fill rule must be nonzero or even-odd.')
    if not polygons or sum(map(len, polygons)) > MAX_CORNERS:
        raise GeometryError('Planar union supports at most 128 selected corners.')
    points = np.concatenate(polygons)
    lines = {}
    for poly in polygons:
        for a, b in zip(poly, np.roll(poly, -1, axis=0)):
            v = b-a; length = float(np.linalg.norm(v))
            if length <= EPS:
                raise GeometryError('Planar union has an unresolved zero-length input edge.')
            n = np.array([-v[1], v[0]])/length; d = -float(a@n)
            if n[np.argmax(abs(n))] < 0: n, d = -n, -d
            lines[tuple(np.rint(np.r_[n, d]/1e-10).astype(np.int64))] = (n, d)
    cells = [points[ConvexHull(points).vertices]]
    for n, d in lines.values():
        cells = [part for cell in cells for part in _split(cell, n, d)]
        if len(cells) > MAX_PIECES:
            raise GeometryError('Planar union exceeds the 6,000 arrangement-piece limit.')
    kept, owners = [], []
    for cell in cells:
        center = cell.mean(axis=0)
        origins = [i for i, poly in enumerate(polygons) if _contains(center, poly, fill_rule)]
        if origins:
            kept.append(cell); owners.append(origins)
    if not kept:
        raise GeometryError('Planar union is empty under the selected winding rule.')
    boundaries = _merge(kept, allow_holes=True)
    region_area = sum(abs(_area(q)) for q in kept)
    boundary_area = sum(_area(q) for q in boundaries)
    if abs(region_area-boundary_area) > EPS*max(1, region_area):
        raise GeometryError('Planar union boundary area disagrees with its arrangement pieces.')
    holes = sum(_area(q) < 0 for q in boundaries)
    if holes:
        # Native cycles must be simple and contain distinct vertex IDs. Keep
        # the arrangement tiles instead of introducing retraced slit edges.
        return kept, owners, boundaries, len(cells)
    output, sources = [], []
    for loop in boundaries:
        if _area(loop) <= EPS**2:
            raise GeometryError('Planar union has an unresolved boundary.')
        output.append(loop)
        sources.append(sorted({i for cell, ids in zip(kept, owners)
                               if _contains(cell.mean(axis=0), loop, 'nonzero') for i in ids}))
    return output, sources, boundaries, len(cells)


def conform_geometry(vertices, faces, extra_edges=()):
    """Conform T joins and compact unused vertices; maps refer to input IDs."""
    p = np.asarray(vertices, dtype=float)
    origin = p.mean(axis=0); scale = float(np.max(np.ptp(p, axis=0)))
    q = (p-origin)/scale
    active = np.zeros(len(p), dtype=bool)
    active[list({v for f in faces for v in f} | {v for e in extra_edges for v in e})] = True
    if sum(map(len, faces))*len(p) > 2_000_000:
        raise GeometryError('Planar union boundary-conformance work limit exceeded.')
    conformed = []
    for face in faces:
        cycle = []
        for a, b in zip(face, face[1:]+face[:1]):
            v = q[b]-q[a]; length = float(v@v)
            if length <= EPS**2: raise GeometryError('Planar union boundary edge is unresolved.')
            t = (q-q[a])@v/length
            on = active & (t >= -EPS) & (t < 1-EPS) & (np.linalg.norm(q-q[a]-t[:, None]*v, axis=1) < EPS)
            cycle.extend(sorted(np.flatnonzero(on).tolist(), key=lambda i: t[i]))
        if len(cycle) != len(set(cycle)):
            raise GeometryError('Planar union has a touching/branching boundary; simple faces are required.')
        conformed.append(cycle)
    edges = sorted({tuple(sorted((a, b))) for f in conformed for a, b in zip(f, f[1:]+f[:1])} |
                   {tuple(sorted(e)) for e in extra_edges})
    used = sorted({v for edge in edges for v in edge})
    mapping = {v: i for i, v in enumerate(used)}
    return ([vertices[v] for v in used], [[mapping[v] for v in f] for f in conformed],
            [[mapping[v] for v in e] for e in edges], mapping)


def blend_regions(source, face_ids, tolerance=0, *, weld=False,
                  color_policy='require-equal', fill_rule='nonzero'):
    _check_source(source); tolerance = _tolerance(tolerance)
    if color_policy not in ('require-equal', 'first-source'):
        raise GeometryError('Union color policy must be require-equal or first-source.')
    if type(face_ids) is not list or not 2 <= len(face_ids) <= 64 or any(type(i) is not int or not 0 <= i < len(source['faces']) for i in face_ids) or len(set(face_ids)) != len(face_ids):
        raise GeometryError('Planar union requires 2–64 distinct valid source face IDs.')
    selected = sorted(face_ids)
    if sum(len(source['faces'][i]) for i in selected) > MAX_CORNERS:
        raise GeometryError('Planar union supports at most 128 selected corners.')
    welding = _welding(source, tolerance)
    vertices, old_edges, source_faces, vertex_map, _ = _geometry(source, welding, weld)
    p = np.asarray(vertices, dtype=float)
    ids = sorted({v for f in selected for v in source_faces[f]})
    origin = p[ids].mean(axis=0); scale = float(np.max(np.ptp(p[ids], axis=0)))
    if not scale: raise GeometryError('Planar union has zero coordinate span.')
    cloud = (p[ids]-origin)/scale
    _, s, axes = np.linalg.svd(cloud, full_matrices=False)
    if len(s) < 2 or s[1] <= EPS:
        raise GeometryError('Planar union requires a resolved polygon plane.')
    basis = axes[:2]; residual = float(np.max(abs(cloud-(cloud@basis.T)@basis)))
    if residual > PREDICATE_EPSILON:
        raise GeometryError('Selected union faces are not coplanar.')
    membership = [{i for i, c in enumerate(source.get('cells', [])) if f in c} for f in selected]
    if any(c != membership[0] for c in membership[1:]):
        raise GeometryError('Planar union requires identical source-cell membership; 4D cell reconstruction is unsupported.')
    projected = (p-origin)/scale@basis.T
    polygons, origins, boundaries, work = union_polygons([projected[source_faces[f]] for f in selected], fill_rule)
    faces, sources = [], []
    comparisons = 0
    def vertex(point):
        nonlocal comparisons
        found = None
        for i, v in enumerate(vertices):
            comparisons += 1
            if comparisons > 2_000_000:
                raise GeometryError('Planar union vertex-resolution work limit exceeded.')
            if np.linalg.norm((np.asarray(v)-point)/scale) < EPS:
                found = i; break
        if found is None: found = len(vertices); vertices.append(point.tolist())
        return found
    for polygon, contributors in zip(polygons, origins):
        faces.append([vertex(origin+point@basis*scale) for point in polygon])
        sources.append([selected[i] for i in contributors])
    # Conformation needs one geometric vertex per coordinate, even when a
    # source uses independent component IDs. This is an explicit union action.
    for f, cycle in enumerate(source_faces):
        if f not in selected:
            faces.append([vertex(p[v]) for v in cycle]); sources.append([f])
    selected_edges = {tuple(sorted((a, b))) for f in selected for a, b in zip(source_faces[f], source_faces[f][1:]+source_faces[f][:1])}
    face_edges = {tuple(sorted((a,b))) for f in source_faces for a,b in zip(f,f[1:]+f[:1])}
    extra = [edge for edge in old_edges if tuple(sorted(edge)) not in selected_edges and tuple(sorted(edge)) not in face_edges]
    # Exact duplicates from independent IDs must not be emitted twice on edges.
    representatives = [vertex(point) for point in p]
    faces = [[representatives[v] if v < len(p) else v for v in f] for f in faces]
    extra = [[representatives[v] for v in e] for e in extra]
    output_vertices, output_faces, edges, compact = conform_geometry(vertices, faces, extra)
    if any(len(f) > MAX_FACE_VERTICES for f in output_faces):
        raise GeometryError('Planar union output face exceeds 2,048 corners.')
    lookup = {tuple(sorted(e)): i for i, e in enumerate(edges)}
    source_vertices = [compact.get(representatives[v]) for v in vertex_map]
    source_edges = []
    for edge in source['edges']:
        a, b = (source_vertices[v] for v in edge)
        source_edges.append(lookup.get(tuple(sorted((a, b)))) if a is not None and b is not None else None)
    evidence = {'tolerance': tolerance, 'coordinateWeld': weld, 'selectedFaceIds': selected,
                'fillRule': fill_rule, 'unionCoordinateWeld': True, 'normalizedTolerance': EPS,
                'maxPlanarityResidual': residual, 'arrangementPieces': work,
                'planeOrigin': origin.tolist(), 'planeBasis': basis.tolist(),
                'boundaryCycles': [q.tolist() for q in boundaries],
                'holes': sum(_area(q) < 0 for q in boundaries),
                'representation': 'simple planar tiles when holes occur; simple union cycles otherwise',
                'vertexComparisons': comparisons,
                'normalizedOutputArea': sum(abs(_area(q)) for q in polygons), 'areaCoordinateScale': scale,
                'normalizedBoundaryArea': sum(_area(q) for q in boundaries)}
    geometry = (output_vertices, edges, [], source_vertices, source_edges)
    result = _result(source, 'blend-planar-regions', geometry, output_faces, sources, evidence, color_policy)
    if 'coordinateUnits' in source.get('metadata', {}):
        result['metadata']['coordinateUnits'] = source['metadata']['coordinateUnits']
    _check_source(result)
    return result
