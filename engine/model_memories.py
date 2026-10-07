"""Native project validation for nine immutable renderer model memories.

Stored geometry goes through the same authoritative validation and cache
reconstruction as document history. This module only validates the envelope.
"""
import json
from .geometry import GeometryError

SLOT_BYTES = 32 * 1024 * 1024
TOTAL_BYTES = 128 * 1024 * 1024


def memory_documents(bank):
    if bank is None:
        return []
    if (not isinstance(bank, dict) or set(bank) != {'version', 'slots'}
            or type(bank['version']) is not int or bank['version'] != 1
            or not isinstance(bank['slots'], list) or len(bank['slots']) != 9):
        raise GeometryError('Model memories require version 1 and nine slots.')
    documents, total_bytes, total_nodes = [], 0, 0
    for number, entry in enumerate(bank['slots'], 1):
        if entry is None:
            continue
        if (not isinstance(entry, dict) or not isinstance(entry.get('state'), dict)
                or not isinstance(entry['state'].get('view'), dict)
                or not isinstance(entry.get('source'), dict)):
            raise GeometryError(f'Memory {number} requires a saved state, view and source record.')
        stack, nodes = [(entry, 0)], 0
        while stack:
            value, depth = stack.pop()
            nodes += 1
            if depth > 64 or nodes > 2_000_000:
                raise GeometryError(f'Memory {number} exceeds the structural resource limit.')
            if isinstance(value, dict):
                stack.extend((item, depth + 1) for item in value.values())
            elif isinstance(value, list):
                stack.extend((item, depth + 1) for item in value)
        try:
            size = len(json.dumps(entry, ensure_ascii=False, allow_nan=False,
                                  separators=(',', ':')).encode('utf-8'))
        except (ValueError, TypeError, RecursionError) as exc:
            raise GeometryError(f'Memory {number} must contain finite JSON data.') from exc
        if size > SLOT_BYTES:
            raise GeometryError(f'Memory {number} exceeds the 32 MiB resource limit.')
        total_bytes += size
        total_nodes += nodes
        if total_bytes > TOTAL_BYTES or total_nodes > 8_000_000:
            raise GeometryError('Model memories exceed the total resource limit.')
        documents.append({'cursor': 0, 'states': [entry['state']]})
    return documents
