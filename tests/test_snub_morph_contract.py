"""R5 scope gate: independently proved B3 path, deliberately no new native op."""

from collections import Counter, defaultdict
from copy import deepcopy
from fractions import Fraction
from itertools import permutations, product
import json
from pathlib import Path
import math
import numpy as np
import pytest
from engine.snub_morph_contract import actions, canonical_frame, orbit, topology, uniform_q, MIN_INTERIOR_RATIO
from engine.geometry import GeometryError, canonical_cycle, hull
from engine.generators import regular
from engine.operations import dual
from engine.dual_morph import INVENTORY, SUPPORTED, prepare
from scripts.snub_morph_oracle import fixture, supporting_boundary, support_certificate, rational_vertices, evaluate

FIXTURE = json.loads((Path(__file__).parent / 'fixtures/snub_morph_b3.json').read_text(encoding='utf-8'))


def congruence(reference, candidate, tolerance=1e-9):
    p = np.asarray(reference['vertices'])
    q = np.asarray(candidate['vertices'])
    distances = np.linalg.norm(p[:, None] - q[None, :], axis=2)
    mapping = distances.argmin(axis=1)
    assert len(p) == len(q) == len(set(mapping.tolist()))
    assert max(distances[i, v] for i, v in enumerate(mapping)) < tolerance
    assert {tuple(sorted(mapping[v] for v in e)) for e in reference['edges']} == {
        tuple(sorted(e)) for e in candidate['edges']
    }
    assert {canonical_cycle([int(mapping[v]) for v in f]) for f in reference['faces']} == {
        canonical_cycle(f) for f in candidate['faces']
    }


def test_fixture_regenerates_from_exhaustive_rational_supports_without_engine_or_hull():
    assert fixture() == FIXTURE
    assert len(FIXTURE['vertices']) == 24
    assert len(FIXTURE['edges']) == 60
    assert Counter(map(len, FIXTURE['faces'])) == {3: 32, 4: 6}
    assert topology()['faces'] == FIXTURE['faces']
    assert topology()['edges'] == FIXTURE['edges']


@pytest.mark.parametrize('q', [Fraction(1, 10), Fraction(1, 4), Fraction(3, 4), Fraction(9, 10)])
def test_independent_exact_support_enumeration_at_other_parameters(q):
    boundary = supporting_boundary(q)
    assert boundary['faces'] == FIXTURE['faces']
    assert boundary['edges'] == FIXTURE['edges']
    expected = rational_vertices(q)
    assert orbit(q) == [list(v) for v in expected]


def test_integer_polynomial_certificate_proves_every_support_on_entire_open_interval():
    proof = support_certificate(FIXTURE['faces'])
    assert proof == FIXTURE['supportProof']
    assert proof['identicallyCoplanarIncidences'] == 120
    assert proof['strictGapChecks'] == 792
    assert len(proof['gapPolynomials']) == 27
    # Positive Bernstein coefficients prove strict positivity for ALL 0<q<1.
    assert all(min(map(Fraction, gap['bernstein'])) > 0 for gap in proof['gapPolynomials'])


def test_complete_oriented_spherical_boundary_has_one_pentagonal_link_at_every_vertex():
    edge_uses = defaultdict(list)
    adjacency = defaultdict(set)
    links = defaultdict(lambda: defaultdict(set))
    for face in FIXTURE['faces']:
        for i, v in enumerate(face):
            a, b = face[i - 1], face[(i + 1) % len(face)]
            links[v][a].add(b)
            links[v][b].add(a)
            edge_uses[tuple(sorted((v, b)))].append((v, b))
            adjacency[v].add(b)
            adjacency[b].add(v)
    assert set(edge_uses) == set(map(tuple, FIXTURE['edges']))
    assert all(len(uses) == 2 and uses[0] == uses[1][::-1] for uses in edge_uses.values())
    for v, link in links.items():
        assert len(link) == len(adjacency[v]) == 5
        assert all(len(neighbors) == 2 for neighbors in link.values())
        seen = {next(iter(link))}
        queue = list(seen)
        for current in queue:
            for nxt in link[current] - seen:
                seen.add(nxt)
                queue.append(nxt)
        assert seen == set(link)
    seen = {0}
    queue = [0]
    for v in queue:
        for nxt in adjacency[v] - seen:
            seen.add(nxt)
            queue.append(nxt)
    assert len(seen) == 24 and 24 - 60 + 38 == 2


