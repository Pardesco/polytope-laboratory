"""Read-only native source/archive/resource qualification; does not run the engine.

Candidate example:
  python scripts/qualify-native-bundle.py --unpacked-root release/0.19-candidate/win-unpacked --native-source-proof artifacts/native-development-0.19.0.json
Build-only inspection uses --validate-build and cannot produce a promotion receipt.
"""
import argparse
import ast
import hashlib
import importlib.metadata
import json
import marshal
import platform
import re
import sys
import tempfile
import types
import unittest
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath


ROOT = Path(__file__).resolve().parents[1]
IMPORTERS = ('engine/__init__.py', 'engine/formats.py', 'engine/geometry.py')
SHA256 = re.compile(r'^[0-9a-f]{64}$')
CHUNK = 1024 * 1024


class VerificationError(ValueError):
    pass


def require(condition, message):
    if not condition:
        raise VerificationError(message)


def digest(path):
    value = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(CHUNK), b''):
            value.update(chunk)
    return value.hexdigest()


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, f'Duplicate JSON key: {key}')
        result[key] = value
    return result


def read_json(path):
    require(path.stat().st_size <= 128 * 1024 * 1024, f'JSON receipt too large: {path}')
    return json.loads(path.read_text(encoding='utf-8-sig'), object_pairs_hook=unique_object,
                      parse_constant=lambda text: (_ for _ in ()).throw(
                          VerificationError(f'Nonfinite JSON number: {text}')))


def source_path(root, relative):
    require(isinstance(relative, str) and '\\' not in relative,
            f'Expected portable relative source path: {relative!r}')
    parts = PurePosixPath(relative)
    require(not parts.is_absolute() and parts.as_posix() == relative and
            all(part not in ('', '.', '..') and ':' not in part for part in parts.parts),
            f'Unsafe relative source path: {relative!r}')
    path = (root / relative).resolve(strict=True)
    require(path.is_relative_to(root) and path.is_file(), f'Source outside repository: {relative}')
    return path


def source_snapshot(root):
    # Deliberately the same CLOSED scope as qualify-native-development.py.
    paths = set((root / 'engine').rglob('*.py'))
    paths.update((root / 'engine/catalog_data').rglob('*'))
    paths.update((root / 'tests').glob('test_*.py'))
    paths.update({root/'development/spring_relaxation.py',root/'development/test_spring_relaxation.py'})
    result = {}
    for path in sorted(paths):
        if path.is_file() and '__pycache__' not in path.parts:
            relative = path.relative_to(root).as_posix()
            require(path.resolve().is_relative_to(root), f'Source link escapes repository: {relative}')
            result[relative] = digest(path)
    return result


def validate_proof(proof, current, version):
    require(proof.get('passed') is True and proof.get('sourceUnchanged') is True and
            proof.get('changedPaths') == [] and proof.get('exitCode') == 0,
            'Native qualification did not pass with unchanged sources')
    require(proof.get('version') == version, 'Native qualification version differs from package.json')
    counts = proof.get('counts', {})
    require(counts.get('passed', 0) > 0 and counts.get('failed') == 0 and counts.get('error') == 0,
            'Native qualification test counts do not confirm success')
    require(proof.get('python') == platform.python_version(),
            'Use the same Python version as the qualified native source/build')
    hashes = proof.get('sourceHashes')
    require(isinstance(hashes, dict) and hashes and
            all(isinstance(value, str) and SHA256.fullmatch(value) for value in hashes.values()),
            'Invalid native source hash manifest')
    changed = sorted(key for key in hashes.keys() | current.keys() if hashes.get(key) != current.get(key))
    require(not changed, 'Native qualification scope/hash mismatch: ' + ', '.join(changed[:20]))
    expected_tests = sorted(key for key in current if key.startswith('tests/'))
    require(proof.get('testFiles') == expected_tests, 'Qualification test list is not the complete native scope')
    return hashes


