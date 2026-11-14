"""Pinned orientable small cover; integer topology and bounded local development."""

from collections import Counter, deque
from copy import deepcopy
from itertools import combinations
from pathlib import Path
import hashlib
import json
import math
import time

import numpy as np

from .geometry import GeometryError
from .hyperbolic import (
    J as _J,
    reflection_matrix,
    DEVELOPMENT_RELATIVE_GATE,
    matrix_metric_residual,
    point_metric_residual,
    point_discrepancy,
    record_residual,
)

KEY = 'small-cover-v1'
DATA_HASH = '57b82cec92da2cc42de290f390fb24d8da5acfb6dfa52946daadff1f49fada93'
GENERATOR_GATE = 1e-12
DEVELOPMENT_GATE = 1e-8


def canonical_hash(value):
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False).encode('utf-8')
    ).hexdigest()


def load_data():
    data = json.loads(Path(__file__).with_name('hyperbolic_data').joinpath(KEY + '.json').read_text(encoding='utf-8'))
    actual = canonical_hash({k: v for k, v in data.items() if k != 'dataHash'})
    if actual != DATA_HASH or data.get('dataHash') != DATA_HASH:
        raise GeometryError('Small-cover data hash mismatch.')
    return data


def source_descriptor():
    return {'type': 'manifold', 'key': KEY, 'dataHash': DATA_HASH}


def validate_source(source):
    if not isinstance(source, dict) or source.get('type') != 'manifold' or source.get('key') != KEY:
        raise GeometryError('Only the pinned manifold small-cover-v1 is supported.')
    if source.get('dataHash', DATA_HASH) != DATA_HASH:
        raise GeometryError('Small-cover source data hash mismatch.')
    return source_descriptor()


def gf2_rank(vectors):
    rows = [[int(x) for x in row] for row in vectors]
    rank = 0
    for col in range(3):
        pivot = next((i for i in range(rank, len(rows)) if rows[i][col]), None)
        if pivot is None:
            continue
        rows[rank], rows[pivot] = rows[pivot], rows[rank]
        for i in range(len(rows)):
            if i != rank and rows[i][col]:
                rows[i] = [a ^ b for a, b in zip(rows[i], rows[rank])]
        rank += 1
    return rank


def _bits(vector):
    return sum(x << i for i, x in enumerate(vector))


def _inverse(matrix):
    return _J @ matrix.T @ _J


def _metric_error(matrix):
    try:
        with np.errstate(over='ignore', invalid='ignore'):
            return matrix_metric_residual(matrix)['absolute']
    except GeometryError:
        return math.inf


def _matrix(value):
    if (
        not isinstance(value, (list, tuple, np.ndarray))
        or (isinstance(value, np.ndarray) and value.ndim == 0)
        or len(value) not in (4, 16)
    ):
        raise GeometryError('Expected a finite row-major 4 by 4 Lorentz matrix.')
    try:
        array = np.asarray(value, dtype=np.float64)
    except (TypeError, ValueError) as exc:
        raise GeometryError('Expected a finite row-major 4 by 4 Lorentz matrix.') from exc
    if array.shape not in ((16,), (4, 4)) or not np.isfinite(array).all():
        raise GeometryError('Expected a finite row-major 4 by 4 Lorentz matrix.')
    return array.reshape(4, 4)


def _template(data):
    ball = np.asarray(data['ballVertices'], dtype=np.float64)
    r2 = np.sum(ball * ball, axis=1)
    vertices = np.column_stack(((1 + r2) / (1 - r2), 2 * ball / (1 - r2)[:, None]))
    d = 5**0.25
    scale = math.sqrt(d * d - 1)
    normals = np.column_stack((np.full(12, 1 / scale), np.asarray(data['faceDirections']) * d / scale))
    return {
        'id': KEY,
        'vertices': vertices.tolist(),
        'edges': deepcopy(data['edges']),
        'faces': deepcopy(data['faces']),
        'facePlanes': normals.tolist(),
    }


def _generators(template):
    return [reflection_matrix(n) for n in np.asarray(template['facePlanes'])]


