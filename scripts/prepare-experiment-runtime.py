"""Pin corresponding engine source for the frozen offline experiment entry."""

import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from engine.batch_experiment import source_manifest

if __name__ == '__main__':
    output = ROOT / 'build/experiment-runtime.json'
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(source_manifest(), indent=2) + '\n', encoding='utf-8')
    print('Prepared frozen experiment source/version manifest.')
