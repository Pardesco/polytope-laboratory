"""Apply explicitly reviewed existing-file updates after checking both hashes."""
from pathlib import Path
import hashlib,json,shutil,sys
root=Path(__file__).resolve().parents[1]
stage=(root/sys.argv[1]).resolve();assert stage.is_relative_to(root/'development')
manifest_path=(stage/sys.argv[2]).resolve();assert manifest_path.is_relative_to(stage)
manifest=json.loads(manifest_path.read_text());assert not manifest.get('hunks')
protected={'engine/__init__.py','engine/formats.py','engine/geometry.py'}
planned=[]
for item in manifest['newFiles']:
    source=(stage/item['source']).resolve();target=(root/item['target']).resolve()
    assert source.is_relative_to(stage) and target.is_relative_to(root) and item['target'] not in protected
    assert hashlib.sha256(source.read_bytes()).hexdigest()==item['sha256']
    assert hashlib.sha256(target.read_bytes()).hexdigest()==item['expectedTargetSha256']
    planned.append((source,target))
backup=root/'artifacts'/f'before-update-{stage.name}-{manifest_path.stem}';backup.mkdir(exist_ok=False)
for source,target in planned:
    saved=backup/target.relative_to(root);saved.parent.mkdir(parents=True,exist_ok=True)
    shutil.copy2(target,saved);shutil.copy2(source,target)
(backup/'applied.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('Applied guarded stage update:',len(planned),'files')
