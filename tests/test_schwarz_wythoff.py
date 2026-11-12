from copy import deepcopy
import hashlib
import json

import pytest

from engine.catalog import get_catalog, load_catalog_model
from engine.catalog_audit import audit_model, expected_table
from engine.corpus_reconciliation import report
from engine.geometry import GeometryError, identity
from engine.library_navigation import crosswalk
from engine.schwarz_wythoff import (
    DATA,
    KINDS,
    _build,
    compare_boundary,
    generated_crosswalk,
    load_schwarz_wythoff,
    manifest,
    qualify,
    schwarz_catalog,
    triangle_boundary,
    triangle_group,
)
from engine.server import dispatch

ROWS = manifest()['entries']


def test_manifest_accounts_for_all_u75_without_conflating_supplied_and_generated():
    assert len(ROWS) == 63 and len(manifest()['queue']) == 12
    assert {r['identity'] for r in ROWS} | {r['identity'] for r in manifest()['queue']} == {
        f'uniform3:U{u}' for u in range(1, 76)
    }
    assert {r['uniformNumber'] for r in ROWS}.isdisjoint({12, 29, 32, 40, 46, 57, 60, 64, 69, 72, 74, 75})
    assert all(
        r['definitionSha256']
        == hashlib.sha256(
            json.dumps(crosswalk()[r['uniformNumber']], sort_keys=True, separators=(',', ':')).encode()
        ).hexdigest()
        for r in ROWS
    )
    catalog = {r['key']: r for r in get_catalog()}
    assert all(catalog[r['key']] == r for r in schwarz_catalog())
    assert all(r['sourceKey'] in catalog for r in ROWS)


@pytest.mark.parametrize('row', ROWS, ids=lambda r: 'U' + str(r['uniformNumber']))
def test_native_generation_matches_independent_source_metric_and_complete_ordered_boundary(row):
    model = dispatch({'op': 'generate', 'params': {'kind': 'regular', 'key': row['key']}})
    source = load_catalog_model(row['sourceKey'])
    assert compare_boundary(model, source)['normalizedVertexResidual'] < 1e-8
    assert source['provenance']['catalogSource']['sha256'] == row['sourceAssetSha256']
    assert [len(model[k]) for k in KINDS] == row['counts'] == expected_table()[row['sourceKey']]['counts']
    assert model['fingerprint'] == identity(model) and model['validation']['passed']
    assert model['interpretation'] == ('convex-polytope' if row['convex'] else 'generalized-complex')
    assert not model['numeric']['certified'] and 'catalogSource' not in model['provenance']
    evidence = model['metadata']['schwarzVerification']
    assert evidence['status'] == 'passed' and not evidence['exact']
    assert evidence['groupOrder'] == evidence['faithfulRootFrameCount'] == row['groupOrder']
    assert evidence['rootCount'] == {24: 12, 48: 18, 120: 30}[row['groupOrder']]
    assert evidence['allThreeReflectionsPreserveLiteralIncidence'] and evidence['vertexTransitive']
    assert evidence['allVertexLinksSingleCycles'] and evidence['facesPerEdge'] == 2
    for field in (
        'rootActionResidual',
        'reflectionActionResidual',
        'edgeRelativeSpread',
        'facePlanarityRelativeResidual',
        'maxFaceRadialRelativeSpread',
        'maxFaceAngularResidual',
    ):
        assert evidence[field] < 1e-8
    assert (
        evidence['coincidentVertices'] == evidence['coincidentElementVertexSets'] == 0
        and not evidence['weldingApplied']
    )
    assert len(evidence['coordinateSha256']) == len(evidence['incidenceSha256']) == 64
    receipt = model['provenance']['schwarzQualification']
    assert receipt['definitionSha256'] == row['definitionSha256'] and receipt['identity'] == row['identity']
    assert receipt['trancheSha256'] == hashlib.sha256(DATA.read_bytes()).hexdigest()
    assert receipt['referenceComparison']['orderedFaceCyclesMatched']
    assert (
        audit_model(model, next(r for r in schwarz_catalog() if r['key'] == row['key']))['checks']['expected_counts'][
            'status'
        ]
        == 'pass'
    )


@pytest.mark.parametrize(
    'symbol,order',
    [
        ('|2 3 5', 120),
        ('3/2 5/3 3 5/2', 120),
        ('3|2 7', 120),
        ('3|3 3', 48),
        ('3|3 3', 24),
        ('3|2 0', 24),
        ('3|2 3/0', 24),
        ('3|2 3', 1000),
        ('3|2', 24),
        ('3||2 3', 24),
    ],
)
def test_unsupported_symbols_and_nonfinite_domains_refuse(symbol, order):
    with pytest.raises(GeometryError):
        triangle_boundary(symbol, order)


@pytest.mark.parametrize(
    'mutation',
    [
        lambda m: m['vertices'][1].__setitem__(0, m['vertices'][1][0] + 0.01),
        lambda m: m['vertices'].__setitem__(1, m['vertices'][0][:]),
        lambda m: m['faces'].__setitem__(1, m['faces'][0][:]),
        lambda m: m['edges'].pop(),
        lambda m: m['faces'][0].__setitem__(slice(1, 3), reversed(m['faces'][0][1:3])),
    ],
)
def test_forged_metadata_does_not_rescue_corrupt_literal_geometry(mutation):
    model = load_schwarz_wythoff('schwarz-wythoff-u39')
    mutation(model)
    with pytest.raises(GeometryError):
        qualify(model, '2 5/2 5|', 120)


