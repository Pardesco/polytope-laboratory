import hashlib
import importlib.util
import json
import os
from pathlib import Path
import urllib.error

import pytest

spec = importlib.util.spec_from_file_location('drive_download', Path(__file__).resolve().parents[1]/'scripts'/'download-drive-library.py')
drive = importlib.util.module_from_spec(spec)
spec.loader.exec_module(drive)

ROOT_ID = 'public_root_1234'
CHILD_ID = 'public_child_1234'
OFF = b'# public fixture\n4OFF\n1 0 0 0\n0 0 0 0\n'


def listing(items):
    rows = []
    for item_id, name, folder in items:
        path = f'drive/folders/{item_id}' if folder else f'file/d/{item_id}/view'
        rows.append(f'<div class="flip-entry" id="entry-{item_id}"><a href="https://drive.google.com/{path}"><div>{name}</div></a></div>')
    return ('<html><head><title>Public library</title></head><body><div class="flip-entries">'
            + ''.join(rows) + '</div></body></html>').encode()


def file_entry(name='model.off', item_id='public_file_1234'):
    return {'id': item_id, 'name': name, 'relativePath': 'Cat1/'+name,
            'kind': 'file', 'parentId': ROOT_ID, 'sourceUrl': 'https://drive.google.com/file/d/'+item_id+'/view'}


def manifest(entries):
    return {'sourceFolderId': ROOT_ID, 'folders': [{'id': ROOT_ID}], 'files': entries}


def test_embedded_listing_above_former_50_entry_limit_is_not_truncated():
    entries = [('public_file_%04d'%i, f'{i:03d}.off', False) for i in range(75)]
    parsed = drive.parse_folder(listing(entries).decode())
    assert len(parsed) == 75
    assert parsed[-1]['name'] == '074.off'


@pytest.mark.parametrize('html', [
    '<html><body>Sign in to continue</body></html>',
    '<html><div class="flip-entries">',
    '<html><div class="flip-entries"><div class="flip-entry">Unknown item</div></div></html>',
    '<html><div class="flip-entries">load more</div></html>',
])
def test_access_truncated_unrecognized_or_paginated_pages_are_rejected(html):
    with pytest.raises(drive.DownloadError):
        drive.parse_folder(html)


@pytest.mark.parametrize('name', ['..', '../escape.off', 'C:\\escape.off', 'CON.off', 'x.off ', 'x.off.', 'a/b.off'])
def test_untrusted_names_cannot_escape_or_alias_destination(name):
    with pytest.raises(drive.DownloadError):
        drive.safe_component(name)


def test_recursive_inventory_preserves_layout_and_ignored_files():
    pages = {
        ROOT_ID: listing([(CHILD_ID, 'Cat1', True), ('readme_file_1234', 'readme.txt', False)]),
        CHILD_ID: listing([('public_file_1234', '001-shape.off', False)]),
    }
    result = drive.inventory(ROOT_ID, fetcher=lambda url: pages[url.split('id=')[1]])
    assert len(result['folders']) == 2
    assert result['files'][0]['relativePath'] == 'Cat1/001-shape.off'
    assert result['ignored'][0]['name'] == 'readme.txt'
    assert result['folders'][0]['listingSha256'] == hashlib.sha256(pages[ROOT_ID]).hexdigest()
    assert 'no independent authoritative total' in result['listingCompleteness']


def test_recursive_cycle_and_casefold_name_collisions_are_rejected():
    with pytest.raises(drive.DownloadError, match='Repeated folder/cycle'):
        drive.inventory(ROOT_ID, fetcher=lambda url: listing([(ROOT_ID, 'Cycle', True)]))
    with pytest.raises(drive.DownloadError, match='Duplicate portable filename'):
        drive.inventory(ROOT_ID, fetcher=lambda url: listing([
            ('public_file_1234', 'a.off', False), ('public_file_5678', 'A.off', False)]))


def test_hash_verified_resume_and_corruption_redownload(tmp_path):
    entry = file_entry()
    result = drive.download_one(tmp_path, entry, fetcher=lambda url: OFF)
    assert result['sha256'] == hashlib.sha256(OFF).hexdigest()
    assert result['bytes'] == len(OFF) and result['marker'] == '4OFF'
    def forbidden_fetch(url):
        raise AssertionError('Matching local hash should resume without downloading.')
    resumed = drive.download_one(tmp_path, entry, result, forbidden_fetch)
    assert resumed['resumed']
    target = tmp_path/'Cat1'/'model.off'
    target.write_bytes(b'corrupted')
    repaired = drive.download_one(tmp_path, entry, result, lambda url: OFF)
    assert not repaired['resumed']
    assert target.read_bytes() == OFF


