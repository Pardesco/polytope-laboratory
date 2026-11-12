"""Reproduce the shipped numerical symmetry receipts without Electron."""

import argparse
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from engine.symmetry_qualification import REPORT, build_report
from engine.formats import atomic_write

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output', type=Path, default=REPORT)
args = parser.parse_args()
report = build_report()
args.output.parent.mkdir(parents=True, exist_ok=True)
atomic_write(args.output, json.dumps(report, indent=2, allow_nan=False) + '\n')
failed = [r['id'] for r in report['receipts'] if r['status'] == 'failed' or r.get('unexpectedOutcome')]
print(json.dumps({'receipts': len(report['receipts']), 'failed': failed, 'output': str(args.output)}))
sys.exit(bool(failed))
