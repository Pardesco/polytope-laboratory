"""Float64 display-track validation; no source geometry is changed."""

import math
from .geometry import GeometryError

V4_TRACKS = ('camera', 'projection', 'opacity', 'sectionNormal')


def validate_v4_frame(frame, tracks, record, finite):
    def bounded(value, minimum, maximum, label, positive=False):
        value = finite(value, label)
        if value < minimum or positive and value == minimum or value > maximum:
            raise GeometryError(f'{label} is outside its supported range ({minimum}, {maximum}).')
        return value

    result = {}
    if 'camera' in tracks:
        camera = record(
            frame['camera'], {'azimuth', 'elevation', 'distance'}, 'Camera orbit', {'azimuth', 'elevation', 'distance'}
        )
        result['camera'] = {
            'azimuth': bounded(camera['azimuth'], -1e6, 1e6, 'Camera azimuth'),
            'elevation': bounded(camera['elevation'], -90, 90, 'Camera elevation'),
            'distance': bounded(camera['distance'], 0, 1e6, 'Camera distance', True),
        }
    if 'projection' in tracks:
        result['projection'] = bounded(frame['projection'], 0, 100, '4D perspective eye distance', True)
    if 'opacity' in tracks:
        result['opacity'] = bounded(frame['opacity'], 0, 1, 'Face opacity')
    if 'sectionNormal' in tracks:
        normal = frame['sectionNormal']
        if type(normal) not in (list, tuple) or len(normal) != 4:
            raise GeometryError('Section normal track requires a unit 4-vector.')
        normal = [finite(x, 'Section normal component') for x in normal]
        length = math.hypot(*normal)
        if not math.isfinite(length) or length == 0:
            raise GeometryError('Section normal track requires a finite nonzero 4-vector.')
        result['sectionNormal'] = normal if abs(length - 1) <= 1e-12 else [x / length for x in normal]
    return result


def validate_normal_segments(frames):
    for a, b in zip(frames, frames[1:]):
        if sum(x * y for x, y in zip(a['sectionNormal'], b['sectionNormal'])) <= -1 + 1e-10:
            raise GeometryError(
                'Consecutive section normals are antipodal or too nearly antipodal. Add an intermediate normal to choose the section rotation.'
            )
