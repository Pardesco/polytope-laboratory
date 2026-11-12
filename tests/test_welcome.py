"""Bundled gallery and sample projects must resolve through native computation."""

import json
from pathlib import Path

import pytest
from engine.catalog import get_catalog
from engine.server import dispatch
from engine.formats import validate_project

ROOT = Path(__file__).resolve().parents[1]
GALLERY = json.loads((ROOT / 'ui' / 'welcome-gallery.json').read_text(encoding='utf-8'))
SAMPLES = sorted((ROOT / 'examples' / 'welcome').glob('*.polyproj'))


@pytest.mark.parametrize('entry', GALLERY, ids=lambda entry: entry['key'])
def test_gallery_models_resolve_to_real_native_catalog_geometry(entry):
    catalog = {record['key']: record for record in get_catalog()}
    assert entry['key'] in catalog
    assert catalog[entry['key']]['dimension'] == entry['dimension']
    model = dispatch({'op': 'generate', 'params': {'kind': 'regular', 'key': entry['key']}})
    assert model['dimension'] == entry['dimension']
    assert model['vertices'] and model['edges'] and model['faces']
    assert model['validation']['passed']


def test_sample_manifest_is_small_bundled_and_complete():
    assert len(SAMPLES) == 3
    source = (ROOT / 'ui' / 'welcome-samples.mjs').read_text(encoding='utf-8')
    for path in SAMPLES:
        assert path.name + '?raw' in source
        assert path.stat().st_size < 100_000


@pytest.mark.parametrize('path', SAMPLES, ids=lambda path: path.stem)
def test_sample_projects_validate_with_notes_geometry_and_saved_views(path):
    project = dispatch({'op': 'validate-project', 'params': {'project': json.loads(path.read_text(encoding='utf-8'))}})
    state = project['documents'][0]['states'][0]
    assert state['notes']
    assert state['view']['documentMetadata']['title']
    assert state['model']['validation']['passed']
    assert validate_project(project)['documents'][0]['cursor'] == 0
    if path.stem == 'paper-cube':
        assert '<svg' in state['netLayout']['svg']
        assert state['view']['net']['length'] == 25
    if path.stem == 'four-dimensional-sections':
        assert state['model']['dimension'] == 4
        assert state['view']['derivedMode'] == 'section'
