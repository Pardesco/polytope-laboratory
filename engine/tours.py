"""Bounded instant/animated tours; native projects qualify retained snapshots.

Animation and transition data describe presentation, never source geometry.
Readable saved data does not certify renderer availability or a complete export.
"""
import math
import json

from .geometry import GeometryError
from .history import _json_bytes

MAX_EVENTS=100
MAX_EVENT_BYTES=32*1024*1024
MAX_BYTES=128*1024*1024
MAX_DURATION=3600
TRANSITION_METHODS=('instant','sideways','orbit','shrink-grow','explode-grow',
                    'shrink-implode','explode-implode','combination')
TRANSITION_DEFAULTS={'version':1,'method':'instant','duration':0,
    'easing':'smoothstep','angle':0,'distance':2,'tilt':0,'orbits':1,'spin':0,
    'explosionSize':3,'direction':1,'components':[]}


def _bounded_json(value,limit):
    # The shared traversal encodes strings before its serializer guard. Keep
    # malformed UTF-8 and excessive Python numeric inputs structured here too.
    try:
        return _json_bytes(value,limit)
    except GeometryError:
        raise
    except (UnicodeError,RecursionError,OverflowError,ValueError) as exc:
        raise GeometryError('Tours require bounded finite UTF-8 JSON data.') from exc


def _number(value,minimum,maximum,label):
    if (type(value) not in (int,float) or not minimum<=value<=maximum
            or not math.isfinite(value)):
        raise GeometryError(f'{label} must be finite and between {minimum} and {maximum}.')


def _view_numbers(view):
    # The existing frozen display validator calls math.isfinite directly.
    # Preflight its numeric fields without editing/normalizing retained views,
    # so huge Python integer JSON inputs cannot leak an OverflowError.
    fields=('surfaceOpacity','sectionOffset','rotationSpeed','perspectiveDistance4D',
            'perspectiveNear4D','explosionAmount','foldFraction','vertexRadius',
            'edgeRadius','cellShrink')
    values=[(field,view[field]) for field in fields if field in view]
    if type(view.get('angles')) is list:
        values.extend(('rotation angle',angle) for angle in view['angles'])
    for label,value in values:
        _number(value,-float.fromhex('0x1.fffffffffffffp+1023'),
                float.fromhex('0x1.fffffffffffffp+1023'),'Saved '+label)


def _transition(value):
    """Check the JS transition contract without replacing supplied options.

    Missing method/duration (and their explicit JSON null forms) have the JS
    nullish defaults. Other missing fields use the recorded frontend defaults.
    The original record remains authoritative for roundtrip preservation.
    """
    if type(value) is not dict or any(key not in TRANSITION_DEFAULTS for key in value):
        raise GeometryError('Tour transitions require supported versioned option records.')
    options={**TRANSITION_DEFAULTS,**value}
    method=value.get('method')
    if method is None:method='instant'
    options['method']=method
    duration=value.get('duration')
    if duration is None:duration=0 if method=='instant' else .5
    options['duration']=duration
    if (type(options['version']) not in (int,float) or options['version']!=1
            or type(method) is not str or method not in TRANSITION_METHODS):
        raise GeometryError('Unsupported tour transition version or method.')
    _number(duration,0,60,'Transition duration')
    if (method=='instant' and duration!=0) or (method!='instant' and duration==0):
        raise GeometryError('Instant transitions require zero duration; animated transitions require positive duration.')
    if type(options['easing']) is not str or options['easing'] not in ('linear','smoothstep','smootherstep'):
        raise GeometryError('Unsupported tour transition easing.')
    for key,minimum,maximum in [('angle',-360,360),('distance',0,100),
            ('tilt',-180,180),('orbits',0,100),('spin',0,100),('explosionSize',1,100)]:
        _number(options[key],minimum,maximum,'Transition '+key)
    if type(options['direction']) not in (int,float) or options['direction'] not in (-1,1):
        raise GeometryError('Transition direction must be 1 or -1.')
    components=options['components']
    if type(components) is not list or len(components)>4:
        raise GeometryError('Transition components require at most four supported methods.')
    if method=='combination':
        allowed=TRANSITION_METHODS[1:-1]
        if (not components or any(type(item) is not str or item not in allowed for item in components)
                or len(set(components))!=len(components)):
            raise GeometryError('Combination transitions require distinct supported component methods.')
        if sum('explode' in item or 'implode' in item for item in components)>1:
            raise GeometryError('A combination transition allows only one explosion component.')
    elif components:
        raise GeometryError('Only combination transitions accept component methods.')


