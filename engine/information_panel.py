"""Source-space numerical information tables, grouped by verified symmetry orbits."""

from collections import Counter, defaultdict
import numpy as np
from .geometry import (
    GeometryError,
    TOLERANCE,
    validate,
    identity,
    intrinsic_measures,
    polygon_area,
    hull,
    canonical_cycle,
)
from .measurements import dihedrals, facet_normals, entity_frame
from .element_types import element_types
from .analysis_cache import AnalysisCache

EPS = TOLERANCE * 8
_cache = AnalysisCache(max_entries=4)


def polygon_measure(points):
    p = np.asarray(points, dtype=float)
    _, _, axes = np.linalg.svd(p - p.mean(0), full_matrices=False)
    xy = (p - p.mean(0)) @ axes[:2].T
    cross = lambda a, b: a[..., 0] * b[..., 1] - a[..., 1] * b[..., 0]
    signed_area = float(np.sum(cross(xy, np.roll(xy, -1, axis=0))))
    orientation = 1 if signed_area >= 0 else -1
    oriented = abs(signed_area) > EPS * float(np.max(np.ptp(p, axis=0))) ** 2
    incoming = xy - np.roll(xy, 1, axis=0)
    outgoing = np.roll(xy, -1, axis=0) - xy
    turns = np.arctan2(orientation * cross(incoming, outgoing), np.sum(incoming * outgoing, axis=1))
    return dict(
        sideLengths=np.linalg.norm(np.roll(p, -1, axis=0) - p, axis=1).tolist(),
        interiorAngles=(180 - np.degrees(turns)).tolist() if oriented else [None] * len(p),
        turningNumber=float(np.sum(turns) / (2 * np.pi)) if oriented else None,
        area=polygon_area(p),
    )


def radii(model, p):
    origin = p.mean(0)
    scale = float(np.max(np.ptp(p, axis=0)))
    q = (p - origin) / scale
    d = q.shape[1]
    center = np.linalg.lstsq(2 * (q - q[0]), np.sum(q * q, axis=1) - q[0] @ q[0], rcond=TOLERANCE)[0]
    distances = np.linalg.norm(q - center, axis=1)
    r = float(np.mean(distances))
    error = float(np.max(abs(distances - r)))
    circum = dict(
        value=r * scale if error <= EPS else None,
        residual=error * scale,
        center=(origin + center * scale).tolist(),
        definition='Common vertex sphere in the full source affine space.',
    )
    mid = dict(
        value=None,
        residual=None,
        definition='Sphere concentric with the circumsphere and tangent to every source edge segment.',
    )
    if circum['value'] is not None and model['edges']:
        a = q[np.asarray(model['edges'])[:, 0]]
        v = q[np.asarray(model['edges'])[:, 1]] - a
        t = np.sum((center - a) * v, axis=1) / np.sum(v * v, axis=1)
        distances = np.linalg.norm(a + t[:, None] * v - center, axis=1)
        r = float(np.mean(distances))
        error = float(np.max(abs(distances - r)))
        mid.update(
            value=r * scale if error <= EPS and np.all(t >= -EPS) and np.all(t <= 1 + EPS) else None,
            residual=error * scale,
        )
    insphere = dict(
        value=None,
        residual=None,
        definition='Positive sphere tangent to every convex supporting facet; center solved independently.',
    )
    if model['interpretation'] == 'convex-polytope':
        normals = np.asarray(facet_normals(model))
        facets = (
            model['faces'] if d == 3 else [sorted({v for f in c for v in model['faces'][f]}) for c in model['cells']]
        )
        heights = np.asarray([normal @ q[ids[0]] for normal, ids in zip(normals, facets)])
        matrix = np.column_stack((normals, np.ones(len(normals))))
        fit = np.linalg.lstsq(matrix, heights, rcond=TOLERANCE)[0]
        error = float(np.max(abs(matrix @ fit - heights)))
        insphere.update(
            value=float(fit[-1]) * scale
            if error <= EPS and fit[-1] > EPS and np.linalg.matrix_rank(matrix) == d + 1
            else None,
            residual=error * scale,
            center=(origin + fit[:-1] * scale).tolist(),
        )
    return dict(circumradius=circum, midradius=mid, inradius=insphere, tolerance=EPS * scale)


