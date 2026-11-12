"""R8 receipt-policy scenarios. Synthetic trusted reviews never ship as product evidence."""

from copy import deepcopy
import json

import pytest

from engine.corpus_receipts import (
    BUNDLE,
    DOMAINS,
    PIN_FIELDS,
    ROOT,
    SCHEMA,
    TRUST,
    canonical,
    current_evidence,
    digest,
    dispatch_receipts,
    evaluate,
    prepare,
    validate_bundle,
    validate_registry,
)
from engine.corpus_reconciliation import load_manifest
from engine.geometry import GeometryError

FIXTURES = ROOT / 'tests/fixtures/corpus-receipts'


def fixture(name='accepted'):
    return json.loads((FIXTURES / (name + '.json')).read_text())


def empty_registry():
    return {'format': 'polytope-corpus-review-registry', 'schemaVersion': 2, 'reviewers': [], 'attestations': []}


def synthetic_current(bundle=None, relation='realization'):
    row = (bundle or fixture())['receipts'][0]
    return {
        'identity': row['identity'],
        'realization': row['realization'],
        'pins': deepcopy(row['pins']),
        'audit': deepcopy(row['evidence']['geometry']['audit']),
        'relation': relation,
        'group': 'uniform3',
    }


def resolved_receipt():
    bundle = fixture()
    row = bundle['receipts'][0]
    for domain, status in [
        ('classification', 'evidence-supplied'),
        ('chirality', 'achiral'),
        ('license', 'redistribution-asserted'),
        ('baselineIdentity', 'correspondence-asserted'),
    ]:
        row['evidence'][domain]['status'] = status
    return bundle


def trusted(bundle):
    registry = empty_registry()
    registry['reviewers'] = [
        {'id': 'synthetic-reviewer', 'name': 'TEST ONLY — fictional reviewer', 'domains': list(DOMAINS)}
    ]
    registry['attestations'] = [
        {
            'receiptSha256': digest(row),
            'reviewer': 'synthetic-reviewer',
            'domain': domain,
            'decision': 'approved',
            'reviewedAt': '2026-01-01T00:00:00Z',
            'reference': 'Synthetic unit-test approval, not real review',
        }
        for row in bundle['receipts']
        for domain in DOMAINS
    ]
    return registry


def evaluate_fixture(bundle, registry=None, current=None):
    return evaluate(bundle, registry=registry or empty_registry(), resolve=lambda *_: current or synthetic_current())


@pytest.mark.parametrize('name,status', [('accepted', 'accepted'), ('rejected', 'rejected'), ('stale', 'stale')])
def test_r8_corpus_receipt_fixture_status(name, status):
    result = evaluate_fixture(fixture(name))
    assert result['receipts'][0]['status'] == status
    assert not result['receipts'][0]['qualified']
    assert all(g['qualifiedIdentities'] == 0 for g in result['groups'])


def test_r8_corpus_accepted_is_not_human_review():
    result = evaluate_fixture(fixture())
    row = result['receipts'][0]
    assert len([b for b in row['blockers'] if 'Missing trusted human review' in b]) == 5
    assert 'No trusted human reviewer' in result['blockers'][0]
    assert row['reviews'] == [] and result['trustedReviewers'] == 0


def test_r8_corpus_fully_reviewed_identity_counts_once_deterministically():
    bundle = resolved_receipt()
    other = deepcopy(bundle['receipts'][0])
    other['id'] = 'another-realization-receipt'
    bundle['receipts'].append(other)
    registry = trusted(bundle)
    first = evaluate_fixture(bundle, registry)
    assert all(r['qualified'] for r in first['receipts'])
    assert next(g for g in first['groups'] if g['id'] == 'uniform3')['qualifiedIdentities'] == 1
    bundle['receipts'].reverse()
    registry['attestations'].reverse()
    second = evaluate_fixture(bundle, registry)
    assert first['groups'] == second['groups']
    assert [r['id'] for r in first['receipts']] == [r['id'] for r in second['receipts']]


def test_r8_corpus_reflection_never_qualifies_baseline():
    bundle = resolved_receipt()
    row = bundle['receipts'][0]
    row.update(identity='uniform3:U12', realization='snubs:antiprism-u12-mirror')
    result = evaluate_fixture(bundle, trusted(bundle), synthetic_current(bundle, 'reflected-realization'))
    assert result['receipts'][0]['status'] == 'accepted'
    assert not result['receipts'][0]['qualified']
    assert any('Reflected realizations' in b for b in result['receipts'][0]['blockers'])
    assert all(g['qualifiedIdentities'] == 0 for g in result['groups'])


