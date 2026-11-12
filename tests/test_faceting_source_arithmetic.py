"""Independent integer-grid and Q(sqrt(5)) oracles for the pinned FAC source."""

from collections import Counter, defaultdict
from copy import deepcopy
from fractions import Fraction
from functools import reduce
from itertools import combinations, permutations, product
import json
from math import gcd, lcm, factorial, comb
from pathlib import Path

import pytest

from engine.automatic_faceting import candidate_facets, enumerate_facetings
from engine.automatic_faceting_workflow import verify_search
from engine.faceting_source_arithmetic import inspect_source_arithmetic
from engine.formats import save_project
from engine.geometry import GeometryError, identity
from engine.server import dispatch

FIXTURE = Path(__file__).parent / 'fixtures/faceting-dodecahedron-source-v1.json'


def key(cycle):
    cycle = tuple(cycle)
    rotations = [cycle[i:] + cycle[:i] for i in range(len(cycle))]
    reverse = cycle[::-1]
    rotations += [reverse[i:] + reverse[:i] for i in range(len(cycle))]
    return min(rotations)


def determinant(a, b, c):
    return a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])


def plane_row(a, b, c):
    u = [y - x for x, y in zip(a, b)]
    v = [y - x for x, y in zip(a, c)]
    normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
    if not any(normal):
        return None
    return normal + [-sum(x * y for x, y in zip(normal, a))]


