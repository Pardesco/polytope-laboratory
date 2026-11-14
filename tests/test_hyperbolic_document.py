from copy import deepcopy
import numpy as np
import pytest
from engine.server import dispatch
from engine.geometry import GeometryError
from engine.hyperbolic import boost
from engine.hyperbolic_document import handle, validate_document, fingerprint
from engine.formats import validate_project
from engine.generators import generate

SOURCES = [{'type': 'honeycomb', 'pqr': list(pqr)} for pqr in ((5, 3, 4), (4, 3, 5), (5, 3, 5), (3, 5, 3))] + [
    {'type': 'manifold', 'key': 'small-cover-v1'}
]


@pytest.mark.parametrize('source', SOURCES)
def test_dispatch_retained_document_and_all_operations(source):
    model = dispatch({'op': 'hyperbolic-create', 'params': {'source': source, 'depth': 1}})
    assert 'nextCursor' not in model['anchorPatch']
    assert validate_document(model)['valid']
    for op in ('hyperbolic-patch', 'hyperbolic-analyze'):
        assert dispatch(
            {
                'op': op,
                'params': {'source': model['source'], 'depth': 1}
                if op.endswith('patch')
                else {'source': model['source']},
            }
        )
    assert dispatch({'op': 'hyperbolic-validate', 'params': {'source': model['source'], 'descriptor': model}})['valid']
    bad = deepcopy(model)
    bad['anchorPatch']['instances'][0]['matrix'][1] += 0.01
    with pytest.raises(GeometryError):
        validate_document(bad)


@pytest.mark.parametrize('source', SOURCES)
def test_rebase_preserves_local_geometry_and_is_reopenable(source):
    model = handle('hyperbolic-create', {'source': source, 'depth': 1})
    observer = boost([1, 0, 0], 1.1).ravel().tolist()
    page = handle(
        'hyperbolic-patch',
        {'source': model['source'], 'anchor': model['anchor'], 'rebase': observer, 'epoch': 1, 'depth': 1},
    )
    model['anchor'] = page['anchor']
    model['anchorPatch'] = page
    page.pop('nextCursor', None)
    assert validate_document(model)['valid']
    assert np.isfinite(np.asarray(page['instances'][0]['matrix'])).all()


def project(documents, version=2):
    return {'format': 'polytope-laboratory', 'version': version, 'documents': documents, 'active': 0}


def document(model):
    return {'id': 'test', 'cursor': 0, 'states': [{'model': model, 'view': {}}]}


def test_mixed_schema_v1_preserved_and_euclidean_domain_guard():
    euclidean = document(generate('regular', key='cube'))
    hyperbolic = document(handle('hyperbolic-create', {'source': SOURCES[0], 'depth': 1}))
    assert validate_project(project([deepcopy(euclidean)], 1))['version'] == 1
    assert validate_project(project([deepcopy(euclidean), deepcopy(hyperbolic)]))['version'] == 2
    with pytest.raises(GeometryError, match='schema v2'):
        validate_project(project([hyperbolic], 1))
    with pytest.raises(GeometryError, match='Euclidean'):
        dispatch({'op': 'dual', 'model': hyperbolic['states'][0]['model']})
    combined = deepcopy(euclidean)
    combined['states'] += hyperbolic['states']
    with pytest.raises(GeometryError, match='one document kind'):
        validate_project(project([combined]))


def test_history_creation_replay_and_exploration_keeps_recipe_identity():
    source = SOURCES[0]
    model = handle('hyperbolic-create', {'source': source, 'depth': 1})
    doc = dispatch(
        {
            'op': 'recipe-run',
            'params': {
                'document': document(model),
                'operation': 'hyperbolic-create',
                'parameters': {'source': source, 'depth': 1},
            },
        }
    )
    assert len(doc['states']) == 2
    expected = fingerprint(doc['states'][1]['model'])
    replay = dispatch({'op': 'recipe-replay', 'params': {'document': doc}})
    assert fingerprint(replay['states'][0]['model']) == expected
    doc['states'][1]['view']['observerMatrix'] = boost([0, 1, 0], 0.25).ravel().tolist()
    assert validate_project(project([doc]))
    assert len(doc['operationHistory']['nodes']) == 2


