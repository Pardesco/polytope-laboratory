from copy import deepcopy
import json
from pathlib import Path
import subprocess
import sys

import numpy as np
import pytest

from engine.formats import save_project, load_file
from engine.element_annotations import new_document, set_text
from engine.geometry import GeometryError, identity
from engine.history import canonical_model
from engine.recipes import run_recipe, replay_document
from engine.server import dispatch

FIXTURE = json.loads((Path(__file__).parent / 'fixtures/r8_cell_rebuild.json').read_text())


def request(**params):
    return {
        'op': 'rebuild-coplanar-cells',
        'model': deepcopy(FIXTURE['model']),
        'params': {'cell_ids': FIXTURE['cellIds'], **params},
    }


def test_literal_exterior_element_color_and_content_owner_oracle():
    req = request()
    before = deepcopy(req)
    preview = dispatch({**req, 'op': req['op'] + '-preview'})
    m = dispatch(req)
    c = m['metadata']['cellRebuild']
    assert preview == {'model': m, 'construction': c} and req == before
    assert [len(m[k]) for k in ('vertices', 'edges', 'faces', 'cells')] == FIXTURE['expected']['counts']
    assert m['vertices'] == req['model']['vertices'] and m['edges'] == req['model']['edges']
    assert c['removedFaceIds'] == [26] and c['mergedCellId'] == 6
    assert c['sourceMaps']['faces'] == list(range(26)) + [None]
    assert c['sourceMaps']['cells'] == list(range(8)) + [6]
    assert c['cellSources'] == [[0], [1], [2], [3], [4], [5], [6, 8], [7]]
    for i, f in enumerate(c['faceSources']):
        assert m['faces'][i] == req['model']['faces'][f]
        assert m['metadata']['offColors']['faces'][i] == req['model']['metadata']['offColors']['faces'][f]
    for i, owner in enumerate(c['cellColorSources']):
        assert m['metadata']['offColors']['cells'][i] == req['model']['metadata']['offColors']['cells'][owner]
    for i in range(8):
        expected = (
            sorted((set(req['model']['cells'][6]) | set(req['model']['cells'][8])) - {26})
            if i == 6
            else req['model']['cells'][i]
        )
        assert m['cells'][i] == expected
    assert c['sourceCellContents'] == pytest.approx([0.5, 0.5], abs=1e-12)
    assert c['joinedCellContent'] == pytest.approx(1, abs=1e-12)
    assert c['contentResidual'] < 1e-12 and c['hyperplaneResidual'] < 1e-12
    assert c['relativeSupportResidual'] <= c['relativeTolerance'] == 1e-8
    assert m['numeric']['certified'] is False and c['certified'] is False
    assert m['metadata']['coordinateUnits'] == 'mm' and m['fingerprint'] == identity(m)
    m['metadata']['offColors']['cells'][6]['values'][0] = 0
    assert req == before


def test_reconstruction_enables_previously_refused_cross_cell_face_blends():
    req = request()
    pairs = FIXTURE['splitFacePairs']
    with pytest.raises(GeometryError, match='distinct source cell'):
        dispatch(
            {
                'op': 'blend-faces',
                'model': req['model'],
                'params': {'face_ids': pairs[0], 'color_policy': 'first-source'},
            }
        )
    m = dispatch(req)
    for pair in pairs:
        # Original face IDs are retained in owner tables across each blend.
        ids = [next(i for i, f in enumerate(m['faces']) if set(f) == set(req['model']['faces'][old])) for old in pair]
        m = dispatch({'op': 'blend-faces', 'model': m, 'params': {'face_ids': ids, 'color_policy': 'first-source'}})
    oracle = FIXTURE['expected']['restoredTesseract']
    assert [len(m[k]) for k in ('vertices', 'edges', 'faces', 'cells')] == [16, 32, 24, 8]
    face_keys = lambda model: {frozenset(f) for f in model['faces']}
    cell_keys = lambda model: {frozenset(frozenset(model['faces'][f]) for f in c) for c in model['cells']}
    assert face_keys(m) == face_keys(oracle) and cell_keys(m) == cell_keys(oracle)


