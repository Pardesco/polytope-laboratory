from copy import deepcopy
import hashlib
import os
from pathlib import Path

import pytest

from engine.formats import export_off, load_file
from engine.generators import regular
from engine.geometry import GeometryError, identity
from engine.library import index_library
import engine.library as library
from engine.server import dispatch


def write(root, relative, text):
    path = root / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding='utf-8')
    return path


def test_recursive_header_index_preserves_path_hash_and_protocol(tmp_path, monkeypatch):
    source = export_off(regular('cross4'))
    four = write(tmp_path, '4D/regular/16-cell.off', source)
    three = write(tmp_path, '3D/uniform/Cube.OFF', '\ufeff# comment\nOFF\n# counts\n8 6 12 # inline\n')
    write(tmp_path, 'ignored.txt', source)
    # Header indexing must never execute geometry; even an incomplete body's row
    # remains an explicit header-only candidate for deferred full validation.
    monkeypatch.setattr('engine.formats.hull', lambda *args, **kwargs: pytest.fail('Index reconstructed geometry'))
    entries = dispatch({'op': 'library', 'params': {'path': str(tmp_path)}})
    assert len(entries) == 2
    by_file = {entry['key']: entry for entry in entries}
    row = by_file[str(four)]
    assert row['counts'] == [8, 24, 32, 16] and row['dimension'] == 4
    assert row['headerCounts'] == [8, 32, 24, 16]
    assert row['sourceCategory'] == '4D/regular' and not row['categoryVerified']
    assert row['family'] == 'Local OFF · 4D/regular'
    assert row['supported'] and row['status'] == 'ready' and row['validation'] == 'header-only'
    assert row['filePath'] == str(four) and row['relativePath'] == '4D/regular/16-cell.off'
    assert row['sourceHash'] == hashlib.sha256(four.read_bytes()).hexdigest()
    assert by_file[str(three)]['counts'] == [8, 12, 6, 0]
    assert [entry['key'] for entry in index_library(tmp_path)] == [entry['key'] for entry in entries]


def test_identical_counts_and_skeletons_keep_distinct_topology_and_file_identity(tmp_path):
    base = regular('cross4')
    variant = deepcopy(base)
    variant['interpretation'] = 'generalized-complex'
    variant['cells'][0] = variant['cells'][0][:-1]
    first = write(tmp_path, 'a/base.off', export_off(base))
    second = write(tmp_path, 'b/variant.off', export_off(variant))
    third = write(tmp_path, 'c/copy.off', export_off(base))
    entries = index_library(tmp_path)
    assert len(entries) == len({entry['id'] for entry in entries}) == 3
    assert len({tuple(entry['counts']) for entry in entries}) == 1
    by_key = {entry['key']: entry for entry in entries}
    assert by_key[str(first)]['sourceHash'] == by_key[str(third)]['sourceHash']
    assert by_key[str(first)]['sourceHash'] != by_key[str(second)]['sourceHash']
    loaded = [load_file(path)['model'] for path in (first, second)]
    assert loaded[0]['vertices'] == loaded[1]['vertices'] and loaded[0]['edges'] == loaded[1]['edges']
    assert loaded[0]['faces'] == loaded[1]['faces'] and loaded[0]['cells'] != loaded[1]['cells']
    assert identity(loaded[0]) != identity(loaded[1])


def test_identity_survives_changed_file_content_and_separates_roots(tmp_path):
    root = tmp_path / 'one'
    path = write(root, 'shape.off', 'OFF\n4 4 6\n')
    original = index_library(root)[0]
    path.write_text('OFF\n8 6 12\n', encoding='utf-8')
    changed = index_library(root)[0]
    other = tmp_path / 'two'
    write(other, 'shape.off', path.read_text(encoding='utf-8'))
    assert original['id'] == changed['id'] and original['sourceHash'] != changed['sourceHash']
    assert changed['id'] != index_library(other)[0]['id']


@pytest.mark.parametrize('text,dimension,counts,header', [
    ('0OFF\n', 0, [1, 0, 0, 0], []),
    ('1OFF\n# vertices\n2\n-.5\n.5\n', 1, [2, 0, 0, 0], [2]),
    ('2OFF\n5 5\n', 2, [5, 5, 0, 0], [5, 5]),
    ('5OFF\n90 420 360 180 32\n', 5, [90, 360, 420, 180], [90, 420, 360, 180, 32]),
])
def test_unsupported_dimensions_remain_searchable_and_explicit(tmp_path, text, dimension, counts, header):
    write(tmp_path, 'unsupported.off', text)
    row = index_library(tmp_path)[0]
    assert row['dimension'] == dimension and row['counts'] == counts and row['headerCounts'] == header
    assert row['status'] == 'unsupported-dimension' and not row['supported']
    assert 'supports 3D and 4D' in row['diagnostic']


