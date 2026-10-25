"""Bounded reuse of successful section-source validation, keyed by literal data.

Never trust caller-supplied fingerprints or validation reports. Each cache key
includes the entire model and its value types as represented on the JSON wire.
"""
from collections import OrderedDict
import json


class SectionValidationCache:
    def __init__(self, max_entries=8, max_entry_bytes=2 * 1024 * 1024,
                 max_total_bytes=8 * 1024 * 1024):
        self.max_entries = max_entries
        self.max_entry_bytes = max_entry_bytes
        self.max_total_bytes = max_total_bytes
        self.entries = OrderedDict()
        self.bytes = 0

    def key(self, model):
        # Only the plain JSON value types used by native requests are eligible.
        # Tuple/list or numeric/string object-key coercion must not create hits
        # for a different direct-Python input. The walk also bounds cycles and
        # oversized individual strings before JSON allocates their wire form.
        pending = [model]; nodes = 0
        while pending:
            value = pending.pop(); nodes += 1
            if nodes > 65536:
                return None
            kind = type(value)
            if kind is dict:
                if len(value) > 65536 - nodes - len(pending) or any(type(k) is not str or len(k) > self.max_entry_bytes for k in value):
                    return None
                pending.extend(value.values())
            elif kind is list:
                if len(value) > 65536 - nodes - len(pending):
                    return None
                pending.extend(value)
            elif kind is str:
                if len(value) > self.max_entry_bytes:
                    return None
            elif value is not None and kind not in (int, float, bool):
                return None
        # Streaming stops collecting oversized inputs without retaining a large
        # encoded model. Non-JSON direct Python callers simply use validation.
        parts = []; size = 0
        encoder = json.JSONEncoder(ensure_ascii=True, allow_nan=False,
                                   sort_keys=True, separators=(',', ':'))
        try:
            for part in encoder.iterencode(model):
                size += len(part)
                if size > self.max_entry_bytes or size > self.max_total_bytes:
                    return None
                parts.append(part)
        except (TypeError, ValueError, RecursionError):
            return None
        return ''.join(parts)

    def passed(self, model, validator):
        key = self.key(model) if self.max_entries > 0 else None
        owned = (validator, key)
        if key is not None and owned in self.entries:
            self.entries.move_to_end(owned)
            return True
        if not validator(model)['passed']:
            return False
        if key is not None:
            size = len(key)
            self.entries[owned] = size
            self.bytes += size
            while len(self.entries) > self.max_entries or self.bytes > self.max_total_bytes:
                _, removed = self.entries.popitem(last=False)
                self.bytes -= removed
        return True


section_validation = SectionValidationCache()