def _representatives(bits, generators):
    reps = {0: np.eye(4)}
    words = {0: []}
    queue = deque([0])
    while queue:
        g = queue.popleft()
        for f, bit in enumerate(bits):
            h = g ^ bit
            if h not in reps:
                reps[h] = reps[g] @ generators[f]
                words[h] = words[g] + [f]
                queue.append(h)
    if len(reps) != 8:
        raise GeometryError('Characteristic map is not surjective onto (Z/2)^3.')
    return reps, words


def fundamental_domain():
    """Return eight local charts and all 96 directed face pairings (JSON-safe)."""
    data = load_data()
    template = _template(data)
    generators = _generators(template)
    bits = [_bits(v) for v in data['lambda']]
    reps, words = _representatives(bits, generators)
    pairings = []
    for g in range(8):
        for f, reflection in enumerate(generators):
            h = g ^ bits[f]
            pairings.append(
                {
                    'cell': g,
                    'face': f,
                    'toCell': h,
                    'toFace': f,
                    'vertexPermutation': list(range(5)),
                    'isometry': (reps[g] @ reflection @ _inverse(reps[h])).ravel().tolist(),
                    'localIsometry': reflection.ravel().tolist(),
                }
            )
    return {
        'source': source_descriptor(),
        'template': template,
        'lambda': deepcopy(data['lambda']),
        'cells': [
            {
                'quotientState': g,
                'word': words[g],
                'matrix': reps[g].ravel().tolist(),
                'handedness': (-1) ** g.bit_count(),
            }
            for g in range(8)
        ],
        'pairings': pairings,
    }


class _UnionFind:
    def __init__(self, size):
        self.parent = list(range(size))

    def find(self, x):
        while self.parent[x] != x:
            self.parent[x] = self.parent[self.parent[x]]
            x = self.parent[x]
        return x

    def union(self, a, b):
        a, b = self.find(a), self.find(b)
        self.parent[max(a, b)] = min(a, b)

    def labels(self):
        roots = sorted({self.find(i) for i in range(len(self.parent))})
        ids = {root: i for i, root in enumerate(roots)}
        return [ids[self.find(i)] for i in range(len(self.parent))]


def _incidence(domain):
    template = domain['template']
    edges, faces = template['edges'], template['faces']
    lookup = {tuple(sorted(edge)): i for i, edge in enumerate(edges)}
    ufv, ufe, uff = _UnionFind(160), _UnionFind(240), _UnionFind(96)
    for p in domain['pairings']:
        g, h, f, k = p['cell'], p['toCell'], p['face'], p['toFace']
        src, dst = faces[f], faces[k]
        mapping = dict(zip(src, [dst[i] for i in p['vertexPermutation']]))
        uff.union(12 * g + f, 12 * h + k)
        for a in src:
            ufv.union(20 * g + a, 20 * h + mapping[a])
        for a, b in zip(src, src[1:] + src[:1]):
            ufe.union(30 * g + lookup[tuple(sorted((a, b)))], 30 * h + lookup[tuple(sorted((mapping[a], mapping[b])))])
    return ufv.labels(), ufe.labels(), uff.labels()


def _add(column, row, value):
    column[row] = column.get(row, 0) + value
    if not column[row]:
        del column[row]


def _boundary_residual(lower, upper):
    maximum = 0
    for column in upper:
        result = {}
        for row, value in column.items():
            for i, coefficient in lower[row].items():
                _add(result, i, value * coefficient)
        maximum = max(maximum, max(map(abs, result.values()), default=0))
    return maximum


def _cellular_chains(domain, labels):
    vertices, edges, faces = (domain['template'][k] for k in ('vertices', 'edges', 'faces'))
    lv, le, lf = labels
    edge_lookup = {tuple(sorted(e)): i for i, e in enumerate(edges)}
    d1, d2, d3 = [None] * (max(le) + 1), [None] * (max(lf) + 1), []
    for g in range(8):
        for e, (a, b) in enumerate(edges):
            d1[le[30 * g + e]] = {lv[20 * g + a]: -1, lv[20 * g + b]: 1}
        column = {}
        for f, cycle in enumerate(faces):
            boundary = {}
            for a, b in zip(cycle, cycle[1:] + cycle[:1]):
                e = edge_lookup[tuple(sorted((a, b)))]
                _add(boundary, le[30 * g + e], 1 if a < b else -1)
            d2[lf[12 * g + f]] = boundary
            xyz = np.asarray(vertices)[cycle, 1:]
            outward = np.dot(np.cross(xyz[1] - xyz[0], xyz[2] - xyz[1]), xyz.mean(axis=0))
            _add(column, lf[12 * g + f], (1 if outward > 0 else -1) * (-1) ** g.bit_count())
        d3.append(column)
    return d1, d2, d3