@pytest.mark.parametrize('text', ['garbage\n4 4 6\n', 'OFF\n', 'OFF\na 4 6\n',
                                        '4OFF\n8 32 24\n', 'OFF\n4 -1 6\n', 'OFF\n0 0 0\n',
                                        'OFF\n4 1000001 6\n', '#' + 'x' * 70000 + '\nOFF\n4 4 6\n'],
                         ids=['marker', 'missing', 'integer', 'length', 'negative', 'zero', 'count-limit', 'header-limit'])
def test_invalid_headers_have_diagnostics_without_aborting_other_entries(tmp_path, text):
    write(tmp_path, 'bad.off', text)
    write(tmp_path, 'good.off', 'OFF\n4 4 6\n')
    rows = {row['name']: row for row in index_library(tmp_path)}
    assert rows['bad']['status'] == 'invalid-header' and not rows['bad']['supported']
    assert rows['bad']['diagnostic'] and rows['bad']['sourceHash']
    assert rows['good']['supported']


def test_resource_bounds_and_missing_directory_are_explicit(tmp_path, monkeypatch):
    write(tmp_path, 'one.off', 'OFF\n4 4 6\n')
    write(tmp_path, 'two.off', 'OFF\n20001 0 0\n')
    with pytest.raises(GeometryError, match='existing directory'):
        index_library(tmp_path / 'missing')
    with pytest.raises(GeometryError, match='exceeds 1 entries'):
        index_library(tmp_path, max_entries=1)
    with pytest.raises(GeometryError, match='entry limit'):
        index_library(tmp_path, max_entries=True)
    assert next(row for row in index_library(tmp_path) if row['name'] == 'two')['status'] == 'resource-limit'
    monkeypatch.setattr(library, 'MAX_LIBRARY_HASH_BYTES', 1)
    entries = index_library(tmp_path)
    assert len(entries) == 2 and entries[0]['supported']
    assert all(row['sourceHash'] is None and row['hashStatus'] == 'not-computed-budget' for row in entries)
    monkeypatch.setattr(library, 'MAX_LIBRARY_SCAN_ENTRIES', 1)
    with pytest.raises(GeometryError, match='scan limit'):
        index_library(tmp_path)


def test_file_byte_limit_is_checked_before_reading(tmp_path, monkeypatch):
    write(tmp_path, 'large.off', 'OFF\n4 4 6\n')
    monkeypatch.setattr(library, 'MAX_FILE_BYTES', 4)
    row = index_library(tmp_path)[0]
    assert row['status'] == 'resource-limit' and row['sourceHash'] is None


def test_large_files_skip_hashing_but_still_index_their_headers(tmp_path, monkeypatch):
    write(tmp_path, 'large.off', 'OFF\n4 4 6\n' + 'a' * 200)
    monkeypatch.setattr(library, 'MAX_LIBRARY_HASH_FILE_BYTES', 100)
    row = index_library(tmp_path)[0]
    assert row['supported'] and row['counts'] == [4, 6, 4, 0]
    assert row['hashStatus'] == 'not-computed-size' and row['sourceHash'] is None


def test_links_cannot_escape_root_and_directory_links_are_not_followed(tmp_path):
    root = tmp_path / 'root'
    original = write(root, 'real/shape.off', 'OFF\n4 4 6\n')
    outside = write(tmp_path, 'outside/private.off', 'OFF\n8 6 12\n')
    try:
        os.symlink(outside, root / 'escape.off')
        os.symlink(original, root / 'inside.off')
        os.symlink(outside.parent, root / 'outside-directory', target_is_directory=True)
        os.symlink(root, root / 'recursive-directory', target_is_directory=True)
    except OSError as exc:
        pytest.skip('This system does not permit creating test symlinks: ' + str(exc))
    rows = {row['relativePath']: row for row in index_library(root)}
    assert set(rows) == {'real/shape.off', 'escape.off', 'inside.off'}
    assert rows['escape.off']['status'] == 'unsafe-path' and not rows['escape.off']['supported']
    assert rows['escape.off']['sourceHash'] is None
    assert rows['inside.off']['supported'] and rows['inside.off']['resolvedPath'] == str(original.resolve())
    assert rows['inside.off']['id'] != rows['real/shape.off']['id']


@pytest.mark.skipif(os.name == 'nt', reason='Windows does not provide POSIX named pipes.')
def test_nonregular_off_is_rejected_before_blocking_open(tmp_path):
    os.mkfifo(tmp_path / 'pipe.off')
    row = index_library(tmp_path)[0]
    assert row['status'] == 'unreadable' and row['sourceHash'] is None
