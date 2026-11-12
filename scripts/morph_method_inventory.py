"""Bounded ANIM-02 dispatch inventory; failures remain failures, not qualifications."""

import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
METHODS = (
    'sizing',
    'truncation',
    'augmentation',
    'expansion',
    'tilting-quads',
    'tilting-triangles',
    'tilting-to-compound',
    'tilting-to-rectify',
    'via-snub',
)
SOURCES = (
    'tetrahedron',
    'cube',
    'octahedron',
    'dodecahedron',
    'icosahedron',
    'great-dodecahedron',
    'simplex4',
    'tesseract',
    'cross4',
    'cell24',
    'cell120',
    'cell600',
    'star-uniform4-quidpith',
)


def implementation_hashes():
    return {
        str(p.relative_to(ROOT)).replace('\\', '/'): hashlib.sha256(p.read_bytes()).hexdigest()
        for p in sorted((ROOT / 'engine').glob('dual_morph*.py'))
    }


def worker(key, method):
    from engine.generators import regular
    from engine.dual_morph import prepare
    from engine.geometry import GeometryError, identity, validate

    p = regular(key)
    record = {
        'source': key,
        'dimension': p['dimension'],
        'interpretation': p['interpretation'],
        'sourceFingerprint': identity(p),
        'method': method,
    }
    settings = dict(
        version=1, enabled=True, method=method, center=None, radius=1.0, ratio=0.5, duration=1.0, loop=False
    )
    try:
        plan, prepared = prepare(p, settings, {'notes': '', 'unit': 'model'})
        samples = []
        for t in (0, 0.25, 0.5, 0.75, 1):
            frame = plan.evaluate(method, t) if method in ('expansion', 'tilting-quads') else plan.evaluate(t)
            checked = validate(frame['model'])
            if not checked['passed']:
                raise GeometryError('; '.join(checked['errors']))
            samples.append(
                {
                    'ratio': t,
                    'counts': [len(frame['model'].get(k, [])) for k in ('vertices', 'edges', 'faces', 'cells')],
                }
            )
        record.update(status='sampled', samples=samples, certified=False)
    except GeometryError as error:
        record.update(status='refused', reason=str(error))
    return record


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--worker', nargs=2, metavar=('SOURCE', 'METHOD'))
    parser.add_argument('--timeout', type=float, default=20.0)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--scenario', default='anim-02-method-domain-inventory-r7')
    parser.add_argument('--sources', nargs='+', default=SOURCES)
    args = parser.parse_args()
    if args.worker:
        print(json.dumps(worker(*args.worker)))
        return
    rows = []
    for key in args.sources:
        for method in METHODS:
            started = time.monotonic()
            try:
                result = subprocess.run(
                    [sys.executable, '-B', str(Path(__file__).resolve()), '--worker', key, method],
                    cwd=ROOT,
                    capture_output=True,
                    text=True,
                    timeout=args.timeout,
                )
                row = (
                    json.loads(result.stdout)
                    if result.returncode == 0
                    else {'source': key, 'method': method, 'status': 'error', 'reason': result.stderr[-1500:]}
                )
            except subprocess.TimeoutExpired:
                row = {
                    'source': key,
                    'method': method,
                    'status': 'limited',
                    'reason': 'Per-row subprocess time budget exceeded.',
                }
            row['elapsedSeconds'] = round(time.monotonic() - started, 3)
            rows.append(row)
            print(key, method, row['status'], file=sys.stderr, flush=True)
    report = {
        'schemaVersion': 1,
        'scenario': args.scenario,
        'sampleRatios': [0, 0.25, 0.5, 0.75, 1],
        'rowTimeBudgetSeconds': args.timeout,
        'implementationSha256': implementation_hashes(),
        'evidence': 'Native binary64 samples only; not installed benchmark or desktop qualification.',
        'rows': rows,
    }
    encoded = json.dumps(report, indent=2) + '\n'
    if args.output:
        args.output.write_text(encoded, encoding='utf-8')
    else:
        print(encoded, end='')


if __name__ == '__main__':
    main()
