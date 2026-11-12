"""Regenerate the offline identity crosswalk; never infer identity from geometry."""

import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def build():
    from engine.generators import CATALOG, CATALAN_SOURCES
    from engine.regular4d_validation import CROSSWALK, CATALOG_IDENTITIES

    sources = []
    documents = {}
    for name, relative in [
        ('antiprism', 'antiprism/manifest.json'),
        ('regular-source', 'miratope/manifest.json'),
        ('expanded', 'miratope_expanded/manifest.json'),
        ('near-miss', 'near_miss/manifest.json'),
        ('snubs', 'uniform_snub/manifest.json'),
        ('specialized', 'specialized/manifest.json'),
        ('stewart', 'stewart/manifest.json'),
        ('stewart-families', 'stewart_families/manifest.json'),
        ('compound-repair', 'compound_repair/manifest.json'),
        ('convex4', 'convex_uniform4.json'),
        ('star4', 'star_uniform4.json'),
        ('uniform-compounds', 'uniform_compounds.json'),
    ]:
        path = ROOT / 'engine/catalog_data' / relative
        raw = path.read_bytes()
        document = json.loads(raw)
        documents[name] = document
        sources.append(
            {
                'id': name,
                'file': 'engine/catalog_data/' + relative,
                'sha256': hashlib.sha256(raw).hexdigest(),
                'entryCount': len(document['entries']),
            }
        )
    sources.append({'id': 'native', 'file': None, 'sha256': None, 'entryCount': len(CATALOG)})
    groups = [
        ('regular4', 'Regular 4D polychora', 'LIB-04', 16, 'named-roster'),
        ('uniform3', 'Uniform polyhedra U1–75', 'LIB-01', 75, 'named-roster'),
        ('dual3', 'Duals of U1–75', 'LIB-01', 75, 'named-roster'),
        ('johnson', 'Johnson solids J1–92', 'LIB-02', 92, 'named-roster'),
        ('near-miss', 'Near-miss Johnson names', 'LIB-02', None, 'benchmark-roster-missing'),
        ('uniform4', 'Baseline uniform polychora', 'LIB-05', 2191, 'benchmark-roster-missing'),
        ('specialized3', 'Specialized 3D families', 'LIB-03', None, 'benchmark-roster-missing'),
        ('specialized4', 'Fissaries, scaliforms and 4D compounds', 'LIB-06', None, 'benchmark-roster-missing'),
    ]
    groups = [dict(zip(('id', 'label', 'requirement', 'required', 'rosterStatus'), row)) for row in groups]
    identities = []

    def link(source, entry, key=None, relation='realization'):
        return {'source': source, 'entry': entry, 'catalogKey': key, 'relation': relation}

    def add(id, group, name, basis, links, **extra):
        identities.append(
            {
                'id': id,
                'group': group,
                'name': name,
                'identityEvidence': basis,
                'links': links,
                'qualification': None,
                **extra,
            }
        )

    regular_ids = {name: 'regular4:' + CROSSWALK[name]['alias'].lower() for name in CROSSWALK}
    regular_entries = documents['regular-source']['entries']
    for key, name in CATALOG_IDENTITIES.items():
        row = CROSSWALK[name]
        alternate = next(e for e in regular_entries if e['name'] == name)
        links = [link('regular-source', alternate['key'], key if alternate['registration'] == 'regular-star' else None)]
        if key in {r['key'] for r in CATALOG}:
            links.insert(0, link('native', key, key))
        add(
            regular_ids[name],
            'regular4',
            name,
            {
                'basis': 'Explicit classical regular identity table, not counts matching.',
                'reference': 'engine/regular4d_validation.py:CROSSWALK',
                'symbol': row['symbol'],
                'expectedCounts': row['counts'],
            },
            links,
            dualOf=regular_ids[row['dual']],
        )
    by_key = {r['key']: r for r in CATALOG}
    # Reviewed U numbering and independent native constructions; no fuzzy names.
    native_u = {
        1: 'tetrahedron',
        2: 'truncated-tetrahedron',
        5: 'octahedron',
        6: 'cube',
        7: 'cuboctahedron',
        8: 'truncated-octahedron',
        9: 'truncated-cube',
        10: 'rhombicuboctahedron',
        11: 'truncated-cuboctahedron',
        12: 'snub-cube',
        22: 'icosahedron',
        23: 'dodecahedron',
        24: 'icosidodecahedron',
        25: 'truncated-icosahedron',
        26: 'truncated-dodecahedron',
        27: 'rhombicosidodecahedron',
        28: 'truncated-icosidodecahedron',
        29: 'snub-dodecahedron',
        34: 'small-stellated-dodecahedron',
        35: 'great-dodecahedron',
        52: 'great-stellated-dodecahedron',
        53: 'great-icosahedron',
    }
    platonic_duals = {1: 1, 5: 6, 6: 5, 22: 23, 23: 22}
    for entry in documents['antiprism']['entries']:
        uid = entry['id']
        key = entry['key']
        uniform = uid.startswith('U')
        n = int(uid[1:])
        links = [link('antiprism', key, key)]
        native = native_u.get(n) if uniform else None
        if native:
            links.append(link('native', native, native))
        snub = next((r for r in documents['snubs']['entries'] if r['sourceKey'] == key), None)
        if snub:
            links.append(link('snubs', key + '-mirror', key + '-mirror', 'reflected-realization'))
        basis = {
            'basis': 'Explicit upstream resource ID; source classification is retained separately.',
            'reference': 'engine/catalog_data/antiprism/' + ('uniform-help.txt' if uniform else 'johnson-help.txt'),
            'sourceId': uid,
        }
        add(
            ('uniform3:' if uniform else 'johnson:') + uid,
            'uniform3' if uniform else 'johnson',
            uid + ' — ' + entry['name'],
            basis,
            links,
        )
        if not uniform:
            continue
        dual_links = []
        if n in platonic_duals:
            target = 'antiprism-u' + str(platonic_duals[n])
            dual_links.append(link('antiprism', target, target))
        elif native:
            dual = by_key[native].get('dualKey') or next((k for k, v in CATALAN_SOURCES.items() if v == native), None)
            if dual:
                dual_links.append(link('native', dual, dual))
                if dual + '-mirror' in by_key:
                    dual_links.append(link('native', dual + '-mirror', dual + '-mirror', 'reflected-realization'))
        add(
            'dual3:' + uid,
            'dual3',
            'Dual of ' + uid + ' — ' + entry['name'],
            {
                'basis': 'One explicit dual obligation for each U identity; an available operation is not a mapped asset.',
                'reference': 'STELLA4D_FEATURE_COMPLETE_BUILD_SPEC.md:LIB-01',
            },
            dual_links,
            dualOf='uniform3:' + uid,
        )
    for entry in documents['near-miss']['entries']:
        record = entry['record']
        key = record['key']
        add(
            'near-miss:' + key,
            'near-miss',
            record['name'],
            {
                'basis': 'Local named fitted realization; benchmark correspondence not yet established.',
                'reference': 'engine/catalog_data/near_miss/manifest.json',
            },
            [link('near-miss', key, key)],
        )
    candidates = []

    def candidate(id, group, source, entries, basis):
        candidates.append(
            {
                'id': id,
                'group': group,
                'source': source,
                'entries': entries,
                'identityStatus': 'unmatched',
                'basis': basis,
            }
        )

    candidate(
        'convex4',
        'uniform4',
        'convex4',
        [r['key'] for r in documents['convex4']['entries']],
        '64 local O indices; 65 realizations. No mapping to a supplied 2,191-name baseline roster.',
    )
    candidate(
        'star4',
        'uniform4',
        'star4',
        [r['key'] for r in documents['star4']['entries']],
        '79 documented rational-angle Wythoff candidates; no baseline identity assignment.',
    )
    for label, id, group in [
        ('4D/convex uniform', 'expanded-convex', 'uniform4'),
        ('4D/nonconvex uniform', 'expanded-nonconvex', 'uniform4'),
        ('Unclassified discovery candidate', 'expanded-discovery', 'specialized4'),
    ]:
        candidate(
            id,
            group,
            'expanded',
            [r['key'] for r in documents['expanded']['entries'] if r['sourceClassification'] == label],
            'Literal distinct source paths; directory labels are not classification proofs.',
        )
    for source in ('specialized', 'stewart', 'stewart-families'):
        candidate(
            source,
            'specialized3',
            source,
            [r['key'] for r in documents[source]['entries']],
            'Retained local named family; benchmark family roster and correspondence missing.',
        )
    candidate(
        'compound-repair',
        'specialized4',
        'compound-repair',
        [r['key'] for r in documents['compound-repair']['entries']],
        'Corrected derived copies remain distinct from their original sources.',
    )
    from engine.compound4 import compound4_catalog
    from engine.compound_catalog import compound_catalog
    from engine.specialized_catalog import specialized_catalog
    from engine.scaliform4 import scaliform4_catalog

    # Native family records are inventory candidates, never implicit baseline IDs.
    native_candidates = (
        compound4_catalog() + scaliform4_catalog() + [r for r in compound_catalog() if r['dimension'] == 4]
    )
    sources.append({'id': 'native-specialized4', 'file': None, 'sha256': None, 'entryCount': len(native_candidates)})
    candidate(
        'native-specialized4',
        'specialized4',
        'native-specialized4',
        [r['key'] for r in native_candidates],
        'Bounded native constructions; independent benchmark roster still missing.',
    )
    native3 = [r for r in compound_catalog() if r['dimension'] == 3] + [
        r for r in specialized_catalog() if not r['key'].startswith('antiprism-uc')
    ]
    sources.append({'id': 'native-specialized3', 'file': None, 'sha256': None, 'entryCount': len(native3)})
    candidate(
        'native-specialized3',
        'specialized3',
        'native-specialized3',
        [r['key'] for r in native3],
        'Native compounds, four noble realizations and a sweep torus; family-wide benchmark identities unresolved.',
    )
    candidate(
        'skilling',
        'specialized3',
        'snubs',
        [documents['snubs']['skilling']['record']['key']],
        'Separate nonordinary Skilling figure outside the U1–75 obligations.',
    )
    drive = ROOT / 'data/drive-uniforms/download-manifest.json'
    d = json.loads(drive.read_bytes()) if drive.exists() else None
    external = (
        []
        if d is None
        else [
            {
                'id': 'drive',
                'file': drive.relative_to(ROOT).as_posix(),
                'sha256': hashlib.sha256(drive.read_bytes()).hexdigest(),
                'entryCount': len(d['files']),
                'downloadedCount': sum(r.get('status') == 'downloaded' for r in d['files']),
                'licenseStatus': 'unverified',
                'baselineIdentityStatus': 'unmatched',
                'groups': {
                    folder: sum(r['relativePath'].split('/')[0] == folder for r in d['files'])
                    for folder in sorted({r['relativePath'].split('/')[0] for r in d['files']})
                },
                'listingScope': d['listingCompleteness'],
            }
        ]
    )
    return {
        'format': 'polytope-corpus-reconciliation',
        'schemaVersion': 1,
        'date': '2026-11-09',
        'policy': 'Identity coverage counts qualified named identities once. Source files, realizations, coordinate sets, topology and chirality remain separate. Numerical audit pass alone does not qualify classification or baseline correspondence.',
        'sources': sources,
        'groups': groups,
        'identities': identities,
        'candidateGroups': candidates,
        'externalInventories': external,
        'blockers': [
            'No authoritative entry-level 2,191 uniform-polychoron baseline roster is supplied.',
            'Benchmark near-miss, specialized 3D and specialized 4D named rosters are missing.',
            'Remaining U duals need named source assets and domain-specific incidence qualification; center-plane reciprocation is not assumed finite.',
            'Current per-realization classification/chirality and redistribution review receipts are not part of this first manifest.',
            'Drive file licenses and baseline identities remain unverified; file totals are not coverage.',
        ],
    }


if __name__ == '__main__':
    path = ROOT / 'engine/catalog_data/corpus_reconciliation.json'
    path.write_text(json.dumps(build(), ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(path.relative_to(ROOT))