def _smith_dense(matrix):
    """Integer Euclidean row/column reduction, including divisibility repair."""
    a = [list(map(int, row)) for row in matrix]
    m, n = len(a), len(a[0]) if a else 0
    k = 0
    diagonal = []
    while k < min(m, n):
        entries = [(abs(a[i][j]), i, j) for i in range(k, m) for j in range(k, n) if a[i][j]]
        if not entries:
            break
        _, i, j = min(entries)
        a[k], a[i] = a[i], a[k]
        for row in a:
            row[k], row[j] = row[j], row[k]
        while True:
            changed = False
            for i in range(k + 1, m):
                if a[i][k]:
                    q = a[i][k] // a[k][k]
                    a[i] = [x - q * y for x, y in zip(a[i], a[k])]
                    if a[i][k]:
                        a[k], a[i] = a[i], a[k]
                    changed = True
                    break
            if changed:
                continue
            for j in range(k + 1, n):
                if a[k][j]:
                    q = a[k][j] // a[k][k]
                    for row in a:
                        row[j] -= q * row[k]
                    if a[k][j]:
                        for row in a:
                            row[k], row[j] = row[j], row[k]
                    changed = True
                    break
            if changed:
                continue
            bad = next(((i, j) for i in range(k + 1, m) for j in range(k + 1, n) if a[i][j] % a[k][k]), None)
            if bad is None:
                break
            i, _ = bad
            a[k] = [x + y for x, y in zip(a[k], a[i])]
        diagonal.append(abs(a[k][k]))
        k += 1
    return diagonal


def _smith_sparse(columns, row_count):
    """Cancel unit pivots sparsely before the small remaining Smith reduction."""
    cols = [dict(c) for c in columns]
    rows = [set() for _ in range(row_count)]
    for j, col in enumerate(cols):
        for i in col:
            rows[i].add(j)
    units = deque((i, j) for j, col in enumerate(cols) for i, x in col.items() if abs(x) == 1)
    canceled = 0
    removed = set()
    while units:
        i, j = units.popleft()
        if i in removed or abs(cols[j].get(i, 0)) != 1:
            continue
        pivot = cols[j]
        for other in list(rows[i] - {j}):
            col = cols[other]
            factor = col[i] // pivot[i]
            for r, value in pivot.items():
                old = col.get(r, 0)
                _add(col, r, -factor * value)
                if old and r not in col:
                    rows[r].discard(other)
                elif not old and r in col:
                    rows[r].add(other)
                if abs(col.get(r, 0)) == 1:
                    units.append((r, other))
        for r in pivot:
            rows[r].discard(j)
        cols[j] = {}
        removed.add(i)
        canceled += 1
    remaining_rows = sorted({i for col in cols for i in col})
    remaining_cols = [col for col in cols if col]
    dense = [[col.get(i, 0) for col in remaining_cols] for i in remaining_rows]
    return [1] * canceled + _smith_dense(dense)


def _h1(d1, d2, vertex_count):
    forest = _UnionFind(vertex_count)
    non_tree = []
    for e, col in enumerate(d1):
        ends = list(col)
        if len(ends) != 2 or sum(col.values()) != 0:
            raise GeometryError('Invalid graph boundary in integer homology.')
        a, b = ends
        if forest.find(a) == forest.find(b):
            non_tree.append(e)
        else:
            forest.union(a, b)
    row_ids = {e: i for i, e in enumerate(non_tree)}
    columns = [{row_ids[e]: x for e, x in col.items() if e in row_ids} for col in d2]
    diagonal = _smith_sparse(columns, len(non_tree))
    return {
        'freeRank': len(non_tree) - len(diagonal),
        'torsion': [x for x in diagonal if x > 1],
        'smithDiagonal': diagonal,
        'cycleGenerators': len(non_tree),
        'components': len(set(forest.labels())),
    }


