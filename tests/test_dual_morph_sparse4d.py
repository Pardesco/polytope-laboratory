"""ANIM-02 large convex 4D domains, including independent complete-boundary checks."""

from copy import deepcopy
from collections import Counter
import json
from unittest.mock import patch

import numpy as np
import pytest

from engine import dual_morph as morph
from engine.dual_morph_expansion import _lattice, _dual_topology, prepare_dual_morph
from engine.dual_morph_sparse4d import SparseIncidence, product_records, dual_topology, edge_face_incidence
from engine.generators import regular
from engine.geometry import GeometryError, identity
from engine.formats import save_project, load_file
from scripts.morph4d_oracle import audit

KINDS = ('vertices', 'edges', 'faces', 'cells')
CONTEXT = {'notes': 'Literal 4D source notes', 'unit': 'mm'}


def settings(method='expansion', **changes):
    return dict(
        version=1, enabled=True, method=method, center=None, radius=1.0, ratio=0.37, duration=1.0, loop=False, **changes
    )


def evaluate(model, prepared, ratio):
    return morph.dispatch_dual_morph(
        dict(op='evaluate-dual-morph', model=model, params=dict(prepared=prepared, ratio=ratio, sourceContext=CONTEXT))
    )


@pytest.fixture(scope='module', params=('cell120', 'cell600'))
def domain(request):
    source = regular(request.param)
    source['metadata'].update(coordinateUnits='mm', historical={'preserved': [1, 2, 3]})
    source['metadata']['offColors'] = {
        kind: [{'encoding': 'byte', 'values': [40, 80, 160, 127]} for _ in source[kind]] for kind in ('faces', 'cells')
    }
    with patch('engine.geometry.hull', side_effect=AssertionError('Production must not use a hull.')):
        plan = prepare_dual_morph({'model': source, 'notes': CONTEXT['notes'], 'view': {'coordinateUnit': 'mm'}})
    return source, plan


@pytest.mark.parametrize('key', ('simplex4', 'tesseract', 'cross4', 'cell24'))
def test_sparse_literal_order_agrees_with_cartesian_reference(key):
    source = regular(key)
    lattice = _lattice(source)
    assert dual_topology(source, lattice) == _dual_topology(source, lattice)
    products, lookups = product_records(lattice)
    for k in range(4):
        expected = [
            (r, a, k - r, b)
            for r in range(k + 1)
            for a, A in enumerate(lattice[r])
            for b, B in enumerate(lattice[3 - (k - r)])
            if A <= B
        ]
        assert products[k] == expected
        assert lookups[k] == {record: i for i, record in enumerate(expected)}


def test_sparse_budget_and_empty_elements_refuse():
    lattice = _lattice(regular('tesseract'))
    with pytest.raises(GeometryError, match='budget'):
        SparseIncidence(lattice, budget=1)
    lattice[1][0] = frozenset()
    with pytest.raises(GeometryError, match='empty'):
        SparseIncidence(lattice)
    with patch('engine.dual_morph_sparse4d.MAX_PAIRS', 4):
        with pytest.raises(GeometryError, match='budget'):
            edge_face_incidence([[0, 1, 2]], [[0, 1]] * 5, 3)


@pytest.mark.parametrize('method', ('expansion', 'tilting-quads'))
def test_dispatch_preparation_primes_literal_product_cache(method):
    source = regular('tesseract')
    morph._PRODUCT_4D_CACHE.clear()
    with patch.object(morph, 'prepare', wraps=morph.prepare) as build:
        prepared = morph.dispatch_dual_morph(
            dict(op='prepare-dual-morph', model=source, params=dict(settings=settings(method), sourceContext=CONTEXT))
        )
        evaluate(source, prepared, 0.37)
        evaluate(source, prepared, 0.63)
        assert build.call_count == 1
    forged = deepcopy(prepared)
    forged['descriptor']['expansion']['end'][0][0] += 0.1
    with pytest.raises(GeometryError, match='changed|forged'):
        evaluate(source, forged, 0.37)
    changed = deepcopy(source)
    changed['metadata']['literalEdit'] = 'different attributes'
    with pytest.raises(GeometryError, match='changed|forged'):
        evaluate(changed, prepared, 0.37)


