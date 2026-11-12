"""Bounded float64 arrangement boundary of filled, oriented immersed shells.

The arrangement uses complete plane cuts (a refinement of segment cuts), then
removes internal subdivisions. Component interiors are unioned, never hulled.
"""

from collections import defaultdict
from copy import deepcopy
import uuid
import numpy as np
from scipy.spatial import ConvexHull
from .geometry import GeometryError, identity, validate
from .operations import record

EPS = 2e-8
MAX_CELLS = 30000


def _cross(a, b):
    return float(a[0] * b[1] - a[1] * b[0])


def _split(poly, normal, offset):
    values = poly @ normal + offset
    if min(values) >= -EPS or max(values) <= EPS:
        return [poly]
    halves = []
    for sign in (1, -1):
        points = []
        for a, b, da, db in zip(poly, np.roll(poly, -1, axis=0), values, np.roll(values, -1)):
            if sign * da >= -1e-11:
                points.append(a)
            if da * db < 0:
                points.append(a + (b - a) * da / (da - db))
        cleaned = []
        for point in points:
            if not cleaned or np.linalg.norm(point - cleaned[-1]) > 1e-10:
                cleaned.append(point)
        if len(cleaned) > 1 and np.linalg.norm(cleaned[0] - cleaned[-1]) < 1e-10:
            cleaned.pop()
        if len(cleaned) >= 3:
            q = np.asarray(cleaned)
            if abs(sum(_cross(a, b) for a, b in zip(q, np.roll(q, -1, axis=0)))) > 1e-14:
                halves.append(q)
    return halves


def _oriented_components(model, p):
    incidence = defaultdict(list)
    for fi, f in enumerate(model['faces']):
        for a, b in zip(f, f[1:] + f[:1]):
            incidence[tuple(sorted((a, b)))].append((fi, 1 if a < b else -1))
    if any(len(v) != 2 for v in incidence.values()):
        raise GeometryError(
            'Visible surface requires closed two-face source edges; open or ambiguous nonmanifold assemblies are unsupported.'
        )
    neighbors = defaultdict(list)
    for (a, da), (b, db) in incidence.values():
        neighbors[a].append((b, -da * db))
        neighbors[b].append((a, -da * db))
    signs = {}
    groups = []
    for root in range(len(model['faces'])):
        if root in signs:
            continue
        queue = [root]
        signs[root] = 1
        group = []
        while queue:
            a = queue.pop()
            group.append(a)
            for b, relation in neighbors[a]:
                wanted = signs[a] * relation
                if b in signs:
                    if signs[b] != wanted:
                        raise GeometryError('Visible surface requires orientable source components.')
                else:
                    signs[b] = wanted
                    queue.append(b)
        groups.append(group)
    triangles = []
    for group in groups:
        ts = []
        for fi in group:
            f = model['faces'][fi]
            f = f if signs[fi] > 0 else f[::-1]
            ts.extend(p[[f[0], f[j], f[j + 1]]] for j in range(1, len(f) - 1))
        triangles.append(np.asarray(ts))
    return groups, triangles


def _windings(points, triangles):
    # Signed fan triangles integrate the ordered planar cycle, including stars.
    result = []
    for start in range(0, len(points), 256):
        v = triangles[None, :, :, :] - points[start : start + 256, None, None, :]
        a, b, c = v[:, :, 0], v[:, :, 1], v[:, :, 2]
        la, lb, lc = (np.linalg.norm(x, axis=2) for x in (a, b, c))
        numerator = np.einsum('ijk,ijk->ij', a, np.cross(b, c))
        denominator = (
            la * lb * lc
            + np.einsum('ijk,ijk->ij', a, b) * lc
            + np.einsum('ijk,ijk->ij', b, c) * la
            + np.einsum('ijk,ijk->ij', c, a) * lb
        )
        result.extend(np.sum(2 * np.arctan2(numerator, denominator), axis=1) / (4 * np.pi))
    return np.asarray(result)


def _inside(points, triangles, rule):
    inside = np.zeros(len(points), dtype=bool)
    residual = 0.0
    for ts in triangles:
        winding = _windings(points, ts)
        nearest = np.rint(winding)
        residual = max(residual, float(np.max(abs(winding - nearest))))
        inside |= abs(nearest) > 0 if rule == 'nonzero' else np.mod(abs(nearest), 2) == 1
    if residual > 2e-4:
        raise GeometryError(
            'Visible-surface winding classification is unresolved near an intersection; no surface was constructed.'
        )
    return inside, residual


