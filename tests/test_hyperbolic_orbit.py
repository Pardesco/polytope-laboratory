"""Counts pinned to Celińska-Kopczyńska–Kopczyński, arXiv:2208.13816 Table 2.

No generating functions for the last three rows are inferred from these counts.
"""

from copy import deepcopy
import hashlib
import json

import numpy as np
import pytest

from engine.geometry import GeometryError
from engine.hyperbolic import (
    J,
    PRESETS,
    DEVELOPMENT_RELATIVE_GATE,
    boost,
    matrix_metric_residual,
    point_metric_residual,
)
from engine.hyperbolic_orbit import (
    Development,
    DevelopmentResidualError,
    DEFAULT_BUDGET,
    HARD_LIMITS,
    budget_options,
    estimated_bytes,
)
import engine.hyperbolic_orbit as orbit

PUBLISHED_RINGS = {
    (5, 3, 4): [1, 12, 102, 812],
    (4, 3, 5): [1, 6, 30, 126],
    (5, 3, 5): [1, 12, 132, 1392],
    (3, 5, 3): [1, 20, 260, 3212],
}


def test_published_constants_byte_pin():
    text = json.dumps(
        {','.join(map(str, k)): v for k, v in PUBLISHED_RINGS.items()}, sort_keys=True, separators=(',', ':')
    )
    # Hash of the transcribed constants, not a claim to have fetched the PDF.
    assert (
        hashlib.sha256(text.encode()).hexdigest() == '928f9d3d5ff88d5f9483a71867afe5f43a67436d1062a955d0fe86597f9520e9'
    )


def finish(d, budget=None):
    pages = []
    while True:
        page = d.page(budget)
        pages.append(page)
        assert len(page['instances']) <= 256
        if page['checkpoint'] is None:
            return pages


@pytest.mark.parametrize('pqr,expected', PUBLISHED_RINGS.items())
def test_uncropped_face_adjacency_rings(pqr, expected):
    d = Development(pqr, mode='complete-depth')
    pages = finish(d)
    final = pages[-1]
    assert final['coverage']['ringCounts'] == expected
    assert final['coverage']['completedLayers'] == [0, 1, 2, 3]
    assert final['coverage']['stopReason'] == 'depthComplete'
    ids = [row['id'] for page in pages for row in page['instances']]
    assert ids == list(range(sum(expected)))
    assert [len(word) for word in d.words] == sorted(map(len, d.words))
    assert d.residuals['coordinates'] <= 1e-8
    assert d.residuals['transformMetric'] <= 1e-8
    assert d.residuals['mergeDiscrepancy'] <= 1e-8
    assert d.residuals['edgeRelativeSpread'] <= 1e-7


def test_534_independent_rational_growth_series_expansion():
    # Formal power-series division of (1+t)^3/(1-9t+9t²-t³).
    numerator, denominator = [1, 3, 3, 1], [1, -9, 9, -1]
    coefficients = []
    for n in range(4):
        coefficients.append(numerator[n] - sum(denominator[k] * coefficients[n - k] for k in range(1, n + 1)))
    assert coefficients == PUBLISHED_RINGS[(5, 3, 4)]
    assert finish(Development([5, 3, 4], mode='complete-depth'))[-1]['coverage']['ringCounts'] == coefficients


def test_merges_retain_full_nontrivial_vertex_and_face_correspondence():
    d = Development([4, 3, 5], mode='complete-depth')
    finish(d)
    assert any(link['vertexPermutation'] != list(range(8)) for link in d.links.values())
    for (cell, face), link in d.links.items():
        candidate = d.matrices[cell] @ d.generators[face]
        target = d.matrices[link['toCell']]
        a = (candidate @ d.vertices.T).T
        b = (target @ d.vertices[link['vertexPermutation']].T).T
        assert np.max(np.abs(a - b)) < 1e-8
        assert {link['vertexPermutation'][i] for i in d.template['faces'][face]} == set(
            d.template['faces'][link['toFace']]
        )


def test_rounded_bucket_is_not_identity_and_checks_adjacent_buckets():
    d = Development([5, 3, 4])
    target, permutation = d._match(boost([-1, 0, 0], 1e-12))
    assert target == 0 and permutation == list(range(20))
    # Same rounded bucket, measurably different center: never silently merge.
    with pytest.raises(GeometryError, match='Near-coincident'):
        d._match(boost([1, 0, 0], 1e-6))
    # Same center but a spatial rotation not preserving the template is rejected.
    m = np.eye(4)
    angle = 0.01
    m[1:3, 1:3] = [[np.cos(angle), -np.sin(angle)], [np.sin(angle), np.cos(angle)]]
    with pytest.raises(GeometryError, match='correspondence'):
        d._match(m)


def test_radius_patch_exhausts_all_cells_intersecting_the_observer_ball():
    d = Development([5, 3, 4], radius=0.1, mode='radius')
    pages = finish(d)
    assert pages[-1]['coverage']['complete']
    assert pages[-1]['coverage']['acceptedCells'] == 1
    assert sum(len(p['instances']) for p in pages) == 1
    assert all(not p['coverage']['sampled'] for p in pages)


