"""Portable 8-bit grayscale height maps; shading only, never displacement."""

import base64
import binascii
import io
from PIL import Image
from .geometry import GeometryError
from .element_annotations import _png, MAX_ASSET


def _decode(encoded):
    if type(encoded) is not str or len(encoded) > 4 * ((MAX_ASSET + 2) // 3):
        raise GeometryError('Bump PNG exceeds 4 MiB.')
    try:
        raw = base64.b64decode(encoded, validate=True)
    except (ValueError, binascii.Error) as exc:
        raise GeometryError('Bump PNG base64 is invalid.') from exc
    clean, width, height = _png(raw)
    if raw[24] != 8 or not 2 <= width <= 512 or not 2 <= height <= 512:
        raise GeometryError('Bump PNG requires 8-bit samples and dimensions from 2 to 512 pixels.')
    with Image.open(io.BytesIO(clean)) as image:
        pixels = image.tobytes()
        if pixels[0::4] != pixels[1::4] or pixels[0::4] != pixels[2::4]:
            raise GeometryError('Bump PNG must be grayscale (R = G = B); tangent-space normal maps are unsupported.')
    return raw, clean, width, height


def validate_bump_asset(asset):
    if (
        type(asset) is not dict
        or set(asset) != {'mime', 'width', 'height', 'base64'}
        or asset.get('mime') != 'image/png'
    ):
        raise GeometryError('Bump requires an embedded PNG record.')
    if type(asset['width']) is not int or type(asset['height']) is not int:
        raise GeometryError('Bump PNG requires integer dimensions.')
    raw, clean, width, height = _decode(asset['base64'])
    if (width, height) != (asset['width'], asset['height']) or raw != clean:
        raise GeometryError('Bump PNG dimensions or normalized bytes do not match. Import the PNG again.')
    return asset


def import_bump(request):
    model, params = request.get('model', {}), request.get('params', {})
    if type(model) is not dict or model.get('dimension') != 3 or model.get('embeddingDimension') != 3:
        raise GeometryError('Imported bump sampling requires a 3D model embedded in 3D.')
    if type(params) is not dict or set(params) != {'pngBase64'}:
        raise GeometryError('Bump import requires PNG bytes only.')
    _raw, clean, width, height = _decode(params['pngBase64'])
    return {'mime': 'image/png', 'width': width, 'height': height, 'base64': base64.b64encode(clean).decode('ascii')}
