"""Collect the unchanged finite MEAS-04 acceptance from a qualified package.

Only a new exclusive evidence JSON is written. No Electron, native dialog,
ledger update, compiler rebuild or GUI launch. --self-test uses inert fixtures
and cannot produce a passed gate. Fresh engine requests are read-only JSONL.
"""
import argparse
import ast
from copy import deepcopy
from datetime import datetime, timezone
from fractions import Fraction
import hashlib
import importlib.util
import json
import math
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
def load(filename,name):
    spec=importlib.util.spec_from_file_location(name,ROOT/'scripts'/filename)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
base=load('qualify-lib04-gate.py','unchanged_lib04_utilities')
promotion=load('promote-parity-gate.py','reviewed_archive_reader')
for name in ('GateError','require','digest','canonical','parse_json','read_json','contained','relative_path','reference',
             'scope_snapshot','verify_source_proof','verify_link','file_manifest','validate_runtime','output_path'):
    globals()[name]=getattr(base,name)
ACCEPTANCE='Safe expression parser, constants, arithmetic, roots, trig, and polygon helper functions'
INPUTS=('native_source_proof','native_bundle_proof','frontend_proof','workspace_desktop_proof','workspace_suite_result',
        'layers_desktop_proof','layers_suite_result')
SCRIPT_PATHS={'scripts/qualify-meas04-gate.py','scripts/qualify-lib04-gate.py','scripts/promote-parity-gate.py',
              'scripts/qualify-desktop.cjs','scripts/workspace-numeric-smoke.cjs','scripts/layer-join-smoke.cjs',
              'scripts/qualify-native-bundle.py','scripts/qualify-frontend-candidate.cjs',
              'scripts/qualify-native-development.py','scripts/qualify-frontend-development.cjs'}
GATE_CHECKS={'safeBoundedParser','independentConstantsArithmeticRootsTrig','literalPolygonSymbolsAndIndependentCoordinates',
             'packagedRefusalsAndValidContinuation','exactRationalThresholdAndAtomicBatch','packagedWorkspace13AndLayers11',
             'fullSavedSourceSnapshotsEqual','allQualifiedInputHashesEqual','compiledBundleAndFrontendProofsBound',
             'all115ParserAndBatchFixturesInFullQualification'}
DOMAIN={'characters':512,'astNodes':100,'nesting':64,'maximumPowerExponent':100,'maximumLiteralExponent':3000,
        'maximumRationalBits':12000,'maximumMagnitude':1e100,'maximumBatchValues':80000,
        'batchBytes':128*1024**2,'numericModes':['rational-exact','float64-approximate'],
        'constants':['pi','e','phi','tau','g'],'roots':['sqrt','r'],
        'trig':['sin','cos','tan','asin','acos','atan','sind','cosd','tand'],
        'polygonHelpers':['faceRad','faceAngle','diag'],'polygonArguments':'literal positive n/d; n>=3,0<d<n,2*d!=n',
        'retrogradeAngle':'signed degrees','certifiedTranscendentals':False,'baseline6Executed':False}
# Exact reviewed workflow strings; counters or substituted summaries do not qualify.
WORKSPACE_CHECKS=['Section nested-vector/depth expressions and Next vertex use intrinsic coordinates; zero normal and invalid depth refuse atomically without source/RGBA/unit changes', 'Block evaluates only its size vector; Wythoff nested weights preserve literal ring-mask domain and refuse incompatible weights', 'A real 36-coordinate point-cloud hull uses exactly one native expression-batch job and retains the independent cube boundary', 'Exact rational hull coordinates and FCC 4−10^-40 versus4 membership stay distinct across actual typed expressions and native transport', 'Geodesic/subdivision/cupola/step/torus counts evaluate expressions before integer checks and retain literal incidence/source history; fractional counts refuse without publication', 'Signed speed edits preserve advancing angles; radius/perspective expressions persist; near≥distance refuses atomically; full sourceRGBA/mm remains unchanged', 'A later rotation and observer projection edit during actual native recipe computation survive commit and Save/Open; source and operation snapshots retain their original geometry', 'Actual First/Last accepts nested expressions and blank native inference, rejects zero direction and changed units after native wait, and preserves a later rotation edit without changing source/RGBA', 'Held real expression-batch units case refuses stale publication atomically; source snapshots and user changes survive', 'Held real expression-batch input case refuses stale publication atomically; source snapshots and user changes survive', 'Held real expression-batch document case refuses stale publication atomically; source snapshots and user changes survive', 'Held real expression-batch cancel case refuses stale publication atomically; source snapshots and user changes survive', 'After cancellation and stale-source refusals, subsequent real native numeric entry succeeds with a fresh owner']
LAYERS_CHECKS=['current cube copy produces every independently checked tesseract vertex/edge/face/cell; source cycles, byte/unit RGBA and units retained', 'undo/redo, native Replay and parameter Branch preserve literal source and ownership; Save/Open retains recorded algorithm0.1 and full evidence', 'point pyramid and edge layer join retain actual0D/1D compact snapshots with distinct stable IDs through native replay', 'actual numbered polygon/3D memories remain immutable; signed height, explicit reflection and XYZ translation agree with all source-to-output coordinates', 'fitted height ignores disabled manual expression, resolves cube-copy h2 and origin-point h1 with independent equal-edge/hypersphere checks; read-only numerical predicates state not a certificate; fit Replay/Open preserves evidence, unequal layers/off-center point refuse atomically', 'zero-height/coincident-edge/nonconvex boundary refusals are atomic; no source/history replacement, followed by successful recovery', 'held export disables construction; explicit bypass also refuses; cancellation restores complete source/view/history without staged output', 'Actual quarter-turn nine-entry expression matrix: nested commas/degree trig, one13-value batch, signed height, independent complete tesseract incidence/maps/RGBA/mm and numerical recipe Replay/Save/Open', 'Actual reflection nine-entry expression matrix: nested commas/degree trig, one13-value batch, signed height, independent complete tesseract incidence/maps/RGBA/mm and numerical recipe Replay/Save/Open', 'Already-computed real expression and native recipe replies: changed effective units/form and global Cancel all refuse publication; intentional changes survive with source/RGBA/history/memories intact', 'A fresh real expression-matrix construction succeeds after all held-reply ownership/cancellation refusals']


