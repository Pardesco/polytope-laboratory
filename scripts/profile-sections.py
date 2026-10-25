"""Separate native section calculation and JSON costs; retain a CPU profile."""
from pathlib import Path
import cProfile
import hashlib
import io
import json
import os
import platform
import pstats
import sys
import tempfile
from time import perf_counter

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root))
os.environ['OPENBLAS_NUM_THREADS'] = '1'
os.environ['OMP_NUM_THREADS'] = '1'
from engine.generators import regular
from engine.server import dispatch
from engine import operations
from engine.section_validation import SectionValidationCache


def main():
    folder = Path(tempfile.mkdtemp(prefix='section-native-profile-', dir=root / 'artifacts'))
    reuse = '--without-reuse' not in sys.argv
    if not reuse: operations.section_validation = SectionValidationCache(max_entries=0)
    result = {'version': json.loads((root / 'package.json').read_text())['version'],
              'purpose': 'native section calculation/serialization profile, not UI latency',
              'reuseSuccessfulValidation': reuse, 'python': platform.python_version(), 'sources': {}}
    for key in ['tesseract', 'cell120']:
        model = json.loads(json.dumps(regular(key)))
        request = {'op': 'section', 'model': model,
                   'params': {'normal': [.2, .3, .4, 1], 'offset': .1, 'fill_rule': 'nonzero'}}
        dispatch(request)
        samples = []
        for _ in range(5):
            start = perf_counter(); cut = dispatch(request); calculated = perf_counter()
            wire = json.dumps(cut, ensure_ascii=False, allow_nan=False, separators=(',', ':'))
            encoded = perf_counter(); json.loads(wire); decoded = perf_counter()
            samples.append({'calculationMs': (calculated - start) * 1000,
                            'jsonEncodeMs': (encoded - calculated) * 1000,
                            'jsonDecodeMs': (decoded - encoded) * 1000})
        profile = cProfile.Profile(); profile.enable()
        for _ in range(3): dispatch(request)
        profile.disable(); profile.dump_stats(folder / (key + '.prof'))
        report = io.StringIO(); pstats.Stats(profile, stream=report).strip_dirs().sort_stats('cumulative').print_stats(35)
        (folder / (key + '.txt')).write_text(report.getvalue(), encoding='utf-8')
        result['sources'][key] = {'vertices': len(model['vertices']), 'edges': len(model['edges']),
            'faces': len(model['faces']), 'cells': len(model['cells']), 'outputUtf8Bytes': len(wire.encode('utf-8')),
            'samples': samples, 'profile': key + '.prof', 'summary': key + '.txt'}
    result['sourceHashes'] = {name: hashlib.sha256((root / name).read_bytes()).hexdigest()
                             for name in ['engine/operations.py', 'engine/section_validation.py', 'engine/geometry.py', 'engine/server.py']}
    (folder / 'result.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'folder': str(folder), **result}, indent=2))


if __name__ == '__main__': main()
