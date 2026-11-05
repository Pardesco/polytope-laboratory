"""Prism saved state uses the existing native project validator and storage."""
import json
import subprocess
from copy import deepcopy
from pathlib import Path
import pytest
from engine.formats import validate_project, save_project
from engine.generators import regular


@pytest.mark.parametrize('dimension,key', [(3, 'cube'), (4, 'tesseract')])
def test_prism_new_document_view_roundtrip(dimension, key, tmp_path):
    root = Path(__file__).resolve().parents[1]
    code = "import {defaultDocumentView} from './ui/default-look.mjs';console.log(JSON.stringify(defaultDocumentView(%d)))" % dimension
    view = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', code], cwd=root, text=True))
    model = regular(key)
    project = {'format': 'polytope-laboratory', 'version': 1, 'active': 0, 'documents': [
        {'cursor': 0, 'states': [{'model': model, 'view': view}]}]}
    before = deepcopy(project)
    target = tmp_path / 'prism.polytope'
    save_project(target, project)
    restored = validate_project(json.loads(target.read_text(encoding='utf-8')))
    state = restored['documents'][0]['states'][0]
    assert state['view'] == view
    assert state['view']['appearance']['style'] == 'prism'
    assert state['view']['appearance']['backgroundMode'] == 'radial'
    assert state['view']['surfaceColors'] == ('cell-type' if dimension == 4 else 'face-type')
    assert state['model']['vertices'] == model['vertices']
    assert project == before


def test_native_legacy_sparse_view_is_not_migrated_to_prism():
    view = {'surfaceOpacity': .19, 'surfaceColors': 'source'}
    project = {'format': 'polytope-laboratory', 'version': 1, 'active': 0, 'documents': [
        {'cursor': 0, 'states': [{'model': regular('cube'), 'view': view}]}]}
    assert validate_project(project)['documents'][0]['states'][0]['view'] == view