@pytest.mark.parametrize('policy', ['require-equal', 'first-source'])
def test_cell_color_conflict_has_explicit_lowest_id_owner(policy):
    req = request(cell_ids=[8, 6], color_policy=policy)
    req['model']['metadata']['offColors']['cells'][8] = {'encoding': 'unit', 'values': [0, 1, 0, 0.5]}
    before = deepcopy(req)
    if policy == 'require-equal':
        with pytest.raises(GeometryError, match='colors differ'):
            dispatch(req)
    else:
        m = dispatch(req)
        assert m['metadata']['offColors']['cells'][6] == req['model']['metadata']['offColors']['cells'][6]
        assert m['metadata']['cellRebuild']['cellColorSources'][6] == 6
    assert req == before


@pytest.mark.parametrize(
    'params',
    [
        {'cell_ids': []},
        {'cell_ids': [6, 6]},
        {'cell_ids': [6, True]},
        {'cell_ids': [6, 99]},
        {'cell_ids': '6,8'},
        {'cell_ids': [6, 8, 7]},
        {'cell_ids': None},
        {'color_policy': 'average'},
        {'weld': True},
    ],
)
def test_invalid_options_are_atomic(params):
    req = request(**params)
    before = deepcopy(req)
    with pytest.raises(GeometryError):
        dispatch(req)
    assert req == before


def test_non_coplanar_cells_and_unshared_cells_refuse_atomically():
    for ids in ([0, 1], [0, 2]):
        req = request(cell_ids=ids)
        before = deepcopy(req)
        with pytest.raises(GeometryError, match='complete literal face|hyperplane'):
            dispatch(req)
        assert req == before


def test_bent_split_cell_refuses_hyperplane_without_convex_substitution():
    req = request()
    req['model']['vertices'][12][3] = 0.1
    before = deepcopy(req)
    with pytest.raises(GeometryError):
        dispatch(req)
    assert req == before


def test_two_convex_cells_with_nonconvex_union_refuse_without_hulling():
    req = request()
    xy = {(0, 0): (0, 0), (1, 0): (1, 0), (1, 1): (0.25, 0.25), (0, 1): (0, 1)}
    req['model']['vertices'] = [[*xy[x, y], z, w] for x, y, z, w in req['model']['vertices']]
    before = deepcopy(req)
    with pytest.raises(GeometryError, match='union must be convex'):
        dispatch(req)
    assert req == before


def test_source_domain_and_resource_bounds_refuse_before_reconstruction():
    req = request()
    req['model']['vertices'].extend([[0, 0, 0, 0]] * 241)
    with pytest.raises(GeometryError, match='limit is 256 vertices'):
        dispatch(req)
    req = request()
    req['model']['cells'].pop()
    before = deepcopy(req)
    with pytest.raises(GeometryError):
        dispatch(req)
    assert req == before


def test_ready_open_project_fixture_matches_pinned_native_input():
    project = load_file(Path(__file__).parent / 'fixtures/r8_cell_rebuild.polytope')['project']
    state = project['documents'][0]['states'][0]
    assert canonical_model(state['model']) == canonical_model(FIXTURE['model'])
    assert state['model']['metadata']['offColors'] == FIXTURE['model']['metadata']['offColors']
    assert state['view']['coordinateUnit'] == 'mm'


@pytest.mark.parametrize('scale', [0.01, 2, 100])
def test_intrinsic_content_scales_cubically_under_rigid_4d_embedding(scale):
    req = request()
    p = np.array(req['model']['vertices'], dtype=float)
    rotation = np.array([[0.6, 0, 0, 0.8], [0, 1, 0, 0], [0, 0, 1, 0], [-0.8, 0, 0, 0.6]])
    req['model']['vertices'] = (scale * p @ rotation + [3, -4, 2, 1]).tolist()
    c = dispatch(req)['metadata']['cellRebuild']
    assert c['joinedCellContent'] == pytest.approx(scale**3, rel=1e-10)
    assert c['sourceCellContents'] == pytest.approx([0.5 * scale**3] * 2, rel=1e-10)
    assert c['hyperplaneResidual'] < 1e-10 * max(1, scale)


