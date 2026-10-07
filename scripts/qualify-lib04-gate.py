"""Collect the finite original LIB-04 gate from qualified packaged evidence.

Read-only source/package verification and sixteen JSONL requests to the supplied
native engine; never launches Electron or updates the ledger. --self-test does
not execute an engine and cannot produce a passing qualification receipt.
"""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timezone


ROOT = Path(__file__).resolve().parents[1]
SPEC = 'STELLA4D_FEATURE_COMPLETE_BUILD_SPEC.md'
SPEC_SHA256 = '7dafec36e99c7c883a7222f753f67f1c0818638359419a17f7ecbdf8b875df8d'
ACCEPTANCE = 'Six convex and ten nonconvex forms independently represented and validated'
HARNESS = 'scripts/regular4d-catalog-smoke.cjs'
HARNESS_SHA256 = '3278eaa71a24946286d99fd312418ef0ec2f055c6913027e67775394563e75f9'
SHA = re.compile(r'^[0-9a-f]{64}$')
MAX_JSON = 128 * 1024**2
# Independently fixed classical symbols, rank counts and complete flag counts.
# Neither expected identities nor expected counts are inferred from evidence.
DOMAIN = [
    ('simplex4', '{3,3,3}', (5,10,10,5), 120),
    ('tesseract', '{4,3,3}', (16,32,24,8), 384),
    ('cross4', '{3,3,4}', (8,24,32,16), 384),
    ('cell24', '{3,4,3}', (24,96,96,24), 1152),
    ('cell120', '{5,3,3}', (600,1200,720,120), 14400),
    ('cell600', '{3,3,5}', (120,720,1200,600), 14400),
    ('miratope-icosahedral-hecatonicosachoron', '{3,5,5/2}', (120,720,1200,120), 14400),
    ('miratope-great-hecatonicosachoron', '{5,5/2,5}', (120,720,720,120), 14400),
    ('miratope-grand-hecatonicosachoron', '{5,3,5/2}', (120,720,720,120), 14400),
    ('miratope-stellated-hecatonicosachoron', '{5/2,5,3}', (120,1200,720,120), 14400),
    ('miratope-great-grand-hecatonicosachoron', '{5,5/2,3}', (120,1200,720,120), 14400),
    ('miratope-great-stellated-hecatonicosachoron', '{5/2,3,5}', (120,720,720,120), 14400),
    ('miratope-grand-stellated-hecatonicosachoron', '{5/2,5,5/2}', (120,720,720,120), 14400),
    ('miratope-great-icosahedral-hecatonicosachoron', '{3,5/2,5}', (120,720,1200,120), 14400),
    ('miratope-grand-hexacosichoron', '{3,3,5/2}', (120,720,1200,600), 14400),
    ('miratope-great-grand-stellated-hecatonicosachoron', '{5/2,3,3}', (600,1200,720,120), 14400),
]
CHECKS = [
    'All six independent convex and ten attributed stars load through actual catalog search with complete ordered native source incidence',
    'All sixteen symbols and aliases resolve to unchanged keys; cells, vertex figures and dual names persist',
    'All sixteen actual Analyze buttons show complete flag-orbit numerical validation; independent native receipts bind snapshots without hull or exact/volume claims',
    'Representative simplex, 120-cell and pentagram-face star native Save/Open preserve full source IDs, attributes and incidence',
    'Literal full RGBA and millimeter source attributes survive native Save/Open and receive a distinct current-snapshot proof',
]


class GateError(ValueError):
    pass


def require(condition, message):
    if not condition:
        raise GateError(message)


def digest(path):
    result = hashlib.sha256()
    with path.open('rb') as stream:
        for data in iter(lambda: stream.read(1024**2), b''):
            result.update(data)
    return result.hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, allow_nan=False,
                      separators=(',', ':')).encode('utf-8')


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, f'Duplicate JSON key: {key}')
        result[key] = value
    return result


def parse_json(data):
    require(len(data) <= MAX_JSON, 'JSON exceeds 128 MiB bound')
    result = json.loads(data, object_pairs_hook=unique_object,
                        parse_constant=lambda value: (_ for _ in ()).throw(GateError('Nonfinite JSON: '+value)))
    # Reject finite-spelled values that overflow a binary64 JSON decoder too.
    pending = [(result, 0)]; visited = 0
    while pending:
        value, depth = pending.pop(); visited += 1
        require(depth <= 96 and visited <= 2000000, 'JSON structural resource bound exceeded')
        if type(value) is float:
            require(math.isfinite(value), 'Nonfinite JSON number')
        elif type(value) is dict:
            pending.extend((v, depth+1) for v in value.values())
        elif type(value) is list:
            pending.extend((v, depth+1) for v in value)
    return result