@pytest.mark.parametrize('bad', [[2, 0, 0, 0], [0, 1, 0, 0]])
def test_uniform_rings_are_refused(bad):
    with pytest.raises(GeometryError, match='regular rings'):
        handle('hyperbolic-create', {'source': {**SOURCES[0], 'rings': bad}})


def test_manifold_domain_tampering_and_frame_corruption():
    model = handle('hyperbolic-create', {'source': SOURCES[-1], 'depth': 0})
    bad = deepcopy(model)
    bad['pinnedDomain']['lambda'][0][0] ^= 1
    with pytest.raises(GeometryError):
        validate_document(bad)
    bad = deepcopy(model)
    bad['anchor']['localPose'] = [0] * 16
    with pytest.raises(GeometryError):
        validate_document(bad)


def test_quotient_fingerprint_survives_javascript_number_spellings():
    model = handle('hyperbolic-create', {'source': SOURCES[-1], 'depth': 0})

    def javascript(value):
        if isinstance(value, dict):
            return {k: javascript(v) for k, v in value.items()}
        if isinstance(value, list):
            return [javascript(v) for v in value]
        if isinstance(value, float) and value.is_integer():
            return int(value)
        return value

    assert fingerprint(javascript(model)) == fingerprint(model)


def test_cursor_is_bound_to_local_anchor_and_never_persisted():
    source = SOURCES[0]
    request = {'source': source, 'epoch': 2, 'budget': {'pageSize': 2, 'candidatesPerPage': 8}}
    page = handle('hyperbolic-patch', request)
    assert page['nextCursor']
    next_page = handle('hyperbolic-patch', {**request, 'cursor': page['nextCursor']})
    assert next_page['epoch'] == 2
    with pytest.raises(GeometryError, match='different document anchor'):
        handle('hyperbolic-patch', {**request, 'cursor': page['nextCursor'], 'anchor': {'word': [0]}})


def test_manifold_crossing_rebase_keeps_state_and_frame_continuity():
    from engine import hyperbolic_manifold as manifold

    source = SOURCES[-1]
    model = handle('hyperbolic-create', {'source': source, 'depth': 1})
    normal = np.asarray(model['pinnedDomain']['template']['facePlanes'][0])
    observer = boost(normal[1:], float(np.arcsinh(normal[0])) + 0.05)
    crossed = manifold.cross_face(0, observer.ravel().tolist(), 0)
    page = handle(
        'hyperbolic-patch',
        {'source': source, 'anchor': model['anchor'], 'rebase': observer.ravel().tolist(), 'depth': 1},
    )
    assert page['anchor']['quotientState'] == crossed['quotientState']
    assert np.max(np.abs(np.asarray(page['anchor']['localPose']) - crossed['localPose'])) < 1e-12
    matrices = [observer @ np.asarray(c['matrix']).reshape(4, 4) for c in page['instances']]
    assert min(np.max(np.abs(m - np.eye(4))) for m in matrices) < 1e-10
    model['anchor'] = page['anchor']
    model['anchorPatch'] = page
    page.pop('nextCursor', None)
    assert validate_document(model)['valid']


def test_manifold_retained_neighbor_permutation_and_id_tampering():
    model = handle('hyperbolic-create', {'source': SOURCES[-1], 'depth': 1})
    bad = deepcopy(model)
    bad['anchorPatch']['instances'][1]['id'] = 0
    with pytest.raises(GeometryError, match='identity'):
        validate_document(bad)
    bad = deepcopy(model)
    bad['anchorPatch']['neighbors'][0]['vertexPermutation'] = [4, 3, 2, 1, 0]
    with pytest.raises(GeometryError, match='permutation'):
        validate_document(bad)


