"""Exact bounded FCC ball selection followed by its defining approximate hull."""
from copy import deepcopy
from fractions import Fraction
import hashlib
from itertools import product
import json
import math
import re
import sys

from .geometry import GeometryError, MAX_VERTICES, hull, identity, validate
from .history import _json_bytes, canonical_model
from .formats import validate_project

VERSION = '0.1.0'
MAX_RATIONAL_BITS = 256
MAX_COMMON_DENOMINATOR_BITS = 512
MAX_LITERAL_LENGTH = 256
MAX_INSPECTED_SITES = 1_000_000
MAX_SELECTED_POINTS = MAX_VERTICES
MAX_OUTPUT_VERTICES = 4000
MAX_LATTICE_COORDINATE = 1_000_000
MAX_PAYLOAD_BYTES = 64*1024*1024


def _rational(value, label):
    """Bound raw values before reducing; returned raw evidence uses safe text."""
    if type(value) is int:
        numerator, denominator = value, 1
        raw = {'kind':'integer', 'literal':None}
    elif type(value) is Fraction:
        numerator, denominator = value.numerator, value.denominator
        raw = {'kind':'Fraction', 'numerator':None, 'denominator':None}
    elif type(value) is dict:
        if set(value) != {'numerator','denominator'}:
            raise GeometryError(f'Waterman {label} rational object requires only numerator and denominator.')
        numerator, denominator = value['numerator'],value['denominator']
        raw = {'kind':'ratio-object', 'numerator':None, 'denominator':None}
    elif type(value) is str:
        if len(value)>MAX_LITERAL_LENGTH:
            raise GeometryError(f'Waterman {label} rational literal exceeds {MAX_LITERAL_LENGTH} characters.')
        match=re.fullmatch(r'\s*([+-]?[0-9]+)\s*(?:/\s*([+]?[0-9]+)\s*)?',value)
        if not match:
            raise GeometryError(f'Waterman {label} requires a literal integer or p/q with positive denominator.')
        numerator, denominator = int(match[1]),int(match[2]) if match[2] else 1
        raw={'kind':'literal', 'literal':value}
    else:
        raise GeometryError(f'Waterman {label} requires an exact integer, Fraction, rational literal or ratio object; floats and booleans are unsupported.')
    if type(numerator) is not int or type(denominator) is not int or denominator<=0:
        raise GeometryError(f'Waterman {label} requires integer numerator and positive integer denominator.')
    if max(abs(numerator).bit_length(),denominator.bit_length())>MAX_RATIONAL_BITS:
        raise GeometryError(f'Waterman {label} raw rational integers exceed the {MAX_RATIONAL_BITS}-bit arithmetic bound.')
    if raw['kind']=='integer':raw['literal']=str(numerator)
    elif raw['kind'] in ('Fraction','ratio-object'):
        raw.update(numerator=str(numerator),denominator=str(denominator))
    return Fraction(numerator,denominator),raw


def _measure_gate(model):
    measure=model.get('measure')
    if (type(measure) is not dict or measure.get('dimension')!=3
            or any(type(measure.get(key)) not in (int,float)
                   or not sys.float_info.min<=measure[key]<=sys.float_info.max or not math.isfinite(measure[key])
                   for key in ('content','boundaryMeasure'))):
        raise GeometryError('Waterman approximate convex measures must be finite positive normal float64 values.')


def _native_gate(model):
    before=canonical_model(model)
    before_metadata=_json_bytes(model['metadata'],MAX_PAYLOAD_BYTES)
    before_provenance=_json_bytes(model['provenance'],MAX_PAYLOAD_BYTES)
    project={'format':'polytope-laboratory','version':1,'active':0,'documents':[{
        'id':'waterman-native-gate','cursor':0,'states':[{'model':model,'view':{}}]}]}
    try:
        result=validate_project(json.loads(_json_bytes(project,MAX_PAYLOAD_BYTES)))['documents'][0]['states'][0]['model']
    except (ValueError,OverflowError,ArithmeticError) as exc:
        raise GeometryError('Waterman native convex project gate failed: '+str(exc)) from exc
    if (canonical_model(result)!=before or result['id']!=model['id']
            or _json_bytes(result['metadata'],MAX_PAYLOAD_BYTES)!=before_metadata
            or _json_bytes(result['provenance'],MAX_PAYLOAD_BYTES)!=before_provenance):
        raise GeometryError('Waterman native roundtrip changed source geometry, selected-point evidence or provenance.')
    _measure_gate(result)
    result['validation']=validate(result)
    if not result['validation']['passed']:
        raise GeometryError('Waterman native source validation failed after project roundtrip.')
    result['fingerprint']=identity(result)
    _json_bytes(result,MAX_PAYLOAD_BYTES)
    return result


