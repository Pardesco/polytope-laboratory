"""Small external fixtures; no network and no full-catalog geometry run."""

from copy import deepcopy
from datetime import datetime
import hashlib
import json
from pathlib import Path
import subprocess
import sys

import numpy as np
import pytest

from scripts.verify_external import (
    CACHE, ROOT, face_vector, incidence_rows, load_cache, map_entry, matrix_checks,
    outside_group_order, similarity, source_indexes, summary, verify_entry, visible_catalog,
    dual_mapping_status,
)
from scripts.fetch_verification_sources import extract_page
from engine.generators import regular


@pytest.fixture(scope='module')
def sources():
    return load_cache()[1]


@pytest.mark.parametrize('acronym,dimension,counts', [
    ('tet', 3, [4, 6, 4, 0]), ('co', 3, [12, 24, 14, 0]),
    ('snic', 3, [24, 60, 38, 0]), ('pen', 4, [5, 10, 10, 5]),
    ('rap', 4, [10, 30, 30, 10]),
])
def test_outside_orbit_diagonals(sources, acronym, dimension, counts):
    page = sources[f'klitzing/{acronym}.json']['data']
    rows = incidence_rows(page, dimension)
    assert face_vector(page) == counts
    assert [sum(r['count'] for r in rows if r['rank'] == i) for i in range(dimension)] == counts[:dimension]


def test_html_extraction_matches_labels_not_meta_or_component_names():
    raw = b'''<meta name="author" content="Name"><table>
    <tr><td><b>Acronym</b></td><td>tet</td></tr>
    <tr><td><b>Name</b></td><td>tetrahedron,<br/>simplex</td></tr>
    <tr><td>Face vector</td><td>4, 6, 4</td></tr></table>'''
    assert extract_page(raw)['Name']['text'] == 'tetrahedron,; simplex'


def test_cache_hash_tampering_is_fatal(tmp_path):
    raw = b'{}'
    (tmp_path / 'fact.json').write_bytes(raw)
    (tmp_path / 'manifest.json').write_text(json.dumps({'sources': [
        {'file': 'fact.json', 'extractSha256': hashlib.sha256(raw).hexdigest()}]}))
    load_cache(tmp_path)
    (tmp_path / 'fact.json').write_text('{"changed":true}')
    with pytest.raises(ValueError, match='hash mismatch'):
        load_cache(tmp_path)


def test_cache_path_escape_refused(tmp_path):
    (tmp_path / 'manifest.json').write_text(json.dumps({'sources': [
        {'file': '../escape.json', 'extractSha256': '0' * 64}]}))
    with pytest.raises(ValueError, match='escapes'):
        load_cache(tmp_path)


def test_all_cached_pins_have_original_url_date_and_digest():
    manifest, files = load_cache()
    assert len(files) > 100
    assert all(s['url'].startswith(('http://', 'https://')) and datetime.fromisoformat(s['retrievedAt']).tzinfo
               and len(s['sha256']) == 64 for s in manifest['sources'])


def test_compound_alias_is_not_a_component_identity(sources):
    record = {'key': 'example-compound', 'name': 'Six tetrahedra', 'family': 'Compounds',
              'dimension': 3, 'aliases': ['tetrahedron']}
    assert map_entry(record, sources, source_indexes(sources)) == {'acronym': None, 'page': None, 'off': None}


def test_explicit_published_alternate_acronym(sources):
    record = next(r for r in visible_catalog() if r['key'] == 'goursat-wythoff-qrigogishi')
    mapping = map_entry(record, sources, source_indexes(sources))
    assert mapping['page'] == 'klitzing/qrahi.json'
    assert face_vector(sources[mapping['page']]['data']) == record['counts']


@pytest.mark.parametrize('key,acronym', [('antiprism-u17', 'querco'), ('antiprism-u67', 'qrid')])
def test_nonconvex_great_names_do_not_select_convex_synonyms(sources, key, acronym):
    record = next(r for r in visible_catalog() if r['key'] == key)
    mapping = map_entry(record, sources, source_indexes(sources))
    assert mapping['acronym'] == acronym
    assert verify_entry(record, mapping, sources)['checks']['off-similarity']['status'] == 'match'


