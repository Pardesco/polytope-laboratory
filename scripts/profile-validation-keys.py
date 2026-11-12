"""Compare bounded key encoding and its actual native callers against source."""

from pathlib import Path
from copy import deepcopy
from unittest.mock import patch
import ast
import hashlib
import importlib.util
import json
import os
import platform
import statistics
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
for variable in ('OPENBLAS_NUM_THREADS', 'OMP_NUM_THREADS'):
    os.environ[variable] = '1'

from engine import analysis_cache, formats, operations
from engine.geometry import analyze
from engine.section_validation import SectionValidationCache


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def hashes():
    return {
        name: digest(ROOT / name)
        for name in (
            'engine/section_validation.py',
            'engine/analysis_cache.py',
            'engine/formats.py',
            'engine/geometry.py',
            'engine/operations.py',
            'scripts/profile-validation-keys.py',
        )
    }


def main():
    if len(sys.argv) != 3:
        raise SystemExit('Pass the preserved section_validation.py and a six-state project input')
    baseline_path, input_path = map(lambda name: Path(name).resolve(), sys.argv[1:])
    folder = Path(tempfile.mkdtemp(prefix='validation-key-profile-', dir=ROOT / 'artifacts'))
    receipt = {
        'passed': False,
        'scope': 'Direct Python CPU timings, no desktop, IPC or packaged timings',
        'sourcesBefore': hashes(),
        'python': sys.version,
        'platform': platform.platform(),
        'baseline': {'path': str(baseline_path), 'sha256': digest(baseline_path)},
        'input': {'path': str(input_path), 'sha256': digest(input_path)},
        'samples': [],
    }
    try:
        spec = importlib.util.spec_from_file_location('_validation_key_baseline', baseline_path)
        baseline = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(baseline)

        def unchanged_tree(path):
            tree = ast.parse(path.read_text(encoding='utf-8'))
            for node in tree.body:
                if isinstance(node, ast.ClassDef) and node.name == 'SectionValidationCache':
                    node.body = [
                        item for item in node.body if not isinstance(item, ast.FunctionDef) or item.name != 'key'
                    ]
            return ast.dump(tree, include_attributes=False)

        assert unchanged_tree(baseline_path) == unchanged_tree(ROOT / 'engine/section_validation.py')
        receipt['onlyFunctionChanged'] = 'SectionValidationCache.key'
        project = json.loads(input_path.read_text(encoding='utf-8'))
        dense = project['documents'][0]['states'][0]['model']
        before, after = baseline.SectionValidationCache, SectionValidationCache
        # Fixed generated IDs permit complete section-result comparison; no
        # geometry, topology, provenance or numeric fields are omitted.
        with patch('engine.geometry.uuid.uuid4', return_value='validation-key-profile'):
            expected_project = formats.validate_project(deepcopy(project))
            expected_analysis = analyze(dense)
            expected_section = operations.section(dense, offset=0.17)
            results = {'project': expected_project, 'analysis': expected_analysis, 'section': expected_section}
            (folder / 'expected-results.json').write_text(
                json.dumps(results, separators=(',', ':'), allow_nan=False), encoding='utf-8'
            )
            for case in (
                '600-cell-key',
                'small-key',
                'streamed-key',
                'warm-analysis',
                'warm-section',
                'six-state-project',
            ):
                for run in range(-1, 7):
                    for mode in ('after', 'before') if run % 2 else ('before', 'after'):
                        cls = before if mode == 'before' else after
                        cache = cls()
                        if case.endswith('-key'):
                            source = (
                                dense
                                if case == '600-cell-key'
                                else {'v': [1, 2.0, True, '😀']}
                                if case == 'small-key'
                                else {'text': 'x' * 200000}
                            )
                            expected = json.dumps(
                                source, ensure_ascii=True, allow_nan=False, sort_keys=True, separators=(',', ':')
                            )
                            operation = lambda: cache.key(source)
                        elif case == 'warm-analysis':
                            with patch.object(analysis_cache, 'SectionValidationCache', cls):
                                reports = analysis_cache.AnalysisCache()
                            assert reports.resolve(dense, analyze) == expected_analysis
                            operation = lambda: reports.resolve(dense, analyze)
                            expected = expected_analysis
                        elif case == 'warm-section':
                            cache.passed(dense, operations.validate)
                            operation = lambda: operations.section(dense, offset=0.17)
                            expected = expected_section
                        else:
                            source = deepcopy(project)
                            operation = lambda: formats.validate_project(source)
                            expected = expected_project
                        with (
                            patch.object(analysis_cache, 'SectionValidationCache', cls),
                            patch.object(operations, 'section_validation', cache),
                        ):
                            start = time.perf_counter()
                            output = operation()
                            elapsed = time.perf_counter() - start
                        assert output == expected, (case, mode, 'complete output equality')
                        if run >= 0:
                            receipt['samples'].append({'case': case, 'run': run, 'mode': mode, 'seconds': elapsed})
            receipt['comparisons'] = []
            for case in dict.fromkeys(sample['case'] for sample in receipt['samples']):
                comparison = {'case': case}
                for mode in ('before', 'after'):
                    values = [
                        sample['seconds']
                        for sample in receipt['samples']
                        if sample['case'] == case and sample['mode'] == mode
                    ]
                    quartiles = statistics.quantiles(values, n=4, method='inclusive')
                    comparison[mode] = {
                        'medianSeconds': statistics.median(values),
                        'iqrSeconds': quartiles[2] - quartiles[0],
                    }
                receipt['comparisons'].append(comparison)
        receipt['sourcesAfter'] = hashes()
        assert receipt['sourcesBefore'] == receipt['sourcesAfter']
        receipt['passed'] = True
    except Exception:
        import traceback

        receipt['error'] = traceback.format_exc()
    finally:
        (folder / 'result.json').write_text(json.dumps(receipt, indent=2) + '\n', encoding='utf-8')
        print(
            json.dumps(
                {
                    'folder': str(folder),
                    'passed': receipt['passed'],
                    'comparisons': receipt.get('comparisons'),
                    'error': receipt.get('error'),
                },
                indent=2,
            )
        )
    if not receipt['passed']:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
