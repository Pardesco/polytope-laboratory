from collections import Counter
from copy import deepcopy
import json
import math
import numpy as np
import pytest

from engine import server
from engine.dual_morph import INVENTORY, SUPPORTED
from engine.dual_morph_snub import prepare_snub
from engine.formats import save_project, load_file
from engine.generators import regular
from engine.geometry import GeometryError, canonical_cycle, hull, identity, validate
from engine.snub_morph_contract import canonical_frame, uniform_q

CONTEXT = {'notes': 'Literal source notes', 'unit': 'mm'}
SETTINGS = dict(
    version=1, enabled=True, method='via-snub', center=None, radius=math.sqrt(2), ratio=0.5, duration=2.0, loop=False
)


def source(a=1.0):
    p = regular('cube')
    p['vertices'] = [[x * a for x in v] for v in p['vertices']]
    p['facetEquations'] = [plane[:-1] + [plane[-1] * a] for plane in p['facetEquations']]
    p['fingerprint'] = identity(p)
    p['metadata'].update(
        coordinateUnits='mm',
        literal={'keep': [1, 'source']},
        offColors={'faces': [{'encoding': 'byte', 'values': [20 * i, 100, 160, 127]} for i in range(6)]},
    )
    return p


def prepare(p, **settings):
    return server.dispatch(
        {
            'op': 'prepare-dual-morph',
            'model': p,
            'params': {'settings': {**SETTINGS, **settings}, 'sourceContext': CONTEXT},
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


@pytest.mark.parametrize('a,r', [(1.0, math.sqrt(2)), (2.0, 0.5), (0.5, 2.0)])
def test_native_literal_endpoints_interiors_residuals_and_hull_oracle(a, r):
    p = source(a)
    before = deepcopy(p)
    prepared = prepare(p, radius=r)
    assert 'via-snub' in INVENTORY and 'via-snub' in SUPPORTED
    assert prepared['descriptor']['form'] == 'A'
    for t in (0, 0.001, 0.1, 0.5, 0.9, 0.999, 1):
        f = evaluate(p, prepared, t)
        m = f['model']
        assert tuple(len(m[k]) for k in ('vertices', 'edges', 'faces')) == (
            (8, 12, 6) if t == 0 else (6, 12, 8) if t == 1 else (24, 60, 38)
        )
        assert validate(m)['passed']
        assert f['certified'] is False
        assert f['normalizedResiduals']['planarity'] < 1e-10
        assert f['normalizedResiduals']['supportViolation'] < 1e-10
        assert f['normalizedResiduals']['minimumStrictSupportGap'] > 1e-10
        assert f['maximumPolarityResidual'] < r * r * 1e-10
        if t == 0:
            assert m == p and f['endpointIdentity'] == 'literal-source'
        elif t == 1:
            assert m == prepared['descriptor']['dual'] and f['endpointIdentity'] == 'literal-polar'
        else:
            assert m['vertices'] == canonical_frame(t, half_width=a, radius=r)['vertices']
            oracle = hull(m['vertices'])
            assert {canonical_cycle(c) for c in m['faces']} == {canonical_cycle(c) for c in oracle['faces']}
            assert Counter(map(len, m['faces'])) == {3: 32, 4: 6}
        assert f == evaluate(p, prepared, t)
    assert p == before


def test_uniform_snub_event_has_equal_edges_and_matches_generated_catalog():
    p = source()
    prepared = prepare(p)
    t = prepared['descriptor']['uniformSnubRatio']
    assert t == 1 - uniform_q() and t != 0.5
    frame = evaluate(p, prepared, t)
    points = np.asarray(frame['model']['vertices'])
    lengths = [np.linalg.norm(points[x] - points[y]) for x, y in frame['model']['edges']]
    assert max(lengths) - min(lengths) < 1e-14
    catalog = np.asarray(regular('snub-cube')['vertices'])
    distances = np.linalg.norm((points / lengths[0])[:, None] - catalog[None, :], axis=2)
    assert len(set(distances.argmin(axis=1))) == 24 and np.max(distances.min(axis=1)) < 1e-9


def reordered():
    p = source()
    order = [5, 0, 7, 2, 1, 6, 3, 4]
    inverse = {v: i for i, v in enumerate(order)}
    p['vertices'] = [p['vertices'][v] for v in order]
    p['facetVertices'] = [[inverse[v] for v in face] for face in p['facetVertices']]
    p['edges'] = [[inverse[v] for v in e[::-1]] for e in p['edges'][::-1]]
    p['faces'] = [[inverse[v] for v in f[1:] + f[:1]] for f in p['faces'][::-1]]
    p['metadata']['offColors']['faces'].reverse()
    p['id'] = 'user-import-with-arbitrary-ids'
    p['fingerprint'] = identity(p)
    return p


def test_literal_entity_ids_corner_maps_transitions_and_authored_colors_after_reordering():
    p = reordered()
    prepared = prepare(p)
    f = evaluate(p, prepared, 0.5)
    d = prepared['descriptor']
    quotient = d['endpointQuotients']
    assert len(set(zip(quotient['source'], quotient['dual']))) == 24
    assert Counter(quotient['source']) == dict.fromkeys(range(8), 3)
    assert Counter(quotient['dual']) == dict.fromkeys(range(6), 4)
    for i, owner in enumerate(f['sourceMaps']['vertices']):
        v, face = owner['sourceVertex'], owner['sourceFacet']
        assert v == quotient['source'][i] and face == quotient['dual'][i] and v in p['faces'][face]
    for kind in ('edges', 'faces'):
        for ids, owner in zip(f['model'][kind], f['sourceMaps'][kind]):
            rank, index = owner['sourceRank'], owner['sourceElement']
            source_image = {quotient['source'][v] for v in ids}
            dual_image = {quotient['dual'][v] for v in ids}
            assert source_image <= ({index} if rank == 0 else set(p[('vertices', 'edges', 'faces')[rank]][index]))
            assert dual_image <= ({index} if rank == 2 else set(d['dual'][('faces', 'edges', 'vertices')[rank]][index]))
            for component, endpoint, image in [('source', p, source_image), ('dual', d['dual'], dual_image)]:
                transition = owner['endpointImages'][component]
                r, i = transition['rank'], transition['element']
                assert image == ({i} if r == 0 else set(endpoint[('vertices', 'edges', 'faces')[r]][i]))
            if kind == 'faces' and rank == 2:
                assert owner['faceKind'] == 'square' and owner['sourceSheetFace'] == index
                color = f['model']['metadata']['offColors']['faces'][f['sourceMaps']['faces'].index(owner)]
                assert color == p['metadata']['offColors']['faces'][index]
    assert {o['faceKind'] for o in f['sourceMaps']['faces']} == {'square', 'diagonal-triangle', 'bridge-triangle'}
    assert evaluate(p, prepared, 0)['model'] == p


def test_optional_rgba_interpolation_retains_ownership_and_literal_endpoints():
    p = source()
    prepared = prepare(p, interpolateColors=True)
    frame = evaluate(p, prepared, 0.25)
    assert frame['model']['metadata']['colorInterpolation']['parameter'] == 0.25
    for kind in ('vertices', 'edges', 'faces'):
        colors = frame['model']['metadata']['offColors'][kind]
        assert len(colors) == len(frame['model'][kind])
        assert all(c['encoding'] == 'float' and c['values'][3] == pytest.approx(127 / 255) for c in colors)
    assert evaluate(p, prepared, 0)['model'] == p
    assert evaluate(p, prepared, 1)['model'] == prepared['descriptor']['dual']


@pytest.mark.parametrize(
    'key', ['octahedron', 'tetrahedron', 'snub-cube', 'truncated-dodecahedron', 'tesseract', 'great-dodecahedron']
)
def test_other_source_domains_are_explicitly_unavailable(key):
    p = regular(key)
    before = deepcopy(p)
    with pytest.raises(GeometryError, match='Via-snub|H3 via-snub'):
        prepare(p)
    assert p == before


@pytest.mark.parametrize(
    'change', ['translate', 'rotate', 'box', 'cycle', 'edge', 'duplicate', 'center', 'bool', 'generalized']
)
def test_cube_label_cannot_bypass_complete_metric_incidence_and_center_gate(change):
    p = source()
    settings = {}
    if change == 'translate':
        p['vertices'] = [[x + 0.25, y, z] for x, y, z in p['vertices']]
    elif change == 'rotate':
        p['vertices'] = [[(x - y) / math.sqrt(2), (x + y) / math.sqrt(2), z] for x, y, z in p['vertices']]
    elif change == 'box':
        p['vertices'] = [[2 * x, y, z] for x, y, z in p['vertices']]
    elif change == 'cycle':
        p['faces'][0][1], p['faces'][0][2] = p['faces'][0][2], p['faces'][0][1]
    elif change == 'edge':
        p['edges'][0] = p['edges'][1][:]
    elif change == 'duplicate':
        p['vertices'][0] = p['vertices'][1][:]
    elif change == 'center':
        settings['center'] = [1e-14, 0, 0]
    elif change == 'bool':
        p['vertices'][0][0] = True
    elif change == 'generalized':
        p['interpretation'] = 'generalized-complex'
    p['fingerprint'] = identity(p)
    with pytest.raises(GeometryError, match='Via-snub|via-snub'):
        prepare(p, **settings)


@pytest.mark.parametrize('t', [1e-8, 0.000999, 0.999001, 1 - 1e-8])
def test_ill_conditioned_collars_refuse_without_endpoint_snaps(t):
    p = source()
    prepared = prepare(p)
    with pytest.raises(GeometryError, match='unresolved.*no endpoint snap'):
        evaluate(p, prepared, t)


@pytest.mark.parametrize('field', ['source', 'attributes', 'notes', 'unit', 'descriptor', 'quotients'])
def test_source_and_preparation_ownership_cannot_be_forged(field):
    p = source()
    prepared = prepare(p)
    context = deepcopy(CONTEXT)
    if field == 'source':
        p['faces'][0].reverse()
    elif field == 'attributes':
        p['metadata']['offColors']['faces'][0]['values'][3] = 126
    elif field == 'notes':
        context['notes'] = 'changed'
    elif field == 'unit':
        context['unit'] = 'cm'
    elif field == 'descriptor':
        prepared['descriptor']['form'] = 'B'
    elif field == 'quotients':
        prepared['descriptor']['endpointQuotients']['source'][0] = 7
    with pytest.raises(GeometryError):
        evaluate(p, prepared, 0.5, context)


def test_plan_accessors_are_detached_and_project_roundtrip_rebuilds_saved_pose(tmp_path):
    p = reordered()
    plan = prepare_snub({'model': p, 'notes': CONTEXT['notes'], 'view': {'coordinateUnit': 'mm'}})
    original = plan.source_snapshot
    original['model']['vertices'][0][0] = 999
    detached = plan.descriptor()
    detached['sourceMaps']['vertices'][0]['sourceVertex'] = 999
    assert plan.source_snapshot['model'] == p and plan.descriptor()['sourceMaps']['vertices'][0]['sourceVertex'] != 999
    prepared = prepare(p)
    frame = evaluate(p, prepared, 0.5)
    state = {
        'model': p,
        'notes': CONTEXT['notes'],
        'view': {'angles': [0] * 6, 'coordinateUnit': 'mm', 'dualMorph': frame['settings']},
    }
    project = {
        'format': 'polytope-laboratory',
        'version': 1,
        'active': 0,
        'documents': [{'id': 'source', 'cursor': 0, 'states': [state]}],
    }
    path = tmp_path / 'snub.polyproj'
    save_project(path, project)
    opened = load_file(path)['project']['documents'][0]['states'][0]
    assert opened['model'] == json.loads(json.dumps(p)) and opened['notes'] == state['notes']
    assert opened['view']['dualMorph'] == frame['settings']
    restored = prepare(opened['model'], **opened['view']['dualMorph'])
    assert evaluate(opened['model'], restored, 0.5)['model'] == frame['model']
    assert evaluate(opened['model'], restored, 0.5)['sourceMaps'] == frame['sourceMaps']
