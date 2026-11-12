"""Offline corpus crosswalk. Geometry audits never imply classification parity."""

from copy import deepcopy
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath

from .geometry import GeometryError

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / 'engine/catalog_data/corpus_reconciliation.json'
MAX_JSON = 32 * 1024 * 1024


def _read(path):
    if path.stat().st_size > MAX_JSON:
        raise GeometryError('Corpus metadata exceeds the 32 MiB bound.')
    raw = path.read_bytes()
    if len(raw) > MAX_JSON:
        raise GeometryError('Corpus metadata grew beyond the 32 MiB bound.')
    return json.loads(raw), hashlib.sha256(raw).hexdigest()


def _path(relative, root=ROOT, *, contained=True):
    if (
        type(relative) is not str
        or not relative
        or '\\' in relative
        or ':' in relative
        or PurePosixPath(relative).is_absolute()
        or any(p in ('', '.', '..') for p in relative.split('/'))
    ):
        raise GeometryError('Corpus source requires a safe repository-relative path.')
    path = root / relative
    if contained and not path.resolve().is_relative_to(root.resolve()):
        raise GeometryError('Corpus source escapes the local repository.')
    return path


def validate_manifest(value):
    """Small dependency-free validator for the shipped version-1 schema."""

    def require(ok, message):
        if not ok:
            raise GeometryError('Corpus manifest: ' + message)

    def shape(row, required, optional=()):
        require(
            type(row) is dict and set(required) <= set(row) and not set(row) - set(required) - set(optional),
            'invalid record fields.',
        )

    shape(
        value,
        (
            'format',
            'schemaVersion',
            'date',
            'policy',
            'sources',
            'groups',
            'identities',
            'candidateGroups',
            'externalInventories',
            'blockers',
        ),
    )
    require(
        type(value) is dict
        and value.get('format') == 'polytope-corpus-reconciliation'
        and type(value.get('schemaVersion')) is int
        and value['schemaVersion'] == 1,
        'unsupported format/version.',
    )
    indexes = {}
    for field in ('sources', 'groups', 'identities', 'candidateGroups', 'externalInventories'):
        rows = value.get(field)
        require(type(rows) is list and len(rows) <= 10000, 'invalid ' + field + '.')
        index = {}
        for row in rows:
            require(
                type(row) is dict and type(row.get('id')) is str and 0 < len(row['id']) <= 256, 'invalid record ID.'
            )
            require(row['id'] not in index, 'duplicate ' + field + ' ID: ' + row['id'])
            index[row['id']] = row
        indexes[field] = index
    for source in value['sources'] + value['externalInventories']:
        if source in value['sources']:
            shape(source, ('id', 'file', 'sha256', 'entryCount'))
        require(type(source.get('entryCount')) is int and source['entryCount'] >= 0, 'invalid source count.')
        if source.get('file') is not None:
            _path(source['file'], contained=source in value['sources'])
            sha = source.get('sha256')
            require(
                type(sha) is str and len(sha) == 64 and all(c in '0123456789abcdef' for c in sha),
                'invalid source hash.',
            )
    for group in value['groups']:
        shape(group, ('id', 'label', 'requirement', 'required', 'rosterStatus'))
        require(type(group['label']) is str and type(group['requirement']) is str, 'invalid group labels.')
        require(
            group.get('required') is None or type(group['required']) is int and group['required'] >= 0,
            'invalid denominator.',
        )
        require(group.get('rosterStatus') in ('named-roster', 'benchmark-roster-missing'), 'invalid roster status.')
    for row in value['identities']:
        shape(row, ('id', 'group', 'name', 'identityEvidence', 'links', 'qualification'), ('dualOf',))
        require(row.get('group') in indexes['groups'], 'unknown identity group.')
        require(
            type(row.get('name')) is str and type(row.get('identityEvidence')) is dict,
            'missing named identity evidence.',
        )
        require(
            all(type(row['identityEvidence'].get(k)) is str for k in ('basis', 'reference')),
            'missing identity reference.',
        )
        require(type(row.get('links')) is list, 'invalid realization links.')
        # V1 inventories evidence; later qualification receipts need a reviewed schema migration.
        require(
            'qualification' in row and row['qualification'] is None,
            'v1 does not accept unreviewed qualification claims.',
        )
        for link in row['links']:
            shape(link, ('source', 'entry', 'catalogKey', 'relation'))
            require(
                type(link) is dict and link.get('source') in indexes['sources'] and type(link.get('entry')) is str,
                'unknown source link.',
            )
            require(link.get('relation') in ('realization', 'reflected-realization'), 'invalid realization relation.')
            require(link.get('catalogKey') is None or type(link['catalogKey']) is str, 'invalid catalog key.')
        if row.get('dualOf'):
            require(row['dualOf'] in indexes['identities'], 'missing dual identity.')
    for row in value['candidateGroups']:
        shape(row, ('id', 'group', 'source', 'entries', 'identityStatus', 'basis'))
        require(
            row.get('group') in indexes['groups'] and row.get('source') in indexes['sources'],
            'unknown candidate group/source.',
        )
        require(
            row.get('identityStatus') == 'unmatched'
            and type(row.get('entries')) is list
            and all(type(key) is str for key in row['entries'])
            and len(set(row['entries'])) == len(row['entries']),
            'candidate identities cannot be promoted or deduplicated implicitly.',
        )
    require(type(value.get('blockers')) is list and all(type(v) is str for v in value['blockers']), 'missing blockers.')
    return value


