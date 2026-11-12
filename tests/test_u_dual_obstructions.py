from collections import Counter, defaultdict
from copy import deepcopy
import importlib.util
import json
from pathlib import Path
from unittest.mock import patch
import numpy as np
import pytest
from engine.classification_qualification import binding, manifest as r7_manifest
from engine.generators import regular
from engine.geometry import GeometryError
from engine.server import dispatch
from engine.u_dual_obstructions import DATA, NUMBERS, diagnose, manifest, pins_current, report

ROOT = Path(__file__).resolve().parents[1]
ROWS = manifest()['entries']


@pytest.mark.parametrize('row', ROWS, ids=lambda r: r['id'])
def test_all_thirteen_named_receipts_recheck_without_finite_model_or_qualification(row):
    result = dispatch({'op': 'u-dual-obstructions', 'params': {'id': row['id'], 'verify': True}})
    assert result['sourcePinsCurrent']
    assert result['entry']['status'] == 'obstruction-confirmed'
    assert result['verification'] == row['receipt']
    assert not result['verification']['finiteModelAvailable']
    assert not result['verification']['certified'] and not result['releaseQualified']
    source = regular(row['sourceKey'])
    assert result['verification']['source'] == binding(source)
    v, e, f, _ = row['expected']['counts']
    assert result['verification']['abstractDualCounts'] == [f, e, v, 0]
    for key in ('eulerCharacteristic', 'orientable', 'genus'):
        assert result['verification']['abstractDualTopology'][key] == row['expected'][key]


@pytest.mark.parametrize('row', ROWS, ids=lambda r: r['id'])
def test_plane_witnesses_independently_match_literal_cycles_polarity_and_coincidences(row):
    result = report({'id': row['id'], 'verify': True})
    w = result['witnesses']
    r = result['verification']
    source = regular(row['sourceKey'])
    p = np.asarray(source['vertices']) - r['center']
    assert w['geometryModel'] is False and w['sourceFaceCycles'] == source['faces']
    assert w['sourceEdges'] == source['edges']
    q = np.asarray([plane['homogeneous'] for plane in w['planes']])
    expected_ideal = []
    for plane, cycle in zip(w['planes'], source['faces']):
        n = np.asarray(plane['normal'])
        d = plane['offset']
        f = plane['sourceFace']
        assert plane['sourceCycle'] == cycle and abs(np.linalg.norm(n) - 1) < 1e-12
        assert np.max(abs(p[cycle] @ n - d)) < 1e-12
        assert np.max(abs(p[cycle] @ q[f, :3] - q[f, 3])) < 1e-12
        if abs(d) <= r['idealTolerance']:
            expected_ideal.append(f)
    assert expected_ideal == r['idealFaceIds']
    pairs = [
        (a, b)
        for a in range(len(q))
        for b in range(a + 1, len(q))
        if min(np.linalg.norm(q[a] - q[b]), np.linalg.norm(q[a] + q[b])) <= r['coincidenceTolerance']
    ]
    assert pairs == sorted(tuple(g) for g in r['coincidentPlaneGroups'])
    edge_faces = defaultdict(list)
    for f, cycle in enumerate(source['faces']):
        for a, b in zip(cycle, cycle[1:] + cycle[:1]):
            edge_faces[tuple(sorted((a, b)))].append(f)
    for i, cycle in enumerate(w['dualFaceCycles']):
        assert set(cycle) == {f for f, c in enumerate(source['faces']) if i in c}
        assert all(
            sorted((a, b)) in [sorted(fs) for edge, fs in edge_faces.items() if i in edge]
            for a, b in zip(cycle, cycle[1:] + cycle[:1])
        )
    for link in w['dualEdgeSourceLinks']:
        assert link['dualVertices'] == edge_faces[tuple(sorted(source['edges'][link['sourceEdge']]))]
    assert len(w['planes']) == len(source['faces'])


def test_provider_is_disjoint_from_forty_round_seven_successes_and_does_not_rewrite_aggregates():
    previous = [r for r in r7_manifest('3d')['entries'] if r['kind'] == 'dual']
    assert {r['id'] for r in ROWS} == {r['id'] for r in previous if r['receipt']['status'] != 'numerical-pass'}
    assert len(ROWS) == 13 and len({r['scenarioId'] for r in ROWS}) == 13
    assert {int(r['id'].split('U')[-1]) for r in ROWS} == set(NUMBERS)
    assert all(r['sourceIdentity'] == 'U' + str(n) for n, r in zip(NUMBERS, ROWS))
    assert all('generatedKey' not in r for r in ROWS)
    crosswalk = json.loads((ROOT / 'engine/catalog_data/corpus_reconciliation.json').read_text())
    assert all(r['qualification'] is None for r in crosswalk['identities'])


