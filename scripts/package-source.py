"""Create the corresponding source archive for this local development release."""
from pathlib import Path
from datetime import datetime,timezone
import hashlib,json,sys,zipfile

root=Path(__file__).resolve().parents[1]
version=json.loads((root/'package.json').read_text())['version']
output=root/'release'/f'Polytope Laboratory {version} source.zip'
if output.exists():raise SystemExit('Source archive already exists; preserve it or choose a new package version.')
paths=[]
for directory in ['engine','ui','desktop','scripts','tests','docs','.github','third_party_licenses']:
    paths.extend(p for p in (root/directory).rglob('*') if p.is_file() and '__pycache__' not in p.parts and p.suffix!='.pyc')
for name in ['README.md','LICENSE','THIRD_PARTY_NOTICES.md','CONTRIBUTING.md','STELLA4D_FEATURE_COMPLETE_BUILD_SPEC.md','package.json','package-lock.json','requirements.txt','vite.config.mjs','.gitignore']:
    paths.append(root/name)
for name in ['dense-stereographic-packet.mjs','dense-stereographic-budget.mjs','conforming-worker-fixtures.mjs']:
    p=root/'development'/name
    if p.exists():paths.append(p)
paths=sorted(set(paths));hashes={p.relative_to(root).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
manifest={'version':version,'license':'GPL-3.0-only','createdUtc':datetime.now(timezone.utc).isoformat(),'sourceHashes':hashes,'scope':'Corresponding program source, catalog assets, dependency notices, build scripts and tests; historical development receipts are retained separately.'}
output.parent.mkdir(exist_ok=True);temporary=output.with_suffix('.zip.pending')
with zipfile.ZipFile(temporary,'x',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as archive:
    for p in paths:archive.write(p,p.relative_to(root).as_posix())
    archive.writestr('SOURCE_MANIFEST.json',json.dumps(manifest,indent=2)+'\n')
temporary.rename(output)
(root/'artifacts'/f'source-package-{version}.json').write_text(json.dumps({**manifest,'path':str(output),'archiveSha256':hashlib.sha256(output.read_bytes()).hexdigest()},indent=2)+'\n')
print('Created corresponding source archive:',output)