def file_manifest(directory):
    require(directory.is_dir(), f'Required directory absent: {directory}')
    directory = directory.resolve()
    result = {}
    for path in sorted(directory.rglob('*')):
        require(not path.is_symlink() and path.resolve().is_relative_to(directory),
                f'Linked/escaping resource refused: {path}')
        if path.is_file():
            require(len(result) < 20000, 'Native resource file count exceeds verification limit')
            relative = path.relative_to(directory).as_posix()
            require(path.stat().st_size <= 2 * 1024**3, f'Native resource exceeds verification size limit: {relative}')
            result[relative] = {'bytes': path.stat().st_size, 'sha256': digest(path)}
    require(result, f'Empty native resource directory: {directory}')
    return result


def compare_files(first, second):
    require(first.stat().st_size == second.stat().st_size, f'Resource size mismatch: {second}')
    with first.open('rb') as left, second.open('rb') as right:
        while True:
            a, b = left.read(CHUNK), right.read(CHUNK)
            require(a == b, f'Resource bytes differ: {second}')
            if not a:
                return


def verify_code(source_bytes, actual, name):
    require(isinstance(actual, types.CodeType), f'Archive entry is not Python code: {name}')
    expected = compile(source_bytes, name, 'exec', dont_inherit=True, optimize=0)
    # CPython code equality ignores co_filename, but compares code/constants,
    # nested code, flags, names, line tables and other execution-relevant fields.
    require(expected == actual, f'Compiled qualified source differs from archive bytecode: {name}')


def validate_archives(root, hashes):
    from PyInstaller.archive.readers import CArchiveReader
    from PyInstaller.loader.pyimod01_archive import ZlibArchiveReader

    build = root / 'build/engine/polytope-engine'
    toc_path = root / 'build/pyinstaller/polytope-engine/PYZ-00.toc'
    pyz_path = root / 'build/pyinstaller/polytope-engine/PYZ-00.pyz'
    exe_path = build / 'polytope-engine.exe'
    require(toc_path.stat().st_size <= 16 * 1024**2, 'Build PYZ TOC too large')
    toc = ast.literal_eval(toc_path.read_text(encoding='utf-8'))
    require(isinstance(toc, tuple) and len(toc) == 2 and isinstance(toc[1], list), 'Invalid PYZ build TOC')
    require(Path(toc[0]).resolve() == pyz_path.resolve(), 'Build TOC refers to a different PYZ')
    pyz = ZlibArchiveReader(str(pyz_path), check_pymagic=True)
    archive = CArchiveReader(str(exe_path))
    require(archive.extract('PYZ.pyz') == pyz_path.read_bytes(), 'Executable embedded PYZ differs from build PYZ')
    embedded = archive.open_embedded_archive('PYZ.pyz')
    names = set()
    modules = []
    for name, raw_path, kind in toc[1]:
        if name != 'engine' and not name.startswith('engine.'):
            continue
        require(name not in names and kind == 'PYMODULE', f'Duplicate/unsupported engine TOC entry: {name}')
        names.add(name)
        source = Path(raw_path).resolve(strict=True)
        require(source.is_relative_to(root), f'Engine module source is outside repository: {name}')
        relative = source.relative_to(root).as_posix()
        require(relative in hashes, f'Engine module absent from qualified scope: {name}')
        data = source.read_bytes()
        require(hashlib.sha256(data).hexdigest() == hashes[relative], f'Engine module source changed: {name}')
        verify_code(data, pyz.extract(name), name)
        verify_code(data, embedded.extract(name), name)
        modules.append({'module': name, 'source': relative, 'sha256': hashes[relative], 'compiledCodeEqual': True})
    archive_names = {name for name in pyz.toc if name == 'engine' or name.startswith('engine.')}
    require(names and names == archive_names, 'Build TOC does not cover exactly the PYZ engine modules')
    require(names == {name for name in embedded.toc if name == 'engine' or name.startswith('engine.')},
            'Executable PYZ engine module membership differs')
    server = source_path(root, 'engine/server.py').read_bytes()
    require(hashlib.sha256(server).hexdigest() == hashes['engine/server.py'], 'Qualified server source changed')
    verify_code(server, marshal.loads(archive.extract('server')), 'server')
    return {
        'moduleCount': len(modules), 'modules': modules, 'serverCompiledCodeEqual': True,
        'buildTocSha256': digest(toc_path), 'buildPyzSha256': digest(pyz_path),
        'buildExecutableSha256': digest(exe_path), 'embeddedPyzBytesMatch': True,
        'buildArchiveEngineCodeMatches': True, 'pyInstallerVersion': importlib.metadata.version('pyinstaller'),
    }


