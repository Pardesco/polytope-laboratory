"""Associate a reviewed finite LIB-04 or MEAS-04 gate with an actually promoted release.

Only the ledger is written. Candidate application still reruns the full native
collector. Historical regeneration reads retained sources, bytecode, resources
and proofs without executing an engine, Electron, Node or a portable launcher.
These are local reproducible evidence bindings, not signed attestations.
"""
import argparse
from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import marshal
from pathlib import Path
import platform
import re
import struct
import sys

ROOT=Path(__file__).resolve().parents[1]
VERSION='0.20.0' # Reviewed first released adapter; later releases need review.
SHA=re.compile(r'^[0-9a-f]{64}$')
SUITE_SCRIPTS={'core': 'desktop-smoke.cjs', 'graphics': 'viewer-graphics-smoke.cjs', 'design': 'ui-design-smoke.cjs', 'workspace': 'workspace-ui-smoke.cjs', 'animation': 'animation-smoke.cjs', 'stars': 'star-desktop-smoke.cjs', 'memories': 'memories-smoke.cjs', 'inspection': 'inspection-features-smoke.cjs', 'facing': 'cell-facing-smoke.cjs', 'recipes': 'recipes-smoke.cjs', 'units': 'units-export-smoke.cjs', 'presentation': 'entity-presentation-smoke.cjs', 'tours': 'tours-smoke.cjs', 'stereographic': 'stereographic-smoke.cjs', 'faces': 'face-editing-smoke.cjs', 'picking': 'entity-picking-smoke.cjs', 'audits': 'library-audit-smoke.cjs', 'library': 'linked-library-smoke.cjs', 'perspective': 'perspective4d-smoke.cjs', 'refinement': 'construction-refinement-smoke.cjs', 'tracks': 'animation-tracks-smoke.cjs', 'polygons': 'star-polygon-smoke.cjs', 'products': 'polygon-product-smoke.cjs', 'workers': 'stereographic-worker-smoke.cjs', 'families': 'construction-families-smoke.cjs', 'specialized': 'torus-podia-smoke.cjs', 'waterman': 'waterman-smoke.cjs', 'layers': 'layer-join-smoke.cjs', 'crossed': 'crossed-segmentotope-smoke.cjs', 'augmentation': 'augmentation-smoke.cjs', 'projectionFit': 'projection-fit-smoke.cjs', 'sourceConstruction': 'source-construction-smoke.cjs', 'facePlacement': 'face-placement-smoke.cjs', 'core4d': 'convex-core4d-smoke.cjs', 'surfaceSeams': 'stereographic-surface-seams-smoke.cjs', 'sourceZonohedron': 'source-zonohedron-smoke.cjs', 'cellAttributes': 'cell-attributes-smoke.cjs', 'animatedTours': 'animated-tours-smoke.cjs', 'expressions': 'expression-entry-smoke.cjs', 'spring': 'spring-relaxation-smoke.cjs', 'regular4d': 'regular4d-catalog-smoke.cjs', 'workspaceNumeric': 'workspace-numeric-smoke.cjs'}
SUITES=set(SUITE_SCRIPTS)


def application(repository):
    path=repository/'scripts/apply-parity-gate.py'
    spec=importlib.util.spec_from_file_location('released_gate_application',path)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module


def require(condition,message):
    if not condition:raise ValueError(message)


def contained(repository,value):
    require(type(value) is str and value,'Missing evidence path')
    path=Path(value)
    if not path.is_absolute():path=repository/path
    path=path.resolve(strict=True)
    require(path.is_relative_to(repository.resolve()) and path.is_file(),'Evidence escapes repository')
    return path


def reference(repository,path,ledger):
    path=contained(repository,str(path))
    return {'path':path.relative_to(repository).as_posix(),'sha256':ledger.digest(path),'bytes':path.stat().st_size}


def proof_reference(repository,value,app,ledger):
    """Existing release records use absolute paths and optional summary fields."""
    require(type(value) is dict,'Missing release evidence reference')
    path=contained(repository,value.get('path'))
    record={key:value.get(key) for key in ('sha256','bytes')}
    record['path']=path.relative_to(repository).as_posix()
    return app.verify_reference(repository,record,ledger)