def test_sparse_content_matches_independent_dense_incidence_with_varied_rgba():
    source = regular('tesseract')
    source['metadata']['offColors'] = {
        kind: [
            {'encoding': 'byte', 'values': [i % 256, (i * 17) % 256, 160, 80 + i % 128]}
            for i in range(len(source[kind]))
        ]
        for kind in ('faces', 'cells')
    }
    dense = prepare_dual_morph({'model': source})
    with patch('engine.dual_morph_expansion.MAX_PAIRS', 1):
        sparse = prepare_dual_morph({'model': source})
    for method in ('expansion', 'tilting-quads'):
        assert sparse.evaluate(method, 0.37) == dense.evaluate(method, 0.37)


@pytest.mark.parametrize('method', ('expansion', 'tilting-quads'))
@pytest.mark.parametrize('ratio', (0.13, 0.5, 0.87))
def test_independent_complete_hull_boundary_and_all_cell_links(domain, method, ratio):
    source, plan = domain
    before = deepcopy(source)
    frame = plan.evaluate(method, ratio)
    expected = [2400, 7200, 7440, 2640] if method == 'expansion' else [2640, 7440, 7200, 2400]
    receipt = audit(frame['model'])
    assert receipt['counts'] == expected
    assert frame['certified'] is False and receipt['certified'] is False
    assert source == before
    evidence = plan.descriptor()['supportEvidence']
    assert evidence['maximumFactorPlanarityResidual'] < 1e-12
    assert evidence['maximumFactorSupportViolation'] < 1e-12
    assert evidence['minimumFactorSupportOffset'] > 0.01


@pytest.mark.parametrize('method', ('expansion', 'tilting-quads'))
def test_endpoint_identity_every_rank_map_and_affine_or_reciprocal_formula(domain, method):
    source, plan = domain
    d = plan.descriptor()
    assert plan.evaluate(method, 0)['model'] == source
    assert plan.evaluate(method, 1)['model'] == plan.dual
    t = 0.37
    frame = plan.evaluate(method, t)
    points = np.asarray(frame['model']['vertices'])
    center = np.asarray(d['center'])
    lattice = _lattice(source)
    if method == 'expansion':
        expected = center + (1 - t) * np.asarray(d['expansion']['start']) + t * np.asarray(d['expansion']['end'])
    else:
        data = d['tiltingQuads']
        offsets = t * np.asarray(data['primalOffsets']) + (1 - t) * np.asarray(data['dualOffsets'])
        expected = center + np.asarray(data['normals']) / offsets[:, None]
    assert np.max(np.abs(points - expected)) < 1e-13
    for rank, kind in enumerate(KINDS):
        owners = frame['sourceMaps'][kind]
        assert len(owners) == len(frame['model'][kind])
        for owner in owners:
            if 'sourceVertex' in owner:
                assert owner['sourceVertex'] in {
                    v for f in source['cells'][owner['sourceFacet']] for v in source['faces'][f]
                }
            else:
                r = owner['sourceRank']
                s = owner['dualRank']
                a = owner['sourceElement']
                b = owner['dualOriginElement']
                assert 0 <= a < len(source[KINDS[r]]) and 0 <= b < len(source[KINDS[3 - s]])
                assert lattice[r][a] <= lattice[3 - s][b]
        if kind in ('faces', 'cells'):
            assert len(frame['model']['metadata']['offColors'][kind]) == len(owners)
            for color in frame['model']['metadata']['offColors'][kind]:
                assert np.allclose(
                    np.asarray(color['values']) / (255 if color['encoding'] == 'byte' else 1),
                    [40 / 255, 80 / 255, 160 / 255, 127 / 255],
                )
    if method == 'expansion':
        counts = Counter(o['sourceSheetFace'] for o in frame['sourceMaps']['faces'] if o['sourceSheetFace'] is not None)
        assert counts == Counter({f: 2 for f in range(len(source['faces']))})


