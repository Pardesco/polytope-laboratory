"""Count identities selected by mathematical name as well as registered key.

Reuse the independent kaleidoscopic table, not the catalog's retained counts.
Load all matching duplicates in isolated, rank-guarded native audit workers.
"""

from math import prod
from fractions import Fraction
import re

import pytest

from engine.catalog import get_catalog, _sources
from engine.catalog_audit import Worker, expected_table, family_counts, rational_wythoff_counts, wythoff_counts
from engine.library_navigation import crosswalk
from engine.regular4d_validation import CATALOG_IDENTITIES, CROSSWALK
from engine.uniform4 import manifest


def canonical_name(name):
    name = name.lower().removesuffix(' (reflected)')
    for before, after in [
        ('5-cell', 'pentachoron'),
        ('8-cell', 'tesseract'),
        ('16-cell', 'hexadecachoron'),
        ('24-cell', 'icositetrachoron'),
        ('120-cell', 'hecatonicosachoron'),
        ('600-cell', 'hexacosichoron'),
        ('semisnub icositetrachoron', 'snub icositetrachoron'),
    ]:
        name = name.replace(before, after)
    return re.sub(r'[^a-z0-9]', '', name)


def named_expectations():
    table = expected_table()
    names = {}

    def add(dimension, name, key):
        signature = dimension, canonical_name(name)
        values = tuple(table[key]['counts'])
        assert signature not in names or names[signature]['counts'] == values, (name, key)
        names[signature] = {'counts': values, 'basis': table[key]['basis'], 'identityKey': key}

    for entry in manifest()['entries']:
        for name in [entry['name'], entry['bowers'], *entry.get('aliases', [])]:
            add(4, name, entry['key'])
    for key, name in CATALOG_IDENTITIES.items():
        for label in [name, CROSSWALK[name]['alias']]:
            add(4, label, key)
    for u in crosswalk():
        key = f'antiprism-u{u}'
        add(3, _sources()[key][2]['name'], key)
    return names


def computed_star_counts(key):
    p, q, r = CROSSWALK[CATALOG_IDENTITIES[key]]['parameters']

    def triangle(a, b):
        numerators = {Fraction(x).numerator for x in (a, b)}
        degrees = [2, 6, 10] if 5 in numerators else [2, 4, 6] if 4 in numerators else [2, 3, 4]
        order = prod(degrees)
        counts, residual = rational_wythoff_counts(f'{b}|2 {a}', order)
        assert residual < 1e-9
        return counts, order

    cell, _ = triangle(p, q)
    vf, stabilizer = triangle(q, r)
    vertices = prod([2, 12, 20, 30]) // stabilizer
    values = [
        Fraction(vertices),
        Fraction(vertices * vf[0], 2),
        Fraction(vertices * vf[1], Fraction(p).numerator),
        Fraction(vertices * vf[2], cell[0]),
    ]
    assert all(x.denominator == 1 for x in values)
    return list(map(int, values))


NAMES = named_expectations()
TABLE = expected_table()
RECORDS = get_catalog()
MATCHES = [
    (
        r,
        NAMES.get(
            (r['dimension'], canonical_name(r['name'])),
            {'counts': tuple(TABLE[r['key']]['counts']), 'basis': TABLE[r['key']]['basis'], 'identityKey': r['key']}
            if r['key'] in TABLE
            else None,
        ),
    )
    for r in RECORDS
]
MATCHES = [(r, e) for r, e in MATCHES if e is not None]


def test_named_crosscheck_covers_all_classical_identities_and_duplicates():
    keys = {r['key'] for r, _ in MATCHES}
    assert {r['key'] for r in manifest()['entries']} <= keys
    assert {f'antiprism-u{u}' for u in range(1, 76)} <= keys
    assert set(CATALOG_IDENTITIES) <= keys
    # Same names in the attributed expanded catalog are checked independently.
    assert sum(r['key'].startswith('miratope-expanded-') for r, _ in MATCHES) >= 40
    assert len({r['uniformIndex'] for r in manifest()['entries']}) == 64
    assert len([r for r in manifest()['entries'] if r.get('baseKey')]) == 18


@pytest.mark.parametrize('record,expectation', MATCHES, ids=[r['key'] for r, _ in MATCHES])
def test_every_matching_catalog_name_has_the_computed_counts(record, expectation):
    assert tuple(record['counts']) == expectation['counts'], (record['name'], expectation)