def verify_frozen(repository,record,required_hashes,version,app,ledger):
    manifest_path=app.verify_reference(repository,record,ledger)
    require(manifest_path.name=='source-hashes.json' and manifest_path.is_relative_to(repository/'artifacts'),
            'Frozen source manifest must be retained beneath artifacts/')
    manifest=ledger.read_json(manifest_path)
    require(manifest.get('version')==version and type(manifest.get('sourceHashes')) is dict,
            'Frozen source manifest version/schema differs')
    hashes=manifest['sourceHashes']
    require(hashes and all(hashes.get(path)==sha for path,sha in required_hashes.items()),
            'Frozen source manifest omits or changes qualified inputs')
    source_root=(manifest_path.parent/'source').resolve(strict=True)
    require(source_root.is_relative_to(repository/'artifacts') and source_root.is_dir(),'Frozen source directory escaped')
    for name,sha in hashes.items():
        require(type(sha) is str and SHA.fullmatch(sha),'Invalid frozen hash')
        # Use the same portable-path checks as receipt references, including
        # symlink escape detection; no current source file is read here.
        path=app.receipt_file(source_root,name)
        require(ledger.digest(path)==sha,'Frozen source bytes differ: '+name)
    files={p.relative_to(source_root).as_posix() for p in source_root.rglob('*') if p.is_file()}
    require(files==set(hashes),'Frozen source file membership differs')
    return {'version':version,'sourceHashes':hashes,'sourceRoot':source_root}


def verify_engine_resources(unpacked,expected,ledger):
    require(type(expected) is dict and expected,'Missing engine resource manifest')
    directory=unpacked/'resources/engine'
    files={p.relative_to(directory).as_posix():p for p in directory.rglob('*') if p.is_file()}
    require(set(files)==set(expected),'Historical engine resource membership differs')
    for name,path in files.items():
        require(path.resolve().is_relative_to(directory.resolve()),'Engine resource escaped')
        row=expected[name]
        require(type(row) is dict and set(row)=={'bytes','sha256'} and type(row['bytes']) is int and
                path.stat().st_size==row['bytes'] and ledger.digest(path)==row['sha256'],
                'Historical engine resource bytes differ: '+name)


def verify_compiled_native(executable,bundle,frozen,ledger):
    """Read archives as data, comparing full code objects, not filename strings."""
    from PyInstaller.archive.readers import CArchiveReader
    require(bundle.get('python')==platform.python_version(),'Historical bytecode requires matching CPython version')
    archive=CArchiveReader(str(executable));pyz=archive.open_embedded_archive('PYZ.pyz')
    rows=bundle.get('modules')
    require(type(rows) is list and rows and bundle.get('moduleCount')==len(rows),'Missing compiled engine inventory')
    names=[r.get('module') for r in rows]
    require(len(names)==len(set(names)) and set(names)=={n for n in pyz.toc if n=='engine' or n.startswith('engine.')},
            'Historical compiled engine module membership differs')
    for row in rows:
        source=row.get('source');sha=row.get('sha256')
        require(row.get('compiledCodeEqual') is True and frozen['sourceHashes'].get(source)==sha,
                'Compiled module absent from frozen qualification')
        path=frozen['sourceRoot']/source # Already contained and hashed by verify_frozen.
        require(ledger.digest(path)==sha and compile(path.read_bytes(),row['module'],'exec',dont_inherit=True,optimize=0)==pyz.extract(row['module']),
                'Historical compiled engine code differs: '+row['module'])
    server=frozen['sourceRoot']/'engine/server.py'
    require(compile(server.read_bytes(),'server','exec',dont_inherit=True,optimize=0)==marshal.loads(archive.extract('server')),
            'Historical compiled server differs')
    require(hashlib.sha256(archive.extract('PYZ.pyz')).hexdigest()==bundle.get('buildPyzSha256'),
            'Historical embedded PYZ differs from qualified build')


