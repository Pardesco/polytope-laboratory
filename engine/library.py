"""Recursive header-only indexing of an authorized local OFF directory.

No geometry is reconstructed. Files retain separate identity even when their
headers, coordinates, or complete contents match. Full validation occurs on load.
"""
import hashlib
import os
from pathlib import Path
import re
import stat
from .formats import MAX_FILE_BYTES
from .geometry import GeometryError, MAX_VERTICES

MAX_LIBRARY_ENTRIES = 10000
MAX_LIBRARY_SCAN_ENTRIES = 100000
MAX_LIBRARY_HASH_BYTES = 64 * 1024 * 1024
MAX_LIBRARY_HASH_FILE_BYTES = 1024 * 1024
MAX_VERIFIED_LIBRARY_HASH_BYTES = 4 * 1024 * 1024 * 1024
MAX_HEADER_BYTES = 64 * 1024


def _within(path, root):
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


def _header(stream):
    consumed = 0

    def record():
        nonlocal consumed
        while consumed < MAX_HEADER_BYTES:
            line = stream.readline(min(MAX_HEADER_BYTES - consumed + 1, 16385))
            if not line:
                return None
            consumed += len(line)
            if consumed > MAX_HEADER_BYTES or len(line) > 16384:
                raise GeometryError('OFF header exceeds the bounded metadata read limit.')
            text = line.decode('utf-8-sig').split('#', 1)[0].strip()
            if text:
                return text
        raise GeometryError('OFF header exceeds the bounded metadata read limit.')

    marker = record()
    match = re.fullmatch(r'(?:(\d{1,2}))?OFF', marker or '')
    if not match:
        raise GeometryError('Expected an OFF or dimension-prefixed OFF marker.')
    dimension = int(match.group(1)) if match.group(1) is not None else 3
    if dimension == 0:
        # Miratope's point format contains only its marker: one implicit point.
        return marker, dimension, [], [1, 0, 0, 0]
    row = record()
    if row is None:
        raise GeometryError('Missing OFF count header.')
    try:
        declared = [int(x) for x in row.split()]
    except ValueError as exc:
        raise GeometryError('OFF count header must contain integers.') from exc
    if len(declared) != dimension or any(x < 0 for x in declared) or declared[0] == 0:
        raise GeometryError('OFF count header has the wrong length or invalid element counts.')
    if any(x > 1000000 for x in declared):
        raise GeometryError('OFF element counts exceed import resource limits.')
    counts = [declared[0], declared[2] if dimension >= 3 else (declared[1] if dimension == 2 else 0),
              declared[1] if dimension >= 3 else 0, declared[3] if dimension >= 4 else 0]
    return marker, dimension, declared, counts