@pytest.fixture(scope='module')
def worker():
    process = Worker(90)
    yield process
    process.close()


@pytest.mark.parametrize('record,expectation', MATCHES, ids=[r['key'] for r, _ in MATCHES])
def test_named_source_geometry_matches_the_computed_identity(worker, record, expectation):
    report = worker.run({'kind': 'catalog', 'id': record['key'], 'record': record})
    assert report.get('checks', {}).get('load', {}).get('status') == 'pass', report
    assert tuple(report['counts']) == expectation['counts'], (record['name'], report, expectation)


@pytest.mark.parametrize(
    'family,degrees',
    [
        ('A3', [2, 3, 4]),
        ('B3', [2, 4, 6]),
        ('H3', [2, 6, 10]),
        ('A4', [2, 3, 4, 5]),
        ('B4', [2, 4, 6, 8]),
        ('F4', [2, 6, 8, 12]),
        ('H4', [2, 12, 20, 30]),
    ],
)
def test_full_ring_vertex_stabilizer_is_trivial(family, degrees):
    # Coxeter group order is the product of invariant degrees (exponents + 1).
    counts = wythoff_counts(family, [1] * len(degrees))
    assert counts[0] == prod(degrees)
    assert counts[1] == len(degrees) * prod(degrees) // 2


@pytest.mark.parametrize('key', [k for k in CATALOG_IDENTITIES if k.startswith('miratope-')])
def test_regular_star_local_incidence_is_computed_from_triangle_groups(key):
    assert computed_star_counts(key) == TABLE[key]['counts']


@pytest.mark.parametrize(
    'kind,n,m',
    [('prism', 17, 3), ('antiprism', 17, 3), ('antiprism-prism', 5, 3), ('duoprism', 3, 5), ('duoprism', 7, 11)],
)
def test_sampled_prism_families_against_product_incidence(worker, kind, n, m):
    report = worker.run(
        {'kind': 'sample', 'id': f'named-{kind}-{n}-{m}', 'parameters': {'family': kind, 'n': n, 'm': m}}
    )
    assert report['checks']['load']['status'] == 'pass', report
    assert report['counts'] == family_counts(kind, n, m)


def test_same_count_is_not_claimed_to_prove_identity():
    # Gohi and Gahi share their face vector; winding/regularity need other checks.
    a = NAMES[4, canonical_name('Great hecatonicosachoron')]
    b = NAMES[4, canonical_name('Grand hecatonicosachoron')]
    assert a['counts'] == b['counts'] and a['identityKey'] != b['identityKey']


def test_incorrect_named_record_is_detected_without_relabeling_by_counts():
    expected = NAMES[4, canonical_name('Tesseract')]
    wrong = {'name': 'Tesseract', 'counts': TABLE['cross4']['counts']}
    assert tuple(wrong['counts']) != expected['counts']
    assert (4, canonical_name('unreviewed arbitrary compound')) not in NAMES


if __name__ == '__main__':
    import json
    import sys
    from pathlib import Path

    identities = (
        [r['key'] for r in manifest()['entries']]
        + [f'antiprism-u{u}' for u in range(1, 76)]
        + [key for key in CATALOG_IDENTITIES if key.startswith('miratope-')]
    )
    payload = {
        'schemaVersion': 1,
        'date': '2026-11-09',
        'identityCount': 64 + 75 + 10,
        'tableEntryCount': len(identities),
        'matchedRegistrationCount': len(MATCHES),
        'nameMismatchCount': sum(tuple(r['counts']) != e['counts'] for r, e in MATCHES),
        'numericContract': 'Integer parabolic cosets for convex Wythoff models; float64 rational triangle orbits for generalized U models. Count equality alone does not prove identity.',
        'identities': {key: TABLE[key] for key in identities},
        'registrations': [
            {
                'key': r['key'],
                'name': r['name'],
                'identityKey': e['identityKey'],
                'actualCounts': r['counts'],
                'computedCounts': e['counts'],
            }
            for r, e in MATCHES
        ],
    }
    for key in CATALOG_IDENTITIES:
        if key.startswith('miratope-'):
            payload['identities'][key] = {**TABLE[key], 'counts': computed_star_counts(key)}
    Path(sys.argv[1]).write_text(json.dumps(payload, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