def read_asar_files(archive,expected,version):
    """Read ordinary packed ASAR entries without a Node/Electron process."""
    with archive.open('rb') as stream:
        first=stream.read(16)
        require(len(first)==16,'Truncated ASAR header')
        size_marker,header_size,pickle_size,json_size=struct.unpack('<IIII',first)
        require(size_marker==4 and 8<=header_size<=32*1024**2 and pickle_size+4==header_size and
                0<json_size<=pickle_size-4,'Unsupported ASAR header')
        raw=stream.read(json_size)
        header=json.loads(raw.decode('utf-8'))
        require(type(header) is dict and type(header.get('files')) is dict,'Invalid ASAR file table')
        records={}
        def visit(tree,prefix=''):
            for name,row in tree.items():
                require(type(name) is str and name not in ('.','..') and '/' not in name and '\\' not in name and ':' not in name,
                        'Unsafe ASAR entry')
                path=prefix+name
                require(type(row) is dict,'Invalid ASAR entry record')
                if 'files' in row:visit(row['files'],path+'/')
                else:records[path]=row
        visit(header['files'])
        desired={r['path']:r for r in expected}
        require(len(desired)==len(expected) and set(desired)=={n for n in records if n.startswith(('desktop/','dist/'))},
                'Historical ASAR frontend membership differs')
        def data(name):
            row=records[name]
            require('link' not in row and not row.get('unpacked') and type(row.get('size')) is int and
                    0<=row['size']<=128*1024**2 and type(row.get('offset')) is str and row['offset'].isdigit(),
                    'Unsupported linked/unpacked/oversized ASAR entry')
            offset=8+header_size+int(row['offset'])
            require(offset+row['size']<=archive.stat().st_size,'ASAR entry exceeds archive')
            stream.seek(offset);result=stream.read(row['size'])
            require(len(result)==row['size'],'Truncated ASAR entry')
            return result
        require(json.loads(data('package.json')).get('version')==version,'Historical ASAR version differs')
        for name,row in desired.items():
            raw=data(name)
            require(len(raw)==row['bytes'] and hashlib.sha256(raw).hexdigest()==row['sha256'],
                    'Historical ASAR entry bytes differ: '+name)


def verify_desktop_proofs(repository,release,gate,unpacked,app,ledger,script_hashes):
    validation=release.get('validation',{})
    require(validation.get('packagedSuites')==42,'Released evidence must cover all reviewed 42 packaged suites')
    proofs=validation.get('qualifications');logs=validation.get('suiteLogs')
    require(type(proofs) is list and proofs and type(logs) is list and logs,'Missing full desktop proofs/logs')
    log_paths={proof_reference(repository,row,app,ledger) for row in logs}
    seen=set();proof_paths=set()
    for row in proofs:
        path=proof_reference(repository,row,app,ledger);proof_paths.add(path);proof=ledger.read_json(path)
        runtime=proof.get('runtime',{})
        require(proof.get('passed') is True and proof.get('version')==gate['version'] and
                proof.get('runtimeUnchanged') is True and proof.get('qualificationScriptUnchanged') is True and
                proof.get('qualificationScriptSha256')==script_hashes['scripts/qualify-desktop.cjs'],
                'Historical desktop qualification not passed/unchanged/bound')
        require(contained(repository,proof.get('executable'))==unpacked/'Polytope Laboratory.exe' and
                runtime.get('packaged') is True and runtime.get('version')==gate['version'] and
                runtime.get('executableSha256')==gate['release']['executable']['sha256'] and
                runtime.get('archiveSha256')==gate['release']['appAsar']['sha256'] and
                contained(repository,runtime.get('executablePath'))==unpacked/'Polytope Laboratory.exe' and
                contained(repository,runtime.get('archivePath'))==unpacked/'resources/app.asar',
                'Desktop suite belongs to a different candidate runtime')
        require(runtime.get('mainSha256')==script_hashes['desktop/main.cjs'],'Desktop main source differs')
        entries=proof.get('suites');require(type(entries) is list and entries,'Empty desktop qualification')
        local=set()
        for entry in entries:
            name=entry.get('name');script='scripts/'+str(entry.get('script'))
            require(name in SUITES and entry.get('script')==SUITE_SCRIPTS[name] and name not in local and entry.get('passed') is True and entry.get('exitCode')==0 and
                    entry.get('scriptUnchanged') is True and entry.get('scriptSha256')==script_hashes.get(script),
                    'Missing, repeated or unbound actual desktop suite: '+str(name))
            local.add(name);seen.add(name)
            require(contained(repository,entry.get('log')) in log_paths,'Release omits actual suite log')
    require(seen==SUITES,'Released desktop evidence omits reviewed suites')
    outer_keys=('workspace_desktop_proof','layers_desktop_proof') if gate['requirementId']=='MEAS-04' else ('desktop_proof',)
    require(all(contained(repository,gate['evidence'][key]['path']) in proof_paths for key in outer_keys),
            'Released desktop proof does not retain the finite gate outer run')


