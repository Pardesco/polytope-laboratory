"""Compile resumable audit evidence for fast linked-library GUI startup."""
import argparse
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from engine.library_audit import compile_audit_index


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('report', type=Path, help='Schema 2 Drive audit report or existing compact library index.')
    parser.add_argument('--output', type=Path, required=True, help='Compact JSON destination outside the linked source tree.')
    args = parser.parse_args()
    print(json.dumps(compile_audit_index(args.report, args.output), ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