def spec_inventory():
    result=base.spec_inventory()
    row=next(r for r in result['requirements'] if r['id']=='MEAS-04')
    require(row=={'id':'MEAS-04','coverage':'Expression entry','acceptance':ACCEPTANCE},'Original MEAS-04 acceptance differs')
    return {**result,'row':row}


def fixture_counts(path):
    count=0
    for node in ast.parse(path.read_text(encoding='utf-8-sig')).body:
        if isinstance(node,ast.FunctionDef) and node.name.startswith('test_'):
            cases=1
            for decorator in node.decorator_list:
                if isinstance(decorator,ast.Call) and isinstance(decorator.func,ast.Attribute) and decorator.func.attr=='parametrize':
                    require(isinstance(decorator.args[1],(ast.List,ast.Tuple)),'Unknown fixture parametrization')
                    cases*=len(decorator.args[1].elts)
            count+=cases
    return count


def verify_suite(suite,outer,name,path,version,unpacked,frontend,engine_hash):
    expected=WORKSPACE_CHECKS if name=='workspace' else LAYERS_CHECKS
    key,script=('workspaceNumeric','workspace-numeric-smoke.cjs') if name=='workspace' else ('layers','layer-join-smoke.cjs')
    require(type(suite) is dict and suite.get('passed') is True and suite.get('packaged') is True and
            suite.get('version')==version and suite.get('checks')==expected and suite.get('pageErrors')==[],
            'Packaged '+name+' did not pass every reviewed workflow')
    require(type(outer) is dict and outer.get('passed') is True and outer.get('runtimeUnchanged') is True and
            outer.get('version')==version and outer.get('runtime')==suite.get('runtime') and
            outer.get('qualificationScriptUnchanged') is True and
            outer.get('qualificationScriptSha256')==digest(ROOT/'scripts/qualify-desktop.cjs'),
            'Actual '+name+' outer runtime/runner execution is unbound')
    require(contained(outer.get('executable',''))==contained(suite['runtime']['executablePath']), 'Outer executable differs')
    entries=outer.get('suites')
    require(type(entries) is list and entries and all(r.get('passed') is True and r.get('exitCode')==0 for r in entries),
            'Outer suite run failed/incomplete')
    selected=[e for e in entries if e.get('name')==key]
    require(len(selected)==1 and selected[0].get('script')==script and selected[0].get('scriptUnchanged') is True and
            selected[0].get('scriptSha256')==digest(ROOT/'scripts'/script),'Actual '+name+' harness execution is unbound')
    log=contained(selected[0].get('log',''))
    expected_log='Workspace numeric smoke PASS. '+str(path.parent) if name=='workspace' else 'Layer join smoke PASS: 11 groups. Artifacts: '+str(path.parent)
    require(path.parent.parent==log.parent and expected_log in log.read_text(encoding='utf-8'),
            'Outer log does not bind actual artifacts')
    validate_runtime(suite.get('runtime'),version,unpacked,frontend,engine_hash)
    for row in suite.get('sourceHashes',[]):
        require(digest(relative_path(ROOT,row['file']))==row['sha256'],'Actual suite source bytes differ')
    files=suite.get('files');require(type(files) is list and files,'No saved source evidence')
    result={}
    for row in files:
        file=contained(row.get('file',''))
        require(file.parent==path.parent and file.suffix=='.polyproj' and file.name not in result and
                digest(file)==row.get('sha256'),'Saved source file identity/hash differs')
        result[file.name]=(file,read_json(file))
    return log,result


def active(project):
    try:
        doc=project['documents'][project['active']];return doc['states'][doc['cursor']]
    except (KeyError,IndexError,TypeError) as error:raise GateError('Saved project lacks active state') from error