def verify_release_references(repository,value,frozen,app,ledger):
    """Rehash every release reference, using historical copies for source refs.

    Release manifests also mention source files by absolute original paths.
    Those are the frozen version's sources, not mutable development files.
    """
    if type(value) is dict:
        if 'path' in value and ('sha256' in value or 'bytes' in value):
            raw=Path(value['path'])
            if not raw.is_absolute():raw=repository/raw
            path=raw.resolve()
            require(path.is_relative_to(repository),'Release reference escapes repository')
            relative=path.relative_to(repository).as_posix()
            if relative in frozen['sourceHashes']:
                target=frozen['sourceRoot']/relative
                require(value.get('sha256')==frozen['sourceHashes'][relative] and
                        target.stat().st_size==value.get('bytes'),'Historical source reference differs: '+relative)
            else:proof_reference(repository,value,app,ledger)
        for child in value.values():verify_release_references(repository,child,frozen,app,ledger)
    elif type(value) is list:
        for child in value:verify_release_references(repository,child,frozen,app,ledger)


def verify_portable_binding(binding,gate,native,unpacked):
    require(type(binding) is dict and binding.get('unchanged') is True and binding.get('matchesCandidate') is True and
            binding.get('candidateRoot')==str(unpacked) and
            binding.get('archiveSha256')==gate['release']['appAsar']['sha256'] and
            binding.get('nativeExecutableSha256')==gate['release']['engineExecutable']['sha256'] and
            binding.get('engineResources')==native['engineResources'],
            'Portable extracted runtime is not bound to finite gate candidate')
    for actual_key,gate_key in (('executable','executable'),('archive','appAsar'),('nativeExecutable','engineExecutable')):
        require(binding.get(actual_key)=={k:gate['release'][gate_key][k] for k in ('bytes','sha256')},
                'Extracted portable resource bytes/hash differ: '+actual_key)


def verify_promotion_files(repository,promotion,release,gate,refs,app,ledger):
    require(promotion.get('releaseProofSha256')==refs['release']['sha256'] and
            promotion.get('nativeProofSha256')==refs['native']['sha256'] and
            promotion.get('frontendProofSha256')==refs['frontend']['sha256'] and
            promotion.get('previousReleasesUnchanged') is True,'Promotion proofs are not the reviewed release')
    source=contained(repository,promotion.get('source'));destination=contained(repository,promotion.get('destination'))
    expected_name='Polytope Laboratory '+VERSION+'.exe'
    require(destination==repository/'release'/expected_name and source.name==expected_name and
            source.parent==Path(gate['unpackedRoot']).parent,'Promotion source/destination differs')
    portable=proof_reference(repository,release.get('portable'),app,ledger)
    require(portable==source and promotion.get('bytes')==source.stat().st_size==destination.stat().st_size and
            promotion.get('sha256')==ledger.digest(source)==ledger.digest(destination),'Promoted portable bytes differ')
    previous=promotion.get('previousReleaseHashes')
    require(type(previous) is dict and previous,'No retained previous release hashes')
    for name,sha in previous.items():
        match=re.fullmatch(r'Polytope Laboratory ([0-9]+)\.([0-9]+)\.([0-9]+)\.exe',name)
        require(match and tuple(map(int,match.groups()))<tuple(map(int,VERSION.split('.'))) and
                ledger.digest(contained(repository,str(repository/'release'/name)))==sha,
                'Previous promoted release changed')
    return source,destination


