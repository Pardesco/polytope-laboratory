"""Fixture-only checks for release evidence; never executes a runtime."""
import contextlib
from datetime import datetime, timezone
import importlib.util
import io
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

REPOSITORY = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('release_evidence', REPOSITORY/'scripts/collect-release-evidence.py')
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value), encoding='utf-8')


class ReleaseEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='release-evidence-unit-', dir=REPOSITORY/'artifacts')
        self.root = Path(self.temporary.name).resolve()
        assert self.root.is_relative_to((REPOSITORY/'artifacts').resolve())
        self.addCleanup(self.temporary.cleanup)
        self.version = '0.0.0-fixture'
        write_json(self.root/'package.json', {'version': self.version})
        (self.root/'engine/catalog_data').mkdir(parents=True)
        self.audit = self.root/'artifacts/audit.json'
        write_json(self.audit, {'importer': {'sourceHashes': {}, 'dependencyVersions': {}}})
        self.python_log = self.root/'python.log'
        self.python_log.write_text('1 passed, 1 skipped in 0.01s\n', encoding='utf-8')
        self.node_log = self.root/'node.log'
        self.node_log.write_text('# pass 1\n# fail 0\n', encoding='utf-8')
        self.unpacked = self.root/'release/win-unpacked'
        self.executable = self.root/'release'/f'Polytope Laboratory {self.version}.exe'
        self.executable.parent.mkdir(parents=True)
        self.executable.write_bytes(b'Fixture portable; never execute')

    def qualification(self, name):
        directory = self.root/'artifacts'/name
        log = directory/'run.log'
        directory.mkdir(parents=True)
        log.write_text('Fixture success', encoding='utf-8')
        write_json(directory/'fixture-smoke.json', {'passed': True, 'version': self.version, 'packaged': True})
        self.unpacked.mkdir(parents=True, exist_ok=True)
        (self.unpacked/'resources').mkdir(exist_ok=True)
        executable = self.unpacked/'Polytope Laboratory.exe'
        archive = self.unpacked/'resources/app.asar'
        if not executable.exists(): executable.write_bytes(b'Fixture unpacked; never execute')
        if not archive.exists(): archive.write_bytes(b'Fixture archive; never parse or execute')
        write_json(directory/'result.json', {
            'passed': True, 'version': self.version,
            'executable': str(self.unpacked/'Polytope Laboratory.exe'),
            'runtimeUnchanged': True,
            'runtime': {'packaged': True, 'version': self.version,
                        'executablePath': str(executable), 'archivePath': str(archive),
                        'executableSha256': hashlib.sha256(executable.read_bytes()).hexdigest(),
                        'archiveSha256': hashlib.sha256(archive.read_bytes()).hexdigest()},
            'startedUtc': datetime.now(timezone.utc).isoformat(),
            'suites': [{'name': name, 'passed': True, 'exitCode': 0, 'log': str(log)}]})
        return directory

    def collect(self, directories, *, candidate=False):
        proof = self.root/'artifacts/portable-smoke.json'
        write_json(proof, {'passed': True, 'version': self.version,
                          'developmentPythonDisabled': True, 'executable': str(self.executable),
                          'runtimeUnchanged': True,
                          'executableSha256': hashlib.sha256(self.executable.read_bytes()).hexdigest()})
        arguments = ['collect', '--qualification', *map(str, directories),
                     '--portable-proof', str(proof), '--audit', str(self.audit),
                     '--python-log', str(self.python_log), '--node-log', str(self.node_log),
                     '--expected-suites', str(len(directories)), '--features', 'Fixture only']
        if candidate:
            arguments += ['--executable', str(self.executable), '--unpacked-root', str(self.unpacked)]
        with patch.object(collector, 'ROOT', self.root), patch.object(sys, 'argv', arguments), contextlib.redirect_stdout(io.StringIO()):
            collector.main()
        return json.loads((self.root/'artifacts'/f'release-{self.version}.json').read_text(encoding='utf-8'))

    def test_original_default_layout(self):
        result = self.collect([self.qualification('core')])
        self.assertEqual(result['validation']['packagedSuites'], 1)
        self.assertFalse(result['fullFeatureGoalComplete'])
        self.assertEqual(len(result['validation']['qualifications']), 1)

    def test_separate_candidate_and_multiple_qualification_runs(self):
        self.unpacked = self.root/'release/candidate/win-unpacked'
        self.executable = self.root/'release/candidate'/self.executable.name
        self.executable.parent.mkdir(parents=True)
        self.executable.write_bytes(b'Candidate fixture; never execute')
        result = self.collect([self.qualification('core'), self.qualification('layers')], candidate=True)
        self.assertEqual(result['portable']['path'], str(self.executable))
        self.assertEqual(result['validation']['packagedSuites'], 2)
        self.assertEqual(len(result['validation']['qualifications']), 2)

    def test_different_unpacked_candidate_refused(self):
        directory = self.qualification('core')
        value = json.loads((directory/'result.json').read_text())
        value['executable'] = str(self.root/'release/older/Polytope Laboratory.exe')
        write_json(directory/'result.json', value)
        with self.assertRaisesRegex(AssertionError, 'exact unpacked candidate'):
            self.collect([directory])

    def test_duplicate_suite_cannot_inflate_count(self):
        directory = self.qualification('core')
        with self.assertRaisesRegex(AssertionError, 'Duplicate'):
            self.collect([directory, directory])

    def test_failed_suite_refused(self):
        directory = self.qualification('core')
        value = json.loads((directory/'result.json').read_text())
        value['suites'][0]['exitCode'] = 1
        write_json(directory/'result.json', value)
        with self.assertRaises(AssertionError):
            self.collect([directory])

    def test_development_proof_cannot_qualify_package(self):
        directory = self.qualification('core')
        write_json(directory/'fixture-smoke.json', {'passed': True, 'version': self.version, 'packaged': False})
        with self.assertRaises(AssertionError):
            self.collect([directory])

    def test_changed_executable_bytes_refused(self):
        directory = self.qualification('core')
        (self.unpacked/'Polytope Laboratory.exe').write_bytes(b'Changed fixture bytes')
        with self.assertRaisesRegex(AssertionError, 'executable bytes changed'):
            self.collect([directory])

    def test_changed_archive_bytes_refused(self):
        directory = self.qualification('core')
        (self.unpacked/'resources/app.asar').write_bytes(b'Changed fixture bytes')
        with self.assertRaisesRegex(AssertionError, 'archive bytes changed'):
            self.collect([directory])

    def test_missing_runtime_freshness_refused(self):
        directory = self.qualification('core')
        value = json.loads((directory/'result.json').read_text())
        del value['runtimeUnchanged']
        write_json(directory/'result.json', value)
        with self.assertRaisesRegex(AssertionError, 'unchanged runtime bytes'):
            self.collect([directory])


if __name__ == '__main__':
    unittest.main()
