"""Prepare native renderer inputs; construction time is outside the CPU profile."""
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from engine.generators import regular

KEYS = ('cell120', 'cell600', 'uniform4-gap', 'uniform4-rox', 'uniform4-tex',
        'compound-five-24-cells', 'compound-five-rhombicuboctahedra')

if __name__ == '__main__':
    folder = Path(sys.argv[1])
    folder.mkdir(parents=True, exist_ok=True)
    for key in KEYS:
        model = regular(key)
        (folder / (key + '.json')).write_text(json.dumps(model), encoding='utf-8')
        print(key, *(len(model[k]) for k in ('vertices', 'edges', 'faces', 'cells')), flush=True)