def test_u75_reports_both_failures_and_retains_coincident_ideal_identities():
    r = report({'id': 'dual3:U75', 'verify': True})
    assert r['verification']['obstructions'] == ['center-plane-singularity', 'coincident-reciprocal-planes']
    assert len(r['verification']['centerPlaneFaceIds']) == 60
    assert len(r['verification']['coincidentPlaneGroups']) == 62
    assert len(r['witnesses']['planes']) == 124
    q = r['witnesses']['planes']
    assert q[40]['homogeneous'] == pytest.approx(q[89]['homogeneous'], abs=1e-12)
    assert q[40]['sourceFace'] != q[89]['sourceFace'] and q[40]['kind'] == 'ideal-numerical'


def test_star_winding_fixture_detects_angular_sorting_or_replacement():
    row = next(r for r in ROWS if r['id'] == 'dual3:U70')
    source = regular(row['sourceKey'])
    changed = deepcopy(source)
    assert row['expected']['polygons'] == [[5, 2, 12], [10, 3, 6]]
    points = np.asarray(source['vertices'])
    for i, face in enumerate(source['faces']):
        if len(face) != 5:
            continue
        cloud = points[face]
        cloud = cloud - cloud.mean(0)
        _, _, vt = np.linalg.svd(cloud, full_matrices=False)
        xy = cloud @ vt[:2].T
        order = np.argsort(np.arctan2(xy[:, 1], xy[:, 0]))
        changed['faces'][i] = [face[k] for k in order]
    assert binding(source)['coordinatesSha256'] == binding(changed)['coordinatesSha256']
    assert binding(source)['incidenceSha256'] != binding(changed)['incidenceSha256']
    with pytest.raises(GeometryError):
        diagnose(changed, row['expected'])


def test_source_binding_drift_and_missing_pins_revoke_current_checks():
    row = ROWS[0]
    source = deepcopy(regular(row['sourceKey']))
    source['faces'][0] = source['faces'][0][1:] + source['faces'][0][:1]
    with patch('engine.generators.regular', return_value=source):
        result = report({'id': row['id'], 'verify': True})
        assert result['entry']['status'] == 'unresolved' and 'binding changed' in result['verification']['reason']
        assert 'witnesses' not in result
    changed = deepcopy(manifest())
    changed['sourcePins'][next(iter(changed['sourcePins']))] = '0' * 64
    assert not pins_current(changed)
    with patch('engine.u_dual_obstructions.pins_current', return_value=False):
        assert report()['entries'][0]['status'] == 'stale-provider'
        with pytest.raises(GeometryError, match='pins changed'):
            report({'id': row['id'], 'verify': True})


@pytest.mark.parametrize(
    'params',
    [
        [],
        {'id': 75},
        {'id': 'dual3:U13'},
        {'id': 'dual3:U999'},
        {'verify': True},
        {'verify': 1},
        {'path': 'outside.off'},
        {'center': [1, 0, 0]},
    ],
)
def test_boundary_refuses_other_tranches_paths_and_shifted_poles(params):
    with pytest.raises(GeometryError):
        dispatch({'op': 'u-dual-obstructions', 'params': params})


def test_arbitrary_model_and_unknown_top_level_options_are_refused():
    for extra in ({'model': regular('cube')}, {'path': 'outside.off'}):
        with pytest.raises(GeometryError):
            dispatch({'op': 'u-dual-obstructions', **extra})


def test_regeneration_is_deterministic_and_source_assets_are_individually_pinned():
    spec = importlib.util.spec_from_file_location('u_dual_builder', ROOT / 'scripts/build-u-dual-obstructions.py')
    builder = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(builder)
    assert builder.build() == manifest()
    value = manifest()
    assert pins_current(value)
    assert len(value['sourcePins']) == 28
    for row in ROWS:
        assert value['sourcePins']['catalog_data/antiprism/' + row['sourceAsset']] == row['adaptedSha256']
        assert value['sourcePins']['catalog_data/antiprism/' + row['originalSourceAsset']] == row['sourceSha256']
    assert report()['entries'][0]['status'] == 'recorded-unchecked'
