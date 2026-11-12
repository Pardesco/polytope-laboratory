from copy import deepcopy
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
import pytest

from engine.formats import parse_off, validate_project, save_project, load_file
from engine.generators import generate
from engine.geometry import GeometryError, identity, validate, hull
from engine.history import canonical_model
from engine.recipes import run_recipe, replay_document, branch_recipe
from engine.server import dispatch
from engine.stewart_checks import stewart_report
from engine.compounds import extract_component


def cube():
    return generate('block', sizes=[1, 1, 1])


def run(base=None, **params):
    return dispatch(
        {'op': 'face-surgery', 'model': base or cube(), 'params': {'face_id': 0, 'piece': 'pyramid', **params}}
    )


def volume(model):
    return model['metadata']['faceSurgery']['measureEvidence']['enclosedVolume']


def counts(model):
    return [len(model[k]) for k in ('vertices', 'edges', 'faces')]


def test_cube_pyramid_excavation_counts_volume_and_orientation():
    base = cube()
    before = deepcopy(base)
    result = run(base, mode='excavate', height=0.25)
    assert counts(result) == [9, 16, 9]
    assert volume(result) == pytest.approx(1 - 0.25 / 3)
    assert result['metadata']['topologicalGenus'] == 0
    evidence = result['metadata']['faceSurgery']
    assert evidence['reversedCavityFaces'] and evidence['intersections']['passed']
    assert evidence['topology']['eulerCharacteristic'] == 2
    assert evidence['measureEvidence']['numeric']['certified'] is False
    assert validate(result)['passed'] and base == before


def test_cube_augmentation_and_batch_kleetope():
    assert volume(run(mode='augment', height=0.25)) == pytest.approx(1 + 0.25 / 3)
    for mode, sign in [('augment', 1), ('excavate', -1)]:
        result = run(mode=mode, height=0.1, all_of_type=True)
        assert counts(result) == [14, 36, 24]
        assert len(result['metadata']['faceSurgery']['placements']) == 6
        assert volume(result) == pytest.approx(1 + sign * 0.2)


@pytest.mark.parametrize('key,face_sides', [('icosahedron', 3), ('dodecahedron', 5)])
def test_all_congruent_faces_regular_solids(key, face_sides):
    base = generate('regular', key=key)
    result = run(base, mode='excavate', height=0.1, all_of_type=True)
    assert len(result['faces']) == face_sides * len(base['faces'])
    assert result['metadata']['faceSurgery']['topology']['genus'] == 0
    assert len(result['metadata']['faceSurgery']['placements']) == len(base['faces'])


def test_pentagonal_pyramid_on_icosahedron_is_not_a_matching_face():
    piece = generate('pyramid', n=5, height=0.1)
    face = next(i for i, f in enumerate(piece['faces']) if len(f) == 5)
    with pytest.raises(GeometryError, match='side counts'):
        run(
            generate('regular', key='icosahedron'),
            mode='excavate',
            piece='model',
            addition=piece,
            addition_face_id=face,
        )


@pytest.mark.parametrize('offset', range(4))
def test_memory_piece_twist_and_rgba_preserved(offset):
    base = cube()
    piece = generate('pyramid', n=4, height=0.1)
    p = np.asarray(piece['vertices'])
    p[:, :2] *= 1 / np.sqrt(2)
    piece = hull(p.tolist(), 'Square pyramid')
    af = next(i for i, f in enumerate(piece['faces']) if len(f) == 4)
    color = {'encoding': 'byte', 'values': [12, 34, 56, 128]}
    piece['metadata']['offColors'] = {'faces': [deepcopy(color) for _ in piece['faces']], 'cells': []}
    result = run(base, mode='excavate', piece='model', addition=piece, addition_face_id=af, cycle_offset=offset)
    assert volume(result) == pytest.approx(1 - 0.1 / 3)
    assert result['metadata']['offColors']['faces'].count(color) == 4


@pytest.mark.parametrize('height', [1, 2, 100])
def test_pokes_through_refused(height):
    with pytest.raises(GeometryError, match='pokes through|Self-intersection'):
        run(mode='excavate', height=height)