@pytest.mark.parametrize('form', ['A', 'B'])
@pytest.mark.parametrize('t', [0.0, MIN_INTERIOR_RATIO, 0.1, 0.5, 0.9, 1 - MIN_INTERIOR_RATIO, 1.0])
def test_numeric_frames_have_hull_boundary_and_report_normalized_residuals(form, t):
    frame = canonical_frame(t, form=form)
    congruence(frame, hull(frame['vertices']))
    assert frame['certified'] is False and frame['numeric'] == 'float64-approximate'
    residuals = frame['normalizedResiduals']
    assert residuals['planarity'] < 1e-10 and residuals['supportViolation'] < 1e-10
    assert residuals['minimumStrictSupportGap'] > 1e-10


@pytest.mark.parametrize(
    'label,t,multiplicity,counts', [('cube', 0.0, 3, (8, 12, 6)), ('octahedron', 1.0, 4, (6, 12, 8))]
)
def test_endpoint_quotients_and_face_degenerations_are_explicit(label, t, multiplicity, counts):
    frame = canonical_frame(t)
    endpoint = FIXTURE['endpoints'][label]
    top = topology()
    assert frame['endpoint'] == label and frame['vertices'] == endpoint['vertices']
    assert frame['endpointQuotient'] == endpoint['quotient']
    assert set(Counter(frame['endpointQuotient']).values()) == {multiplicity}
    assert tuple(len(frame[k]) for k in ('vertices', 'edges', 'faces')) == counts
    expected = (
        {'square': 4, 'diagonal-triangle': 1, 'bridge-triangle': 2}
        if t == 0
        else {'square': 1, 'diagonal-triangle': 3, 'bridge-triangle': 2}
    )
    for face, kind in zip(top['faces'], top['faceKinds']):
        assert len({frame['endpointQuotient'][v] for v in face}) == expected[kind]


def test_orbit_vertices_are_exactly_the_24_source_vertex_face_corners():
    cube = FIXTURE['endpoints']['cube']
    octahedron = FIXTURE['endpoints']['octahedron']
    corners = set(zip(cube['quotient'], octahedron['quotient']))
    expected = {
        (i, j)
        for i, v in enumerate(cube['vertices'])
        for j, normal in enumerate(octahedron['vertices'])
        if sum(x * y for x, y in zip(v, normal)) == 1
    }
    assert corners == expected and len(corners) == 24
    assert set(Counter(i for i, j in corners).values()) == {3}
    assert set(Counter(j for i, j in corners).values()) == {4}


@pytest.mark.parametrize('a,r', [(1.0, 1.0), (2.0, 0.5), (0.5, 2.0)])
def test_endpoint_is_the_geometric_polar_with_declared_radius(a, r):
    source = hull(np.asarray(regular('cube')['vertices']) * a)
    before = deepcopy(source)
    congruence(canonical_frame(0, half_width=a, radius=r), source)
    congruence(canonical_frame(1, half_width=a, radius=r), dual(source, radius=r))
    assert source == before


def test_uniform_event_is_unique_interior_root_with_three_independent_edge_orbits():
    poly = FIXTURE['uniformRoot']['polynomialAscending']
    lo, hi = map(Fraction, FIXTURE['uniformRoot']['bracket'])
    assert evaluate(poly, lo) < 0 < evaluate(poly, hi)
    # f'(q)=1+2q+3q^2>0; neither endpoint is a root.
    assert poly == [-1, 1, 1, 1] and evaluate(poly, Fraction(0)) < 0 < evaluate(poly, Fraction(1))
    q = uniform_q()
    assert float(lo) < q < float(hi)
    assert abs(q * q * q + q * q + q - 1) < 1e-15
    top = topology()
    edge_kinds = defaultdict(list)
    for i, face in enumerate(top['faces']):
        for x, y in zip(face, face[1:] + face[:1]):
            edge_kinds[tuple(sorted((x, y)))].append(top['faceKinds'][i])
    assert Counter(tuple(sorted(kinds)) for kinds in edge_kinds.values()) == {
        ('bridge-triangle', 'square'): 24,
        ('bridge-triangle', 'diagonal-triangle'): 24,
        ('bridge-triangle', 'bridge-triangle'): 12,
    }
    for sample in (0.25, q, 0.75):
        points = np.asarray(orbit(sample))
        formulas = {
            ('bridge-triangle', 'square'): 2 * sample**2 * (1 + sample**2),
            ('bridge-triangle', 'diagonal-triangle'): 2 * (1 - sample - sample**3 + sample**4),
            ('bridge-triangle', 'bridge-triangle'): 4 * sample**4 + 2 * (1 - sample) ** 2,
        }
        for (x, y), kinds in edge_kinds.items():
            assert float(np.sum((points[x] - points[y]) ** 2)) == pytest.approx(
                formulas[tuple(sorted(kinds))], abs=1e-14
            )
    frame = canonical_frame(1 - q)
    lengths = [np.linalg.norm(np.asarray(frame['vertices'][x]) - frame['vertices'][y]) for x, y in frame['edges']]
    assert max(lengths) - min(lengths) < 1e-14
    assert frame['ratio'] != 0.5  # Mid-ratio is NOT a claimed uniform snub.


