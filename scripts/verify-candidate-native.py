"""Verify a chosen unpacked candidate against its qualified native inputs."""
import argparse
import ast
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--unpacked-root', required=True, type=Path)
    parser.add_argument('--native-proof', required=True, type=Path)
    parser.add_argument('--audit', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    unpacked = args.unpacked_root.resolve()
    proof = json.loads(args.native_proof.read_text(encoding='utf-8-sig'))
    audit = json.loads(args.audit.read_text(encoding='utf-8-sig'))
    assert proof['passed'] is True and proof['sourceUnchanged'] is True
    assert proof['changedPaths'] == []
    hashes = proof['sourceHashes']
    for relative, expected in hashes.items():
        source = (ROOT / relative).resolve()
        assert source.is_relative_to(ROOT)
        assert digest(source) == expected, relative + ': native source changed'
    toc_path = ROOT / 'build/pyinstaller/polytope-engine/PYZ-00.toc'
    toc = ast.literal_eval(toc_path.read_text(encoding='utf-8'))
    modules = []
    for name, raw_path, kind in toc[1]:
        if name == 'engine' or name.startswith('engine.'):
            source = Path(raw_path).resolve()
            assert source.is_relative_to(ROOT)
            relative = source.relative_to(ROOT).as_posix()
            assert kind == 'PYMODULE' and relative in hashes
            assert digest(source) == hashes[relative]
            modules.append({'module': name, 'source': relative, 'sha256': hashes[relative]})
    assert modules and len({row['module'] for row in modules}) == len(modules)
    built_engine = ROOT / 'build/engine/polytope-engine/polytope-engine.exe'
    packed_engine = unpacked / 'resources/engine/polytope-engine.exe'
    assert built_engine.read_bytes() == packed_engine.read_bytes()
    bundle = unpacked / 'resources/engine/_internal/engine'
    importer = []
    for relative, expected in audit['importer']['sourceHashes'].items():
        source = (ROOT / relative).resolve()
        assert source.is_relative_to(ROOT)
        copied = bundle / source.name
        assert digest(source) == expected == digest(copied)
        importer.append({'source': relative, 'sha256': expected})
    assets = []
    catalog = ROOT / 'engine/catalog_data'
    for source in sorted(catalog.rglob('*')):
        if source.is_file() and '__pycache__' not in source.parts:
            relative = source.relative_to(catalog)
            assert source.read_bytes() == (bundle / 'catalog_data' / relative).read_bytes()
            assets.append({'path': relative.as_posix(), 'sha256': digest(source)})
    result = {
        'passed': True, 'version': proof['version'],
        'createdUtc': datetime.now(timezone.utc).isoformat(),
        'scope': 'Native source/build receipt and exact candidate resource bytes; runtime behavior qualified separately',
        'unpackedRoot': str(unpacked), 'nativeSourceProof': str(args.native_proof.resolve()),
        'nativeSourceProofSha256': digest(args.native_proof),
        'nativeSourceHashCount': len(hashes), 'sourceUnchanged': True,
        'moduleCount': len(modules), 'modules': modules,
        'buildTocSha256': digest(toc_path),
        'buildExecutableSha256': digest(built_engine),
        'packagedExecutableSha256': digest(packed_engine),
        'frozenImporterFiles': importer, 'catalogAssetCount': len(assets),
        'catalogBytesMatch': True, 'catalogAssets': assets,
    }
    args.output.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    print(f'{len(hashes)} unchanged inputs; {len(modules)} build modules; '
          f'{len(assets)} catalog assets; {len(importer)} importer files: PASS')


if __name__ == '__main__':
    main()
