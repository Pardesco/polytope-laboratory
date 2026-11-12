"""SPDX-License-Identifier: GPL-3.0-only. Bounded optional built-in effects."""

import math
from copy import deepcopy
from engine.geometry import GeometryError

DEFAULTS = {
    'version': 1,
    'bump': 'none',
    'bumpStrength': 0.015,
    'bumpFrequency': 12,
    'reflection': 'none',
    'reflectivity': 0.2,
    'environmentMode': 'reflection',
    'refractiveIndex': 1.5,
    'environmentAsset': None,
    'bumpAsset': None,
}


def validate_material_effects(value):
    if type(value) is not dict or set(value) - set(DEFAULTS):
        raise GeometryError('Saved material effects require a supported record.')
    o = {**DEFAULTS, **value}
    if (
        type(o['version']) not in (int, float)
        or o['version'] != 1
        or type(o['bump']) is not str
        or o['bump'] not in ('none', 'waves', 'pebbles', 'image')
        or type(o['reflection']) is not str
        or o['reflection'] not in ('none', 'studio', 'image')
        or type(o['environmentMode']) is not str
        or o['environmentMode'] not in ('reflection', 'refraction')
    ):
        raise GeometryError('Unsupported material effect version or built-in asset.')
    for key, minimum, maximum in (
        ('bumpStrength', 0, 0.1),
        ('bumpFrequency', 1, 32),
        ('reflectivity', 0, 1),
        ('refractiveIndex', 1, 3),
    ):
        x = o[key]
        if type(x) not in (int, float) or not minimum <= x <= maximum or not math.isfinite(x):
            raise GeometryError('Saved ' + key + ' exceeds its finite effect range.')
    if o['environmentAsset'] is not None:
        from .material_environment import validate_environment_asset

        validate_environment_asset(o['environmentAsset'])
    if o['reflection'] == 'image' and o['environmentAsset'] is None:
        raise GeometryError('Import an environment PNG before choosing image sampling.')
    if o['bumpAsset'] is not None:
        from .material_bump import validate_bump_asset

        validate_bump_asset(o['bumpAsset'])
    if o['bump'] == 'image' and o['bumpAsset'] is None:
        raise GeometryError('Import a grayscale bump PNG before choosing image bump.')
    return deepcopy(value)
