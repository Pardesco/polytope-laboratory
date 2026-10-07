"""Inventory/download an anonymously accessible Drive OFF tree, without credentials.

Uses Drive's public embeddedfolderview listing (also used by gdown >=6), not
the regular folder bootstrap's first-page listing. No scripts are evaluated.
The manifest records the listing method; Google exposes no authoritative
total through this HTML endpoint, so inventory completeness is not certified.
"""
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from html.parser import HTMLParser
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

DEFAULT_FOLDER = '1DrGRp2SluE3nlMGaXgxdOXaXpOSLQOZi'
MAX_BYTES = 128 * 1024 * 1024
MAX_ENTRIES = 25000
MAX_FOLDERS = 1000
ID_PATTERN = re.compile(r'^[A-Za-z0-9_-]{10,200}$')


class DownloadError(ValueError):
    pass


def timestamp():
    return datetime.now(timezone.utc).isoformat()


def drive_id(value):
    if ID_PATTERN.fullmatch(value):
        return value
    parsed = urllib.parse.urlparse(value)
    if parsed.scheme != 'https' or parsed.hostname != 'drive.google.com':
        raise DownloadError('Provide a public drive.google.com folder URL or ID.')
    match = re.fullmatch(r'/drive/(?:u/\d+/)?folders/([\w-]+)', parsed.path.rstrip('/'))
    result = match.group(1) if match else urllib.parse.parse_qs(parsed.query).get('id', [''])[0]
    if not ID_PATTERN.fullmatch(result):
        raise DownloadError('Invalid Drive folder ID.')
    return result


def safe_component(name):
    if (not name or name in ('.', '..') or name[-1] in '. '
            or re.search(r'[<>:"/\\|?*\x00-\x1f]', name)
            or re.fullmatch(r'(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?', name, re.I)):
        raise DownloadError(f'Unsafe or nonportable source filename: {name!r}')
    return name


def _comparison_path(path):
    # Windows non-strict resolution can retain the extended-length prefix if a
    # missing parent is concurrently created by another download worker. Both
    # spellings identify the same resolved location; normalize only the known
    # drive/UNC forms before checking containment, never skip link resolution.
    text = str(path)
    if os.name == 'nt':
        if text.startswith('\\\\?\\UNC\\'):
            return Path('\\\\' + text[8:])
        if text.startswith('\\\\?\\') and re.match(r'^[A-Za-z]:\\', text[4:]):
            return Path(text[4:])
    return path


def safe_target(root, relative):
    parts = relative.split('/')
    if any(safe_component(part) != part for part in parts):
        raise DownloadError('Invalid download path.')
    resolved = _comparison_path(root.resolve())
    target = root.joinpath(*parts)
    try:
        _comparison_path(target.resolve()).relative_to(resolved)
    except ValueError as exc:
        raise DownloadError('Download path escapes its destination root.') from exc
    return target


class FolderParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.children = []
        self.entry_count = 0
        self.has_listing = False
        self.closed = False
        self.link = None
        self.text = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'div':
            classes = attrs.get('class', '').split()
            self.has_listing |= 'flip-entries' in classes
            if 'flip-entry' in classes:
                self.entry_count += 1
        if tag == 'a':
            href = attrs.get('href', '')
            parsed = urllib.parse.urlparse(href)
            self.link = None
            if parsed.scheme == 'https' and parsed.hostname == 'drive.google.com':
                folder = re.fullmatch(r'/drive/(?:u/\d+/)?folders/([\w-]+)', parsed.path.rstrip('/'))
                file = re.fullmatch(r'/file/d/([\w-]+)/view', parsed.path.rstrip('/'))
                if folder or file:
                    self.link = ((folder or file).group(1), 'folder' if folder else 'file')
            elif parsed.scheme == 'https' and parsed.hostname == 'docs.google.com':
                native = re.match(r'/[^/]+/d/([\w-]+)/', parsed.path)
                if native:
                    self.link = (native.group(1), 'google-native')
            self.text = []

    def handle_data(self, data):
        if self.link:
            self.text.append(data)

    def handle_endtag(self, tag):
        if tag == 'a' and self.link:
            item_id, kind = self.link
            if not ID_PATTERN.fullmatch(item_id):
                raise DownloadError('Unexpected Drive item identifier.')
            self.children.append({'id': item_id, 'name': ''.join(self.text).strip(), 'kind': kind})
            self.link = None
        if tag == 'html':
            self.closed = True


