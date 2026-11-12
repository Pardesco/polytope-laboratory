"""Rebuild separate R7 classification provider receipts offline; no aggregate writes."""

import argparse
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from engine.classification_qualification import DATA, qualify, digest
from engine.geometry import GeometryError


def read(relative):
    return json.loads((ROOT / relative).read_text(encoding='utf-8'))


def pins(paths):
    return {p: hashlib.sha256((ROOT / p).read_bytes()).hexdigest() for p in paths}


def build(tranche):
    entries = []
    sources = ['engine/classification_qualification.py']
    definitions = {}
    if tranche == '3d':
        sources += [
            'engine/catalog_data/antiprism/manifest.json',
            'engine/catalog_data/near_miss/manifest.json',
            'engine/catalog_data/stewart/manifest.json',
            'engine/catalog_data/stewart_families/manifest.json',
            'engine/compound_catalog.py',
            'engine/incidence_dual.py',
        ]
        crosswalk = read('engine/catalog_data/corpus_reconciliation.json')
        uniforms = {e['key']: e for e in read(sources[1])['entries']}
        for r in crosswalk['identities']:
            if r['group'] != 'dual3' or r['links']:
                continue
            number = r['id'].split('U')[-1]
            source = uniforms['antiprism-u' + number]
            counts = source['counts']
            counts = [counts[k] for k in ('vertices', 'edges', 'faces', 'cells')] if type(counts) is dict else counts
            entries.append(
                {
                    'id': r['id'],
                    'name': 'Dual of ' + source['name'] + ' (U' + number + ')',
                    'kind': 'dual',
                    'sourceKey': source['key'],
                    'counts': counts,
                    'generatedKey': 'generated-dual-u' + number,
                    'identityBasis': 'U-number from the retained Antiprism manifest; generated reciprocal identity, not a new supplied source.',
                    'references': ['engine/catalog_data/antiprism/manifest.json', 'docs/CORPUS_RECONCILIATION.md'],
                }
            )
        for e in read(sources[2])['entries']:
            r = e['record']
            entries.append(
                {
                    'id': 'near-miss:' + r['key'],
                    'name': r['name'],
                    'kind': 'near-miss',
                    'sourceKey': r['key'],
                    'counts': r['counts'],
                    'identityBasis': 'Named local fitted realization; benchmark near-miss roster remains unresolved.',
                    'references': r['nearMissRealization']['references'],
                    'sourceHypotheses': {'approximate': True, 'regularityEstablished': False},
                }
            )
        for path in sources[3:5]:
            for r in read(path)['entries']:
                entries.append(
                    {
                        'id': 'stewart:' + r['key'],
                        'name': r['name'],
                        'kind': 'stewart',
                        'sourceKey': r['key'],
                        'counts': r['counts'],
                        'genus': r['genus'][0],
                        'identityBasis': r['sourceClassification'],
                        'sourceHypotheses': {'chirality': r['chirality'], 'genus': r['genus']},
                        'references': [path],
                    }
                )
        from engine.compound_catalog import compound_catalog

        definitions['compound3'] = digest(compound_catalog())
        for r in compound_catalog()[:7]:
            entries.append(
                {
                    'id': 'compound3:' + r['key'],
                    'name': r['name'],
                    'kind': 'compound',
                    'sourceKey': r['key'],
                    'counts': r['counts'],
                    'componentCount': r['componentCount'],
                    'sourceHypotheses': {
                        'chirality': r.get('chirality', 'unresolved'),
                        'enantiomorph': r.get('enantiomorph'),
                        'convention': 'A/B are source coordinate labels; chirality is retained as a hypothesis in the constituent-only qualification.',
                    },
                    'identityBasis': 'Named existing native compound; independent constituent-boundary and ownership checks.',
                    'references': ['engine/compound_catalog.py'],
                }
            )
        label = '3D duals, near misses, Stewart toroids and compounds'
        unresolved = [
            'Finite reciprocal failures retain named identities and reasons. Projective/ideal dual display is a separate workflow.',
            'Benchmark near-miss and specialized 3D identity rosters, redistribution approval and independent specialist release review remain unresolved.',
        ]
    else:
        sources += [
            'engine/scaliform4.py',
            'engine/compound4.py',
            'engine/polychoron_relationships.py',
            'engine/coincidic_regiments.py',
        ]
        from engine.scaliform4 import scaliform4_catalog

        definitions['scaliform4'] = digest(scaliform4_catalog())
        for r in scaliform4_catalog():
            entries.append(
                {
                    'id': 'scaliform:' + r['key'],
                    'name': r['name'],
                    'kind': 'scaliform',
                    'sourceKey': r['key'],
                    'counts': r['counts'],
                    'cellInventory': [[4, 4, 6], [9, 8, 8], [12, 8, 2]]
                    if r['bowers'] == 'tuta'
                    else [[4, 4, 8], [6, 6, 4]],
                    'sourceHypotheses': {'fissary': False, 'uniform': False},
                    'identityBasis': 'Existing independently constructed named scaliform.',
                    'references': r['referenceUrls'],
                }
            )
        from engine.compound4 import compound4_catalog

        definitions['compound4'] = digest(compound4_catalog())
        for r in compound4_catalog()[:3]:
            entries.append(
                {
                    'id': 'compound4:' + r['key'],
                    'name': r['name'],
                    'kind': 'compound',
                    'sourceKey': r['key'],
                    'counts': r['counts'],
                    'componentCount': r['componentCount'],
                    'sourceHypotheses': {'classification': r['compoundClassification'], 'chirality': 'unresolved'},
                    'identityBasis': 'Native declared finite-group compound; independent literal constituent verification.',
                    'references': r['referenceUrls'],
                }
            )
        entries.append(
            {
                'id': 'regiment:koho-cross4',
                'name': 'Koho / 16-cell common vertex and edge arrangement',
                'kind': 'regiment',
                'sourceKey': 'scaliform4-koho',
                'counts': [8, 24, 28, 12],
                'otherKey': 'cross4',
                'otherScale': 2**-0.5,
                'otherName': '16-cell',
                'comparisonScaleDefinition': '1/sqrt(2)',
                'identityBasis': 'Explicit fixed-placement numerical bijection with independent full rank-by-rank incidence comparison.',
                'references': ['engine/scaliform4.py', 'engine/coincidic_regiments.py'],
            }
        )
        from engine.polychoron_relationships import FISSARIES, REGIMENT_REFERENCE

        definitions['fissaryAcronyms'] = digest(sorted(FISSARIES))
        for name in sorted(FISSARIES):
            entries.append(
                {
                    'id': 'fissary:' + name.replace(' ', '-'),
                    'name': name,
                    'kind': 'missing-source',
                    'identityBasis': 'Retained published-acronym source assertion; no geometry is inferred from a name or shared coordinates.',
                    'sourceHypotheses': {'fissary': True, 'chirality': 'unresolved', 'genus': None},
                    'references': [REGIMENT_REFERENCE],
                    'reason': 'No pinned loadable named geometry in this tranche; fissary rank, chirality and literal topology remain unqualified.',
                }
            )
        label = '4D scaliforms, compounds, regiments and fissary source gaps'
        unresolved = [
            'All 24 retained fissary acronym assertions lack pinned geometry in this tranche and remain unresolved.',
            'The specialized 4D benchmark roster and discovery-candidate identities remain unresolved; a common skeleton never merges topology.',
            'No full regular-compound enumeration, generalized filled interiors, exact arithmetic, redistribution approval or specialist release review is claimed.',
        ]
    for row in entries:
        try:
            row['receipt'] = qualify(row)
        except GeometryError as error:
            row['receipt'] = {
                'status': 'missing-source' if row['kind'] == 'missing-source' else 'unresolved',
                'reason': str(error),
                'certified': False,
                'releaseQualified': False,
            }
    return {
        'schemaVersion': 1,
        'tranche': tranche,
        'provider': 'Polytope Laboratory R7 classification',
        'algorithmVersion': '0.1.0',
        'label': label,
        'sourcePins': pins([p for p in sources if p.endswith('.json')]),
        'definitionPins': definitions,
        'implementationEvidence': pins([p for p in sources if p.endswith('.py')]),
        'entries': entries,
        'unresolved': unresolved,
        'scope': 'Recorded numerical qualification for named source realizations and relationships. Recheck binds current geometry to separate coordinate/incidence hashes. No aggregate crosswalk or release-qualification promotion.',
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tranche', choices=['3d', '4d', 'both'], default='both')
    args = parser.parse_args()
    DATA.mkdir(parents=True, exist_ok=True)
    for tranche in ['3d', '4d'] if args.tranche == 'both' else [args.tranche]:
        value = build(tranche)
        (DATA / (tranche + '.json')).write_text(
            json.dumps(value, ensure_ascii=False, allow_nan=False, indent=2) + '\n', encoding='utf-8'
        )
        counts = {
            status: sum(e['receipt']['status'] == status for e in value['entries'])
            for status in ['numerical-pass', 'unresolved', 'missing-source']
        }
        print(tranche, counts, flush=True)


if __name__ == '__main__':
    main()
