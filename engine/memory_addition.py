"""Relative memory sizing using native unit and literal compound contracts."""

from copy import deepcopy
import math
import uuid

from .compounds import add_models, _check_source
from .export_context import prepare_export
from .geometry import GeometryError, identity
from .operations import transform


def add_memory_models(base, other, relative_scale=None, source_unit=None, target_unit=None):
    if relative_scale is None and source_unit is None and target_unit is None:
        return add_models(base, other)
    if (
        type(relative_scale) not in (int, float)
        or not math.isfinite(relative_scale)
        or not 1e-9 <= relative_scale <= 1e9
    ):
        raise GeometryError('Memory relative scale must be between 1e-9 and 1e9.')
    _check_source(base)
    _check_source(other)
    if type(source_unit) is not str or type(target_unit) is not str:
        raise GeometryError('Declare source and target coordinate units for relative memory sizing.')
    prepared = prepare_export(other, 'json', source_unit=source_unit, target_unit=target_unit)
    seed = 'polytope-memory:' + identity(other) + ':' + source_unit + ':' + target_unit
    if prepared['report']['scaleFactor'] != 1:
        prepared['model']['id'] = str(uuid.uuid5(uuid.NAMESPACE_URL, seed + ':units'))
    scaled = prepared['model'] if relative_scale == 1 else transform(prepared['model'], scale=relative_scale)
    if relative_scale != 1:
        scaled['id'] = str(uuid.uuid5(uuid.NAMESPACE_URL, seed + ':scale:' + str(float(relative_scale))))
    scaled['name'] = other.get('name', 'Memory')
    result = add_models(base, scaled)
    result['metadata']['coordinateUnits'] = target_unit
    receipt = {
        'relativeScale': relative_scale,
        'sourceUnit': source_unit,
        'targetUnit': target_unit,
        'exactUnitFactor': prepared['report']['exactFactor'],
        'appliedScale': prepared['report']['scaleFactor'] * relative_scale,
        'scaleOrigin': [0] * result['embeddingDimension'],
        'certified': False,
        'sourceFingerprint': identity(other),
        'contentPolicy': 'Source notes and content stay in their snapshots; no memory content is copied onto result elements.',
    }
    result['metadata']['memoryAddition'] = receipt
    seed = identity(base) + ':' + identity(scaled)
    for index, component in enumerate(result['components']):
        component['id'] = str(uuid.uuid5(uuid.NAMESPACE_URL, 'polytope-memory:' + seed + ':' + str(index)))
    result['provenance']['memoryAddition'] = deepcopy(receipt)
    _check_source(result)
    return result