def load_manifest():
    return validate_manifest(_read(MANIFEST)[0])


def _entry_key(entry):
    return entry.get('key', entry.get('record', {}).get('key'))


def _source_state(source, root=ROOT):
    if source['file'] is None:
        from .generators import CATALOG
        from .compound4 import compound4_catalog
        from .compound_catalog import compound_catalog
        from .specialized_catalog import specialized_catalog
        from .scaliform4 import scaliform4_catalog

        entries = (
            CATALOG
            if source['id'] == 'native'
            else [r for r in compound_catalog() if r['dimension'] == 3]
            + [r for r in specialized_catalog() if not r['key'].startswith('antiprism-uc')]
            if source['id'] == 'native-specialized3'
            else compound4_catalog() + scaliform4_catalog() + [r for r in compound_catalog() if r['dimension'] == 4]
        )
        return {
            'status': 'native-current',
            'entries': {r['key']: r for r in entries},
            'metadata': {},
            'actualCount': len(entries),
            'actualSha256': None,
        }
    path = _path(source['file'], root)
    if not path.is_file():
        return {'status': 'missing', 'entries': {}, 'metadata': {}, 'actualCount': 0, 'actualSha256': None}
    document, digest = _read(path)
    entries = document['entries']
    index = {_entry_key(row): row for row in entries if _entry_key(row) is not None}
    if source['id'] == 'snubs':
        index = {r['sourceKey'] + '-mirror': r for r in entries}
        skilling = document.get('skilling')
        if skilling:
            index[skilling['record']['key']] = skilling
    return {
        'status': 'manifest-current'
        if digest == source['sha256'] and len(entries) == source['entryCount']
        else 'stale',
        'entries': index,
        'metadata': document,
        'actualCount': len(entries),
        'actualSha256': digest,
        'supplementalCount': int('skilling' in document),
    }


def _license(source, current, root=ROOT):
    document = current['metadata']
    declared = document.get('license')
    if source['file'] is None:
        return {
            'status': 'unverified',
            'declared': 'Original native construction; per-realization redistribution review pending.',
        }
    directory = _path(source['file'], root).parent
    name = declared.get('file') if type(declared) is dict else document.get('licenseFile')
    if not name:
        name = next((n for n in ('COPYING', 'LICENSE') if (directory / n).is_file()), None)
    evidence = {'status': 'unverified', 'declared': deepcopy(declared), 'file': None, 'sha256': None}
    if name:
        path = _path(directory.relative_to(root).as_posix() + '/' + name, root)
        if path.is_file():
            actual = hashlib.sha256(path.read_bytes()).hexdigest()
            expected = (
                declared.get('sha256', declared.get('rawSha256')) if type(declared) is dict else None
            ) or document.get('copyingSha256')
            evidence.update(
                status='documented' if expected and actual == expected else 'unverified',
                file=path.relative_to(root).as_posix(),
                sha256=actual,
                expectedSha256=expected,
            )
    return evidence


