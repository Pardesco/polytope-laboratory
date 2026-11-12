"""Compare warm sizing dispatch with sealed 0.27.20; record actual scale bounds.

This measures Python computation only. It excludes JSON-lines transport, browser
rendering, GPU work, monitor presentation and automatic-radius setup time.
"""

from copy import deepcopy
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import platform
import statistics
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from engine import dual_morph
from engine.generators import regular


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def summary(samples):
    quartiles = statistics.quantiles(samples, n=4, method='inclusive')
    return dict(
        samplesMsPerPose=samples, medianMsPerPose=statistics.median(samples), iqrMsPerPose=quartiles[2] - quartiles[0]
    )


def main():
    baseline_file = Path(sys.argv[1]).resolve()
    spec = importlib.util.spec_from_file_location('engine._sizing_baseline', baseline_file)
    baseline = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(baseline)
    source = regular('truncated-tetrahedron')
    source_before = deepcopy(source)
    context = dict(notes='Native sizing profile', unit='model')
    settings = dict(version=1, enabled=True, method='sizing', center=None, radius=1, ratio=0, duration=4, loop=False)
    _, unmatched = baseline.prepare(source, settings, context)
    center = unmatched['settings']['center']
    bound = lambda model: max(math.dist(point, center) for point in model['vertices'])
    source_bound = bound(source)
    unit_dual_bound = bound(unmatched['descriptor']['dual'])
    settings['radius'] = math.sqrt(source_bound / unit_dual_bound)
    _, prepared = baseline.prepare(source, settings, context)
    _, candidate_prepared = dual_morph.prepare(source, settings, context)
    assert prepared == candidate_prepared
    samples = [[], []]
    dispatchers = [baseline.dispatch_dual_morph, dual_morph.dispatch_dual_morph]
    ratios = [0, 0.125, 0.25, 0.5, 0.75, 0.875, 1]
    request = lambda ratio: dict(
        op='evaluate-dual-morph', model=source, params=dict(prepared=prepared, ratio=ratio, sourceContext=context)
    )
    expected = {ratio: dispatchers[0](request(ratio)) for ratio in ratios}
    frames = []
    for ratio in ratios:
        frame = dispatchers[1](request(ratio))
        assert frame == expected[ratio]
        frames.append(
            dict(
                ratio=ratio,
                bound=bound(frame['model']),
                sourceRelativeBound=bound(frame['model']) / source_bound,
                counts={k: len(frame['model'][k]) for k in ('vertices', 'edges', 'faces', 'cells')},
            )
        )
    for dispatch in dispatchers:
        for ratio in ratios:
            dispatch(request(ratio))
    for repeat in range(7):
        for index in [0, 1] if repeat % 2 == 0 else [1, 0]:
            started = time.perf_counter()
            for _ in range(4):
                for ratio in ratios:
                    dispatchers[index](request(ratio))
            samples[index].append((time.perf_counter() - started) * 1000 / (4 * len(ratios)))
    assert source == source_before
    assert math.isclose(bound(prepared['descriptor']['dual']), source_bound, rel_tol=1e-12)
    result = dict(
        passed=True,
        baselineVersion='0.27.20',
        candidateVersion=json.loads((ROOT / 'package.json').read_text())['version'],
        model=source['name'],
        settings=prepared['settings'],
        sourceBound=source_bound,
        unitRadiusDualBound=unit_dual_bound,
        matchedDualBound=bound(prepared['descriptor']['dual']),
        frames=frames,
        sourceUnchanged=True,
        allFramesExactlyEqual=True,
        baseline=summary(samples[0]),
        candidate=summary(samples[1]),
        inputs={
            str(p.relative_to(ROOT)): digest(p)
            for p in [
                baseline_file,
                ROOT / 'engine/dual_morph.py',
                ROOT / 'engine/dual_morph_cache.py',
                ROOT / 'engine/dual_morph_sizing.py',
                ROOT / 'engine/dual_morph_expansion.py',
            ]
        },
        hardware=dict(platform=platform.platform(), python=sys.version),
        scope='Seven alternating-order passes of 28 poses in warm direct Python dispatch; exact frame equality. No JSON-lines IPC, renderer, GPU, monitor FPS or setup-time claim.',
    )
    folder = Path(tempfile.mkdtemp(prefix='native-sizing-profile-', dir=ROOT / 'artifacts'))
    (folder / 'result.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(dict(folder=str(folder), **result), indent=2))


if __name__ == '__main__':
    main()
