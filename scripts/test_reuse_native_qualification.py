"""Native reuse rejects changed files, changed scope and stale dependencies."""
from copy import deepcopy
import hashlib
import importlib.util
import json
from pathlib import Path
import platform
import tempfile
from unittest.mock import patch

import pytest

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('reuse_native',ROOT/'scripts/reuse-native-qualification.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)


@pytest.fixture
def fixture():
    with tempfile.TemporaryDirectory(prefix='native-reuse-unit-',dir=ROOT/'artifacts') as temporary:
        root=Path(temporary)
        (root/'scripts').mkdir()
        (root/'engine').mkdir()
        (root/'tests').mkdir()
        (root/'engine/kernel.py').write_text('VALUE=1\n')
        (root/'tests/test_math.py').write_text('assert 1+1==2\n')
        (root/'package.json').write_text('{"version":"new"}')
        script=root/'scripts/qualify-native-development.py'
        script.write_text('from pathlib import Path\nimport hashlib\nROOT=Path(__file__).resolve().parents[1]\ndef snapshot():\n    return {str(p.relative_to(ROOT)).replace(chr(92),"/"):hashlib.sha256(p.read_bytes()).hexdigest() for d in ("engine","tests") for p in (ROOT/d).glob("*.py")}\n')
        hashes={str(p.relative_to(root)).replace('\\','/'):hashlib.sha256(p.read_bytes()).hexdigest()
                for d in ('engine','tests') for p in (root/d).glob('*.py')}
        proof={'version':'old','passed':True,'sourceUnchanged':True,'changedPaths':[],
            'exitCode':0,'qualificationScriptSha256':module.digest(script),
            'collected':2,'counts':{'passed':1,'skipped':1,'failed':0,'error':0},
            'sourceHashes':hashes,'testFiles':['tests/test_math.py'],'python':platform.python_version(),
            'numpy':'fixture','scipy':'fixture'}
        previous=root/'previous.json'
        def write(value=proof):previous.write_text(json.dumps(value),encoding='utf-8')
        write()
        with patch.object(module.importlib.metadata,'version',return_value='fixture'):
            yield root,previous,proof,write


def test_exact_native_inputs_reused_without_rewriting_original(fixture):
    root,previous,proof,_=fixture
    before=previous.read_bytes()
    result=module.qualify(previous,root)
    assert result['version']=='new'
    assert result['originalQualificationVersion']=='old'
    assert result['qualificationMethod']=='reused-exact-native-inputs'
    assert result['sourceHashes']==proof['sourceHashes']
    assert previous.read_bytes()==before


@pytest.mark.parametrize('change',['edit','add','remove','script','dependency','testList','failed','count'])
def test_mutated_scope_or_bytes_cannot_reuse(fixture,change):
    root,previous,proof,write=fixture
    if change=='edit':(root/'engine/kernel.py').write_text('VALUE=2\n')
    elif change=='add':(root/'tests/test_new.py').write_text('assert True\n')
    elif change=='remove':(root/'engine/kernel.py').unlink()
    elif change=='script':(root/'scripts/qualify-native-development.py').write_text('ROOT=None\n')
    else:
        value=deepcopy(proof)
        if change=='dependency':value['scipy']='different'
        if change=='testList':value['testFiles']=[]
        if change=='failed':value['passed']=False
        if change=='count':value['collected']=3
        write(value)
    with pytest.raises(AssertionError):module.qualify(previous,root)
