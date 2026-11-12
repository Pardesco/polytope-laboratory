"""Bounded Goursat star tranche; independent root actions qualify native boundaries."""

from collections import Counter, deque
from copy import deepcopy
from fractions import Fraction
from functools import lru_cache
from itertools import combinations
import hashlib
import json
import math
from pathlib import Path

import numpy as np
from scipy.spatial import cKDTree

from .geometry import GeometryError, canonical_cycle
from .star_uniform4 import manifest as star_manifest, load_star_uniform4, _polygon_data, boundary_evidence
from .wythoff import _OrbitIndex

DATA = Path(__file__).resolve().parent / 'catalog_data/goursat_wythoff/tranche.json'
KINDS = ('vertices', 'edges', 'faces', 'cells')
TOLERANCE = 1e-8


def _require(ok, message):
    if not ok:
        raise GeometryError('Goursat Wythoff: ' + message)


def _sha(value):
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()
    ).hexdigest()


def tranche():
    return json.loads(DATA.read_text(encoding='utf-8'))


def _entries():
    source = {e['bowers']: e for e in star_manifest()['entries']}
    return [(row, source.get(row['bowers'])) for row in tranche()['entries']]


def goursat_catalog():
    rows = []
    for row, source in _entries():
        if _sha(source) != row['definitionSha256']:
            continue
        entry = deepcopy(source)
        entry.update(
            key=row['key'],
            family='Goursat star Wythoff (verified tranche)',
            sourceKey=source['key'],
            constructionEvidence='Independent finite root action, parabolic cosets and local links; float64, uncertified',
        )
        rows.append(entry)
    return rows


def goursat_expected_table():
    return {
        row['key']: {
            'counts': coset_counts(source['diagram'], source['rings'])['counts'],
            'basis': 'Independent finite root permutations and parabolic coset stabilizers; rational Goursat '
            + source['symbol'],
        }
        for row, source in _entries()
        if _sha(source) == row['definitionSha256']
    }


def _group_frames(actions, frame, nodes, bound=14400):
    seen = {tuple(frame)}
    pending = deque(seen)
    while pending:
        row = pending.popleft()
        for node in nodes:
            other = tuple(int(actions[node][v]) for v in row)
            if other not in seen:
                _require(len(seen) < bound, 'reflection subgroup exceeds its finite resource bound; no model returned.')
                seen.add(other)
                pending.append(other)
    return seen


@lru_cache(maxsize=40)
def root_group(diagram):
    """Faithful finite root action, independent of Wythoff seed/count tables."""
    _require(len(diagram) == 3, 'three rational branch marks required.')
    try:
        angles = [Fraction(m) for m in diagram]
    except (ValueError, TypeError, ZeroDivisionError) as error:
        raise GeometryError('Invalid Goursat branch mark.') from error
    _require(
        all(m.numerator in (3, 4, 5) and 1 <= m.denominator < m.numerator for m in angles),
        'only finite B4/F4/H4 rational chains are supported.',
    )
    marks = tuple(m.numerator for m in angles)
    if marks in ((3, 3, 4), (4, 3, 3)):
        expected_roots, expected_order = 32, 384
    elif marks == (3, 4, 3):
        expected_roots, expected_order = 48, 1152
    elif marks in ((3, 3, 5), (5, 3, 3), (3, 5, 5), (5, 5, 3), (5, 3, 5), (5, 5, 5)):
        expected_roots, expected_order = 120, 14400
    else:
        raise GeometryError('Goursat Wythoff: unsupported rational chain family; no model returned.')
    gram = np.eye(4)
    for i, m in enumerate(angles):
        gram[i, i + 1] = gram[i + 1, i] = -math.cos(math.pi / float(m))
    try:
        roots = np.linalg.cholesky(gram)
    except np.linalg.LinAlgError as error:
        raise GeometryError('Goursat mirror Gram matrix is not positive definite.') from error
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
                _require(
                    len(points) < expected_roots,
                    'root orbit exceeds its finite family; unsupported or numerically unresolved diagram.',
                )
                index.add(other)
                points.append(other)
                pending.append(other)
    _require(len(points) == expected_roots, 'root orbit disagrees with its finite family.')
    points = np.asarray(points)
    tree = cKDTree(points)
    actions = []
    residual = 0.0
    for root in roots:
        distances, ids = tree.query(points - 2 * np.outer(points @ root, root))
        residual = max(residual, float(max(distances)))
        _require(
            residual < TOLERANCE
            and len(set(ids)) == expected_roots
            and np.array_equal(ids[ids], np.arange(expected_roots)),
            'root reflection is unresolved.',
        )
        actions.append(ids)
    orders = {}
    for rank in range(5):
        for nodes in combinations(range(4), rank):
            orders[nodes] = len(_group_frames(actions, range(4), nodes))
    _require(orders[(0, 1, 2, 3)] == expected_order, 'root action did not exhaust the expected finite family order.')
    return roots, orders, residual