def _realization(link, sources, states, root=ROOT):
    source = sources[link['source']]
    current = states[source['id']]
    entry = current['entries'].get(link['entry'])
    record = (entry or {}).get('record', entry or {})
    id = source['id'] + ':' + link['entry']
    active = entry is not None and current['status'] in ('manifest-current', 'native-current')
    asset = None
    if entry and entry.get('file'):
        asset = {
            'file': (_path(source['file'], root).parent.relative_to(root) / entry['file']).as_posix(),
            'sha256': entry.get('sha256', entry.get('rawSha256')),
            'status': 'manifest-recorded-not-rehashed',
        }
        _path(asset['file'], root)
    return {
        'id': id,
        **deepcopy(link),
        'status': 'mapped-unverified' if active else 'stale-or-missing',
        'name': record.get('name', link['entry']),
        'asset': asset,
        'coordinateSet': {
            'id': 'coordinates:' + id,
            'status': 'separate-retained-realization',
            'comparison': 'No coordinate equality or congruence inferred.',
            'sha256': None,
        },
        'topology': {
            'id': 'incidence:' + id,
            'status': 'ordered-source-incidence-retained',
            'sha256': None,
            'comparison': 'No skeleton/count deduplication or combinatorial isomorphism inferred.',
        },
        'chirality': deepcopy(
            entry.get(
                'chirality',
                entry.get(
                    'chiralityEvidence',
                    {'status': 'unresolved', 'scope': 'No chirality conclusion from names or coordinates alone.'},
                ),
            )
        )
        if entry
        else {'status': 'unresolved'},
        'classification': {
            'status': 'source-asserted' if entry else 'unmatched',
            'label': record.get('sourceClassification', record.get('family')),
            'upstreamVerifiedFlag': record.get('classificationVerified'),
            'scope': 'Retained source evidence; not independent baseline classification qualification.',
        },
        'license': _license(source, current, root),
        'construction': (
            {
                'operation': 'reflect-source',
                'axis': 0,
                'sourceKey': entry['sourceKey'],
                'sourceAssetSha256': entry['sourceAssetSha256'],
                'scope': 'Negate literal X coordinates; retain indexed ordered incidence. No absolute left/right convention.',
            }
            if entry and source['id'] == 'snubs'
            else None
        ),
        'sourceEvidence': {
            field: deepcopy(record.get(field, entry.get(field)))
            for field in ('numericChecks', 'historicalImportEvidence', 'chiralityEvidence', 'nearMissRealization')
            if entry and (field in entry or field in record)
        },
    }


def identity_record(row, sources, states, root=ROOT, *, details=True):
    realizations = (
        [_realization(link, sources, states, root) for link in row['links']]
        if details
        else [
            {
                'status': 'mapped-unverified'
                if link['entry'] in states[link['source']]['entries']
                and states[link['source']]['status'] in ('manifest-current', 'native-current')
                else 'stale-or-missing'
            }
            for link in row['links']
        ]
    )
    mapped = any(r['status'] == 'mapped-unverified' for r in realizations)
    blockers = ['Per-identity classification, chirality and redistribution qualification receipts pending.']
    if not mapped:
        blockers.insert(0, 'No current source realization mapped to this identity.')
    return {
        **deepcopy(row),
        'status': 'mapped-unverified' if mapped else 'unmatched',
        'qualified': False,
        'realizations': realizations,
        'blockers': blockers,
    }


