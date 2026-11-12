"""Independent occupied-shell distance and complete facet/edge oracles."""

from copy import deepcopy
from fractions import Fraction
from itertools import combinations, permutations, product
import json
from pathlib import Path
import subprocess
import sys

import numpy as np
import pytest

from engine.geometry import GeometryError
from engine.history import canonical_model, create_history, record_source, record_operation, replay_history
from engine.server import dispatch
from engine.waterman_sequence import adjacent_shell, CONVENTION

REFERENCE = json.loads((Path(__file__).parent / 'fixtures/waterman-shell-reference.json').read_text())


def generate(**params):
    return dispatch({'op': 'generate', 'params': {'kind': 'waterman-shell', **params}})


def expected_geometry(shape, scale, center):
    if shape == 'rhombic-dodecahedron':
        vertices = list(product((-1, 1), repeat=3)) + [
            tuple(2 * s if i == a else 0 for i in range(3)) for a in range(3) for s in (-1, 1)
        ]
        faces = [
            frozenset(i for i, v in enumerate(vertices) if s * v[a] + t * v[b] == 2)
            for a, b in combinations(range(3), 2)
            for s, t in product((-1, 1), repeat=2)
        ]
    elif shape == 'cube':
        vertices = list(product((-scale, scale), repeat=3))
        faces = [
            frozenset(i for i, v in enumerate(vertices) if v[axis] == sign * scale)
            for axis in range(3)
            for sign in (-1, 1)
        ]
    else:
        seed = (scale, 0, 0) if shape == 'octahedron' else (scale, scale, 0)
        vertices = sorted(
            set(v for perm in set(permutations(seed)) for v in product(*[(-x, x) if x else (0,) for x in perm]))
        )
        faces = [
            frozenset(
                i
                for i, v in enumerate(vertices)
                if sum(a * b for a, b in zip(v, signs)) == (scale if shape == 'octahedron' else 2 * scale)
            )
            for signs in product((-1, 1), repeat=3)
        ]
        if shape == 'cuboctahedron':
            faces += [
                frozenset(i for i, v in enumerate(vertices) if v[axis] == sign * scale)
                for axis in range(3)
                for sign in (-1, 1)
            ]
    edges = {
        frozenset((i, j))
        for i, j in combinations(range(len(vertices)), 2)
        if sum(i in f and j in f for f in faces) == 2
    }
    return [tuple(a + float(b) for a, b in zip(v, center)) for v in vertices], faces, edges


@pytest.mark.parametrize(
    'case',
    REFERENCE['cases'],
    ids=lambda c: c['lattice'] + '-' + c['anchor'] + '-' + str(c['direction']) + '-' + c['shape'],
)
def test_complete_independent_vertices_facets_edges_and_numerical_residuals(case):
    model = generate(
        radius_squared=case['anchor'], direction=case['direction'], lattice=case['lattice'], center=case['center']
    )
    assert [len(model[k]) for k in ('vertices', 'edges', 'faces', 'cells')] == case['counts']
    vertices, faces, edges = expected_geometry(case['shape'], case['scale'], [Fraction(c) for c in case['center']])
    assert set(map(tuple, model['vertices'])) == set(vertices)
    mapping = {i: vertices.index(tuple(v)) for i, v in enumerate(model['vertices'])}
    assert {frozenset(mapping[i] for i in f) for f in model['faces']} == set(faces)
    assert {frozenset(mapping[i] for i in e) for e in model['edges']} == edges
    for face in model['faces']:
        assert all(frozenset((mapping[a], mapping[b])) in edges for a, b in zip(face, face[1:] + face[:1]))
    evidence = model['metadata']['watermanSequence']
    assert evidence['convention'] == CONVENTION == REFERENCE['convention']
    assert evidence['radiusSquared'] == case['radiusSquared']
    assert evidence['searchCertificate']['certified'] is True and model['numeric']['certified'] is False
    assert (
        max(evidence['hullResiduals'][k] for k in ('maximumOutsideSupportResidual', 'maximumFacetPlanarityResidual'))
        < 1e-12
    )
    source = model['metadata'].get('watermanFcc', model['metadata'].get('watermanBall'))['sourceSnapshot'][
        'coordinates'
    ]
    boundary = [
        p
        for p in source
        if sum((Fraction(x) - Fraction(c)) ** 2 for x, c in zip(p, case['center'])) == Fraction(case['radiusSquared'])
    ]
    assert evidence['shellCoordinates'] == boundary


@pytest.mark.parametrize('lattice', ('SC', 'FCC', 'BCC'))
def test_successor_and_predecessor_sequences_from_integer_sums_of_squares(lattice):
    values = REFERENCE['sequences'][lattice]
    for a, b in zip(values, values[1:]):
        assert adjacent_shell(a, lattice=lattice)[0] == str(b)
        assert adjacent_shell(b, lattice=lattice, direction=-1)[0] == str(a)


@pytest.mark.parametrize('lattice', ('SC', 'FCC', 'BCC'))
def test_arbitrary_rational_origin_against_separate_small_cube_enumeration(lattice):
    center = [Fraction(1, 3), Fraction(-2, 5), Fraction(3, 7)]
    sites = [
        p
        for p in product(range(-5, 6), repeat=3)
        if lattice == 'SC'
        or lattice == 'FCC'
        and sum(p) % 2 == 0
        or lattice == 'BCC'
        and p[0] % 2 == p[1] % 2 == p[2] % 2
    ]
    distances = sorted(set(sum((p - c) ** 2 for p, c in zip(point, center)) for point in sites))
    anchor = Fraction(2)
    for direction in (-1, 1):
        expected = (
            max(d for d in distances if d < anchor) if direction == -1 else min(d for d in distances if d > anchor)
        )
        resolved, evidence = adjacent_shell(
            str(anchor), center=[str(c) for c in center], lattice=lattice, direction=direction
        )
        assert resolved == str(expected)
        assert {tuple(p) for p in evidence['shellCoordinates']} == {
            p for p in sites if sum((p - c) ** 2 for p, c in zip(p, center)) == expected
        }
        if direction == 1:
            witness = evidence['searchCertificate']['outsideAnchorWitness']
            assert sum((p - c) ** 2 for p, c in zip(witness, center)) > anchor


