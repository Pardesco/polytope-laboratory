"""Bound independent observer presentations stored in a document view."""
import math
from .geometry import GeometryError


def validate_multi_views(value):
    def finite(x):
        return type(x) in (int, float) and math.isfinite(x)

    def vector(x, count):
        return type(x) is list and len(x) == count and all(finite(v) for v in x)

    if (type(value) is not dict or type(value.get('version')) is not int or value['version'] != 1
            or type(value.get('count')) is not int or not 1 <= value['count'] <= 6):
        raise GeometryError('Saved multiple views require version 1 and 1..6 views.')
    cameras = value.get('cameras')
    if type(cameras) is not list or len(cameras) > 6:
        raise GeometryError('Saved multiple views require at most six independent cameras.')
    for camera in cameras:
        if camera is None:
            continue
        if (type(camera) is not dict or camera.get('projection') not in ('orthographic', 'perspective')
                or not all(vector(camera.get(k), 3) for k in ('position', 'target', 'up'))
                or not all(finite(camera.get(k)) and camera[k] > 0 for k in ('zoom', 'orthographicHalfHeight'))):
            raise GeometryError('Saved multiple-view cameras must have finite vectors and positive scales.')
    presentations = value.get('presentations', [])
    if type(presentations) is not list or len(presentations) > 6:
        raise GeometryError('Saved multiple views allow at most six presentations.')
    for item in presentations:
        if item is None:
            continue
        if (type(item) is not dict or item.get('projection') not in ('orthographic', 'perspective', 'stereographic')
                or not vector(item.get('angles'), 6)):
            raise GeometryError('Saved multiple-view presentations require a supported projection and six finite angles.')
    maximized = value.get('maximized')
    if maximized is not None and (type(maximized) is not int or not 0 <= maximized < value['count']):
        raise GeometryError('Saved maximized view must name an existing multiple-view slot.')
