"""Native saved sequence policy, independent of renderer adapter availability."""
import math
from .geometry import GeometryError
from .history import _json_bytes

MAX_DURATION=300
MAX_FPS=60
MAX_KEYFRAMES=256
MAX_FRAMES=18001
MAX_ANGLE=1e6
MAX_EXPLOSION_AMOUNT=10
MAX_SEQUENCE_BYTES=1024*1024


def _record(value,allowed,label,required=()):
    if type(value) is not dict or len(value)>len(allowed):
        raise GeometryError(label+' requires a bounded plain record.')
    if any(type(key) is not str or key not in allowed for key in value):
        raise GeometryError(label+' has unsupported fields.')
    if any(key not in value for key in required):
        raise GeometryError(label+' is missing required fields.')
    return value


def _finite(value,label):
    if type(value) not in (int,float):
        raise GeometryError(label+' must be a finite number.')
    try:
        finite=math.isfinite(value)
    except OverflowError:
        finite=False
    if not finite:
        raise GeometryError(label+' must be a finite float64 number.')
    return value


def _tracks(value):
    record=_record(value,{'explosion','fold'},'Animation tracks')
    if not record:
        raise GeometryError('Version 2 animations require at least one supported track.')
    tracks={}
    if 'explosion' in record:
        options=_record(record['explosion'],{'direction'},'Explosion track',{'direction'})
        if type(options['direction']) is not str or options['direction'] not in ('normal','radial'):
            raise GeometryError('Explosion track direction must be normal or radial.')
        tracks['explosion']={'direction':options['direction']}
    if 'fold' in record:
        options=_record(record['fold'],{'kind'},'Fold track',{'kind'})
        if type(options['kind']) is not str or options['kind']!='face-net':
            raise GeometryError('Only rigid 3D face-net folding tracks are supported; partial 4D cell-net folding is unavailable.')
        tracks['fold']={'kind':'face-net'}
    return tracks


def validate_animation_sequence(value):
    """Return detached validated sequence data; never drop unknown saved tracks.

    Geometry qualification and renderer capabilities are separate checks. Known
    v2 data is valid even when the current UI cannot apply its presentation.
    """
    sequence=_record(value,{'version','duration','fps','loop','keyframes','tracks'},
                     'Animation sequence',{'version','duration','fps','keyframes'})
    version=sequence['version']
    if type(version) not in (int,float) or version not in (1,2):
        raise GeometryError('Unsupported animation sequence version.')
    if version==1 and 'tracks' in sequence:
        raise GeometryError('Additional animation tracks require version 2.')
    tracks=_tracks(sequence.get('tracks')) if version==2 else {}
    duration=_finite(sequence['duration'],'Animation duration')
    fps=_finite(sequence['fps'],'Animation frame rate')
    if not 0<duration<=MAX_DURATION:
        raise GeometryError('Animation duration must be greater than zero and at most 300 seconds.')
    if not 1<=fps<=MAX_FPS or fps!=int(fps):
        raise GeometryError('Animation frame rate must be an integer from 1 to 60.')
    if math.ceil(duration*fps)+1>MAX_FRAMES:
        raise GeometryError('Animation exceeds its frame resource limit.')
    frames=sequence['keyframes']
    if type(frames) not in (list,tuple) or not 2<=len(frames)<=MAX_KEYFRAMES:
        raise GeometryError('Animation requires 2 to 256 keyframes.')
    if 'loop' in sequence and type(sequence['loop']) is not bool:
        raise GeometryError('Animation loop must be a boolean.')
    frame_fields={'time','angles','sectionOffset'}
    if 'explosion' in tracks:frame_fields.add('explosionAmount')
    if 'fold' in tracks:frame_fields.add('foldFraction')
    keyframes=[]
    for frame in frames:
        frame=_record(frame,frame_fields,'Animation keyframe',frame_fields)
        time=_finite(frame['time'],'Keyframe time')
        if not 0<=time<=duration or keyframes and time<=keyframes[-1]['time']:
            raise GeometryError('Keyframe times must increase strictly within the animation duration.')
        angles=frame['angles']
        if type(angles) not in (list,tuple) or len(angles)!=6:
            raise GeometryError('Every keyframe requires six rotation angles.')
        angles=[_finite(angle,'Rotation angle') for angle in angles]
        if any(abs(angle)>MAX_ANGLE for angle in angles):
            raise GeometryError('Rotation angles exceed the supported range.')
        normalized={'time':time,'angles':angles,'sectionOffset':_finite(frame['sectionOffset'],'Section depth')}
        for name,maximum in [('explosionAmount',MAX_EXPLOSION_AMOUNT),('foldFraction',1)]:
            if name not in frame_fields:continue
            scalar=_finite(frame[name],name)
            if not 0<=scalar<=maximum:
                raise GeometryError(f'{name} must be in [0,{maximum}].')
            normalized[name]=scalar
        keyframes.append(normalized)
    if keyframes[0]['time']!=0 or keyframes[-1]['time']!=duration:
        raise GeometryError('Animation keyframes must include time zero and the exact duration.')
    normalized={'version':int(version),'duration':duration,'fps':int(fps),
                'loop':sequence.get('loop',False),**({'tracks':tracks} if tracks else {}),
                'keyframes':keyframes}
    try:
        _json_bytes(normalized,MAX_SEQUENCE_BYTES)
    except GeometryError as exc:
        raise GeometryError('Animation sequence exceeds its finite JSON resource policy: '+str(exc)) from exc
    return normalized


def animation_render_support(value,rendered_tracks=()):
    """Valid data can be retained without claiming that it can be rendered."""
    sequence=validate_animation_sequence(value)
    if type(rendered_tracks) not in (list,tuple,set,frozenset) or any(type(name) is not str for name in rendered_tracks):
        raise GeometryError('Animation renderer capabilities require supported track names.')
    capabilities=set(rendered_tracks)
    if any(type(name) is not str or name not in ('explosion','fold') for name in capabilities):
        raise GeometryError('Unknown animation renderer capability.')
    missing=sorted(set(sequence.get('tracks',{}))-capabilities)
    if missing:
        return {'supported':False,'diagnostic':'Saved '+', '.join(missing)+' tracks are retained; renderer adapters are unavailable.'}
    return {'supported':True,'diagnostic':None}
