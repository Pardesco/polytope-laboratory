"""Mount an explicitly reviewed new-file/literal-hunk feature manifest."""
from pathlib import Path
import hashlib,json,shutil,sys
root=Path(__file__).resolve().parents[1]
stage=(root/sys.argv[1]).resolve()
assert stage.is_relative_to(root/'development')
manifest=json.loads((stage/sys.argv[2]).read_text())
protected={'engine/__init__.py','engine/formats.py','engine/geometry.py'}
planned={}
def staged_source(entry):
    candidate=(stage/entry['source']).resolve()
    if not candidate.is_file():candidate=(root/entry['source']).resolve()
    assert candidate.is_relative_to(stage) and candidate.is_file(),candidate
    return candidate
changes=manifest.get('changes',[])
if isinstance(manifest.get('hunks'),str):
    changes=[{'target':item['file'],'hunks':[{'before':item['old'],'after':item['new'],'expectedCount':item.get('expectedCount',1)}]} for item in json.loads((stage/manifest['hunks']).read_text())]
for change in changes:
    name=change['target'];assert name not in protected
    p=root/name;assert p.resolve().is_relative_to(root)
    text=planned.get(name,p.read_text(encoding='utf-8'))
    for hunk in change['hunks']:
        count=text.count(hunk['before'])
        expected=hunk.get('expectedCount',hunk.get('expectedOccurrences',1))
        assert type(expected) is int and expected>0,(name,expected)
        assert count>=1 if hunk.get('replaceAll') else count==expected,(name,hunk['before'],count)
        text=text.replace(hunk['before'],hunk['after'])
    planned[name]=text
for entry in manifest['newFiles']:
    assert entry['target'] not in protected
    assert (root/entry['target']).resolve().is_relative_to(root)
    assert not (root/entry['target']).exists(),entry['target']
    assert hashlib.sha256(staged_source(entry).read_bytes()).hexdigest()==entry['sha256']
backup=root/'artifacts'/('before-mount-'+stage.name);backup.mkdir(exist_ok=False)
for name,text in planned.items():
    destination=backup/name;destination.parent.mkdir(parents=True,exist_ok=True)
    shutil.copy2(root/name,destination)
    (root/name).write_text(text,encoding='utf-8',newline='\n')
for entry in manifest['newFiles']:
    destination=root/entry['target'];destination.parent.mkdir(parents=True,exist_ok=True)
    shutil.copy2(staged_source(entry),destination)
(root/'artifacts'/('mounted-'+stage.name+'.json')).write_text(json.dumps(manifest,indent=2)+'\n')
print('Mounted',stage.name,len(planned),'modified and',len(manifest['newFiles']),'new files.')
