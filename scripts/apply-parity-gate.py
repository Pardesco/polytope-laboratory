"""Apply one independently requalified LIB-04 or MEAS-04 receipt to the preserved ledger.

Only docs/parity-ledger.json is published. This runs no GUI; the existing
read-only finite gate collector rechecks the actual packaged JSONL engine.
Released status uses the separate reviewed promotion adapter. --check performs
all checks without updating a file.
"""
import argparse
from copy import deepcopy
from datetime import datetime, timezone
import importlib.util
import json
from pathlib import Path, PurePosixPath
import re
import sys


ROOT=Path(__file__).resolve().parents[1]
SHA=re.compile(r'^[0-9a-f]{64}$')
INPUTS=('native_source_proof','native_bundle_proof','frontend_proof','desktop_proof',
        'suite_result','loaded_receipts','registered_proof')
SCRIPT_PATHS={'scripts/regular4d-catalog-smoke.cjs','scripts/qualify-lib04-gate.py','scripts/qualify-desktop.cjs',
              'scripts/qualify-regular4d-catalog.py','scripts/qualify-native-bundle.py','scripts/qualify-frontend-candidate.cjs',
              'scripts/qualify-native-development.py','scripts/qualify-frontend-development.cjs'}
REVIEWED={'LIB-04':'qualify-lib04-gate.py','MEAS-04':'qualify-meas04-gate.py'}
CHECKS={'packagedFiveWorkflows','sixteenDistinctFullSources','completeFlagOrbits',
        'fullReferenceAndDualReceiptsRecomputed','allLoadedReceiptsRecomputed','fullSavedSourceSnapshotsEqual',
        'allQualifiedInputHashesEqual','compiledBundleAndFrontendProofsBound','negativeFixturesInFullNativeQualification'}


class GateApplicationError(ValueError):
    pass


def require(condition,message):
    if not condition:raise GateApplicationError(message)


def load_script(repository,filename,name):
    path=repository/'scripts'/filename
    spec=importlib.util.spec_from_file_location(name,path)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module


def receipt_file(repository,relative):
    require(type(relative) is str and '\\' not in relative,'Receipt references require portable relative paths')
    parts=PurePosixPath(relative)
    require(not parts.is_absolute() and parts.as_posix()==relative and parts.parts and
            all(p not in ('','.','..') and ':' not in p for p in parts.parts),'Unsafe evidence path')
    path=(repository/relative).resolve(strict=True)
    require(path.is_relative_to(repository.resolve()) and path.is_file(),'Evidence reference escapes repository')
    return path


def verify_reference(repository,record,ledger):
    require(type(record) is dict and set(record)=={'path','sha256','bytes'} and
            type(record.get('sha256')) is str and SHA.fullmatch(record['sha256']) and
            type(record.get('bytes')) is int and 0<=record['bytes']<=2*1024**3,'Invalid hashed reference')
    path=receipt_file(repository,record['path'])
    require(path.stat().st_size==record['bytes'] and ledger.digest(path)==record['sha256'],
            'Referenced input bytes/hash differ: '+record['path'])
    return path


