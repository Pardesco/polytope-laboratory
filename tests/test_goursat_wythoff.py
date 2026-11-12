from copy import deepcopy
import hashlib
import json

import pytest

from engine.catalog import get_catalog
from engine.catalog_audit import audit_model, expected_table
from engine.corpus_reconciliation import report
from engine.geometry import GeometryError, identity
from engine.goursat_wythoff import (
    DATA,
    KINDS,
    _build,
    coset_counts,
    generated_crosswalk,
    goursat_catalog,
    load_goursat_wythoff,
    qualify,
    root_group,
    tranche,
)
from engine.regular4d_validation import CROSSWALK, CATALOG_IDENTITIES
from engine.server import dispatch
from engine.star_uniform4 import load_star_uniform4, manifest

ROWS = tranche()['entries']
SOURCES = {row['bowers']: row for row in manifest()['entries']}


def test_tranche_is_79_named_definitions_and_keeps_all_remaining_definitions_visible():
    assert len(ROWS) == 79 and sum(row['regular'] for row in ROWS) == 10
    assert len({row['key'] for row in ROWS}) == 79
    assert len(tranche()['queue']) == 7
    covered = {SOURCES[row['bowers']]['key'] for row in ROWS}
    queued = {row['sourceKey'] for row in tranche()['queue'] if row.get('sourceKey')}
    assert covered.isdisjoint(queued) and covered | queued == {row['key'] for row in manifest()['entries']}
    assert sum('sourceKey' not in row for row in tranche()['queue']) == 7
    for row in ROWS:
        source = SOURCES[row['bowers']]
        assert (
            row['definitionSha256']
            == hashlib.sha256(json.dumps(source, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
        )
        assert row['name'] == source['name'] and row['symbol'] == source['symbol']


@pytest.mark.parametrize('row', ROWS, ids=lambda row: row['bowers'])
def test_every_registered_output_is_built_checked_and_preserves_literal_source_incidence(row):
    model = dispatch({'op': 'generate', 'params': {'kind': 'regular', 'key': row['key']}})
    source = load_star_uniform4(SOURCES[row['bowers']]['key'])
    assert all(model[k] == source[k] for k in KINDS)
    assert model['fingerprint'] == source['fingerprint'] == identity(model)
    assert model['interpretation'] == 'generalized-complex' and model['validation']['passed']
    assert model['numeric']['mode'] == 'float64-approximate' and not model['numeric']['certified']
    evidence = model['metadata']['goursatVerification']
    assert evidence['status'] == 'passed' and not evidence['exact']
    assert evidence['cosets']['counts'] == row['counts'] == [len(model[k]) for k in KINDS]
    order, roots = {'H4': (14400, 120), 'B4': (384, 32), 'F4': (1152, 48)}[SOURCES[row['bowers']]['symmetryGroup']]
    assert evidence['cosets']['groupOrder'] == order and evidence['cosets']['rootCount'] == roots
    for rank in range(4):
        orbits = [r for r in evidence['cosets']['orbits'] if r['rank'] == rank]
        assert sum(r['count'] for r in orbits) == row['counts'][rank]
        assert all(r['stabilizerOrder'] * r['count'] == order for r in orbits)
    for field in (
        'edgeRelativeSpread',
        'reflectionActionResidual',
        'facePlanarityRelativeResidual',
        'cellFlatnessRelativeResidual',
        'maxFaceRadialRelativeSpread',
        'maxFaceAngularResidual',
    ):
        assert evidence[field] < 1e-8
    assert evidence['vertexTransitive'] and evidence['allFourReflectionsPreserveLiteralIncidence']
    assert evidence['entityOrbitSizes']['vertices'] == [row['counts'][0]]
    assert all(
        c['stabilizerVertexTransitive'] and c['cellVertexPairOrbitSize'] == c['cellOrbitSize'] * c['verticesPerCell']
        for c in evidence['cellUniformity']
    )
    assert evidence['localLinks']['connectedVertexFigures'] and evidence['localLinks']['allCellVertexLinksSingleCycles']
    assert evidence['localLinks']['allEdgeLinksSingleCycles']
    assert evidence['localLinks']['checkedVertices'] == row['counts'][0]
    assert (
        evidence['weldingApplied'] is False
        and evidence['coincidentVertices'] == evidence['coincidentElementVertexSets'] == 0
    )
    assert len(evidence['coordinateSha256']) == len(evidence['incidenceSha256']) == 64
    receipt = model['provenance']['goursatQualification']
    assert receipt['definitionSha256'] == row['definitionSha256'] and receipt['baselineIdentity'] is None
    assert receipt['trancheSha256'] == hashlib.sha256(DATA.read_bytes()).hexdigest()
    if row['regular']:
        flags = evidence['regularFlagAction']
        assert (
            flags['flagOrbitCount'] == 1
            and flags['flagCount'] == flags['reachedFlags'] == flags['generatedSubgroupOrder'] == 14400
        )
        name = next(name for name, e in CROSSWALK.items() if e['alias'].lower() == row['bowers'])
        assert row['counts'] == CROSSWALK[name]['counts']
        key = next(k for k, n in CATALOG_IDENTITIES.items() if n == name)
        assert expected_table()[key]['counts'] == row['counts']


def test_cosets_are_independent_of_named_counts_and_model_seed(monkeypatch):
    import engine.goursat_wythoff as module

    monkeypatch.setattr(module, 'star_manifest', lambda: (_ for _ in ()).throw(AssertionError('source manifest used')))
    root_group.cache_clear()
    result = coset_counts(['3', '3', '5/2'], [1, 0, 0, 0])
    assert result['counts'] == [120, 720, 1200, 600]
    assert result['orbits'][0]['stabilizerOrder'] == 120
    assert result['rootActionResidual'] < 1e-12


@pytest.mark.parametrize(
    'diagram,rings',
    [
        (['3', '3', '7'], [1, 0, 0, 0]),
        (['3', '3', '5/0'], [1, 0, 0, 0]),
        (['5', '5', '5'], [1, 0, 0, 0]),
        (['3', '3', '5/2'], [True, 0, 0, 0]),
        (['3', '3', '5/2'], [0, 0, 0, 0]),
        (['3', '3', '5/2'], [1, 0, 0]),
    ],
)
def test_unsupported_domains_refuse(diagram, rings):
    with pytest.raises(GeometryError):
        coset_counts(diagram, rings)


def test_unregistered_extra_stabilizer_seed_is_refused_without_welding():
    from engine.star_uniform4 import rational_boundary

    expected = coset_counts(['3', '3', '5/2'], [1, 0, 0, 1])['counts'][0]
    assert expected == 2400
    with pytest.raises(GeometryError, match='coinciding vertices|disagrees'):
        rational_boundary(['3', '3', '5/2'], [1, 0, 0, 1], expected)
    assert load_goursat_wythoff('goursat-wythoff-x3o3o5/2x') is None
    with pytest.raises(GeometryError, match='Unknown catalog key'):
        dispatch({'op': 'generate', 'params': {'kind': 'regular', 'key': 'goursat-wythoff-unknown'}})


@pytest.mark.parametrize('row', tranche()['queue'], ids=lambda row: row['symbol'])
def test_every_remaining_chain_mask_has_a_concrete_refusal(row):
    from engine.star_uniform4 import rational_boundary

    assert row['status'] == 'refused-extra-seed-stabilizer'
    expected = coset_counts(['3', '3', '5/2'], row['rings'])['counts']
    assert expected == row['predictedCounts']
    with pytest.raises(GeometryError, match='coinciding vertices|disagrees'):
        rational_boundary(['3', '3', '5/2'], row['rings'], expected[0])


@pytest.mark.parametrize(
    'mutation',
    [
        lambda m: m['vertices'][1].__setitem__(0, m['vertices'][1][0] + 0.001),
        lambda m: m['vertices'].__setitem__(1, m['vertices'][0][:]),
        lambda m: m['faces'].__setitem__(1, m['faces'][0][:]),
        lambda m: m['cells'].__setitem__(1, m['cells'][0][:]),
        lambda m: m['edges'].pop(),
    ],
)
def test_geometry_corruption_fails_qualification_instead_of_trusting_receipts(mutation):
    model = load_goursat_wythoff('goursat-wythoff-gax')
    mutation(model)
    with pytest.raises(GeometryError):
        qualify(model, ['3', '3', '5/2'], [1, 0, 0, 0])


def test_current_definition_hash_is_checked_even_after_a_cached_load(monkeypatch):
    import engine.goursat_wythoff as module

    model = load_goursat_wythoff('goursat-wythoff-gax')
    altered = deepcopy(manifest())
    next(e for e in altered['entries'] if e['bowers'] == 'gax')['symbol'] = 'forged'
    monkeypatch.setattr(module, 'star_manifest', lambda: altered)
    assert next(e for e in generated_crosswalk()['entries'] if e['bowers'] == 'gax')['status'] == 'stale-definition'
    assert 'goursat-wythoff-gax' not in {e['key'] for e in goursat_catalog()}
    with pytest.raises(GeometryError, match='definition hash changed'):
        load_goursat_wythoff('goursat-wythoff-gax')
    assert model['metadata']['goursatVerification']['status'] == 'passed'
    altered['entries'] = [e for e in altered['entries'] if e['bowers'] != 'gax']
    assert next(e for e in generated_crosswalk()['entries'] if e['bowers'] == 'gax')['status'] == 'stale-definition'
    assert 'goursat-wythoff-gax' not in {e['key'] for e in goursat_catalog()}
    with pytest.raises(GeometryError, match='definition hash changed'):
        load_goursat_wythoff('goursat-wythoff-gax')


def test_detached_cache_determinism_and_no_coordinate_or_incidence_asset_dependency():
    first = load_goursat_wythoff('goursat-wythoff-fix')
    _build.cache_clear()
    second = load_goursat_wythoff('goursat-wythoff-fix')
    assert first['id'] != second['id'] and first['fingerprint'] == second['fingerprint']
    assert first['metadata']['goursatVerification'] == second['metadata']['goursatVerification']
    first['metadata']['goursatVerification']['status'] = 'forged'
    first['vertices'][0][0] += 1
    assert load_goursat_wythoff('goursat-wythoff-fix')['metadata']['goursatVerification']['status'] == 'passed'


def test_catalog_audit_counts_and_crosswalk_keep_baseline_coverage_separate():
    catalog = {row['key']: row for row in get_catalog()}
    assert all(catalog[row['key']] == row for row in goursat_catalog())
    model = load_goursat_wythoff('goursat-wythoff-gax')
    audit = audit_model(model, catalog['goursat-wythoff-gax'])
    assert audit['checks']['expected_counts']['status'] == 'pass'
    assert audit['checks']['equal_edges']['status'] == 'pass'
    result = report({'group': 'uniform4'})
    supplement = result['generatedTranches'][0]
    assert (
        supplement['registeredGeneratedIdentities'] == 79
        and supplement['baselineCoverageIncrement'] == supplement['newMathematicalIdentities'] == 0
    )
    assert all(row['baselineIdentity'] is None and not row['releaseQualified'] for row in supplement['entries'])
    regular_ids = {row['id'] for row in report({'group': 'regular4'})['identities']}
    assert {row['identity'] for row in supplement['entries'] if row['regular']} <= regular_ids
    uniform = next(g for g in result['groups'] if g['id'] == 'uniform4')
    assert uniform['qualifiedIdentities'] == 0 and uniform['unnamedObligations'] == 2191


def test_saved_project_off_and_history_replay_keep_the_generated_snapshot(tmp_path):
    from engine.formats import save_project, load_file, parse_off, export_off
    from engine.recipes import run_recipe, replay_document

    model = load_goursat_wythoff('goursat-wythoff-gax')
    document = {
        'id': 'goursat-history',
        'cursor': 0,
        'states': [
            {'model': model, 'view': {'angles': [0] * 6}, 'label': 'Goursat star Wythoff', 'notes': 'literal star'}
        ],
    }
    changed = run_recipe(document, 'transform', {'scale': 2}, dispatch)
    replayed = replay_document(changed, dispatch)
    assert replayed['states'][0]['model']['fingerprint'] == changed['states'][1]['model']['fingerprint']
    path = tmp_path / 'goursat.polytope'
    save_project(str(path), {'format': 'polytope-laboratory', 'version': 1, 'active': 0, 'documents': [document]})
    restored = load_file(str(path))['project']['documents'][0]['states'][0]['model']
    assert restored['metadata']['goursatVerification'] == model['metadata']['goursatVerification']
    assert restored['provenance']['goursatQualification'] == model['provenance']['goursatQualification']
    assert parse_off(export_off(model), 'Goursat')['fingerprint'] == model['fingerprint']
