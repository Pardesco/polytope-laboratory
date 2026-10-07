"""Retain a validated finite acceptance on an unpromoted candidate.

Only docs/parity-ledger.json may be written, after an initial complete strict
current-candidate collector requalification. --check performs every check but
writes nothing. No GUI, package rebuild, promotion, release or 42-suite claim.
Ordinary historical regeneration checks frozen sources/code/resources/data,
not current development inputs, and does not execute a native process.
"""
import argparse
from copy import deepcopy
from datetime import datetime,timezone
import importlib.util
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parents[1]
VERSION='0.20.0'
TOOL_PATHS={'scripts/bind-validated-candidate.py','scripts/apply-parity-gate.py','scripts/parity-ledger.py','scripts/test_parity_ledger.py'}
REVIEWED={'LIB-04','MEAS-04'}
ASSOCIATION_FIELDS={'format','schemaVersion','status','version','releaseQualified','all42SuitesPassed',
                    'all73RequirementsFulfilled','references','tools','nativeRevalidation'}

def load(repository,name,label):
    spec=importlib.util.spec_from_file_location(label,repository/'scripts'/name)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

def require(test,message):
    if not test:raise ValueError(message)

def verify_candidate_association(gate,association,repository=ROOT):
    """Conditional historical verifier; no subprocess, no current scope check."""
    repository=repository.resolve();app=load(ROOT,'apply-parity-gate.py','candidate_application')
    ledger=load(ROOT,'parity-ledger.py','candidate_ledger')
    require(gate.get('requirementId') in REVIEWED and type(association) is dict and set(association)==ASSOCIATION_FIELDS and
            association.get('format')=='polytope-validated-candidate-association' and type(association.get('schemaVersion')) is int and association.get('schemaVersion')==1 and
            association.get('version')==gate.get('version')==VERSION and association.get('status')=='validated' and
            association.get('releaseQualified') is False and association.get('all42SuitesPassed') is False and
            association.get('all73RequirementsFulfilled') is False,'Unsupported validated-candidate domain/status/claims')
    refs=association.get('references')
    require(type(refs) is dict and set(refs)=={'frozenQualified','frozenTools','native','frontend'},'Candidate references incomplete')
    paths={name:app.verify_reference(repository,row,ledger) for name,row in refs.items()}
    manifest=ledger.read_json(paths['frozenQualified'])
    source_root=(paths['frozenQualified'].parent/'source').resolve(strict=True)
    require(source_root.is_relative_to(repository/'artifacts') and source_root.is_dir(),'Frozen qualification source escaped')
    archive_path=app.receipt_file(source_root,'scripts/promote-parity-gate.py')
    require(manifest.get('sourceHashes',{}).get('scripts/promote-parity-gate.py')==ledger.digest(archive_path),
            'Frozen archive reader bytes differ')
    archive=load(source_root,'promote-parity-gate.py','candidate_archive_reader')
    qualified={**gate.get('nativeSourceHashes',{}),**gate.get('frontendSourceHashes',{})}
    require(all(gate.get('frontendSourceHashes',{}).get(n,s)==s for n,s in gate.get('nativeSourceHashes',{}).items()),'Conflicting qualified source scopes')
    qualified.update({row['path']:row['sha256'] for row in gate.get('scripts',[])})
    qualified['STELLA4D_FEATURE_COMPLETE_BUILD_SPEC.md']=gate.get('specification',{}).get('sha256')
    frozen=archive.verify_frozen(repository,refs['frozenQualified'],qualified,VERSION,app,ledger)
    require(len(frozen['sourceHashes'])>=821,'Retained candidate manifest omits reviewed full821 snapshot')
    tool_records=association.get('tools')
    require(type(tool_records) is list and len(tool_records)==len(TOOL_PATHS) and {r.get('path') for r in tool_records}==TOOL_PATHS,
            'Executed candidate-binding tools inventory differs')
    tools=archive.verify_frozen(repository,refs['frozenTools'],{row['path']:row['sha256'] for row in tool_records},VERSION,app,ledger)
    for row in tool_records:
        file=app.receipt_file(tools['sourceRoot'],row['path'])
        require(set(row)=={'path','sha256','bytes'} and file.stat().st_size==row['bytes'],'Frozen executed binding tool bytes differ')
    # Historical verification uses the executed archival helpers, not future
    # development policy/oracle changes. Both directories were fully hashed.
    app=load(tools['sourceRoot'],'apply-parity-gate.py','frozen_candidate_application')
    ledger=load(tools['sourceRoot'],'parity-ledger.py','frozen_candidate_ledger_reader')
    archive=load(frozen['sourceRoot'],'promote-parity-gate.py','frozen_candidate_archive_reader')
    collector,_,gate_paths,unpacked=app.verify_receipt_references(gate,repository,historical=frozen)
    require(paths['native']==gate_paths['native_bundle_proof'] and paths['frontend']==gate_paths['frontend_proof'],
            'Candidate components differ from original finite gate')
    native=ledger.read_json(paths['native']);frontend=ledger.read_json(paths['frontend'])
    for proof in (native,frontend):require(proof.get('passed') is True and proof.get('version')==VERSION,'Candidate component did not qualify')
    native_source=ledger.read_json(gate_paths['native_source_proof']);front_source=ledger.read_json(gate_paths['frontendSourceProof'])
    for proof,scope in ((native_source,gate['nativeSourceHashes']),(front_source,gate['frontendSourceHashes'])):
        require(proof.get('passed') is True and proof.get('sourceUnchanged') is True and proof.get('changedPaths')==[] and
                proof.get('exitCode')==0 and proof.get('version')==VERSION and proof.get('sourceHashes')==scope,'Full historical source qualification differs')
    require(len(gate['nativeSourceHashes'])==520 and len(gate['frontendSourceHashes'])==205 and native_source.get('counts',{}).get('passed')==3961 and
            native_source.get('counts',{}).get('failed')==0 and native_source.get('counts',{}).get('error')==0 and
            native_source.get('counts',{}).get('skipped')==1,'Reviewed native/frontend scope/counts differ')
    require(native_source.get('testFiles')==sorted(n for n in gate['nativeSourceHashes'] if n.startswith('tests/')) and
            native_source.get('qualificationScriptSha256')==frozen['sourceHashes']['scripts/qualify-native-development.py'] and
            front_source.get('qualificationScriptSha256')==frozen['sourceHashes']['scripts/qualify-frontend-development.cjs'],
            'Historical complete qualification runners/testfiles differ')
    package=ledger.read_json(frozen['sourceRoot']/'package.json')
    commands=[command.split()[1:] for command in package['scripts']['test:features'].split(' && ')]
    require(package.get('version')==VERSION and [r.get('args') for r in front_source.get('runs',[])]==commands and
            all(r.get('exitCode')==0 for r in front_source['runs']),'Historical full frontend commands differ')
    require(native.get('candidateQualified') is True and native.get('sourceUnchanged') is True and native.get('buildUnchanged') is True and
            native.get('nativeSourceHashes')==gate['nativeSourceHashes'] and native.get('unpackedRoot')==str(unpacked) and
            native.get('moduleCount')==73 and native.get('engineResourceFileCount')==538 and
            native.get('packagedExecutableSha256')==gate['release']['engineExecutable']['sha256'],'Candidate compiled/native scope differs')
    for key in ('serverCompiledCodeEqual','embeddedPyzBytesMatch','buildArchiveEngineCodeMatches','candidateEmbeddedPyzBytesMatch',
                'candidateServerCompiledCodeEqual','engineResourceBytesMatch','catalogBytesMatch'):
        require(native.get(key) is True,'Native qualification check absent: '+key)
    require(native.get('nativeSourceProofSha256')==gate['evidence']['native_source_proof']['sha256'] and
            archive.contained(repository,native.get('nativeSourceProof'))==gate_paths['native_source_proof'] and
            native.get('verifierSha256')==frozen['sourceHashes']['scripts/qualify-native-bundle.py'],'Candidate native proof/runner differs')
    archive.verify_engine_resources(unpacked,native.get('engineResources'),ledger)
    archive.verify_compiled_native(unpacked/'resources/engine/polytope-engine.exe',native,frozen,ledger)
    require(frontend.get('currentInputsUnchanged') is True and frontend.get('sourceInputCount')==205 and
            frontend.get('archiveSha256')==gate['release']['appAsar']['sha256'] and
            frontend.get('sourceTestProofSha256')==gate['evidence']['frontendSourceProof']['sha256'] and
            archive.contained(repository,frontend.get('archive'))==unpacked/'resources/app.asar' and
            archive.contained(repository,frontend.get('sourceTestProof'))==gate_paths['frontendSourceProof'],'Candidate frontend proof differs')
    require(len(frontend.get('files',[]))==8,'Candidate packaged frontend inventory differs')
    archive.read_asar_files(unpacked/'resources/app.asar',frontend['files'],VERSION)
    fresh=frontend.get('freshBuild',{});value=fresh.get('directory')
    require(type(value) is str and value,'Retained fresh build directory absent')
    directory=Path(value)
    if not directory.is_absolute():directory=repository/directory
    directory=directory.resolve(strict=True)
    dist={row['path'].removeprefix('dist/'):row for row in frontend['files'] if row['path'].startswith('dist/')}
    require(directory.is_dir() and directory.is_relative_to(repository/'artifacts') and fresh.get('allBytesMatch') is True and len(dist)==4 and
            len(fresh.get('files',[]))==4 and set(fresh['files'])==set(dist) and
            {p.relative_to(directory).as_posix() for p in directory.rglob('*') if p.is_file()}==set(dist),'Retained fresh build membership differs')
    for name,row in dist.items():
        file=app.receipt_file(directory,name);require(file.stat().st_size==row['bytes'] and ledger.digest(file)==row['sha256'],'Retained fresh dist bytes differ')
    require(association.get('nativeRevalidation')==gate.get('packagedEngineRevalidation'),'Initial fresh finite-engine validation was not retained')
    if gate['requirementId']=='LIB-04':
        loaded=collector.validate_entries(ledger.read_json(gate_paths['loaded_receipts']))
        independent=collector.validate_entries(ledger.read_json(gate_paths['registered_proof'])['entries'],True)
        for key in loaded:collector.compare_geometry(loaded[key]['source'],independent[key]['source'])
    # The saved MEAS source/coordinate comparisons are recomputed by the
    # historical reference verifier, using the frozen collector's oracles.
    return {'collector':collector,'frozen':frozen,'tools':tools,'paths':gate_paths,'unpacked':unpacked,'native':native}

