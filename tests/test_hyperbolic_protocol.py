from copy import deepcopy

import numpy as np
import pytest

from engine.geometry import GeometryError
from engine.hyperbolic import PRESETS, J, DEVELOPMENT_RELATIVE_GATE, boost, matrix_metric_residual
from engine.hyperbolic_orbit import Development
import engine.hyperbolic_protocol as protocol


def request(pqr=(5, 3, 4), **kwargs):
    return {'source': {'type': 'honeycomb', 'pqr': list(pqr), 'rings': [1, 0, 0, 0]}, **kwargs}


@pytest.fixture(autouse=True)
def empty_cache():
    protocol.clear_cache()
    yield
    protocol.clear_cache()


@pytest.mark.parametrize('pqr', PRESETS)
def test_create_analyze_validate_and_page_contract(pqr):
    params = request(pqr)
    descriptor = protocol.handle('hyperbolic-create', params)
    assert descriptor['kind'] == 'hyperbolic-space'
    assert descriptor['dimension'] == 3 and descriptor['coordinateDimension'] == 4
    assert descriptor['source'] == params['source'] and descriptor['curvature'] == -1
    assert len(protocol._json(descriptor['anchorPatch'])) <= 1024**2
    assert descriptor['provenance']['coordinateArithmetic'] == 'float64 approximation'
    result = protocol.handle('hyperbolic-validate', {**params, 'descriptor': descriptor})
    assert result['valid'] and result['approximate'] and not result['coverageReceiptTrusted']
    analysis = protocol.handle('hyperbolic-analyze', params)
    assert analysis['cellsPerEdge'] == pqr[2]
    assert analysis['edgeRelativeSpread'] < 1e-7
    page = descriptor['anchorPatch']
    assert set(page) == {
        'sourceHash',
        'epoch',
        'anchorHash',
        'templates',
        'instances',
        'neighbors',
        'coverage',
        'residuals',
        'nextCursor',
    }
    assert len(page['instances']) <= 256 and len(protocol._json(page)) < 4 * 1024**2
    assert any(row['toCell'] is None and row['status'] in ('unexpanded', 'outsideBall') for row in page['neighbors'])


def test_cancel_worker_restart_resume_and_byte_identical_determinism():
    params = request((4, 3, 5), mode='complete-depth', budget={'candidatesPerPage': 10}, epoch='generation-2')
    first = protocol.handle('hyperbolic-patch', params)
    a = protocol._json(first)
    protocol.clear_cache()
    assert protocol._json(protocol.handle('hyperbolic-patch', params)) == a
    ids = [i['id'] for i in first['instances']]
    page = first
    while page['nextCursor']:
        resumed = {**params, 'cursor': page['nextCursor']}
        protocol.clear_cache()  # every page may use a different native worker
        page = protocol.handle('hyperbolic-patch', resumed)
        expected = protocol._json(page)
        protocol.clear_cache()
        assert protocol._json(protocol.handle('hyperbolic-patch', resumed)) == expected
        ids.extend(i['id'] for i in page['instances'])
    assert ids == list(range(163))
    assert page['coverage']['ringCounts'] == [1, 6, 30, 126]


@pytest.mark.parametrize('change', ['source', 'anchor', 'budget', 'epoch', 'radius', 'depth', 'mode'])
def test_cursor_bound_to_all_generation_inputs(change):
    params = request(budget={'candidatesPerPage': 3})
    page = protocol.handle('hyperbolic-patch', params)
    changed = {**params, 'cursor': page['nextCursor']}
    values = {
        'source': request((4, 3, 5))['source'],
        'anchor': {'word': [0]},
        'budget': {'candidatesPerPage': 4},
        'epoch': 2,
        'radius': 1.5,
        'depth': 2,
        'mode': 'complete-depth',
    }
    changed[change] = values[change]
    with pytest.raises(GeometryError, match='binding'):
        protocol.handle('hyperbolic-patch', changed)


def test_corrupted_cursor_and_rehashed_forged_bfs_prefix_are_rejected():
    params = request(budget={'candidatesPerPage': 3})
    cursor = protocol.handle('hyperbolic-patch', params)['nextCursor']
    cursor['state']['words'][0] = [0]
    with pytest.raises(GeometryError, match='checksum'):
        protocol.handle('hyperbolic-patch', {**params, 'cursor': cursor})
    cursor['checksum'] = protocol._hash({k: v for k, v in cursor.items() if k != 'checksum'})
    with pytest.raises(GeometryError, match='BFS prefix'):
        protocol.handle('hyperbolic-patch', {**params, 'cursor': cursor})
    cursor['state']['words'][0] = [0] * 257
    cursor['checksum'] = protocol._hash({k: v for k, v in cursor.items() if k != 'checksum'})
    with pytest.raises(GeometryError, match='generator word'):
        protocol.handle('hyperbolic-patch', {**params, 'cursor': cursor})