def read_json(path):
    require(path.stat().st_size <= MAX_JSON, f'Receipt too large: {path}')
    return parse_json(path.read_bytes().decode('utf-8-sig'))


def contained(path, root=ROOT, directory=False):
    path = Path(path).resolve(strict=True); root = root.resolve()
    require(path.is_relative_to(root), f'Path outside repository: {path}')
    require(path.is_dir() if directory else path.is_file(), f'Wrong path kind: {path}')
    return path


def relative_path(root, relative):
    require(type(relative) is str and '\\' not in relative, 'Expected portable relative path')
    parts = PurePosixPath(relative)
    require(not parts.is_absolute() and parts.as_posix() == relative and parts.parts and
            all(p not in ('', '.', '..') and ':' not in p for p in parts.parts),
            f'Unsafe relative path: {relative!r}')
    return contained(root / relative, root)


def reference(path):
    return {'path': path.relative_to(ROOT).as_posix(), 'sha256': digest(path), 'bytes': path.stat().st_size}


def verify_link(proof, path_field, hash_field, path):
    require(contained(proof.get(path_field, '')) == path and proof.get(hash_field) == digest(path),
            f'Receipt reference/hash mismatch: {path_field}')


def spec_inventory(root=ROOT):
    path = root / SPEC
    require(digest(path) == SPEC_SHA256, 'Original specification bytes changed')
    rows = []
    for line in path.read_text(encoding='utf-8-sig').splitlines():
        match = re.match(r'^\| ([A-Z]+-[0-9]{2}) \| (.*?) \| (.*?) \|$', line)
        if match:
            rows.append(dict(zip(('id', 'coverage', 'acceptance'), match.groups())))
    require(len(rows) == 73 and len({r['id'] for r in rows}) == 73,
            'Original requirement inventory is not 73 unique acceptance rows')
    row = next((r for r in rows if r['id'] == 'LIB-04'), None)
    require(row == {'id': 'LIB-04', 'coverage': 'All 16 regular 4-polytopes', 'acceptance': ACCEPTANCE},
            'LIB-04 original coverage/acceptance differs')
    return {'path': SPEC, 'sha256': SPEC_SHA256, 'requirementCount': 73,
            'requirements': rows, 'inventorySha256': hashlib.sha256(canonical(rows)).hexdigest(), 'row': row}


def scope_snapshot(frontend=False):
    if frontend:
        paths = set((ROOT/'ui').rglob('*')) | set((ROOT/'desktop').rglob('*'))
        paths.update(p for p in (ROOT/'tests').rglob('*') if p.suffix in ('.mjs', '.cjs', '.js'))
        paths.update(ROOT/name for name in ('package.json','package-lock.json','vite.config.mjs'))
    else:
        paths = set((ROOT/'engine').rglob('*.py')) | set((ROOT/'engine/catalog_data').rglob('*'))
        paths.update((ROOT/'tests').glob('test_*.py'))
        paths.update(ROOT/name for name in ('development/spring_relaxation.py','development/test_spring_relaxation.py'))
    return {p.relative_to(ROOT).as_posix(): digest(contained(p)) for p in sorted(paths)
            if p.is_file() and '__pycache__' not in p.parts}


def verify_source_proof(proof, current, version, frontend=False):
    require(type(proof) is dict and proof.get('passed') is True and
            proof.get('sourceUnchanged') is True and proof.get('changedPaths') == [] and
            proof.get('exitCode') == 0 and proof.get('version') == version,
            'Source qualification did not pass unchanged for this version')
    hashes = proof.get('sourceHashes')
    require(type(hashes) is dict and hashes and all(type(v) is str and SHA.fullmatch(v) for v in hashes.values()),
            'Invalid complete source hash manifest')
    require(hashes == current, 'Qualified source scope membership/bytes differ from current inputs')
    if frontend:
        commands = read_json(ROOT/'package.json')['scripts']['test:features'].split(' && ')
        expected = [command.split()[1:] for command in commands]
        runs = proof.get('runs')
        require(type(runs) is list and [r.get('args') for r in runs] == expected and
                all(r.get('exitCode') == 0 for r in runs), 'Frontend proof omits/fails a declared test command')
        require(proof.get('qualificationScriptSha256') == digest(ROOT/'scripts/qualify-frontend-development.cjs'),
                'Frontend source qualification script changed')
    else:
        require(proof.get('qualificationScriptSha256') == digest(ROOT/'scripts/qualify-native-development.py'),
                'Native source qualification script changed')
        require(proof.get('testFiles') == sorted(p for p in current if p.startswith('tests/')),
                'Native proof does not cover the full test file scope')
        counts = proof.get('counts', {})
        require(type(counts) is dict and type(counts.get('passed')) is int and counts['passed'] > 0 and
                counts.get('failed') == 0 and counts.get('error') == 0, 'Native test counts do not pass')