def verify_release_association(gate,association,repository=ROOT):
    repository=repository.resolve();app=application(repository)
    ledger=app.load_script(repository,'parity-ledger.py','released_ledger_reader')
    require(type(association) is dict and association.get('format')=='polytope-released-gate-association' and
            association.get('schemaVersion')==1 and association.get('version')==gate.get('version')==VERSION,
            'No reviewed released association/version')
    refs=association.get('references')
    required={'promotion','release','native','frontend','frozenNative','frozenFrontend','frozenQualified'}
    require(type(refs) is dict and set(refs)==required,'Released association reference inventory differs')
    paths={name:app.verify_reference(repository,row,ledger) for name,row in refs.items()}
    qualified_hashes={**gate.get('nativeSourceHashes',{}),**gate.get('frontendSourceHashes',{})}
    require(all(gate.get('frontendSourceHashes',{}).get(n,s)==s for n,s in gate.get('nativeSourceHashes',{}).items()),
            'Conflicting qualified source manifests')
    qualified_hashes.update({row['path']:row['sha256'] for row in gate.get('scripts',[])})
    qualified_hashes['STELLA4D_FEATURE_COMPLETE_BUILD_SPEC.md']=gate.get('specification',{}).get('sha256')
    frozen=verify_frozen(repository,refs['frozenQualified'],qualified_hashes,VERSION,app,ledger)
    app.verify_receipt_references(gate,repository,historical=frozen)
    verify_frozen(repository,refs['frozenNative'],gate['nativeSourceHashes'],VERSION,app,ledger)
    build_subset={n:s for n,s in gate['frontendSourceHashes'].items() if n.startswith(('ui/','desktop/')) or n in ('package.json','package-lock.json','vite.config.mjs')}
    verify_frozen(repository,refs['frozenFrontend'],build_subset,VERSION,app,ledger)
    require(json.loads((frozen['sourceRoot']/'package.json').read_text(encoding='utf-8')).get('version')==VERSION,
            'Frozen build version differs')
    require(paths['native']==contained(repository,gate['evidence']['native_bundle_proof']['path']) and
            paths['frontend']==contained(repository,gate['evidence']['frontend_proof']['path']),
            'Promotion does not use the original finite gate component proofs')
    promotion=ledger.read_json(paths['promotion']);release=ledger.read_json(paths['release'])
    native=ledger.read_json(paths['native']);frontend=ledger.read_json(paths['frontend'])
    for name,proof in (('promotion',promotion),('native',native),('frontend',frontend)):
        require(proof.get('passed') is True and proof.get('version')==VERSION,'Unqualified released component: '+name)
    require(release.get('schemaVersion')==1 and release.get('version')==VERSION and
            release.get('fullFeatureGoalComplete') is False and promotion.get('fullFeatureGoalComplete') is False,
            'Unsupported release version/product-wide claim')
    verify_release_references(repository,release,frozen,app,ledger)
    source,destination=verify_promotion_files(repository,promotion,release,gate,refs,app,ledger)
    unpacked=Path(gate['unpackedRoot']).resolve(strict=True)
    require(native.get('sourceUnchanged') is True and native.get('nativeSourceHashes')==gate['nativeSourceHashes'] and
            native.get('engineResourceBytesMatch') is True and native.get('candidateQualified') is True and
            native.get('unpackedRoot')==str(unpacked) and native.get('packagedExecutableSha256')==gate['release']['engineExecutable']['sha256'],
            'Historical compiled native proof/source binding differs')
    verify_engine_resources(unpacked,native.get('engineResources'),ledger)
    verify_compiled_native(unpacked/'resources/engine/polytope-engine.exe',native,frozen,ledger)
    require(frontend.get('currentInputsUnchanged') is True and frontend.get('archiveSha256')==gate['release']['appAsar']['sha256'] and
            frontend.get('sourceTestProofSha256')==gate['evidence']['frontendSourceProof']['sha256'] and
            contained(repository,frontend.get('archive'))==unpacked/'resources/app.asar' and
            contained(repository,frontend.get('sourceTestProof'))==contained(repository,gate['evidence']['frontendSourceProof']['path']),
            'Historical frontend qualification differs')
    read_asar_files(unpacked/'resources/app.asar',frontend.get('files'),VERSION)
    fresh=frontend.get('freshBuild',{})
    require(fresh.get('allBytesMatch') is True and type(fresh.get('files')) is list,'No retained fresh frontend reproduction')
    directory=Path(fresh.get('directory','')).resolve(strict=True)
    require(directory.is_relative_to(repository/'artifacts') and directory.is_dir(),'Frontend reproduction escaped artifacts/')
    dist={r['path'].removeprefix('dist/'):r for r in frontend['files'] if r['path'].startswith('dist/')}
    require(len(fresh['files'])==len(dist) and set(fresh['files'])==set(dist), 'Fresh frontend file membership differs')
    for name,row in dist.items():
        file=app.receipt_file(directory,name)
        require(file.stat().st_size==row['bytes'] and ledger.digest(file)==row['sha256'],'Retained fresh frontend bytes differ: '+name)
    source_proof=ledger.read_json(contained(repository,gate['evidence']['frontendSourceProof']['path']))
    native_proof=ledger.read_json(contained(repository,gate['evidence']['native_source_proof']['path']))
    for proof,hashes in ((source_proof,gate['frontendSourceHashes']),(native_proof,gate['nativeSourceHashes'])):
        require(proof.get('version')==VERSION and proof.get('passed') is True and proof.get('sourceUnchanged') is True and
                proof.get('sourceHashes')==hashes and proof.get('exitCode')==0 and proof.get('changedPaths')==[],
                'Full qualified historical input proof differs')
    require(source_proof.get('qualificationScriptSha256')==frozen['sourceHashes']['scripts/qualify-frontend-development.cjs'] and
            native_proof.get('qualificationScriptSha256')==frozen['sourceHashes']['scripts/qualify-native-development.py'],
            'Historical source qualification runner bytes differ')
    require(native.get('nativeSourceProofSha256')==gate['evidence']['native_source_proof']['sha256'] and
            contained(repository,native.get('nativeSourceProof'))==contained(repository,gate['evidence']['native_source_proof']['path']),
            'Native component does not retain the original full source qualification')
    verify_desktop_proofs(repository,release,gate,unpacked,app,ledger,frozen['sourceHashes'])
    actual=release.get('validation',{}).get('actualPortable')
    actual_path=proof_reference(repository,actual,app,ledger);launcher=ledger.read_json(actual_path)
    require(actual.get('result')==launcher and launcher.get('passed') is True and launcher.get('version')==VERSION and
            launcher.get('runtimeUnchanged') is True and launcher.get('developmentPythonDisabled') is True and
            contained(repository,launcher.get('executable'))==source and launcher.get('executableSha256')==promotion['sha256'],
            'No actual unchanged portable launcher proof')
    # The launcher report must bind its actual extracted payload to the exact
    # gate candidate, not just report success from any running application.
    verify_portable_binding(launcher.get('extractedRuntime'),gate,native,unpacked)
    return association