@pytest.mark.parametrize(
    'kwargs',
    [
        {'depth': 13},
        {'depth': True},
        {'depth': -1},
        {'radius': 5.01},
        {'radius': -1},
        {'epoch': ''},
        {'epoch': -1},
        {'epoch': True},
        {'radius': float('nan')},
        {'mode': 'ball'},
        {'anchor': {'word': [0] * 257}},
        {'anchor': {'word': [-1]}},
        {'anchor': {'observerMatrix': [0] * 16}},
        {'anchor': {'observerMatrix': [1] * 17}},
        {'anchor': {'observerMatrix': [float('inf')] * 16}},
        {'anchor': {'observerMatrix': np.diag([1, -1, 1, 1]).ravel().tolist()}},
        {'source': {'type': 'honeycomb', 'pqr': [6, 3, 3]}},
        {'source': {'type': 'honeycomb', 'pqr': [5, 3, 4], 'rings': [1, 1, 0, 0]}},
        {'budget': {'pageSize': 257}},
        {'surprise': 1},
    ],
)
def test_reject_invalid_or_oversized_domain_inputs(kwargs):
    with pytest.raises(GeometryError):
        protocol.handle('hyperbolic-patch', request(**kwargs))


def test_valid_observer_frame_and_address_are_bound_not_applied_as_global_float_position():
    frame = boost([1, 0, 0], 0.7).ravel().tolist()
    page = protocol.handle('hyperbolic-patch', request(anchor={'word': [0, 1], 'observerMatrix': frame}))
    root = next(i for i in page['instances'] if i['id'] == 0)
    assert root['matrix'] == np.eye(4).ravel().tolist()


def test_observer_input_keeps_its_absolute_near_identity_gate():
    matrix = boost([1, 0, 0], 8) * (1 + 1e-8)
    assert np.max(np.abs(matrix.T @ J @ matrix - J)) > 1e-8
    assert matrix_metric_residual(matrix)['relative'] < DEVELOPMENT_RELATIVE_GATE
    with pytest.raises(GeometryError, match='within 1e-8'):
        protocol.handle('hyperbolic-patch', request(anchor={'observerMatrix': matrix.ravel().tolist()}))


def test_retained_word_reconstruction_uses_matrix_scale_and_reports_both_errors():
    descriptor = protocol.handle('hyperbolic-create', request((5, 3, 5), depth=0))
    instance = descriptor['anchorPatch']['instances'][0]
    instance['word'] = [0, 6, 0, 11]
    original = Development([5, 3, 5])._transform(instance['word'])
    rotation = np.eye(4)
    angle = 1e-13
    rotation[1:3, 1:3] = [[np.cos(angle), -np.sin(angle)], [np.sin(angle), np.cos(angle)]]
    instance['matrix'] = (rotation @ original).ravel().tolist()
    receipt = protocol.handle('hyperbolic-validate', request((5, 3, 5), descriptor=descriptor))['residuals']
    assert receipt['matrixReconstruction'] > 1e-12
    assert receipt['matrixReconstructionRelative'] <= DEVELOPMENT_RELATIVE_GATE
    assert receipt['matrixReconstructionScale'] > 500
    rotation[1:3, 1:3] = [[np.cos(1e-5), -np.sin(1e-5)], [np.sin(1e-5), np.cos(1e-5)]]
    instance['matrix'] = (rotation @ original).ravel().tolist()
    with pytest.raises(GeometryError, match='does not match its word'):
        protocol.handle('hyperbolic-validate', request((5, 3, 5), descriptor=descriptor))


def test_535_requested_depth_four_is_clamped_to_complete_depth_three():
    params = request((5, 3, 5), depth=4, mode='complete-depth')
    page = protocol.handle('hyperbolic-patch', params)
    ids, word_lengths = [], set()
    while True:
        ids.extend(instance['id'] for instance in page['instances'])
        word_lengths.update(len(instance['word']) for instance in page['instances'])
        assert page['residuals']['coordinatesRelative'] <= DEVELOPMENT_RELATIVE_GATE
        assert page['residuals']['transformMetricRelative'] <= DEVELOPMENT_RELATIVE_GATE
        assert page['residuals']['mergeDiscrepancyRelative'] <= DEVELOPMENT_RELATIVE_GATE
        if page['nextCursor'] is None:
            break
        page = protocol.handle('hyperbolic-patch', {**params, 'cursor': page['nextCursor']})
    assert page['coverage']['stopReason'] == 'depthComplete'
    assert ids == list(range(1537)) and max(word_lengths) == 3
    assert page['coverage']['complete']
    assert page['residuals']['coordinatesScale'] < 1e4


