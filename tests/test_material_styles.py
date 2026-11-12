import json
import subprocess
from copy import deepcopy
from pathlib import Path
import pytest
from engine.appearance_state import validate_appearance
from engine.material_effects_state import validate_material_effects
from engine.generators import regular
from engine.formats import validate_project, save_project
from engine.geometry import GeometryError


def test_all_renderer_presets_and_custom_edits_roundtrip_through_native_project(tmp_path):
    root = Path(__file__).resolve().parents[1]
    source = "import {STYLE_LABELS,stylePreset} from './ui/style-presets.mjs';console.log(JSON.stringify(Object.keys(STYLE_LABELS).map(name=>stylePreset(name))))"
    views = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', source], cwd=root, text=True))
    views[2]['appearance']['backgroundMode'] = 'gradient'
    views[2]['appearance']['backgroundBottom'] = '#123456'
    views[2]['appearance']['shininess'] = 90
    model = regular('cube')
    project = {
        'format': 'polytope-laboratory',
        'version': 1,
        'active': 0,
        'documents': [
            {'cursor': len(views) - 1, 'states': [{'model': deepcopy(model), 'view': view} for view in views]}
        ],
    }
    checked = validate_project(deepcopy(project))
    assert [state['view'] for state in checked['documents'][0]['states']] == views
    target = tmp_path / 'styles.polytope'
    save_project(target, project)
    restored = validate_project(json.loads(target.read_text(encoding='utf-8')))
    assert [state['view'] for state in restored['documents'][0]['states']] == views
    assert restored['documents'][0]['states'][0]['model']['vertices'] == model['vertices']


@pytest.mark.parametrize(
    'value',
    [
        {'style': 'unknown'},
        {'backgroundMode': 'image'},
        {'backgroundBottom': '#fff'},
        {'edgeGlow': float('nan')},
        {'edgeGlow': 4},
        {'edgeGlow': True},
        {'vertexMetal': 1},
        {'newField': 0},
    ],
)
def test_native_rejects_unsupported_material_configuration(value):
    with pytest.raises(GeometryError):
        validate_appearance(value)


@pytest.mark.parametrize(
    'value', [{'reflection': 'remote'}, {'reflectivity': 2}, {'refractiveIndex': float('inf')}, {'bumpStrength': True}]
)
def test_native_rejects_unsupported_effects(value):
    with pytest.raises(GeometryError):
        validate_material_effects(value)


def test_legacy_sparse_appearance_is_preserved():
    assert validate_appearance({'preset': 'matte', 'shininess': 0}) == {'preset': 'matte', 'shininess': 0}