def verify_saved_sources(workspace,layers):
    records=[]
    def state(files,name):
        require(name in files,'Required before/after source evidence omitted: '+name)
        return active(files[name][1])
    def unchanged(files,before,after):
        a,b=state(files,before),state(files,after)
        require(a['model']==b['model'] and a.get('notes')==b.get('notes'),'Full source/notes changed: '+after)
        records.append({'before':before,'after':after,'sourceSha256':hashlib.sha256(canonical(a['model'])).hexdigest()})
    for after in ('04-section-expressions.polyproj','05-section-next-vertex.polyproj','06-section-atomic-refusal.polyproj','07-section-atomic-refusal.polyproj'):
        unchanged(workspace,'03-native-fixture.polyproj',after)
    for after in ('32-display-expression-values.polyproj','33-near-equals-distance-refusal.polyproj','34-before-signed-spin.polyproj','35-signed-spin.polyproj','36-display-reopened.polyproj'):
        unchanged(workspace,'31-native-fixture.polyproj',after)
    for after in ('43-orientation-nested-expressions.polyproj','44-orientation-native-inference.polyproj','45-orientation-zero-refusal.polyproj','46-orientation-preserves-latest-pose.polyproj','47-orientation-held-native-unit-refusal.polyproj'):
        unchanged(workspace,'42-native-fixture.polyproj',after)
    for before,after in (('49-native-fixture.polyproj','50-held-units.polyproj'),('52-native-fixture.polyproj','53-held-input.polyproj'),('58-native-fixture.polyproj','59-held-cancel.polyproj')):
        unchanged(workspace,before,after)
    source=state(layers,'41-expression-matrix-source-native.polyproj')['model']
    require(source['metadata'].get('coordinateUnits')=='mm' and source['metadata'].get('offColors'), 'No full source units/RGBA witness')
    for name in ('42-joined-current.polyproj','43-matrix-expression-quarter-turn-replay.polyproj','44-matrix-expression-quarter-turn-reopened.polyproj',
                 '45-joined-current.polyproj','46-matrix-expression-reflection-replay.polyproj','47-matrix-expression-reflection-reopened.polyproj'):
        model=state(layers,name)['model'];e=model.get('metadata',{}).get('convexLayerJoin',{})
        require(len(e.get('layers',[]))==2 and all(l.get('sourceSnapshot')==source for l in e['layers']),
                'Expression operation lost full source snapshot: '+name)
        reflection=name.startswith(('45-','46-','47-'))
        require(e.get('height')==(-2 if reflection else 2) and
                e['layers'][0]['transform']=={'determinant':1,'matrix':[[1,0,0],[0,1,0],[0,0,1]],'translation':[0,0,0]} and
                e['layers'][1]['transform']=={'determinant':-1 if reflection else 1,
                    'matrix':[[-1,0,0],[0,1,0],[0,0,1]] if reflection else [[0,-1,0],[1,0,0],[0,0,1]],'translation':[0,0,0]},
                'Independent expected signed height/quarter-turn/reflection differs')
        for i,layer in enumerate(e['layers']):
            ids=layer['maps']['vertices'];transform=layer['transform']
            require(len(ids)==len(source['vertices']) and len(set(ids))==len(ids),'Invalid literal source-to-output map')
            for p,index in zip(source['vertices'],ids):
                expected=[sum(transform['matrix'][a][b]*p[b] for b in range(3))+transform['translation'][a] for a in range(3)]+[(-1 if i==0 else 1)*e['height']/2]
                require(len(model['vertices'][index])==4 and all(math.isclose(a,b,rel_tol=1e-12,abs_tol=1e-12) for a,b in zip(model['vertices'][index],expected)),
                        'Independent source coordinate/height mapping differs')
            for origin,targets in enumerate(layer['maps']['faces']):
                if type(targets) is int:targets=[targets]
                for target in targets:require(model['metadata']['offColors']['faces'][target]==source['metadata']['offColors']['faces'][origin], 'Source RGBA changed')
        records.append({'before':'41-expression-matrix-source-native.polyproj','after':name,
                        'sourceSha256':hashlib.sha256(canonical(source)).hexdigest()})
    return records


