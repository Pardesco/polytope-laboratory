"""Fast mathematical regressions; the full inventory is an explicit CLI job."""

from copy import deepcopy
import json
import subprocess
import sys

import pytest

from engine.catalog import get_catalog
from engine.catalog_audit import (
    audit_model,
    expected_table,
    family_counts,
    inventory,
    read_off_literal,
    write_report,
    wythoff_counts,
)
from engine.generators import regular
from engine.uniform4 import manifest, uniform_family


@pytest.mark.parametrize(
    'family,rings,counts',
    [
        ('A3', [1, 0, 0], [4, 6, 4, 0]),
        ('B3', [1, 1, 1], [48, 72, 26, 0]),
        ('H3', [1, 0, 1], [60, 120, 62, 0]),
        ('A4', [0, 1, 0, 0], [10, 30, 30, 10]),
        ('B4', [1, 0, 0, 0], [16, 32, 24, 8]),
        ('F4', [1, 0, 0, 0], [24, 96, 96, 24]),
        ('H4', [1, 0, 0, 0], [600, 1200, 720, 120]),
        ('H4', [0, 0, 0, 1], [120, 720, 1200, 600]),
        ('H4', [1, 1, 1, 1], [14400, 28800, 17040, 2640]),
    ],
)
def test_integer_parabolic_counts(family, rings, counts):
    assert wythoff_counts(family, rings) == counts


def test_every_convex_uniform_polychoron_has_an_independent_expectation():
    table = expected_table()
    entries = manifest()['entries']
    assert len({entry['uniformIndex'] for entry in entries}) == 64
    assert all(table[entry['key']]['counts'] == entry['counts'] for entry in entries)
    assert all(table[entry['key']]['basis'] for entry in entries)


def test_all_classical_uniform_polyhedra_have_wythoff_expectations():
    from engine.catalog import _sources

    table = expected_table()
    for u in range(1, 76):
        key = f'antiprism-u{u}'
        assert table[key]['counts'] == list(_sources()[key][1]['counts'].values())
        assert 'Wythoff' in table[key]['basis'] or u == 75


@pytest.mark.parametrize(
    'key',
    [
        'tetrahedron',
        'cube',
        'snub-cube',
        'great-dodecahedron',
        'antiprism-u3',
        'antiprism-u75',
        'simplex4',
        'tesseract',
        'uniform4-rap',
        'uniform4-sadi',
        'miratope-grand-hecatonicosachoron',
        'uniform-prism-5',
        'uniform-antiprism-5',
    ],
)
def test_representative_registered_models(key):
    record = next(r for r in get_catalog() if r['key'] == key)
    report = audit_model(regular(key), record)
    failures = {k: v for k, v in report['checks'].items() if v['status'] == 'fail'}
    assert not failures
    assert report['checks']['equal_edges']['maxRelativeDeviation'] <= 1e-9
    assert report['checks']['face_planarity']['maxRelativeResidual'] <= 1e-9


@pytest.mark.parametrize(
    'kind,n,m',
    [('prism', 7, 3), ('antiprism', 7, 3), ('antiprism-prism', 5, 3), ('duoprism', 3, 5), ('duoprism', 7, 11)],
)
def test_product_families(kind, n, m):
    model = uniform_family(kind, n, m)
    report = audit_model(model)
    assert report['counts'] == family_counts(kind, n, m)
    assert report['checks']['expected_counts']['status'] == 'pass'
    assert all(c['status'] != 'fail' for c in report['checks'].values())


def test_regular_star_count_expectations_use_local_incidence():
    table = expected_table()
    stars = [r for r in get_catalog() if r.get('family') == 'Regular star']
    assert len(stars) == 10
    for row in stars:
        assert table[row['key']]['counts'] == row['counts']
        assert 'vertex-figure' in table[row['key']]['basis']


def test_distorted_cube_has_residuals_and_does_not_reconstruct_a_hull():
    model = deepcopy(regular('cube'))
    model['vertices'][0][0] += 0.1
    report = audit_model(model)
    assert report['checks']['equal_edges']['status'] == 'fail'
    assert report['checks']['equal_edges']['maxRelativeDeviation'] > 1e-3
    assert report['checks']['face_planarity']['status'] == 'fail'


def test_nonflat_cell_and_duplicate_vertices_are_detected():
    model = deepcopy(regular('tesseract'))
    model['vertices'][0][0] += 0.1
    assert audit_model(model)['checks']['cell_flatness']['status'] == 'fail'
    model = deepcopy(regular('cube'))
    model['vertices'][1] = model['vertices'][0][:]
    duplicate = audit_model(model)['checks']['duplicate_vertices']
    assert duplicate['status'] == 'fail' and duplicate['literalDuplicateCount'] == 1