def file_manifest(directory):
    directory = contained(directory, directory=True); result = {}
    for path in sorted(directory.rglob('*')):
        require(not path.is_symlink() and path.resolve().is_relative_to(directory), 'Linked package resource refused')
        if path.is_file():
            require(len(result) < 20000 and path.stat().st_size <= 2*1024**3, 'Package resource bound exceeded')
            result[path.relative_to(directory).as_posix()] = {'bytes':path.stat().st_size, 'sha256':digest(path)}
    require(result, 'Empty package resource manifest')
    return result


def validate_runtime(runtime, version, unpacked, frontend, engine_hash):
    require(type(runtime) is dict and runtime.get('packaged') is True and runtime.get('version') == version,
            'Actual runtime is not the matching packaged application')
    executable = contained(runtime.get('executablePath', ''))
    archive = contained(runtime.get('archivePath', ''))
    require(executable.parent == unpacked and archive == unpacked/'resources/app.asar',
            'Runtime executable/archive belongs to a different unpacked candidate')
    require(runtime.get('executableSha256') == digest(executable) and
            runtime.get('archiveSha256') == frontend.get('archiveSha256') == digest(archive),
            'Actual packaged executable/ASAR bytes differ from runtime/front-end receipts')
    main = next((r for r in frontend.get('files', []) if r.get('path') == 'desktop/main.cjs'), None)
    require(main and runtime.get('mainSha256') == main.get('sha256') == digest(ROOT/'desktop/main.cjs'),
            'Packaged main source differs from qualified current main')
    require(SHA.fullmatch(engine_hash or ''), 'No bound engine hash')
    return executable, archive


def validate_desktop(suite, outer, version, suite_path, loaded_path, registered_path):
    require(type(suite) is dict and suite.get('passed') is True and suite.get('packaged') is True and
            suite.get('version') == version and suite.get('sourceCount') == 16 and
            suite.get('checks') == CHECKS and suite.get('pageErrors') == [],
            'Packaged LIB-04 suite did not pass the complete five workflows')
    require(type(outer) is dict and outer.get('passed') is True and outer.get('runtimeUnchanged') is True and
            outer.get('version') == version and outer.get('runtime') == suite.get('runtime'),
            'Outer desktop qualification/runtime does not bind the passing suite')
    require(outer.get('qualificationScriptUnchanged') is True and
            outer.get('qualificationScriptSha256') == digest(ROOT/'scripts/qualify-desktop.cjs'),
            'Outer qualification script execution hash changed/missing')
    require(contained(outer.get('executable', '')) == contained(suite['runtime']['executablePath']),
            'Outer executable is not the actual suite executable')
    entries = outer.get('suites')
    require(type(entries) is list and entries and all(e.get('passed') is True and e.get('exitCode') == 0 for e in entries),
            'Outer desktop qualification has failed/absent suites')
    selected = [e for e in entries if e.get('name') == 'regular4d']
    require(len(selected) == 1 and selected[0].get('script') == 'regular4d-catalog-smoke.cjs',
            'Outer qualification lacks exactly one matching LIB-04 suite')
    require(selected[0].get('scriptUnchanged') is True and selected[0].get('scriptSha256') == digest(ROOT/HARNESS),
            'Actual LIB-04 harness execution hash changed/missing')
    log = contained(selected[0].get('log', ''))
    require(suite_path.parent.parent == log.parent and loaded_path.parent == suite_path.parent and
            registered_path.parent == suite_path.parent, 'Suite/proofs do not belong to the actual outer suite folder')
    require('Regular4D catalog smoke PASS. Artifacts: '+str(suite_path.parent) in log.read_text(encoding='utf-8'),
            'Outer suite log does not identify these exact actual artifacts')
    return log