def test_reference_comparison_rejects_changed_cycles_and_coordinates():
    model = load_schwarz_wythoff('schwarz-wythoff-u39')
    for mutate in (
        lambda m: m['faces'][0].__setitem__(slice(1, 3), reversed(m['faces'][0][1:3])),
        lambda m: m['vertices'][0].__setitem__(0, m['vertices'][0][0] + 0.01),
    ):
        changed = deepcopy(model)
        mutate(changed)
        with pytest.raises(GeometryError, match='no resolved isometry'):
            compare_boundary(model, changed)


def test_native_construction_never_loads_a_supplied_mesh(monkeypatch):
    import engine.catalog

    monkeypatch.setattr(
        engine.catalog, 'load_catalog_model', lambda *_: (_ for _ in ()).throw(AssertionError('source mesh used'))
    )
    _build.cache_clear()
    model = load_schwarz_wythoff('schwarz-wythoff-u39')
    assert model['metadata']['schwarzVerification']['status'] == 'passed'


def test_cache_is_detached_and_current_definition_checked_even_on_cached_load(monkeypatch):
    import engine.library_navigation

    first = load_schwarz_wythoff('schwarz-wythoff-u39')
    _build.cache_clear()
    second = load_schwarz_wythoff('schwarz-wythoff-u39')
    assert first['id'] != second['id'] and first['fingerprint'] == second['fingerprint']
    assert first['metadata'] == second['metadata'] and first['provenance'] == second['provenance']
    first['vertices'][0][0] += 1
    first['metadata']['schwarzVerification']['status'] = 'forged'
    assert load_schwarz_wythoff('schwarz-wythoff-u39')['metadata']['schwarzVerification']['status'] == 'passed'
    altered = deepcopy(crosswalk())
    altered[39]['wythoff'] = '3|2 3'
    monkeypatch.setattr(engine.library_navigation, 'crosswalk', lambda: altered)
    assert 'schwarz-wythoff-u39' not in {r['key'] for r in schwarz_catalog()}
    assert next(r for r in generated_crosswalk()['entries'] if r['uniformNumber'] == 39)['status'] == 'stale-definition'
    with pytest.raises(GeometryError, match='definition changed'):
        load_schwarz_wythoff('schwarz-wythoff-u39')


def test_root_group_uses_neither_named_counts_nor_source_meshes(monkeypatch):
    import engine.library_navigation

    monkeypatch.setattr(
        engine.library_navigation, 'crosswalk', lambda: (_ for _ in ()).throw(AssertionError('catalog read'))
    )
    triangle_group.cache_clear()
    assert triangle_group('2 5/2 5|', 120)[3]['faithfulRootFrameCount'] == 120


def test_extra_seed_stabilizers_are_reported_without_welding():
    model = load_schwarz_wythoff('schwarz-wythoff-u39')
    omitted = model['metadata']['schwarzVerification']['excludedCollapsedAlternatingFaces']
    assert omitted and omitted[0]['expectedPolygonVertices'] > omitted[0]['actualVertices']
    assert not model['metadata']['schwarzVerification']['weldingApplied']


def test_corpus_adds_generated_u_evidence_without_promoting_release_qualification():
    result = report({'group': 'uniform3'})
    supplement = result['generatedTranches'][1]
    assert supplement['registeredGeneratedIdentities'] == 63 and supplement['baselineCoverageIncrement'] == 0
    ids = {r['id'] for r in result['identities']}
    assert {r['identity'] for r in supplement['entries']} <= ids
    assert all(not r['releaseQualified'] for r in supplement['entries'])
    assert next(g for g in result['groups'] if g['id'] == 'uniform3')['qualifiedIdentities'] == 0
    assert load_schwarz_wythoff('schwarz-wythoff-u75') is None


def test_project_off_and_history_replay_preserve_generated_receipts(tmp_path):
    from engine.formats import save_project, load_file, parse_off, export_off
    from engine.recipes import run_recipe, replay_document

    model = load_schwarz_wythoff('schwarz-wythoff-u39')
    document = {
        'id': 'schwarz-history',
        'cursor': 0,
        'states': [{'model': model, 'view': {'angles': [0] * 6}, 'label': 'Schwarz Wythoff', 'notes': 'generated'}],
    }
    changed = run_recipe(document, 'transform', {'scale': 2}, dispatch)
    assert (
        replay_document(changed, dispatch)['states'][0]['model']['fingerprint']
        == changed['states'][1]['model']['fingerprint']
    )
    path = tmp_path / 'schwarz.polytope'
    save_project(str(path), {'format': 'polytope-laboratory', 'version': 1, 'active': 0, 'documents': [document]})
    restored = load_file(str(path))['project']['documents'][0]['states'][0]['model']
    assert restored['provenance'] == model['provenance'] and restored['metadata'] == model['metadata']
    assert parse_off(export_off(model), 'Schwarz')['fingerprint'] == model['fingerprint']
