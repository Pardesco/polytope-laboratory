"""Version-2 corpus evidence ingestion; retained evidence is not human approval."""

from copy import deepcopy
from datetime import datetime
import hashlib
import json

from .corpus_reconciliation import ROOT, _license, _path, _read, _realization, _source_state, _verify, load_manifest
from .geometry import GeometryError

FORMAT = 'polytope-corpus-receipts'
DOMAINS = ('geometry', 'classification', 'chirality', 'license', 'baselineIdentity')
MAX_BYTES = 2 * 1024 * 1024
MAX_RECEIPTS = 16
DATA = ROOT / 'engine/catalog_data'
SCHEMA = DATA / 'corpus_receipts.schema.json'
TRUST = DATA / 'corpus_review_registry.json'
BUNDLE = DATA / 'corpus_receipts.json'
PIN_FIELDS = (
    'crosswalkSha256',
    'sourceSha256',
    'assetSha256',
    'coordinatesSha256',
    'topologySha256',
    'licenseSha256',
    'importerSha256',
    'verifierSha256',
    'policySha256',
)


def canonical(value):
    try:
        raw = json.dumps(value, sort_keys=True, ensure_ascii=True, allow_nan=False, separators=(',', ':'))
    except (ValueError, TypeError, RecursionError, OverflowError) as exc:
        raise GeometryError('Corpus receipts require finite, bounded JSON.') from exc
    if len(raw) > MAX_BYTES:
        raise GeometryError('Corpus receipts exceed the 2 MiB bound.')
    return raw.encode('ascii')


def digest(value):
    return hashlib.sha256(canonical(value)).hexdigest()


def require(ok, message):
    if not ok:
        raise GeometryError('Corpus receipts: ' + message)


def shape(value, fields):
    require(type(value) is dict and set(value) == set(fields), 'invalid record fields.')


def text(value):
    return type(value) is str and len(value) <= 4096 and bool(value.strip())


def sha(value):
    return type(value) is str and len(value) == 64 and all(c in '0123456789abcdef' for c in value)


def validate_bundle(value):
    canonical(value)
    shape(value, ('format', 'schemaVersion', 'receipts'))
    require(
        value['format'] == FORMAT and type(value['schemaVersion']) is int and value['schemaVersion'] == 2,
        'expected version-2 receipt bundle.',
    )
    require(
        type(value['receipts']) is list and len(value['receipts']) <= MAX_RECEIPTS, 'at most 16 receipts per bundle.'
    )
    ids = set()
    for row in value['receipts']:
        shape(row, ('id', 'identity', 'realization', 'pins', 'evidence'))
        require(
            all(text(row[k]) and len(row[k]) <= 256 for k in ('id', 'identity', 'realization')),
            'invalid receipt/identity/realization ID.',
        )
        require(row['id'] not in ids, 'duplicate receipt ID.')
        ids.add(row['id'])
        shape(row['pins'], PIN_FIELDS)
        require(
            all(sha(v) or k in ('assetSha256', 'licenseSha256') and v is None for k, v in row['pins'].items()),
            'invalid SHA-256 pins.',
        )
        shape(row['evidence'], DOMAINS)
        geometry = row['evidence']['geometry']
        shape(geometry, ('status', 'audit'))
        require(
            geometry['status'] in ('numerical-pass', 'numerical-fail') and type(geometry['audit']) is dict,
            'invalid numerical evidence.',
        )
        statuses = {
            'classification': ('unresolved', 'source-asserted', 'evidence-supplied'),
            'chirality': ('unresolved', 'achiral', 'source-relative-pair', 'chiral-unassigned'),
            'license': ('unreviewed', 'redistribution-asserted', 'restricted'),
            'baselineIdentity': ('unreviewed', 'correspondence-asserted'),
        }
        for domain, allowed in statuses.items():
            evidence = row['evidence'][domain]
            shape(evidence, ('status', 'reference', 'statement'))
            require(
                evidence['status'] in allowed and text(evidence['reference']) and text(evidence['statement']),
                'invalid ' + domain + ' evidence.',
            )
    return value


