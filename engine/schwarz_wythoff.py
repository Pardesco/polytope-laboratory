"""Native ordered Schwarz-triangle boundaries; no supplied mesh construction."""

from collections import Counter, deque
from copy import deepcopy
from fractions import Fraction
from functools import lru_cache
from itertools import combinations
import hashlib
import json
import math
from pathlib import Path
import uuid

import numpy as np
from scipy.spatial import cKDTree

from .geometry import GeometryError, canonical_cycle, identity, validate
from .star_uniform4 import _cycle, _orbit, _polygon_data
from .wythoff import _OrbitIndex

DATA = Path(__file__).resolve().parent / 'catalog_data/goursat_wythoff/schwarz.json'
TOLERANCE = 1e-8
KINDS = ('vertices', 'edges', 'faces', 'cells')


def _require(ok, message):
    if not ok:
        raise GeometryError('Schwarz Wythoff: ' + message)


def _sha(value):
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()
    ).hexdigest()


def manifest():
    return json.loads(DATA.read_text(encoding='utf-8'))


@lru_cache(maxsize=75)
def triangle_group(symbol, order):
    _require(
        type(symbol) is str and symbol.count('|') == 1,
        'a three-mark reflection Wythoff symbol is required; snubs are unsupported.',
    )
    left, right = symbol.split('|')
    rings = len(left.split())
    try:
        values = [Fraction(v) for v in (left + ' ' + right).split()]
    except (ValueError, ZeroDivisionError) as error:
        raise GeometryError('Schwarz Wythoff: invalid rational triangle mark.') from error
    _require(
        len(values) == 3 and 1 <= rings <= 3,
        'three marks and at least one ring are required; rotation-only snubs are unsupported.',
    )
    _require(
        type(order) is int
        and order in (24, 48, 120)
        and all(v.numerator in (2, 3, 4, 5) and 0 < v.denominator < v.numerator for v in values),
        'only finite tetrahedral, octahedral and icosahedral triangles are supported.',
    )
    gram = np.eye(3)
    pairs = ((1, 2), (0, 2), (0, 1))
    for (a, b), value in zip(pairs, values):
        gram[a, b] = gram[b, a] = -math.cos(math.pi / float(value))
    try:
        roots = np.linalg.cholesky(gram)
    except np.linalg.LinAlgError as error:
        raise GeometryError('Schwarz Wythoff: triangle Gram matrix is not positive definite.') from error
    expected_roots = {24: 12, 48: 18, 120: 30}[order]
    points = list(roots.copy())
    pending = deque(points)
    index = _OrbitIndex()
    for point in points:
        index.add(point)
    while pending:
        point = pending.popleft()
        for root in roots:
            other = point - 2 * np.dot(point, root) * root
            if index.find(other) is None:
                _require(len(points) < expected_roots, 'root orbit exceeds its finite family bound.')
                points.append(other)
                pending.append(other)
                index.add(other)
    _require(len(points) == expected_roots, 'root orbit disagrees with the finite family.')
    points = np.asarray(points)
    tree = cKDTree(points)
    actions = []
    residual = 0.0
    for root in roots:
        distances, ids = tree.query(points - 2 * np.outer(points @ root, root))
        residual = max(residual, float(max(distances)))
        _require(
            residual < TOLERANCE and len(set(ids)) == len(points) and np.array_equal(ids[ids], np.arange(len(points))),
            'root reflection is unresolved.',
        )
        actions.append(ids)
    frames = {tuple(range(3))}
    pending = deque(frames)
    while pending:
        frame = pending.popleft()
        for action in actions:
            other = tuple(int(action[v]) for v in frame)
            if other not in frames:
                _require(len(frames) < order, 'root-frame action exceeds the finite family order.')
                frames.add(other)
                pending.append(other)
    _require(len(frames) == order, 'root-frame action does not exhaust the finite family order.')
    return (
        roots,
        values,
        rings,
        {
            'groupOrder': order,
            'rootCount': len(points),
            'rootActionResidual': residual,
            'faithfulRootFrameCount': len(frames),
        },
    )


