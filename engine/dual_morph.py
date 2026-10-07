"""Read-only production runtime: strict read-only preparation/evaluation and storage."""
from copy import deepcopy
import hashlib
import json
import math
from .geometry import GeometryError, identity
from .dual_morph_expansion import prepare_dual_morph, _clone
from .dual_morph_sizing import prepare_sizing
from .dual_morph_generalized_sizing import prepare_generalized_sizing
from .dual_morph_generalized_expansion import prepare_generalized_expansion
from .dual_morph_generalized_expansion_4d import prepare_generalized_expansion_4d
from .dual_morph_truncation import prepare_truncation
from .dual_morph_augmentation import prepare_augmentation
from .dual_morph_triangles import prepare_tilting_triangles
from .dual_morph_compound import prepare_tilting_compound
from .dual_morph_rectify import prepare_tilting_rectify

VERSION='0.1.0-development'
INVENTORY=('sizing','truncation','augmentation','expansion','tilting-quads','tilting-triangles','tilting-to-compound','tilting-to-rectify','via-snub')
SUPPORTED=('sizing','truncation','augmentation','expansion','tilting-quads','tilting-triangles','tilting-to-compound','tilting-to-rectify')


def require(value,message):
    if not value:raise GeometryError(message)


def digest(value):return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':'),allow_nan=False).encode()).hexdigest()


def normalize_settings(model,value):
    require(type(value) is dict and not set(value)-{'version','enabled','method','center','radius','ratio','duration','loop'},'Saved dual morph has unsupported fields.')
    result=_clone(value);require(result.get('version')==1 and type(result.get('version')) is int,'Saved dual morph version is unsupported.')
    require(type(result.get('enabled')) is bool and type(result.get('loop')) is bool,'Saved dual morph enabled/loop must be boolean.')
    require(result.get('method') in INVENTORY,'Unknown dual-morph method.')
    d=model.get('embeddingDimension',model.get('dimension'))
    center=result.get('center');require(center is None or type(center) is list and len(center)==d and all(type(x) in (int,float) and math.isfinite(x) for x in center),'Saved dual morph center has the wrong dimension/nonfinite data.')
    v=result.get('radius');require(type(v) in (int,float) and math.isfinite(v) and v>0 and math.isfinite(v*v) and v*v>0,'Saved dual morph radius squared overflowed/vanished.')
    v=result.get('duration');require(type(v) in (int,float) and math.isfinite(v) and 0<v<=3600,'Saved dual morph duration is outside (0,3600].')
    v=result.get('ratio');require(type(v) in (int,float) and math.isfinite(v) and 0<=v<=1,'Saved dual morph ratio is outside [0,1].')
    return result


def source_context(value):
    require(type(value) is dict and set(value)=={'notes','unit'} and type(value['notes']) is str and value['unit'] in ('model','mm','cm','m','in','ft'),'Dual morph needs literal notes/effective units.')
    return _clone(value)


def prepare(model,settings,context):
    settings=normalize_settings(model,settings);require(settings['method'] in SUPPORTED,'This inventoried morph method is not implemented; source settings remain readable.')
    context=source_context(context);state={'model':model,'view':{'coordinateUnit':context['unit']},'notes':context['notes']}
    method=settings['method'];factory=(prepare_generalized_sizing if model.get('interpretation')=='generalized-complex' else prepare_sizing) if method=='sizing' else prepare_truncation if method=='truncation' else prepare_augmentation if method=='augmentation' else prepare_tilting_triangles if method=='tilting-triangles' else prepare_tilting_compound if method=='tilting-to-compound' else prepare_tilting_rectify if method=='tilting-to-rectify' else ((prepare_generalized_expansion_4d if model.get('dimension')==4 else prepare_generalized_expansion) if method=='expansion' and model.get('interpretation')=='generalized-complex' else prepare_dual_morph)
    plan=factory(state,center=settings['center'],radius=settings['radius']);descriptor=plan.descriptor()
    settings['center']=descriptor['center']
    prepared={'version':1,'algorithmVersion':VERSION,'settings':settings,'sourceModelId':model.get('id'),
              'sourceFingerprint':identity(model),'sourceAttributesSha256':digest(_clone(model)),
              'sourceContextSha256':digest(context),'descriptorSha256':digest(descriptor),'descriptor':descriptor}
    return plan,prepared


def endpoint_maps(model,component):
    d=model['dimension'];rank_names=('vertices','edges','faces','cells')
    return {kind:[{'component':component,'sourceRank':rank if component=='source' else d-1-rank,'sourceElement':i} for i in range(len(model.get(kind,[])))] for rank,kind in enumerate(rank_names)}


def dispatch_dual_morph(request):
    require(type(request) is dict and not set(request)-{'op','params','model','id'} and type(request.get('model')) is dict and type(request.get('params')) is dict,'Dual morph requires a strict native model/params envelope.')
    params=request['params'];model=request['model'];op=request.get('op')
    if op=='prepare-dual-morph':
        require(set(params)=={'settings','sourceContext'},'Dual morph preparation requires settings/sourceContext.')
        _,prepared=prepare(model,params['settings'],params['sourceContext']);return prepared
    require(op=='evaluate-dual-morph' and set(params)=={'prepared','ratio','sourceContext'},'Dual morph evaluation requires prepared/ratio/sourceContext.')
    prepared=params['prepared'];require(type(prepared) is dict,'Dual morph prepared record must be an object.')
    ratio=params['ratio'];require(type(ratio) in (int,float) and math.isfinite(ratio) and 0<=ratio<=1,'Dual morph ratio must lie between zero and one.')
    plan,rebuilt=prepare(model,prepared.get('settings'),params['sourceContext'])
    require(prepared==rebuilt,'Dual morph preparation/source attributes/units/notes changed or its coefficients were forged.')
    method=rebuilt['settings']['method'];frame=plan.evaluate(method,ratio) if method in ('expansion','tilting-quads') else plan.evaluate(ratio)
    if frame['endpoint']:frame['sourceMaps']=endpoint_maps(frame['model'],'source' if ratio==0 else 'dual')
    frame['binding']={key:rebuilt[key] for key in ('sourceModelId','sourceFingerprint','sourceAttributesSha256','sourceContextSha256','descriptorSha256')}
    frame['settings']=deepcopy(rebuilt['settings']);frame['settings']['ratio']=float(ratio)
    return _clone(frame)
