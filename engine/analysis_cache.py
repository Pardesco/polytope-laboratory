"""Bounded reuse of native analysis for the complete unchanged JSON source.

First requests still run the original analyzer, including geometric validation
and recomputation of intrinsic measures. Caller reports and fingerprints never
authorize reuse. Only a successful result produced in this process is retained.
"""
from collections import OrderedDict
from copy import deepcopy
import json

from .section_validation import SectionValidationCache


class AnalysisCache:
    def __init__(self, max_entries=4, max_key_bytes=2*1024**2,
                 max_result_bytes=1024**2, max_total_bytes=8*1024**2):
        self.max_entries=max_entries
        self.max_result_bytes=max_result_bytes
        self.max_total_bytes=max_total_bytes
        # Reuse the established plain-JSON/type/node/streaming size policy. No
        # tuple/list or numeric/string object-key coercion may produce a hit.
        self.keys=SectionValidationCache(max_entry_bytes=max_key_bytes,
                                         max_total_bytes=max_total_bytes)
        self.entries=OrderedDict()
        self.bytes=0

    def clear(self):
        self.entries.clear()
        self.bytes=0

    def result_size(self, result):
        # Result dictionaries may legitimately contain integer histogram keys.
        # This serialization is used only for resource accounting, never as an
        # identity key. Retain the actual result types in the detached record.
        encoder=json.JSONEncoder(ensure_ascii=True,allow_nan=False,
                                 sort_keys=True,separators=(',', ':'))
        size=0
        try:
            for part in encoder.iterencode(result):
                size+=len(part)
                if size>self.max_result_bytes or size>self.max_total_bytes:
                    return None
        except (TypeError,ValueError,RecursionError):
            return None
        return size

    def resolve(self, model, analyzer):
        key=self.keys.key(model) if self.max_entries>0 else None
        owned=(analyzer,key)
        if key is not None:
            try:
                entry=self.entries.get(owned)
            except TypeError:  # A non-hashable direct-Python callable is uncached.
                key=None
            else:
                if entry is not None:
                    self.entries.move_to_end(owned)
                    return deepcopy(entry[0])
        result=analyzer(model)  # Exceptions and invalid geometry are never cached.
        if key is not None:
            size=self.result_size(result)
            if size is not None and len(key)+size<=self.max_total_bytes:
                self.entries[owned]=(deepcopy(result),len(key)+size)
                self.bytes+=len(key)+size
                while len(self.entries)>self.max_entries or self.bytes>self.max_total_bytes:
                    _,removed=self.entries.popitem(last=False)
                    self.bytes-=removed[1]
        return result


analysis_cache=AnalysisCache()