def triangle_boundary(symbol, order):
    roots, values, rings, group = triangle_group(symbol, order)
    seed = np.linalg.solve(roots, [0.5 if i < rings else 0 for i in range(3)])
    seed /= np.linalg.norm(seed)
    points = [seed]
    pending = deque(points)
    index = _OrbitIndex()
    index.add(seed)
    while pending:
        point = pending.popleft()
        for root in roots:
            other = point - 2 * np.dot(point, root) * root
            if index.find(other) is None:
                _require(len(points) < order, 'vertex orbit exceeds the finite group bound.')
                points.append(other)
                pending.append(other)
                index.add(other)
    points = np.asarray(points)
    tree = cKDTree(points)
    actions = []
    residual = 0.0
    for root in roots:
        distances, ids = tree.query(points - 2 * np.outer(points @ root, root))
        residual = max(residual, float(max(distances)))
        _require(
            residual < TOLERANCE and len(set(ids)) == len(points) and np.array_equal(ids[ids], np.arange(len(points))),
            'vertex reflection is unresolved.',
        )
        actions.append(ids.tolist())
    edges = sorted(set().union(*(_orbit((0, actions[n][0]), actions) for n in range(rings))))
    _require(all(len(set(e)) == 2 for e in edges), 'a ring collapses an edge.')
    edge_lookup = {edge: i for i, edge in enumerate(edges)}
    edge_actions = [[edge_lookup[tuple(sorted(action[v] for v in edge))] for edge in edges] for action in actions]
    faces = set()
    omitted = []
    pairs = ((1, 2), (0, 2), (0, 1))
    for a, b in combinations(range(3), 2):
        if a >= rings:
            continue
        local = set()
        for n in (a, b):
            if n < rings:
                local.update(
                    _orbit((edge_lookup[tuple(sorted((0, actions[n][0])))],), [edge_actions[a], edge_actions[b]])
                )
        local_edges = [edges[e[0]] for e in local]
        vertices = {v for e in local_edges for v in e}
        expected = values[pairs.index((a, b))].numerator * (2 if b < rings else 1)
        if len(vertices) != expected or len(vertices) < 3:
            omitted.append(
                {
                    'nodes': [a, b],
                    'expectedPolygonVertices': expected,
                    'actualVertices': len(vertices),
                    'reason': 'Collapsed alternating polygon is excluded, never welded or traversed twice.',
                }
            )
            continue
        cycle = _cycle(local_edges)
        reached = {canonical_cycle(cycle)}
        pending = deque(reached)
        while pending:
            row = pending.popleft()
            for action in actions:
                other = canonical_cycle([action[v] for v in row])
                if other not in reached:
                    reached.add(other)
                    pending.append(other)
        faces.update(reached)
    model = {
        'id': str(uuid.uuid4()),
        'name': 'Schwarz Wythoff boundary',
        'dimension': 3,
        'embeddingDimension': 3,
        'interpretation': 'generalized-complex',
        'vertices': points.tolist(),
        'edges': [list(e) for e in edges],
        'faces': [list(f) for f in sorted(faces)],
        'cells': [],
        'metadata': {},
        'numeric': {
            'mode': 'float64-approximate',
            'certified': False,
            'tolerance': TOLERANCE,
            'algorithm': 'rational Schwarz reflections + ordered dihedral face orbits',
        },
        'provenance': {
            'operation': 'schwarz-wythoff',
            'algorithmVersion': '1',
            'parameters': {'symbol': symbol, 'groupOrder': order},
        },
    }
    evidence = qualify(model, symbol, order)
    evidence.update(group, excludedCollapsedAlternatingFaces=omitted, reflectionActionResidual=residual)
    model['metadata']['schwarzVerification'] = evidence
    return model


