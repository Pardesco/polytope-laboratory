from collections import Counter
from copy import deepcopy
import json
from pathlib import Path
import numpy as np
import pytest

from engine import server
from engine.formats import save_project, load_file
from engine.generators import regular
from engine.geometry import GeometryError, canonical_cycle, hull, identity, validate
from engine.dual_morph_snub import prepare_snub

CONTEXT = {'notes': 'H3 literal source notes', 'unit': 'mm'}
SETTINGS = dict(
    version=1, enabled=True, method='via-snub', center=None, radius=1.7, ratio=0.5, duration=1.0, loop=False
)


def source(key, transformed=False):
    p = regular(key)
    if transformed:
        theta = 0.37
        c, s = np.cos(theta), np.sin(theta)
        rotation = np.asarray([[c, -s, 0], [s, c, 0], [0, 0, 1]])
        p = hull((np.asarray(p['vertices']) @ rotation.T) * 2.3 + [2, -1, 0.75], key)
        p['faces'] = [f[1:] + f[:1] for f in p['faces'][::-1]]
        p['id'] = 'user source with reordered faces'
        p['fingerprint'] = identity(p)
    p['metadata'].update(
        coordinateUnits='mm',
        authored={'literal': [1, 'retain']},
        offColors={'faces': [{'encoding': 'byte', 'values': [i * 10, 100, 160, 127]} for i in range(len(p['faces']))]},
    )
    return p


def prepare(p, **changes):
    return server.dispatch(
        {
            'op': 'prepare-dual-morph',
            'model': p,
            'params': {'settings': {**SETTINGS, **changes}, 'sourceContext': CONTEXT},
        }
    )


def evaluate(p, prepared, ratio, context=CONTEXT):
    return server.dispatch(
        {
            'op': 'evaluate-dual-morph',
            'model': p,
            'params': {'prepared': prepared, 'ratio': ratio, 'sourceContext': context},
        }
    )


@pytest.mark.parametrize('key', ['dodecahedron', 'icosahedron'])
@pytest.mark.parametrize('transformed', [False, True])
def test_endpoints_interiors_and_independent_hull_oracle(key, transformed):
    p = source(key, transformed)
    before = deepcopy(p)
    prepared = prepare(p)
    assert prepared['descriptor']['family'] == 'H3'
    for t in (0, 0.001, 0.1, 0.25, 0.5, 0.75, 0.9, 0.999, 1):
        frame = evaluate(p, prepared, t)
        m = frame['model']
        assert validate(m)['passed'] and frame['certified'] is False
        assert frame['normalizedResiduals']['planarity'] < 1e-8
        assert frame['normalizedResiduals']['supportViolation'] < 1e-8
        assert frame['normalizedResiduals']['minimumStrictSupportGap'] > 1e-10
        assert frame['maximumPolarityResidual'] < 1e-10 * SETTINGS['radius'] ** 2
        if t == 0:
            assert m == p and frame['endpointIdentity'] == 'literal-source'
        elif t == 1:
            assert m == prepared['descriptor']['dual'] and frame['endpointIdentity'] == 'literal-polar'
            center = np.asarray(prepared['settings']['center'])
            points = np.asarray(p['vertices'])
            for f, cycle in enumerate(p['faces']):
                normal_support = points[cycle].mean(axis=0) - center
                expected = center + SETTINGS['radius'] ** 2 * normal_support / (normal_support @ normal_support)
                assert m['vertices'][f] == pytest.approx(expected, abs=1e-10)
        else:
            assert [len(m[k]) for k in ('vertices', 'edges', 'faces')] == [60, 150, 92]
            assert Counter(map(len, m['faces'])) == {3: 80, 5: 12}
            oracle = hull(m['vertices'])
            assert {canonical_cycle(f) for f in oracle['faces']} == {canonical_cycle(f) for f in m['faces']}
        assert frame == evaluate(p, prepared, t)
    assert p == before