def test_overlapping_batch_cavities_refused():
    with pytest.raises(GeometryError, match='Self-intersection'):
        run(mode='excavate', height=0.7, all_of_type=True)


def test_drilling_cube_genus_one_counts_and_volume():
    result = run(mode='drill', piece='prism', inset=0.5)
    assert counts(result) == [16, 32, 16]
    assert volume(result) == pytest.approx(0.75)
    assert result['metadata']['topologicalGenus'] == 1
    evidence = result['metadata']['faceSurgery']
    assert evidence['entryFaceId'] != evidence['exitFaceId']
    assert evidence['topology']['eulerCharacteristic'] == 0
    assert evidence['intersections']['passed']


def test_drilling_hexagonal_prism():
    base = generate('prism', n=6, height=2)
    face = next(i for i, f in enumerate(base['faces']) if len(f) == 6)
    result = run(base, mode='drill', piece='prism', face_id=face)
    assert counts(result) == [24, 48, 24]
    assert result['metadata']['topologicalGenus'] == 1
    assert volume(result) == pytest.approx(3 * np.sqrt(3) * 0.75)


@pytest.mark.parametrize(
    'params',
    [
        {'mode': 'drill', 'piece': 'antiprism'},
        {'mode': 'drill', 'piece': 'prism', 'all_of_type': True},
        {'mode': 'drill', 'piece': 'prism', 'inset': 1},
        {'mode': 'excavate', 'scale': 2},
        {'mode': 'excavate', 'face_id': True},
        {'mode': 'excavate', 'cycle_offset': 4},
        {'mode': 'excavate', 'all_of_type': 'yes'},
        {'mode': 'excavate', 'piece': 'rotunda'},
        {'mode': 'excavate', 'unknown': True},
    ],
)
def test_invalid_or_unsupported_parameters_refused(params):
    with pytest.raises(GeometryError):
        run(**params)


def test_no_parallel_opposite_face_refused():
    with pytest.raises(GeometryError, match='opposite parallel'):
        run(generate('regular', key='tetrahedron'), mode='drill', piece='prism')


def test_coordinate_unit_contract():
    base = cube()
    base['metadata']['coordinateUnits'] = 'unsupported'
    with pytest.raises(GeometryError, match='coordinate units'):
        run(base, mode='excavate')
    base['metadata']['coordinateUnits'] = 'mm'
    addition = cube()
    addition['metadata']['coordinateUnits'] = 'cm'
    with pytest.raises(GeometryError, match='coordinate units differ'):
        run(base, mode='augment', piece='model', addition=addition, addition_face_id=0)


def test_native_coplanar_blending():
    base = cube()
    addition = cube()
    raw = run(base, mode='augment', piece='model', addition=addition, addition_face_id=0, blend=False)
    blended = run(base, mode='augment', piece='model', addition=addition, addition_face_id=0, blend=True)
    assert len(raw['faces']) == 10 and len(blended['faces']) == 6
    assert blended['metadata']['faceSurgery']['coplanarFaceReduction'] == 4
    assert volume(blended) == pytest.approx(2)


def test_cupola_batch_hexagonal_caps():
    base = generate('prism', n=6, height=2)
    face = next(i for i, f in enumerate(base['faces']) if len(f) == 6)
    result = run(base, mode='augment', face_id=face, piece='cupola', height=0.3, all_of_type=True)
    assert len(result['metadata']['faceSurgery']['placements']) == 2
    assert result['metadata']['faceSurgery']['topology']['genus'] == 0


def test_vertex_orbit_literal_compound_axis_and_component_extraction():
    base = cube()
    result = run(
        base,
        mode='vertices',
        vertex_id=0,
        piece='library',
        library_key='tetrahedron',
        scale=0.1,
        all_of_type=True,
        height=0,
    )
    assert counts(result) == [40, 60, 38]
    assert len(result['components']) == 9
    assert result['metadata']['faceSurgery']['welded'] is False
    for placement in result['metadata']['faceSurgery']['placements']:
        axis = np.asarray(placement['axis'])
        vertex = np.asarray(base['vertices'][placement['vertexId']])
        assert np.dot(axis, vertex - np.mean(base['vertices'], axis=0)) > 0
        assert np.linalg.det(placement['rotation']) == pytest.approx(1)
    for component in result['components']:
        assert validate(extract_component(result, component['id']))['passed']
    other = run(
        base,
        mode='vertices',
        vertex_id=0,
        piece='library',
        library_key='tetrahedron',
        scale=0.1,
        all_of_type=True,
        height=0,
    )
    assert result == other