def qualify(model, symbol, order):
    from .catalog_audit import rational_wythoff_counts
    from .goursat_wythoff import _flatness

    expected, _ = rational_wythoff_counts(symbol, order)
    _require(
        [len(model[k]) for k in KINDS] == expected,
        'ordered boundary counts differ from independent matrix-group polygon cosets.',
    )
    _require(validate(model)['passed'], 'boundary incidence failed validation.')
    p = np.asarray(model['vertices'], dtype=float)
    p /= np.max(np.linalg.norm(p, axis=1))
    _require(np.linalg.matrix_rank(p - p.mean(axis=0), tol=TOLERANCE) == 3, 'coordinates do not span three dimensions.')
    _require(not cKDTree(p).query_pairs(TOLERANCE), 'coincident vertices; no welding was applied.')
    edges, faces = model['edges'], model['faces']
    lengths = np.linalg.norm(p[np.asarray(edges)[:, 0]] - p[np.asarray(edges)[:, 1]], axis=1)
    spread = float(np.ptp(lengths) / np.mean(lengths))
    _require(spread < TOLERANCE and min(lengths) > TOLERANCE, 'unequal or collapsed edges.')
    for rows in (edges, faces):
        _require(
            len({tuple(sorted(row)) for row in rows}) == len(rows),
            'coincident element vertex sets; no merging was applied.',
        )
    flatness = _flatness(p, faces, 2)
    polygons = [_polygon_data(p, face) for face in faces]
    _require(max(max(row[1:]) for row in polygons) < TOLERANCE, 'regular polygon residual exceeds tolerance.')
    edge_lookup = {tuple(sorted(e)): i for i, e in enumerate(edges)}
    face_lookup = {canonical_cycle(f): i for i, f in enumerate(faces)}
    uses = Counter()
    links = [{} for _ in p]
    for face in faces:
        for i, v in enumerate(face):
            a = edge_lookup[tuple(sorted((v, face[i - 1])))]
            b = edge_lookup[tuple(sorted((v, face[(i + 1) % len(face)])))]
            links[v].setdefault(a, []).append(b)
            links[v].setdefault(b, []).append(a)
            uses[a] += 1
    _require(
        set(uses) == set(range(len(edges))) and all(n == 2 for n in uses.values()), 'every edge must have two faces.'
    )
    for v, graph in enumerate(links):
        _require(
            len(graph) >= 3 and all(len(n) == 2 for n in graph.values()), 'vertex link is collapsed, open or branched.'
        )
        reached = {next(iter(graph))}
        pending = list(reached)
        while pending:
            for n in graph[pending.pop()]:
                if n not in reached:
                    reached.add(n)
                    pending.append(n)
        _require(len(reached) == len(graph), 'vertex link has disconnected cycles.')
    roots, _, _, group = triangle_group(symbol, order)
    tree = cKDTree(p)
    actions = []
    residual = 0.0
    for root in roots:
        distances, perm = tree.query(p - 2 * np.outer(p @ root, root))
        residual = max(residual, float(max(distances)))
        _require(
            residual < TOLERANCE and len(set(perm)) == len(p) and np.array_equal(perm[perm], np.arange(len(p))),
            'literal vertex reflection failed.',
        )
        _require(
            all(tuple(sorted((int(perm[a]), int(perm[b])))) in edge_lookup for a, b in edges),
            'reflection fails literal edges.',
        )
        _require(
            all(canonical_cycle([int(perm[v]) for v in f]) in face_lookup for f in faces),
            'reflection fails ordered face cycles.',
        )
        actions.append(perm)
    reached = {0}
    pending = [0]
    while pending:
        v = pending.pop()
        for action in actions:
            n = int(action[v])
            if n not in reached:
                reached.add(n)
                pending.append(n)
    _require(len(reached) == len(p), 'reflection action is not vertex transitive.')
    return {
        'status': 'passed',
        'exact': False,
        'tolerance': TOLERANCE,
        **group,
        'counts': expected,
        'vertexTransitive': True,
        'allThreeReflectionsPreserveLiteralIncidence': True,
        'reflectionActionResidual': residual,
        'edgeRelativeSpread': spread,
        'facePlanarityRelativeResidual': flatness,
        'maxFaceRadialRelativeSpread': max(row[1] for row in polygons),
        'maxFaceAngularResidual': max(row[2] for row in polygons),
        'facePolygonCounts': dict(Counter(row[0] for row in polygons)),
        'allVertexLinksSingleCycles': True,
        'facesPerEdge': 2,
        'coincidentVertices': 0,
        'coincidentElementVertexSets': 0,
        'weldingApplied': False,
        'coordinateSha256': _sha(model['vertices']),
        'incidenceSha256': _sha({k: model[k] for k in KINDS[1:]}),
    }


