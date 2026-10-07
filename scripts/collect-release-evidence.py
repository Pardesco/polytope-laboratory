"""Record local release evidence without converting subset checks into parity."""
from pathlib import Path
import argparse
from datetime import datetime, timezone
import hashlib
import importlib.metadata
import json
import re

ROOT = Path(__file__).resolve().parents[1]


def evidence(path):
    path = Path(path).resolve()
    raw = path.read_bytes()
    return {'path': str(path), 'bytes': len(raw),
            'sha256': hashlib.sha256(raw).hexdigest()}


def read_json(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def read_log(path):
    raw = Path(path).read_bytes()
    return raw.decode('utf-16' if raw[:2] in (b'\xff\xfe', b'\xfe\xff') else 'utf-8').replace('\r\n', '\n')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--qualification', required=True, type=Path, nargs='+')
    parser.add_argument('--executable', type=Path,
                        help='Actual portable launcher; defaults to release/<version>.exe')
    parser.add_argument('--unpacked-root', type=Path,
                        help='Actual unpacked candidate; defaults to release/win-unpacked')
    parser.add_argument('--python-log', required=True, type=Path)
    parser.add_argument('--native-source-proof', type=Path,
                        help='Native input qualification, including explicit byte-identical reuse')
    parser.add_argument('--node-log', required=True, type=Path)
    parser.add_argument('--portable-proof', required=True, type=Path)
    parser.add_argument('--audit', required=True, type=Path)
    parser.add_argument('--features', nargs='+', required=True)
    parser.add_argument('--expected-suites', type=int, required=True)
    args = parser.parse_args()
    version = read_json(ROOT / 'package.json')['version']
    executable = (args.executable or ROOT / 'release' / f'Polytope Laboratory {version}.exe').resolve()
    unpacked = (args.unpacked_root or ROOT / 'release' / 'win-unpacked').resolve()
    qualifications, suite_names = [], set()
    for directory in args.qualification:
        qualification = read_json(directory / 'result.json')
        assert qualification['passed'] is True and qualification['version'] == version
        assert Path(qualification['executable']).resolve() == unpacked / 'Polytope Laboratory.exe', 'Qualification must run this exact unpacked candidate'
        runtime = qualification.get('runtime', {})
        assert qualification.get('runtimeUnchanged') is True, 'Qualification must verify unchanged runtime bytes'
        assert runtime.get('packaged') is True and runtime.get('version') == version
        assert Path(runtime['executablePath']).resolve() == unpacked / 'Polytope Laboratory.exe'
        assert Path(runtime['archivePath']).resolve() == unpacked / 'resources' / 'app.asar'
        assert runtime['executableSha256'] == evidence(unpacked / 'Polytope Laboratory.exe')['sha256'], 'Qualified executable bytes changed'
        assert runtime['archiveSha256'] == evidence(unpacked / 'resources' / 'app.asar')['sha256'], 'Qualified archive bytes changed'
        assert all(item['passed'] is True and item['exitCode'] == 0
                   for item in qualification['suites'])
        names = [item['name'] for item in qualification['suites']]
        assert len(names) == len(set(names)) and not suite_names.intersection(names), 'Duplicate qualification suites'
        suite_names.update(names)
        qualifications.append((directory, qualification))
    assert len(suite_names) == args.expected_suites
    proofs, logs, paths = [], [], set()
    for directory, qualification in qualifications:
        started = datetime.fromisoformat(qualification['startedUtc'].replace('Z', '+00:00')).timestamp()
        for suite in qualification['suites']:
            log = Path(suite['log'])
            logs.append(evidence(log))
            directories = [log.parent]
            # Older suites print "passed N checks: <folder>" rather than
            # "Artifacts: <folder>". Only existing local artifact directories count.
            for match in re.finditer(r'([A-Za-z]:[\\/][^\r\n]+)', read_log(log)):
                directory = Path(match.group(1).strip()).resolve()
                if directory.is_dir() and directory.is_relative_to(ROOT / 'artifacts'):
                    directories.append(directory)
            found = False
            legacy_files = {'workspace': ROOT / 'artifacts' / 'workspace-ui-packaged-smoke.json'}
            candidates = [path for directory in directories for path in directory.rglob('*.json')]
            if suite['name'] in legacy_files and not any(
                    path.name == legacy_files[suite['name']].name for path in candidates):
                candidates.append(legacy_files[suite['name']])
            for path in candidates:
                    if path in paths or path.name not in ('result.json', 'portable-smoke.json') and not path.name.endswith('smoke.json'):
                        continue
                    result = read_json(path)
                    if not isinstance(result, dict) or result.get('passed') is not True:
                        continue
                    assert result.get('version', version) == version, str(path)
                    assert path.stat().st_mtime >= started - 1, 'Stale proof: ' + str(path)
                    if 'packaged' in result:
                        assert result['packaged'] is True, str(path)
                    assert not result.get('pageErrors', []), str(path)
                    proofs.append({**evidence(path), 'result': result})
                    paths.add(path)
                    found = True
            assert found, 'No successful fresh JSON proof for ' + suite['name']
    portable = read_json(args.portable_proof)
    assert portable['passed'] is True and portable['version'] == version
    assert portable['developmentPythonDisabled'] is True
    assert Path(portable['executable']).resolve() == executable.resolve()
    assert portable.get('runtimeUnchanged') is True, 'Portable must verify unchanged launcher bytes'
    assert portable['executableSha256'] == evidence(executable)['sha256'], 'Qualified portable bytes changed'
    python_text, node_text = read_log(args.python_log), read_log(args.node_log)
    summary = re.search(r'(\d+) passed(?:, (\d+) skipped)? in [\d.]+s', python_text)
    assert summary and not re.search(r'\d+ failed|ERROR collecting', python_text)
    passed = re.search(r'^# pass (\d+)$', node_text, re.MULTILINE)
    assert passed and re.search(r'^# fail 0$', node_text, re.MULTILINE)
    audit = read_json(args.audit)
    bundle = unpacked / 'resources' / 'engine' / '_internal' / 'engine'
    importer = []
    for relative, expected in audit['importer']['sourceHashes'].items():
        source = ROOT / relative
        copied = bundle / source.name
        assert evidence(source)['sha256'] == expected == evidence(copied)['sha256']
        importer.append({'source': evidence(source), 'bundled': evidence(copied)})
    for name, expected in audit['importer']['dependencyVersions'].items():
        assert importlib.metadata.version(name) == expected
    assets = []
    for path in sorted((ROOT / 'engine' / 'catalog_data').rglob('*')):
        if path.is_file() and '__pycache__' not in path.parts:
            copied = bundle / 'catalog_data' / path.relative_to(ROOT / 'engine' / 'catalog_data')
            assert path.read_bytes() == copied.read_bytes(), str(copied)
            assets.append(evidence(path))
    result = {
        'schemaVersion': 1, 'version': version,
        'createdUtc': datetime.now(timezone.utc).isoformat(),
        'portable': evidence(executable), 'signed': False,
        'implementedFeatures': args.features,
        'validation': {
            'engineTests': {**evidence(args.python_log), 'passed': int(summary[1]), 'skipped': int(summary[2] or 0)},
            'nodeFeatureTests': {**evidence(args.node_log), 'passed': int(passed[1])},
            'packagedSuites': len(suite_names),
            'qualifications': [evidence(directory / 'result.json') for directory, _ in qualifications],
            'suiteLogs': logs, 'evidence': proofs,
            'actualPortable': {**evidence(args.portable_proof), 'result': portable},
            'retainedImporterAudit': evidence(args.audit),
            'importerSourceMatches': importer,
            'bundledCatalogAssets': {'count': len(assets), 'allBytesMatchSource': True, 'sourceFiles': assets}},
        'fullFeatureGoalComplete': False,
        'knownLimits': [
            'Full Stella4D parity remains incomplete; the unchanged73-requirement ledger records remaining release gates.',
            'Stereographic tessellation runs in a bounded background worker; dense surface motion remains slow and may publish explicitly diagnosed partial previews. Sampled pixel error is not a whole-curve bound; capture requires complete geometry.',
            'Explosion supports qualified convex intrinsic3D/4D sources; generalized directions and partial4Dfolding are unavailable.',
            'Retained library audit has3050parsed/14diagnosed; it does not claim mathematical classification or zero failures.',
            'Portable is unsigned; clean-machine/GPU, power-loss and hardware printer qualification remain open.']}
    if 'triangular-geodesic' in args.features:
        result['knownLimits'].append('Triangular geodesic supports checked closed convex intrinsic3D triangular common-sphere sources within bounded output counts; arbitrary-face domains, general sphere projection and full CON-08 parity remain open. Output is uncertified generalized incidence with no invented solid measure.')
    if 'convex-core-3d' in args.features:
        result['knownLimits'].append('3D convex core supports source facial halfspaces with an explicit center and at most32 distinct planes. Exact binary64-ratio intersection/side witnesses do not certify approximate planarity, LP boundedness or native classification; full CON-03 parity remains open.')
    if 'convex-core-4d' in args.features:
        result['knownLimits'].append('4D convex core derives supporting hyperplanes from literal source cell incidence, with an explicit four-coordinate center, at most16 distinct planes and64 result vertices. Exact binary64-ratio witnesses have bounded scope; floating planarity, LP boundedness, realization and measures remain uncertified. Installed Stella4D mathematical-output conformance and full CON-03 parity remain open.')
    if 'face-placement' in args.features:
        result['knownLimits'].append('Face placement supports bounded checked convex intrinsic3D source/addition models on1..16 selected faces with scale, signed height and tangent rotation. It creates genuine extractable compound copies and retains gaps, overlaps and coincident faces; no welding, Boolean union, vertex placement or full CON-07 parity is claimed.')
    if 'projection-auto-fit' in args.features:
        result['knownLimits'].append('Deferred projection auto-fit frames the current published geometry cloud with camera/source/pose cancellation guards; omitted patches, between-sample curves and GPU arithmetic are outside that framing observation.')
    if 'conforming-stereographic-surfaces' in args.features:
        result['knownLimits'].append('Stereographic surfaces use bounded shared-edge refinement with analytic curved normals. Pole-excluded or unresolved surface leaves remain diagnosed partial previews and refuse complete capture; dense motion may remain slow. The sampled error criterion is not a whole-patch bound, and transparent overlap/GPU ordering remains unqualified.')
    if 'source-zonohedron' in args.features:
        result['knownLimits'].append('Source-feature zonohedra support bounded checked intrinsic3D inputs and ordered explicit vertex/edge/face-normal/world-axis groups. All/type/symmetry-axis selectors, adding zones to existing zonohedra and full CON-08 conformance remain open. Exact direction/support witnesses do not certify the approximate realized solid.')
    if 'cell-attributes' in args.features:
        result['knownLimits'].append('Cell extraction0.2 preserves ordered source face RGBA/null, units and the complete source receipt in a centroid-centered intrinsic3D frame. Parent cell color is historical metadata, not an invented 3D cell palette. Explicit cell0.1 replay remains legacy; no expanded arbitrary-cell extraction domain is claimed.')
    if 'animated-tours' in args.features:
        capture = ('PNG and explicit-pose WebM samples include exact endpoints; packaged checks decode all seven fixture poses and their timestamps.'
                   if 'explicit-pose-video' in args.features else
                   'PNG samples include exact endpoints; historical MediaRecorder WebM is real-time capture with encoder retries, not an exact frame-count claim.')
        result['knownLimits'].append('Tourv2 renders two independent saved model/view/animation layers on an absolute hold/transition timeline and exports composed PNG/WebM. ' + capture + ' Inherited layouts/rates, multi-event editing, morph methods, printable SVG layouts and Stella .tour interoperability remain open.')
    if 'explicit-pose-video' in args.features:
        result['knownLimits'].append('WebM uses actual WebCodecs VP8 encoding of immutable timestamped poses and a native staged publication. WebCodecs support is required; there is no historical MediaRecorder fallback. The final pose is displayed for one additional sample interval, explicitly recorded separately from source-timeline duration. Resolution, frame-count, byte and timeout budgets remain bounded; full animation-method parity is open.')
    if 'automatic-faceting' in args.features:
        result['knownLimits'].append('Automatic faceting supports bounded checked intrinsic3D source vertex sets, candidate pools, source-face searches, detached preview and explicit adoption with history/native Save/Open. Tidy-dual/spiky policy integration, editable per-vertex faceting diagrams, larger/generalized domains and full FAC parity remain open.')
    if 'incremental-stereographic-refinement' in args.features:
        result['knownLimits'].append('Incremental conforming stereographic refinement retains more dense source parameter area within existing depth/sample/triangle/transfer budgets. Analytic smooth normals and shared same-face edges are qualified for checked fixtures; pole-excluded or unresolved leaves remain diagnosed partial previews and refuse complete capture. Finite-camera curved-region kernels are unmounted; no universal FPS or camera-complete claim is made.')
    if 'net-expressions' in args.features:
        result['knownLimits'].append('Face/cell net real-valued E0, paper dimensions/margins/gaps and placement entries accept bounded native expressions with source/view/workspace/export publication fences. Literal IDs remain integer inputs. Expression entry across all other numeric fields and installed baseline equation equivalence remain open.')
    if 'spring-relaxation' in args.features:
        result['knownLimits'].append('Spring0.1 supports bounded closed XYZ complexes, deterministic source/seeded initialization and explicit distance/face-step/pin constraints. Independent residual and geometric validity checks do not certify optimizer execution, global optimality or uniformity. Full installed constraint/near-miss conformance remains open.')
    if 'regular4d-validation' in args.features:
        result['knownLimits'].append('All16 regular4D sources have explicit fixed identities and binary64 full-incidence flag-transitivity evidence with normalized1e-8 tolerance and source ownership. This does not certify exact coordinates, density or generalized solid volumes; unrelated nonconvex operation gates remain separate.')
    if 'workspace-expressions' in args.features:
        result['knownLimits'].append('Native expression batches support up to80000 bounded values atomically in real/canonical-rational modes; exact Waterman and rational hull paths preserve rational distinctions. Real-mode integer fields check rounded binary64 results. Complete equation/input-field and installed-baseline conformance remain open.')
    if args.native_source_proof:
        native = read_json(args.native_source_proof)
        assert native['passed'] is True and native['sourceUnchanged'] is True
        assert native['version'] == version and native['changedPaths'] == []
        for relative, expected in native['sourceHashes'].items():
            assert evidence(ROOT / relative)['sha256'] == expected, relative
        result['validation']['nativeInputQualification'] = {
            **evidence(args.native_source_proof),
            'method': native.get('qualificationMethod', 'executed-native-tests'),
            'originalQualificationVersion': native.get('originalQualificationVersion', version),
            'scope': native['scope']}
    destination = ROOT / 'artifacts' / f'release-{version}.json'
    destination.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    print(f'Release evidence: {destination}; {len(proofs)} inspected JSON proofs.')


if __name__ == '__main__':
    main()