def validate_importers_and_catalog(root, build, hashes, audit):
    importer = audit.get('importer', {}).get('sourceHashes')
    require(isinstance(importer, dict) and set(importer) == set(IMPORTERS),
            'Audit must bind exactly the three frozen importer sources')
    bundle = build / '_internal/engine'
    files = []
    for relative in IMPORTERS:
        source = source_path(root, relative)
        require(importer[relative] == hashes.get(relative) == digest(source),
                f'Current frozen importer does not match qualified audit: {relative}')
        compare_files(source, bundle / source.name)
        files.append({'source': relative, 'sha256': importer[relative]})
    catalog = root / 'engine/catalog_data'
    source_assets = file_manifest(catalog)
    built_assets = file_manifest(bundle / 'catalog_data')
    require(source_assets == built_assets, 'Build catalog asset set/bytes differ from source catalog')
    assets = []
    for relative, record in source_assets.items():
        require(hashes.get('engine/catalog_data/' + relative) == record['sha256'],
                f'Catalog asset absent/different from native qualification: {relative}')
        compare_files(catalog / relative, bundle / 'catalog_data' / relative)
        assets.append({'path': relative, **record})
    return {'frozenImporterFiles': files, 'catalogAssetCount': len(assets),
            'catalogBytesMatch': True, 'catalogAssets': assets}


def qualify(args):
    root = ROOT.resolve()
    version = read_json(root / 'package.json')['version']
    proof_path = args.native_source_proof.resolve(strict=True)
    audit_path = args.audit.resolve(strict=True)
    proof_sha, audit_sha = digest(proof_path), digest(audit_path)
    proof, audit = read_json(proof_path), read_json(audit_path)
    before = source_snapshot(root)
    hashes = validate_proof(proof, before, version)
    result = {
        'passed': False, 'version': version, 'createdUtc': datetime.now(timezone.utc).isoformat(),
        'mode': 'build-validation' if args.validate_build else 'candidate-qualification',
        'candidateQualified': not args.validate_build,
        'scope': 'Qualified native sources, compiled engine code, and exact native resource bytes; no engine execution',
        'limitations': [
            'Code comparison uses the matching CPython compiler with optimize=0; co_filename is intentionally ignored by code equality.',
            'Third-party archives, DLL behavior, bootloader execution and GUI/runtime behavior require separate qualification.',
            'Hashes/receipts are local provenance evidence, not a digital signature or mathematical certificate.',
        ],
        'nativeSourceProof': str(proof_path), 'nativeSourceProofSha256': proof_sha,
        'nativeSourceHashCount': len(hashes), 'nativeSourceHashes': hashes,
        'auditProof': str(audit_path), 'auditProofSha256': audit_sha,
        'python': platform.python_version(), 'verifierSha256': digest(Path(__file__)),
    }
    build = root / 'build/engine/polytope-engine'
    built_before = file_manifest(build)
    result.update(validate_archives(root, hashes))
    result.update(validate_importers_and_catalog(root, build, hashes, audit))
    result['engineResourceFileCount'] = len(built_before)
    if not args.validate_build:
        require(args.unpacked_root is not None, '--unpacked-root is required for candidate qualification')
        unpacked = args.unpacked_root.resolve(strict=True)
        require(unpacked.is_relative_to(root / 'release'), 'Candidate must reside beneath repository release/')
        candidate = unpacked / 'resources/engine'
        packed_before = file_manifest(candidate)
        require(packed_before == built_before, 'Candidate engine resource file set/size/hash differs from build')
        for relative in built_before:
            compare_files(build / relative, candidate / relative)
        # Examine the actual candidate archive as well, not merely the build.
        from PyInstaller.archive.readers import CArchiveReader
        packed_exe = candidate / 'polytope-engine.exe'
        packed_archive = CArchiveReader(str(packed_exe))
        require(packed_archive.extract('PYZ.pyz') ==
                (root / 'build/pyinstaller/polytope-engine/PYZ-00.pyz').read_bytes(),
                'Candidate executable embedded PYZ differs from build')
        verify_code(source_path(root, 'engine/server.py').read_bytes(),
                    marshal.loads(packed_archive.extract('server')), 'server')
        require(file_manifest(candidate) == packed_before, 'Candidate engine resources changed during verification')
        result.update(unpackedRoot=str(unpacked), packagedExecutableSha256=digest(packed_exe),
                      candidateEmbeddedPyzBytesMatch=True, candidateServerCompiledCodeEqual=True,
                      engineResourceBytesMatch=True, engineResources=packed_before)
    after = source_snapshot(root)
    require(before == after, 'Native source scope changed during verification')
    require(file_manifest(build) == built_before, 'Build resources changed during verification')
    require(digest(proof_path) == proof_sha and digest(audit_path) == audit_sha,
            'Qualification/audit receipt changed during verification')
    require(digest(root / 'build/pyinstaller/polytope-engine/PYZ-00.toc') == result['buildTocSha256'] and
            digest(root / 'build/pyinstaller/polytope-engine/PYZ-00.pyz') == result['buildPyzSha256'],
            'Build archives changed during verification')
    result.update(passed=True, sourceUnchanged=True, buildUnchanged=True,
                  finishedUtc=datetime.now(timezone.utc).isoformat())
    return result


