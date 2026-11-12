"""Discovery browse policy must not remove native catalog/project identities."""

import hashlib
import json
from pathlib import Path

from engine.formats import load_file, save_project
from engine.server import dispatch

DATA = Path(__file__).resolve().parents[1] / 'engine/catalog_data/miratope_expanded'
KEY = 'miratope-expanded-566e5191f872ee9b6930'


def test_full_native_catalog_keeps_discovery_keys_and_classification_metadata():
    entries = dispatch({'op': 'catalog'})
    candidates = [row for row in entries if row.get('family') == '4D discovery candidates']
    assert len(candidates) == 908
    assert all(row['classificationVerified'] is False for row in candidates)
    assert KEY in {row['key'] for row in candidates}


def test_direct_generate_and_saved_project_preserve_pinned_discovery_source(tmp_path):
    manifest = json.loads((DATA / 'manifest.json').read_text(encoding='utf-8'))
    entry = next(row for row in manifest['entries'] if row['key'] == KEY)
    model = dispatch({'op': 'generate', 'params': {'kind': 'regular', 'key': KEY}})
    assert model['metadata']['key'] == KEY
    assert model['metadata']['family'] == '4D discovery candidates'
    assert model['metadata']['classificationVerified'] is False
    assert [len(model[field]) for field in ('vertices', 'edges', 'faces', 'cells')] == entry['counts']
    source = model['provenance']['expandedCatalogSource']
    assert source['sha256'] == hashlib.sha256((DATA / entry['file']).read_bytes()).hexdigest() == entry['sha256']
    project = {
        'format': 'polytope-laboratory',
        'version': 1,
        'active': 0,
        'documents': [{'cursor': 0, 'states': [{'model': model, 'view': {}}]}],
    }
    path = tmp_path / 'discovery.polyproj'
    save_project(path, project)
    restored = load_file(path)['project']['documents'][0]['states'][0]['model']
    assert restored['id'] == model['id']
    assert restored['fingerprint'] == model['fingerprint']
    assert restored['metadata'] == model['metadata']
    assert restored['provenance']['expandedCatalogSource'] == source