@pytest.mark.parametrize(
    'budget,reason',
    [
        ({'maxCells': 2}, 'cellLimit'),
        ({'maxCandidates': 2}, 'candidateLimit'),
        ({'maxBytes': estimated_bytes(1, 0)}, 'memoryLimit'),
    ],
)
def test_cumulative_resource_caps(budget, reason):
    page = Development([5, 3, 4]).page(budget)
    assert page['coverage']['stopReason'] == reason
    assert page['checkpoint'] is None and not page['coverage']['resumable']
    opts = budget_options(budget)
    assert page['coverage']['acceptedCells'] <= opts['maxCells']
    assert page['coverage']['visitedCandidates'] <= opts['maxCandidates']
    assert page['coverage']['estimatedBytes'] <= opts['maxBytes']


def test_hard_cell_cap_4096_without_developing_unstable_distant_geometry():
    assert HARD_LIMITS['maxCells'] == 4096
    assert HARD_LIMITS['maxCandidates'] == 50000
    assert HARD_LIMITS['maxBytes'] == 256 * 1024**2
    assert HARD_LIMITS['timeMs'] == 2000
    page = finish(Development([4, 3, 5], depth=12, mode='complete-depth'))[-1]
    assert page['coverage']['acceptedCells'] == 4096
    assert page['coverage']['stopReason'] == 'cellLimit'
    assert not page['coverage']['resumable']


def test_page_work_time_and_depth_caps():
    d = Development([5, 3, 4])
    page = d.page({'pageSize': 3})
    assert len(page['instances']) == 3 and page['coverage']['stopReason'] == 'pageLimit'
    assert page['coverage']['resumable']
    page = Development([5, 3, 4]).page({'candidatesPerPage': 2})
    assert page['coverage']['visitedCandidates'] == 2
    assert page['coverage']['stopReason'] == 'workPageLimit'
    ticks = iter([0, 3])
    page = Development([5, 3, 4]).page(clock=lambda: next(ticks))
    assert page['coverage']['stopReason'] == 'timeLimit' and page['coverage']['resumable']
    page = Development([5, 3, 4], depth=0, mode='complete-depth').page()
    assert page['coverage']['completedLayers'] == [0]
    assert page['coverage']['stopReason'] == 'depthComplete'
    assert len(page['instances']) == 1


def test_neighbor_bytes_page_cap_is_resumable(monkeypatch):
    monkeypatch.setattr(orbit, 'MAX_NEIGHBOR_UPDATES', 2)
    page = Development([5, 3, 4]).page()
    assert page['coverage']['stopReason'] == 'bytePageLimit'
    assert page['coverage']['resumable'] and page['checkpoint'] is not None


def test_checkpoint_replay_after_cancel_preserves_ids_pages_and_permutations():
    original = Development([4, 3, 5], mode='complete-depth')
    budget = budget_options({'candidatesPerPage': 30})
    checkpoint = original.page(budget)['checkpoint']
    checkpoint = json.loads(json.dumps(checkpoint))
    resumed = Development([4, 3, 5], mode='complete-depth')
    resumed.restore(checkpoint, budget)
    assert resumed.page(budget) == original.page(budget)
    assert resumed.links == original.links


@pytest.mark.parametrize(
    'field,value',
    [
        ('words', [[0]]),
        ('types', [1]),
        ('next', [4, 5]),
        ('next', [False, 0]),
        ('candidates', -1),
        ('published', 999),
        ('published', 0),
    ],
)
def test_untrusted_checkpoint_rejected(field, value):
    d = Development([4, 3, 5])
    cp = deepcopy(d.page({'candidatesPerPage': 3})['checkpoint'])
    cp[field] = value
    with pytest.raises(GeometryError):
        Development([4, 3, 5]).restore(cp, budget_options({'candidatesPerPage': 3}))


def test_failed_residual_rebuild_refuses_entire_page_and_replay_deadline_is_bounded():
    d = Development([5, 3, 4])
    d.generators[0] *= 1.01
    with pytest.raises(GeometryError, match='residual gate'):
        d.page()
    cp = Development([5, 3, 4]).page({'candidatesPerPage': 3})['checkpoint']
    with pytest.raises(GeometryError, match='time limit'):
        Development([5, 3, 4]).restore(cp, DEFAULT_BUDGET, deadline=0, clock=lambda: 1)


def test_small_transform_drift_is_repaired_and_every_correction_is_reported():
    d = Development([5, 3, 4])
    drifted = d.generators[0] + 1e-13
    repaired = d._checked(drifted, [0])
    assert np.max(np.abs(repaired.T @ J @ repaired - J)) < np.max(np.abs(drifted.T @ J @ drifted - J))
    assert d.residuals['transformMetricBeforeRepair'] > d.residuals['transformMetric']
    assert d.residuals['coordinatesBeforeRepair'] > 0
    assert d.residuals['transformCorrection'] > 0
    assert d.residuals['pointCorrection'] > 0
    assert d.residuals['coordinatesBeforeNormalization'] <= 1e-8
    assert d.residuals['coordinatesNormalized'] <= 1e-8
    assert d.residuals['coordinates'] <= 1e-8
    assert d.residuals['transformMetric'] <= 1e-8