def test_warm_native_source_and_descriptor_forgery_refuse_and_reopen_is_literal(domain, tmp_path):
    source, plan = domain
    before = deepcopy(source)
    morph._PRODUCT_4D_CACHE.clear()
    _, prepared = morph.prepare(source, settings(), CONTEXT)
    with patch.object(morph, 'prepare', wraps=morph.prepare) as build:
        frames = [evaluate(source, prepared, t) for t in (0, 0.37, 0.63, 1, 0.37)]
        assert build.call_count == 1
    assert morph._PRODUCT_4D_CACHE._entry is not None
    assert frames[1] == frames[4]
    untouched = deepcopy(frames[1])
    frames[1]['model']['vertices'][0][0] += 100
    assert evaluate(source, prepared, 0.37) == untouched
    frames[1] = untouched
    for rank, kind in enumerate(KINDS):
        for component, frame in (('source', frames[0]), ('dual', frames[3])):
            assert frame['sourceMaps'][kind] == [
                dict(component=component, sourceRank=rank if component == 'source' else 3 - rank, sourceElement=i)
                for i in range(len(frame['model'][kind]))
            ]
    forged = deepcopy(prepared)
    forged['descriptor']['expansion']['end'][0][0] += 0.1
    with pytest.raises(GeometryError, match='changed|forged'):
        evaluate(source, forged, 0.5)
    changed = deepcopy(source)
    changed['metadata']['offColors']['faces'][0]['values'][3] = 126
    with pytest.raises(GeometryError, match='changed|forged'):
        evaluate(changed, prepared, 0.5)
    assert evaluate(source, prepared, 0.37) == frames[1]
    state = {'model': source, 'notes': CONTEXT['notes'], 'view': {'coordinateUnit': 'mm', 'dualMorph': settings()}}
    project = {
        'format': 'polytope-laboratory',
        'version': 1,
        'active': 0,
        'documents': [{'id': 'large4d', 'cursor': 0, 'states': [state]}],
    }
    path = tmp_path / 'large4d.polyproj'
    save_project(path, project)
    opened = load_file(path)['project']['documents'][0]['states'][0]
    assert opened['model'] == source and opened['notes'] == CONTEXT['notes']
    assert opened['view']['dualMorph'] == settings()
    _, rebuilt = morph.prepare(opened['model'], opened['view']['dualMorph'], CONTEXT)
    assert evaluate(opened['model'], rebuilt, 0.37) == frames[1]
    assert source == before


def test_transformed_literal_ids_and_unsupported_inputs_remain_checked():
    source = regular('cell600')
    source['id'] = 'user-edited-name'
    points = np.asarray(source['vertices'])
    rotation = np.eye(4)
    rotation[:2, :2] = [[0.6, -0.8], [0.8, 0.6]]
    source['vertices'] = (points @ rotation.T * 2.5 + [1, -2, 3, -4]).tolist()
    source.pop('facetEquations', None)
    source.pop('facetVertices', None)
    source['faces'] = [f[::-1] for f in source['faces']]
    source['fingerprint'] = identity(source)
    plan = prepare_dual_morph({'model': source}, radius=2.5)
    assert audit(plan.evaluate('expansion', 0.37)['model'])['counts'] == [2400, 7200, 7440, 2640]
    with pytest.raises(GeometryError, match='outside|supporting|center'):
        prepare_dual_morph({'model': source}, center=[100, 100, 100, 100])
    bad = deepcopy(source)
    bad['cells'].pop()
    bad['fingerprint'] = identity(bad)
    with pytest.raises(GeometryError):
        prepare_dual_morph({'model': bad})
    for method in ('augmentation', 'tilting-triangles', 'tilting-to-compound', 'tilting-to-rectify', 'via-snub'):
        with pytest.raises(GeometryError):
            morph.prepare(source, settings(method), CONTEXT)