def cases():
    """Independent numeric expectations; never imports the production parser."""
    result=[]
    def positive(expression,expected,rational=None,abs_tol=1e-12):
        result.append({'op':'expression','params':{'expression':expression},'expected':{'value':expected,
            'exactRational':rational,'mode':'rational-exact' if rational is not None else 'float64-approximate'},'absTolerance':abs_tol})
    for expression,number in [('1/5','1/5'),('3.1+2.5*3','53/5'),('(2-1)(3+1)','4'),('2^7','128'),('2^3^2','512'),('-2^2','-4'),('2^-3','1/8'),('1/3+1/6','1/2'),('8/2(2+2)','16')]:
        positive(expression,float(Fraction(number)),number)
    golden=(1+math.sqrt(5))/2
    for name,value in [('phi',golden),('tau',golden),('g',golden),('pi',math.pi),('e',math.e)]:positive(name,value)
    for expression,value in [('sqrt(2)',math.sqrt(2)),('1+3r2',1+3*math.sqrt(2)),('sin(pi/2)',1),('cos(0)',1),('tan(pi/4)',1),('sind(30)',.5),('cosd(60)',.5),('tand(45)',1),('cos(deg(60))',.5),('sind(360000000000000000000000000000030)',.5)]:positive(expression,value)
    positive('cosd(90+1e-30)',-math.pi*1e-30/180,abs_tol=0)
    for expression,value in [('asin(1)',math.pi/2),('acos(0)',math.pi/2),('atan(1)',math.pi/4)]:positive(expression,value)
    polygons=[(3,1),(4,1),(5,1),(5,2),(7,2),(8,3),(13,5),(5,3),(8,5),(6,2),(9,3)]
    for n,d in polygons:
        points=[(math.cos(2*math.pi*j*d/n),math.sin(2*math.pi*j*d/n)) for j in (-1,0,1)]
        dist=lambda a,b:math.hypot(a[0]-b[0],a[1]-b[1])
        edge=dist(points[0],points[1]);a=[points[0][i]-points[1][i] for i in (0,1)];b=[points[2][i]-points[1][i] for i in (0,1)]
        corner=math.degrees(math.acos(max(-1,min(1,sum(x*y for x,y in zip(a,b))/edge**2))))*(1 if 2*d<n else -1)
        positive(f'faceRad({n}/{d})',1/edge)
        positive(f'diag({n}/{d})',dist(points[0],points[2])/edge)
        positive(f'faceAngle({n}/{d})',corner,str(Fraction(180)-Fraction(360*d,n)))
    for expression in ('__import__("os")','(1).__class__','open("file")','lambda:1','[1]','1;2','sqrt(-1)','1/0','(-1)^.5','tand(90)','2^101','1e101',
                       'faceRad(4/2)','faceRad(5/0)','diag(5,2)','diag(3+2)','diag(5/-2)','unknown(1)','1'*513,'('*66+'1'+')'*66,'+'.join(['1']*60),'1e-1000000000','(1e-100)^100'):
        result.append({'op':'expression','params':{'expression':expression},'refusal':True})
    threshold=str(Fraction(4)-Fraction(1,10**40))
    result.append({'op':'expression-batch','params':{'expressions':['4 - 1/10^40','4','2/6','faceAngle(5/2)'],'mode':'rational'},'expected':{'mode':'rational','values':[threshold,'4','1/3','36']}})
    result.append({'op':'expression-batch','params':{'expressions':['1','sqrt(2)'],'mode':'rational'},'refusal':True})
    result.append({'op':'expression-batch','params':{'expressions':['2+3','1/0']},'refusal':True})
    result.append({'op':'expression-batch','params':{'expressions':['1']*80001,'mode':'real'},'refusal':True})
    result.append({'op':'expression-batch','params':{'expressions':['1'],'mode':'code'},'refusal':True})
    result.append({'op':'expression-batch','params':{'expressions':['2+3','sind(30)','diag(5/2)']},'expected':{'mode':'real','values':[5,.5,1/golden]}})
    return result


def validate_engine_replies(requests,rows,fixtures):
    require(len(rows)==len(requests)==len(fixtures),'Packaged expression reply count differs')
    for request,row,fixture in zip(requests,rows,fixtures):
        require(type(row) is dict and row.get('id')==request['id'],'Expression replies missing/reordered')
        if fixture.get('refusal'):
            require(row.get('ok') is False and type(row.get('error')) is str and row['error'] and 'result' not in row,'Invalid expression was not atomically refused')
        else:
            require(row.get('ok') is True,'Packaged valid expression refused')
            expected=fixture['expected'];actual=row.get('result')
            require(type(actual) is dict and set(actual)==set(expected),'Expression result schema differs')
            for name,value in expected.items():
                if name=='value' or name=='values' and expected.get('mode')=='real':
                    a=[actual[name]] if name=='value' else actual[name];b=[value] if name=='value' else value
                    require(type(a) is list and len(a)==len(b) and all(type(x) in (int,float) and math.isfinite(x) and
                            math.isclose(x,y,rel_tol=1e-12,abs_tol=fixture.get('absTolerance',1e-12)) for x,y in zip(a,b)),
                            'Independent expression numeric oracle differs: '+request['id'])
                else:require(actual[name]==value,'Exact expression mode/rational evidence differs')