@pytest.mark.parametrize(
    'identity,realization',
    [
        ('uniform4:O1', 'convex4:convex-uniform4-o1'),
        ('uniform3:U1', 'native:cube'),
        ('near-miss:near-miss-chamfered-cube', 'near-miss:near-miss-chamfered-cube'),
    ],
)
def test_r8_corpus_candidate_and_wrong_mapping_rejected(identity, realization):
    bundle = resolved_receipt()
    bundle['receipts'][0].update(identity=identity, realization=realization)
    result = evaluate_fixture(bundle, trusted(bundle))
    assert result['receipts'][0]['status'] == 'rejected'
    assert all(g['qualifiedIdentities'] == 0 for g in result['groups'])


@pytest.mark.parametrize('pin', PIN_FIELDS)
def test_r8_corpus_every_changed_pin_revokes_human_approval(pin):
    bundle = resolved_receipt()
    current = synthetic_current(bundle)
    registry = trusted(bundle)
    current['pins'][pin] = 'b' * 64
    result = evaluate_fixture(bundle, registry, current)
    assert result['receipts'][0]['status'] == 'stale'
    assert pin in result['receipts'][0]['blockers'][0]
    assert not result['receipts'][0]['qualified']


@pytest.mark.parametrize('status', ['unreviewed', 'restricted'])
def test_r8_corpus_unreviewed_or_restricted_license_blocks_even_with_attestations(status):
    bundle = resolved_receipt()
    bundle['receipts'][0]['evidence']['license']['status'] = status
    result = evaluate_fixture(bundle, trusted(bundle))
    assert result['receipts'][0]['status'] == 'accepted' and not result['receipts'][0]['qualified']
    assert any('Redistribution' in b for b in result['receipts'][0]['blockers'])


def test_r8_corpus_attestation_cannot_be_reused_after_evidence_edit():
    bundle = resolved_receipt()
    registry = trusted(bundle)
    bundle['receipts'][0]['evidence']['classification']['statement'] = 'A different classification claim'
    row = evaluate_fixture(bundle, registry)['receipts'][0]
    assert not row['qualified'] and row['reviews'] == []


def test_r8_corpus_unpinned_license_cannot_be_approved():
    bundle = resolved_receipt()
    bundle['receipts'][0]['pins']['licenseSha256'] = None
    row = evaluate_fixture(bundle, trusted(bundle), synthetic_current(bundle))['receipts'][0]
    assert row['status'] == 'accepted' and not row['qualified']
    assert any('Redistribution' in b for b in row['blockers'])


def test_r8_corpus_failed_geometry_is_retained_but_cannot_qualify():
    bundle = resolved_receipt()
    geometry = bundle['receipts'][0]['evidence']['geometry']
    geometry['status'] = 'numerical-fail'
    geometry['audit']['status'] = 'fail'
    row = evaluate_fixture(bundle, trusted(bundle), synthetic_current(bundle))['receipts'][0]
    assert row['status'] == 'accepted' and not row['qualified']
    assert 'Current numerical geometry audit failed.' in row['blockers']


def test_r8_corpus_human_rejection_vetoes_approvals():
    bundle = resolved_receipt()
    registry = trusted(bundle)
    registry['reviewers'].append({'id': 'second', 'name': 'TEST ONLY second reviewer', 'domains': ['license']})
    registry['attestations'].append(
        {**registry['attestations'][0], 'reviewer': 'second', 'domain': 'license', 'decision': 'rejected'}
    )
    row = evaluate_fixture(bundle, registry)['receipts'][0]
    assert not row['qualified'] and any('rejected' in b for b in row['blockers'])


def test_r8_corpus_missing_roster_is_independent_blocker():
    bundle = resolved_receipt()
    manifest = deepcopy(load_manifest())
    next(g for g in manifest['groups'] if g['id'] == 'uniform3')['rosterStatus'] = 'benchmark-roster-missing'
    result = evaluate(bundle, manifest=manifest, registry=trusted(bundle), resolve=lambda *_: synthetic_current())
    assert not result['receipts'][0]['qualified']
    assert 'Authoritative baseline roster missing.' in result['receipts'][0]['blockers']


