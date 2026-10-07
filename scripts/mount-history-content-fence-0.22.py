import hashlib,json,shutil
from pathlib import Path
root=Path(__file__).resolve().parents[1]
stage=root/'development/element-content-continuation-0.22'
manifest=json.loads((stage/'HISTORY_CONTENT_PATCH.json').read_text())
backup=root/'artifacts/history-content-fence-before-mount-0.22'
backup.mkdir(exist_ok=False)
target=root/manifest['sharedPatch']['file']
source=target.read_text(encoding='utf-8')
for change in manifest['sharedPatch']['changes']:
    assert source.count(change['old'])==change['expectedOccurrences'],change['old']
    source=source.replace(change['old'],change['new'])
for entry in manifest['newFiles']:
    data=(stage/entry['source']).read_bytes()
    assert hashlib.sha256(data).hexdigest()==entry['sha256']
    assert not (root/entry['target']).exists()
shutil.copy2(target,backup/'app.js')
target.write_text(source,encoding='utf-8',newline='\n')
for entry in manifest['newFiles']:
    shutil.copy2(stage/entry['source'],root/entry['target'])
(root/'artifacts/history-content-fence-mounted-0.22.json').write_text(json.dumps(manifest,indent=2))
print('Mounted reviewed content history fence.')