def publish_released(ledger,gate_association,release_association):
    require(gate_association.get('requirement_id') in ('LIB-04','MEAS-04'),'Unsupported released gate domain')
    result=deepcopy(ledger);record=next(r for r in result['requirements'] if r['requirement_id']==gate_association['requirement_id'])
    require(record.get('implementation_status') in ('validated','released') and record.get('release_blocker') is False and
            all(record.get('requirement_gate',{}).get(key)==gate_association.get(key) for key in ('path','sha256','version','requirement_id')),
            'Release must associate an already independently validated gate')
    association={**deepcopy(gate_association),'status':'released','release':deepcopy(release_association)}
    if record.get('requirement_gate')==association:return result
    previous=deepcopy(record);previous.pop('gate_publications',None)
    record.setdefault('gate_publications',[]).append({'appliedUtc':datetime.now(timezone.utc).isoformat(),
        'previousRecord':previous,'receipt':deepcopy(association)})
    record.update(implementation_status='released',requirement_gate=association)
    record['validation_evidence']=(record.get('validation_evidence') or '')+'\nFinite '+gate_association['requirement_id']+' acceptance released in promoted portable '+association['version']+'; retained frozen sources, all 42 packaged suites and actual extracted portable runtime are bound to the original gate.'
    return result


def promote_gate(args,repository=ROOT):
    repository=repository.resolve();app=application(repository)
    ledger=app.load_script(repository,'parity-ledger.py','released_ledger_authority')
    path=repository/'docs/parity-ledger.json';before=ledger.digest(path);value=ledger.build_ledger(repository)
    gate,gate_association=app.verify_gate_receipt(args.receipt,repository) # strict current + actual native collector
    names=('promotion','release','native','frontend','frozenNative','frozenFrontend','frozenQualified')
    association={'format':'polytope-released-gate-association','schemaVersion':1,'version':gate['version'],
                 'references':{name:reference(repository,getattr(args,name),ledger) for name in names}}
    verify_release_association(gate,association,repository)
    updated=publish_released(value,gate_association,association)
    ledger.validate_ledger(updated,ledger.inventory(repository),repository)
    require(ledger.digest(path)==before,'Ledger changed during release verification')
    if not args.check:ledger.atomic_write_ledger(path,updated,before)
    return {'requirement_id':gate['requirementId'],'status':'released','version':gate['version'],'written':not args.check,
            'openGateCount':sum(r['release_blocker'] for r in updated['requirements'])}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--receipt',type=Path,required=True)
    for flag,destination in (('promotion-proof','promotion'),('release-proof','release'),('native-proof','native'),
                             ('frontend-proof','frontend'),('frozen-native-manifest','frozenNative'),
                             ('frozen-frontend-manifest','frozenFrontend'),('frozen-qualified-manifest','frozenQualified')):
        flags=['--'+flag]
        if destination=='frozenQualified':flags.append('--frozen-source-manifest')
        parser.add_argument(*flags,dest=destination,type=Path,required=True)
    parser.add_argument('--check',action='store_true')
    args=parser.parse_args()
    try:result=promote_gate(args)
    except Exception as error:
        print('Released gate not applied: '+type(error).__name__+': '+str(error),file=sys.stderr);return 1
    print(json.dumps(result,indent=2));return 0


if __name__=='__main__':raise SystemExit(main())