def test_pre_navigation_manifold_neighbor_schema_remains_readable():
    model = handle('hyperbolic-create', {'source': SOURCES[-1], 'depth': 1})
    faces = model['anchorPatch']['templates'][0]['faces']
    for row in model['anchorPatch']['neighbors']:
        full = row['vertexPermutation'] or list(range(20))
        to_face = row['toFace'] if row['toFace'] is not None else row['face']
        row.update(
            templatePermutation=full,
            toFace=to_face,
            unexpanded=row['toCell'] is None,
            vertexPermutation=[faces[to_face].index(full[v]) for v in faces[row['face']]],
        )
    assert validate_document(model)['valid']
    bad = deepcopy(model)
    bad['anchorPatch']['neighbors'][0]['vertexPermutation'] = [4, 3, 2, 1, 0]
    with pytest.raises(GeometryError, match='permutation'):
        validate_document(bad)


def test_long_honeycomb_addresses_are_chunked_and_bounded_without_global_matrices():
    page = handle('hyperbolic-patch', {'source': SOURCES[0], 'depth': 0, 'anchor': {'word': [0, 0] * 300}})
    assert list(map(len, page['anchor']['wordChunks'])) == [256, 256]
    assert len(page['anchor']['word']) == 88
    with pytest.raises(GeometryError, match='64 KiB'):
        handle('hyperbolic-patch', {'source': SOURCES[0], 'depth': 0, 'anchor': {'word': [0] * 16001}})


def test_native_mixed_project_file_save_load_and_anchor_regeneration(tmp_path):
    from engine.formats import save_project, load_file

    seed = handle('hyperbolic-create', {'source': SOURCES[-1], 'depth': 0})
    hyperbolic = dispatch(
        {
            'op': 'recipe-run',
            'params': {
                'document': document(seed),
                'operation': 'hyperbolic-create',
                'parameters': {'source': seed['source'], 'depth': 1},
            },
        }
    )
    mixed = project([document(generate('regular', key='cube')), hyperbolic])
    target = tmp_path / 'mixed.polyproj'
    save_project(target, mixed)
    reopened = load_file(target)['project']
    assert reopened['version'] == 2
    restored = reopened['documents'][1]['states'][1]['model']
    assert restored['pinnedDomain'] == seed['pinnedDomain']
    assert 'nextCursor' not in restored['anchorPatch']
    assert len(reopened['documents'][1]['operationHistory']['nodes']) == 2
    assert handle('hyperbolic-patch', {'source': restored['source'], 'anchor': restored['anchor'], 'depth': 1})[
        'instances'
    ]


@pytest.mark.parametrize('source', SOURCES)
def test_new_document_recipe_is_atomic_and_replayable_without_renderer_seed(source):
    created = dispatch(
        {
            'op': 'recipe-run',
            'params': {
                'document': None,
                'operation': 'hyperbolic-create',
                'parameters': {'source': source, 'depth': 1},
                'label': 'Open hyperbolic space',
            },
        }
    )
    assert len(created['states']) == 2 and created['cursor'] == 1
    assert len(created['states'][0]['model']['anchorPatch']['instances']) == 1
    assert len(created['operationHistory']['nodes']) == 2
    replayed = dispatch({'op': 'recipe-replay', 'params': {'document': created}})
    assert fingerprint(replayed['states'][0]['model']) == fingerprint(created['states'][1]['model'])


def test_atomic_new_document_refuses_unsupported_source():
    with pytest.raises(GeometryError, match='regular rings'):
        dispatch(
            {
                'op': 'recipe-run',
                'params': {
                    'document': None,
                    'operation': 'hyperbolic-create',
                    'parameters': {'source': {**SOURCES[0], 'rings': [0, 1, 0, 0]}},
                },
            }
        )