def receipt_destination(path, root, protected):
    path = path.resolve()
    require(path.is_relative_to(root / 'artifacts'), 'Verifier receipts must remain beneath repository artifacts/')
    require(path.suffix == '.json' and path not in {item.resolve() for item in protected},
            'Output must be a JSON receipt distinct from its qualification/audit inputs')
    return path


class VerifierTests(unittest.TestCase):
    def test_code_equality_ignores_only_filename_and_rejects_nested_tamper(self):
        data = b'def value():\n    return (1, 2, 3)\n'
        verify_code(data, compile(data, '/old/build/source.py', 'exec', optimize=0), 'fixture')
        with self.assertRaisesRegex(VerificationError, 'bytecode'):
            verify_code(data, compile(data.replace(b'3', b'4'), 'old', 'exec'), 'fixture')
        with self.assertRaisesRegex(VerificationError, 'not Python code'):
            verify_code(data, b'not code', 'fixture')

    def test_json_duplicate_nonfinite_refused(self):
        with self.assertRaises(VerificationError):
            json.loads('{"passed":false,"passed":true}', object_pairs_hook=unique_object)
        with tempfile.TemporaryDirectory() as raw:
            path = Path(raw) / 'bad.json'
            path.write_text('{"number":NaN}')
            with self.assertRaises(VerificationError):
                read_json(path)

    def test_resource_comparison_exact_and_closed(self):
        with tempfile.TemporaryDirectory() as raw:
            first, second = Path(raw) / 'a', Path(raw) / 'b'
            first.mkdir(); second.mkdir()
            (first / 'source').write_bytes(b'abc')
            (second / 'source').write_bytes(b'abc')
            compare_files(first / 'source', second / 'source')
            self.assertEqual(file_manifest(first), file_manifest(second))
            (second / 'source').write_bytes(b'abd')
            with self.assertRaises(VerificationError):
                compare_files(first / 'source', second / 'source')
            (second / 'source').write_bytes(b'abc')
            (second / 'unqualified-extra').write_bytes(b'')
            self.assertNotEqual(file_manifest(first), file_manifest(second))

    def test_source_receipt_cannot_omit_or_add_inputs(self):
        current = {'engine/x.py': 'a' * 64, 'tests/test_x.py': 'b' * 64}
        proof = {'passed': True, 'sourceUnchanged': True, 'changedPaths': [], 'exitCode': 0,
                 'counts': {'passed': 2, 'failed': 0, 'error': 0}, 'version': 'fixture',
                 'python': platform.python_version(), 'sourceHashes': current.copy(),
                 'testFiles': ['tests/test_x.py']}
        validate_proof(proof, current, 'fixture')
        for modified in ({'engine/x.py': 'a' * 64}, {**current, 'engine/unqualified.py': 'c' * 64},
                         {**current, 'engine/x.py': 'd' * 64}):
            with self.assertRaisesRegex(VerificationError, 'scope/hash mismatch'):
                validate_proof({**proof, 'sourceHashes': modified}, current, 'fixture')
        with self.assertRaisesRegex(VerificationError, 'version'):
            validate_proof(proof, current, 'different')

    def test_relative_paths_reject_escape(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw).resolve()
            (root / 'source.py').write_text('')
            self.assertEqual(source_path(root, 'source.py'), root / 'source.py')
            for path in ('../source.py', './source.py', 'x/../source.py', 'C:/source.py', 'x\\source.py'):
                with self.assertRaises(VerificationError):
                    source_path(root, path)

    def test_importer_audit_identity_and_extra_catalog_refused(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            source = root / 'engine'
            built = root / 'bundle'
            copied = built / '_internal/engine'
            source.mkdir(); copied.mkdir(parents=True)
            hashes = {}
            for relative in IMPORTERS:
                data = (relative + '\n').encode()
                (root / relative).write_bytes(data)
                (copied / Path(relative).name).write_bytes(data)
                hashes[relative] = hashlib.sha256(data).hexdigest()
            (source / 'catalog_data').mkdir()
            (copied / 'catalog_data').mkdir()
            (source / 'catalog_data/fixture.off').write_bytes(b'OFF\n0 0 0\n')
            (copied / 'catalog_data/fixture.off').write_bytes(b'OFF\n0 0 0\n')
            hashes['engine/catalog_data/fixture.off'] = digest(source / 'catalog_data/fixture.off')
            audit = {'importer': {'sourceHashes': {name: hashes[name] for name in IMPORTERS}}}
            self.assertEqual(validate_importers_and_catalog(root, built, hashes, audit)['catalogAssetCount'], 1)
            stale = {'importer': {'sourceHashes': {**audit['importer']['sourceHashes'], 'engine/formats.py': 'a' * 64}}}
            with self.assertRaisesRegex(VerificationError, 'qualified audit'):
                validate_importers_and_catalog(root, built, hashes, stale)
            (copied / 'catalog_data/extra.off').write_bytes(b'')
            with self.assertRaisesRegex(VerificationError, 'asset set/bytes'):
                validate_importers_and_catalog(root, built, hashes, audit)

    def test_output_cannot_overwrite_sources_or_input_receipt(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw).resolve()
            proof = root / 'artifacts/proof.json'
            self.assertEqual(receipt_destination(root / 'artifacts/output.json', root, [proof]),
                             root / 'artifacts/output.json')
            for output in (proof, root / 'engine/server.py', root / 'artifacts/../package.json'):
                with self.assertRaises(VerificationError):
                    receipt_destination(output, root, [proof])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--unpacked-root', type=Path)
    parser.add_argument('--native-source-proof', type=Path)
    parser.add_argument('--audit', type=Path, default=ROOT / 'artifacts/drive-corpus-0.11.0.library-index.json')
    parser.add_argument('--output', type=Path)
    parser.add_argument('--validate-build', action='store_true')
    parser.add_argument('--self-test', action='store_true')
    args = parser.parse_args()
    if args.self_test:
        return 0 if unittest.TextTestRunner(verbosity=2).run(
            unittest.defaultTestLoader.loadTestsFromTestCase(VerifierTests)).wasSuccessful() else 1
    require(args.native_source_proof is not None, '--native-source-proof is required')
    require(not args.validate_build or args.unpacked_root is None,
            '--validate-build does not qualify a candidate; omit --unpacked-root')
    version = read_json(ROOT / 'package.json')['version']
    output = args.output or ROOT / 'artifacts' / (
        f'native-bundle-build-validation-{version}.json' if args.validate_build else
        f'native-bundle-candidate-{version}.json')
    output = receipt_destination(output, ROOT.resolve(), [args.native_source_proof, args.audit])
    try:
        result = qualify(args)
    except Exception as error:
        result = {'passed': False, 'version': version, 'sourceUnchanged': False,
                  'candidateQualified': False, 'error': f'{type(error).__name__}: {error}',
                  'createdUtc': datetime.now(timezone.utc).isoformat()}
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    if not result['passed']:
        print('Native bundle verification FAILED:', result['error'], file=sys.stderr)
        return 1
    print(f"{result['mode']} PASS: {result['nativeSourceHashCount']} unchanged inputs; "
          f"{result['moduleCount']} compiled modules + server; {result['catalogAssetCount']} catalog assets; "
          f"{result['engineResourceFileCount']} engine resource files. Receipt: {output}")
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