def test_verified_prefix_cache_and_eviction_produce_the_same_resumed_page(monkeypatch):
    params = request((4, 3, 5), mode='complete-depth', budget={'candidatesPerPage': 30})
    cursor = protocol.handle('hyperbolic-patch', params)['nextCursor']
    resumed = {**params, 'cursor': cursor}
    warm = protocol.handle('hyperbolic-patch', resumed)
    protocol.clear_cache()
    monkeypatch.setattr(protocol, 'CACHE_LIMIT', 1)
    cold = protocol.handle('hyperbolic-patch', resumed)
    assert protocol._json(warm) == protocol._json(cold)
    assert protocol.cache_info()['bytes'] == 0
    assert protocol.cache_info()['entries'] == 0


def test_request_and_response_byte_caps_and_cursor_truncation(monkeypatch):
    with pytest.raises(GeometryError, match='bytes'):
        protocol.handle('hyperbolic-patch', request(epoch='x' * (4 * 1024**2 + 1)))
    with pytest.raises(GeometryError, match='array'):
        protocol.handle('hyperbolic-patch', request(anchor={'word': [0] * 50001}))
    nested = []
    for _ in range(42):
        nested = [nested]
    with pytest.raises(GeometryError, match='nesting'):
        protocol.handle('hyperbolic-patch', request(anchor=nested))
    monkeypatch.setattr(protocol, 'CURSOR_LIMIT', 100)
    page = protocol.handle('hyperbolic-patch', request(budget={'candidatesPerPage': 3}))
    assert page['nextCursor'] is None
    assert page['coverage']['stopReason'] == 'cursorLimit'
    assert page['coverage']['nonresumableTruncation']
    monkeypatch.setattr(protocol, 'MESSAGE_LIMIT', 1000)
    with pytest.raises(GeometryError, match='response exceeds'):
        protocol.handle('hyperbolic-patch', request(epoch=1, budget={'candidatesPerPage': 3}))


def test_cache_lru_eviction_is_bounded_and_returned_values_are_owned(monkeypatch):
    params = request(depth=0)
    first = protocol.handle('hyperbolic-patch', params)
    length = len(protocol._json(first))
    monkeypatch.setattr(protocol, 'CACHE_LIMIT', 2 * length + 10)
    for epoch in range(5):
        protocol.handle('hyperbolic-patch', request(depth=0, epoch=epoch))
    info = protocol.cache_info()
    assert info['bytes'] <= info['limit'] and info['entries'] == 2
    first['templates'][0]['vertices'][0][0] = 999
    assert protocol.handle('hyperbolic-patch', params)['templates'][0]['vertices'][0][0] != 999
    protocol.clear_cache()
    assert protocol.cache_info()['bytes'] == 0


@pytest.mark.parametrize(
    'corruption',
    ['template', 'matrix', 'word', 'dimension', 'duplicate', 'hugeAnchor', 'neighbor', 'permutation', 'sourceHash'],
)
def test_retained_geometry_is_revalidated_not_trusted(corruption):
    descriptor = protocol.handle('hyperbolic-create', request(budget={'candidatesPerPage': 3}))
    descriptor = deepcopy(descriptor)
    patch = descriptor['anchorPatch']
    if corruption == 'template':
        patch['templates'][0]['vertices'][0][0] += 0.01
    elif corruption == 'matrix':
        patch['instances'][0]['matrix'][0] += 0.01
    elif corruption == 'word':
        patch['instances'][0]['word'] = [999]
    elif corruption == 'dimension':
        descriptor['dimension'] = 4
    elif corruption == 'duplicate':
        patch['instances'].append(deepcopy(patch['instances'][0]))
    elif corruption == 'neighbor':
        patch['neighbors'][0]['toFace'] = 99
    elif corruption == 'permutation':
        patch['neighbors'][0]['vertexPermutation'] = [0] * 20
    elif corruption == 'sourceHash':
        patch['sourceHash'] = '0' * 64
    else:
        patch['oversized'] = 'x' * (1024**2 + 1)
    with pytest.raises(GeometryError):
        protocol.handle('hyperbolic-validate', request(descriptor=descriptor))


def test_manifold_explicit_extension_point_and_operation_errors():
    params = {'source': {'type': 'manifold', 'key': 'small-cover-v1'}}
    with pytest.raises(GeometryError, match='routing is not installed'):
        protocol.handle('hyperbolic-patch', params)
    seen = []

    def callback(op, value):
        seen.append((op, value))
        return {'delegated': True}

    assert protocol.handle('hyperbolic-patch', params, manifold_handler=callback) == {'delegated': True}
    assert seen == [('hyperbolic-patch', params)]
    with pytest.raises(GeometryError):
        protocol.handle('unknown', request())
    with pytest.raises(GeometryError):
        protocol.handle('hyperbolic-patch', [])
    with pytest.raises(GeometryError):
        protocol.handle('hyperbolic-create', request(cursor={}))
