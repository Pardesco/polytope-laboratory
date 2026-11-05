"""Collection representatives use existing native generation, without opening documents."""
import re
from pathlib import Path
import pytest
from engine.catalog import get_catalog
from engine.server import dispatch

SOURCE = (Path(__file__).resolve().parents[1] / 'ui' / 'library-collections.mjs').read_text(encoding='utf-8')
KEYS = re.findall(r"representative:'([^']+)'", SOURCE)


@pytest.mark.parametrize('key', KEYS)
def test_collection_representatives_have_real_native_geometry(key):
    entries = {entry['key']: entry for entry in get_catalog()}
    assert key in entries
    result = dispatch({'op': 'generate', 'params': {'kind': 'regular', 'key': key}})
    assert result['vertices'] and result['edges'] and result['faces']
    assert result['dimension'] == entries[key]['dimension']
    assert [len(result[k]) for k in ('vertices', 'edges', 'faces', 'cells')] == entries[key]['counts']