def compare_boundary(model, source):
    """Independent metric frame search includes literal edges and ordered cycles."""
    _require([len(model[k]) for k in KINDS] == [len(source[k]) for k in KINDS], 'reference boundary counts differ.')
    p, q = (np.asarray(m['vertices'], dtype=float) for m in (model, source))
    p = p - p.mean(axis=0)
    q = q - q.mean(axis=0)
    p /= np.max(np.linalg.norm(p, axis=1))
    q /= np.max(np.linalg.norm(q, axis=1))
    _require(p.shape == q.shape and p.shape[1] == 3, 'reference comparison requires three-dimensional boundaries.')
    basis = []
    for k in range(3):
        basis.append(
            max(
                (i for i in range(len(p)) if i not in basis),
                key=lambda i: np.linalg.svd(p[basis + [i]], compute_uv=False)[-1],
            )
        )
    _require(np.linalg.matrix_rank(p[basis], tol=TOLERANCE) == 3, 'reference comparison requires a spanning frame.')
    gram = p[basis] @ p[basis].T
    tree = cKDTree(q)
    candidates = []
    edges = {tuple(sorted(e)) for e in source['edges']}
    faces = {canonical_cycle(f) for f in source['faces']}

    def visit(target):
        if len(target) == 3:
            matrix = np.linalg.solve(p[basis], q[target])
            if np.max(abs(matrix @ matrix.T - np.eye(3))) >= TOLERANCE:
                return
            distances, perm = tree.query(p @ matrix)
            if max(distances) >= TOLERANCE or len(set(perm)) != len(q):
                return
            if {tuple(sorted((int(perm[a]), int(perm[b])))) for a, b in model['edges']} != edges:
                return
            if {canonical_cycle([int(perm[v]) for v in f]) for f in model['faces']} != faces:
                return
            candidates.append(
                {
                    'status': 'passed',
                    'exact': False,
                    'normalizedVertexResidual': float(max(distances)),
                    'orderedFaceCyclesMatched': True,
                    'edgesMatched': True,
                    'scaleAndRigidMotionAllowed': True,
                }
            )
            return
        k = len(target)
        for i in range(len(q)):
            if i in target or abs(np.dot(q[i], q[i]) - gram[k, k]) >= TOLERANCE:
                continue
            if target and np.max(abs(q[target] @ q[i] - gram[k, :k])) >= TOLERANCE:
                continue
            visit(target + [i])
            if candidates:
                return

    visit([])
    _require(bool(candidates), 'reference coordinates and ordered boundary have no resolved isometry.')
    return candidates[0]


def _definition(row):
    from .library_navigation import crosswalk

    return crosswalk().get(row['uniformNumber'])


def schwarz_catalog():
    return [
        {
            **deepcopy(row),
            'family': 'Schwarz triangle Wythoff (generated)',
            'uniform': True,
            'vertexTransitive': True,
            'aliases': ['U' + str(row['uniformNumber']), row['symbol'], row['sourceKey']],
            'constructionEvidence': 'Native reflection seed and ordered face orbits; independent matrix-group counts and literal reflection/link checks; float64, uncertified',
        }
        for row in manifest()['entries']
        if _sha(_definition(row)) == row['definitionSha256']
    ]