def index_library(path, max_entries=MAX_LIBRARY_ENTRIES, audit_path=None, verify_audit_hashes=False):
    """Return compatible catalog rows, including diagnostic unsupported entries.

    Absolute file keys retain existing load IPC. IDs identify normalized paths;
    sourceHash identifies bytes. Directory links/junctions are not followed.
    Escaped file links are diagnosed without reading their targets. Desktop code
    is responsible for authorizing the root and rechecking paths when loading.
    """
    if type(max_entries) is not int or not 1 <= max_entries <= MAX_LIBRARY_ENTRIES:
        raise GeometryError('Library entry limit must be in 1–10,000.')
    if type(verify_audit_hashes) is not bool:
        raise GeometryError('Explicit audit hash verification must be a boolean.')
    hash_budget = MAX_VERIFIED_LIBRARY_HASH_BYTES if verify_audit_hashes else MAX_LIBRARY_HASH_BYTES
    hash_file_limit = MAX_FILE_BYTES if verify_audit_hashes else MAX_LIBRARY_HASH_FILE_BYTES
    root = Path(path).expanduser().resolve()
    if not root.is_dir():
        raise GeometryError('Linked OFF library path must be an existing directory.')
    files, scanned = [], 0

    def walk_error(exc):
        raise GeometryError('Cannot scan linked OFF directory: ' + str(exc)) from exc

    for directory, subdirs, names in os.walk(root, followlinks=False, onerror=walk_error):
        scanned += len(subdirs) + len(names)
        if scanned > MAX_LIBRARY_SCAN_ENTRIES:
            raise GeometryError('Linked OFF directory exceeds the 100,000-item scan limit.')
        base = Path(directory)
        retained = []
        for name in sorted(subdirs, key=lambda value: (value.casefold(), value)):
            child = base / name
            try:
                resolved = child.resolve()
                if not child.is_symlink() and resolved == child and _within(resolved, root):
                    retained.append(name)
            except (OSError, RuntimeError):
                continue
        subdirs[:] = retained
        for name in names:
            if Path(name).suffix.lower() == '.off':
                files.append(base / name)
                if len(files) > max_entries:
                    raise GeometryError(f'Catalog folder exceeds {max_entries:,} entries.')
    files.sort(key=lambda item: (item.relative_to(root).as_posix().casefold(), item.relative_to(root).as_posix()))
    results, hashed_bytes = [], 0
    for file in files:
        relative = file.relative_to(root)
        category = relative.parent.as_posix() if relative.parent != Path('.') else 'Uncategorized'
        filename = str(file)
        entry = {
            'key': filename, 'filePath': filename,
            'id': hashlib.sha256(os.path.normcase(filename).encode('utf-8')).hexdigest(),
            'name': file.stem, 'family': 'Local OFF · ' + category,
            'category': category, 'sourceCategory': category, 'categoryVerified': False,
            'relativePath': relative.as_posix(), 'libraryRoot': str(root),
            'external': True, 'dimension': None, 'counts': None, 'headerCounts': None,
            'status': 'invalid-header', 'supported': False, 'validation': 'header-only', 'sourceHash': None,
            'hashStatus': 'not-computed',
            'hashVerification': 'explicit' if verify_audit_hashes else 'bounded-startup',
            'auditStatus': 'untested', 'auditWarnings': [], 'auditErrors': [], 'auditWarningCount': 0,
            'auditDiagnostic': 'No audit evidence is attached to this library.',
            'diagnostic': 'Header indexed only; complete geometry is checked when opened.',
        }
        results.append(entry)
        try:
            resolved = file.resolve(strict=True)
            if not _within(resolved, root):
                entry.update(status='unsafe-path', diagnostic='File link resolves outside the authorized library directory.')
                continue
            entry['resolvedPath'] = str(resolved)
            source_stat = file.stat()
            entry['bytes'] = size = source_stat.st_size
            if not stat.S_ISREG(source_stat.st_mode):
                entry.update(status='unreadable', diagnostic='OFF entry is not a regular file.')
                continue
            if size > MAX_FILE_BYTES:
                entry.update(status='resource-limit', diagnostic='OFF file exceeds the 128 MiB import limit.')
                continue
            with file.open('rb') as source:
                if not stat.S_ISREG(os.fstat(source.fileno()).st_mode):
                    entry.update(status='unreadable', diagnostic='OFF entry is not a regular file.')
                    continue
                if size > hash_file_limit:
                    entry['hashStatus'] = 'not-computed-size'
                elif hashed_bytes + size > hash_budget:
                    entry['hashStatus'] = 'not-computed-budget'
                else:
                    digest, read_bytes = hashlib.sha256(), 0
                    allowance = min(hash_file_limit, hash_budget - hashed_bytes)
                    while read_bytes <= allowance:
                        chunk = source.read(min(65536, allowance - read_bytes + 1))
                        if not chunk:
                            break
                        read_bytes += len(chunk)
                        digest.update(chunk)
                    hashed_bytes += min(read_bytes, allowance)
                    if read_bytes <= allowance:
                        entry.update(sourceHash=digest.hexdigest(), hashStatus='computed')
                    else:
                        entry['hashStatus'] = 'not-computed-file-changed'
                source.seek(0)
                try:
                    marker, dimension, declared, counts = _header(source)
                except (GeometryError, UnicodeError) as exc:
                    entry['diagnostic'] = str(exc)
                    continue
            entry.update(format=marker, dimension=dimension, headerCounts=declared, counts=counts)
            if dimension not in (3, 4):
                entry.update(status='unsupported-dimension', diagnostic=f'{dimension}D OFF is indexed; model loading currently supports 3D and 4D.')
            elif marker not in ('OFF', '4OFF'):
                entry.update(status='unsupported-format', diagnostic=f'{marker} is indexed; model loading expects OFF or 4OFF.')
            elif counts[0] > MAX_VERTICES:
                entry.update(status='resource-limit', diagnostic=f'OFF declares more than {MAX_VERTICES:,} vertices.')
            else:
                entry.update(status='ready', supported=True)
        except (OSError, RuntimeError) as exc:
            entry.update(status='unreadable', diagnostic='Cannot read linked OFF entry: ' + str(exc))
    if audit_path is not None:
        from .library_audit import attach_audit
        return attach_audit(results, audit_path)
    return results