def run_engine(engine,timeout):
    fixtures=cases();requests=[{'id':'meas04-'+str(i),'op':c['op'],'params':c['params']} for i,c in enumerate(fixtures)]
    env=os.environ.copy()
    for name in ('PYTHONPATH','PYTHONHOME','ELECTRON_RUN_AS_NODE'):env.pop(name,None)
    options={'creationflags':subprocess.CREATE_NO_WINDOW} if os.name=='nt' else {}
    with tempfile.TemporaryFile() as output,tempfile.TemporaryFile() as errors:
        child=subprocess.run([str(engine)],input=b''.join(canonical(r)+b'\n' for r in requests),stdout=output,stderr=errors,
                             cwd=engine.parent,env=env,timeout=timeout,**options)
        require(child.returncode==0 and output.tell()<=base.MAX_JSON and errors.tell()<=1024**2,'Packaged expression process/output failed')
        output.seek(0);errors.seek(0);raw=output.read();err=errors.read()
    require(not err.strip(),'Packaged engine wrote unexpected stderr')
    rows=[parse_json(line) for line in raw.decode('utf-8').splitlines() if line.strip()]
    validate_engine_replies(requests,rows,fixtures)
    return {'requestCount':len(requests),'responseCount':len(rows),'positiveCount':sum(not c.get('refusal') for c in fixtures),
            'refusalCount':sum(bool(c.get('refusal')) for c in fixtures),'allIndependentCasesEqual':True,
            'validContinuationAfterRefusal':True,'fixtureSha256':hashlib.sha256(canonical(fixtures)).hexdigest(),
            'jsonlOutputSha256':hashlib.sha256(raw).hexdigest(),'stderrBytes':len(err)}


def qualify_runtime(args):
    started=datetime.now(timezone.utc).isoformat()
    spec_inventory()
    version = read_json(ROOT/'package.json')['version']
    unpacked = contained(args.unpacked_root, directory=True)
    require(unpacked.is_relative_to(ROOT/'release'), 'Unpacked candidate must reside beneath release/')
    paths = {name:contained(getattr(args,name)) for name in INPUTS}
    require(len(set(paths.values())) == len(paths), 'Evidence inputs must be distinct files')
    evidence_before = {name:reference(path) for name,path in paths.items()}
    proofs = {name:read_json(path) for name,path in paths.items()}
    native_before, frontend_before = scope_snapshot(), scope_snapshot(True)
    native = proofs['native_source_proof']; bundle = proofs['native_bundle_proof']; frontend = proofs['frontend_proof']
    verify_source_proof(native, native_before, version)
    require(bundle.get('passed') is True and bundle.get('candidateQualified') is True and
            bundle.get('mode') == 'candidate-qualification' and bundle.get('version') == version and
            bundle.get('sourceUnchanged') is True and bundle.get('buildUnchanged') is True and
            contained(bundle.get('unpackedRoot', ''), directory=True) == unpacked and
            bundle.get('nativeSourceHashes') == native_before and bundle.get('nativeSourceHashCount') == len(native_before),
            'Native bundle proof does not bind the qualified unchanged candidate')
    require(bundle.get('verifierSha256') == digest(ROOT/'scripts/qualify-native-bundle.py'),
            'Native bundle qualification verifier bytes changed')
    verify_link(bundle, 'nativeSourceProof','nativeSourceProofSha256',paths['native_source_proof'])
    for field in ('serverCompiledCodeEqual','embeddedPyzBytesMatch','buildArchiveEngineCodeMatches',
                  'candidateEmbeddedPyzBytesMatch','candidateServerCompiledCodeEqual','engineResourceBytesMatch','catalogBytesMatch'):
        require(bundle.get(field) is True, 'Native bundle proof missing check: '+field)
    modules = bundle.get('modules')
    require(type(modules) is list and len(modules) == bundle.get('moduleCount') and
            len({m.get('module') for m in modules}) == len(modules), 'Native compiled module inventory invalid')
    for module in modules:
        require(module.get('compiledCodeEqual') is True and native_before.get(module.get('source')) == module.get('sha256'),
                'Compiled module/source binding invalid')
    require({'engine.expressions','engine.expression_batch','engine.formats','engine.geometry'} <=
            {m['module'] for m in modules}, 'MEAS-04 native implementation not qualified in compiled bundle')
    engine = contained(unpacked/'resources/engine/polytope-engine.exe')
    resources_before = file_manifest(engine.parent)
    require(resources_before == bundle.get('engineResources') and len(resources_before) == bundle.get('engineResourceFileCount') and
            digest(engine) == bundle.get('packagedExecutableSha256'), 'Packaged native engine/resource bytes changed')
    require(frontend.get('passed') is True and frontend.get('currentInputsUnchanged') is True and frontend.get('version') == version and
            contained(frontend.get('archive', '')) == unpacked/'resources/app.asar' and
            frontend.get('freshBuild', {}).get('allBytesMatch') is True, 'Frontend candidate proof invalid')
    front_source_path = contained(frontend.get('sourceTestProof', ''))
    verify_link(frontend,'sourceTestProof','sourceTestProofSha256',front_source_path)
    front_source = read_json(front_source_path)
    verify_source_proof(front_source,frontend_before,version,True)
    require(frontend.get('sourceInputCount') == len(frontend_before), 'Frontend input count differs')
    files = frontend.get('files')
    require(type(files) is list and files and len({r.get('path') for r in files}) == len(files), 'Frontend packaged file list invalid')
    expected_files = {p.relative_to(ROOT).as_posix() for folder in ('desktop','dist') for p in (ROOT/folder).rglob('*') if p.is_file()}
    require({r.get('path') for r in files} == expected_files, 'Frontend desktop/dist file membership differs')
    for record in files:
        source = relative_path(ROOT,record['path'])
        require(digest(source) == record.get('sha256') and source.stat().st_size == record.get('bytes'), 'Frontend packaged source changed')
    reproduction = contained(frontend.get('freshBuild', {}).get('directory',''), directory=True)
    require(reproduction.is_relative_to(ROOT/'artifacts'), 'Frontend reproduction must reside beneath artifacts/')
    require({p.relative_to(reproduction).as_posix() for p in reproduction.rglob('*') if p.is_file()} ==
            {p.relative_to(ROOT/'dist').as_posix() for p in (ROOT/'dist').rglob('*') if p.is_file()}, 'Frontend fresh reproduction membership differs')
    names = frontend['freshBuild']['files']
    require(type(names) is list and len(names) == len(set(names)) and set(names) ==
            {p.relative_to(ROOT/'dist').as_posix() for p in (ROOT/'dist').rglob('*') if p.is_file()},
            'Frontend reproduction receipt omits/adds files')
    for name in names:
        require(digest(relative_path(reproduction,name)) == digest(relative_path(ROOT/'dist',name)), 'Frontend fresh reproduction bytes differ')
    require(version=='0.20.0' and len(native_before)==520 and native.get('counts',{}).get('passed')==3961 and
            native.get('counts',{}).get('skipped')==1 and len(modules)==73 and len(resources_before)==538 and
            len(frontend_before)==205 and len(files)==8 and len(names)==4,
            'Reviewed version20 full qualification counts differ; collector domain requires review')
    return dict(version=version,unpacked=unpacked,paths=paths,proofs=proofs,native_before=native_before,
                frontend_before=frontend_before,bundle=bundle,frontend=frontend,front_source_path=front_source_path,
                engine=engine,resources_before=resources_before,evidence_before=evidence_before,started=started)