def coset_counts(diagram, rings):
    _require(
        len(rings) == 4 and all(type(r) is int and r in (0, 1) for r in rings) and any(rings),
        'nonempty four-node binary rings required.',
    )
    _, orders, residual = root_group(tuple(diagram))
    rows = []
    inactive = tuple(i for i, r in enumerate(rings) if not r)
    group_order = orders[(0, 1, 2, 3)]
    counts = [group_order // orders[inactive]]
    rows.append({'rank': 0, 'nodes': [], 'stabilizerOrder': orders[inactive], 'count': counts[0]})
    for rank in (1, 2, 3):
        total = 0
        for nodes in combinations(range(4), rank):
            parts = []
            part = []
            for node in nodes:
                if part and node != part[-1] + 1:
                    parts.append(part)
                    part = []
                part.append(node)
            parts.append(part)
            if any(not any(rings[n] for n in part) for part in parts):
                continue
            commuting = tuple(i for i in inactive if i not in nodes and all(abs(i - n) > 1 for n in nodes))
            stabilizer = orders[nodes] * orders[commuting]
            _require(group_order % stabilizer == 0, 'parabolic stabilizer does not divide the finite group order.')
            count = group_order // stabilizer
            total += count
            rows.append(
                {
                    'rank': rank,
                    'nodes': list(nodes),
                    'commutingInactive': list(commuting),
                    'stabilizerOrder': stabilizer,
                    'count': count,
                }
            )
        counts.append(total)
    marks = tuple(Fraction(m).numerator for m in diagram)
    return {
        'counts': counts,
        'groupOrder': group_order,
        'rootCount': 32 if 4 in marks and marks != (3, 4, 3) else 48 if 4 in marks else 120,
        'rootActionResidual': residual,
        'orbits': rows,
        'scope': 'Predicted parabolic cosets. Accepted only when literal incidence and nondegeneracy checks agree.',
    }


def _flatness(points, rows, dimension):
    maximum = 0.0
    for row in rows:
        cloud = points[sorted(row)]
        cloud = cloud - cloud.mean(axis=0)
        singular = np.linalg.svd(cloud, compute_uv=False)
        _require(
            len(singular) > dimension and singular[dimension - 1] > TOLERANCE,
            'collapsed face or cell; no welding was applied.',
        )
        maximum = max(maximum, float(singular[dimension] / max(singular[0], np.finfo(float).tiny)))
    _require(maximum < TOLERANCE, 'face or cell flatness residual exceeds tolerance.')
    return maximum


def _local_links(model):
    edges, faces, cells = (model[k] for k in KINDS[1:])
    nv = len(model['vertices'])
    edge_id = {tuple(sorted(e)): i for i, e in enumerate(edges)}
    at_vertex = [set() for _ in range(nv)]
    link_edges = [{} for _ in range(nv)]
    for ei, (a, b) in enumerate(edges):
        at_vertex[a].add(ei)
        at_vertex[b].add(ei)
    for fi, face in enumerate(faces):
        for i, v in enumerate(face):
            link_edges[v][fi] = (
                edge_id[tuple(sorted((v, face[i - 1])))],
                edge_id[tuple(sorted((v, face[(i + 1) % len(face)])))],
            )
    uses = [Counter() for _ in range(nv)]
    cell_counts = [0] * nv
    edge_links = [{} for _ in edges]
    for cell in cells:
        local_edges = {}
        for fi in cell:
            face = faces[fi]
            for a, b in zip(face, face[1:] + face[:1]):
                local_edges.setdefault(edge_id[tuple(sorted((a, b)))], []).append(fi)
        for ei, local in local_edges.items():
            _require(len(local) == 2, 'cell edge link is not a diamond.')
            a, b = local
            graph = edge_links[ei]
            graph.setdefault(a, []).append(b)
            graph.setdefault(b, []).append(a)
        vertices = {v for fi in cell for v in faces[fi]}
        for v in vertices:
            local = [fi for fi in cell if fi in link_edges[v]]
            graph = {}
            for fi in local:
                a, b = link_edges[v][fi]
                graph.setdefault(a, []).append(b)
                graph.setdefault(b, []).append(a)
            _require(
                len(graph) >= 3 and all(len(neighbors) == 2 for neighbors in graph.values()),
                'cell vertex link is collapsed, open or branched.',
            )
            reached = {next(iter(graph))}
            pending = list(reached)
            while pending:
                for other in graph[pending.pop()]:
                    if other not in reached:
                        reached.add(other)
                        pending.append(other)
            _require(len(reached) == len(graph), 'cell vertex link has disconnected cycles.')
            uses[v].update(local)
            cell_counts[v] += 1
    for graph in edge_links:
        _require(
            len(graph) >= 3 and all(len(neighbors) == 2 for neighbors in graph.values()),
            'polychoron edge link is collapsed, open or branched.',
        )
        reached = {next(iter(graph))}
        pending = list(reached)
        while pending:
            for other in graph[pending.pop()]:
                if other not in reached:
                    reached.add(other)
                    pending.append(other)
        _require(len(reached) == len(graph), 'polychoron edge link has disconnected cycles.')
    signatures = []
    for v in range(nv):
        _require(
            set(uses[v]) == set(link_edges[v]) and all(n == 2 for n in uses[v].values()),
            'vertex figure has an open ridge.',
        )
        graph = {e: set() for e in at_vertex[v]}
        for a, b in link_edges[v].values():
            graph[a].add(b)
            graph[b].add(a)
        reached = {next(iter(graph))}
        pending = list(reached)
        while pending:
            for other in graph[pending.pop()]:
                if other not in reached:
                    reached.add(other)
                    pending.append(other)
        _require(set(graph) == reached, 'vertex figure is disconnected.')
        signatures.append((len(graph), len(link_edges[v]), cell_counts[v]))
    _require(len(set(signatures)) == 1, 'vertex figures have unequal incidence counts.')
    return {
        'allCellVertexLinksSingleCycles': True,
        'allEdgeLinksSingleCycles': True,
        'connectedVertexFigures': True,
        'facesPerLinkEdge': 2,
        'vertexFigureCounts': list(signatures[0]),
        'checkedVertices': nv,
        'eulerCharacteristic': sum(a * b for a, b in zip(signatures[0], (1, -1, 1))),
    }


def _entity_orbits(actions):
    remaining = set(range(len(actions[0])))
    orbits = []
    while remaining:
        reached = {min(remaining)}
        pending = list(reached)
        while pending:
            v = pending.pop()
            for action in actions:
                other = int(action[v])
                if other not in reached:
                    reached.add(other)
                    pending.append(other)
        remaining.difference_update(reached)
        orbits.append(reached)
    return orbits


def _cell_uniformity(vertex_actions, cell_actions, cell_vertices, orbits):
    evidence = []
    for orbit in orbits:
        ci = min(orbit)
        seed = min(cell_vertices[ci])
        reached = {(ci, seed)}
        pending = list(reached)
        while pending:
            cell, v = pending.pop()
            for vertices, cells in zip(vertex_actions, cell_actions):
                other = (int(cells[cell]), int(vertices[v]))
                if other not in reached:
                    _require(len(reached) < 14400, 'incident cell/vertex orbit exceeds the finite group.')
                    reached.add(other)
                    pending.append(other)
        local = {v for cell, v in reached if cell == ci}
        _require(
            local == set(cell_vertices[ci]), 'cell stabilizer is not transitive on its vertices; result is not uniform.'
        )
        evidence.append(
            {
                'representativeCell': ci,
                'cellOrbitSize': len(orbit),
                'verticesPerCell': len(local),
                'cellVertexPairOrbitSize': len(reached),
                'stabilizerVertexTransitive': True,
            }
        )
    return evidence


def qualify(model, diagram, rings):
    counts = coset_counts(diagram, rings)
    _require(
        [len(model[k]) for k in KINDS] == counts['counts'],
        'literal V/E/F/C differs from independently enumerated parabolic cosets.',
    )
    points = np.asarray(model['vertices'], dtype=float)
    radius = float(np.max(np.linalg.norm(points, axis=1)))
    p = points / radius
    _require(np.linalg.matrix_rank(p - p.mean(axis=0), tol=TOLERANCE) == 4, 'coordinates do not span four dimensions.')
    _require(not cKDTree(p).query_pairs(TOLERANCE), 'coincident vertices detected; no welding was applied.')
    edges, faces, cells = (model[k] for k in KINDS[1:])
    cell_vertices = [sorted({v for fi in cell for v in faces[fi]}) for cell in cells]
    for rows in (edges, faces, cell_vertices):
        _require(
            len({tuple(sorted(row)) for row in rows}) == len(rows),
            'coincident element vertex sets detected; no elements were merged.',
        )
    lengths = np.linalg.norm(p[np.asarray(edges)[:, 0]] - p[np.asarray(edges)[:, 1]], axis=1)
    spread = float(np.ptp(lengths) / np.mean(lengths))
    _require(spread < TOLERANCE and min(lengths) > TOLERANCE, 'unequal or collapsed edges.')
    face_residual = _flatness(p, faces, 2)
    cell_residual = _flatness(p, cell_vertices, 3)
    polygons = [_polygon_data(p, face) for face in faces]
    _require(
        max(max(row[1:]) for row in polygons) < TOLERANCE, 'regular face radial/angular residual exceeds tolerance.'
    )
    roots, _, _ = root_group(tuple(diagram))
    tree = cKDTree(p)
    actions = []
    edge_actions = []
    face_actions = []
    cell_actions = []
    action_residual = 0.0
    face_lookup = {canonical_cycle(f): i for i, f in enumerate(faces)}
    edge_lookup = {tuple(sorted(e)): i for i, e in enumerate(edges)}
    cell_lookup = {tuple(sorted(c)): i for i, c in enumerate(cells)}
    for root in roots:
        distances, perm = tree.query(p - 2 * np.outer(p @ root, root))
        action_residual = max(action_residual, float(max(distances)))
        _require(
            action_residual < TOLERANCE and len(set(perm)) == len(p) and np.array_equal(perm[perm], np.arange(len(p))),
            'vertex reflection is unresolved.',
        )
        mapped_edges = [edge_lookup.get(tuple(sorted((int(perm[a]), int(perm[b]))))) for a, b in edges]
        _require(None not in mapped_edges and len(set(mapped_edges)) == len(edges), 'reflection fails literal edges.')
        mapped_faces = [face_lookup.get(canonical_cycle([int(perm[v]) for v in face])) for face in faces]
        _require(
            None not in mapped_faces and len(set(mapped_faces)) == len(faces), 'reflection fails ordered face cycles.'
        )
        mapped_cells = [cell_lookup.get(tuple(sorted(mapped_faces[f] for f in cell))) for cell in cells]
        _require(
            None not in mapped_cells and len(set(mapped_cells)) == len(cells),
            'reflection fails literal cell boundaries.',
        )
        actions.append(perm)
        edge_actions.append(mapped_edges)
        face_actions.append(mapped_faces)
        cell_actions.append(mapped_cells)
    reached = {0}
    pending = [0]
    while pending:
        v = pending.pop()
        for action in actions:
            other = int(action[v])
            if other not in reached:
                reached.add(other)
                pending.append(other)
    _require(len(reached) == len(p), 'vertex action is not transitive.')
    entity_orbits = [_entity_orbits(a) for a in (actions, edge_actions, face_actions, cell_actions)]
    orbit_sizes = [sorted(map(len, rows)) for rows in entity_orbits]
    for rank in range(4):
        _require(
            orbit_sizes[rank] == sorted(row['count'] for row in counts['orbits'] if row['rank'] == rank),
            'literal entity orbit decomposition differs from parabolic cosets.',
        )
    cell_uniformity = _cell_uniformity(actions, cell_actions, cell_vertices, entity_orbits[3])
    boundary_evidence(model)
    links = _local_links(model)
    return {
        'status': 'passed',
        'exact': False,
        'tolerance': TOLERANCE,
        'cosets': counts,
        'vertexTransitive': True,
        'allFourReflectionsPreserveLiteralIncidence': True,
        'reflectionActionResidual': action_residual,
        'edgeRelativeSpread': spread,
        'facePlanarityRelativeResidual': face_residual,
        'cellFlatnessRelativeResidual': cell_residual,
        'maxFaceRadialRelativeSpread': max(row[1] for row in polygons),
        'maxFaceAngularResidual': max(row[2] for row in polygons),
        'entityOrbitSizes': dict(zip(KINDS, orbit_sizes)),
        'cellUniformity': cell_uniformity,
        'facePolygonCounts': dict(Counter(row[0] for row in polygons)),
        'localLinks': links,
        'coincidentVertices': 0,
        'coincidentElementVertexSets': 0,
        'weldingApplied': False,
        'coordinateSha256': _sha(model['vertices']),
        'incidenceSha256': _sha({k: model[k] for k in KINDS[1:]}),
    }


@lru_cache(maxsize=4)
def _build(key, definition_sha, tranche_sha):
    selected = next(((row, source) for row, source in _entries() if row['key'] == key), None)
    if selected is None:
        return None
    row, source = selected
    _require(
        _sha(source) == row['definitionSha256'] == definition_sha,
        'retained source definition hash changed; tranche must be requalified.',
    )
    model = load_star_uniform4(source['key'])
    evidence = qualify(model, source['diagram'], source['rings'])
    _require(evidence['cosets']['counts'] == row['counts'], 'retained named count expectation changed.')
    if source['regular']:
        from .regular4d_validation import CROSSWALK, analyze_regular4d

        name = next(name for name, entry in CROSSWALK.items() if entry['alias'].lower() == row['bowers'])
        receipt = analyze_regular4d(model, name)
        _require(receipt['status'] == 'passed', 'independent classical regular flag action failed.')
        evidence['regularFlagAction'] = {
            key: receipt[key]
            for key in (
                'status',
                'flagCount',
                'flagOrbitCount',
                'reachedFlags',
                'generatedSubgroupOrder',
                'maxCoordinateResidual',
                'maxFaceResidual',
                'maxMirrorResidual',
            )
        }
    model['metadata'].update(generatedCatalogKey=key, goursatVerification=evidence)
    model['provenance']['goursatQualification'] = {
        'algorithmVersion': '1',
        'definitionSha256': row['definitionSha256'],
        'trancheSha256': tranche_sha,
        'sourceKey': source['key'],
        'coxeterDynkinSymbol': source['symbol'],
        'identity': row['identity'],
        'baselineIdentity': None,
        'numericContract': 'Float64 reflection predicates; discrete root permutations and integer coset counts; no exact certificate.',
    }
    _require(
        hashlib.sha256(DATA.read_bytes()).hexdigest() == tranche_sha, 'tranche changed during qualification; retry.'
    )
    return model


def load_goursat_wythoff(key):
    if type(key) is not str or not key.startswith('goursat-wythoff-'):
        return None
    selected = next(((row, source) for row, source in _entries() if row['key'] == key), None)
    if selected is None:
        return None
    _require(
        _sha(selected[1]) == selected[0]['definitionSha256'],
        'retained source definition hash changed; tranche must be requalified.',
    )
    built = _build(key, selected[0]['definitionSha256'], hashlib.sha256(DATA.read_bytes()).hexdigest())
    if built is None:
        return None
    import uuid

    model = deepcopy(built)
    model['id'] = str(uuid.uuid4())
    return model


def generated_crosswalk():
    value = tranche()
    source = {e['bowers']: e for e in star_manifest()['entries']}
    rows = []
    for row in value['entries']:
        entry = source.get(row['bowers'], {})
        current = _sha(entry) == row['definitionSha256']
        rows.append(
            {
                **row,
                'name': entry.get('name', row['name']),
                'coxeterDynkinSymbol': entry.get('symbol', row['symbol']),
                'references': deepcopy(entry.get('referenceUrls', [])),
                'sourceKey': entry.get('key', 'star-uniform4-' + row['bowers']),
                'status': 'registered-generated-rechecked-on-load' if current else 'stale-definition',
                'baselineIdentity': None,
                'releaseQualified': False,
                'definitionCurrent': current,
            }
        )
    return {
        'schemaVersion': 1,
        'id': 'goursat-h4-stars-1',
        'label': 'Goursat B4/F4/H4 stars, tranches 1–2',
        'entries': rows,
        'registeredGeneratedIdentities': sum(r['definitionCurrent'] for r in rows),
        'regularIdentities': 10,
        'additionalNamedWythoffians': sum(not r['regular'] for r in rows),
        'newMathematicalIdentities': 0,
        'baselineCoverageIncrement': 0,
        'manifestSha256': hashlib.sha256(DATA.read_bytes()).hexdigest(),
        'queue': value['queue'],
        'scope': 'Seventy-nine existing named identities have independently checked native realizations. Uncached loads compute geometry evidence; detached caches are keyed to current definition/tranche pins. The 2,191 baseline roster remains unavailable; no baseline or release qualification is inferred.',
    }