def validate_entries(entries, independent=False):
    require(type(entries) is list and len(entries) == 16, 'Expected exactly sixteen source entries')
    expected = {row[0]: row for row in DOMAIN}; found = {}; fingerprints = set(); ids = set()
    for entry in entries:
        require(type(entry) is dict and entry.get('key') in expected and entry['key'] not in found,
                'Missing/duplicate/unknown regular identity')
        key = entry['key']; _, symbol, counts, flags = expected[key]
        source, receipt = entry.get('source'), entry.get('receipt')
        require(type(source) is dict and type(receipt) is dict, 'Missing source/full receipt')
        require(source.get('dimension') == 4 and source.get('embeddingDimension') == 4 and
                all(type(source.get(k)) is list and len(source[k]) == n
                    for k,n in zip(('vertices','edges','faces','cells'), counts)), 'Classical source rank counts mismatch')
        require(type(source.get('id')) is str and source['id'] and source['id'] not in ids, 'Invalid/duplicate model identity')
        require(type(source.get('fingerprint')) is str and source['fingerprint'] and source['fingerprint'] not in fingerprints,
                'Regular identities do not have sixteen distinct geometry fingerprints')
        metadata = source.get('metadata', {})
        require(type(metadata) is dict and metadata.get('key') == key and metadata.get('symbol') == symbol,
                'Source key/symbol mismatch')
        identity = receipt.get('identity', {})
        require(receipt.get('format') == 'regular4d-numerical-evidence' and receipt.get('version') == '0.1.0' and
                receipt.get('status') == 'passed' and receipt.get('catalogKey') == key and
                receipt.get('sourceId') == source['id'] and receipt.get('sourceFingerprint') == source['fingerprint'] and
                identity.get('symbol') == symbol and identity.get('counts') == list(counts) and
                receipt.get('flagCount') == flags and receipt.get('reachedFlags') == flags and
                receipt.get('generatedSubgroupOrder') == flags and receipt.get('flagOrbitCount') == 1 and
                receipt.get('numericMode') == 'float64-approximate' and receipt.get('certified') is False and
                receipt.get('hullUsed') is False and receipt.get('sourceGeometryChanged') is False and
                receipt.get('sourceAttributesChanged') is False and SHA.fullmatch(receipt.get('sourceSnapshotSha256', '')),
                'Incomplete/incorrect numerical/source receipt envelope')
        if independent:
            require(entry.get('record', {}).get('key') == key and entry['record'].get('counts') == list(counts) and
                    entry['record'].get('symbol') == symbol, 'Independent catalog record mismatch')
        fingerprints.add(source['fingerprint']); ids.add(source['id']); found[key] = entry
    require(set(found) == set(expected), 'Finite LIB-04 identity set incomplete')
    return found


def compare_geometry(a, b):
    # Numeric JSON equality identifies signed zero and integer/float spellings;
    # preserve every nonzero value and every incidence position/order exactly.
    fields = ('dimension','embeddingDimension','interpretation','vertices','edges','faces','cells','fingerprint')
    require(all(a.get(field) == b.get(field) for field in fields), 'Loaded source differs from independent literal geometry')


def validate_engine_replies(requests, rows, entries):
    require(len(rows) == 16, 'Packaged engine did not return exactly sixteen JSONL results')
    for request, reply, entry in zip(requests, rows, entries):
        require(type(reply) is dict and reply.get('id') == request['id'] and reply.get('ok') is True,
                'Packaged native validation failed/misordered: '+entry['key'])
        require(reply.get('result') == entry['receipt'], 'Full packaged receipt differs: '+entry['key'])


def verify_asar(archive, records, version):
    node = shutil.which('node')
    require(node is not None, 'Node is required for read-only ASAR extraction')
    code = r"""
const fs=require('node:fs'),crypto=require('node:crypto'),path=require('node:path'),asar=require('@electron/asar');
const input=JSON.parse(fs.readFileSync(0,'utf8')),archive=process.argv[1];
const names=asar.listPackage(archive).map(n=>n.replace(/\\/g,'/').replace(/^\/+/,''))
 .filter(n=>(n.startsWith('desktop/')||n.startsWith('dist/'))&&typeof asar.statFile(archive,path.normalize(n),false).size==='number').sort();
const expected=input.files.map(r=>r.path).sort();
if(JSON.stringify(names)!==JSON.stringify(expected))throw Error('ASAR file membership differs');
if(JSON.parse(asar.extractFile(archive,'package.json')).version!==input.version)throw Error('ASAR version differs');
for(const r of input.files){const name=path.normalize(r.path),info=asar.statFile(archive,name,false);
 if(info.link||info.unpacked)throw Error('Linked/unpacked frontend entry refused: '+r.path);
 const bytes=asar.extractFile(archive,name);
 if(bytes.length!==r.bytes||crypto.createHash('sha256').update(bytes).digest('hex')!==r.sha256)throw Error('ASAR bytes differ: '+r.path);}
process.stdout.write(JSON.stringify({passed:true,files:input.files.length}));
"""
    options = {'creationflags':subprocess.CREATE_NO_WINDOW} if os.name == 'nt' else {}
    child = subprocess.run([node,'-e',code,str(archive)],input=canonical({'files':records,'version':version}),
                           stdout=subprocess.PIPE,stderr=subprocess.PIPE,cwd=ROOT,timeout=30,**options)
    require(child.returncode == 0, 'Read-only ASAR extraction failed: '+child.stderr.decode('utf-8',errors='replace')[:1000])
    result = parse_json(child.stdout.decode('utf-8'))
    require(result == {'passed':True,'files':len(records)}, 'ASAR extraction result invalid')
    return result


