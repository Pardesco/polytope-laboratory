"""Reuse native tests only when the entire current input set is byte-identical.

This records reuse explicitly. It never claims a new pytest execution and never
changes the original qualification. Frontend/package changes are outside scope.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import importlib.metadata
import importlib.util
import json
from pathlib import Path
import platform

ROOT = Path(__file__).resolve().parents[1]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def qualify(previous, root=ROOT):
    script = root/'scripts/qualify-native-development.py'
    spec = importlib.util.spec_from_file_location('native_qualification_snapshot',script)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    assert module.ROOT == root
    proof = json.loads(previous.read_text(encoding='utf-8-sig'))
    assert proof['passed'] is True and proof['sourceUnchanged'] is True
    assert proof['changedPaths'] == [] and proof['exitCode'] == 0
    assert proof['qualificationScriptSha256'] == digest(script), 'Qualification scope/script changed'
    assert proof['counts']['failed'] == proof['counts']['error'] == 0
    assert proof['collected'] == sum(proof['counts'].values())
    current = module.snapshot()
    assert current == proof['sourceHashes'], 'Current native input set or bytes changed'
    assert sorted(proof['testFiles']) == sorted(p for p in current if p.startswith('tests/'))
    assert proof['python'] == platform.python_version()
    for name in ('numpy','scipy'):
        assert proof[name] == importlib.metadata.version(name), name+' runtime changed'
    version = json.loads((root/'package.json').read_text(encoding='utf-8'))['version']
    assert version != proof['version'], 'Same-version proof already exists'
    result = {**proof, 'version':version,
        'scope':'Exact byte-identical native/catalog/test input reuse; no new pytest execution',
        'qualificationMethod':'reused-exact-native-inputs',
        'reusedUtc':datetime.now(timezone.utc).isoformat(),
        'originalQualificationVersion':proof['version'],
        'originalQualification':str(previous.resolve()),
        'originalQualificationSha256':digest(previous),
        'reuseScriptSha256':digest(Path(__file__)),
        'sourceHashes':current}
    assert module.snapshot() == current, 'Native inputs changed during reuse verification'
    return result


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--previous',required=True,type=Path)
    args=parser.parse_args()
    result=qualify(args.previous)
    destination=ROOT/'artifacts'/f"native-development-{result['version']}.json"
    assert not destination.exists(), 'Preserve an existing proof'
    destination.write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
    print(f"Reused {len(result['sourceHashes'])} exact native inputs from{result['originalQualificationVersion']}: {destination}")


if __name__=='__main__':main()
