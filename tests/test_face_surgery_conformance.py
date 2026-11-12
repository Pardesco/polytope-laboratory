from copy import deepcopy
import json
from pathlib import Path
import subprocess
import sys

import numpy as np
import pytest

from engine.compounds import _colors
from engine.formats import load_file, save_project
from engine.geometry import GeometryError, validate
from engine.history import canonical_model
from engine.recipes import replay_document, run_recipe
from engine.server import dispatch

FIXTURE = json.loads((Path(__file__).parent / 'fixtures/r6_face_surgery.json').read_text())


def request(mode='augment', target='same-color', piece='model', color='base'):
    params = {'mode': mode, 'face_id': 0, 'piece': piece, 'height': 0.25, 'side_colors': color, 'blend': False}
    if piece == 'model':
        params.update(addition=deepcopy(FIXTURE['pyramid']), addition_face_id=0)
    if target != 'selected':
        params.update(all_of_type=True, target_filter=target)
    return {'op': 'face-surgery', 'model': deepcopy(FIXTURE['cube']), 'params': params}


def integrated_volume(model):
    p = np.array(model['vertices'])
    return sum(
        np.dot(p[f[0]], np.cross(p[f[i]], p[f[i + 1]])) / 6 for f in model['faces'] for i in range(1, len(f) - 1)
    )


@pytest.mark.parametrize('mode', ['augment', 'excavate'])
@pytest.mark.parametrize('target', ['selected', 'same-color', 'congruent'])
@pytest.mark.parametrize('piece', ['model', 'pyramid'])
@pytest.mark.parametrize('color', ['piece', 'base', 'none'])
def test_literal_target_color_owner_and_independent_incidence_volume(mode, target, piece, color):
    req = request(mode, target, piece, color)
    before = deepcopy(req)
    packet = dispatch({**req, 'op': 'face-surgery-preview'})
    result = dispatch(req)
    assert packet['model'] == result and packet['construction'] == result['metadata']['faceSurgery']
    evidence = packet['construction']
    oracle = FIXTURE['oracles'][target]
    assert evidence['removedBaseFaces'] == oracle['targets']
    assert [len(result[k]) for k in ('vertices', 'edges', 'faces')] == oracle['counts']
    expected = oracle['augmentationVolume' if mode == 'augment' else 'excavationVolume']
    assert integrated_volume(result) == pytest.approx(expected, abs=1e-12)
    assert evidence['measureEvidence']['enclosedVolume'] == pytest.approx(expected, abs=1e-12)
    assert evidence['maximumMatchResidual'] <= evidence['matchTolerance'] == pytest.approx(1e-8)
    assert evidence['topology']['closedVertexManifold'] and evidence['topology']['genus'] == 0
    assert result['numeric']['certified'] is False and validate(result)['passed']
    origins = evidence['faceOrigins']
    assert len(origins) == len(result['faces'])
    surviving = [i for i in range(6) if i not in oracle['targets']]
    assert [group[0]['faceId'] for group in origins if group[0]['source'] == 'base'] == surviving
    colors = _colors(result, 'faces')
    source_colors = _colors(req['model'], 'faces')
    for i, group in enumerate(origins):
        assert len(group) == 1
        owner = group[0]
        if owner['source'] == 'base':
            assert result['faces'][i] == req['model']['faces'][owner['faceId']]
            assert colors[i] == source_colors[owner['faceId']]
        else:
            assert owner['attachmentFaceId'] in oracle['targets']
            assert owner['faceId'] != evidence['additionFaceId']
            expected_color = (
                source_colors[owner['attachmentFaceId']]
                if color == 'base'
                else _colors(req['params']['addition'], 'faces')[owner['faceId']]
                if color == 'piece' and piece == 'model'
                else None
            )
            assert colors[i] == expected_color
    p = np.array(req['model']['vertices'], dtype=float)
    for i, face_id in enumerate(oracle['targets']):
        face = p[req['model']['faces'][face_id]]
        normal = np.cross(face[1] - face[0], face[2] - face[0])
        normal /= np.linalg.norm(normal)
        assert result['vertices'][8 + i] == pytest.approx(
            face.mean(axis=0) + (1 if mode == 'augment' else -1) * 0.25 * normal
        )
    assert req == before


def test_unassigned_filter_and_congruence_intersection_never_broaden_targets():
    req = request()
    req['params']['face_id'] = 4
    assert dispatch(req)['metadata']['faceSurgery']['removedBaseFaces'] == [4, 5]
    req['model'] = deepcopy(FIXTURE['pyramid'])
    req['params']['piece'] = 'pyramid'
    req['params'].pop('addition')
    req['params'].pop('addition_face_id')
    req['params']['face_id'] = 0
    req['model']['metadata'].pop('offColors')
    assert dispatch(req)['metadata']['faceSurgery']['removedBaseFaces'] == [0]


@pytest.mark.parametrize('offset', range(4))
@pytest.mark.parametrize('mode', ['augment', 'excavate'])
def test_colored_memory_side_cycles_follow_literal_owner_through_every_twist(offset, mode):
    req = request(mode, target='selected', color='piece')
    req['params']['cycle_offset'] = offset
    result = dispatch(req)
    info = result['metadata']['faceSurgery']
    mapping = info['placements'][0]['vertexMap']
    for face, group in zip(result['faces'], info['faceOrigins']):
        owner = group[0]
        if owner['source'] == 'addition':
            expected = [mapping[v] for v in FIXTURE['pyramid']['faces'][owner['faceId']]]
            assert face == (expected[::-1] if mode == 'excavate' else expected)