def run_engine(executable, entries, timeout=240):
    requests = [{'id':'lib04-'+entry['key'], 'op':'regular4d-validate', 'model':entry['source'],
                 'params':{'key':entry['key']}} for entry in entries]
    encoded = b''.join(canonical(row)+b'\n' for row in requests)
    require(len(encoded) <= MAX_JSON, 'Aggregate native requests exceed bound')
    env = dict(os.environ)
    # This executable, not development Python, is the only validation process.
    env.pop('PYTHONPATH', None); env.pop('PYTHONHOME', None)
    options = {'creationflags':subprocess.CREATE_NO_WINDOW} if os.name == 'nt' else {}
    # File-backed bounded reads avoid allocating an unbounded communicate pipe.
    with tempfile.TemporaryFile() as output, tempfile.TemporaryFile() as errors:
        child = subprocess.run([str(executable)], input=encoded, stdout=output, stderr=errors,
                               cwd=executable.parent, env=env, timeout=timeout, **options)
        require(child.returncode == 0, f'Packaged native engine exited {child.returncode}')
        require(output.tell() <= MAX_JSON and errors.tell() <= 1024**2, 'Native output resource bound exceeded')
        output.seek(0); errors.seek(0)
        raw = output.read(); err = errors.read().decode('utf-8', errors='replace')
    rows = [parse_json(line) for line in raw.decode('utf-8').splitlines() if line.strip()]
    require(not err.strip(), 'Packaged engine wrote unexpected stderr: '+err[:1000])
    validate_engine_replies(requests,rows,entries)
    return {'requestCount':16, 'responseCount':16, 'allFullReceiptsEqual':True,
            'jsonlOutputSha256':hashlib.sha256(raw).hexdigest(), 'stderrBytes':len(err.encode('utf-8'))}