def validate_registry(value):
    canonical(value)
    shape(value, ('format', 'schemaVersion', 'reviewers', 'attestations'))
    require(
        value['format'] == 'polytope-corpus-review-registry'
        and type(value['schemaVersion']) is int
        and value['schemaVersion'] == 2,
        'invalid trusted review registry.',
    )
    require(
        type(value['reviewers']) is list
        and type(value['attestations']) is list
        and len(value['reviewers']) <= 256
        and len(value['attestations']) <= 10000,
        'invalid trusted registry bounds.',
    )
    reviewers = {}
    for row in value['reviewers']:
        shape(row, ('id', 'name', 'domains'))
        require(text(row['id']) and text(row['name']) and row['id'] not in reviewers, 'invalid trusted reviewer.')
        require(
            type(row['domains']) is list
            and bool(row['domains'])
            and all(type(d) is str and d in DOMAINS for d in row['domains'])
            and len(set(row['domains'])) == len(row['domains']),
            'invalid reviewer domains.',
        )
        reviewers[row['id']] = row
    seen = set()
    for row in value['attestations']:
        shape(row, ('receiptSha256', 'reviewer', 'domain', 'decision', 'reviewedAt', 'reference'))
        require(
            sha(row['receiptSha256'])
            and text(row['reviewer'])
            and text(row['domain'])
            and row['reviewer'] in reviewers
            and row['domain'] in reviewers[row['reviewer']]['domains'],
            'unregistered reviewer or review domain.',
        )
        require(
            row['decision'] in ('approved', 'rejected') and text(row['reference']), 'invalid review decision/reference.'
        )
        try:
            date = datetime.fromisoformat(row['reviewedAt'].replace('Z', '+00:00'))
            require(date.tzinfo is not None, 'review date requires a timezone.')
        except (ValueError, TypeError, AttributeError) as exc:
            raise GeometryError('Corpus receipts: invalid review date.') from exc
        key = (row['receiptSha256'], row['reviewer'], row['domain'])
        require(key not in seen, 'duplicate trusted attestation.')
        seen.add(key)
    return value


def current_evidence(identity, realization, *, manifest=None, root=ROOT, states=None):
    manifest = load_manifest() if manifest is None else manifest
    row = next((r for r in manifest['identities'] if r['id'] == identity), None)
    require(row is not None, 'unknown named identity; candidates cannot acquire baseline identities through receipts.')
    require(
        row['group'] in ('uniform3', 'dual3', 'johnson', 'regular4'),
        'v2 supports named U/dual/J/regular identities only.',
    )
    link = next((l for l in row['links'] if l['source'] + ':' + l['entry'] == realization), None)
    require(link is not None, 'realization is not explicitly mapped to the named identity.')
    sources = {s['id']: s for s in manifest['sources']}
    source = sources[link['source']]
    current = states[source['id']] if states is not None else _source_state(source, root)
    require(current['status'] in ('manifest-current', 'native-current'), 'stale or missing provider manifest.')
    record = _realization(link, sources, {source['id']: current}, root)
    require(record['status'] == 'mapped-unverified', 'stale or missing source realization.')
    asset_sha = None
    if record['asset']:
        path = _path(record['asset']['file'], root)
        require(path.is_file() and path.stat().st_size <= 128 * 1024 * 1024, 'source asset missing or over 128 MiB.')
        asset_sha = hashlib.sha256(path.read_bytes()).hexdigest()
        require(asset_sha == record['asset']['sha256'], 'source asset hash changed.')
    audit = _verify(row, record)
    from .library_audit import importer_fingerprint

    verifier = {
        name: hashlib.sha256((ROOT / 'engine' / name).read_bytes()).hexdigest()
        for name in ('corpus_receipts.py', 'corpus_reconciliation.py', 'catalog_audit.py')
    }
    pins = {
        'crosswalkSha256': digest(manifest),
        'sourceSha256': current['actualSha256'] or digest(current['entries'][link['entry']]),
        'assetSha256': asset_sha,
        'coordinatesSha256': audit['coordinateSet']['sha256'],
        'topologySha256': audit['topology']['sha256'],
        'licenseSha256': _license(source, current, root).get('sha256'),
        'importerSha256': digest(importer_fingerprint()),
        'verifierSha256': digest(verifier),
        'policySha256': hashlib.sha256(SCHEMA.read_bytes()).hexdigest(),
    }
    return {
        'identity': identity,
        'realization': realization,
        'pins': pins,
        'audit': audit,
        'relation': link['relation'],
        'group': row['group'],
        'retainedEvidence': {
            'classification': record['classification'],
            'chirality': record['chirality'],
            'license': record['license'],
            'baselineIdentity': row['identityEvidence'],
        },
    }