def parse_folder(html):
    parser = FolderParser()
    parser.feed(html)
    if not parser.has_listing or not parser.closed:
        raise DownloadError('Public folder listing is unavailable or truncated; sign-in/access pages are not downloaded.')
    if parser.entry_count != len(parser.children):
        raise DownloadError('Folder listing contains unrecognized entries; refusing a partial inventory.')
    if re.search(r'nextPageToken|show more|load more', html, re.I):
        raise DownloadError('Folder listing advertises pagination; refusing a partial inventory.')
    if len({item['id'] for item in parser.children}) != len(parser.children):
        raise DownloadError('Duplicate identifiers in public folder listing.')
    for item in parser.children:
        safe_component(item['name'])
    return parser.children


def fetch(url, limit=MAX_BYTES, retries=2):
    for attempt in range(retries + 1):
        try:
            request = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 PolytopeLibraryDownloader/1.0'})
            with urllib.request.urlopen(request, timeout=45) as response:
                final = urllib.parse.urlparse(response.url)
                if final.hostname not in ('drive.google.com', 'drive.usercontent.google.com'):
                    raise DownloadError('Public download redirected outside supported Drive hosts; no authentication is attempted.')
                declared = response.headers.get('Content-Length')
                if declared and int(declared) > limit:
                    raise DownloadError('Response exceeds the bounded download size.')
                data = response.read(limit + 1)
                if len(data) > limit:
                    raise DownloadError('Response exceeds the bounded download size.')
                if declared and int(declared) != len(data):
                    raise DownloadError('Response length differs from its declared Content-Length.')
                return data
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            if isinstance(exc, urllib.error.HTTPError) and exc.code not in (429, 500, 502, 503, 504):
                raise DownloadError(f'Public Drive request denied (HTTP {exc.code}); no authentication is attempted.') from exc
            if attempt == retries:
                raise DownloadError(f'Public Drive request failed: {exc}') from exc
            time.sleep(min(2 ** attempt, 4))


def inventory(folder_id, workers=4, fetcher=fetch):
    pending = [(folder_id, '')]
    visited = set()
    folders = []
    files = []
    ignored = []
    with ThreadPoolExecutor(max_workers=workers) as pool:
        while pending:
            batch = pending
            pending = []
            tasks = {}
            for item_id, relative in batch:
                if item_id in visited:
                    raise DownloadError('Repeated folder/cycle in Drive tree; refusing an ambiguous inventory.')
                visited.add(item_id)
                if len(visited) > MAX_FOLDERS:
                    raise DownloadError('Drive tree exceeds the folder resource limit.')
                url = 'https://drive.google.com/embeddedfolderview?' + urllib.parse.urlencode({'id': item_id})
                tasks[pool.submit(fetcher, url)] = (item_id, relative, url)
            for task in as_completed(tasks):
                item_id, relative, url = tasks[task]
                data = task.result()
                children = parse_folder(data.decode('utf-8'))
                folders.append({'id': item_id, 'relativePath': relative, 'sourceUrl': url,
                                'listingSha256': hashlib.sha256(data).hexdigest(), 'entryCount': len(children)})
                names = set()
                for child in children:
                    name = child['name']
                    if name.casefold() in names:
                        raise DownloadError(f'Duplicate portable filename in folder {relative}: {name}')
                    names.add(name.casefold())
                    child = {**child, 'relativePath': '/'.join(filter(None, (relative, name))), 'parentId': item_id}
                    if child['kind'] == 'folder':
                        pending.append((child['id'], child['relativePath']))
                    elif child['kind'] == 'file' and name.lower().endswith('.off'):
                        child['sourceUrl'] = f"https://drive.google.com/file/d/{child['id']}/view"
                        files.append(child)
                    else:
                        ignored.append(child)
                if len(files) + len(ignored) > MAX_ENTRIES:
                    raise DownloadError('Drive tree exceeds the file resource limit.')
    return {'schemaVersion': 1, 'sourceFolderId': folder_id,
            'sourceUrl': f'https://drive.google.com/drive/folders/{folder_id}',
            'inventoriedAt': timestamp(), 'listingMethod': 'public-embeddedfolderview-unpaginated',
            'listingCompleteness': 'All parsed embedded-view entries traversed; Google provides no independent authoritative total through this endpoint.',
            'folders': sorted(folders, key=lambda x: x['relativePath']),
            'files': sorted(files, key=lambda x: x['relativePath']), 'ignored': ignored}


def off_marker(data):
    try:
        text = data.decode('utf-8-sig')
    except UnicodeDecodeError as exc:
        raise DownloadError('Downloaded OFF file is not UTF-8 text.') from exc
    for line in text.splitlines():
        token = line.split('#', 1)[0].strip()
        if token:
            if not re.fullmatch(r'[A-Za-z0-9]*OFF', token):
                raise DownloadError('Download is not OFF geometry (possibly a Drive access or quota page).')
            return token
    raise DownloadError('Downloaded OFF file is empty.')