def qualify(args):
    started = datetime.now(timezone.utc).isoformat(); spec = spec_inventory()
    version = read_json(ROOT/'package.json')['version']
    unpacked = contained(args.unpacked_root, directory=True)
    require(unpacked.is_relative_to(ROOT/'release'), 'Unpacked candidate must reside beneath release/')
    paths = {name:contained(getattr(args, name)) for name in (
        'native_source_proof','native_bundle_proof','frontend_proof','desktop_proof',
        'suite_result','loaded_receipts','registered_proof')}
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
    require({'engine.regular4d_validation','engine.catalog','engine.generators','engine.formats','engine.geometry'} <=
            {m['module'] for m in modules}, 'LIB-04 native implementation not qualified in compiled bundle')
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
    suite, outer = proofs['suite_result'], proofs['desktop_proof']
    log = validate_desktop(suite,outer,version,paths['suite_result'],paths['loaded_receipts'],paths['registered_proof'])
    executable, archive = validate_runtime(suite.get('runtime'),version,unpacked,frontend,digest(engine))
    asar_result = verify_asar(archive,files,version)
    require(digest(ROOT/HARNESS) == HARNESS_SHA256, 'Reviewed LIB-04 harness bytes changed')
    script_paths = [ROOT/HARNESS,Path(__file__),ROOT/'scripts/qualify-desktop.cjs',ROOT/'scripts/qualify-regular4d-catalog.py',
                    ROOT/'scripts/qualify-native-bundle.py',ROOT/'scripts/qualify-frontend-candidate.cjs',
                    ROOT/'scripts/qualify-native-development.py',ROOT/'scripts/qualify-frontend-development.cjs']
    scripts_before = {p.relative_to(ROOT).as_posix():digest(p) for p in script_paths}
    supplemental = {'frontendSourceProof':reference(front_source_path),'suiteLog':reference(log)}
    sys.path.insert(0,str(ROOT))
    from engine.regular4d_validation import (snapshot_hash,verify_catalog_model_receipt,verify_catalog_receipt)
    independent = proofs['registered_proof']
    require(independent.get('format') == 'regular4d-registered-catalog-proof' and independent.get('version') == '0.1.0' and
            independent.get('passed') is True and independent.get('sourceCount') == 16 and independent.get('convexCount') == 6 and
            independent.get('starCount') == 10 and independent.get('exactCertification') is False and
            independent.get('catalogModuleSha256') == native_before['engine/catalog.py'], 'Independent registered proof invalid')
    reference_proof = independent.get('referenceQualification',{})
    require(reference_proof.get('verifierSourceSha256') == native_before['engine/regular4d_validation.py'], 'Independent verifier source differs')
    for filename, hash_value in reference_proof.get('nativeSourceSha256',{}).items():
        require(native_before.get('engine/'+filename) == hash_value, 'Independent importer hash differs')
    require(set(reference_proof.get('nativeSourceSha256',{})) == {'__init__.py','formats.py','geometry.py'}, 'Independent importer set invalid')
    verify_catalog_receipt(ROOT/'engine/catalog_data/miratope',reference_proof)
    registered = validate_entries(independent.get('entries'),True)
    loaded = validate_entries(proofs['loaded_receipts'])
    for key in registered:
        verify_catalog_model_receipt(registered[key]['source'],registered[key]['receipt'])
        verify_catalog_model_receipt(loaded[key]['source'],loaded[key]['receipt'])
        compare_geometry(loaded[key]['source'],registered[key]['source'])
        file = contained(loaded[key].get('file',''))
        require(file.parent == paths['suite_result'].parent, 'Loaded source snapshot is outside actual suite artifacts')
        project = read_json(file)
        try:
            document = project['documents'][project['active']]
            saved = document['states'][document['cursor']]['model']
        except (KeyError,IndexError,TypeError) as error:
            raise GateError('Loaded source file has no active model') from error
        require(snapshot_hash(saved) == snapshot_hash(loaded[key]['source']), 'Saved full source attributes differ from loaded receipt')
        supplemental['saved-'+key] = reference(file)
    from engine.catalog import get_catalog
    require(snapshot_hash(get_catalog()) == independent.get('registeredCatalogSha256'), 'Registered catalog inventory differs')
    engine_result = run_engine(engine,[loaded[row[0]] for row in DOMAIN],args.timeout)
    require(scope_snapshot() == native_before and scope_snapshot(True) == frontend_before, 'Qualified source inputs changed during gate')
    require(file_manifest(engine.parent) == resources_before and digest(executable) == suite['runtime']['executableSha256'] and
            digest(archive) == frontend['archiveSha256'], 'Candidate runtime resources changed during gate')
    require({name:reference(path) for name,path in paths.items()} == evidence_before and
            all(reference(contained(item['path'])) == item for item in supplemental.values()), 'Input evidence changed during gate')
    require({p.relative_to(ROOT).as_posix():digest(p) for p in script_paths} == scripts_before and spec_inventory() == spec,
            'Gate scripts/original specification changed during gate')
    return {'format':'polytope-requirement-gate','schemaVersion':1,'requirementId':'LIB-04','passed':True,'status':'passed',
            'version':version,'startedUtc':started,'finishedUtc':datetime.now(timezone.utc).isoformat(),
            'sourceUnchanged':True,'runtimeUnchanged':True,'specification':spec,
            'acceptance':ACCEPTANCE,'unpackedRoot':str(unpacked),
            'release':{'executable':reference(executable),'engineExecutable':reference(engine),'appAsar':reference(archive)},
            'evidence':{**evidence_before,**supplemental},
            'scripts':[reference(p) for p in script_paths],
            'nativeSourceHashes':native_before,'frontendSourceHashes':frontend_before,
            'domain':{'sourceCount':16,'convexCount':6,'nonconvexCount':10,'keys':[r[0] for r in DOMAIN],
                      'numericMode':'float64-approximate','normalizedTolerance':1e-8,'certified':False,
                      'hullUsed':False,'baseline6Executed':False},
            'checks':{'packagedFiveWorkflows':True,'sixteenDistinctFullSources':True,'completeFlagOrbits':True,
                      'fullReferenceAndDualReceiptsRecomputed':True,'allLoadedReceiptsRecomputed':True,
                      'fullSavedSourceSnapshotsEqual':True,'allQualifiedInputHashesEqual':True,
                      'compiledBundleAndFrontendProofsBound':True,'negativeFixturesInFullNativeQualification':True},
            'packagedEngineRevalidation':engine_result,
            'actualAsarRevalidation':asar_result,
            'claims':{'LIB04AcceptanceFulfilled':True,'all73RequirementsFulfilled':False,
                      'scope':'Finite sixteen-form catalog representation and numerical validation; other requirement gates remain independent.'},
            'limitations':['Numerical binary64 regularity within declared tolerance; no exact/interval certificate.',
                           'Local hash receipts bind provenance, not digitally authenticated historical execution; harness/runner before-after execution hashes are required.',
                           'No claim of Stella 6 execution, general star construction/editing, filled star volume, or completion of the other 72 requirements.']}


