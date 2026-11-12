"""Record one version-matched portable check without rewriting historical handoffs."""

from pathlib import Path
import hashlib, json, sys

root = Path(__file__).resolve().parents[1]
if len(sys.argv) != 2:
    raise SystemExit('Usage: python scripts/record-community-preview.py artifacts/<portable-check>/result.json')
version = json.loads((root / 'package.json').read_text())['version']
binary = root / 'release' / f'preview-{version}' / f'Polytope Laboratory {version} preview.exe'
smoke = (root / sys.argv[1]).resolve()
if not smoke.is_relative_to(root / 'artifacts'):
    raise SystemExit('Use a portable check under this workspace artifacts directory.')
proof = json.loads(smoke.read_text())
if not (
    binary.is_file()
    and proof.get('passed') is True
    and proof.get('version') == version
    and Path(proof.get('executable', '')).resolve() == binary.resolve()
    and proof.get('developmentPythonDisabled') is True
):
    raise SystemExit(
        'The portable proof must pass for this exact version and binary with development Python unavailable.'
    )
protected = {
    name: hashlib.sha256((root / 'engine' / name).read_bytes()).hexdigest()
    for name in ('__init__.py', 'formats.py', 'geometry.py')
}
assert protected == {
    '__init__.py': '758fc01b2f2bb85815ce91b5b416e6cf3f3a06332a65470d827334cbdee0f4e5',
    'formats.py': 'c2ab6e54c809482d31dc7690dce2e06dd26c2253d51d25992ad8714213e99ae5',
    'geometry.py': '5f0a9af5212d1b089041612efc9cb52ba51cd109eff5f901187c2721606e990d',
}
receipt = {
    'version': version,
    'license': 'GPL-3.0-only',
    'status': 'community-preview',
    'binary': str(binary),
    'binaryBytes': binary.stat().st_size,
    'binarySha256': hashlib.sha256(binary.read_bytes()).hexdigest(),
    'portableSmoke': str(smoke),
    'protectedImporterHashes': protected,
    'scope': 'Build and targeted feature checks; exhaustive regression and measured 90% parity are not claimed.',
}
destination = root / 'artifacts' / f'community-preview-{version}.json'
with destination.open('x', encoding='utf-8') as output:
    output.write(json.dumps(receipt, indent=2) + '\n')
print('Recorded community preview:', binary)
