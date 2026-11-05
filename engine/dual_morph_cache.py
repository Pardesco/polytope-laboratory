"""Bounded literal-input cache used by independent read-only morph plan slots.

The key retains complete canonical JSON, not IDs, counts or a digest. Dispatch
still compares the entire supplied preparation against the native preparation.
Dispatch admits convex 3D sizing and stateless convex 4D sizing/truncation only;
other morph plans can maintain additional intermediate state.
"""
from copy import deepcopy
import json

from .dual_morph_expansion import _clone


class PreparedSizingCache:
    def __init__(self, max_key_bytes=2*1024**2, max_prepared_bytes=4*1024**2):
        self.max_key_bytes = max_key_bytes
        self.max_prepared_bytes = max_prepared_bytes
        self._entry = None

    def clear(self):
        self._entry = None

    def resolve(self, model, settings, context, factory):
        # _clone retains the existing finite/plain-JSON/depth/size validation.
        # The resulting snapshot and serialized key cannot alias caller edits.
        source = _clone(model)
        key = json.dumps([source, settings, context], sort_keys=True,
                         separators=(',', ':'), allow_nan=False)
        if self._entry is not None and key == self._entry[0]:
            return self._entry[1], self._entry[2]
        self.clear()
        plan, prepared = factory(source, settings, context)
        if len(key.encode('utf-8')) <= self.max_key_bytes:
            literal = json.dumps(prepared, sort_keys=True, separators=(',', ':'), allow_nan=False)
            if len(literal.encode('utf-8')) <= self.max_prepared_bytes:
                self._entry = (key, plan, deepcopy(prepared))
        return plan, prepared