def _merge(polygons, allow_holes=False):
    points = []
    lookup = {}
    edges = defaultdict(int)

    def vertex(p):
        key = tuple(np.rint(p / 1e-9).astype(np.int64))
        if key not in lookup:
            lookup[key] = len(points)
            points.append(p)
        return lookup[key]

    for poly in polygons:
        ids = [vertex(p) for p in poly]
        for a, b in zip(ids, ids[1:] + ids[:1]):
            if edges[b, a]:
                edges[b, a] -= 1
            else:
                edges[a, b] += 1
    boundary = [edge for edge, count in edges.items() for _ in range(count)]
    outgoing = defaultdict(list)
    for a, b in boundary:
        outgoing[a].append(b)
    cycles = []
    while outgoing:
        start = next(iter(outgoing))
        a = start
        cycle = []
        previous = None
        while True:
            cycle.append(a)
            if a not in outgoing:
                raise GeometryError('Visible planar pieces have an unresolved open boundary.')
            choices = outgoing[a]
            if previous is None:
                b = choices[0]
            else:
                incoming = points[a] - points[previous]
                b = max(
                    choices,
                    key=lambda j: np.arctan2(
                        _cross(incoming, points[j] - points[a]), incoming @ (points[j] - points[a])
                    ),
                )
            choices.remove(b)
            if not choices:
                outgoing.pop(a)
            previous, a = a, b
            if a == start:
                break
        q = np.asarray([points[i] for i in cycle])
        changed = True
        while changed and len(q) > 3:
            changed = False
            for i in range(len(q)):
                u = q[i] - q[i - 1]
                v = q[(i + 1) % len(q)] - q[i]
                if abs(_cross(u, v)) <= 1e-9 * np.linalg.norm(u) * np.linalg.norm(v) and u @ v > 0:
                    q = np.delete(q, i, axis=0)
                    changed = True
                    break
        if not allow_holes and sum(_cross(a, b) for a, b in zip(q, np.roll(q, -1, axis=0))) <= 0:
            raise GeometryError('Visible face has a hole; this paper-surface slice requires simple hole-free polygons.')
        cycles.append(q)
    return cycles


