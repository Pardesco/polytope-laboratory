"""Literal coordinate reflection, retaining ordered source incidence and owners."""
from copy import deepcopy
import hashlib
import json
import math
import uuid
from .geometry import GeometryError, identity, validate
from .dual_morph_expansion import _clone

VERSION='0.1.0'
KINDS=('vertices','edges','faces','cells')

def _require(value,message):
    if not value:raise GeometryError(message)

def attributes_hash(model):
    # Native/JavaScript persistence can spell a supplied number as 1.0 or 1.
    # Bind its numeric value while retaining booleans and every other attribute.
    def numbers(value):
        if type(value) is dict:return {k:numbers(v) for k,v in value.items()}
        if type(value) is list:return [numbers(v) for v in value]
        if type(value) is float and value.is_integer():return int(value)
        return value
    return hashlib.sha256(json.dumps(numbers(model),sort_keys=True,separators=(',',':'),allow_nan=False).encode()).hexdigest()

def reflect_source(model,axis=0):
    source=_clone(model)
    _require(type(source) is dict and source.get('dimension')==3 and source.get('embeddingDimension',3)==3 and source.get('interpretation') in ('convex-polytope','generalized-complex'),
             'Source reflection requires a finite intrinsic 3D convex or generalized source.')
    _require(type(axis) is int and 0<=axis<3,'Source reflection axis is an integer 0, 1 or 2.')
    _require(len(json.dumps(source,allow_nan=False).encode())<=8*1024*1024 and len(source.get('vertices',[]))<=20000 and len(source.get('faces',[]))<=32000,'Source reflection exceeds its bounded source work limits.')
    _require(type(source.get('id')) is str and type(source.get('name')) is str and validate(source)['passed'],'Source reflection needs named valid literal incidence.')
    _require(all(type(p) is list and len(p)==3 and all(type(x) in (int,float) and math.isfinite(x) for x in p) for p in source['vertices']),
             'Source reflection coordinates must be finite literal XYZ numbers.')
    fingerprint=identity(source)
    _require(source.get('fingerprint',fingerprint)==fingerprint,'Source reflection fingerprint differs from literal geometry.')
    result=deepcopy(source)
    for p in result['vertices']:p[axis]=-p[axis]
    # Retain the exact cycle spelling, not just an equivalent reversed cycle.
    # Its spatial orientation changes under this declared determinant -1 map.
    for equation in result.get('facetEquations',[]):equation[axis]=-equation[axis]
    for field in ('rationalCoordinates','rationalFacetEquations','certificate'):
        result.pop(field,None)
    result['numeric']={**source.get('numeric',{}),'mode':'float64-approximate','certified':False,
        'inputInterpretation':'Literal coordinate sign reflection; any prior rational certificate remains historical in source history.'}
    source_hash=attributes_hash(source)
    result['id']=str(uuid.uuid5(uuid.NAMESPACE_URL,'polytope-source-reflection:'+source_hash+':'+str(axis)))
    result['name']='Reflected '+source['name']
    matrix=[[(-1 if i==axis else 1) if i==j else 0 for j in range(3)] for i in range(3)]
    receipt={'version':1,'sourceModelId':source['id'],'sourceFingerprint':fingerprint,'sourceAttributesSha256':source_hash,
        'axis':axis,'matrix':matrix,'determinant':-1,'plane':'coordinate axis '+str(axis)+' equals zero',
        'maps':{kind:list(range(len(source.get(kind,[])))) for kind in KINDS},
        'orderedCyclesPreserved':True,'handedness':'Reflected relative to the complete source; absolute left/right is not inferred.',
        'chiralityClaim':'Reflection alone does not prove distinct enantiomorphs.'}
    result.setdefault('metadata',{})['sourceReflection']=deepcopy(receipt)
    variant=source.get('metadata',{}).get('uniformSnubVariant')
    if variant:
        result['metadata']['uniformSnubVariant']={**deepcopy(variant),'form':'reflected' if variant['form']=='source' else 'source',
            'reflectionParity':1-int(variant.get('reflectionParity',0)),
            'labelBasis':'Parity relative to pinned provider coordinates; not an absolute left/right convention.'}
        result['metadata']['key']=variant['sourceKey']+('-mirror' if result['metadata']['uniformSnubVariant']['form']=='reflected' else '')
        result['metadata']['enantiomorph']=result['metadata']['uniformSnubVariant']['form']
    result['provenance']={'operation':'reflect-source','algorithmVersion':VERSION,'convexified':False,
        'sourceProvenance':deepcopy(source.get('provenance',{})),'sourceReflection':deepcopy(receipt)}
    result['fingerprint']=identity(result);result['validation']=validate(result)
    _require(result['validation']['passed'],'Reflected literal source incidence failed validation.')
    return result

def dispatch_source_reflection(request):
    _require(type(request) is dict and not set(request)-{'op','params','model','id'} and request.get('op')=='reflect-source',
             'Source reflection needs its strict native operation envelope.')
    params=request.get('params')
    _require(type(params) is dict and set(params)=={'axis'},'Source reflection requires exactly params.axis.')
    return reflect_source(request.get('model'),params['axis'])

def verify_reflection_replay(parent,computed,expected):
    from .history import _source_hash
    fields=('name','dimension','embeddingDimension','interpretation','vertices','edges','faces','cells','metadata','numeric','provenance')
    _require(_source_hash({k:computed['model'].get(k) for k in fields})==_source_hash({k:expected['model'].get(k) for k in fields}),
             'Source reflection attributes, colors or handedness receipt do not replay.')
    _require(computed.get('notes','')==parent.get('notes','') and computed['view'].get('coordinateUnit','model')==parent['view'].get('coordinateUnit','model'),
             'Source reflection notes or units do not replay from the actual parent.')
