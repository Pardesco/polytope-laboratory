"""Portable LDR equirectangular environments; surface sampling, not ray tracing."""

import base64
import binascii
from .geometry import GeometryError
from .element_annotations import _png, MAX_ASSET


def validate_environment_asset(asset):
    if (
        type(asset) is not dict
        or set(asset) != {'mime', 'width', 'height', 'base64'}
        or asset.get('mime') != 'image/png'
    ):
        raise GeometryError('Environment requires an embedded PNG record.')
    width, height, encoded = asset['width'], asset['height'], asset['base64']
    if (
        type(width) is not int
        or type(height) is not int
        or not 2 <= height <= 512
        or width != 2 * height
        or type(encoded) is not str
        or len(encoded) > 4 * ((MAX_ASSET + 2) // 3)
    ):
        raise GeometryError('Environment PNG must be 2:1 equirectangular, at most 1024 by 512 and 4 MiB.')
    try:
        raw = base64.b64decode(encoded, validate=True)
    except (ValueError, binascii.Error) as exc:
        raise GeometryError('Environment PNG base64 is invalid.') from exc
    clean, actual_width, actual_height = _png(raw)
    if (actual_width, actual_height) != (width, height) or clean != raw:
        raise GeometryError('Environment PNG dimensions or normalized bytes do not match. Import the PNG again.')
    return asset


def import_environment(request):
    model, params = request.get('model', {}), request.get('params', {})
    if type(model) is not dict or model.get('dimension') != 3 or model.get('embeddingDimension') != 3:
        raise GeometryError('Imported environment sampling requires a 3D model embedded in 3D.')
    if type(params) is not dict or set(params) != {'pngBase64'}:
        raise GeometryError('Environment import requires PNG bytes only.')
    encoded = params['pngBase64']
    if type(encoded) is not str or len(encoded) > 4 * ((MAX_ASSET + 2) // 3):
        raise GeometryError('Environment PNG exceeds 4 MiB.')
    try:
        raw = base64.b64decode(encoded, validate=True)
    except (ValueError, binascii.Error) as exc:
        raise GeometryError('Environment PNG base64 is invalid.') from exc
    clean, width, height = _png(raw)
    asset = {'mime': 'image/png', 'width': width, 'height': height, 'base64': base64.b64encode(clean).decode('ascii')}
    validate_environment_asset(asset)
    return asset