def write_manifest(root, manifest):
    target = safe_target(root, 'download-manifest.json')
    root.mkdir(parents=True, exist_ok=True)
    pending = safe_target(root, 'download-manifest.json.pending')
    pending.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding='utf-8')
    pending.replace(target)


def download_one(root, entry, previous=None, fetcher=fetch):
    target = safe_target(root, entry['relativePath'])
    if (previous and previous.get('id') == entry['id'] and previous.get('sha256') and target.is_file()
            and target.stat().st_size <= MAX_BYTES):
        data = target.read_bytes()
        if hashlib.sha256(data).hexdigest() == previous['sha256']:
            return {**entry, 'status': 'downloaded', 'bytes': len(data), 'sha256': previous['sha256'],
                    'marker': off_marker(data), 'downloadedAt': previous.get('downloadedAt'), 'resumed': True}
    url = 'https://drive.google.com/uc?' + urllib.parse.urlencode({'export': 'download', 'id': entry['id']})
    data = fetcher(url)
    marker = off_marker(data)
    target.parent.mkdir(parents=True, exist_ok=True)
    # Recheck after directory creation and before touching an existing file.
    target = safe_target(root, entry['relativePath'])
    pending = safe_target(root, entry['relativePath'] + '.download-pending')
    pending.write_bytes(data)
    pending.replace(target)
    return {**entry, 'status': 'downloaded', 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(),
            'marker': marker, 'downloadedAt': timestamp(), 'downloadUrl': url, 'resumed': False}


def download_inventory(root, manifest, workers=4, limit=None, fetcher=fetch):
    previous = {}
    old = safe_target(root, 'download-manifest.json')
    if old.exists():
        loaded = json.loads(old.read_text(encoding='utf-8'))
        if loaded.get('sourceFolderId') == manifest['sourceFolderId']:
            previous = {item['relativePath']: item for item in loaded.get('files', [])}
    entries = manifest['files']
    manifest['files'] = [{**item, 'status': 'pending'} for item in entries]
    manifest['downloadComplete'] = False
    write_manifest(root, manifest)
    selected = list(enumerate(entries))[:limit]
    start = time.monotonic()
    with ThreadPoolExecutor(max_workers=workers) as pool:
        tasks = {pool.submit(download_one, root, entry, previous.get(entry['relativePath']), fetcher): index
                 for index, entry in selected}
        for count, task in enumerate(as_completed(tasks), 1):
            index = tasks[task]
            try:
                manifest['files'][index] = task.result()
            except Exception as exc:
                manifest['files'][index] = {**entries[index], 'status': 'failed', 'error': str(exc)}
            if count % 25 == 0 or count == len(selected):
                write_manifest(root, manifest)
                print(f'Downloaded/checked {count}/{len(selected)} files in {time.monotonic()-start:.1f}s', flush=True)
    statuses = [item['status'] for item in manifest['files']]
    manifest['downloadComplete'] = all(status == 'downloaded' for status in statuses)
    manifest['updatedAt'] = timestamp()
    manifest['stats'] = {'folders': len(manifest['folders']), 'offFiles': len(statuses),
                         'downloaded': statuses.count('downloaded'), 'failed': statuses.count('failed'),
                         'pending': statuses.count('pending'), 'bytes': sum(item.get('bytes', 0) for item in manifest['files']),
                         'transferElapsedSeconds': round(time.monotonic()-start, 1), 'workers': workers,
                         'resumeVerifiedFiles': sum(bool(item.get('resumed')) for item in manifest['files'])}
    write_manifest(root, manifest)
    return manifest['stats']


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--folder', default=DEFAULT_FOLDER)
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1]/'data'/'drive-uniforms')
    parser.add_argument('--workers', type=int, default=4)
    parser.add_argument('--inventory-only', action='store_true')
    parser.add_argument('--limit', type=int, help='Download only this many files, explicitly leaving the manifest incomplete.')
    args = parser.parse_args(argv)
    if not 1 <= args.workers <= 8 or args.limit is not None and args.limit < 1:
        parser.error('Workers must be 1-8 and the optional download limit must be positive.')
    manifest = inventory(drive_id(args.folder), args.workers)
    print(f"Inventoried {len(manifest['folders'])} folders, {len(manifest['files'])} OFF files, {len(manifest['ignored'])} ignored files.", flush=True)
    print(manifest['listingCompleteness'], flush=True)
    if args.inventory_only:
        root = args.output
        root.mkdir(parents=True, exist_ok=True)
        target = safe_target(root, 'inventory-manifest.json')
        target.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding='utf-8')
        return 0
    stats = download_inventory(args.output, manifest, args.workers, args.limit)
    print(json.dumps(stats), flush=True)
    return 0 if manifest['downloadComplete'] else 1


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (DownloadError, OSError, ValueError) as exc:
        print(f'Library download stopped: {exc}', file=sys.stderr)
        sys.exit(2)