def _triangulation(domain):
    """Build local flags and glue their barycenters directly via face pairings.

    Does not use the reconstructed cellular quotient or its boundary matrices.
    """
    edges, faces = domain['template']['edges'], domain['template']['faces']
    edge_lookup = {tuple(sorted(e)): i for i, e in enumerate(edges)}
    offsets = [0, 20, 50, 62]
    uf = _UnionFind(8 * 63)

    def node(g, dimension, index):
        return g * 63 + offsets[dimension] + index

    for p in domain['pairings']:
        g, h, f, k = p['cell'], p['toCell'], p['face'], p['toFace']
        src, dst = faces[f], faces[k]
        mapping = dict(zip(src, [dst[i] for i in p['vertexPermutation']]))
        uf.union(node(g, 2, f), node(h, 2, k))
        for a in src:
            uf.union(node(g, 0, a), node(h, 0, mapping[a]))
        for a, b in zip(src, src[1:] + src[:1]):
            uf.union(
                node(g, 1, edge_lookup[tuple(sorted((a, b)))]),
                node(h, 1, edge_lookup[tuple(sorted((mapping[a], mapping[b])))]),
            )
    labels = uf.labels()
    tetrahedra = set()
    for g in range(8):
        for f, cycle in enumerate(faces):
            for a, b in zip(cycle, cycle[1:] + cycle[:1]):
                e = edge_lookup[tuple(sorted((a, b)))]
                for v in (a, b):
                    tetrahedra.add(tuple(sorted(labels[node(g, d, i)] for d, i in enumerate((v, e, f, 0)))))
    simplices = [sorted({s for t in tetrahedra for s in combinations(t, d + 1)}) for d in range(4)]
    chains = []
    for d in range(1, 4):
        lower = {s: i for i, s in enumerate(simplices[d - 1])}
        chains.append([{lower[s[:i] + s[i + 1 :]]: (-1) ** i for i in range(d + 1)} for s in simplices[d]])
    face_degrees = Counter(i for col in chains[2] for i in col)
    return {
        'construction': 'local barycentric flags glued directly by the pinned face permutations',
        'gluingHash': canonical_hash(
            [{k: p[k] for k in ('cell', 'face', 'toCell', 'toFace', 'vertexPermutation')} for p in domain['pairings']]
        ),
        'simplexCounts': [len(s) for s in simplices],
        'chainSquaredResidual': max(_boundary_residual(chains[0], chains[1]), _boundary_residual(chains[1], chains[2])),
        'everyTriangleHasTwoTetrahedra': len(face_degrees) == len(simplices[2]) and set(face_degrees.values()) == {2},
        'H1': _h1(chains[0], chains[1], len(simplices[0])),
        'tetrahedraHash': canonical_hash(simplices[3]),
    }


def _vertex_links(domain, labels):
    edges, faces = domain['template']['edges'], domain['template']['faces']
    lv, le, _ = labels
    results = []
    for vertex in range(max(lv) + 1):
        triangles = []
        link_edges = Counter()
        for g in range(8):
            for v in range(20):
                if lv[20 * g + v] != vertex:
                    continue
                incident = [e for e, ends in enumerate(edges) if v in ends]
                triangle = tuple(sorted(le[30 * g + e] for e in incident))
                triangles.append(triangle)
                for f, cycle in enumerate(faces):
                    if v in cycle:
                        local = [le[30 * g + e] for e in incident if set(edges[e]) <= set(cycle)]
                        link_edges[tuple(sorted(local))] += 1
        verts = sorted({v for t in triangles for v in t})
        link_graph = {v: set() for v in verts}
        for a, b in link_edges:
            link_graph[a].add(b)
            link_graph[b].add(a)
        reached = set()
        queue = deque(verts[:1])
        while queue:
            v = queue.popleft()
            if v not in reached:
                reached.add(v)
                queue.extend(link_graph[v] - reached)
        vertex_cycles = True
        for v in verts:
            star = Counter(tuple(sorted(x for x in t if x != v)) for t in triangles if v in t)
            degrees = Counter(x for e in star for x in e)
            adjacency = {x: set() for x in degrees}
            for a, b in star:
                adjacency[a].add(b)
                adjacency[b].add(a)
            visited = set()
            pending = list(adjacency)[:1]
            while pending:
                x = pending.pop()
                if x not in visited:
                    visited.add(x)
                    pending.extend(adjacency[x] - visited)
            vertex_cycles &= set(degrees.values()) == {2} and len(visited) == len(degrees)
        counts = [len(verts), len(link_edges), len(triangles)]
        spherical = (
            len(set(triangles)) == len(triangles)
            and set(link_edges.values()) == {2}
            and len(reached) == len(verts)
            and vertex_cycles
            and counts[0] - counts[1] + counts[2] == 2
        )
        results.append({'vertex': vertex, 'counts': counts, 'spherical': bool(spherical)})
    return results