def visible_surface(model, fill_rule='nonzero', decompose_holes=False):
    if fill_rule not in ('nonzero', 'even-odd'):
        raise GeometryError('Visible surface fill rule must be nonzero or even-odd.')
    if type(decompose_holes) is not bool:
        raise GeometryError('Visible-surface hole decomposition must be boolean.')
    if model.get('dimension') != 3 or model.get('embeddingDimension', 3) != 3:
        raise GeometryError('Visible surface requires a validated 3D model in three coordinates.')
    validation = validate(model)
    if not validation['passed']:
        raise GeometryError('Visible surface source is invalid: ' + '; '.join(validation['errors']))
    if len(model['faces']) < 4:
        raise GeometryError('Visible surface requires a closed solid shell with at least four faces.')
    if len(model['faces']) > 100 or sum(map(len, model['faces'])) > 1200:
        raise GeometryError('Visible surface limits: 4–100 source faces and 1,200 boundary vertices.')
    original = np.asarray(model['vertices'], dtype=float)
    origin = original.mean(axis=0)
    span = float(np.max(np.ptp(original, axis=0)))
    p = (original - origin) / span
    groups, triangles = _oriented_components(model, p)
    charts = []
    max_planarity = 0.0
    for fi, face in enumerate(model['faces']):
        cloud = p[face]
        center = cloud.mean(axis=0)
        _, s, axes = np.linalg.svd(cloud - center, full_matrices=False)
        if len(s) < 3 or s[1] < EPS or s[-1] > EPS:
            raise GeometryError(f'Visible surface face {fi} is degenerate or nonplanar.')
        max_planarity = max(max_planarity, float(s[-1]))
        basis = axes[:2].T
        normal = np.cross(basis[:, 0], basis[:, 1])
        q = (cloud - center) @ basis
        charts.append((center, basis, normal, q))
    candidates = []
    cell_count = 0
    for fi, (center, basis, normal, q) in enumerate(charts):
        cells = [q[ConvexHull(q).vertices]]
        lines = []
        for cj, bj, nj, qj in charts:
            n = nj @ basis
            d = float((center - cj) @ nj)
            length = np.linalg.norm(n)
            if length > EPS:
                lines.append((n / length, d / length))
            elif abs(d) < EPS:
                projected = (cj + qj @ bj.T - center) @ basis
                for a, b in zip(projected, np.roll(projected, -1, axis=0)):
                    v = b - a
                    n = np.array([-v[1], v[0]])
                    length = np.linalg.norm(n)
                    if length < EPS:
                        raise GeometryError('Visible surface source has a zero-length face edge.')
                    n /= length
                    lines.append((n, -float(a @ n)))
        unique = {}
        for n, d in lines:
            if n[np.argmax(abs(n))] < 0:
                n, d = -n, -d
            unique[tuple(np.rint(np.r_[n, d] / 1e-8).astype(np.int64))] = (n, d)
        for n, d in unique.values():
            cells = [part for cell in cells for part in _split(cell, n, d)]
            if len(cells) + cell_count > MAX_CELLS:
                raise GeometryError('Visible surface plane arrangement exceeds the 30,000-piece resource limit.')
        cell_count += len(cells)
        candidates.extend(
            (fi, cell, center + cell.mean(axis=0) @ basis.T)
            for cell in cells
            if _contains(cell.mean(axis=0), q, fill_rule)
        )
    if not candidates:
        raise GeometryError('Visible source fills are empty for this winding rule.')
    centers = np.asarray([v[2] for v in candidates])
    normals = np.asarray([charts[v[0]][2] for v in candidates])
    residual = 0.0
    for fi, (center, basis, normal, q) in enumerate(charts):
        samples = centers[[i for i, candidate in enumerate(candidates) if candidate[0] == fi]]
        for cj, bj, nj, qj in charts:
            if abs(normal @ nj) > 1 - EPS and abs((center - cj) @ normal) < EPS:
                continue
            if len(samples) and np.min(abs((samples - cj) @ nj)) < 4e-6:
                raise GeometryError(
                    'Visible arrangement cells are below the side-sampling clearance; thin geometry is unresolved.'
                )
    # Two sample distances must agree: thin/unresolved features are refused.
    results = []
    for delta in (2e-6, 5e-7):
        plus, rp = _inside(centers + delta * normals, triangles, fill_rule)
        minus, rm = _inside(centers - delta * normals, triangles, fill_rule)
        residual = max(residual, rp, rm)
        results.append((plus, minus))
    if any(not np.array_equal(a, b) for a, b in zip(*results)):
        raise GeometryError(
            'Visible surface has features below the sampling tolerance; exterior classification is unresolved.'
        )
    plus, minus = results[-1]
    kept = defaultdict(list)
    directions = {}
    for i, (fi, cell, _) in enumerate(candidates):
        if plus[i] == minus[i]:
            continue
        # Coplanar overlapping source sheets have deterministic first ownership.
        if any(
            abs((centers[i] - charts[j][0]) @ charts[j][2]) < EPS
            and abs(charts[j][2] @ charts[fi][2]) > 1 - EPS
            and _contains((centers[i] - charts[j][0]) @ charts[j][1], charts[j][3], fill_rule)
            for j in range(fi)
        ):
            continue
        kept[fi].append(cell)
        directions[fi] = -1 if plus[i] else 1
    out = []
    source_faces = []
    for fi, polygons in kept.items():
        center, basis, _, _ = charts[fi]
        merged = _merge(polygons, allow_holes=decompose_holes)
        if decompose_holes and any(sum(_cross(a, b) for a, b in zip(q, np.roll(q, -1, axis=0))) < 0 for q in merged):
            merged = polygons
        for q in merged:
            out.append(center + q[:: directions[fi]] @ basis.T)
            source_faces.append(fi)
    if not out or len(out) > 250:
        raise GeometryError('Visible surface is empty or exceeds the 250 simple-face net limit.')
    # Weld geometric intersections, then conform all face boundaries at T joins.
    vertices = []
    faces = []
    for poly in out:
        face = []
        for point in poly:
            found = next((i for i, v in enumerate(vertices) if np.linalg.norm(v - point) < EPS), None)
            if found is None:
                found = len(vertices)
                vertices.append(point)
            face.append(found)
        faces.append(face)
    vertices = np.asarray(vertices)
    conformed = []
    for face in faces:
        cycle = []
        for a, b in zip(face, face[1:] + face[:1]):
            u = vertices[b] - vertices[a]
            length = float(u @ u)
            ts = (vertices - vertices[a]) @ u / length
            on = (
                (ts >= -EPS) & (ts < 1 - EPS) & (np.linalg.norm(vertices - vertices[a] - ts[:, None] * u, axis=1) < EPS)
            )
            cycle.extend(sorted(np.flatnonzero(on).tolist(), key=lambda i: ts[i]))
        conformed.append(cycle)
    edges = sorted({tuple(sorted((a, b))) for f in conformed for a, b in zip(f, f[1:] + f[:1])})
    result = {
        'id': str(uuid.uuid4()),
        'name': 'Visible surface of ' + model['name'],
        'dimension': 3,
        'embeddingDimension': 3,
        'interpretation': 'generalized-complex',
        'vertices': (origin + vertices * span).tolist(),
        'faces': conformed,
        'edges': [list(e) for e in edges],
        'cells': [],
        'numeric': {'mode': 'float64-approximate', 'tolerance': EPS, 'certified': False},
        'metadata': {},
    }
    from .generalized_nets import _shell_geometry

    try:
        _shell_geometry(result)
    except GeometryError as error:
        raise GeometryError('Visible surface is unresolved (closure/manifold check): ' + str(error)) from error
    component_for = {fi: i for i, g in enumerate(groups) for fi in g}
    colors = model.get('metadata', {}).get('offColors', {}).get('faces', [])
    if colors:
        result['metadata']['offColors'] = {
            'faces': [deepcopy(colors[f]) if f < len(colors) else None for f in source_faces]
        }
    adjacency = defaultdict(set)
    edge_faces = defaultdict(list)
    for fi, f in enumerate(conformed):
        for a, b in zip(f, f[1:] + f[:1]):
            edge_faces[tuple(sorted((a, b)))].append(fi)
    for a, b in edge_faces.values():
        adjacency[a].add(b)
        adjacency[b].add(a)
    remaining = set(range(len(conformed)))
    shells = []
    while remaining:
        queue = [min(remaining)]
        shell = set()
        while queue:
            a = queue.pop()
            if a in shell:
                continue
            shell.add(a)
            queue.extend(adjacency[a] - shell)
        remaining -= shell
        shells.append(shell)
    euler = len(vertices) - len(edges) + len(conformed)
    original_ids = [next((i for i, v in enumerate(p) if np.linalg.norm(v - point) < EPS), None) for point in vertices]
    from .generalized_nets import _triangles_cached

    triangle_count = 0
    for f in conformed:
        cloud = vertices[f]
        _, _, axes = np.linalg.svd(cloud - cloud[0], full_matrices=False)
        triangle_count += len(_triangles_cached(tuple(map(tuple, (cloud - cloud[0]) @ axes[:2].T))))
    result['metadata']['visibleSurface'] = {
        'version': 1,
        'fillRule': fill_rule,
        'solidPolicy': 'union of edge-connected component interiors',
        'sourceId': model['id'],
        'sourceFingerprint': identity(model),
        'sourceFaceIds': source_faces,
        'sourceComponentIds': [component_for[f] for f in source_faces],
        'faces': len(out),
        'arrangementPieces': cell_count,
        'closed': True,
        'shells': len(shells),
        'eulerCharacteristic': euler,
        'totalGenus': len(shells) - euler // 2,
        'sourceVertexIds': original_ids,
        'triangles': triangle_count,
        'maxWindingResidual': residual,
        'maxPlanarityResidual': max_planarity,
        'normalizedTolerance': EPS,
        'sampleDistances': [2e-6, 5e-7],
        'coplanarOwnership': 'first source face; merge within each source face to preserve colors',
    }
    result['validation'] = validate(result)
    result['fingerprint'] = identity(result)
    return record(result, model, 'visible-surface', {'fill_rule': fill_rule})