def surface_topology(model):
    result = dict(
        euler=len(model['vertices']) - len(model['edges']) + len(model['faces']),
        genus=None,
        orientableClosed=False,
        components=None,
    )
    owners = defaultdict(list)
    links = defaultdict(list)
    for f, cycle in enumerate(model['faces']):
        for i, (a, b) in enumerate(zip(cycle, cycle[1:] + cycle[:1])):
            owners[tuple(sorted((a, b)))].append((f, 1 if a < b else -1))
            links[a].append((cycle[i - 1], b))
    if set(owners) != {tuple(sorted(e)) for e in model['edges']} or any(
        len(v) != 2 or v[0][0] == v[1][0] for v in owners.values()
    ):
        return result
    # Each vertex link must be one cycle, excluding pinched pseudomanifolds.
    for v in range(len(model['vertices'])):
        graph = defaultdict(list)
        for a, b in links[v]:
            graph[a].append(b)
            graph[b].append(a)
        if not graph or any(len(n) != 2 for n in graph.values()):
            return result
        seen = set()
        todo = [next(iter(graph))]
        while todo:
            a = todo.pop()
            if a in seen:
                continue
            seen.add(a)
            todo.extend(graph[a])
        if len(seen) != len(graph):
            return result
    neighbors = defaultdict(list)
    for (a, sa), (b, sb) in owners.values():
        neighbors[a].append((b, -sa * sb))
        neighbors[b].append((a, -sa * sb))
    signs = {}
    components = 0
    for root in range(len(model['faces'])):
        if root in signs:
            continue
        components += 1
        signs[root] = 1
        todo = [root]
        while todo:
            a = todo.pop()
            for b, relation in neighbors[a]:
                wanted = signs[a] * relation
                if b in signs and signs[b] != wanted:
                    return result
                if b not in signs:
                    signs[b] = wanted
                    todo.append(b)
    genus = (2 * components - result['euler']) / 2
    if genus < 0 or not genus.is_integer():
        return result
    return {**result, 'genus': int(genus), 'components': components, 'orientableClosed': True}