@pytest.mark.parametrize(
    'params',
    [
        {'mode': 'excavate', 'piece': 'pyramid', 'height': 0.1, 'all_of_type': True},
        {'mode': 'drill', 'piece': 'prism', 'inset': 0.4},
        {
            'mode': 'vertices',
            'piece': 'library',
            'library_key': 'tetrahedron',
            'vertex_id': 0,
            'scale': 0.1,
            'all_of_type': True,
        },
    ],
)
def test_history_save_replay_undo_branch(tmp_path, params):
    source = {'model': cube(), 'view': {}, 'notes': 'Retained notes'}
    document = {'id': 'surgery-history', 'cursor': 0, 'states': [source]}
    args = {'face_id': 0, **params}
    result = run_recipe(document, 'face-surgery', args, dispatch)
    assert result['cursor'] == 1 and len(result['states']) == 2
    assert result['states'][0] == document['states'][0] or canonical_model(
        result['states'][0]['model']
    ) == canonical_model(source['model'])
    assert result['states'][1]['notes'] == 'Retained notes'
    project = {'format': 'polytope-laboratory', 'version': 1, 'active': 0, 'documents': [result]}
    path = tmp_path / 'surgery.polytope'
    save_project(str(path), project)
    restored = load_file(str(path))['project']['documents'][0]
    replayed = replay_document(restored, dispatch)
    expected = restored['states'][1]['model']
    actual = replayed['states'][0]['model']
    assert canonical_model(actual) == canonical_model(expected)
    assert actual['metadata']['faceSurgery'] == expected['metadata']['faceSurgery']
    assert actual['metadata'].get('topologicalGenus') == expected['metadata'].get('topologicalGenus')
    changed = {**args, **({'inset': 0.2} if params['mode'] == 'drill' else {'height': 0.15})}
    branch = branch_recipe(restored, changed, dispatch)
    assert branch['states'][0]['model']['fingerprint'] != branch['states'][-1]['model']['fingerprint']
    assert document['cursor'] == 0 and len(document['states']) == 1


@pytest.mark.parametrize('folder', ['stewart', 'stewart_families'])
def test_attributed_stewart_surfaces_still_have_declared_genus(folder):
    root = Path(__file__).resolve().parents[1] / 'engine' / 'catalog_data' / folder
    manifest = json.loads((root / 'manifest.json').read_text())
    # Parse supplied geometry independently of byte-hash catalog loading (CRLF checkouts differ).
    for entry in manifest['entries']:
        model = parse_off((root / entry['file']).read_text(), entry['name'])
        report = stewart_report(model)
        assert report['classified']
        assert report['T']['topology']['genus'] == entry['genus'][0]


def test_json_lines_protocol_construction_and_refusal():
    requests = [
        {'id': str(i), 'op': 'face-surgery', 'model': cube(), 'params': params}
        for i, params in enumerate(
            [
                {'mode': 'excavate', 'face_id': 0, 'piece': 'pyramid', 'height': 0.1},
                {'mode': 'drill', 'face_id': 0, 'piece': 'prism', 'inset': 0.5},
                {'mode': 'excavate', 'face_id': 0, 'piece': 'pyramid', 'height': 2},
            ]
        )
    ]
    root = Path(__file__).resolve().parents[1]
    process = subprocess.run(
        [sys.executable, str(root / 'engine/server.py')],
        cwd=root,
        input=''.join(json.dumps(r) + '\n' for r in requests),
        text=True,
        encoding='utf-8',
        capture_output=True,
        timeout=30,
        check=True,
    )
    replies = [json.loads(line) for line in process.stdout.splitlines()]
    assert [r['id'] for r in replies] == ['0', '1', '2']
    assert [r['ok'] for r in replies] == [True, True, False]
    assert replies[1]['result']['metadata']['topologicalGenus'] == 1
    assert 'pokes through' in replies[2]['error']