def test_float_indistinguishable_threshold_neighbors_keep_strict_shell_order():
    below = str(Fraction(4) - Fraction(1, 10**40))
    assert float(Fraction(below)) == 4.0
    assert generate(radius_squared=below)['metadata']['watermanSequence']['radiusSquared'] == '4'
    assert generate(radius_squared='4')['metadata']['watermanSequence']['radiusSquared'] == '6'
    assert generate(radius_squared=below, direction=-1)['metadata']['watermanSequence']['radiusSquared'] == '2'


def test_translated_lattice_frame_and_metadata_survive_native_project_and_generator_replay(tmp_path):
    params = {
        'radius_squared': '0',
        'center': ['4/2', '-4', '6'],
        'lattice': 'BCC',
        'direction': 1,
        'convention': CONVENTION,
    }
    model = generate(**params)
    np.testing.assert_allclose(np.mean(model['vertices'], axis=0), [2, -4, 6])
    assert model['provenance']['generator']['parameters'] == params
    project = {
        'format': 'polytope-laboratory',
        'version': 1,
        'active': 0,
        'documents': [{'cursor': 0, 'states': [{'model': model, 'view': {}, 'notes': 'Shell source'}]}],
    }
    path = tmp_path / 'shell.polytope'
    dispatch({'op': 'save', 'params': {'path': str(path), 'project': project}})
    restored = dispatch({'op': 'load', 'params': {'path': str(path)}})['project']['documents'][0]['states'][0]['model']
    assert restored == model
    regenerated = generate(**restored['provenance']['generator']['parameters'])
    assert canonical_model(regenerated) == canonical_model(model)
    assert (
        regenerated['metadata']['watermanSequence']['shellCoordinates']
        == model['metadata']['watermanSequence']['shellCoordinates']
    )
    base = {'model': generate(radius_squared=0, lattice='SC'), 'view': {}}
    graph = record_source(create_history(), 'source', base)
    graph = record_operation(
        graph, 'shell', 'source', 'generate', {'kind': 'waterman-shell', **params}, {'model': model, 'view': {}}
    )
    replayed = replay_history(json.loads(json.dumps(graph.to_dict())), dispatch)['shell']['model']
    assert canonical_model(replayed) == canonical_model(model)
    assert replayed['provenance'] == model['provenance']


@pytest.mark.parametrize('case', REFERENCE['refusals'])
def test_named_boundary_refusals_leave_request_unchanged(case):
    params = deepcopy(case['parameters'])
    before = deepcopy(params)
    with pytest.raises(GeometryError, match=case['message']):
        generate(**params)
    assert params == before


@pytest.mark.parametrize(
    'params,message',
    [
        ({'radius_squared': True}, 'floats and booleans'),
        ({'radius_squared': 2.0}, 'floats and booleans'),
        ({'radius_squared': -1}, 'nonnegative'),
        ({'radius_squared': '1/0'}, 'positive integer denominator'),
        ({'direction': True}, 'direction'),
        ({'direction': 0}, 'direction'),
        ({'center': [0, 0]}, 'three'),
        ({'center': [0, 0, 0.5]}, 'floats and booleans'),
        ({'dimension': 4}, 'Unknown'),
        ({'radius_squared': 1000000}, 'resource limit'),
        ({'radius_squared': 2**300}, '256-bit'),
        ({'center': [1000001, 0, 0]}, 'bounded lattice-coordinate'),
        ({'center': ['1/' + str(2**251), '1/' + str(3**159), '1/' + str(5**109)]}, 'common denominator'),
    ],
)
def test_strict_input_and_resource_refusals(params, message):
    with pytest.raises(GeometryError, match=message):
        generate(**params)


def test_degenerate_neighbor_is_not_silently_skipped_and_retry_is_usable():
    resolved, _ = adjacent_shell(0, center=['1/2', 0, 0], lattice='SC')
    assert resolved == '1/4'
    with pytest.raises(GeometryError, match='fewer than four'):
        generate(center=['1/2', 0, 0], lattice='SC')
    assert len(generate(radius_squared='1/4', center=['1/2', 0, 0], lattice='SC')['vertices']) == 8


def test_real_json_lines_protocol_retains_receipts_and_recovers_after_refusal():
    requests = [
        {'id': i, 'op': 'generate', 'params': {'kind': 'waterman-shell', **params}}
        for i, params in enumerate([{'lattice': 'SC'}, {'direction': -1}, {'lattice': 'BCC'}])
    ]
    result = subprocess.run(
        [sys.executable, '-B', '-u', 'engine/server.py'],
        input=''.join(json.dumps(r) + '\n' for r in requests),
        capture_output=True,
        text=True,
        encoding='utf-8',
        timeout=30,
        check=True,
        cwd=Path(__file__).parents[1],
        creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0),
    )
    replies = [json.loads(line) for line in result.stdout.splitlines()]
    assert [(r['id'], r['ok']) for r in replies] == [(0, True), (1, False), (2, True)]
    assert replies[0]['result']['metadata']['watermanSequence']['radiusSquared'] == '1'
    assert replies[2]['result']['metadata']['watermanSequence']['radiusSquared'] == '3'
    assert not result.stderr