def prepare(identity, realization):
    current = current_evidence(identity, realization)
    pending = lambda domain, status: {
        'status': status,
        'reference': 'Current crosswalk source evidence; independent review pending',
        'statement': json.dumps(current['retainedEvidence'][domain], ensure_ascii=True, sort_keys=True),
    }
    row = {
        'id': 'evidence:' + identity + ':' + realization,
        'identity': identity,
        'realization': realization,
        'pins': current['pins'],
        'evidence': {
            'geometry': {'status': 'numerical-' + current['audit']['status'], 'audit': current['audit']},
            'classification': pending('classification', 'source-asserted'),
            'chirality': pending('chirality', 'unresolved'),
            'license': pending('license', 'unreviewed'),
            'baselineIdentity': pending('baselineIdentity', 'unreviewed'),
        },
    }
    return validate_bundle({'format': FORMAT, 'schemaVersion': 2, 'receipts': [row]})


def evaluate(bundle, *, manifest=None, registry=None, resolve=None):
    bundle = validate_bundle(bundle)
    manifest = load_manifest() if manifest is None else manifest
    registry = validate_registry(_read(TRUST)[0] if registry is None else registry)
    rows = []
    cache = {}
    qualified = set()
    if resolve is None:
        sources = {s['id']: s for s in manifest['sources']}
        states = {id: _source_state(s) for id, s in sources.items()}
        from .catalog import get_catalog

        catalog = {r['key']: r for r in get_catalog()}
        budget = [0, 0]

        def resolve(identity, realization):
            row = next(r for r in manifest['identities'] if r['id'] == identity)
            link = next(l for l in row['links'] if l['source'] + ':' + l['entry'] == realization)
            counts = catalog.get(link['catalogKey'], {}).get('counts', [])
            require(bool(counts), 'source has no current bounded catalog loader.')
            budget[0] += counts[0]
            budget[1] += sum(counts)
            require(
                budget[0] <= 20000 and budget[1] <= 200000, 'bundle audit budget exceeded; split into smaller bundles.'
            )
            return current_evidence(identity, realization, manifest=manifest, states=states)

    identities = {r['id']: r for r in manifest['identities']}
    groups = {g['id']: g for g in manifest['groups']}
    for receipt in sorted(bundle['receipts'], key=lambda r: r['id']):
        fingerprint = digest(receipt)
        result = {
            'id': receipt['id'],
            'identity': receipt['identity'],
            'realization': receipt['realization'],
            'receiptSha256': fingerprint,
            'status': 'accepted',
            'qualified': False,
            'blockers': [],
            'evidence': deepcopy(receipt['evidence']),
            'pins': deepcopy(receipt['pins']),
            'reviews': [],
        }
        rows.append(result)
        identity = identities.get(receipt['identity'])
        if (
            identity is None
            or identity['group'] not in ('uniform3', 'dual3', 'johnson', 'regular4')
            or not any(l['source'] + ':' + l['entry'] == receipt['realization'] for l in identity['links'])
        ):
            result.update(
                status='rejected',
                blockers=['No supported named identity/realization mapping; candidates cannot be promoted.'],
            )
            continue
        key = (receipt['identity'], receipt['realization'])
        try:
            if key not in cache:
                cache[key] = resolve(*key)
            current = cache[key]
        except (GeometryError, OSError, ValueError) as exc:
            result.update(status='stale', blockers=['Current evidence unavailable: ' + str(exc)])
            continue
        changed = [k for k in PIN_FIELDS if current['pins'][k] != receipt['pins'][k]]
        if changed:
            result.update(status='stale', blockers=['Changed evidence pins: ' + ', '.join(changed)])
            continue
        geometry = receipt['evidence']['geometry']
        if (
            digest(geometry['audit']) != digest(current['audit'])
            or geometry['status'] != 'numerical-' + current['audit']['status']
        ):
            result.update(status='rejected', blockers=['Numerical evidence does not match the current audit.'])
            continue
        reviews = [deepcopy(r) for r in registry['attestations'] if r['receiptSha256'] == fingerprint]
        result['reviews'] = reviews
        if any(r['decision'] == 'rejected' for r in reviews):
            result['blockers'].append('Trusted human review rejected this receipt.')
        for domain in DOMAINS:
            if not any(r['domain'] == domain and r['decision'] == 'approved' for r in reviews):
                result['blockers'].append('Missing trusted human review: ' + domain + '.')
        if current['audit']['status'] != 'pass':
            result['blockers'].append('Current numerical geometry audit failed.')
        for domain in ('classification', 'chirality'):
            if receipt['evidence'][domain]['status'] == 'unresolved':
                result['blockers'].append('Unresolved ' + domain + ' evidence.')
        if (
            receipt['evidence']['license']['status'] != 'redistribution-asserted'
            or not receipt['pins']['licenseSha256']
        ):
            result['blockers'].append('Redistribution terms require a current document pin and explicit review.')
        if receipt['evidence']['baselineIdentity']['status'] != 'correspondence-asserted':
            result['blockers'].append('Baseline correspondence is unreviewed.')
        if current['relation'] != 'realization':
            result['blockers'].append(
                'Reflected realizations are retained separately and cannot qualify a baseline identity.'
            )
        group = groups[identity['group']]
        if group['rosterStatus'] != 'named-roster':
            result['blockers'].append('Authoritative baseline roster missing.')
        result['qualified'] = not result['blockers']
        if result['qualified']:
            qualified.add(identity['id'])
    coverage = []
    for group in manifest['groups']:
        count = sum(id in qualified for id, r in identities.items() if r['group'] == group['id'])
        coverage.append(
            {
                **deepcopy(group),
                'qualifiedIdentities': count,
                'namedIdentities': sum(r['group'] == group['id'] for r in identities.values()),
                'unqualifiedObligations': None if group['required'] is None else group['required'] - count,
            }
        )
    return {
        'format': FORMAT,
        'schemaVersion': 2,
        'receipts': rows,
        'groups': coverage,
        'trustedReviewers': len(registry['reviewers']),
        'registrySha256': digest(registry),
        'blockers': (['No trusted human reviewer is registered.'] if not registry['reviewers'] else [])
        + [
            g['label'] + ': authoritative baseline roster missing.'
            for g in manifest['groups']
            if g['rosterStatus'] != 'named-roster'
        ],
        'scope': 'Accepted means current retained evidence. Numerical passes are approximate; human review and baseline identity are separate gates. V1 inventory is unchanged.',
    }


def dispatch_receipts(request):
    require(
        type(request) is dict and not set(request) - {'op', 'id', 'params', 'model'} and request.get('model') is None,
        'read-only query; model input and arbitrary paths are refused.',
    )
    params = request.get('params', {})
    require(type(params) is dict, 'parameters must be an object.')
    if params.get('action') == 'prepare':
        shape(params, ('action', 'identity', 'realization'))
        require(text(params['identity']) and text(params['realization']), 'select a named identity and realization.')
        return {'bundle': prepare(params['identity'], params['realization'])}
    require(not set(params) - {'bundle'}, 'only a receipt bundle is accepted; trust registry cannot be uploaded.')
    return evaluate(params['bundle'] if 'bundle' in params else _read(BUNDLE)[0])
