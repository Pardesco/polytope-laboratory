import copy
import json
import subprocess
from pathlib import Path
import pytest
from engine.animation_state import validate_animation_sequence, animation_render_support
from engine.geometry import GeometryError
from engine.generators import regular
from engine.formats import save_project, load_file

ROOT = Path(__file__).resolve().parents[1]


def sequence():
    return {
        'version': 4,
        'duration': 2,
        'fps': 4,
        'loop': False,
        'tracks': {'camera': {}, 'projection': {}, 'opacity': {}, 'sectionNormal': {}},
        'keyframes': [
            {
                'time': 0,
                'angles': [10, 20, 30, 40, 50, 60],
                'sectionOffset': -2,
                'camera': {'azimuth': 0, 'elevation': 0, 'distance': 5},
                'projection': 3,
                'opacity': 0.8,
                'sectionNormal': [0, 0, 0, 1],
            },
            {
                'time': 2,
                'angles': [370, 20, 30, 40, 50, 60],
                'sectionOffset': 2,
                'camera': {'azimuth': 360, 'elevation': 60, 'distance': 9},
                'projection': 7,
                'opacity': 0,
                'sectionNormal': [0, 0, 1, 0],
            },
        ],
    }


def test_native_and_renderer_accept_identical_v1_v4_records_without_mutation():
    fixtures = json.loads((ROOT / 'tests/fixtures/animation-v1-v3.json').read_text()) + [sequence()]
    before = copy.deepcopy(fixtures)
    program = "import {normalizeSequence} from './ui/animation.mjs';let data='';for await(const part of process.stdin)data+=part;process.stdout.write(JSON.stringify(JSON.parse(data).map(normalizeSequence)));"
    result = subprocess.run(
        ['node', '--input-type=module', '-e', program],
        cwd=ROOT,
        input=json.dumps(fixtures),
        text=True,
        capture_output=True,
        check=True,
    )
    assert json.loads(result.stdout) == [validate_animation_sequence(s) for s in fixtures] == fixtures
    assert fixtures == before


def test_native_v4_capabilities_and_explicit_unit_normal_normalization():
    s = sequence()
    s['keyframes'][0]['sectionNormal'] = [0, 0, 0, 5]
    checked = validate_animation_sequence(s)
    assert checked['keyframes'][0]['sectionNormal'] == [0, 0, 0, 1]
    assert s['keyframes'][0]['sectionNormal'] == [0, 0, 0, 5]
    assert animation_render_support(checked, ('camera', 'projection', 'opacity', 'sectionNormal'))['supported']
    assert not animation_render_support(checked, ('camera',))['supported']


@pytest.mark.parametrize(
    'field,value',
    [
        ('projection', 0),
        ('projection', 101),
        ('projection', False),
        ('projection', float('inf')),
        ('opacity', -0.1),
        ('opacity', 1.1),
        ('opacity', True),
        ('opacity', '1'),
        ('sectionNormal', [0, 0, 0, 0]),
        ('sectionNormal', [0, 0, 1]),
        ('sectionNormal', [0, 0, 0, float('nan')]),
        ('camera', {'azimuth': 0, 'elevation': 91, 'distance': 1}),
        ('camera', {'azimuth': 1e6 + 1, 'elevation': 0, 'distance': 1}),
        ('camera', {'azimuth': 0, 'elevation': 0, 'distance': 0}),
        ('camera', {'azimuth': 0, 'elevation': 0, 'distance': 1e6 + 1}),
        ('camera', {'azimuth': 0, 'elevation': 0, 'distance': 1, 'roll': 0}),
    ],
)
def test_native_v4_limits_and_field_shapes(field, value):
    s = sequence()
    s['keyframes'][0][field] = value
    before = copy.deepcopy(s)
    with pytest.raises(GeometryError):
        validate_animation_sequence(s)
    if field != 'sectionNormal' or value[-1] == value[-1]:
        assert s == before


def test_native_antipodal_refusal_and_an_explicit_intermediate_normal():
    s = sequence()
    s['keyframes'][1]['sectionNormal'] = [0, 0, 0, -1]
    with pytest.raises(GeometryError, match='antipodal.*intermediate'):
        validate_animation_sequence(s)
    middle = copy.deepcopy(s['keyframes'][0])
    middle.update(time=1, sectionNormal=[0, 0, 1, 0])
    s['keyframes'].insert(1, middle)
    assert len(validate_animation_sequence(s)['keyframes']) == 3


def test_v4_options_are_strict_and_v1_v3_do_not_accept_new_tracks():
    for version in (1, 2, 3):
        s = sequence()
        s['version'] = version
        with pytest.raises(GeometryError):
            validate_animation_sequence(s)
    s = sequence()
    s['tracks']['camera'] = {'roll': True}
    with pytest.raises(GeometryError):
        validate_animation_sequence(s)
    s = sequence()
    s['tracks'] = {'fold': {'kind': 'face-net'}}
    with pytest.raises(GeometryError, match='Version 4'):
        validate_animation_sequence(s)


def test_project_history_and_animated_tour_roundtrip_preserve_v4_and_source(tmp_path):
    model = regular('tesseract')
    state = {
        'model': model,
        'notes': 'Retained source',
        'view': {
            'angles': [0] * 6,
            'projection': 'perspective',
            'perspectiveDistance4D': 3,
            'surfaceOpacity': 0.8,
            'sectionNormal': [0, 0, 0, 1],
            'sectionOffset': 0,
            'camera': {'position': [1, 2, 8], 'target': [1, 2, 3]},
            'animation': sequence(),
        },
    }
    old = copy.deepcopy(state)
    old['view']['animation'] = json.loads((ROOT / 'tests/fixtures/animation-v1-v3.json').read_text())[0]
    project = {
        'format': 'polytope-laboratory',
        'version': 1,
        'active': 0,
        'documents': [{'id': 'v4', 'cursor': 1, 'states': [old, copy.deepcopy(state)]}],
        'tour': {
            'version': 2,
            'cursor': 0,
            'events': [
                {'id': 'v4-event', 'state': copy.deepcopy(state), 'duration': 2, 'transition': {'method': 'instant'}}
            ],
        },
    }
    path = tmp_path / 'v4.polyproj'
    save_project(path, project)
    loaded = load_file(path)['project']
    assert loaded['documents'][0]['states'][0]['view']['animation'] == old['view']['animation']
    for restored in [loaded['documents'][0]['states'][1], loaded['tour']['events'][0]['state']]:
        assert restored['view']['animation'] == sequence()
        assert restored['model']['vertices'] == model['vertices']
        assert restored['notes'] == 'Retained source'