def test_preview_undo_redo_reopen_replay_and_later_face_blend(tmp_path):
    req = request()
    preview = dispatch({**req, 'op': req['op'] + '-preview'})
    state = {'model': req['model'], 'view': {'coordinateUnit': 'mm'}, 'notes': 'Cell owner notes'}
    document = {'id': 'cell-rebuild-doc', 'cursor': 0, 'states': [state]}
    result = run_recipe(document, req['op'], req['params'], dispatch)
    assert result['states'][1]['model'] == preview['model']
    assert result['states'][1]['notes'] == state['notes']
    assert canonical_model(result['states'][0]['model']) == canonical_model(state['model']) and document['cursor'] == 0
    result['cursor'] = 0
    assert canonical_model(result['states'][result['cursor']]['model']) == canonical_model(state['model'])
    result['cursor'] = 1
    assert result['states'][result['cursor']]['model'] == preview['model']
    path = tmp_path / 'cells.polytope'
    save_project(path, {'format': 'polytope-laboratory', 'version': 1, 'active': 0, 'documents': [result]})
    reopened = load_file(path)['project']['documents'][0]
    replayed = replay_document(reopened, dispatch)
    assert canonical_model(replayed['states'][0]['model']) == canonical_model(preview['model'])
    assert replayed['states'][0]['model']['metadata']['cellRebuild'] == preview['construction']
    assert replayed['states'][0]['model']['metadata']['offColors'] == preview['model']['metadata']['offColors']
    blended = run_recipe(
        reopened, 'blend-faces', {'face_ids': FIXTURE['splitFacePairs'][0], 'color_policy': 'first-source'}, dispatch
    )
    assert len(replay_document(blended, dispatch)['states'][-1]['model']['faces']) == 25


def test_json_lines_dispatch_preview_adoption_and_refusal():
    req = request()
    requests = [
        {**req, 'id': 1, 'op': req['op'] + '-preview'},
        {**req, 'id': 2},
        {**req, 'id': 3, 'params': {'cell_ids': [0, 2]}},
    ]
    proc = subprocess.run(
        [sys.executable, '-B', 'engine/server.py'],
        input=''.join(json.dumps(r) + '\n' for r in requests),
        text=True,
        capture_output=True,
        check=True,
    )
    rows = [json.loads(line) for line in proc.stdout.splitlines()]
    assert rows[0]['ok'] and rows[1]['ok'] and not rows[2]['ok'] and not proc.stderr
    assert rows[0]['result']['model'] == rows[1]['result']


def test_content_oracle_preserves_exterior_owners_and_archives_changed_cells_and_seam(tmp_path):
    req = request()
    seed = {
        'format': 'polytope-laboratory',
        'version': 1,
        'active': 0,
        'documents': [{'id': 'source', 'cursor': 0, 'states': [{'model': req['model'], 'view': {}}]}],
    }
    source = dispatch({'op': 'validate-project', 'params': {'project': seed}})['documents'][0]['states'][0]['model']
    annotations = new_document(source)
    owners = [('vertex', 0), ('edge', 0), ('face', 0), ('face', 26), ('cell', 0), ('cell', 6), ('cell', 8)]
    for kind, index in owners:
        annotations = set_text(annotations, source, kind, index, f'{kind} {index}')
    document = {
        'id': 'annotated-cell-rebuild',
        'cursor': 0,
        'states': [
            {
                'model': source,
                'notes': 'Owner notes',
                'view': {'coordinateUnit': 'mm', 'elementAnnotations': annotations},
            }
        ],
    }
    result = run_recipe(document, req['op'], req['params'], dispatch)
    view = result['states'][-1]['view']
    assert [(e['kind'], e['index']) for e in view['elementAnnotations']['entries']] == [
        ('vertex', 0),
        ('edge', 0),
        ('face', 0),
        ('cell', 0),
    ]
    archive = view['elementContentDetached'][0]
    assert [(e['kind'], e['index']) for e in archive['document']['entries']] == [('face', 26), ('cell', 6), ('cell', 8)]
    assert archive['sourceNotes'] == 'Owner notes' and archive['sourceCoordinateUnit'] == 'mm'
    assert archive['document']['source'] == source
    path = tmp_path / 'owners.polytope'
    save_project(path, {'format': 'polytope-laboratory', 'version': 1, 'active': 0, 'documents': [result]})
    restored = load_file(path)['project']['documents'][0]
    replayed = replay_document(restored, dispatch)['states'][0]['view']
    for field in ('elementAnnotations', 'elementContentDetached', 'elementContentTransfer'):
        assert replayed[field] == view[field]