def _compute(model):
    if (
        model.get('dimension') not in (3, 4)
        or model.get('embeddingDimension', model['dimension']) != model['dimension']
    ):
        raise GeometryError('Information tables require full-dimensional intrinsic 3D or 4D source geometry.')
    if not validate(model)['passed']:
        raise GeometryError('Information tables require valid source incidence.')
    if len(model['vertices']) > 10000 or sum(len(model[k]) for k in ('edges', 'faces', 'cells')) > 20000:
        raise GeometryError('Information table exceeds 10,000 vertices or 20,000 boundary entities.')
    p = np.asarray(model['vertices'], dtype=float)
    if np.linalg.matrix_rank((p - p.mean(0)) / np.max(np.ptp(p, axis=0)), tol=TOLERANCE) != model['dimension']:
        raise GeometryError('Information table requires full affine rank.')
    convex = model['interpretation'] == 'convex-polytope'
    measure = intrinsic_measures(model) if convex else None
    types = element_types(model)
    rows = {kind: [] for kind in ('edge', 'face', 'cell')}
    maps = {}
    if types['available']:
        for kind in rows:
            maps[kind] = {i: t['typeId'] for t in types['types'][kind] for i in t['ids']}
    angles = dihedrals(model)['records'] if convex else []
    facets = 'face' if model['dimension'] == 3 else 'cell'
    ridge = 'edge' if model['dimension'] == 3 else 'face'
    by_ridge = defaultdict(list)
    if types['available']:
        for record in angles:
            pair = sorted(maps[facets][f] for f in record['facets'])
            key = (maps[ridge][record['ridge']], *pair)
            by_ridge[key].append(record['value'])
        for kind in rows:
            for t in types['types'][kind]:
                i = t['representative']
                row = dict(typeId=t['typeId'], count=t['count'], representative=i, shape=t['description'])
                if kind == 'edge':
                    lengths = [float(np.linalg.norm(p[a] - p[b])) for a, b in (model['edges'][e] for e in t['ids'])]
                    row.update(length=min(lengths), lengthRange=[min(lengths), max(lengths)])
                if kind == 'face':
                    row.update(polygon_measure(p[model['faces'][i]]))
                    if (
                        len(row['sideLengths']) == 5
                        and row['turningNumber'] is not None
                        and abs(row['turningNumber'] - 2) <= EPS
                    ):
                        row['shape'] = 'pentagram (ordered star cycle)'
                    elif (
                        len(row['sideLengths']) == 4
                        and all(a is not None for a in row['interiorAngles'])
                        and np.ptp(row['sideLengths']) <= EPS * np.max(np.ptp(p, axis=0))
                        and max(abs(a - 90) for a in row['interiorAngles']) <= 1e-5
                    ):
                        row['shape'] = 'square'
                if kind == ridge:
                    row['dihedrals'] = [
                        dict(adjacentTypes=list(key[1:]), adjacentKind=facets, min=min(values), max=max(values))
                        for key, values in by_ridge.items()
                        if key[0] == t['typeId']
                    ]
                if kind == 'cell':
                    frame = entity_frame(model, dict(kind='cell', index=i), p)
                    cloud = p[frame['vertices']]
                    faces = model['cells'][i]
                    row.update(
                        volume=None,
                        surfaceArea=sum(polygon_area(p[model['faces'][f]]) for f in faces),
                        surfaceAreaDefinition='absolute algebraic cycle area sum',
                    )
                    reference = hull((cloud - frame['origin']) @ frame['basis'])
                    remap = {v: j for j, v in enumerate(frame['vertices'])}
                    boundary = Counter(canonical_cycle([remap[v] for v in model['faces'][f]]) for f in faces)
                    if len(reference['vertices']) == len(cloud) and boundary == Counter(
                        canonical_cycle(f) for f in reference['faces']
                    ):
                        row['volume'] = reference['measure']['content']
                        row['surfaceAreaDefinition'] = (
                            'ordinary area of the independently reconstructed convex cell boundary'
                        )
                        histogram = Counter(len(model['faces'][f]) for f in faces)
                        known = {
                            (4, ((3, 4),)): 'tetrahedron',
                            (8, ((4, 6),)): 'cube',
                            (6, ((3, 8),)): 'octahedron',
                            (20, ((5, 12),)): 'dodecahedron',
                            (12, ((3, 20),)): 'icosahedron',
                        }
                        name = known.get((len(cloud), tuple(sorted(histogram.items()))))
                        metrics = [polygon_measure(p[model['faces'][f]]) for f in faces]
                        sides = [x for m in metrics for x in m['sideLengths']]
                        regular = all(np.ptp(m['interiorAngles']) <= 1e-5 for m in metrics) and np.ptp(
                            sides
                        ) <= EPS * np.max(np.ptp(p, axis=0))
                        if name and regular:
                            row['shape'] = name
                rows[kind].append(row)
    density = dict(
        value=None,
        definition='Absolute signed source-boundary winding at the source vertex mean.',
        status='unavailable',
    )
    topology = (
        surface_topology(model)
        if model['dimension'] == 3
        else dict(euler=len(p) - len(model['edges']) + len(model['faces']) - len(model['cells']), genus=None)
    )
    algebraic = None
    if model['dimension'] == 3:
        from .generalized_density import density_info

        try:
            report = density_info(model)
            if not convex:
                algebraic = report['measures']
            density.update(
                value=report['pointDensity']['densityMagnitude'],
                signed=report['pointDensity']['signedWinding'],
                point=report['parameters']['point'],
                status=report['status'],
                windingApproximate=report['pointDensity']['windingNumberApproximate'],
            )
        except GeometryError as exc:
            density['status'] = str(exc)
    elif convex:
        density.update(
            value=1, definition='Multiplicity one of the independently reconstructed convex 4D body.', status='convex'
        )
    else:
        from .filled_sections import _cells, _degree4, LIMITS

        try:
            if not model['cells'] or len(model['cells']) > LIMITS['cells'] or len(model['faces']) > LIMITS['faces']:
                raise GeometryError(
                    '4D point density requires explicit closed cells within the density engine limits (600 cells, 2000 faces).'
                )
            scale = float(np.max(np.ptp(p, axis=0)))
            q = (p - p.mean(0)) / scale
            records = _cells(model, q)
            if any(abs(r['center'] @ r['normal']) <= EPS for r in records):
                raise GeometryError(
                    '4D mean point lies on a source cell hyperplane; density is unresolved at this query point.'
                )
            budget = [0]
            signed, residual = _degree4(np.zeros(4), records, budget)
            density.update(
                value=abs(signed),
                signed=signed,
                point=p.mean(0).tolist(),
                status='qualified (two independent 4D rays)',
                maxIntegerResidual=residual,
            )
            algebraic = dict(
                orientedAlgebraicContent4D=sum(
                    r['sign']
                    * float(r['center'] @ r['normal'])
                    * r['surface'].report['measures']['orientedAlgebraicVolume']
                    / 4
                    for r in records
                )
                * scale**4
            )
            for row in rows['cell']:
                row['algebraicVolume'] = (
                    records[row['representative']]['surface'].report['measures']['orientedAlgebraicVolume'] * scale**3
                )
        except GeometryError as exc:
            density['status'] = 'Unavailable: ' + str(exc)
    evidence = {
        key: types[key] for key in ('limits', 'tolerance', 'groupOrder', 'maxNormalizedVertexResidual') if key in types
    }
    return dict(
        sourceFingerprint=identity(model),
        dimension=model['dimension'],
        numericMode='float64-approximate',
        radii=radii(model, p),
        measure=measure,
        algebraicMeasures=algebraic,
        topology=topology,
        density=density,
        typeEvidence=evidence,
        typesAvailable=types['available'],
        typeStatus=types['status'],
        rows=rows,
        definitions=dict(
            types='Full incidence-preserving Euclidean symmetry orbits, including reflections.',
            angles='Oriented ordered-cycle interior angles in degrees (180 minus signed turn); unavailable for unresolved algebraic orientation.',
            area='Convex area for convex sources; absolute algebraic cycle area for generalized sources.',
            genus='Sum of genera of closed orientable combinatorial surface components; self-intersections do not change abstract topology.',
        ),
    )


def information_panel(model):
    return _cache.resolve(model, _compute)