def verify_receipt_references(receipt,repository=ROOT,*,historical=None):
    """Reject incomplete/forged/stale envelopes before any native execution.

    This is a prerequisite, not authority to publish a newly closed gate. The
    public apply path also re-executes the complete reviewed finite collector.
    """
    repository=repository.resolve();ledger=load_script(ROOT if historical is not None else repository,'parity-ledger.py','parity_preserve')
    require(type(receipt) is dict and receipt.get('requirementId') in REVIEWED,'Only reviewed LIB-04 or MEAS-04 gates can be applied')
    rid=receipt['requirementId']
    if historical is not None:
        require(historical.get('version')==receipt.get('version'),'Historical frozen version differs')
        source_root=historical.get('sourceRoot')
        require(isinstance(source_root,Path),'Historical collector requires its verified frozen source root')
        source_root=source_root.resolve(strict=True)
        require(source_root.is_relative_to(repository/'artifacts') and source_root.is_dir(),
                'Historical collector source escaped frozen artifacts')
        filename='scripts/'+REVIEWED[rid];source=receipt_file(source_root,filename)
        refs=[row for row in receipt.get('scripts',[]) if type(row) is dict and row.get('path')==filename]
        require(len(refs)==1 and historical.get('sourceHashes',{}).get(filename)==refs[0].get('sha256')==ledger.digest(source) and
                source.stat().st_size==refs[0].get('bytes'),'Historical collector bytes differ from its executed gate')
        collector=load_script(source_root,REVIEWED[rid],'frozen_reviewed_finite_collector')
    else:
        collector=load_script(repository,REVIEWED[rid],'reviewed_finite_collector')
    original=collector.spec_inventory()
    require(type(receipt) is dict and type(receipt.get('schemaVersion')) is int and receipt.get('format')=='polytope-requirement-gate' and
            receipt.get('schemaVersion')==1 and receipt.get('requirementId')==rid and
            receipt.get('passed') is True and receipt.get('status')=='passed' and
            receipt.get('sourceUnchanged') is True and receipt.get('runtimeUnchanged') is True,
            'Only a passed unchanged reviewed finite gate can be applied')
    if historical is None:
        version=ledger.read_json(repository/'package.json')['version']
        require(receipt.get('version')==version,'Gate version differs from the current qualified candidate')
    else:
        require(historical.get('version')==receipt.get('version'),'Historical frozen version differs')
    require(receipt.get('specification')==original and receipt.get('acceptance')==collector.ACCEPTANCE,
            'Gate does not retain the exact original specification and all 73 acceptances')
    expected_domain=collector.DOMAIN if rid=='MEAS-04' else {'sourceCount':16,'convexCount':6,'nonconvexCount':10,'keys':[r[0] for r in collector.DOMAIN],
                     'numericMode':'float64-approximate','normalizedTolerance':1e-8,'certified':False,
                     'hullUsed':False,'baseline6Executed':False}
    require(collector.canonical(receipt.get('domain'))==collector.canonical(expected_domain),
            'Gate narrows or alters the reviewed finite numerical domain')
    require(type(receipt.get('checks')) is dict and set(receipt['checks'])==(collector.GATE_CHECKS if rid=='MEAS-04' else CHECKS) and
            all(value is True for value in receipt['checks'].values()),'Gate lacks complete finite acceptance checks')
    require(receipt.get('claims',{}).get('MEAS04AcceptanceFulfilled' if rid=='MEAS-04' else 'LIB04AcceptanceFulfilled') is True and
            receipt.get('claims',{}).get('all73RequirementsFulfilled') is False,'Invalid requirement/product-wide claim')
    revalidated=receipt.get('packagedEngineRevalidation',{})
    if rid=='MEAS-04':
        fixtures=collector.cases()
        require(type(revalidated) is dict and revalidated.get('requestCount')==revalidated.get('responseCount')==len(fixtures) and
                revalidated.get('positiveCount')==sum(not r.get('refusal') for r in fixtures) and
                revalidated.get('refusalCount')==sum(bool(r.get('refusal')) for r in fixtures) and
                revalidated.get('fixtureSha256')==__import__('hashlib').sha256(collector.canonical(fixtures)).hexdigest() and
                revalidated.get('allIndependentCasesEqual') is True and revalidated.get('validContinuationAfterRefusal') is True and
                type(revalidated.get('jsonlOutputSha256')) is str and SHA.fullmatch(revalidated['jsonlOutputSha256']) and
                revalidated.get('stderrBytes')==0,'No complete independently matched packaged expression revalidation')
    else:
        require(type(revalidated) is dict and revalidated.get('requestCount')==16 and revalidated.get('responseCount')==16 and
                revalidated.get('allFullReceiptsEqual') is True and type(revalidated.get('jsonlOutputSha256')) is str and
                SHA.fullmatch(revalidated['jsonlOutputSha256']) and revalidated.get('stderrBytes')==0,
                'No complete actual packaged-engine revalidation')
    require(receipt.get('actualAsarRevalidation',{}).get('passed') is True and
            type(receipt.get('actualAsarRevalidation',{}).get('files')) is int and receipt['actualAsarRevalidation']['files']>0,
            'No actual packaged ASAR revalidation')
    evidence=receipt.get('evidence')
    if rid=='MEAS-04':
        require(type(evidence) is dict and set(collector.INPUTS)|{'frontendSourceProof','workspaceLog','layersLog'}<=set(evidence),
                'Gate omits expression evidence inputs')
        paths={key:verify_reference(repository,value,ledger) for key,value in evidence.items()}
        expected_evidence=set(collector.INPUTS)|{'frontendSourceProof','workspaceLog','layersLog'}
        saved={}
        for kind in ('workspace','layers'):
            suite=ledger.read_json(paths[kind+'_suite_result']);expected=collector.WORKSPACE_CHECKS if kind=='workspace' else collector.LAYERS_CHECKS
            require(suite.get('passed') is True and suite.get('packaged') is True and suite.get('version')==receipt['version'] and
                    suite.get('checks')==expected and suite.get('pageErrors')==[],'Packaged expression workflows incomplete')
            saved[kind]={}
            for row in suite.get('files',[]):
                file=Path(row['file']).resolve(strict=True);key='saved-'+kind+'-'+file.name
                require(file.parent==paths[kind+'_suite_result'].parent and key in paths and paths[key]==file and
                        row.get('sha256')==evidence[key]['sha256'] and file.name not in saved[kind],
                        'Saved expression evidence differs from actual suite artifact')
                expected_evidence.add(key);saved[kind][file.name]=(file,ledger.read_json(file))
        require(set(evidence)==expected_evidence,'Gate omits/adds expression source evidence')
        require(collector.canonical(receipt.get('savedSourceComparisons'))==collector.canonical(collector.verify_saved_sources(saved['workspace'],saved['layers'])),
                'Expression source/coordinate comparisons differ from actual snapshots')
        script_paths=collector.SCRIPT_PATHS
    else:
        expected_evidence=set(INPUTS)|{'frontendSourceProof','suiteLog'}|{'saved-'+r[0] for r in collector.DOMAIN}
        require(type(evidence) is dict and set(evidence)==expected_evidence,'Gate omits/adds bound evidence inputs')
        paths={key:verify_reference(repository,value,ledger) for key,value in evidence.items()}
        script_paths=SCRIPT_PATHS
    scripts=receipt.get('scripts')
    require(type(scripts) is list and len(scripts)==len(script_paths) and
            {r.get('path') for r in scripts if type(r) is dict}==script_paths,'Gate script inventory differs')
    for record in scripts:
        if historical is None:verify_reference(repository,record,ledger)
        else:
            frozen=historical['sourceRoot']/record['path']
            require(historical['sourceHashes'].get(record['path'])==record['sha256'] and
                    frozen.is_file() and frozen.stat().st_size==record['bytes'] and
                    ledger.digest(frozen)==record['sha256'],'Historical executed script differs: '+record['path'])
    for key,frontend in (('nativeSourceHashes',False),('frontendSourceHashes',True)):
        manifest=receipt.get(key)
        require(type(manifest) is dict and manifest,'Empty qualified scope: '+key)
        if historical is None:
            require(manifest==collector.scope_snapshot(frontend),'Gate qualified input scope/bytes differ: '+key)
        else:
            require(all(historical['sourceHashes'].get(name)==sha for name,sha in manifest.items()),
                    'Historical frozen qualified scope differs: '+key)
    unpacked=Path(receipt.get('unpackedRoot','')).resolve(strict=True)
    require(unpacked.is_relative_to(repository/'release') and unpacked.is_dir(),'Gate candidate is outside release/')
    release=receipt.get('release')
    require(type(release) is dict and set(release)=={'executable','engineExecutable','appAsar'},'Missing actual candidate resources')
    resources={key:verify_reference(repository,value,ledger) for key,value in release.items()}
    require(resources['executable'].parent==unpacked and resources['engineExecutable']==unpacked/'resources/engine/polytope-engine.exe' and
            resources['appAsar']==unpacked/'resources/app.asar','Gate resources belong to a different candidate')
    return collector,ledger,paths,unpacked