def test_pre_correction_error_is_gated_and_cannot_be_normalized_away():
    d = Development([5, 3, 4])
    before = dict(d.residuals)
    with pytest.raises(DevelopmentResidualError) as caught:
        d._checked(d.generators[0] + 1e-5, [0])
    diagnostics = caught.value.diagnostics
    assert diagnostics['coordinatesBeforeRepair'] > 1e-8
    assert diagnostics['coordinatesNormalized'] is None
    assert diagnostics['pointCorrection'] == 0
    assert diagnostics['transformCorrection'] == 0
    assert d.residuals == before  # failed samples are not accepted receipts


def test_repair_cannot_hide_an_over_gate_point_before_normalization(monkeypatch):
    d = Development([5, 3, 4])
    monkeypatch.setattr(orbit, 'repair_frame', lambda matrix, length: matrix + 1e-5)
    with pytest.raises(DevelopmentResidualError) as caught:
        d._checked(d.generators[0], [0])
    diagnostics = caught.value.diagnostics
    assert diagnostics['coordinatesBeforeRepair'] < 1e-8
    assert diagnostics['transformCorrectionRelative'] > DEVELOPMENT_RELATIVE_GATE
    assert diagnostics['coordinatesNormalized'] is None
    assert diagnostics['pointCorrection'] == 0
    assert diagnostics['transformCorrection'] > 0


def test_large_t_genuine_point_corruption_is_rejected_before_correction():
    d = Development([5, 3, 5])
    matrix = boost([0.7, -0.4, 0.6], 8)
    points = (matrix @ d.vertices.T).T
    assert point_metric_residual(points)['relative'] <= DEVELOPMENT_RELATIVE_GATE
    points[0, 0] *= 1 + 1e-6
    corrupted = point_metric_residual(points)
    assert corrupted['relative'] > 1e-7
    assert corrupted['scale'] > 1000
    matrix[0, :] *= 1 + 1e-6
    with pytest.raises(DevelopmentResidualError) as caught:
        d._checked(matrix, [])
    assert caught.value.diagnostics['coordinatesBeforeRepairRelative'] > DEVELOPMENT_RELATIVE_GATE
    assert caught.value.diagnostics['coordinatesNormalized'] is None


@pytest.mark.parametrize('pqr', PRESETS)
def test_depth_four_presets_publish_under_the_recorded_relative_gates(pqr):
    d = Development(pqr, depth=4, mode='complete-depth')
    pages = finish(d)
    page = pages[-1]
    assert page['coverage']['stopReason'] == ('depthComplete' if pqr == (4, 3, 5) else 'cellLimit')
    assert any(len(instance['word']) == 4 for page in pages for instance in page['instances'])
    for key in (
        'coordinates',
        'coordinatesBeforeRepair',
        'coordinatesBeforeNormalization',
        'coordinatesNormalized',
        'transformMetricBeforeRepair',
        'transformMetric',
        'transformCorrection',
        'mergeDiscrepancy',
    ):
        assert d.residuals[key + 'Relative'] <= DEVELOPMENT_RELATIVE_GATE
        assert d.residuals[key + 'Scale'] >= 1
        assert d.residuals[key] >= 0
    if pqr == (5, 3, 5):
        assert d.residuals['coordinates'] > 1e-8  # absolute error remains visible
        assert d.residuals['maxVertexTime'] > 8000
    assert d.residuals['edgeRelativeSpread'] <= 1e-7
    for matrix, word in zip(d.matrices, d.words):
        assert matrix_metric_residual(matrix)['relative'] <= DEVELOPMENT_RELATIVE_GATE
        assert matrix[0, 0] >= 1 - 1e-12
        assert np.sign(np.linalg.det(matrix)) == (-1) ** len(word)


def test_nearby_accepted_prefix_and_cold_word_replay_agree():
    d = Development([4, 3, 5], depth=3)
    finish(d)
    word = d.words[-1] + [0]
    warm = d._transform(word)
    cold = Development([4, 3, 5])._transform(word)
    np.testing.assert_allclose(warm, cold, atol=1e-12, rtol=0)


@pytest.mark.parametrize('key', HARD_LIMITS)
def test_budget_cannot_raise_hard_cap(key):
    with pytest.raises(GeometryError):
        budget_options({key: HARD_LIMITS[key] + 1})
    with pytest.raises(GeometryError):
        budget_options({key: 0})


def test_minimum_memory_and_unknown_budget_rejected():
    with pytest.raises(GeometryError):
        budget_options({'maxBytes': 1})
    with pytest.raises(GeometryError):
        budget_options({'unknown': 1})
