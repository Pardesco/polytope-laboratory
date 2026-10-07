"""Root integration of the reviewed frozen candidates; preserves old inputs.

This does not build, release, qualify a new gate, or mutate frozen importers.
Run once, only after both existing finite gates have their archival association.
"""
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile

ROOT=Path(__file__).resolve().parents[1]
IMPORTERS={'engine/__init__.py','engine/formats.py','engine/geometry.py'}

def digest(data):return hashlib.sha256(data).hexdigest()
def read(path):return json.loads(path.read_text(encoding='utf-8'))

def main():
    spec=importlib.util.spec_from_file_location('integration_ledger',ROOT/'scripts/parity-ledger.py')
    ledger=importlib.util.module_from_spec(spec);spec.loader.exec_module(ledger)
    value=ledger.build_ledger(ROOT)
    for rid in ('LIB-04','MEAS-04'):
        row=next(r for r in value['requirements'] if r['requirement_id']==rid)
        assert row['implementation_status']=='validated' and row['requirement_gate']['candidate']['status']=='validated'
        assert row['requirement_gate']['candidate']['releaseQualified'] is False
    assert read(ROOT/'package.json')['version']=='0.20.0'
    scopes=[read(ROOT/'artifacts'/name)['sourceHashes'] for name in ('native-development-0.20.0.json','frontend-source-tests-0.20.0.json')]
    originals={}
    for scope in scopes:
        for name,expected in scope.items():
            data=(ROOT/name).read_bytes();assert digest(data)==expected,name+': qualified source changed'
            originals[name]=data
    frozen=ROOT/'development/faceting-integration-0.21';manifest=read(frozen/'freeze.json')
    for name,expected in manifest['sha256'].items():assert digest((frozen/name).read_bytes())==expected,name
    copies={name:(frozen/name).read_bytes() for name in manifest['newRuntimeFiles']+manifest['integrationPatches']+
            ['tests/test_automatic_faceting.py','tests/test_automatic_faceting_workflow.py','tests/automatic-faceting-controls.test.mjs','tests/construction-controls-fixture.mjs']}
    viewport=ROOT/'development/viewport-integration-0.21';vmanifest=read(viewport/'TRANSPLANT_SHA256.json')
    for name,expected in vmanifest['candidateHashes'].items():
        name=name.replace('\\','/');data=(viewport/name).read_bytes();assert digest(data)==expected,name;copies[name]=data
    data=(viewport/'tests/viewport-integration.test.mjs').read_text(encoding='utf-8')
    data=data.replace("'../../dense-stereographic-packet.mjs'","'../development/dense-stereographic-packet.mjs'")
    data=data.replace("'./worker-node-entry.mjs'","'./stereographic-dense-worker-entry.mjs'")
    copies['tests/stereographic-dense-integration.test.mjs']=data.encode('utf-8')
    copies['tests/stereographic-dense-worker-entry.mjs']=(viewport/'tests/worker-node-entry.mjs').read_bytes()
    video=ROOT/'development/video-export-integration-0.21'
    for name,expected in {'video-recorder.mjs':'3f68ba9d481185dd42ce64e2771bccb86a7fd5fab30142084c8c8f7177759800',
                          'vp8-webm.mjs':'f97e17ca26132d4e4a2da1986f6237072b200e5f70e5b31f347917597237f5ef'}.items():
        data=(video/name).read_bytes();assert digest(data)==expected,name;copies['ui/'+name]=data
    data=(video/'animated-tour-export.mjs').read_text(encoding='utf-8')
    assert "'../../ui/animated-tour-timeline.mjs'" in data
    data=data.replace("'../../ui/animated-tour-timeline.mjs'","'./animated-tour-timeline.mjs'")
    data=data.replace('this unmounted WebM prototype owns explicit pose timestamps','WebM owns explicit pose timestamps')
    copies['ui/animated-tour-export.mjs']=data.encode('utf-8')
    assert not (IMPORTERS & set(copies))
    folder=Path(tempfile.mkdtemp(prefix='integration-0.21-',dir=ROOT/'artifacts'))
    before={};after={}
    for name,data in copies.items():
        target=ROOT/name
        if target.exists():
            old=target.read_bytes();before[name]=digest(old);backup=folder/'before'/name;backup.parent.mkdir(parents=True,exist_ok=True);backup.write_bytes(old)
        else:before[name]=None
        target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data);after[name]=digest(target.read_bytes());assert after[name]==digest(data)
    for name,data in originals.items():
        if name not in copies:assert (ROOT/name).read_bytes()==data,name+': unrelated qualified input changed'
    for name in IMPORTERS:assert (ROOT/name).read_bytes()==originals[name],name
    proof={'format':'polytope-reviewed-candidate-integration','targetVersion':'0.21.0','createdUtc':datetime.now(timezone.utc).isoformat(),
           'integrated':True,'qualified':False,'released':False,'all73RequirementsFulfilled':False,'before':before,'after':after,
           'frozenImportersUnchanged':True,'unrelatedQualifiedInputsUnchanged':True,'packageVersionNotYetAdvanced':True,
           'scope':'Reviewed faceting runtime/workflow/UI, dense stereo worker/fallback, explicit-pose recorder/mux/tour and meaningful new regressions. Animation controls/tests still require migration.'}
    (folder/'result.json').write_text(json.dumps(proof,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'integratedFiles':len(copies),'proof':str(folder/'result.json'),'qualified':False}))

if __name__=='__main__':main()