@pytest.mark.parametrize('key', ['dodecahedron', 'icosahedron'])
def test_uniform_event_matches_independent_coxeter_orbit_distance_oracle(key):
    p = source(key)
    prepared = prepare(p)
    assert prepared['descriptor']['uniformSnubRatio'] == 0.5
    frame = evaluate(p, prepared, 0.5)
    points = np.asarray(frame['model']['vertices'])
    points -= points.mean(axis=0)
    lengths = [np.linalg.norm(points[a] - points[b]) for a, b in frame['model']['edges']]
    assert (max(lengths) - min(lengths)) / min(lengths) < 1e-10
    points /= lengths[0]
    # Separate nonlinear equations + complete Coxeter proper orbit, not corner interpolation.
    oracle = np.asarray(regular('snub-dodecahedron')['vertices'])
    expected = np.sort(np.linalg.norm(oracle - oracle[0], axis=1))
    assert np.max(np.abs(np.sort(np.linalg.norm(points[:, None] - points[None, :], axis=2), axis=1) - expected)) < 1e-8
    # Full coordinate/incidence congruence, allowing either mirror convention.
    face = next(f for f in frame['model']['faces'] if len(f) == 3)
    from itertools import permutations

    matched = False
    catalog = regular('snub-dodecahedron')
    for triangle in catalog['faces']:
        if len(triangle) != 3:
            continue
        for ids in permutations(triangle):
            transform = np.linalg.solve(points[face], oracle[list(ids)])
            if np.max(np.abs(transform.T @ transform - np.eye(3))) > 1e-8:
                continue
            distances = np.linalg.norm((points @ transform)[:, None] - oracle[None, :], axis=2)
            mapping = distances.argmin(axis=1)
            if np.max(distances.min(axis=1)) > 1e-8 or len(set(mapping)) != 60:
                continue
            assert {canonical_cycle([int(mapping[v]) for v in f]) for f in frame['model']['faces']} == {
                canonical_cycle(f) for f in catalog['faces']
            }
            matched = True
            break
        if matched:
            break
    assert matched
    assert prepared['descriptor']['uniformEdgeRelativeResidual'] < 1e-10


@pytest.mark.parametrize('key', ['dodecahedron', 'icosahedron'])
def test_all_corner_and_endpoint_entity_maps_literal_colors_and_interpolation(key):
    p = source(key, True)
    prepared = prepare(p)
    frame = evaluate(p, prepared, 0.25)
    descriptor = prepared['descriptor']
    q = descriptor['endpointQuotients']
    assert len(set(zip(q['source'], q['dual']))) == 60
    assert Counter(q['source']) == dict.fromkeys(range(len(p['vertices'])), 3 if key == 'dodecahedron' else 5)
    for kind in ('vertices', 'edges', 'faces'):
        entities = [[i] for i in range(60)] if kind == 'vertices' else frame['model'][kind]
        for ids, owner in zip(entities, frame['sourceMaps'][kind]):
            for component, endpoint in [('source', p), ('dual', descriptor['dual'])]:
                image = {q[component][i] for i in ids}
                mapped = owner['endpointImages'][component]
                assert image == (
                    {mapped['element']}
                    if mapped['rank'] == 0
                    else set(endpoint[('vertices', 'edges', 'faces')[mapped['rank']]][mapped['element']])
                )
    for i, owner in enumerate(frame['sourceMaps']['faces']):
        if owner['sourceRank'] == 2:
            assert owner['sourceSheetFace'] == owner['sourceElement']
            assert (
                frame['model']['metadata']['offColors']['faces'][i]
                == p['metadata']['offColors']['faces'][owner['sourceElement']]
            )
        else:
            assert owner['sourceSheetFace'] is None
            entity = {owner['sourceElement']} if owner['sourceRank'] == 0 else set(p['edges'][owner['sourceElement']])
            expected = np.mean(
                [
                    np.asarray(p['metadata']['offColors']['faces'][f]['values']) / 255
                    for f, cycle in enumerate(p['faces'])
                    if entity <= set(cycle)
                ],
                axis=0,
            )
            color = frame['model']['metadata']['offColors']['faces'][i]
            assert color['encoding'] == 'float' and color['values'] == pytest.approx(expected)
    blended = evaluate(p, prepare(p, interpolateColors=True), 0.25)
    assert blended['model']['metadata']['colorInterpolation']['parameter'] == 0.25
    assert all(c['values'][3] == pytest.approx(127 / 255) for c in blended['model']['metadata']['offColors']['faces'])