def verify_gate_receipt(receipt_path,repository=ROOT):
    repository=repository.resolve();path=Path(receipt_path).resolve(strict=True)
    require(path.is_relative_to(repository/'artifacts') and path.is_file(),'Gate receipt must reside beneath artifacts/')
    ledger=load_script(repository,'parity-ledger.py','parity_reader')
    before=ledger.digest(path);receipt=ledger.read_json(path)
    collector,ledger,paths,unpacked=verify_receipt_references(receipt,repository)
    args=argparse.Namespace(unpacked_root=unpacked,timeout=240,**{name:paths[name] for name in (collector.INPUTS if receipt['requirementId']=='MEAS-04' else INPUTS)})
    fresh=collector.qualify(args) # Native only; no Electron and no receipt write.
    def stable(value):return {key:v for key,v in value.items() if key not in ('startedUtc','finishedUtc')}
    require(collector.canonical(stable(fresh))==collector.canonical(stable(receipt)),
            'Reviewed gate differs from completely requalified packaged/source evidence')
    require(ledger.digest(path)==before,'Gate receipt changed during independent requalification')
    return receipt,{'path':path.relative_to(repository).as_posix(),'sha256':before,'version':receipt['version'],
                    'requirement_id':receipt['requirementId'],'status':'validated'}