def test_missing_ridge_and_changed_vertex_signature_are_detected():
    model = deepcopy(regular('cube'))
    model['faces'].pop()
    report = audit_model(model)
    assert report['checks']['ridge_incidence']['status'] == 'fail'
    assert report['checks']['euler']['status'] == 'fail'
    assert report['checks']['vertex_figures']['status'] == 'fail'


def test_generalized_euler_and_nonorientability_are_not_spherical_claims():
    model = regular('antiprism-u3')
    report = audit_model(model)
    assert report['checks']['euler']['actual'] == 0
    assert report['checks']['euler']['status'] == 'not-applicable'
    assert 'not sufficient' in report['checks']['vertex_figures']['definition']


def test_nonorientable_generalized_boundary_is_reported_without_repair():
    from itertools import combinations

    # Suspension of the six-vertex projective-plane triangulation.
    projective = [
        (0, 1, 2),
        (0, 1, 3),
        (0, 2, 4),
        (0, 3, 5),
        (0, 4, 5),
        (1, 2, 5),
        (1, 3, 4),
        (1, 4, 5),
        (2, 3, 4),
        (2, 3, 5),
    ]
    tetrahedra = [(*f, v) for f in projective for v in (6, 7)]
    faces = sorted({tuple(sorted(f)) for tet in tetrahedra for f in combinations(tet, 3)})
    lookup = {f: i for i, f in enumerate(faces)}
    cells = [[lookup[tuple(sorted(f))] for f in combinations(tet, 3)] for tet in tetrahedra]
    edges = sorted({e for f in faces for e in combinations(f, 2)})
    import numpy as np

    points = np.random.default_rng(1).normal(size=(8, 4)).tolist()
    model = {
        'dimension': 4,
        'vertices': points,
        'edges': [list(e) for e in edges],
        'faces': [list(f) for f in faces],
        'cells': cells,
        'interpretation': 'generalized-complex',
    }
    orientation = audit_model(model)['checks']['orientation']
    assert orientation['status'] == 'not-applicable' and not orientation['orientable']


def test_source_cycles_can_be_reversed_without_changing_orientability():
    model = deepcopy(regular('cube'))
    model['faces'][0].reverse()
    orientation = audit_model(model)['checks']['orientation']
    assert orientation['status'] == 'pass' and orientation['orientable']
    assert orientation['storedCycleConflicts'] > 0


def test_invalid_incidence_is_reported_before_indexing():
    model = deepcopy(regular('cube'))
    model['faces'][0][0] = 1000
    report = audit_model(model)
    assert report['checks']['incidence']['status'] == 'fail'
    assert report['checks']['face_planarity']['status'] == 'not-applicable'


def test_literal_reader_audits_degenerate_data_without_qhull(tmp_path, monkeypatch):
    import scipy.spatial

    monkeypatch.setattr(scipy.spatial, 'ConvexHull', lambda *a, **k: pytest.fail('Qhull called'))
    path = tmp_path / 'flat.off'
    path.write_text('OFF\n4 1 4\n0 0 0\n1 0 0\n1 1 0\n0 1 0\n4 0 1 2 3\n')
    model, sha = read_off_literal(path)
    assert len(sha) == 64 and len(model['edges']) == 4
    report = audit_model(model)
    assert report['checks']['face_planarity']['status'] == 'pass'
    assert report['checks']['ridge_incidence']['status'] == 'fail'


def test_literal_header_mismatch_does_not_hide_geometric_residuals(tmp_path):
    path = tmp_path / 'bad-count.off'
    path.write_text('OFF\n4 1 8\n0 0 0\n1 0 0\n1 1 .1\n0 1 0\n4 0 1 2 3\n')
    model, _ = read_off_literal(path)
    checks = audit_model(model)['checks']
    assert checks['source_header']['status'] == 'fail'
    assert checks['source_header']['declaredEdges'] == 8 and checks['source_header']['actualEdges'] == 4
    assert checks['face_planarity']['status'] == 'fail'


def test_qhull_guard_refuses_degenerate_input_before_native_code(monkeypatch):
    import numpy as np
    import scipy.spatial
    import engine.geometry as geometry
    from engine.catalog_audit import _safe_hulls

    if sys.platform == 'win32':
        import ctypes

        monkeypatch.setattr(ctypes.windll.kernel32, 'SetErrorMode', lambda flags: 0)
    calls = []

    def native(points, *args, **kwargs):
        calls.append(points)
        return 'native-result'

    monkeypatch.setattr(scipy.spatial, 'ConvexHull', native)
    monkeypatch.setattr(geometry, 'ConvexHull', native)
    _safe_hulls()
    with pytest.raises(geometry.GeometryError, match='degenerate'):
        scipy.spatial.ConvexHull(np.zeros((4, 3)))
    assert not calls
    assert geometry.ConvexHull([[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]]) == 'native-result'
    assert len(calls) == 1