@pytest.mark.parametrize('key', ['dodecahedron', 'icosahedron'])
def test_saved_project_rebuilds_literal_source_notes_units_pose_and_maps(tmp_path, key):
    p = source(key, True)
    prepared = prepare(p)
    frame = evaluate(p, prepared, 0.75)
    state = {
        'model': p,
        'notes': CONTEXT['notes'],
        'view': {'coordinateUnit': 'mm', 'angles': [0] * 6, 'dualMorph': frame['settings']},
    }
    project = {
        'format': 'polytope-laboratory',
        'version': 1,
        'active': 0,
        'documents': [{'id': key, 'cursor': 0, 'states': [state]}],
    }
    path = tmp_path / 'h3.polyproj'
    save_project(path, project)
    reopened = load_file(path)['project']['documents'][0]['states'][0]
    assert reopened['model'] == json.loads(json.dumps(p)) and reopened['notes'] == CONTEXT['notes']
    restored = evaluate(reopened['model'], prepare(reopened['model'], **reopened['view']['dualMorph']), 0.75)
    assert restored == frame
    plan = prepare_snub(state)
    detached = plan.descriptor()
    detached['endpointQuotients']['source'][0] = 999
    assert plan.descriptor()['endpointQuotients']['source'][0] != 999


@pytest.mark.parametrize('change', ['distort', 'face', 'edge', 'duplicate', 'bool', 'generalized', 'center'])
def test_source_name_does_not_bypass_metric_incidence_or_center_checks(change):
    p = source('dodecahedron')
    settings = {}
    if change == 'distort':
        p['vertices'][0][0] += 0.001
    elif change == 'face':
        p['faces'][0][1], p['faces'][0][2] = p['faces'][0][2], p['faces'][0][1]
    elif change == 'edge':
        p['edges'][0] = p['edges'][1][:]
    elif change == 'duplicate':
        p['vertices'][0] = p['vertices'][1][:]
    elif change == 'bool':
        p['vertices'][0][0] = True
    elif change == 'generalized':
        p['interpretation'] = 'generalized-complex'
    elif change == 'center':
        settings['center'] = [0.1, 0, 0]
    p['fingerprint'] = identity(p)
    with pytest.raises(GeometryError, match='H3|via-snub'):
        prepare(p, **settings)


@pytest.mark.parametrize('t', [-1, 1e-8, 0.00099, 0.99901, 1 - 1e-8, 2, True])
def test_parameter_refusal_without_snapping(t):
    p = source('icosahedron')
    plan = prepare_snub({'model': p})
    with pytest.raises(GeometryError, match='ratio|unresolved'):
        plan.evaluate(t)


@pytest.mark.parametrize('field', ['notes', 'unit', 'colors', 'descriptor', 'quotient'])
def test_binding_covers_context_attributes_and_coefficients(field):
    p = source('dodecahedron')
    prepared = prepare(p)
    context = deepcopy(CONTEXT)
    if field == 'notes':
        context['notes'] += 'changed'
    elif field == 'unit':
        context['unit'] = 'cm'
    elif field == 'colors':
        p['metadata']['offColors']['faces'][0]['values'][3] = 126
    elif field == 'descriptor':
        prepared['descriptor']['uniformSeedCoefficients'][0] += 0.001
    elif field == 'quotient':
        prepared['descriptor']['endpointQuotients']['source'][0] = 999
    with pytest.raises(GeometryError):
        evaluate(p, prepared, 0.5, context)


def test_inventory_receipt_retains_refusals_and_binds_selected_implementation():
    from scripts.morph_method_inventory import METHODS, SOURCES, implementation_hashes

    receipt = json.loads((Path(__file__).parent / 'fixtures/morph_method_inventory_r7.json').read_text())
    assert len(receipt['rows']) == len(METHODS) * len(SOURCES) == 117
    assert {(r['source'], r['method']) for r in receipt['rows']} == {(s, m) for s in SOURCES for m in METHODS}
    assert Counter(r['status'] for r in receipt['rows']) == {'sampled': 66, 'refused': 51}
    for r in receipt['rows']:
        if r['status'] == 'sampled':
            assert [s['ratio'] for s in r['samples']] == receipt['sampleRatios']
        else:
            assert r['reason']
        if r['method'] == 'via-snub':
            assert (r['status'] == 'sampled') == (r['source'] in ('cube', 'dodecahedron', 'icosahedron'))
    assert (
        receipt['implementationSha256']['engine/dual_morph_snub_h3.py']
        == implementation_hashes()['engine/dual_morph_snub_h3.py']
    )
