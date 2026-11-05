"""Compare whole project results and local file IO against preserved source."""
from pathlib import Path
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
from copy import deepcopy
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
for variable in ('OPENBLAS_NUM_THREADS', 'OMP_NUM_THREADS'):
    os.environ[variable] = '1'

from engine import formats
from engine.analysis_cache import AnalysisCache  # Prime shared import outside timings.
from engine.generators import regular


def sha(data):
    return hashlib.sha256(data).hexdigest()


def hashes():
    return {file: sha((ROOT/file).read_bytes()) for file in (
        'engine/formats.py', 'engine/analysis_cache.py', 'engine/section_validation.py',
        'engine/geometry.py', 'engine/display_state.py', 'engine/history.py',
        'scripts/profile-project-validation.py')}


def summary(values):
    quartiles = statistics.quantiles(values, n=4, method='inclusive')
    return {'medianSeconds': statistics.median(values), 'iqrSeconds': quartiles[2]-quartiles[0]}


def main():
    if len(sys.argv) != 2:
        raise SystemExit('Pass the preserved pre-change formats.py')
    baseline_path = Path(sys.argv[1]).resolve()
    folder = Path(tempfile.mkdtemp(prefix='project-validation-profile-', dir=ROOT/'artifacts'))
    receipt = {'passed': False, 'scope': 'Direct Python validation and source-level local Save/Open; no Electron IPC/dialog/packaged timing',
               'python': sys.version, 'platform': platform.platform(), 'sourcesBefore': hashes(),
               'baseline': {'path': str(baseline_path), 'sha256': sha(baseline_path.read_bytes())}, 'samples': []}
    try:
        spec = importlib.util.spec_from_file_location('engine._project_formats_baseline', baseline_path)
        baseline = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(baseline)
        # All import/export parser and writer logic outside project validation
        # must stay identical to the measured starting source.
        def unchanged_tree(file):
            tree = ast.parse(file.read_text(encoding='utf-8'))
            tree.body = [node for node in tree.body if not isinstance(node, ast.FunctionDef) or node.name != 'validate_project']
            return ast.dump(tree, include_attributes=False)
        assert unchanged_tree(baseline_path) == unchanged_tree(ROOT/'engine/formats.py')
        receipt['onlyFormatsFunctionChanged'] = 'validate_project'
        dense = json.loads((baseline_path.parent/'input.polyproj').read_text(encoding='utf-8'))
        one = deepcopy(dense)
        one['documents'][0]['states'] = one['documents'][0]['states'][:1]
        one['documents'][0]['cursor'] = 0
        cube = deepcopy(dense)
        cube_model = json.loads(json.dumps(regular('cube')))
        for state in cube['documents'][0]['states']:
            state['model'] = deepcopy(cube_model)
        changed = deepcopy(dense)
        for index, state in enumerate(changed['documents'][0]['states']):
            if index % 2:
                model = state['model']
                model['vertices'] = [[2*x for x in p] for p in model['vertices']]
                model['facetEquations'] = [plane[:-1]+[2*plane[-1]] for plane in model['facetEquations']]
        forged = deepcopy(dense)
        for state in forged['documents'][0]['states']:
            state['model'].update(fingerprint='f'*64, validation={'passed': True}, measure={'content': 1e30, 'boundaryMeasure': -1})
        cases = {'one-600-cell-state': one, 'six-600-cell-states': dense, 'six-cube-states': cube,
                 'alternating-original-scaled-600-cell': changed, 'forged-scalars-six-states': forged}
        inputs = json.dumps(cases, separators=(',', ':'), allow_nan=False)
        (folder/'inputs.json').write_text(inputs, encoding='utf-8')
        receipt['inputsSha256'] = sha(inputs.encode('utf-8'))
        expected = {}
        for name, source in cases.items():
            expected[name] = baseline.validate_project(deepcopy(source))
            for run in range(-1, 5):
                for mode in (('after', 'before') if run % 2 else ('before', 'after')):
                    module = baseline if mode == 'before' else formats
                    value = deepcopy(source)  # Cloning is outside the validation timing.
                    start = time.perf_counter()
                    output = module.validate_project(value)
                    elapsed = time.perf_counter()-start
                    assert output == expected[name], (name, mode, 'complete project equality')
                    if run >= 0:
                        receipt['samples'].append({'case': name, 'run': run, 'mode': mode, 'seconds': elapsed})
        receipt['comparisons'] = [{
            'case': name, **{mode: summary([sample['seconds'] for sample in receipt['samples'] if sample['case'] == name and sample['mode'] == mode])
                            for mode in ('before', 'after')}} for name in cases]
        (folder/'expected-projects.json').write_text(json.dumps(expected, separators=(',', ':'), allow_nan=False), encoding='utf-8')
        receipt['fileRoundtrips'] = []
        file_bytes = None
        for mode, module in (('before', baseline), ('after', formats)):
            destination = folder/(mode+'.polyproj')
            start = time.perf_counter()
            module.save_project(destination, deepcopy(dense))
            saved = time.perf_counter()-start
            start = time.perf_counter()
            loaded = module.load_file(destination)
            opened = time.perf_counter()-start
            assert loaded == {'project': expected['six-600-cell-states']}
            data = destination.read_bytes()
            if file_bytes is None:
                file_bytes = data
            else:
                assert data == file_bytes, 'exact saved JSON file bytes'
            receipt['fileRoundtrips'].append({'mode': mode, 'saveSeconds': saved, 'openSeconds': opened, 'sha256': sha(data)})
        receipt['geometryCalls'] = []
        for mode, module in (('before', baseline), ('after', formats)):
            validate, measures = module.validate, module.intrinsic_measures
            calls = {'mode': mode, 'validate': 0, 'intrinsicMeasures': 0}
            def counted_validate(model):
                calls['validate'] += 1
                return validate(model)
            def counted_measures(model):
                calls['intrinsicMeasures'] += 1
                return measures(model)
            with patch.object(module, 'validate', counted_validate), patch.object(module, 'intrinsic_measures', counted_measures):
                assert module.validate_project(deepcopy(dense)) == expected['six-600-cell-states']
            receipt['geometryCalls'].append(calls)
        receipt['sourcesAfter'] = hashes()
        assert receipt['sourcesBefore'] == receipt['sourcesAfter'], 'measured source changed'
        receipt['passed'] = True
    except Exception as error:
        import traceback
        receipt['error'] = traceback.format_exc()
    finally:
        (folder/'result.json').write_text(json.dumps(receipt, indent=2)+'\n', encoding='utf-8')
        print(json.dumps({'folder': str(folder), 'passed': receipt['passed'], 'comparisons': receipt.get('comparisons'),
                          'geometryCalls': receipt.get('geometryCalls'), 'fileRoundtrips': receipt.get('fileRoundtrips'), 'error': receipt.get('error')}, indent=2))
    if not receipt['passed']:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
