"""Shared source-bound JSON-lines checkpoints for offline audit runners."""

import json
import os


def read_checkpoint(path, header):
    with path.open(encoding='utf-8') as stream:
        try:
            if json.loads(next(stream)) != header:
                raise ValueError('Checkpoint source/inventory changed; use a fresh output directory.')
            return [json.loads(line) for line in stream]
        except (StopIteration, json.JSONDecodeError) as exc:
            raise ValueError('Checkpoint has a truncated row; repair the final row before resuming.') from exc


def append_checkpoint(stream, record):
    stream.write(json.dumps(record, ensure_ascii=False, allow_nan=False) + '\n')
    stream.flush()
    os.fsync(stream.fileno())