def test_proven_correction_copy_preserves_used_geometry_colors_and_original(tmp_path):
    from engine.catalog_audit import repair_unused_duplicates
    from engine.formats import export_off, parse_off

    model = deepcopy(regular('cube'))
    model['vertices'].append(model['vertices'][0][:])
    colors = [{'encoding': 'byte', 'values': [23, 40, 80, 150]} for _ in model['faces']]
    model['metadata']['offColors'] = {'faces': colors, 'cells': []}
    path = tmp_path / 'unused.off'
    path.write_text(export_off(model), encoding='utf-8')
    before = path.read_bytes()
    literal, _ = read_off_literal(path)
    text, evidence = repair_unused_duplicates(path, literal, {'key': 'cube', 'counts': [8, 12, 6, 0]})
    repaired = parse_off(text)
    assert evidence['removedCount'] == 1 and evidence['removedVertexIds'] == [8]
    assert evidence['afterCounts'] == [8, 12, 6, 0] and evidence['usedCoordinateResidual'] == 0.0
    assert repaired['metadata']['offColors']['faces'] == colors
    assert repaired['vertices'] == model['vertices'][:8]
    assert repaired['faces'] == model['faces'] and path.read_bytes() == before
    assert evidence['appImporterPassed'] and all(c['status'] != 'fail' for c in evidence['afterChecks'].values())
    assert repair_unused_duplicates(path, literal, {}) is None
    literal['vertices'][-1] = [100.0, 100.0, 100.0]
    assert repair_unused_duplicates(path, literal, {'key': 'cube'}) is None


def test_cli_checkpoint_resume_and_source_change_refusal(tmp_path, monkeypatch):
    import engine.catalog_audit as audit

    monkeypatch.setattr(audit, 'inventory', lambda *a: [{'id': 'cube', 'kind': 'catalog'}])
    monkeypatch.setattr(audit, 'source_digest', lambda: 'a' * 64)
    row = {'id': 'cube', 'kind': 'catalog', 'status': 'pass', **audit_model(regular('cube'))}
    calls = []

    class LocalWorker:
        def __init__(self, *a):
            pass

        def run(self, item):
            calls.append(item)
            return row

        def close(self):
            pass

    monkeypatch.setattr(audit, 'Worker', LocalWorker)
    args = ['--output', str(tmp_path), '--jobs', '1', '--keys', 'cube']
    assert audit.main(args) == 0
    assert audit.main(args + ['--resume']) == 0
    assert len(calls) == 1
    assert len((tmp_path / 'checkpoint.jsonl').read_text().splitlines()) == 2
    monkeypatch.setattr(audit, 'source_digest', lambda: 'b' * 64)
    with pytest.raises(SystemExit) as error:
        audit.main(args + ['--resume'])
    assert error.value.code == 2


def test_inventory_includes_every_registered_model_and_bundled_off_asset():
    from engine.catalog_audit import ROOT

    records = inventory()
    assert {r['id'] for r in records if r['kind'] == 'catalog'} == {r['key'] for r in get_catalog()}
    assert {r['id'] for r in records if r['kind'] == 'asset'} == {
        p.relative_to(ROOT).as_posix() for p in (ROOT / 'data').rglob('*') if p.is_file() and p.suffix.lower() == '.off'
    }
    assert len({r['id'] for r in records}) == len(records)


def test_report_serializes_statuses_and_independent_table(tmp_path):
    row = {'id': 'cube', 'kind': 'catalog', 'status': 'pass', **audit_model(regular('cube'))}
    report = write_report(tmp_path, [row], [{'id': 'cube'}])
    stored = json.loads((tmp_path / 'report.json').read_text(encoding='utf-8'))
    assert stored == json.loads(json.dumps(report))
    assert stored['complete'] and stored['totals'] == {'pass': 1}
    assert stored['expectedCountTable']['cube']['counts'] == [8, 12, 6, 0]
    assert '| face_planarity | 1 | 0 | 0 |' in (tmp_path / 'summary.md').read_text()


@pytest.mark.parametrize(
    'script,timeout,reason', [('import time; time.sleep(30)', 0.1, 'exceeded'), ('raise SystemExit(7)', 5, 'exited')]
)
def test_worker_timeout_and_crash_leave_a_reviewable_failure(monkeypatch, script, timeout, reason):
    from engine.catalog_audit import Worker

    original = subprocess.Popen

    def launch(*args, **kwargs):
        return original([sys.executable, '-c', script], **kwargs)

    monkeypatch.setattr(subprocess, 'Popen', launch)
    worker = Worker(timeout)
    row = worker.run({'id': 'test', 'kind': 'catalog'})
    assert row['status'] == 'fail' and reason in row['checks']['load']['error']
    assert row['checks']['euler']['status'] == 'not-applicable'
    assert worker.process is None