def publish_candidate(ledger,gate_association,association):
    """Pure update after verification; not a gate-closing API."""
    rid=gate_association.get('requirement_id');require(rid in REVIEWED,'Unsupported candidate requirement')
    require(type(association) is dict and set(association)==ASSOCIATION_FIELDS and association.get('format')=='polytope-validated-candidate-association' and
            type(association.get('schemaVersion')) is int and association.get('schemaVersion')==1 and association.get('status')=='validated' and
            association.get('version')==gate_association.get('version')==VERSION and
            association.get('releaseQualified') is False and association.get('all42SuitesPassed') is False and
            association.get('all73RequirementsFulfilled') is False,'Unsupported candidate publication claims')
    result=deepcopy(ledger);record=next(r for r in result['requirements'] if r['requirement_id']==rid)
    require(record.get('implementation_status')=='validated' and record.get('release_blocker') is False and
            all(record.get('requirement_gate',{}).get(k)==gate_association.get(k) for k in ('path','sha256','version','requirement_id')),
            'Candidate archival requires the same already validated finite gate')
    gate=record['requirement_gate']
    if gate.get('candidate')==association:return result
    require('candidate' not in gate,'An existing candidate association cannot be silently replaced')
    previous=deepcopy(record);previous.pop('gate_publications',None)
    record.setdefault('gate_publications',[]).append({'appliedUtc':datetime.now(timezone.utc).isoformat(),
        'previousRecord':previous,'candidate':deepcopy(association)})
    gate['candidate']=deepcopy(association)
    record['validation_evidence']=(record.get('validation_evidence') or '')+'\nValidated finite acceptance retained on unpromoted candidate '+gate_association['version']+'; frozen source/code/resources and actual finite native validation bound. No release or all42-suite claim.'
    return result