def _pairing_evidence(domain):
    faces = domain['template']['faces']
    vertices = np.asarray(domain['template']['vertices'])
    generators = _generators(domain['template'])
    reps = {c['quotientState']: _matrix(c['matrix']) for c in domain['cells']}
    pairs = domain['pairings']
    if len(pairs) != 96:
        raise GeometryError('Small cover requires exactly 96 directed face pairings.')
    table = {}
    for p in pairs:
        if any(type(p.get(k)) is not int for k in ('cell', 'face', 'toCell', 'toFace')):
            raise GeometryError('Pairing indices must be integers.')
        g, h, f, k = p['cell'], p['toCell'], p['face'], p['toFace']
        if not (0 <= g < 8 and 0 <= h < 8 and 0 <= f < 12 and 0 <= k < 12):
            raise GeometryError('Pairing index out of range.')
        if (g, f) in table:
            raise GeometryError('Duplicate face pairing.')
        perm = p.get('vertexPermutation')
        if not isinstance(perm, list) or any(type(i) is not int for i in perm) or sorted(perm) != list(range(5)):
            raise GeometryError('Invalid pairing vertex permutation.')
        if k != f or h != g ^ _bits(domain['lambda'][f]):
            raise GeometryError('Pairing disagrees with the pinned characteristic map.')
        table[g, f] = p
    metric = inverse = point = deck_error = 0.0
    orientable = True
    for (g, f), p in table.items():
        h, k, perm = p['toCell'], p['toFace'], p['vertexPermutation']
        other = table[h, k]
        if (
            other['toCell'] != g
            or other['toFace'] != f
            or any(other['vertexPermutation'][perm[i]] != i for i in range(5))
        ):
            raise GeometryError('Face pairings are not inverse permutations.')
        local, deck = _matrix(p['localIsometry']), _matrix(p['isometry'])
        metric = max(metric, _metric_error(local), _metric_error(deck))
        inverse = max(inverse, float(np.max(np.abs(deck @ _matrix(other['isometry']) - np.eye(4)))))
        expected = reps[g] @ generators[f] @ _inverse(reps[h])
        deck_error = max(
            deck_error, float(np.max(np.abs(deck - expected))), float(np.max(np.abs(local - generators[f])))
        )
        target = vertices[[faces[k][i] for i in perm]]
        point = max(point, float(np.max(np.abs((local @ target.T).T - vertices[faces[f]]))))
        orientable &= np.linalg.det(deck) > 0 and deck[0, 0] > 0
    return {
        'inverseResidual': inverse,
        'metricResidual': metric,
        'vertexPermutationResidual': point,
        'deckFormulaResidual': deck_error,
        'orientationPreservingDeckMaps': bool(orientable),
        'pass': bool(max(inverse, metric, point, deck_error) <= DEVELOPMENT_GATE and orientable),
    }


