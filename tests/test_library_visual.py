"""Collection representatives use existing native generation, without opening documents."""

import json
import subprocess
from pathlib import Path
import pytest
from engine.catalog import get_catalog
from engine.server import dispatch

ROOT = Path(__file__).resolve().parents[1]
PROGRAM = "import {LIBRARY_COLLECTIONS} from './ui/library-collections.mjs';console.log(JSON.stringify(LIBRARY_COLLECTIONS.map(c=>c.representative).filter(Boolean)))"
KEYS = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', PROGRAM], cwd=ROOT, text=True))
assert len(KEYS) == 12, "Find all shipped collection representatives"


@pytest.mark.parametrize('key', KEYS)
def test_collection_representatives_have_real_native_geometry(key):
    entries = {entry['key']: entry for entry in get_catalog()}
    assert key in entries
    result = dispatch({'op': 'generate', 'params': {'kind': 'regular', 'key': key}})
    assert result['vertices'] and result['edges'] and result['faces']
    assert result['dimension'] == entries[key]['dimension']
    assert [len(result[k]) for k in ('vertices', 'edges', 'faces', 'cells')] == entries[key]['counts']
