"""Copy installed dependency notices for offline source/binary distribution."""
from pathlib import Path
import hashlib,importlib.metadata,json,shutil,sys

root=Path(__file__).resolve().parents[1]
destination=root/'third_party_licenses'
destination.mkdir(exist_ok=True)
records=[]
def retain(component,source,relative):
    source=Path(source)
    if not source.is_file():return
    target=destination/component/relative
    target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source,target)
    records.append({'component':component,'file':target.relative_to(root).as_posix(),'sha256':hashlib.sha256(target.read_bytes()).hexdigest()})
for name in ['numpy','scipy','Pillow','pyinstaller']:
    distribution=importlib.metadata.distribution(name)
    for entry in distribution.files or []:
        if any(part.lower().startswith(('license','copying','notice','copyright','authors')) for part in Path(str(entry)).parts):
            retain(name,distribution.locate_file(entry),Path(str(entry)))
for name in ['LICENSE.txt','LICENSE']:
    retain('Python',Path(sys.base_prefix)/name,Path(name))
retain('Three.js',root/'node_modules/three/LICENSE',Path('LICENSE'))
for name in ['LICENSE','LICENSES.chromium.html']:
    retain('Electron',root/'node_modules/electron/dist'/name,Path(name))
(destination/'manifest.json').write_text(json.dumps({'python':sys.version,'notices':records},indent=2)+'\n',encoding='utf-8')
print('Collected',len(records),'installed dependency notices.')