def analyze(domain=None):
    """Compute a JSON receipt; reject corrupted gluing before publishing evidence."""
    domain = fundamental_domain() if domain is None else domain
    validate_source(domain.get('source'))
    data = load_data()
    if domain.get('lambda') != data['lambda']:
        raise GeometryError('Characteristic vectors differ from the pinned small-cover data.')
    if domain.get('template') != _template(data):
        raise GeometryError('Small-cover template differs from the pinned geometry/numbering.')
    cells = domain.get('cells', [])
    if (
        len(cells) != 8
        or any(type(c.get('quotientState')) is not int for c in cells)
        or sorted(c.get('quotientState', -1) for c in cells) != list(range(8))
    ):
        raise GeometryError('Small cover requires eight distinct quotient charts.')
    generators = _generators(domain['template'])
    reps, words = _representatives([_bits(v) for v in data['lambda']], generators)
    for c in cells:
        g = c['quotientState']
        if c.get('word') != words[g] or c.get('handedness') != (-1) ** g.bit_count():
            raise GeometryError('Invalid small-cover spanning-tree chart.')
        if np.max(np.abs(_matrix(c['matrix']) - reps[g])) > DEVELOPMENT_GATE:
            raise GeometryError('Invalid small-cover spanning-tree representative.')
    pairing = _pairing_evidence(domain)
    if not pairing['pass']:
        raise GeometryError('Small-cover pairing residual gate failed: ' + json.dumps(pairing))
    template = domain['template']
    vertices, edges, faces = (template[k] for k in ('vertices', 'edges', 'faces'))
    normals = np.asarray(template['facePlanes'])
    ranks = [gf2_rank([data['lambda'][f] for f, cycle in enumerate(faces) if v in cycle]) for v in range(20)]
    odd = all(sum(v) % 2 == 1 for v in data['lambda'])
    labels = _incidence(domain)
    counts = [max(label) + 1 for label in labels] + [8]
    d1, d2, d3 = _cellular_chains(domain, labels)
    chain_error = max(_boundary_residual(d1, d2), _boundary_residual(d2, d3))
    cellular_h1 = _h1(d1, d2, counts[0])
    triangulation = _triangulation(domain)
    agree = all(cellular_h1[k] == triangulation['H1'][k] for k in ('freeRank', 'torsion', 'components'))
    links = _vertex_links(domain, labels)
    edge_cycles = []
    for e, (a, b) in enumerate(edges):
        adjacent = [f for f, cycle in enumerate(faces) if a in cycle and b in cycle]
        f, k = adjacent
        angle = math.acos(float(np.clip(-normals[f] @ _J @ normals[k], -1, 1)))
        holonomy = generators[f] @ generators[k] @ generators[f] @ generators[k]
        for orbit in sorted({labels[1][30 * g + e] for g in range(8)}):
            incident = [g for g in range(8) if labels[1][30 * g + e] == orbit]
            g = min(incident)
            states = [g]
            for face in (f, k, f, k):
                states.append(states[-1] ^ _bits(data['lambda'][face]))
            edge_cycles.append(
                {
                    'edge': orbit,
                    'states': states,
                    'incidentCells': len(incident),
                    'angleSum': len(incident) * angle,
                    'angleSumResidual': abs(len(incident) * angle - 2 * math.pi),
                    'holonomyResidual': float(np.max(np.abs(holonomy - np.eye(4)))),
                    'closedFourCycle': len(set(states[:-1])) == 4 and states[0] == states[-1],
                }
            )
    xyz = np.asarray(vertices)
    metric = max(_metric_error(r) for r in generators)
    involution = max(float(np.max(np.abs(r @ r - np.eye(4)))) for r in generators)
    vertex_error = float(np.max(np.abs(np.sum((xyz @ _J) * xyz, axis=1) + 1)))
    normal_error = float(np.max(np.abs(np.sum((normals @ _J) * normals, axis=1) - 1)))
    lengths = [math.acosh(max(1.0, float(-xyz[a] @ _J @ xyz[b]))) for a, b in edges]
    spread = (max(lengths) - min(lengths)) / float(np.mean(lengths))
    edge_pass = all(
        c['closedFourCycle']
        and c['incidentCells'] == 4
        and max(c['angleSumResidual'], c['holonomyResidual']) <= GENERATOR_GATE
        for c in edge_cycles
    )
    topology_pass = (
        min(ranks) == 3
        and gf2_rank(data['lambda']) == 3
        and odd
        and counts == [20, 60, 48, 8]
        and chain_error == 0
        and cellular_h1['components'] == 1
        and all(link['spherical'] for link in links)
        and edge_pass
    )
    geometry_pass = max(metric, involution, vertex_error, normal_error) <= GENERATOR_GATE and spread <= 1e-7
    h1_verified = (
        agree and triangulation['chainSquaredResidual'] == 0 and triangulation['everyTriangleHasTwoTetrahedra']
    )
    return {
        'source': source_descriptor(),
        'coordinateStatus': 'float64 approximations; integer incidence and homology',
        'pass': bool(topology_pass and geometry_pass and pairing['pass'] and h1_verified),
        'characteristic': {
            'vertexRanks': ranks,
            'rank': gf2_rank(data['lambda']),
            'surjective': gf2_rank(data['lambda']) == 3,
            'oddParity': odd,
            'torsionFreeKernel': min(ranks) == 3,
            'reflectionGroup': data['reflectionGroup'],
        },
        'counts': dict(zip(('vertices', 'edges', 'faces', 'cells'), counts)),
        'eulerCharacteristic': counts[0] - counts[1] + counts[2] - counts[3],
        'orientable': odd and pairing['orientationPreservingDeckMaps'],
        'connected': cellular_h1['components'] == 1,
        'pairings': pairing,
        'edgeCycles': edge_cycles,
        'vertexLinks': links,
        'chainComplex': {'dimensions': counts, 'boundarySquaredResidual': chain_error, 'pass': chain_error == 0},
        'H1': {
            **cellular_h1,
            'verified': h1_verified,
            'independentConstructionAgrees': agree,
            'method': 'integer Smith normal form after spanning-tree collapse',
        },
        'triangulation': triangulation,
        'volume': {
            'value': 8 * 4.3062,
            'domains': 8,
            'domainVolume': 4.3062,
            'status': 'coarse published reference; not certified',
            'reference': 'Vesnin, Table 1, https://math.nsc.ru/~vesnin/papers/modena.pdf',
        },
        'residuals': {
            'generatorMetric': metric,
            'generatorInvolution': involution,
            'hyperboloidVertices': vertex_error,
            'unitFaceNormals': normal_error,
            'edgeLengthRelativeSpread': spread,
            'edgeAngleSum': max(c['angleSumResidual'] for c in edge_cycles),
            'edgeHolonomy': max(c['holonomyResidual'] for c in edge_cycles),
        },
        'gates': {
            'generators': GENERATOR_GATE,
            'development': DEVELOPMENT_RELATIVE_GATE,
            'developmentNormalization': 'squared scale',
            'finiteDomainAbsolute': DEVELOPMENT_GATE,
            'edgeLengthRelativeSpread': 1e-7,
        },
    }