def output_path(path, inputs):
    path = path.resolve()
    require(path.is_relative_to(ROOT/'artifacts') and path.suffix == '.json' and path not in inputs,
            'Output must be a distinct JSON receipt beneath artifacts/')
    # Refuse overwrite: a failed rerun must not destroy prior qualified evidence.
    require(not path.exists(), 'Choose a new output; existing evidence is never overwritten')
    return path


class GateTests(unittest.TestCase):
    def test_original_inventory_is_frozen_and_complete(self):
        value = spec_inventory()
        self.assertEqual(value['requirementCount'],73)
        self.assertEqual(value['row']['acceptance'],ACCEPTANCE)
        self.assertEqual(len(DOMAIN),16)
        self.assertEqual(len({row[1] for row in DOMAIN}),16)

    def test_duplicate_nonfinite_and_overflow_json_refused(self):
        for text in ('{"passed":false,"passed":true}', '{"n":NaN}', '{"n":1e999}'):
            with self.assertRaises(GateError): parse_json(text)

    def test_incomplete_fabricated_entries_refused(self):
        for entries in ([],[{}]*16,[{'key':'tesseract'}]*16):
            with self.assertRaises(GateError): validate_entries(entries)

    def test_same_counts_do_not_accept_different_literal_cycles(self):
        a = {'dimension':4,'embeddingDimension':4,'interpretation':'generalized-complex',
             'vertices':[[0.0,-0.0,1,2]],'edges':[[0,1]],'faces':[[0,1,2,3]],'cells':[[0]],'fingerprint':'f'}
        b = json.loads(json.dumps(a)); b['vertices'][0][1] = 0
        compare_geometry(a,b)
        b['faces'] = [[0,2,1,3]]
        with self.assertRaises(GateError): compare_geometry(a,b)

    def test_source_receipt_must_cover_exact_input_scope(self):
        current = {'engine/a.py':'a'*64,'tests/test_a.py':'b'*64}
        proof = {'passed':True,'sourceUnchanged':True,'changedPaths':[],'exitCode':0,'version':'fixture',
                 'sourceHashes':current,'testFiles':['tests/test_a.py'],'counts':{'passed':1,'failed':0,'error':0},
                 'qualificationScriptSha256':digest(ROOT/'scripts/qualify-native-development.py')}
        verify_source_proof(proof,current,'fixture')
        for edit in ({'sourceHashes':{'engine/a.py':'a'*64}}, {'counts':{'passed':1,'failed':1,'error':0}},
                     {'changedPaths':['engine/a.py']}, {'version':'wrong'}, {'testFiles':[]}):
            with self.assertRaises(GateError): verify_source_proof({**proof,**edit},current,'fixture')

    def test_dev_suite_and_forged_pass_flags_cannot_close_gate(self):
        for suite in ({'passed':True,'packaged':False},{'passed':True,'packaged':True,'version':'fixture','sourceCount':16}):
            with self.assertRaises(GateError):
                validate_desktop(suite,{},'fixture',ROOT/'artifacts/r/result.json',ROOT/'artifacts/r/l.json',ROOT/'artifacts/r/i.json')

    def test_paths_cannot_escape_repository_or_overwrite_inputs(self):
        for relative in ('../package.json','./package.json','x/../package.json','C:/package.json','x\\package.json'):
            with self.assertRaises(GateError): relative_path(ROOT,relative)
        with self.assertRaises(GateError): output_path(ROOT/'package.json',set())
        with self.assertRaises(GateError): output_path(ROOT/'artifacts/source.json',{ROOT/'artifacts/source.json'})

    def test_runtime_rejects_nonpackaged_before_any_process(self):
        with self.assertRaises(GateError): validate_runtime({'packaged':False},'fixture',ROOT,{},'a'*64)

    def test_full_engine_maps_source_binding_and_response_order_are_required(self):
        entries = [{'key':str(i),'receipt':{'status':'passed','flagCount':14400,'sourceSnapshotSha256':str(i),
                    'generators':[{'vertexPermutation':[0,1,2],'matrix':[[1,0],[0,1]]}]}} for i in range(16)]
        requests = [{'id':str(i)} for i in range(16)]
        rows = [{'id':str(i),'ok':True,'result':entry['receipt']} for i,entry in enumerate(entries)]
        validate_engine_replies(requests,rows,entries)
        for edit in ('map','snapshot','order','error','missing'):
            changed = json.loads(json.dumps(rows))
            if edit == 'map': changed[0]['result']['generators'][0]['vertexPermutation'] = [0,2,1]
            elif edit == 'snapshot': changed[0]['result']['sourceSnapshotSha256'] = 'forged'
            elif edit == 'order': changed[0],changed[1] = changed[1],changed[0]
            elif edit == 'error': changed[0]['ok'] = False
            else: changed.pop()
            with self.assertRaises(GateError): validate_engine_replies(requests,changed,entries)

    def test_actual_asar_extraction_checks_nested_entries_and_bytes_without_electron(self):
        # Synthetic storage only, not a synthetic passed requirement gate.
        with tempfile.TemporaryDirectory(prefix='lib04-asar-test-') as raw:
            directory = Path(raw); source = directory/'source'; source.mkdir()
            (source/'desktop').mkdir(); (source/'dist/assets').mkdir(parents=True)
            (source/'package.json').write_text('{"version":"fixture"}',encoding='utf-8')
            (source/'desktop/main.cjs').write_bytes(b'// inert fixture\n')
            (source/'dist/assets/fixture.js').write_bytes(b'// nested inert fixture\n')
            archive = directory/'app.asar'
            code = "require('@electron/asar').createPackage(process.argv[1],process.argv[2]).catch(e=>{console.error(e);process.exitCode=1;});"
            options = {'creationflags':subprocess.CREATE_NO_WINDOW} if os.name == 'nt' else {}
            child = subprocess.run([shutil.which('node'),'--eval',code,str(source),str(archive)],
                                   cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=20,**options)
            self.assertEqual(child.returncode,0,child.stderr)
            records = [{'path':p.relative_to(source).as_posix(),'bytes':p.stat().st_size,'sha256':digest(p)}
                       for p in sorted(source.rglob('*')) if p.is_file() and p.name != 'package.json']
            self.assertEqual(verify_asar(archive,records,'fixture'),{'passed':True,'files':2})
            for changed,version in ((records[:-1],'fixture'),([{**records[0],'sha256':'0'*64},records[1]],'fixture'),
                                    (records,'wrong')):
                with self.assertRaises(GateError): verify_asar(archive,changed,version)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('unpacked-root','native-source-proof','native-bundle-proof','frontend-proof',
                 'desktop-proof','suite-result','loaded-receipts','registered-proof','output'):
        parser.add_argument('--'+name,type=Path)
    parser.add_argument('--timeout',type=int,default=240)
    parser.add_argument('--self-test',action='store_true')
    args = parser.parse_args()
    if args.self_test:
        return 0 if unittest.TextTestRunner(verbosity=2).run(
            unittest.defaultTestLoader.loadTestsFromTestCase(GateTests)).wasSuccessful() else 1
    names = ('unpacked_root','native_source_proof','native_bundle_proof','frontend_proof','desktop_proof',
             'suite_result','loaded_receipts','registered_proof')
    require(all(getattr(args,name) is not None for name in names), 'All explicit candidate/evidence inputs are required')
    require(1 <= args.timeout <= 600, 'Native engine timeout must be 1..600 seconds')
    version = read_json(ROOT/'package.json')['version']
    destination = output_path(args.output or ROOT/f'artifacts/lib04-gate-{version}.json',
                              {getattr(args,name).resolve() for name in names})
    try:
        result = qualify(args)
    except Exception as error:
        result = {'format':'polytope-requirement-gate','schemaVersion':1,'requirementId':'LIB-04','passed':False,
                  'status':'failed','version':version,'error':f'{type(error).__name__}: {error}',
                  'createdUtc':datetime.now(timezone.utc).isoformat(),'specificationSha256':SPEC_SHA256,
                  'acceptance':ACCEPTANCE,'collector':reference(Path(__file__))}
    destination.parent.mkdir(parents=True,exist_ok=True)
    with destination.open('x',encoding='utf-8',newline='\n') as stream:
        json.dump(result,stream,ensure_ascii=False,indent=2,allow_nan=False); stream.write('\n')
    print(('LIB-04 gate PASS: ' if result['passed'] else 'LIB-04 gate FAILED: ')+str(destination))
    if not result['passed']: print(result['error'],file=sys.stderr)
    return 0 if result['passed'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