@pytest.mark.parametrize(
    'mutate',
    [
        lambda b: b.update(schemaVersion=True),
        lambda b: b.update(reviewers=[]),
        lambda b: b['receipts'].append(deepcopy(b['receipts'][0])),
        lambda b: b['receipts'][0].update(qualified=True),
        lambda b: b['receipts'][0]['evidence'].update(humanReview={'approved': True}),
        lambda b: b['receipts'][0]['pins'].update(sourceSha256='x'),
        lambda b: b['receipts'][0]['evidence']['geometry']['audit'].update(residual=float('nan')),
        lambda b: b['receipts'][0]['evidence']['geometry'].update(status='exact'),
        lambda b: b['receipts'][0]['evidence']['license'].update(status='approved'),
        lambda b: b['receipts'][0]['evidence']['license'].update(reference='   '),
        lambda b: b.update(receipts=b['receipts'] * 17),
    ],
)
def test_r8_corpus_schema_rejects_self_approval_nonfinite_and_malformed(mutate):
    bundle = fixture()
    mutate(bundle)
    with pytest.raises(GeometryError):
        validate_bundle(bundle)


@pytest.mark.parametrize(
    'params',
    [
        {'registry': empty_registry()},
        {'path': '../reviewers.json'},
        {'action': 'prepare', 'identity': 'uniform3:U1', 'realization': 'native:cube'},
        {'action': 'prepare', 'identity': [], 'realization': 'native:cube'},
        {'bundle': fixture(), 'extra': True},
    ],
)
def test_r8_corpus_api_does_not_accept_trust_paths_or_mismatched_realization(params):
    with pytest.raises(GeometryError):
        dispatch_receipts({'op': 'corpus-receipts', 'params': params})


@pytest.mark.parametrize('payload', [{'model': {}}, {'path': 'other'}, {'params': []}])
def test_r8_corpus_read_only_dispatch(payload):
    with pytest.raises(GeometryError):
        dispatch_receipts({'op': 'corpus-receipts', **payload})


@pytest.mark.parametrize(
    'identity,realization',
    [
        ('uniform3:U1', 'antiprism:antiprism-u1'),
        ('johnson:J1', 'antiprism:antiprism-j1'),
        ('regular4:tes', 'native:tesseract'),
    ],
)
def test_r8_corpus_live_named_evidence_roundtrip(identity, realization):
    bundle = prepare(identity, realization)
    encoded = json.loads(json.dumps(bundle))
    result = evaluate(encoded)
    row = result['receipts'][0]
    assert row['status'] == 'accepted' and not row['qualified']
    assert row['evidence']['geometry']['audit']['checks']['face_planarity']['maxRelativeResidual'] <= 1e-9
    assert row['pins']['coordinatesSha256'] != row['pins']['topologySha256']
    assert 'Current crosswalk source evidence' in row['evidence']['classification']['reference']
    assert all(g['qualifiedIdentities'] == 0 for g in result['groups'])


def test_r8_corpus_live_asset_change_revokes_even_without_manifest_change(tmp_path):
    import engine.corpus_receipts as receipts

    manifest = deepcopy(load_manifest())
    source = next(s for s in manifest['sources'] if s['id'] == 'antiprism')
    source_path = tmp_path / source['file']
    source_path.parent.mkdir(parents=True)
    source_path.write_bytes((ROOT / source['file']).read_bytes())
    asset = source_path.parent / 'models/u1.off'
    asset.parent.mkdir()
    asset.write_text('changed source bytes')
    with pytest.raises(GeometryError, match='source asset hash changed'):
        receipts.current_evidence('uniform3:U1', 'antiprism:antiprism-u1', manifest=manifest, root=tmp_path)


def test_r8_corpus_shipped_policy_has_no_invented_reviews_or_receipts():
    assert validate_registry(json.loads(TRUST.read_text())) == empty_registry()
    assert validate_bundle(json.loads(BUNDLE.read_text()))['receipts'] == []
    schema = json.loads(SCHEMA.read_text())
    assert schema['properties']['schemaVersion'] == {'const': 2}
    result = dispatch_receipts({'op': 'corpus-receipts'})
    assert result['trustedReviewers'] == 0 and result['receipts'] == []
    assert all(g['qualifiedIdentities'] == 0 for g in result['groups'])
    assert any('authoritative baseline roster missing' in b for b in result['blockers'])


def test_r8_corpus_reviewer_domain_and_receipt_digest_are_required():
    bundle = resolved_receipt()
    registry = trusted(bundle)
    registry['reviewers'][0]['domains'] = ['geometry']
    with pytest.raises(GeometryError, match='unregistered reviewer or review domain'):
        validate_registry(registry)
    with pytest.raises(GeometryError):
        canonical({'huge': 'a' * (2 * 1024 * 1024)})