def _state(g):
    if type(g) is not int or not 0 <= g < 8:
        raise GeometryError('Quotient state must be an integer from 0 to 7.')
    return g


def _pose(state, local_pose):
    from .hyperbolic_orbit import repair_frame

    pose = np.diag([1.0, (-1.0) ** state.bit_count(), 1.0, 1.0]) if local_pose is None else _matrix(local_pose)
    if _metric_error(pose) > DEVELOPMENT_GATE or pose[0, 0] <= 0:
        raise GeometryError('Local observer pose must be a future Lorentz frame (residual <= 1e-8).')
    if np.linalg.det(pose) * (-1) ** state.bit_count() <= 0:
        raise GeometryError('Local observer pose has the wrong chart handedness for this quotient state.')
    if np.max(np.abs(pose)) > 1e4:
        raise GeometryError('Hyperbolic coordinate scale exceeds 10000.')
    return repair_frame(pose, state.bit_count()) if _metric_error(pose) > 1e-14 else pose


def cross_face(quotient_state, local_pose, face):
    """Transport the full local pose; continuous coordinates need no growing word."""
    g = _state(quotient_state)
    if type(face) is not int or not 0 <= face < 12:
        raise GeometryError('Face must be an integer from 0 to 11.')
    pose = _pose(g, local_pose)
    data = load_data()
    reflection = _generators(_template(data))[face]
    h = g ^ _bits(data['lambda'][face])
    transported = reflection @ pose
    transported = _pose(h, transported)
    return {'quotientState': h, 'localPose': transported.ravel().tolist(), 'face': face}