def coverage(group, records):
    rows = {r['id']: r for r in records if r['group'] == group['id']}
    qualified = sum(r.get('qualified') is True for r in rows.values())
    mapped = sum(any(v['status'] == 'mapped-unverified' for v in r.get('realizations', [])) for r in rows.values())
    denominator = group['required']
    return {
        **deepcopy(group),
        'namedIdentities': len(rows),
        'mappedIdentities': mapped,
        'qualifiedIdentities': qualified,
        'unqualifiedObligations': None if denominator is None else denominator - qualified,
        'unnamedObligations': None if denominator is None else max(0, denominator - len(rows)),
        'qualifiedPercent': None if denominator is None else (100 * qualified / denominator if denominator else 0),
        'candidateRealizations': 0,
    }


def _verify(record, realization):
    if realization['status'] != 'mapped-unverified' or not realization['catalogKey']:
        raise GeometryError(
            'This realization has no current application catalog loader; retain it as unresolved source evidence.'
        )
    from .catalog import get_catalog
    from .generators import regular
    from .catalog_audit import audit_model

    metadata = next((r for r in get_catalog() if r['key'] == realization['catalogKey']), None)
    if metadata is None:
        raise GeometryError('Reconciled catalog key is no longer registered.')
    counts = metadata.get('counts', [])
    if not counts or counts[0] > 10000 or sum(counts) > 100000:
        raise GeometryError(
            'Interactive corpus audit is limited to 10,000 vertices and 100,000 total entities. Use the catalog audit CLI for larger sources.'
        )
    model = regular(realization['catalogKey'])
    audit = audit_model(model, metadata)
    digest = lambda value: hashlib.sha256(
        json.dumps(value, allow_nan=False, separators=(',', ':')).encode()
    ).hexdigest()
    return {
        'identity': record['id'],
        'realization': realization['id'],
        'status': 'fail' if any(c['status'] == 'fail' for c in audit['checks'].values()) else 'pass',
        'coordinateSet': {'sha256': digest(model['vertices']), 'equivalence': 'Literal ordered coordinates only.'},
        'topology': {
            'sha256': digest({k: model[k] for k in ('edges', 'faces', 'cells')}),
            'equivalence': 'Literal indexed ordered incidence only; not an isomorphism certificate.',
        },
        **audit,
        'qualified': False,
        'scope': 'Current catalog_audit.audit_model output. Numerical tolerance satisfaction does not qualify baseline correspondence, chirality, classification or redistribution.',
    }


