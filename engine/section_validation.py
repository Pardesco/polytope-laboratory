"""Bounded reuse of successful section-source validation, keyed by literal data.

Never trust caller-supplied fingerprints or validation reports. Each cache key
includes the entire model and its value types as represented on the JSON wire.
"""

from collections import OrderedDict
import json


class SectionValidationCache:
    def __init__(self, max_entries=8, max_entry_bytes=2 * 1024 * 1024, max_total_bytes=8 * 1024 * 1024):
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
        pending = [model]
        nodes = 0
        upper_bytes = 0
        while pending:
            value = pending.pop()
            nodes += 1
            if nodes > 65536:
                return None
            kind = type(value)
            if kind is dict:
                if len(value) > 65536 - nodes - len(pending):
                    return None
                upper_bytes += 2 + 2 * len(value)  # Braces, commas and colons.
                for key in value:
                    if type(key) is not str or len(key) > self.max_entry_bytes:
                        return None
                    upper_bytes += 2 + 12 * len(key)
                pending.extend(value.values())
            elif kind is list:
                if len(value) > 65536 - nodes - len(pending):
                    return None
                upper_bytes += 2 + len(value)  # Brackets and commas.
                pending.extend(value)
            elif kind is str:
                if len(value) > self.max_entry_bytes:
                    return None
                # ensure_ascii uses at most two six-byte escapes per codepoint.
                upper_bytes += 2 + 12 * len(value)
            elif kind is int:
                # One decimal digit per binary bit is a conservative bound,
                # without constructing an arbitrarily large decimal string.
                upper_bytes += value.bit_length() + 2
            elif kind is float:
                upper_bytes += 32  # Covers every finite Python float repr.
            elif value is None or kind is bool:
                upper_bytes += 5
            else:
                return None
        # The plain-type/node walk also proves an allocation bound. When its
        # conservative ASCII size fits, use the C encoder rather than retaining
        # thousands of Python iterencode fragments. Overestimates fall back to
        # streaming, preserving exact byte-limit eligibility and canonical keys.
        if upper_bytes <= min(self.max_entry_bytes, self.max_total_bytes):
            try:
                return json.dumps(model, ensure_ascii=True, allow_nan=False, sort_keys=True, separators=(',', ':'))
            except (TypeError, ValueError, RecursionError):
                return None
        # Streaming stops collecting oversized inputs without retaining a large
        # encoded model. Non-JSON direct Python callers simply use validation.
        parts = []
        size = 0
        encoder = json.JSONEncoder(ensure_ascii=True, allow_nan=False, sort_keys=True, separators=(',', ':'))
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
