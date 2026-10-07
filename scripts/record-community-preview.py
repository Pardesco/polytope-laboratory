"""Record one version-matched portable check without rewriting historical handoffs."""
from pathlib import Path
import hashlib,json,sys
root=Path(__file__).resolve().parents[1]
if len(sys.argv)!=2:raise SystemExit('Usage: python scripts/record-community-preview.py artifacts/<portable-check>/result.json')
version=json.loads((root/'package.json').read_text())['version']
binary=root/'release'/f'preview-{version}'/f'Polytope Laboratory {version} preview.exe'
smoke=(root/sys.argv[1]).resolve()
if not smoke.is_relative_to(root/'artifacts'):raise SystemExit('Use a portable check under this workspace artifacts directory.')
proof=json.loads(smoke.read_text())
if not (binary.is_file() and proof.get('passed') is True and proof.get('version')==version and Path(proof.get('executable','')).resolve()==binary.resolve() and proof.get('developmentPythonDisabled') is True):
    raise SystemExit('The portable proof must pass for this exact version and binary with development Python unavailable.')
protected={name:hashlib.sha256((root/'engine'/name).read_bytes()).hexdigest() for name in ('__init__.py','formats.py','geometry.py')}
assert protected=={'__init__.py':'386c22bb99742201703c33eba63836bd0bebcccff37107c67a06b139fd0e5923','formats.py':'fdc634c8a992e2b6a33ea69ae68f3fbd5d021949123efd584744d8a0a76c8d23','geometry.py':'9a9a1243223ca38aabce4bc762cbd463939a177f104bfa08c4ada81774b85414'}
receipt={'version':version,'license':'GPL-3.0-only','status':'community-preview','binary':str(binary),'binaryBytes':binary.stat().st_size,'binarySha256':hashlib.sha256(binary.read_bytes()).hexdigest(),'portableSmoke':str(smoke),'protectedImporterHashes':protected,'scope':'Build and targeted feature checks; exhaustive regression and measured 90% parity are not claimed.'}
destination=root/'artifacts'/f'community-preview-{version}.json'
with destination.open('x',encoding='utf-8') as output:output.write(json.dumps(receipt,indent=2)+'\n')
print('Recorded community preview:',binary)
