"""CON-08 literal cube owner oracle, native preview/adopt and durable history."""

from collections import Counter
from copy import deepcopy
import json
from pathlib import Path
import io

import numpy as np
import pytest

from engine import element_annotations as content
from engine.formats import save_project, load_file
from engine.geometry import GeometryError, identity
from engine.server import dispatch
from engine.subdivision_inheritance import inheritance_receipt

FIXTURE = json.loads((Path(__file__).parent / 'fixtures/r8_subdivision_inheritance.json').read_text())


def document():
    model = deepcopy(FIXTURE['cube'])
    model = dispatch(
        {
            'op': 'validate-project',
            'params': {
                'project': {
                    'format': 'polytope-laboratory',
                    'version': 1,
                    'active': 0,
                    'documents': [{'cursor': 0, 'states': [{'model': model, 'view': {}}]}],
                }
            },
        }
    )['documents'][0]['states'][0]['model']
    annotations = content.set_text(content.new_document(model), model, 'face', 0, FIXTURE['markup'])
    return {
        'id': 'inheritance-doc',
        'cursor': 0,
        'states': [
            {
                'model': model,
                'notes': 'Keep source notes.',
                'view': {'coordinateUnit': 'mm', 'fillRule': 'even-odd', 'elementAnnotations': annotations},
            }
        ],
    }


def current(doc):
    return doc['states'][doc['cursor']]


def preview(doc, op, params):
    return dispatch(
        {'op': 'subdivision-inheritance-preview', 'params': {'document': doc, 'operation': op, 'parameters': params}}
    )


def adopt(doc, op, params):
    return dispatch({'op': 'recipe-run', 'params': {'document': doc, 'operation': op, 'parameters': params}})


def comparable(state):
    result = deepcopy(state)
    for key in ('operationNode', 'label'):
        result.pop(key, None)
    result['model'].pop('id', None)
    annotations = result['view'].get('elementAnnotations')
    if annotations:
        annotations['source'].pop('id', None)
        annotations.pop('sourceSha256', None)
    return result


@pytest.mark.parametrize('case', FIXTURE['cases'], ids=lambda case: case['key'])
def test_cube_owner_table_two_levels_preview_adopt_undo_reopen_replay(case, tmp_path):
    doc = document()
    original = deepcopy(doc)
    for level, expected in enumerate(case['counts']):
        before = deepcopy(doc)
        source = current(before)
        packet = preview(doc, case['operation'], case['parameters'])
        assert doc == before
        result = adopt(doc, case['operation'], case['parameters'])
        state = current(result)
        assert comparable(packet['state']) == comparable(state)
        receipt = packet['receipt']
        model = state['model']
        assert list(receipt['counts'].values()) == expected
        assert [len(model[key]) for key in ('vertices', 'edges', 'faces', 'cells')] == expected
        children = case['childrenPerFace'][level]
        parents = [i for i in range(len(source['model']['faces'])) for _ in range(children)]
        assert receipt['sourceFaceIds'] == parents
        old = source['model']['metadata']['offColors']['faces']
        assert model['metadata']['offColors']['faces'] == [old[i] for i in parents]
        assert receipt['faceColorSourceIds'] == [i if old[i] is not None else None for i in parents]
        assert receipt['detachedColorFaceIds'] == []
        assert model['metadata']['coordinateUnits'] == 'mm'
        assert model['metadata']['fillRule'] == 'even-odd'
        assert 'catalogClaim' not in model['metadata']
        assert model['numeric']['certified'] is False
        assert model['vertices'][: len(source['model']['vertices'])] == source['model']['vertices']
        # Independently check closed boundary: each edge has two facial owners, Euler=2.
        uses = Counter(tuple(sorted((a, b))) for f in model['faces'] for a, b in zip(f, f[1:] + f[:1]))
        assert set(uses.values()) == {2}
        assert set(uses) == {tuple(sorted(e)) for e in model['edges']}
        assert expected[0] - expected[1] + expected[2] == 2
        assert receipt['mappedContent'] == [] and receipt['activeContentCount'] == 0
        assert receipt['detachedContent'] == ([{'kind': 'face', 'sourceIndex': 0}] if level == 0 else [])
        assert receipt['retainedArchiveCount'] == 1
        archive = state['view']['elementContentDetached'][0]
        assert archive['document'] == original['states'][0]['view']['elementAnnotations']
        assert archive['sourceNotes'] == state['notes'] == 'Keep source notes.'
        assert archive['sourceCoordinateUnit'] == 'mm'
        assert state['view']['elementAnnotations']['entries'] == []
        # Undo and redo are literal snapshots, without a recomputation.
        result['cursor'] -= 1
        assert comparable(current(result)) == comparable(source)
        result['cursor'] += 1
        path = tmp_path / (case['key'] + str(level) + '.polyproj')
        save_project(path, {'format': 'polytope-laboratory', 'version': 1, 'active': 0, 'documents': [result]})
        opened = load_file(path)['project']['documents'][0]
        replayed = dispatch({'op': 'recipe-replay', 'params': {'document': opened}})
        assert comparable(current(replayed)) == comparable(current(opened))
        doc = opened
    assert original == document()