@lru_cache(maxsize=4)
def _build(key, manifest_sha):
    row = next((r for r in manifest()['entries'] if r['key'] == key), None)
    if row is None:
        return None
    definition = _definition(row)
    _require(_sha(definition) == row['definitionSha256'], 'triangle definition changed; requalification is required.')
    model = triangle_boundary(definition['wythoff'], row['groupOrder'])
    _require([len(model[k]) for k in KINDS] == row['counts'], 'registered count expectation changed.')
    if row['convex']:
        from .geometry import hull

        convex = hull(model['vertices'])
        _require(
            {canonical_cycle(f) for f in convex['faces']} == {canonical_cycle(f) for f in model['faces']},
            'convex classification disagrees with the complete generated boundary.',
        )
        _require(convex['vertices'] == model['vertices'], 'convex verification changed the generated vertex indices.')
        model['interpretation'] = 'convex-polytope'
        model.update({k: convex[k] for k in ('facetVertices', 'facetEquations')})
    model['name'] = row['name']
    model['metadata'].update(next(r for r in schwarz_catalog() if r['key'] == key))
    model['metadata']['generatedCatalogKey'] = key
    model['provenance']['schwarzQualification'] = {
        'algorithmVersion': '1',
        'definitionSha256': row['definitionSha256'],
        'trancheSha256': manifest_sha,
        'identity': row['identity'],
        'wythoffSymbol': definition['wythoff'],
        'referenceSourceKey': row['sourceKey'],
        'referenceSourceAssetSha256': row['sourceAssetSha256'],
        'referenceComparison': deepcopy(row['referenceComparison']),
        'numericContract': 'Float64 reflection predicates and finite integer root actions; no exact certificate. Reference comparison is retained qualification evidence for the pinned source asset.',
    }
    model['validation'] = validate(model)
    _require(model['validation']['passed'], 'generated model validation failed.')
    model['fingerprint'] = identity(model)
    _require(
        hashlib.sha256(DATA.read_bytes()).hexdigest() == manifest_sha,
        'triangle tranche changed during generation; retry.',
    )
    return model


def load_schwarz_wythoff(key):
    if type(key) is not str or not key.startswith('schwarz-wythoff-'):
        return None
    row = next((r for r in manifest()['entries'] if r['key'] == key), None)
    if row is None:
        return None
    _require(
        _sha(_definition(row)) == row['definitionSha256'], 'triangle definition changed; requalification is required.'
    )
    model = deepcopy(_build(key, hashlib.sha256(DATA.read_bytes()).hexdigest()))
    model['id'] = str(uuid.uuid4())
    return model


def generated_crosswalk():
    value = manifest()
    rows = []
    for row in value['entries']:
        current = _sha(_definition(row)) == row['definitionSha256']
        rows.append(
            {
                **row,
                'coxeterDynkinSymbol': row['symbol'],
                'definitionCurrent': current,
                'status': 'registered-generated-rechecked-on-load' if current else 'stale-definition',
                'baselineIdentity': row['identity'],
                'releaseQualified': False,
            }
        )
    return {
        'schemaVersion': 1,
        'id': 'schwarz-wythoff-u63',
        'label': 'Schwarz triangle Wythoff, 63 generated U identities',
        'entries': rows,
        'registeredGeneratedIdentities': sum(r['definitionCurrent'] for r in rows),
        'newMathematicalIdentities': 0,
        'baselineCoverageIncrement': 0,
        'manifestSha256': hashlib.sha256(DATA.read_bytes()).hexdigest(),
        'queue': value['queue'],
        'scope': '63 existing uniform3:U identities gain native ordered-boundary generation and independent numerical checks. Supplied catalog keys are retained. The 12 snub/exceptional entries remain available from existing providers; this does not change corpus release qualification.',
    }
