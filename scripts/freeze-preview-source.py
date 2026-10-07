"""Bind a preview build to its complete runtime inputs before packaging."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib,json
root=Path(__file__).resolve().parents[1]
version=json.loads((root/'package.json').read_text(encoding='utf-8'))['version']
paths=[]
for name in ('engine','ui','desktop','third_party_licenses'):
    paths.extend(p for p in (root/name).rglob('*') if p.is_file() and '__pycache__' not in p.parts and p.suffix!='.pyc')
for name in ('LICENSE','THIRD_PARTY_NOTICES.md','package.json','package-lock.json','requirements.txt','vite.config.mjs','scripts/package-preview.cjs','scripts/package-source.py','scripts/freeze-preview-source.py'):
    paths.append(root/name)
hashes={p.relative_to(root).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(set(paths))}
record={'version':version,'createdUtc':datetime.now(timezone.utc).isoformat(),'sourceHashes':hashes,'scope':'Complete current runtime/catalog/notices/dependency/build inputs; frozen before preview packaging. No full regression or feature-complete claim.'}
p=root/'artifacts'/f'preview-build-source-{version}.json'
with p.open('x',encoding='utf-8') as f:f.write(json.dumps(record,indent=2)+'\n')
print('Frozen preview inputs:',version,len(hashes))
