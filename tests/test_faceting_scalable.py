"""Integer determinant/cycle and independent vertex-link oracles for R6 FAC."""

from collections import Counter, defaultdict
from copy import deepcopy
from functools import reduce
from itertools import combinations, permutations, product
from math import gcd
from pathlib import Path

import pytest

from engine.automatic_faceting import LIMITS, candidate_facets, enumerate_facetings
from engine.automatic_faceting_workflow import verify_search
from engine.formats import load_file, save_project
from engine.geometry import GeometryError
from engine.server import dispatch

FIXTURE = Path(__file__).resolve().parents[1] / 'examples/faceting/pyritohedron-20.off'


@pytest.fixture(scope='module')
def source():
    result = load_file(FIXTURE)['model']
    result['id'] = 'pyritohedron-20-oracle'
    return result


def integer_plane(a, b, c):
    u = [b[i] - a[i] for i in range(3)]
    v = [c[i] - a[i] for i in range(3)]
    normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
    if not any(normal):
        return None
    row = normal + [-sum(x * y for x, y in zip(normal, a))]
    divisor = reduce(gcd, row)
    row = tuple(x // divisor for x in row)
    return row if next(x for x in row if x) > 0 else tuple(-x for x in row)


def cycle_key(cycle):
    k = cycle.index(min(cycle))
    forward = tuple(cycle[k:] + cycle[:k])
    return min(forward, (forward[0], *reversed(forward[1:])))


def independent_catalogue(source):
    assert all(x == int(x) for point in source['vertices'] for x in point)
    points = [[int(x) for x in point] for point in source['vertices']]
    planes = {}
    for ids in combinations(range(20), 3):
        plane = integer_plane(*(points[i] for i in ids))
        if plane is not None:
            planes[plane] = tuple(
                i for i, p in enumerate(points) if sum(plane[k] * p[k] for k in range(3)) + plane[3] == 0
            )
    cycles = {}
    for plane, ids in planes.items():
        for size in range(3, len(ids) + 1):
            for subset in combinations(ids, size):
                for tail in permutations(subset[1:]):
                    cycle = (subset[0], *tail)
                    if cycle[1] < cycle[-1]:
                        cycles[cycle] = plane
    return planes, cycles


def independent_actions(source):
    points = source['vertices']
    lookup = {tuple(p): i for i, p in enumerate(points)}
    actions = []
    # All signed coordinate permutations, filtered by literal point-set equality.
    # No native group search or tolerance supplies this expected group.
    for axes in permutations(range(3)):
        for signs in product((-1, 1), repeat=3):
            images = [tuple(signs[k] * p[axes[k]] for k in range(3)) for p in points]
            if all(p in lookup for p in images):
                actions.append([lookup[p] for p in images])
    return actions


def independent_orbits(cycles, actions):
    remaining = set(cycles)
    orbits = []
    while remaining:
        first = min(remaining)
        orbit = {cycle_key([action[v] for v in first]) for action in actions}
        remaining -= orbit
        orbits.append(orbit)
    return orbits


def closed_orbit(orbit, planes, *, sharing=False, partial=False):
    edges = Counter()
    links = defaultdict(list)
    occupied = defaultdict(set)
    vertices = set()
    for cycle in orbit:
        plane = planes[cycle]
        if not sharing and occupied[plane] & set(cycle):
            return False
        occupied[plane].update(cycle)
        vertices.update(cycle)
        for i, v in enumerate(cycle):
            edges[tuple(sorted((v, cycle[(i + 1) % len(cycle)])))] += 1
            links[v].append((cycle[i - 1], cycle[(i + 1) % len(cycle)]))
    if any(n != 2 for n in edges.values()) or (not partial and len(vertices) != 20):
        return False
    for pairs in links.values():
        adjacency = defaultdict(list)
        for a, b in pairs:
            adjacency[a].append(b)
            adjacency[b].append(a)
        if len(adjacency) < 3 or any(len(row) != 2 for row in adjacency.values()):
            return False
        reached = set()
        pending = [next(iter(adjacency))]
        while pending:
            vertex = pending.pop()
            if vertex not in reached:
                reached.add(vertex)
                pending.extend(adjacency[vertex])
        if reached != set(adjacency):
            return False
    return bool(orbit)


@pytest.fixture(scope='module')
def oracle(source):
    planes, cycles = independent_catalogue(source)
    actions = independent_actions(source)
    return planes, cycles, actions, independent_orbits(cycles, actions)


def test_integer_dodecahedron_full_candidate_domain_and_verified_plane_orbits(source, oracle):
    before = deepcopy(source)
    planes, cycles, actions, orbits = oracle
    assert Counter(map(len, planes.values())) == {3: 624, 4: 99, 5: 12}
    assert len(planes) == 735 and len(cycles) == 1761
    assert Counter(map(len, cycles)) == {3: 1140, 4: 477, 5: 144}
    assert len(actions) == 24 and len(orbits) == 101
    pool = candidate_facets(source, source_symmetry={'mode': 'all'})
    assert pool['status'] == pool['generationStatus'] == pool['symmetry']['status'] == 'complete'
    assert {tuple(row['cycle']) for row in pool['candidates']} == set(cycles)
    assert {tuple(row['sourceVertexIds']) for row in pool['planes']} == set(planes.values())
    assert pool['sourceSymmetryDiscovery']['complete'] and pool['symmetry']['group']['order'] == 24
    assert {tuple(a) for a in pool['symmetry']['group']['permutations']} == {tuple(a) for a in actions}
    lookup = {row['id']: tuple(row['cycle']) for row in pool['candidates']}
    assert {frozenset(lookup[i] for i in orbit['candidateIds']) for orbit in pool['symmetry']['orbits']} == set(
        map(frozenset, orbits)
    )
    work = pool['planeWork']
    assert work['triplesCovered'] == work['totalSourceTriples'] == 1140
    assert work['planeOrbitsVisited'] == 42 and work['workUsed'] == 4929 < work['workLimit'] == 50000
    assert pool['triplesExamined'] == 42 and source == before


@pytest.mark.parametrize('sharing,partial', [(False, False), (True, False), (False, True)])
def test_exhausted_isohedral_orbit_search_matches_independent_vertex_link_oracle(source, oracle, sharing, partial):
    _, cycles, actions, orbits = oracle
    expected = {frozenset(orbit) for orbit in orbits if closed_orbit(orbit, cycles, sharing=sharing, partial=partial)}
    assert len(expected) == (3 if partial else 1)
    if not sharing and not partial:
        assert len(expected) == 1 and next(iter(expected)) == frozenset(cycle_key(face) for face in source['faces'])
    result = enumerate_facetings(
        source,
        source_symmetry={'mode': 'all'},
        invariant_under_subgroup=True,
        criteria={
            'isohedral': True,
            'coplanar_vertices': 'allow' if sharing else 'disjoint',
            'accept_partial': partial,
        },
    )
    assert result['status'] == result['phaseStatus']['subsetSearch'] == 'complete'
    assert {frozenset(map(tuple, row['cycles'])) for row in result['results']} == expected
    assert result['candidateCount'] == 1761 and result['searchPruning']['inputVariables'] == 101
    assert result['nodesVisited'] < 250 and result['searchPruning']['invariantFaceTypeCap'] == 1
    assert all(row['symmetryEvidence']['stabilizerOrder'] == 24 for row in result['results'])
    assert verify_search(source, result)['passed']


def test_default_isohedral_profile_has_a_fixed_independent_count_and_small_search(source):
    result = enumerate_facetings(
        source, source_symmetry={'mode': 'all'}, invariant_under_subgroup=True, criteria={'isohedral': True}
    )
    assert result['distinctResultsFound'] == 1 and result['nodesVisited'] == 113
    assert result['searchPruning']['retainedVariables'] == 62
    assert result['searchPruning']['discardReasons'] == {
        'internal edge multiplicity': 28,
        'internal coplanar vertex sharing': 11,
    }
    by_type = enumerate_facetings(
        source, source_symmetry={'mode': 'all'}, invariant_under_subgroup=True, criteria={'max_face_types': 1}
    )
    assert by_type['status'] == 'complete' and len(by_type['results']) == 1


def test_larger_source_budgets_and_unsupported_domains_are_explicit(source, monkeypatch):
    capped = enumerate_facetings(source, source_symmetry={'mode': 'all'}, invariant_under_subgroup=True, result_limit=2)
    assert capped['status'] == 'resource-limited' and len(capped['results']) == 2
    assert capped['limitReasons'] == ['result storage cap']
    node_capped = enumerate_facetings(
        source, source_symmetry={'mode': 'all'}, invariant_under_subgroup=True, node_limit=1
    )
    assert node_capped['nodesVisited'] == 1 and node_capped['status'] == 'resource-limited'
    labeled = enumerate_facetings(source)
    assert labeled['nodesVisited'] == 0 and labeled['status'] == 'resource-limited'
    assert any('variable-domain frontier' in reason for reason in labeled['limitReasons'])
    short = candidate_facets(source, source_symmetry={'mode': 'all', 'work_limit': 1})
    assert (
        short['sourceSymmetryDiscovery']['status'] == 'resource-limited' and short['generationStatus'] == 'not-started'
    )
    monkeypatch.setitem(LIMITS, 'planeWork', 1)
    stopped = enumerate_facetings(source)
    assert stopped['status'] == 'resource-limited' and stopped['planeWork']['workUsed'] == 1
    assert stopped['results'] == [] and 'exact plane-orbit work cap' in stopped['limitReasons']
    for kwargs in ({'criteria': {'tidy_dual': True}}, {'criteria': {'tidy_dual': True}, 'equivalence': 'subgroup'}):
        with pytest.raises(GeometryError, match='Tidy-dual search supports 4 through 12'):
            enumerate_facetings(source, **kwargs)
    too_large = deepcopy(source)
    too_large['vertices'].append([0, 0, 0])
    with pytest.raises(GeometryError, match='4 to 20'):
        candidate_facets(too_large)


@pytest.mark.parametrize('policy,count', [('tidy', 1), ('spiky', 0)])
def test_exact_policy_filters_on_twenty_vertex_isohedral_domain(source, policy, count):
    result = enumerate_facetings(
        source,
        source_symmetry={'mode': 'all'},
        invariant_under_subgroup=True,
        criteria={'isohedral': True, policy: True},
    )
    assert result['status'] == 'complete' and len(result['results']) == count
    assert 0 < result['exactPolicyWork']['used'] <= result['exactPolicyWork']['limit']
    # The only full-vertex isohedral result is the source boundary itself.
    # It is tidy and necessarily contains hull-boundary edges, hence not spiky.


def test_cancellation_in_plane_orbit_generation_and_subset_search(source):
    calls = 0

    def cancel_planes():
        nonlocal calls
        calls += 1
        return calls > 2

    canceled = candidate_facets(source, cancelled=cancel_planes)
    assert canceled['status'] == canceled['generationStatus'] == 'user-cancelled'
    assert canceled['planeWork']['workUsed'] <= canceled['planeWork']['workLimit']
    assert 'candidate-plane generation canceled' in canceled['limitReasons']
    calls = 0

    def count_generation():
        nonlocal calls
        calls += 1
        return False

    candidate_facets(source, source_symmetry={'mode': 'all'}, cancelled=count_generation)
    generation_calls = calls
    calls = 0

    def cancel_search():
        nonlocal calls
        calls += 1
        return calls > generation_calls + 5

    result = enumerate_facetings(
        source,
        source_symmetry={'mode': 'all'},
        invariant_under_subgroup=True,
        criteria={'isohedral': True},
        cancelled=cancel_search,
    )
    assert result['status'] == result['phaseStatus']['subsetSearch'] == 'user-cancelled'
    assert result['candidateGenerationStatus'] == 'complete' and result['nodesVisited'] == 5
    assert result['limitReasons'] == ['subset search canceled']


def test_twenty_vertex_adoption_history_project_and_diagram_use_existing_dispatch(source, tmp_path):
    before = deepcopy(source)
    receipt = dispatch(
        {
            'op': 'facet-search',
            'model': source,
            'params': {
                'source_symmetry': {'mode': 'all'},
                'invariant_under_subgroup': True,
                'criteria': {'isohedral': True},
            },
        }
    )
    args = {'search': receipt, 'result_id': receipt['results'][0]['id']}
    preview = dispatch({'op': 'facet-adopt', 'model': source, 'params': args})
    assert preview['vertices'] == source['vertices'] and preview['validation']['passed']
    assert len(preview['faces']) == 12 and len(preview['edges']) == 30
    assert not preview['numeric']['certified'] and preview['provenance']['convexified'] is False
    pool = dispatch({'op': 'facet-candidates', 'model': source, 'params': {'source_symmetry': {'mode': 'all'}}})
    diagram = dispatch(
        {
            'op': 'facet-diagram',
            'model': source,
            'params': {
                'catalogue': pool,
                'parameters': {'vertex_id': 0, 'search': receipt, 'result_id': args['result_id']},
            },
        }
    )
    assert diagram['diagram']['status'] == 'complete' and diagram['diagram']['adoption']['model'] == preview
    doc = {
        'id': 'faceting-20',
        'cursor': 0,
        'states': [{'model': source, 'view': {'coordinateUnit': 'mm'}, 'notes': '20 vertex source'}],
    }
    adopted = dispatch(
        {'op': 'recipe-run', 'params': {'document': doc, 'operation': 'facet-adopt', 'parameters': args}}
    )
    assert adopted['cursor'] == 1 and len(adopted['states']) == 2
    assert adopted['states'][1]['model'] == preview and adopted['states'][1]['notes'] == '20 vertex source'
    replayed = dispatch({'op': 'recipe-replay', 'params': {'document': adopted}})
    assert replayed['states'][0]['model'] == preview
    path = tmp_path / 'faceting-20.polyproj'
    save_project(path, {'format': 'polytope-laboratory', 'version': 1, 'active': 0, 'documents': [adopted]})
    opened = load_file(path)['project']['documents'][0]
    assert opened['cursor'] == 1 and opened['states'][0]['model'] == source
    assert opened['states'][1]['model'] == preview and source == before