def verify_candidate_association(receipt,association,repository=ROOT):
    """Load the actually executed archival verifier from its frozen tool copy.

    A validated candidate is distinct from a released/promotion association.
    No engine or GUI is executed by this ordinary historical read path.
    """
    repository=repository.resolve();ledger=load_script(repository,'parity-ledger.py','archived_candidate_ledger')
    require(type(association) is dict and association.get('format')=='polytope-validated-candidate-association' and
            type(association.get('schemaVersion')) is int and association.get('schemaVersion')==1 and association.get('version')==receipt.get('version')=='0.20.0' and
            association.get('status')=='validated','Unsupported candidate association')
    refs=association.get('references');tools=association.get('tools')
    names={'scripts/bind-validated-candidate.py','scripts/apply-parity-gate.py','scripts/parity-ledger.py','scripts/test_parity_ledger.py'}
    require(type(refs) is dict and set(refs)=={'frozenQualified','frozenTools','native','frontend'} and
            type(tools) is list and len(tools)==4 and {r.get('path') for r in tools}==names,'Candidate tool/reference inventory differs')
    archive=load_script(repository,'promote-parity-gate.py','archived_candidate_resources')
    frozen=archive.verify_frozen(repository,refs['frozenTools'],{r['path']:r['sha256'] for r in tools},receipt['version'],_reference_api(),ledger)
    for row in tools:
        file=receipt_file(frozen['sourceRoot'],row['path'])
        require(set(row)=={'path','sha256','bytes'} and file.stat().st_size==row['bytes'],'Executed frozen candidate tool size differs')
    verifier=load_script(frozen['sourceRoot'],'bind-validated-candidate.py','frozen_validated_candidate_verifier')
    return verifier.verify_candidate_association(receipt,association,repository)


def _reference_api():
    # importlib callers need not register this module in sys.modules.
    import types
    return types.SimpleNamespace(verify_reference=verify_reference,receipt_file=receipt_file)


def publish_verified_gate(ledger,association,receipt):
    """Pure update after verification; public CLI never accepts an injected pass."""
    require(receipt.get('requirementId') in REVIEWED and association.get('requirement_id')==receipt['requirementId'],'Unsupported gate publication domain')
    rid=receipt['requirementId']
    result=deepcopy(ledger);record=next(r for r in result['requirements'] if r['requirement_id']==rid)
    if record.get('requirement_gate')==association:return result
    if record.get('implementation_status')=='released' or 'candidate' in record.get('requirement_gate',{}):
        require(all(record.get('requirement_gate',{}).get(key)==association.get(key)
                    for key in ('path','sha256','version','requirement_id')),
                'An existing archived/released gate cannot be silently replaced or downgraded')
        return result # Reapplying the same receipt retains its archival association.
    previous=deepcopy(record)
    previous.pop('gate_publications',None) # Earlier entries stay in the flat retained history.
    history=record.setdefault('gate_publications',[])
    require(type(history) is list,'Existing gate publication history must be retained as an array')
    history.append({'appliedUtc':datetime.now(timezone.utc).isoformat(),'previousRecord':previous,
                    'receipt':deepcopy(association)})
    record.update(implementation_status='validated',release_blocker=False,requirement_gate=deepcopy(association))
    old=record.get('validation_evidence')
    require(old is None or type(old) is str,'Existing validation evidence has an unsupported shape')
    record['validation_evidence']=(old+'\n' if old else '')+(
        'Original finite '+rid+' acceptance independently qualified for version '+receipt['version']+
        '; full packaged/source gate '+association['path']+' (SHA-256 '+association['sha256']+').')
    record['known_limits']='Exact rational arithmetic plus uncertified binary64 roots/transcendentals; reviewed bounded syntax and numeric domains, not an installed Stella6 or whole-product certificate. Other original gates remain independent.' if rid=='MEAS-04' else 'Binary64 numerical regularity within normalized tolerance 1e-8; not an exact/interval or filled-star-volume certificate. Other 72 original requirement gates remain independent.'
    return result


def apply_gate(receipt_path,repository=ROOT,check=False):
    repository=repository.resolve();ledger_module=load_script(repository,'parity-ledger.py','parity_authority')
    path=repository/'docs/parity-ledger.json';require(path.exists(),'Initialize the preserved ledger before applying a gate')
    before=ledger_module.digest(path);ledger=ledger_module.build_ledger(repository)
    receipt,association=verify_gate_receipt(receipt_path,repository)
    updated=publish_verified_gate(ledger,association,receipt)
    ledger_module.validate_ledger(updated,ledger_module.inventory(repository),repository)
    require(ledger_module.digest(path)==before,'Ledger ownership changed during gate verification')
    if not check:ledger_module.atomic_write_ledger(path,updated,before)
    status=next(r['implementation_status'] for r in updated['requirements'] if r['requirement_id']==receipt['requirementId'])
    return {'requirement_id':receipt['requirementId'],'status':status,'version':receipt['version'],
            'receipt':association,'written':not check,'openGateCount':sum(r['release_blocker'] for r in updated['requirements'])}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--receipt',required=True,type=Path);parser.add_argument('--check',action='store_true')
    args=parser.parse_args()
    try:
        result=apply_gate(args.receipt,check=args.check)
    except Exception as error:
        print('Parity gate not applied: '+type(error).__name__+': '+str(error),file=sys.stderr);return 1
    print(json.dumps(result,indent=2));return 0


if __name__=='__main__':raise SystemExit(main())