@pytest.mark.parametrize('color', ['piece', 'base', 'none'])
def test_blend_composes_all_owners_and_preserves_unequal_color_seams(color):
    req = request(target='selected', color=color)
    req['params'].update(addition=deepcopy(FIXTURE['cube']), blend=True)
    result = dispatch(req)
    info = result['metadata']['faceSurgery']
    origins = info['faceOrigins']
    assert integrated_volume(result) == pytest.approx(2)
    assert sum(map(len, origins)) == 10
    assert len(origins) == len(result['faces'])
    assert all(owner['faceId'] != 0 for group in origins for owner in group if owner['source'] == 'base')
    assert all(owner['faceId'] != 0 for group in origins for owner in group if owner['source'] == 'addition')
    if color == 'piece':
        for group in origins:
            stored = [
                _colors(req['model'] if o['source'] == 'base' else req['params']['addition'], 'faces')[o['faceId']]
                for o in group
            ]
            assert all(c == stored[0] for c in stored)
    plain = deepcopy(req)
    plain['model']['metadata'].pop('offColors')
    plain['params']['addition']['metadata'].pop('offColors')
    merged = dispatch(plain)
    assert len(merged['faces']) == 6
    assert sorted(map(len, merged['metadata']['faceSurgery']['faceOrigins'])) == [1, 1, 2, 2, 2, 2]


@pytest.mark.parametrize(
    'params',
    [
        {'target_filter': 'same-shape'},
        {'target_filter': []},
        {'side_colors': 'average'},
        {'side_colors': None},
        {'mode': 'drill', 'target_filter': 'same-color'},
        {'mode': 'vertices', 'side_colors': 'base'},
        {'target_filter': 'same-color', 'all_of_type': False},
    ],
)
def test_unsupported_policy_refuses_atomically(params):
    req = request()
    req['params'].update(params)
    before = deepcopy(req)
    with pytest.raises(GeometryError):
        dispatch(req)
    assert req == before


@pytest.mark.parametrize('mode', ['augment', 'excavate'])
@pytest.mark.parametrize('target', ['selected', 'same-color', 'congruent'])
@pytest.mark.parametrize('color', ['piece', 'base', 'none'])
def test_preview_undo_redo_reopen_and_replay_preserve_literal_incidence_and_colors(tmp_path, mode, target, color):
    req = request(mode, target, color=color)
    preview = dispatch({**req, 'op': 'face-surgery-preview'})
    source = {'model': req['model'], 'view': {'coordinateUnit': 'mm'}, 'notes': 'Colored construction source'}
    document = {'id': 'r6-surgery', 'cursor': 0, 'states': [source]}
    result = run_recipe(document, 'face-surgery', req['params'], dispatch)
    actual = result['states'][1]['model']
    expected = preview['model']
    assert canonical_model(actual) == canonical_model(expected)
    assert actual['metadata']['offColors'] == expected['metadata']['offColors']
    assert actual['metadata']['faceSurgery'] == preview['construction']
    result['cursor'] = 0
    assert result['states'][result['cursor']]['model']['vertices'] == source['model']['vertices']
    result['cursor'] = 1
    assert result['states'][result['cursor']]['notes'] == source['notes']
    path = tmp_path / 'colored-surgery.polytope'
    save_project(str(path), {'format': 'polytope-laboratory', 'version': 1, 'active': 0, 'documents': [result]})
    restored = load_file(str(path))['project']['documents'][0]
    replayed = replay_document(restored, dispatch)['states'][0]['model']
    assert canonical_model(replayed) == canonical_model(expected)
    assert _colors(replayed, 'faces') == _colors(expected, 'faces')
    assert replayed['metadata']['faceSurgery'] == expected['metadata']['faceSurgery']
    assert document['cursor'] == 0 and len(document['states']) == 1


def test_json_lines_preview_then_history_recipe_uses_identical_geometry_and_receipt():
    req = request()
    source = {'model': req['model'], 'view': {}, 'notes': 'Native protocol'}
    messages = [
        {**req, 'op': 'face-surgery-preview', 'id': 'preview'},
        {
            'op': 'recipe-run',
            'id': 'adopt',
            'params': {
                'document': {'id': 'json-lines', 'states': [source], 'cursor': 0},
                'operation': 'face-surgery',
                'parameters': req['params'],
            },
        },
    ]
    root = Path(__file__).resolve().parents[1]
    proc = subprocess.run(
        [sys.executable, str(root / 'engine/server.py')],
        cwd=root,
        input=''.join(json.dumps(r) + '\n' for r in messages),
        text=True,
        capture_output=True,
        timeout=30,
        check=True,
    )
    replies = [json.loads(line) for line in proc.stdout.splitlines()]
    assert all(r['ok'] for r in replies), replies
    preview = replies[0]['result']['model']
    adopted = replies[1]['result']['states'][1]['model']
    assert canonical_model(preview) == canonical_model(adopted)
    assert preview['metadata']['faceSurgery'] == adopted['metadata']['faceSurgery']