def report(params=None, *, manifest=None, root=ROOT):
    params = {} if params is None else params
    if (
        type(params) is not dict
        or set(params) - {'group', 'identity', 'verify', 'realization'}
        or any(type(params[k]) is not str for k in ('group', 'identity', 'realization') if k in params)
        or 'verify' in params
        and type(params['verify']) is not bool
    ):
        raise GeometryError('Corpus report accepts only group/identity/realization strings and a verify boolean.')
    if params.get('verify') and not params.get('identity'):
        raise GeometryError('Choose one named identity before verifying a corpus realization.')
    if 'realization' in params and not params.get('verify'):
        raise GeometryError('A realization selector is only supported for a single-identity audit.')
    manifest = load_manifest() if manifest is None else validate_manifest(manifest)
    sources = {s['id']: s for s in manifest['sources']}
    states = {id: _source_state(source, root) for id, source in sources.items()}
    rows = [identity_record(r, sources, states, root, details=False) for r in manifest['identities']]
    groups = [coverage(g, rows) for g in manifest['groups']]
    for group in groups:
        group['candidateRealizations'] = sum(
            len(c['entries']) for c in manifest['candidateGroups'] if c['group'] == group['id']
        )
    result = {
        'format': manifest['format'],
        'schemaVersion': 1,
        'date': manifest['date'],
        'policy': manifest['policy'],
        'groups': groups,
        'blockers': deepcopy(manifest['blockers']),
        'sources': [
            {
                **deepcopy(source),
                **{k: states[id][k] for k in ('status', 'actualCount', 'actualSha256')},
                'supplementalCount': states[id].get('supplementalCount', 0),
                'license': _license(source, states[id], root),
            }
            for id, source in sources.items()
        ],
        'externalInventories': deepcopy(manifest['externalInventories']),
    }
    for source in result['externalInventories']:
        path = _path(source['file'], root, contained=False)
        source['status'] = (
            'inventory-snapshot-external'
            if not path.resolve().is_relative_to(root.resolve())
            else 'inventory-pin-current'
            if path.is_file()
            and path.stat().st_size <= MAX_JSON
            and hashlib.sha256(path.read_bytes()).hexdigest() == source['sha256']
            else 'not-installed-or-stale'
        )
        source['scope'] = (
            'Pinned download inventory, not a current per-file verification or license/identity qualification.'
        )
    if 'group' in params:
        if params['group'] not in {g['id'] for g in groups}:
            raise GeometryError('Unknown corpus group.')
        result['identities'] = [
            identity_record(r, sources, states, root) for r in manifest['identities'] if r['group'] == params['group']
        ]
        result['candidateGroups'] = []
        for group in manifest['candidateGroups']:
            if group['group'] != params['group']:
                continue
            current = states[group['source']]
            result['candidateGroups'].append(
                {
                    **deepcopy(group),
                    'records': [
                        {
                            'id': group['source'] + ':' + key,
                            'key': key,
                            'name': current['entries']
                            .get(key, {})
                            .get('name', current['entries'].get(key, {}).get('record', {}).get('name', key)),
                            'sourceStatus': current['status'],
                            'status': current['entries'].get(key, {}).get('catalogStatus', 'unverified')
                            if key in current['entries']
                            else 'missing-source-entry',
                            'identityStatus': 'unmatched',
                        }
                        for key in group['entries']
                    ],
                }
            )
    if 'identity' in params:
        row = next((r for r in manifest['identities'] if r['id'] == params['identity']), None)
        if row is None:
            raise GeometryError('Unknown corpus identity; arbitrary source paths are not accepted.')
        if params.get('group') and row['group'] != params['group']:
            raise GeometryError('Corpus identity does not belong to the selected group.')
        row = identity_record(row, sources, states, root)
        result['identity'] = row
        if params.get('verify'):
            realization = (
                next((r for r in row['realizations'] if r['id'] == params.get('realization')), None)
                if 'realization' in params
                else next(
                    (r for r in row['realizations'] if r['catalogKey'] and r['status'] == 'mapped-unverified'), None
                )
            )
            if realization is None:
                raise GeometryError(
                    'No mapped loadable realization selected; a dual operation alone does not supply a catalog identity.'
                )
            result['audit'] = _verify(row, realization)
    from .goursat_wythoff import generated_crosswalk

    result['generatedTranches'] = [generated_crosswalk()]
    from .schwarz_wythoff import generated_crosswalk as schwarz_crosswalk

    result['generatedTranches'].append(schwarz_crosswalk())
    return result


def dispatch_reconciliation(request):
    if type(request) is not dict or set(request) - {'op', 'id', 'params', 'model'} or request.get('model') is not None:
        raise GeometryError('Corpus reconciliation is a read-only catalog query without model input.')
    return report(request.get('params', {}))


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--group')
    parser.add_argument('--identity')
    parser.add_argument(
        '--verify', action='store_true', help='Reuse the current numerical catalog audit for one identity.'
    )
    parser.add_argument('--output', type=Path)
    args = parser.parse_args(argv)
    params = {k: v for k, v in vars(args).items() if k in ('group', 'identity') and v is not None}
    if args.verify:
        params['verify'] = True
    result = report(params)
    raw = json.dumps(result, ensure_ascii=False, allow_nan=False, indent=2) + '\n'
    if args.output:
        from .formats import atomic_write

        atomic_write(args.output, raw)
    else:
        print(raw, end='')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
