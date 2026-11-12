"""Rebuild only the thirteen R8 U-dual diagnostic receipts, offline."""

import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from engine.u_dual_obstructions import DATA, VERSION, NUMBERS, SCOPE, diagnose
from engine.generators import regular


def build():
    provider = ROOT / 'engine/catalog_data/antiprism'
    source = json.loads((provider / 'manifest.json').read_text(encoding='utf-8'))
    expected = json.loads(DATA.with_name('expected.json').read_text(encoding='utf-8'))
    assert [r['number'] for r in expected['entries']] == list(NUMBERS)
    entries = []
    paths = ['manifest.json', 'COPYING']
    for e in expected['entries']:
        n = e['number']
        key = 'antiprism-u' + str(n)
        record = next(r for r in source['entries'] if r['key'] == key)
        summary, _ = diagnose(regular(key), e)
        paths.extend([record['file'], record['sourceFile']])
        entries.append(
            {
                'id': 'dual3:U' + str(n),
                'scenarioId': 'r8-dual-obstruction-u' + str(n),
                'name': 'Dual of ' + record['name'] + ' (U' + str(n) + ')',
                'sourceKey': key,
                'aliases': ['U' + str(n) + ' dual', 'dual of U' + str(n)],
                'sourceName': record['name'],
                'sourceIdentity': record['id'],
                'sourceAsset': record['file'],
                'originalSourceAsset': record['sourceFile'],
                'sourceSha256': record['sourceSha256'],
                'adaptedSha256': record['sha256'],
                'license': {'retained': 'catalog_data/antiprism/COPYING', 'redistributionReviewed': False},
                'expected': e,
                'receipt': summary,
            }
        )
    pins = {
        'catalog_data/antiprism/' + p: hashlib.sha256((provider / p).read_bytes()).hexdigest()
        for p in sorted(set(paths))
    }
    return {
        'schemaVersion': 1,
        'algorithmVersion': VERSION,
        'provider': 'R8 remaining named U-dual obstructions',
        'scope': SCOPE,
        'expectedFixtureBasis': expected['basis'],
        'sourcePins': pins,
        'entries': entries,
    }


if __name__ == '__main__':
    DATA.write_text(json.dumps(build(), indent=2, allow_nan=False) + '\n', encoding='utf-8')