def plane_sets(points, integer=False):
    planes = {}
    for ids in combinations(range(len(points)), 3):
        row = plane_row(*(points[v] for v in ids))
        if row is None:
            continue
        if integer:
            divisor = reduce(gcd, row)
            row = tuple(x // divisor for x in row)
            if next(x for x in row if x) < 0:
                row = tuple(-x for x in row)
        else:
            divisor = next(x for x in row if x)
            row = tuple(x / divisor for x in row)
        if row not in planes:
            planes[row] = tuple(v for v, p in enumerate(points) if sum(x * y for x, y in zip(row[:3], p)) + row[3] == 0)
    return planes


def gram_actions(points, faces):
    n = len(points)
    assert all(sum(p[k] for p in points) == 0 for k in range(3))
    dots = [[sum(x * y for x, y in zip(a, b)) for b in points] for a in points]
    anchor = next(ids for ids in combinations(range(n), 3) if determinant(*(points[i] for i in ids)))
    signatures = [tuple(dots[v][a] for a in anchor) for v in range(n)]
    actions = []
    expected = Counter(key(face) for face in faces)
    for images in product(range(n), repeat=3):
        if any(dots[anchor[i]][anchor[j]] != dots[images[i]][images[j]] for i in range(3) for j in range(3)):
            continue
        lookup = {tuple(dots[v][a] for a in images): v for v in range(n)}
        if not all(signature in lookup for signature in signatures):
            continue
        action = tuple(lookup[signature] for signature in signatures)
        assert len(set(action)) == n
        assert all(dots[a][b] == dots[action[a]][action[b]] for a, b in combinations(range(n), 2))
        if Counter(key([action[v] for v in face]) for face in faces) == expected:
            actions.append(action)
    return actions


class Q5:
    """Test-only field pairs; sqrt(5)^2=5, never a float/tolerance test."""

    def __init__(self, a=0, b=0):
        self.a, self.b = Fraction(a), Fraction(b)

    def __add__(self, other):
        other = other if isinstance(other, Q5) else Q5(other)
        return Q5(self.a + other.a, self.b + other.b)

    __radd__ = __add__

    def __neg__(self):
        return Q5(-self.a, -self.b)

    def __sub__(self, other):
        return self + -other

    def __mul__(self, other):
        other = other if isinstance(other, Q5) else Q5(other)
        return Q5(self.a * other.a + 5 * self.b * other.b, self.a * other.b + self.b * other.a)

    __rmul__ = __mul__

    def __truediv__(self, other):
        norm = other.a**2 - 5 * other.b**2
        return self * Q5(other.a / norm, -other.b / norm)

    def __eq__(self, other):
        other = other if isinstance(other, Q5) else Q5(other)
        return self.a == other.a and self.b == other.b

    def __bool__(self):
        return bool(self.a or self.b)

    def __hash__(self):
        return hash(self.a) if not self.b else hash((self.a, self.b))

    def sign(self):
        if not self.a:
            return (self.b > 0) - (self.b < 0)
        if not self.b:
            return (self.a > 0) - (self.a < 0)
        if self.a * self.b > 0:
            return (self.a > 0) - (self.a < 0)
        return ((self.a > 0) - (self.a < 0)) * (1 if self.a * self.a > 5 * self.b * self.b else -1)


@pytest.fixture(scope='module')
def source():
    return json.loads(FIXTURE.read_text(encoding='utf-8'))['model']


@pytest.fixture(scope='module')
def oracle(source):
    rational = [[Fraction.from_float(x) for x in point] for point in source['vertices']]
    scale = lcm(*(x.denominator for point in rational for x in point))
    points = [[int(x * scale) for x in point] for point in rational]
    planes = plane_sets(points, integer=True)
    cycles = {}
    for plane, vertices in planes.items():
        for size in range(3, len(vertices) + 1):
            for subset in combinations(vertices, size):
                for tail in permutations(subset[1:]):
                    cycle = (subset[0], *tail)
                    if cycle[1] < cycle[-1]:
                        cycles[cycle] = plane
    actions = gram_actions(points, source['faces'])
    remaining = set(cycles)
    orbits = []
    while remaining:
        first = min(remaining)
        orbit = {key([action[v] for v in first]) for action in actions}
        assert orbit <= set(cycles)
        remaining -= orbit
        orbits.append(orbit)
    return points, planes, cycles, actions, orbits


def closed(orbit, cycles, n, partial):
    edges = Counter()
    links = defaultdict(list)
    occupied = defaultdict(set)
    used = set()
    for cycle in orbit:
        plane = cycles[cycle]
        if occupied[plane] & set(cycle):
            return False
        occupied[plane].update(cycle)
        used.update(cycle)
        for i, v in enumerate(cycle):
            edges[tuple(sorted((v, cycle[(i + 1) % len(cycle)])))] += 1
            links[v].append((cycle[i - 1], cycle[(i + 1) % len(cycle)]))
    if not partial and len(used) != n:
        return False
    if any(count != 2 for count in edges.values()):
        return False
    for pairs in links.values():
        graph = defaultdict(list)
        for a, b in pairs:
            graph[a].append(b)
            graph[b].append(a)
        if len(graph) < 3 or any(len(neighbors) != 2 for neighbors in graph.values()):
            return False
        reached = set()
        pending = [next(iter(graph))]
        while pending:
            v = pending.pop()
            if v not in reached:
                reached.add(v)
                pending.extend(graph[v])
        if reached != set(graph):
            return False
    return True


def test_pinned_numerical_polar_source_words_and_provider_match(source):
    from engine.generators import regular

    fixture = json.loads(FIXTURE.read_text())
    assert (
        identity(source)
        == fixture['sourceFingerprint']
        == '5e3dacd536a20b3a6e94f0a30614c574e8faafe88fa02a4e711d0cfc192131ac'
    )
    assert [[float(x).hex() for x in point] for point in source['vertices']] == fixture['binary64Words']
    # A changed platform/provider must obtain a new pin rather than inherit this receipt.
    assert identity(regular('dodecahedron')) == identity(source)
    a, b, c = map(Fraction, [source['vertices'][4][0], source['vertices'][17][0], source['vertices'][3][0]])
    assert a + b - 1 == Fraction(1, 9007199254740992)
    assert c - (b - a) == Fraction(3, 36028797018963968)


def test_independent_integer_grid_pool_and_complete_action_oracle(source, oracle):
    points, planes, cycles, actions, orbits = oracle
    assert len(planes) == 807 and Counter(map(len, planes.values())) == {3: 696, 4: 111}
    assert len(cycles) == 1473 and Counter(map(len, cycles)) == {3: 1140, 4: 333}
    assert len(actions) == 24 and len(orbits) == 87
    pool = candidate_facets(source, source_symmetry={'mode': 'all'})
    assert pool['status'] == pool['symmetry']['status'] == 'complete'
    assert {tuple(row['cycle']) for row in pool['candidates']} == set(cycles)
    assert {tuple(row['sourceVertexIds']) for row in pool['planes']} == set(planes.values())
    assert {tuple(action) for action in pool['symmetry']['group']['permutations']} == set(actions)
    lookup = {row['id']: tuple(row['cycle']) for row in pool['candidates']}
    assert {frozenset(lookup[i] for i in row['candidateIds']) for row in pool['symmetry']['orbits']} == set(
        map(frozenset, orbits)
    )
    assert not any(row['sourceFaceIds'] for row in pool['candidates'])
    assert pool['planeWork']['triplesCovered'] == 1140


def test_intended_golden_reference_is_a_different_exact_geometry(source, oracle):
    reference = json.loads(FIXTURE.read_text())['intendedReference']
    points = [[Q5(*pair) for pair in row] for row in reference['coordinateCoefficientPairs']]
    magnitudes = sorted({abs(x) for point in source['vertices'] for x in point})
    intended = dict(zip(magnitudes, [Q5(), Q5(-2, 1), Q5('3/2', '-1/2'), Q5('-1/2', '1/2')]))
    assert points == [
        [intended[abs(x)] if x >= 0 else -intended[abs(x)] for x in point] for point in source['vertices']
    ]
    planes = plane_sets(points)
    actions = gram_actions(points, source['faces'])
    assert len(planes) == 319 and Counter(map(len, planes.values())) == {3: 200, 4: 75, 5: 24, 6: 20}
    cycle_count = sum(
        sum(comb(len(vertices), size) * factorial(size - 1) // 2 for size in range(3, len(vertices) + 1))
        for vertices in planes.values()
    )
    assert cycle_count == 5553
    assert len(actions) == 120
    assert all(any(set(face) <= set(vertices) for vertices in planes.values()) for face in source['faces'])
    supports = []
    for plane, vertices in planes.items():
        signs = {(sum(x * y for x, y in zip(plane[:3], p)) + plane[3]).sign() for p in points} - {0}
        if len(signs) == 1:
            supports.append(frozenset(vertices))
    assert set(supports) == {frozenset(face) for face in source['faces']} and len(supports) == 12
    squared_edges = {
        sum((points[a][k] - points[b][k]) * (points[a][k] - points[b][k]) for k in range(3)) for a, b in source['edges']
    }
    assert len(squared_edges) == 1
    # Algebraic provider work needs a separate cap qualification after its exact adapter exists.
    assert cycle_count > 4096 and cycle_count * len(actions) == 666360 > 100000
    assert set(oracle[3]) < set(actions)
    assert reference['nativeProviderSupported'] is False and reference['coordinateReplacementAuthorized'] is False
    # The literal adapter has distinct nonzero anchors; no numerical tolerance determines either domain.
    assert len(set(map(tuple, points))) == 20


@pytest.mark.parametrize(
    'partial,tidy,spiky,count',
    [(False, False, False, 0), (True, False, False, 2), (True, True, False, 2), (True, True, True, 1)],
)
def test_isohedral_partial_tidy_spiky_search_has_independent_expected_cycles(
    source, oracle, partial, tidy, spiky, count
):
    points, planes, cycles, actions, orbits = oracle
    expected = {frozenset(orbit) for orbit in orbits if closed(orbit, cycles, 20, partial)}
    if spiky:
        supports = []
        for plane in planes:
            signs = [sum(x * y for x, y in zip(plane[:3], p)) + plane[3] for p in points]
            if not (any(x > 0 for x in signs) and any(x < 0 for x in signs)):
                supports.append(set(planes[plane]))
        expected = {
            orbit
            for orbit in expected
            if not any(
                {a, b} <= support
                for cycle in orbit
                for a, b in zip(cycle, cycle[1:] + cycle[:1])
                for support in supports
            )
        }
    assert len(expected) == count
    before = deepcopy(source)
    result = enumerate_facetings(
        source,
        source_symmetry={'mode': 'all'},
        invariant_under_subgroup=True,
        criteria={'isohedral': True, 'accept_partial': partial, 'tidy': tidy, 'spiky': spiky},
    )
    assert result['status'] == result['phaseStatus']['subsetSearch'] == 'complete'
    assert {frozenset(map(tuple, row['cycles'])) for row in result['results']} == expected
    assert result['nodesVisited'] < 150 and verify_search(source, result)['passed']
    assert source == before
    if partial:
        assert all(
            {v for cycle in orbit for v in cycle} == {i for i, p in enumerate(points) if all(p)} for orbit in expected
        )
        assert sorted(len(orbit) for orbit in expected) == ([8] if spiky else [6, 8])
        corners = [i for i, p in enumerate(points) if all(p)]
        tetrahedra = [
            [v for v in corners if ((points[v][0] * points[v][1] * points[v][2]) > 0) == positive]
            for positive in (False, True)
        ]
        tetra_cycles = frozenset(key(cycle) for tetra in tetrahedra for cycle in combinations(tetra, 3))
        squares = set()
        for axis in range(3):
            for positive in (False, True):
                vertices = [v for v in corners if (points[v][axis] > 0) == positive]
                for cycle in permutations(vertices):
                    if all(
                        sum(x != y for x, y in zip(points[a], points[b])) == 1
                        for a, b in zip(cycle, cycle[1:] + cycle[:1])
                    ):
                        squares.add(key(cycle))
        assert len(squares) == 6 and len(tetra_cycles) == 8
        assert expected == ({tetra_cycles} if spiky else {tetra_cycles, frozenset(squares)})


def test_read_only_arithmetic_receipt_reconstructs_exact_nonplanarity(source):
    before = deepcopy(source)
    receipt = dispatch({'op': 'facet-source-arithmetic', 'model': source, 'params': {}})
    assert receipt == inspect_source_arithmetic(source)
    assert receipt['status'] == 'complete' and receipt['nonplanarSourceFaceIds'] == list(range(12))
    assert receipt['candidateDomain']['sourceFaceCyclesPresent'] == 0
    assert receipt['candidateDomain']['cycles'] == 1473 and receipt['sourceSymmetry']['order'] == 24
    assert receipt['sourceSymmetry']['properOrder'] == 12
    assert 0 < receipt['maximumAnchorPlaneDistanceApprox'] < 1e-14
    for row in receipt['sourceFaces']:
        plane = list(map(Fraction, row['exactPlane']))
        values = [
            sum(a * Fraction(b) for a, b in zip(plane[:3], source['vertices'][v])) + plane[3] for v in row['cycle']
        ]
        assert list(map(str, values)) == row['exactPlaneValues'] and any(values)
    assert not receipt['numericCertifiedModel'] and not receipt['sourceGeometryChanged']
    assert not receipt['intendedAlgebraicGeometrySupported'] and source == before


def test_refusals_and_limited_status_never_claim_intended_geometry(source, monkeypatch):
    from engine.automatic_faceting import LIMITS

    for params in ({'snap': True}, {'arithmetic': 'golden'}, None, []):
        with pytest.raises(GeometryError, match='empty parameters'):
            dispatch({'op': 'facet-source-arithmetic', 'model': source, 'params': params})
    many = deepcopy(source)
    many['vertices'].append([0, 0, 0])
    with pytest.raises(GeometryError, match='4 to 20'):
        inspect_source_arithmetic(many)
    with pytest.raises(GeometryError, match='canceled'):
        inspect_source_arithmetic(source, cancelled=lambda: True)
    monkeypatch.setitem(LIMITS, 'planeWork', 1)
    result = inspect_source_arithmetic(source)
    assert result['status'] == 'resource-limited' and not result['candidateDomain']['complete']
    assert 'exact plane-orbit work cap' in result['limitReasons']


def test_partial_spiky_adoption_preserves_all_source_ids_history_reopen_and_replay(source, tmp_path):
    search = dispatch(
        {
            'op': 'facet-search',
            'model': source,
            'params': {
                'source_symmetry': {'mode': 'all'},
                'invariant_under_subgroup': True,
                'criteria': {'isohedral': True, 'accept_partial': True, 'tidy': True, 'spiky': True},
            },
        }
    )
    args = {'search': search, 'result_id': search['results'][0]['id']}
    preview = dispatch({'op': 'facet-adopt', 'model': source, 'params': args})
    pool = dispatch({'op': 'facet-candidates', 'model': source, 'params': {'source_symmetry': {'mode': 'all'}}})
    diagram = dispatch(
        {
            'op': 'facet-diagram',
            'model': source,
            'params': {
                'catalogue': pool,
                'parameters': {'vertex_id': 0, 'search': search, 'result_id': args['result_id']},
            },
        }
    )
    assert diagram['diagram']['status'] == 'complete' and diagram['diagram']['adoption']['model'] == preview
    document = {
        'id': 'source-arithmetic-document',
        'cursor': 0,
        'states': [{'model': source, 'view': {'coordinateUnit': 'mm'}, 'notes': 'literal source'}],
    }
    adopted = dispatch(
        {
            'op': 'recipe-run',
            'params': {
                'document': document,
                'operation': 'facet-adopt',
                'parameters': args,
                'label': 'Partial spiky faceting',
            },
        }
    )
    assert adopted['states'][1]['model'] == preview
    assert preview['vertices'] == source['vertices'] and len({v for face in preview['faces'] for v in face}) == 8
    assert len(preview['faces']) == 8 and preview['provenance']['sourceSnapshot'] == source
    replay = dispatch({'op': 'recipe-replay', 'params': {'document': adopted}})
    assert replay['states'][0]['model'] == preview
    project = {'format': 'polytope-laboratory', 'version': 1, 'active': 0, 'documents': [adopted]}
    path = tmp_path / 'source-arithmetic.polyproj'
    save_project(path, project)
    reopened = dispatch({'op': 'load', 'params': {'path': str(path)}})['project']
    restored = reopened['documents'][0]
    assert restored['states'][0]['model'] == {**source, 'fingerprint': identity(source)}
    assert restored['states'][restored['cursor']]['model'] == preview
    assert dispatch({'op': 'recipe-replay', 'params': {'document': restored}})['states'][0]['model'] == preview