@pytest.mark.parametrize('method', ['centroid', 'midpoint', 'kis'])
def test_literal_first_face_cycles_centers_and_area_residual(method):
    params = {'method': method, **({'height': 0.01} if method == 'kis' else {})}
    packet = preview(document(), 'subdivide-faces', params)
    m = packet['state']['model']
    if method == 'midpoint':
        assert m['vertices'][8:13] == [[0, 0.5, 0], [0.5, 1, 0], [1, 0.5, 0], [0.5, 0, 0], [0.5, 0.5, 0]]
        assert m['faces'][:4] == [[0, 8, 12, 11], [3, 9, 12, 8], [2, 10, 12, 9], [1, 11, 12, 10]]
    else:
        np.testing.assert_allclose(m['vertices'][8], [0.5, 0.5, -0.01 if method == 'kis' else 0], atol=1e-15)
        assert m['faces'][:4] == [[0, 3, 8], [3, 2, 8], [2, 1, 8], [1, 0, 8]]
    if method != 'kis':
        # Vector area of the children equals the unit square's signed area.
        areas = []
        for face in m['faces'][:4]:
            q = np.asarray(m['vertices'])[face]
            areas.append(np.linalg.norm(np.cross(q, np.roll(q, -1, axis=0)).sum(axis=0)) / 2)
            assert np.max(np.abs(q[:, 2])) < 1e-14
        assert abs(sum(areas) - 1) < 1e-14


@pytest.mark.parametrize(
    'notation,counts',
    [('d', [6, 12, 8]), ('a', [12, 24, 14]), ('t', [24, 36, 14]), ('j', [14, 24, 12]), ('e', [24, 48, 26])],
)
def test_conway_non_refinement_owners_remain_explicitly_unmapped(notation, counts):
    doc = document()
    packet = preview(doc, 'conway', {'notation': notation})
    r = packet['receipt']
    assert list(r['counts'].values())[:3] == counts
    assert r['sourceFaceIds'] == [None] * counts[2]
    assert r['faceColorSourceIds'] == [None] * counts[2]
    assert r['detachedColorFaceIds'] == [0, 1, 2, 4]
    assert (
        packet['state']['view']['elementContentDetached'][0]['document']['entries'][0]['text']['markup']
        == FIXTURE['markup']
    )
    assert comparable(packet['state']) == comparable(current(adopt(doc, 'conway', {'notation': notation})))


def test_compound_notation_kis_composes_original_color_owners():
    packet = preview(document(), 'conway', {'notation': 'kk'})
    assert packet['receipt']['sourceFaceIds'] == [i for i in range(6) for _ in range(12)]
    assert packet['receipt']['detachedColorFaceIds'] == []


def test_all_content_ranks_detach_even_for_divisions_one_and_partial_edges():
    doc = document()
    s = current(doc)
    m = s['model']
    for kind in ('vertex', 'edge'):
        s['view']['elementAnnotations'] = content.set_text(s['view']['elementAnnotations'], m, kind, 0, kind + ' owner')
    for params in ({'divisions': 1}, {'divisions': 2, 'edge_ids': [0]}):
        packet = preview(doc, 'subdivide-edges', params)
        assert packet['receipt']['mappedContent'] == []
        assert {e['kind'] for e in packet['receipt']['detachedContent']} == {'face', 'edge', 'vertex'}
        assert packet['receipt']['activeContentCount'] == 0
        if params['divisions'] == 1:
            assert identity(packet['state']['model']) == identity(m)


def test_preview_refuses_unsupported_domains_and_bad_controls_without_mutation():
    doc = document()
    before = deepcopy(doc)
    for op, params in [
        ('dual', {}),
        ('subdivide-faces', {'frequency': 2}),
        ('conway', {'notation': 's'}),
        ('subdivide-edges', {'divisions': 129}),
    ]:
        with pytest.raises(GeometryError):
            preview(doc, op, params)
    from engine.generators import regular

    for key in ('tesseract', 'small-stellated-dodecahedron'):
        doc['states'][0]['model'] = regular(key)
        doc['states'][0]['view'].pop('elementAnnotations', None)
        with pytest.raises(GeometryError):
            preview(doc, 'subdivide-faces', {'method': 'centroid'})
    assert before == document()


def test_color_receipt_refuses_a_forged_parent_color():
    doc = document()
    packet = preview(doc, 'subdivide-faces', {'method': 'midpoint'})
    packet['state']['model']['metadata']['offColors']['faces'][0]['values'][3] = 255
    with pytest.raises(GeometryError, match='color has no verified source'):
        inheritance_receipt(current(doc), packet['state'], 'subdivide-faces', {'method': 'midpoint'})


def test_face_png_and_text_share_one_complete_detached_archive_after_two_levels(tmp_path):
    from PIL import Image

    raw = io.BytesIO()
    Image.new('RGBA', (2, 2), (10, 20, 30, 128)).save(raw, format='PNG')
    doc = document()
    s = current(doc)
    s['view']['elementAnnotations'] = content.set_texture(
        s['view']['elementAnnotations'], s['model'], 0, raw.getvalue()
    )
    original = deepcopy(s['view']['elementAnnotations'])
    for _ in range(2):
        packet = preview(doc, 'subdivide-faces', {'method': 'midpoint'})
        doc = adopt(doc, 'subdivide-faces', {'method': 'midpoint'})
        assert comparable(packet['state']) == comparable(current(doc))
    archive = current(doc)['view']['elementContentDetached']
    assert len(archive) == 1 and archive[0]['document'] == original
    assert current(doc)['view']['elementAnnotations']['assets'] == {}
    path = tmp_path / 'texture.polyproj'
    save_project(path, {'format': 'polytope-laboratory', 'version': 1, 'active': 0, 'documents': [doc]})
    opened = load_file(path)['project']['documents'][0]
    replay = dispatch({'op': 'recipe-replay', 'params': {'document': opened}})
    assert current(replay)['view']['elementContentDetached'] == archive


def test_explicit_second_conway_height_refusal_retains_first_preview_and_source():
    doc = adopt(document(), 'conway', {'notation': 'k', 'height': 0.01})
    before = deepcopy(doc)
    with pytest.raises(GeometryError, match='nonconvex boundary'):
        preview(doc, 'conway', {'notation': 'k', 'height': 0.01})
    assert doc == before