def unfold_visible_surface(model, **params):
    """Cut between source tips; preserve each spike's fan where it is usable."""
    from .generalized_nets import unfold_generalized

    params.pop('hinges', None)
    meta = model['metadata']['visibleSurface']
    tips = meta.get('sourceVertexIds', [])
    owners = []
    for fi, f in enumerate(model['faces']):
        source = [v for v in f if v < len(tips) and tips[v] is not None]
        owners.append(('tip', source[0]) if len(source) == 1 else ('face', fi))
    adjacency = defaultdict(list)
    lookup = {tuple(sorted(e)): i for i, e in enumerate(model['edges'])}
    for fi, f in enumerate(model['faces']):
        for a, b in zip(f, f[1:] + f[:1]):
            adjacency[lookup[tuple(sorted((a, b)))]].append(fi)
    representatives = list(range(len(owners)))

    def root(i):
        while representatives[i] != i:
            i = representatives[i]
        return i

    hinges = []
    for edge, (a, b) in adjacency.items():
        if owners[a] == owners[b] and root(a) != root(b):
            representatives[root(a)] = root(b)
            hinges.append(edge)
    net = unfold_generalized(model, hinges=hinges, **params)
    # A general concave tip is allowed; split any overlapping group completely.
    if net['hasOverlap']:
        bad = {f['component'] for f in net['faces'] if any(f['id'] in pair for pair in net['overlapPairs'])}
        components = {f['id']: f['component'] for f in net['faces']}
        hinges = [e for e in hinges if components[adjacency[e][0]] not in bad]
        net = unfold_generalized(model, hinges=hinges, **params)
    if net['tabs'] and params.get('tab_options') is None:
        from .visible_surface_tabs import paper_tabs

        net = paper_tabs(model, net)
    net['visibleSurface'] = {**meta, 'paperPieces': len(net['components'])}
    return net


def _contains(p, q, rule):
    winding = 0
    for a, b in zip(q, np.roll(q, -1, axis=0)):
        side = _cross(b - a, p - a)
        if a[1] <= p[1] < b[1] and side > 0:
            winding += 1
        elif b[1] <= p[1] < a[1] and side < 0:
            winding -= 1
    return winding != 0 if rule == 'nonzero' else winding % 2 != 0