@pytest.mark.parametrize('key,form', list(FIXTURE['catalogConventions'].items()))
def test_full_coordinate_and_cyclic_incidence_catalog_crosswalk_without_rotation_fit(key, form):
    q = uniform_q()
    edge = math.sqrt(2 * q * q * (1 + q * q))
    candidate = {'vertices': (np.asarray(orbit(q, form)) / edge).tolist(), **topology(form)}
    source = regular(key)
    before = deepcopy(source)
    congruence(candidate, source)
    assert source == before
    if key.startswith('antiprism-'):
        assert source['metadata']['uniformSnubVariant']['sourceAssetSha256'] == FIXTURE['antiprismU12SourceSha256']


@pytest.mark.parametrize('q', [Fraction(1, 4), Fraction(1, 2), Fraction(3, 4)])
def test_forms_are_x_reflections_with_24_proper_actions_and_no_improper_signed_axis_action(q):
    a = [tuple(p) for p in orbit(q)]
    b = [tuple(p) for p in orbit(q, 'B')]
    assert b == [(-x, y, z) for x, y, z in a]
    assert set(a).isdisjoint(b) and len(actions()) == 24
    # Six square-face normal lines force any symmetry into the signed-axis group.
    for p in permutations(range(3)):
        parity = (-1) ** sum(p[i] > p[j] for i in range(3) for j in range(i + 1, 3))
        for signs in product((-1, 1), repeat=3):
            transformed = {tuple(signs[k] * v[p[k]] for k in range(3)) for v in a}
            assert (transformed == set(a)) == (parity * math.prod(signs) == 1)


@pytest.mark.parametrize('ratio', [False, None, '0.5', -1, 2, math.inf, math.nan, 1e-9, 1 - 1e-9])
def test_invalid_and_unresolved_ratios_refuse_without_silent_endpoint_snaps(ratio):
    with pytest.raises(GeometryError, match='ratio|unresolved'):
        canonical_frame(ratio)


@pytest.mark.parametrize(
    'params',
    [
        {'form': 'left'},
        {'half_width': False},
        {'half_width': -1},
        {'radius': 0},
        {'radius': math.inf},
        {'radius': 1e200},
        {'radius': 1e-200},
    ],
)
def test_invalid_reciprocal_parameters_refuse(params):
    with pytest.raises(GeometryError):
        canonical_frame(0.5, **params)


def test_production_registration_retains_the_scoped_contract_gate():
    assert 'via-snub' in INVENTORY and 'via-snub' in SUPPORTED
    settings = dict(
        version=1, enabled=True, method='via-snub', center=None, radius=1.0, ratio=0.5, duration=2.0, loop=False
    )
    source = regular('cube')
    before = deepcopy(source)
    plan, _ = prepare(source, settings, {'notes': '', 'unit': 'model'})
    assert plan.evaluate(0.5)['model']['vertices'] == canonical_frame(0.5)['vertices']
    assert source == before
    for key in ('snub-cube', 'tesseract'):
        source = regular(key)
        before = deepcopy(source)
        with pytest.raises(GeometryError, match='only a centered axis-aligned cube'):
            prepare(source, settings, {'notes': '', 'unit': 'model'})
        assert source == before