def waterman_fcc(radius_squared=10, *, center=(0,0,0), **unsupported):
    """Hull of integer even-sum FCC sites in an exact rational closed ball.

    Coordinates remain in the original lattice frame. Selection is exact;
    ordered hull incidence, normals and measurements are float64 approximate.
    Unsupported keyword/color options reject rather than being ignored.
    """
    if unsupported:
        raise GeometryError('Unknown or unsupported Waterman parameters: '+', '.join(sorted(unsupported)))
    threshold,raw_threshold=_rational(radius_squared,'squared radius')
    if threshold<=0:
        raise GeometryError('Waterman squared radius must be positive.')
    if type(center) not in (list,tuple) or len(center)!=3:
        raise GeometryError('Waterman center requires exactly three rational coordinates.')
    parsed=[_rational(value,f'center coordinate {i}') for i,value in enumerate(center)]
    origin=[value for value,raw in parsed]
    if any(abs(value)>MAX_LATTICE_COORDINATE for value in origin):
        raise GeometryError('Waterman center exceeds the bounded lattice-coordinate domain.')
    denominator=math.lcm(*(value.denominator for value in origin))
    if denominator.bit_length()>MAX_COMMON_DENOMINATOR_BITS:
        raise GeometryError('Waterman origin common denominator exceeds the bounded arithmetic domain.')
    origin_numerators=[value.numerator*(denominator//value.denominator) for value in origin]
    extent=math.isqrt(threshold.numerator//threshold.denominator)
    if extent*extent*threshold.denominator<threshold.numerator:extent+=1
    bounds=[(math.floor(value)-extent,math.ceil(value)+extent) for value in origin]
    inspected=math.prod(hi-lo+1 for lo,hi in bounds)
    if inspected>MAX_INSPECTED_SITES:
        raise GeometryError(f'Waterman bounding box exceeds the {MAX_INSPECTED_SITES} inspected-site resource limit.')
    if any(max(abs(lo),abs(hi))>MAX_LATTICE_COORDINATE for lo,hi in bounds):
        raise GeometryError('Waterman bounding box exceeds the bounded lattice-coordinate domain.')
    selected,distances,boundary=[],[],[]
    origin_squared_denominator=denominator*denominator
    right=threshold.numerator*origin_squared_denominator
    for point in product(*(range(lo,hi+1) for lo,hi in bounds)):
        if sum(point)%2:continue
        squared=sum((coordinate*denominator-c)**2 for coordinate,c in zip(point,origin_numerators))
        left=squared*threshold.denominator
        if left<=right:
            if len(selected)>=MAX_SELECTED_POINTS:
                raise GeometryError(f'Waterman selected-point resource limit is {MAX_SELECTED_POINTS}.')
            if left==right:boundary.append(len(selected))
            selected.append(list(point))
            distances.append(str(Fraction(squared,origin_squared_denominator)))
    if len(selected)<4:
        raise GeometryError('Waterman ball selects fewer than four sites; a full 3D hull is unavailable.')
    source={'lattice':'FCC integer even coordinate sum','center':[str(value) for value in origin],
            'radiusSquared':str(threshold),'coordinates':selected}
    source_bytes=_json_bytes(source,MAX_PAYLOAD_BYTES)
    try:
        model=hull(selected,'FCC Waterman ball')
    except (ValueError,OverflowError,ArithmeticError) as exc:
        raise GeometryError('Waterman approximate full-dimensional hull failed: '+str(exc)) from exc
    if len(model['vertices'])>MAX_OUTPUT_VERTICES:
        raise GeometryError(f'Waterman output vertex resource limit is {MAX_OUTPUT_VERTICES}.')
    _measure_gate(model)
    hull_evidence=deepcopy(model['provenance'])
    output_to_source=list(hull_evidence['extremeInputIndices'])
    selected_to_output=[None]*len(selected)
    for output_id,source_id in enumerate(output_to_source):
        if model['vertices'][output_id]!=selected[source_id]:
            raise GeometryError('Waterman hull vertex mapping does not preserve its original lattice coordinate.')
        selected_to_output[source_id]=output_id
    nonextreme=[i for i,v in enumerate(selected_to_output) if v is None]
    model['numeric'].update(selectionArithmetic='exact bounded integer/Fraction squared distances',
                            selectionCertificateScope='ball membership only; hull predicates and measures remain approximate')
    model['provenance']={'operation':'waterman-fcc','algorithmVersion':VERSION,
        'parameters':{'radius_squared':str(threshold),'center':[str(value) for value in origin]},
        'rawInput':{'radius_squared':raw_threshold,'center':[raw for value,raw in parsed]},
        'definition':'convex hull of all integer even-sum FCC sites inside or on the exact rational ball; original lattice frame retained',
        'hullEvidence':hull_evidence}
    model['metadata']={'family':'Waterman','watermanFcc':{'schemaVersion':1,'algorithmVersion':VERSION,
        'sourceSnapshot':source,'sourceSnapshotSha256':hashlib.sha256(source_bytes).hexdigest(),
        'selectedPointCount':len(selected),'outputVertexToSelectedPoint':output_to_source,
        'selectedPointToOutputVertex':selected_to_output,'nonextremeSelectedPointIds':nonextreme,
        'facetSelectedPointIds':[[output_to_source[v] for v in face] for face in model['facetVertices']],
        'faceSelectedPointCycles':[[output_to_source[v] for v in face] for face in model['faces']],
        'selectionCertificate':{'property':'complete FCC membership in the supplied closed rational ball',
            'arithmetic':'bounded exact integers/Fraction','certified':True,'exhausted':True,
            'originCommonDenominator':str(denominator),
            'originScaledNumerators':[str(value) for value in origin_numerators],
            'thresholdNumerator':str(threshold.numerator),'thresholdDenominator':str(threshold.denominator),
            'membershipRule':'sum((site*D-originNumerator)^2) * thresholdDenominator <= thresholdNumerator * D^2',
            'projectionRadiusIntegerCeiling':extent,'boundingBox':[list(pair) for pair in bounds],
            'inspectedBoxSiteCount':inspected,'latticeRule':'x+y+z is even',
            'selectedSquaredDistances':distances,'boundarySelectedPointIds':boundary,
            'doesNotCertify':['convex hull topology','float64 supports','float64 measures','Stella sequences or 4D variants']},
        'rootDefinition':'centered author root N means squared radius 2*N; this API accepts squared radius directly',
        'coordinateDefinition':'original integer lattice coordinates, no translation to sphere center or automatic scale',
        'resourceBounds':{'inspectedBoxSites':MAX_INSPECTED_SITES,'selectedPoints':MAX_SELECTED_POINTS,
                          'outputVertices':MAX_OUTPUT_VERTICES,'rawRationalBits':MAX_RATIONAL_BITS,
                          'originCommonDenominatorBits':MAX_COMMON_DENOMINATOR_BITS,
                          'absoluteLatticeCoordinate':MAX_LATTICE_COORDINATE,'payloadBytes':MAX_PAYLOAD_BYTES},
        'sourceModelId':model['id'],'sourceFingerprint':identity(model),
        'evidenceScope':'generated source only; output maps apply while current geometry matches sourceFingerprint'}}
    return _native_gate(model)


def centered_waterman_root(root=5, **unsupported):
    """Standard sphere-center author root N: exact squared radius 2*N."""
    if unsupported:
        raise GeometryError('Unknown or unsupported centered Waterman root parameters: '+', '.join(sorted(unsupported)))
    if type(root) is not int or root<=0 or root.bit_length()>MAX_RATIONAL_BITS-1:
        raise GeometryError('Centered Waterman root must be a positive bounded integer.')
    model=waterman_fcc(2*root)
    model['name']=f'Centered FCC Waterman root {root}'
    model['provenance'].update(operation='centered-waterman-root',
        parameters={'root':root,'radius_squared':str(2*root),'center':['0','0','0']})
    model['metadata']['watermanFcc']['authorRoot']=root
    return _native_gate(model)