@pytest.mark.parametrize('key', ['tetrahedron', 'tesseract'])
def test_similarity_handles_permutation_rotation_reflection_and_scale(key):
    source = regular(key)
    target = deepcopy(source)
    n = len(target['vertices'])
    permutation = np.arange(n)[::-1]
    d = target['dimension']
    rotation, _ = np.linalg.qr(np.arange(d * d).reshape(d, d) + np.eye(d) * 8)
    target['vertices'] = (np.asarray(source['vertices'])[permutation] @ rotation * 3.4 + 7).tolist()
    inverse = np.argsort(permutation)
    target['edges'] = [[int(inverse[v]) for v in e] for e in source['edges']]
    target['faces'] = [[int(inverse[v]) for v in f] for f in source['faces']]
    receipt = similarity(source, target)
    assert receipt['status'] == 'match'
    assert receipt['maxResidual'] < 1e-12
    assert receipt['incidencePreserved']


def test_same_counts_and_points_do_not_hide_wrong_cells():
    source = regular('tesseract')
    target = deepcopy(source)
    target['cells'][0] = target['cells'][1]
    assert similarity(source, target)['status'] == 'mismatch'


def test_similarity_rejects_metric_distortion_and_reports_bound():
    source = regular('cube')
    target = deepcopy(source)
    target['vertices'][0][0] += 0.2
    assert similarity(source, target)['status'] == 'mismatch'
    assert similarity(source, source, node_limit=1)['status'] == 'not-checked'


def test_literal_stars_keep_winding_types(sources):
    source = regular('small-stellated-dodecahedron')
    checks = matrix_checks(source, sources['klitzing/sissid.json']['data'], sources)
    assert checks['face-polygon-counts'] == {'status': 'match', 'ours': {'5/2': 12}, 'outside': {'5/2': 12}}


def test_source_incidence_typo_is_exposed(sources):
    model = regular('uniform4-prism-truncated-icosahedron')
    checks = matrix_checks(model, sources['klitzing/tipe.json']['data'], sources)
    assert checks['vertex-figure-f-vector']['ours'] == [(4, 6, 4)]
    assert checks['vertex-figure-f-vector']['outside'] == [(3, 6, 4)]
    assert checks['vertex-figure-f-vector']['status'] == 'mismatch'


def test_coxeter_subgroup_order_is_external_and_snub_stays_unknown(sources):
    assert outside_group_order(sources['klitzing/cube.json']['data'], sources) == (48, 'B3')
    assert outside_group_order(sources['klitzing/snic.json']['data'], sources) is None


def test_small_native_slice_and_bounded_gaps(sources):
    record = next(r for r in visible_catalog() if r['key'] == 'tetrahedron')
    mapping = map_entry(record, sources, source_indexes(sources))
    row = verify_entry(record, mapping, sources)
    assert row['status'] == 'match'
    assert row['checks']['off-similarity']['maxResidual'] < 1e-12
    assert row['checks']['symmetry-outside-order']['ours'] == 24
    assert verify_entry(record, mapping, sources, max_vertices=1)['checks']['geometry']['status'] == 'not-checked'
    assert summary([row])['Platonic']['checked'] == 1


def test_discovery_candidates_excluded_and_cli_cannot_select_them(tmp_path):
    assert all(r['family'] != '4D discovery candidates' for r in visible_catalog())
    from engine.catalog import get_catalog
    hidden = next(r['key'] for r in get_catalog() if r['family'] == '4D discovery candidates')
    process = subprocess.run([sys.executable, str(ROOT / 'scripts/verify_external.py'), '--keys', hidden,
                              '--output', str(tmp_path / 'report.json')], capture_output=True, text=True)
    assert process.returncode == 2
    assert 'Unknown or hidden' in process.stderr
    assert not (tmp_path / 'report.json').exists()


def test_bad_matrix_syntax_is_a_gap():
    assert incidence_rows({'matrix': 'unfamiliar | notation'}, 4) == []
    assert face_vector({'Face vector': {'text': 'unknown'}}) is None


def test_stale_generated_dual_receipts_never_increase_local_mapping(monkeypatch):
    import engine.classification_qualification as qualification
    monkeypatch.setattr(qualification, 'source_pins_current', lambda _: False)
    result = dual_mapping_status(visible_catalog())
    assert result['currentPinnedGeneratedRealizations'] == 0
    assert result['distinctLocalRepresentations'] == result['crosswalkMapped']
    assert not result['releaseQualified']
