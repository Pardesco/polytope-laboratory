"""Explicit large-4D native perf check; excluded from the everyday Node suite."""

import argparse
import cProfile
from copy import deepcopy
import json
from pathlib import Path
import pstats
import sys
from time import perf_counter

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from engine.dual_morph import dispatch_dual_morph, _PRODUCT_4D_CACHE
from engine.generators import regular


def check(key, max_seconds):
    source = regular(key)
    source['metadata']['offColors'] = {
        kind: [{'encoding': 'byte', 'values': [40, 80, 160, 127]} for _ in source[kind]] for kind in ('faces', 'cells')
    }
    before = deepcopy(source)
    context = dict(notes='Large 4D native performance check', unit='model')
    for method in ('expansion', 'tilting-quads'):
        _PRODUCT_4D_CACHE.clear()
        settings = dict(
            version=1, enabled=True, method=method, center=None, radius=1, ratio=0.5, duration=1, loop=False
        )
        start = perf_counter()
        prepared = dispatch_dual_morph(
            dict(op='prepare-dual-morph', model=source, params=dict(settings=settings, sourceContext=context))
        )
        preparation = perf_counter() - start
        frames = []
        for ratio in (0, 0.25, 0.5, 0.75, 1):
            tick = perf_counter()
            frame = dispatch_dual_morph(
                dict(
                    op='evaluate-dual-morph',
                    model=source,
                    params=dict(prepared=prepared, ratio=ratio, sourceContext=context),
                )
            )
            counts = [len(frame['model'][kind]) for kind in ('vertices', 'edges', 'faces', 'cells')]
            if 0 < ratio < 1:
                assert counts == ([2400, 7200, 7440, 2640] if method == 'expansion' else [2640, 7440, 7200, 2400])
                assert frame['model']['validation']['passed'] and frame['certified'] is False
                for kind in ('vertices', 'edges', 'faces', 'cells'):
                    assert len(frame['sourceMaps'][kind]) == len(frame['model'][kind])
                for kind in ('faces', 'cells'):
                    assert all(
                        color
                        and abs(color['values'][3] / (255 if color['encoding'] == 'byte' else 1) - 127 / 255) < 1e-12
                        for color in frame['model']['metadata']['offColors'][kind]
                    )
            elif ratio == 0:
                assert frame['model'] == source
            else:
                assert frame['model'] == prepared['descriptor']['dual']
            frames.append(dict(ratio=ratio, seconds=perf_counter() - tick, counts=counts))
        seconds = perf_counter() - start
        assert source == before
        print(
            json.dumps(dict(source=key, method=method, preparationSeconds=preparation, seconds=seconds, frames=frames)),
            flush=True,
        )
        assert seconds < max_seconds, f'{key} {method} exceeded {max_seconds}s native budget: {seconds:.3f}s'


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', choices=('cell120', 'cell600', 'both'), default='cell600')
    parser.add_argument('--max-seconds', type=float, default=60)
    parser.add_argument('--profile', action='store_true')
    args = parser.parse_args()
    profile = cProfile.Profile() if args.profile else None
    if profile:
        profile.enable()
    for key in ('cell120', 'cell600') if args.source == 'both' else (args.source,):
        check(key, args.max_seconds)
    if profile:
        profile.disable()
        pstats.Stats(profile).strip_dirs().sort_stats('cumtime').print_stats(25)