def validate_tour_transition(value):
    """Detach a syntax-valid transition, preserving every supplied option.

    This is a storage validation API, not geometric/render/export preflight.
    """
    detached=json.loads(_bounded_json(value,MAX_EVENT_BYTES))
    _transition(detached)
    return detached


def tour_documents(tour):
    """Return auxiliary documents referring to actual retained event states.

    Formats must validate geometry/caches/certificates for these states, while
    operationNode here remains inert source lineage without a document graph.
    """
    if tour is None:
        return []
    _bounded_json(tour,MAX_BYTES)
    if (type(tour) is not dict or set(tour)!={'version','events','cursor'}
            or type(tour['version']) is not int or tour['version'] not in (1,2)
            or type(tour['events']) is not list or len(tour['events'])>MAX_EVENTS):
        raise GeometryError('Tours require version 1 or 2 and at most 100 events.')
    events=tour['events'];cursor=tour['cursor']
    if type(cursor) is not int or (not 0<=cursor<len(events) if events else cursor!=0):
        raise GeometryError('Invalid tour cursor.')
    ids=set();documents=[]
    for index,event in enumerate(events):
        _bounded_json(event,MAX_EVENT_BYTES)
        if type(event) is not dict or set(event)!={'id','state','duration','transition'}:
            raise GeometryError(f'Tour event {index} has an invalid record.')
        event_id=event['id'];duration=event['duration'];state=event['state']
        if type(event_id) is not str or not 1<=len(event_id)<=128 or event_id in ids:
            raise GeometryError('Tour event IDs must be unique strings of 1–128 characters.')
        ids.add(event_id)
        if (type(duration) not in (int,float) or not 0<duration<=MAX_DURATION
                or not math.isfinite(duration)):
            raise GeometryError('Tour duration must be greater than zero and at most 3600 seconds.')
        if tour['version']==1:
            if event['transition']!='instant':
                raise GeometryError('Version 1 tours require literal instant transitions.')
        else:
            _transition(event['transition'])
        if type(state) is not dict or type(state.get('model')) is not dict or type(state.get('view')) is not dict:
            raise GeometryError('Tour events require saved model and view snapshots.')
        if tour['version']==2:
            _view_numbers(state['view'])
            if 'animation' in state['view']:
                from .animation_state import validate_animation_sequence
                validate_animation_sequence(state['view']['animation'])
        documents.append({'cursor':0,'states':[state]})
    return documents


def validate_tour(tour):
    """Detach and authoritatively rebuild standalone imported tour snapshots."""
    if tour is None:
        raise GeometryError('A saved tour record is required.')
    detached=json.loads(_bounded_json(tour,MAX_BYTES))
    tour_documents(detached)
    # Lazy import avoids formats -> tours -> formats initialization cycles.
    from .formats import validate_project
    for event in detached['events']:
        state=event['state']
        has_lineage='operationNode' in state
        lineage=state.pop('operationNode',None)
        has_prior_source='sourceOperationNode' in state
        prior_source=state.get('sourceOperationNode')
        if has_lineage:state['sourceOperationNode']=lineage
        validate_project({'format':'polytope-laboratory','version':1,'active':0,
                          'documents':[{'cursor':0,'states':[state]}]})
        if has_lineage:
            state['operationNode']=lineage
            if has_prior_source:state['sourceOperationNode']=prior_source
            else:state.pop('sourceOperationNode',None)
    tour_documents(detached)
    return detached