def bind(args,repository=ROOT):
    repository=repository.resolve();app=load(repository,'apply-parity-gate.py','bind_application');ledger=load(repository,'parity-ledger.py','bind_ledger')
    archive=load(repository,'promote-parity-gate.py','bind_archive_reader')
    path=repository/'docs/parity-ledger.json';before=ledger.digest(path);value=ledger.build_ledger(repository)
    tool_before={name:archive.reference(repository,repository/name,ledger) for name in sorted(TOOL_PATHS)}
    gate,gate_association=app.verify_gate_receipt(args.receipt,repository) # Actual current20 collector, no receipt write.
    require(gate['version']==VERSION and gate['requirementId'] in REVIEWED,'Candidate archival requires reviewed version20 domain')
    association={'format':'polytope-validated-candidate-association','schemaVersion':1,'status':'validated','version':VERSION,
        'releaseQualified':False,'all42SuitesPassed':False,'all73RequirementsFulfilled':False,
        'references':{name:archive.reference(repository,p,ledger) for name,p in (
            ('frozenQualified',repository/args.frozen_source_manifest),('frozenTools',repository/args.frozen_tools_manifest),
            ('native',repository/gate['evidence']['native_bundle_proof']['path']),('frontend',repository/gate['evidence']['frontend_proof']['path']))},
        'tools':list(tool_before.values()),'nativeRevalidation':deepcopy(gate['packagedEngineRevalidation'])}
    verify_candidate_association(gate,association,repository)
    require({name:archive.reference(repository,repository/name,ledger) for name in sorted(TOOL_PATHS)}==tool_before,'Binding tools changed during qualification')
    updated=publish_candidate(value,gate_association,association);ledger.validate_ledger(updated,ledger.inventory(repository),repository)
    require(ledger.digest(path)==before,'Ledger changed during candidate binding')
    if not args.check:ledger.atomic_write_ledger(path,updated,before)
    return {'requirement_id':gate['requirementId'],'status':'validated','version':VERSION,'written':not args.check,
            'releaseQualified':False,'openGateCount':sum(r['release_blocker'] for r in updated['requirements'])}

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--receipt',required=True,type=Path)
    parser.add_argument('--frozen-source-manifest',required=True,type=Path);parser.add_argument('--frozen-tools-manifest',required=True,type=Path)
    parser.add_argument('--check',action='store_true');args=parser.parse_args()
    try:result=bind(args)
    except Exception as error:print('Candidate association not applied: '+type(error).__name__+': '+str(error),file=sys.stderr);return 1
    import json
    print(json.dumps(result,indent=2));return 0

if __name__=='__main__':raise SystemExit(main())