def qualify(args):
    common=qualify_runtime(args)
    version=common['version'];unpacked=common['unpacked'];engine=common['engine'];frontend=common['frontend']
    paths=common['paths'];proofs=common['proofs'];supplemental={'frontendSourceProof':reference(common['front_source_path'])}
    files={};logs={}
    for name in ('workspace','layers'):
        path=paths[name+'_suite_result'];suite=proofs[name+'_suite_result'];outer=proofs[name+'_desktop_proof']
        log,files[name]=verify_suite(suite,outer,name,path,version,unpacked,frontend,digest(engine))
        logs[name]=log;supplemental[name+'Log']=reference(log)
        supplemental.update({'saved-'+name+'-'+filename:reference(row[0]) for filename,row in files[name].items()})
    snapshots=verify_saved_sources(files['workspace'],files['layers'])
    for file,count in (('tests/test_expression_helpers.py',83),('tests/test_expression_batch.py',32)):
        require(file in common['native_before'] and fixture_counts(ROOT/file)==count,'Full parser/batch fixtures omitted or altered')
    scripts_before={name:reference(relative_path(ROOT,name)) for name in sorted(SCRIPT_PATHS)}
    promotion.verify_compiled_native(engine,common['bundle'],{'sourceRoot':ROOT,'sourceHashes':common['native_before']},base)
    archive=unpacked/'resources/app.asar';promotion.read_asar_files(archive,frontend['files'],version)
    engine_result=run_engine(engine,args.timeout)
    require(scope_snapshot()==common['native_before'] and scope_snapshot(True)==common['frontend_before'],'Qualified inputs changed during MEAS-04 gate')
    executable=contained(proofs['workspace_suite_result']['runtime']['executablePath'])
    require(file_manifest(engine.parent)==common['resources_before'] and digest(executable)==proofs['workspace_suite_result']['runtime']['executableSha256'] and
            digest(archive)==frontend['archiveSha256'],'Candidate runtime bytes changed during gate')
    require({name:reference(path) for name,path in paths.items()}==common['evidence_before'] and
            all(reference(contained(r['path']))==r for r in supplemental.values()) and
            {name:reference(relative_path(ROOT,name)) for name in sorted(SCRIPT_PATHS)}==scripts_before,'Evidence/collector scripts changed during gate')
    return {'format':'polytope-requirement-gate','schemaVersion':1,'requirementId':'MEAS-04','passed':True,'status':'passed',
            'version':version,'startedUtc':common['started'],'finishedUtc':datetime.now(timezone.utc).isoformat(),
            'sourceUnchanged':True,'runtimeUnchanged':True,'specification':spec_inventory(),'acceptance':ACCEPTANCE,
            'unpackedRoot':str(unpacked),'release':{'executable':reference(executable),'engineExecutable':reference(engine),'appAsar':reference(archive)},
            'evidence':{**common['evidence_before'],**supplemental},'scripts':list(scripts_before.values()),
            'nativeSourceHashes':common['native_before'],'frontendSourceHashes':common['frontend_before'],'domain':DOMAIN,
            'checks':{name:True for name in GATE_CHECKS},'packagedEngineRevalidation':engine_result,
            'actualAsarRevalidation':{'passed':True,'files':len(frontend['files'])},'savedSourceComparisons':snapshots,
            'claims':{'MEAS04AcceptanceFulfilled':True,'all73RequirementsFulfilled':False},
            'limitations':['Transcendental/root results use declared uncertified float64; exact rational mode never silently downgrades.',
                           'Ordinary real integer fields validate rounded binary64 values; exact rational integer semantics are a separate policy.',
                           'Signed retrograde helper convention is explicit; no executed Stella6 or whole-product claim.',
                           'Hash-bound local receipts are reproducible evidence, not digitally authenticated historical execution.']}


