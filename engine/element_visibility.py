"""Source-bound display masks; source geometry and intrinsic measures are untouched."""
import re
from .geometry import GeometryError, identity


def validate_element_visibility(model, value):
    if value is None:
        return
    if (type(value) is not dict or type(value.get('version')) is not int or value.get('version') != 1
            or not isinstance(value.get('sourceFingerprint'), str)
            or not re.fullmatch('[0-9a-f]{64}', value['sourceFingerprint'])
            or type(value.get('hidden')) is not dict
            or set(value['hidden']) - {'vertices', 'edges', 'faces', 'cells'}):
        raise GeometryError('Saved element visibility requires version 1, a source fingerprint and source ID masks.')
    current = value['sourceFingerprint'] == identity(model)
    for field, ids in value['hidden'].items():
        bound = len(model.get(field, [])) if current else 200000
        if (type(ids) is not list or len(ids) > 200000
                or any(type(i) is not int or not 0 <= i < bound for i in ids)
                or len(set(ids)) != len(ids)):
            raise GeometryError('Saved hidden elements require distinct in-range source IDs.')
