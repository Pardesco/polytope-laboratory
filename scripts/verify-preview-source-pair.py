"""Verify the actual archive and its frozen runtime inputs before version bump."""
from pathlib import Path
import hashlib
import json
import zipfile

root = Path(__file__).resolve().parents[1]
version = json.loads((root / 'package.json').read_text())['version']
receipt = json.loads((root / 'artifacts' / f'community-preview-{version}.json').read_text())
source = json.loads((root / 'artifacts' / f'source-package-{version}.json').read_text())
frozen = json.loads((root / 'artifacts' / f'preview-build-source-{version}.json').read_text())
assert receipt['version'] == source['version'] == frozen['version'] == version
binary = Path(receipt['binary'])
assert binary.is_file() and hashlib.sha256(binary.read_bytes()).hexdigest() == receipt['binarySha256']
archive_path = Path(source['path'])
assert hashlib.sha256(archive_path.read_bytes()).hexdigest() == source['archiveSha256']
with zipfile.ZipFile(archive_path) as archive:
    manifest = json.loads(archive.read('SOURCE_MANIFEST.json'))
    hashes = manifest['sourceHashes']
    assert hashes == source['sourceHashes']
    assert set(archive.namelist()) == set(hashes) | {'SOURCE_MANIFEST.json'}
    for name, expected in hashes.items():
        assert hashlib.sha256(archive.read(name)).hexdigest() == expected, ('archive', name)
        assert hashlib.sha256((root / name).read_bytes()).hexdigest() == expected, ('workspace', name)
    for name, expected in frozen['sourceHashes'].items():
        assert hashes.get(name) == expected, ('frozen runtime', name)
proof = json.loads(Path(receipt['portableSmoke']).read_text())
assert proof['passed'] and proof['version'] == version and proof['developmentPythonDisabled']
result = {
    'version': version,
    'sourceFiles': len(hashes),
    'allCurrentSourceHashesMatchArchive': True,
    'allArchiveContentHashesVerified': True,
    'frozenRuntimeInputsMatchArchive': len(frozen['sourceHashes']),
    'portableProof': Path(receipt['portableSmoke']).relative_to(root).as_posix(),
    'binarySha256': receipt['binarySha256'],
}
with (root / 'artifacts' / f'source-pair-{version}.json').open('x', encoding='utf-8') as output:
    output.write(json.dumps(result, indent=2) + '\n')
print('Verified corresponding source pair:', version, len(hashes), 'archive files')