def test_bad_download_never_replaces_existing_geometry(tmp_path):
    entry = file_entry()
    target = tmp_path/'Cat1'/'model.off'
    target.parent.mkdir()
    target.write_bytes(OFF)
    with pytest.raises(drive.DownloadError, match='not OFF geometry'):
        drive.download_one(tmp_path, entry, fetcher=lambda url: b'<html>Download quota exceeded</html>')
    assert target.read_bytes() == OFF


def test_partial_limit_is_explicit_and_full_rerun_resumes(tmp_path):
    entries = [file_entry('a.off'), file_entry('b.off', 'public_file_5678')]
    partial = manifest(entries)
    stats = drive.download_inventory(tmp_path, partial, limit=1, fetcher=lambda url: OFF)
    assert stats['downloaded'] == 1 and stats['pending'] == 1
    assert not partial['downloadComplete']
    full = manifest(entries)
    stats = drive.download_inventory(tmp_path, full, fetcher=lambda url: OFF)
    assert stats['downloaded'] == 2 and not stats['pending']
    assert full['downloadComplete'] and full['files'][0]['resumed']
    assert json.loads((tmp_path/'download-manifest.json').read_text())['downloadComplete']


def test_failed_file_is_retained_as_failure_and_other_files_continue(tmp_path):
    entries = [file_entry('a.off'), file_entry('b.off', 'public_file_5678')]
    def fetcher(url):
        if 'public_file_5678' in url:
            raise drive.DownloadError('Public access denied')
        return OFF
    result = manifest(entries)
    stats = drive.download_inventory(tmp_path, result, fetcher=fetcher)
    assert stats['downloaded'] == 1 and stats['failed'] == 1
    assert not result['downloadComplete']
    assert result['files'][1]['error'] == 'Public access denied'


@pytest.mark.skipif(os.name != 'nt', reason='Windows extended-length path spellings.')
def test_concurrent_parent_creation_extended_prefix_preserves_root_containment(tmp_path, monkeypatch):
    target = tmp_path / 'Cat1' / 'model.off'
    original_resolve = Path.resolve

    def raced_resolve(path, *args, **kwargs):
        resolved = original_resolve(path, *args, **kwargs)
        return Path('\\\\?\\' + str(resolved)) if path == target else resolved

    monkeypatch.setattr(Path, 'resolve', raced_resolve)
    assert drive.safe_target(tmp_path, 'Cat1/model.off') == target
    assert drive._comparison_path(Path('\\\\?\\UNC\\server\\share\\folder')) == Path('\\\\server\\share\\folder')


@pytest.mark.skipif(os.name != 'nt', reason='Windows extended-length path spellings.')
def test_extended_prefix_normalization_keeps_escaped_targets_rejected(tmp_path, monkeypatch):
    root = tmp_path / 'downloads'
    root.mkdir()
    target = root / 'Cat1' / 'model.off'
    outside = tmp_path / 'outside' / 'model.off'
    original_resolve = Path.resolve

    def escaped_resolve(path, *args, **kwargs):
        if path == target:
            return Path('\\\\?\\' + str(outside))
        return original_resolve(path, *args, **kwargs)

    monkeypatch.setattr(Path, 'resolve', escaped_resolve)
    with pytest.raises(drive.DownloadError, match='escapes'):
        drive.safe_target(root, 'Cat1/model.off')


def test_http_permission_denial_is_not_retried_or_authenticated(monkeypatch):
    calls = []
    def denied(request, timeout):
        calls.append(request)
        raise urllib.error.HTTPError(request.full_url, 403, 'Forbidden', {}, None)
    monkeypatch.setattr(drive.urllib.request, 'urlopen', denied)
    with pytest.raises(drive.DownloadError, match='HTTP 403.*no authentication'):
        drive.fetch('https://drive.google.com/uc?id=public_file_1234')
    assert len(calls) == 1


def test_size_limit_rejects_response_before_read(monkeypatch):
    class Response:
        url = 'https://drive.usercontent.google.com/download?id=public_file_1234'
        headers = {'Content-Length': '1000'}
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def read(self, size): raise AssertionError('Oversized response should not be read.')
    monkeypatch.setattr(drive.urllib.request, 'urlopen', lambda *args, **kwargs: Response())
    with pytest.raises(drive.DownloadError, match='bounded download size'):
        drive.fetch('https://drive.google.com/uc?id=public_file_1234', limit=100)