def develop_patch(
    quotient_state=0,
    local_pose=None,
    *,
    depth=3,
    radius=2.0,
    max_instances=256,
    epoch=0,
    source=None,
    mode='complete-depth',
    cursor=None,
    budget=None,
):
    """Resumable development shared with the regular {5,3,4} universal cover."""
    from . import hyperbolic_protocol as protocol
    from .hyperbolic_orbit import Development

    source = validate_source(source_descriptor() if source is None else source)
    g = _state(quotient_state)
    pose = _pose(g, local_pose)
    if type(max_instances) is not int or not 1 <= max_instances <= 256:
        raise GeometryError('Manifold page limit must be an integer from 1 to 256.')
    # Validate before allocating/replaying any frontier.
    native_source = protocol._source({'type': 'honeycomb', 'pqr': [5, 3, 4]})
    radius, depth, mode, epoch, limits, _ = protocol._options(
        {
            'radius': radius,
            'depth': depth,
            'mode': mode,
            'epoch': epoch,
            'budget': budget or {'pageSize': max_instances, 'candidatesPerPage': 50000},
        },
        native_source,
    )
    anchor = {'quotientState': g, 'localPose': pose.ravel().tolist()}
    bindings = {
        'sourceHash': canonical_hash(source),
        'anchorHash': canonical_hash(anchor),
        'budgetHash': protocol._hash({'radius': radius, 'depth': depth, 'mode': mode, 'budget': limits}),
    }
    key = 'manifold-development:' + protocol._hash({**bindings, 'epoch': epoch})
    development = Development([5, 3, 4], depth, radius, mode, pose, template=_template(load_data()))
    if cursor is not None:
        checkpoint = protocol._read_cursor(cursor, bindings, epoch)
        if key in protocol._CACHE:
            cached, _ = protocol._cache_pop(key)
            if (
                isinstance(checkpoint, dict)
                and type(checkpoint.get('candidates')) is int
                and cached.candidates <= checkpoint['candidates']
            ):
                development = cached
        development.restore(checkpoint, limits, deadline=time.monotonic() + 60)
    page = development.page(limits, clock=time.monotonic)
    checkpoint = page.pop('checkpoint')
    next_cursor = protocol._cursor(checkpoint, bindings, epoch) if checkpoint else None
    if next_cursor is not None and len(protocol._json(next_cursor)) > protocol.CURSOR_LIMIT:
        next_cursor = None
        page['coverage'].update(stopReason='cursorLimit', resumable=False)
    if next_cursor is not None:
        protocol._cache_put(key, (development, protocol._development_bytes(development)))
    bits = [_bits(v) for v in load_data()['lambda']]

    def state(word):
        result = g
        for f in word:
            result ^= bits[f]
        return result

    inverse = _inverse(pose)
    page['coverage']['observer'] = (inverse @ np.asarray(page['coverage']['observer'])).tolist()
    template = _template(load_data())
    for cell in page['instances']:
        matrix = inverse @ np.asarray(cell['matrix']).reshape(4, 4)
        for name, residual in (
            ('transformMetric', matrix_metric_residual(matrix)),
            ('hyperboloidVertices', point_metric_residual((matrix @ np.asarray(template['vertices']).T).T)),
        ):
            record_residual(page['residuals'], name, residual)
            if residual['relative'] > DEVELOPMENT_RELATIVE_GATE:
                raise GeometryError('Manifold output exceeds relative metric gate 1e-12.')
        cell.update(type=KEY, matrix=matrix.ravel().tolist(), quotientState=state(cell['word']), visible=True)
    for row in page['neighbors']:
        row['quotientState'] = state(development.words[row['cell']]) ^ bits[row['face']]
    return {
        **page,
        'sourceHash': bindings['sourceHash'],
        'anchorHash': bindings['anchorHash'],
        'epoch': epoch,
        'anchor': {**anchor, 'frame': 'observer-centered', 'observerMatrix': np.eye(4).ravel().tolist()},
        'templates': [template],
        'nextCursor': next_cursor,
    }