class GateTests(unittest.TestCase):
    def test_original_meas04_and_all73_remain_exact(self):
        spec=spec_inventory();self.assertEqual(spec['requirementCount'],73);self.assertEqual(spec['row']['acceptance'],ACCEPTANCE)
    def test_independent_polygon_oracles_retain_symbol_and_retrograde_semantics(self):
        rows={c['params'].get('expression'):c for c in cases() if c['op']=='expression'}
        self.assertAlmostEqual(rows['diag(5/2)']['expected']['value'],(math.sqrt(5)-1)/2)
        self.assertAlmostEqual(rows['faceRad(4/1)']['expected']['value'],1/math.sqrt(2))
        self.assertEqual(rows['faceAngle(5/3)']['expected']['exactRational'],'-36')
    def inert_replies(self):
        fixtures=cases();requests=[{'id':str(i)} for i in range(len(fixtures))]
        rows=[{'id':str(i),'ok':False,'error':'Inert unit refusal'} if c.get('refusal') else
              {'id':str(i),'ok':True,'result':c['expected']} for i,c in enumerate(fixtures)]
        return requests,rows,fixtures
    def test_complete_result_modes_exact_digits_and_numeric_oracles(self):
        requests,rows,fixtures=self.inert_replies();validate_engine_replies(requests,rows,fixtures)
        for change in ('order','missing','mode','rational','value','errorSuccess','partialPrefix'):
            changed=json.loads(json.dumps(rows))
            if change=='order':changed[0],changed[1]=changed[1],changed[0]
            elif change=='missing':changed.pop()
            elif change=='mode':changed[0]['result']['mode']='float64-approximate'
            elif change=='rational':changed[0]['result']['exactRational']='1/4'
            elif change=='value':changed[0]['result']['value']=.25
            else:
                i=next(i for i,c in enumerate(fixtures) if c.get('refusal'))
                if change=='errorSuccess':changed[i].update(ok=True,result={'value':0})
                else:changed[i]['result']={'values':[5]}
            with self.subTest(change=change),self.assertRaises(GateError):validate_engine_replies(requests,changed,fixtures)
    def test_empty_forged_dev_or_counts_only_suite_is_refused(self):
        for suite in ({'passed':True,'packaged':False},{'passed':True,'packaged':True,'checks':['13passed']}):
            with self.assertRaises(GateError):verify_suite(suite,{},'workspace',ROOT/'artifacts/INERT/result.json','0.20.0',ROOT,{},'a'*64)
    def test_saved_source_snapshots_cannot_be_replaced_by_flags(self):
        with self.assertRaises(GateError):verify_saved_sources({}, {})
    def saved_fixture(self):
        # INERT source-comparison unit fixture, never an executable gate proof.
        model={'id':'INERT-cube','dimension':3,'vertices':[[x,y,z] for x in (-1,1) for y in (-1,1) for z in (-1,1)],
               'metadata':{'coordinateUnits':'mm','offColors':{'faces':[[i/8,.25,.75,.5] for i in range(6)]}}}
        def project(m):return {'active':0,'documents':[{'cursor':0,'states':[{'model':deepcopy(m),'notes':'Literal source notes','view':{}}]}]}
        names=('03-native-fixture','04-section-expressions','05-section-next-vertex','06-section-atomic-refusal','07-section-atomic-refusal',
               '31-native-fixture','32-display-expression-values','33-near-equals-distance-refusal','34-before-signed-spin','35-signed-spin','36-display-reopened',
               '42-native-fixture','43-orientation-nested-expressions','44-orientation-native-inference','45-orientation-zero-refusal',
               '46-orientation-preserves-latest-pose','47-orientation-held-native-unit-refusal','49-native-fixture','50-held-units',
               '52-native-fixture','53-held-input','58-native-fixture','59-held-cancel')
        workspace={n+'.polyproj':(Path('INERT')/(n+'.polyproj'),project(model)) for n in names}
        layers={'41-expression-matrix-source-native.polyproj':(Path('INERT'),project(model))}
        for name in ('42-joined-current','43-matrix-expression-quarter-turn-replay','44-matrix-expression-quarter-turn-reopened',
                     '45-joined-current','46-matrix-expression-reflection-replay','47-matrix-expression-reflection-reopened'):
            reflection=name.startswith(('45-','46-','47-'));height=-2 if reflection else 2
            transforms=[{'determinant':1,'matrix':[[1,0,0],[0,1,0],[0,0,1]],'translation':[0,0,0]},
                        {'determinant':-1 if reflection else 1,'matrix':[[-1,0,0],[0,1,0],[0,0,1]] if reflection else [[0,-1,0],[1,0,0],[0,0,1]],'translation':[0,0,0]}]
            evidence={'height':height,'layers':[]};output={'vertices':[],'metadata':{'offColors':{'faces':deepcopy(model['metadata']['offColors']['faces']*2)}}}
            for i,t in enumerate(transforms):
                evidence['layers'].append({'sourceSnapshot':deepcopy(model),'transform':t,
                    'maps':{'vertices':list(range(8*i,8*i+8)),'faces':list(range(6*i,6*i+6))}})
                output['vertices'] += [[sum(t['matrix'][a][b]*p[b] for b in range(3)) for a in range(3)]+[(-1 if i==0 else 1)*height/2] for p in model['vertices']]
            output['metadata']['convexLayerJoin']=evidence;layers[name+'.polyproj']=(Path('INERT'),project(output))
        return workspace,layers
    def test_full_source_attributes_and_independent_layer_coordinates_are_checked(self):
        workspace,layers=self.saved_fixture();self.assertEqual(len(verify_saved_sources(workspace,layers)),23)
        for change in ('unit','rgba','notes','coordinate','snapshot','transform','height','map'):
            w,l=deepcopy(workspace),deepcopy(layers)
            state=active(w['04-section-expressions.polyproj'][1]);joined=active(l['42-joined-current.polyproj'][1])['model']
            if change=='unit':state['model']['metadata']['coordinateUnits']='cm'
            elif change=='rgba':state['model']['metadata']['offColors']['faces'][0][3]=.2
            elif change=='notes':state['notes']='Rewritten notes'
            elif change=='coordinate':joined['vertices'][8][0]+=.125
            elif change=='snapshot':joined['metadata']['convexLayerJoin']['layers'][1]['sourceSnapshot']['vertices'][0][0]=42
            elif change=='transform':joined['metadata']['convexLayerJoin']['layers'][1]['transform']['matrix'][0][1]=1
            elif change=='height':joined['metadata']['convexLayerJoin']['height']=3
            else:joined['metadata']['convexLayerJoin']['layers'][1]['maps']['vertices'][0]=9
            with self.subTest(change=change),self.assertRaises(GateError):verify_saved_sources(w,l)
    def test_observer_motion_does_not_rewrite_geometric_source_evidence(self):
        workspace,layers=self.saved_fixture()
        active(workspace['04-section-expressions.polyproj'][1])['view']={'angles':[.1,.2,.3],'cameraProjection':'perspective'}
        self.assertEqual(len(verify_saved_sources(workspace,layers)),23)
    def test_duplicate_nonfinite_and_path_escape_refusals(self):
        for text in ('{"passed":false,"passed":true}','{"n":NaN}','{"n":1e999}'):
            with self.assertRaises(GateError):parse_json(text)
        for name in ('../package.json','x/../package.json','C:/package.json'):
            with self.assertRaises(GateError):relative_path(ROOT,name)
    def test_output_never_overwrites_evidence_or_other_paths(self):
        with self.assertRaises(GateError):output_path(ROOT/'package.json',set())
        with self.assertRaises(GateError):output_path(ROOT/'artifacts/input.json',{ROOT/'artifacts/input.json'})
    def test_exact_threshold_expected_bytes_do_not_collapse(self):
        fixture=next(c for c in cases() if c['op']=='expression-batch' and not c.get('refusal') and c['expected']['mode']=='rational')
        a,b=fixture['expected']['values'][:2];self.assertNotEqual(a,b);self.assertEqual(float(Fraction(a)),float(Fraction(b)))


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    for name in ('unpacked_root',*INPUTS,'output'):parser.add_argument('--'+name.replace('_','-'),type=Path)
    parser.add_argument('--timeout',type=int,default=240);parser.add_argument('--self-test',action='store_true')
    args=parser.parse_args()
    if args.self_test:return 0 if unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(GateTests)).wasSuccessful() else 1
    require(all(getattr(args,n) is not None for n in ('unpacked_root',*INPUTS)),'All explicit candidate/evidence inputs required')
    require(1<=args.timeout<=600,'Native timeout must be 1..600 seconds')
    version=read_json(ROOT/'package.json')['version'];destination=output_path(args.output or ROOT/f'artifacts/meas04-gate-{version}.json',
            {getattr(args,n).resolve() for n in ('unpacked_root',*INPUTS)})
    try:result=qualify(args)
    except Exception as error:result={'format':'polytope-requirement-gate','schemaVersion':1,'requirementId':'MEAS-04','passed':False,
        'status':'failed','version':version,'acceptance':ACCEPTANCE,'error':type(error).__name__+': '+str(error),'collector':reference(Path(__file__))}
    destination.parent.mkdir(parents=True,exist_ok=True)
    with destination.open('x',encoding='utf-8',newline='\n') as stream:json.dump(result,stream,ensure_ascii=False,indent=2,allow_nan=False);stream.write('\n')
    print(('MEAS-04 gate PASS: ' if result['passed'] else 'MEAS-04 gate FAILED: ')+str(destination))
    if not result['passed']:print(result['error'],file=sys.stderr)
    return 0 if result['passed'] else 1


if __name__=='__main__':raise SystemExit(main())
