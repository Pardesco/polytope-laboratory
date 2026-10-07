"""Bounded numerical geometry fitting with literal source incidence."""
from copy import deepcopy
import hashlib
import json
import math

import numpy as np
import scipy
from scipy.optimize import least_squares

from engine.geometry import GeometryError, identity, validate
from engine.dual_morph_expansion import EPS, _clone, _plane
from engine.static_expansion4d import _cell_volume

VERSION='0.1.0'
LIMITS={'vertices':64,'faces':256,'cells':128,'faceVertices':32,'pairs':8192,
        'evaluations':400,'residualCalls':12000,'sourceBytes':8*1024*1024,'normalizedCoordinate':10000}
MODES=('regular-faces','equal-edges','equal-areas')


def _digest(value):
    return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':'),allow_nan=False).encode()).hexdigest()


def _number(value,label,low,high):
    if type(value) not in (int,float) or not math.isfinite(value) or not low<=value<=high:
        raise GeometryError(label+' is outside its finite numerical domain.')
    return float(value)


def _area(cloud):
    anchor=cloud[0];value=0.0
    for i in range(1,len(cloud)-1):
        a,b=cloud[i]-anchor,cloud[i+1]-anchor
        value+=math.sqrt(max(0,float((a@a)*(b@b)-(a@b)**2)))/2
    return value


def _qualify(model,origin):
    """Check actual supporting incidence; never reconstruct a hull."""
    if not validate(model)['passed']:raise GeometryError('Literal fitted boundary failed native validation.')
    p=np.asarray(model['vertices'],dtype=float);scale=float(np.max(np.ptp(p,axis=0)))
    if not math.isfinite(scale) or scale<=0:raise GeometryError('Fitted boundary scale vanished.')
    d=model['dimension'];facets=[];planes=[];boundary=content=0.0
    for element in (model['faces'] if d==3 else model['cells']):
        ids=list(element) if d==3 else sorted({v for f in element for v in model['faces'][f]})
        normal,height=_plane(p,ids,origin,scale)
        amount=_area((p[ids]-origin)/scale) if d==3 else _cell_volume((p-origin)/scale,ids,[model['faces'][f] for f in element])
        boundary+=amount;content+=amount*(height/scale)/d
        facets.append(ids);planes.append([*map(float,normal),-float(height+normal@origin)])
    try:boundary*=scale**(d-1);content*=scale**d
    except OverflowError as error:raise GeometryError('Fitted measures overflowed.') from error
    if not all(math.isfinite(x) and x>=np.finfo(float).tiny for x in (boundary,content)):
        raise GeometryError('Fitted boundary measures are unresolved.')
    model.update(facetVertices=facets,facetEquations=planes,measure={'content':content,'boundaryMeasure':boundary,'dimension':d,
                 'units':'model-units','method':'supporting-boundary integration','certified':False})
    if not validate(model)['passed']:raise GeometryError('Fitted supporting table failed native validation.')


def _options(raw,source):
    if type(raw) is not dict or set(raw)-{'mode','target','face_ids','max_evaluations','residual_tolerance','solver_tolerance'}:
        raise GeometryError('Fitting accepts mode, target, face_ids and bounded convergence controls only.')
    mode=raw.get('mode','regular-faces')
    if mode not in MODES:raise GeometryError('Choose a supported geometric fitting mode.')
    target=raw.get('target')
    if target is not None:target=_number(target,'Fitting target',1e-100,1e100)
    if mode=='regular-faces' and target is not None:raise GeometryError('Regular-face fitting uses the source RMS radius to fix scale.')
    selected=raw.get('face_ids')
    if selected is None:selected=list(range(len(source['faces'])))
    if type(selected) is not list or not selected or any(type(i) is not int or not 0<=i<len(source['faces']) for i in selected) or len(set(selected))!=len(selected):
        raise GeometryError('Selected regular faces require distinct literal source face IDs.')
    if mode!='regular-faces' and raw.get('face_ids') is not None:raise GeometryError('Face selection applies only to regular-face fitting.')
    maximum=raw.get('max_evaluations',100)
    if type(maximum) is not int or not 1<=maximum<=LIMITS['evaluations']:raise GeometryError('Fitting evaluations must be a literal integer from 1 to 400.')
    return {'mode':mode,'target':target,'face_ids':selected if mode=='regular-faces' else None,'max_evaluations':maximum,
            'residual_tolerance':_number(raw.get('residual_tolerance',1e-7),'Residual tolerance',1e-10,1e-3),
            'solver_tolerance':_number(raw.get('solver_tolerance',1e-11),'Solver tolerance',1e-13,1e-3)}


class _WorkLimit(Exception):pass


def fit_geometry(source,options=None,*,cancel=None):
    original=_clone(source);source_digest=_digest(original);options_digest=_digest(options)
    if len(json.dumps(original).encode())>LIMITS['sourceBytes']:raise GeometryError('Fitting source exceeds 8 MiB.')
    if type(original) is not dict or original.get('dimension') not in (3,4) or original.get('embeddingDimension',original.get('dimension'))!=original.get('dimension') or original.get('interpretation')!='convex-polytope':
        raise GeometryError('Fitting requires an intrinsic closed convex 3D or 4D source.')
    for key in ('vertices','faces','cells'):
        if type(original.get(key)) is not list or len(original[key])>LIMITS[key]:raise GeometryError('Fitting source '+key+' exceeds its work bound.')
    if len(original['vertices'])<original['dimension']+1 or any(type(v) is not list or len(v)!=original['dimension'] or
            any(type(x) not in (int,float) or not math.isfinite(x) or abs(x)>1e100 for x in v) for v in original['vertices']):
        raise GeometryError('Fitting requires bounded finite literal source coordinates.')
    if any(len(face)>LIMITS['faceVertices'] for face in original['faces']):raise GeometryError('Fitting face exceeds 32 vertices.')
    args=_options({} if options is None else options,original)
    points=np.asarray(original['vertices'],dtype=float);origin=points.mean(axis=0)
    check=deepcopy(original);_qualify(check,origin)
    edges=np.asarray(original['edges'],dtype=int);scale=float(np.mean(np.linalg.norm(points[edges[:,0]]-points[edges[:,1]],axis=1)))
    if not math.isfinite(scale) or scale<=np.finfo(float).tiny:raise GeometryError('Fitting edge normalization is unresolved.')
    initial=(points-origin)/scale;d=original['dimension'];faces=original['faces']
    cells=[sorted({v for f in cell for v in faces[f]}) for cell in original['cells']] if d==4 else []
    pairs=[]
    if args['mode']=='regular-faces':
        for fi in args['face_ids']:
            face=faces[fi];n=len(face)
            for i in range(n):
                for j in range(i+1,n):pairs.append((fi,face[i],face[j],math.sin(math.pi*(j-i)/n)/math.sin(math.pi/n)))
        if len(pairs)>LIMITS['pairs']:raise GeometryError('Regular-face chord work exceeds 8192 pairs.')
    target=args['target']
    if args['mode']=='equal-edges':target=1.0 if target is None else target/scale
    elif args['mode']=='equal-areas':target=float(np.mean([_area(initial[f]) for f in faces])) if target is None else target/(scale*scale)
    rms_radius=float(np.sqrt(np.mean(np.sum(initial*initial,axis=1))))
    calls=0;best=initial.copy();best_energy=math.inf
    def checkpoint(full=False):
        if cancel is not None and cancel():raise GeometryError('Geometry fitting canceled; no model published.')
        if full and (_digest(source)!=source_digest or _digest(options)!=options_digest):
            raise GeometryError('Fitting source attributes or controls changed; no model published.')
    def residual_parts(p):
        if args['mode']=='equal-edges':objective=(np.linalg.norm(p[edges[:,0]]-p[edges[:,1]],axis=1)-target)/target
        elif args['mode']=='equal-areas':objective=np.asarray([(_area(p[f])-target)/target for f in faces])
        else:
            sides={fi:float(np.mean(np.linalg.norm(p[faces[fi]]-np.roll(p[faces[fi]],-1,axis=0),axis=1))) for fi in args['face_ids']}
            objective=np.asarray([float(np.linalg.norm(p[a]-p[b]))-factor*sides[fi] for fi,a,b,factor in pairs])
        planar=[]
        for ids,rank in [(f,2) for f in faces]+[(c,3) for c in cells]:
            cloud=p[ids]-p[ids].mean(axis=0);_,_,basis=np.linalg.svd(cloud,full_matrices=False)
            planar.extend((cloud-cloud@basis[:rank].T@basis[:rank]).ravel())
        anchor=p.mean(axis=0).tolist()
        if args['mode']=='regular-faces':anchor.append(float(np.sqrt(np.mean(np.sum(p*p,axis=1))))-rms_radius)
        return objective,np.asarray(planar),np.asarray(anchor)
    def fun(x):
        nonlocal calls,best,best_energy
        checkpoint();calls+=1
        if calls>LIMITS['residualCalls']:raise _WorkLimit()
        p=x.reshape((-1,d));objective,planar,anchor=residual_parts(p)
        residual=np.concatenate((objective,planar*10,anchor));energy=float(residual@residual)
        if energy<best_energy:best_energy=energy;best=p.copy()
        return residual
    before=residual_parts(initial)[0]
    termination={'success':False,'status':0,'message':'residual-call limit','evaluations':0}
    try:
        solved=least_squares(fun,initial.ravel(),method='trf',tr_solver='lsmr',jac='2-point',max_nfev=args['max_evaluations'],
            bounds=(-LIMITS['normalizedCoordinate'],LIMITS['normalizedCoordinate']),
            ftol=args['solver_tolerance'],xtol=args['solver_tolerance'],gtol=args['solver_tolerance'])
        termination={'success':bool(solved.success),'status':int(solved.status),'message':str(solved.message),'evaluations':int(solved.nfev)}
    except _WorkLimit:termination['evaluations']=calls
    checkpoint(full=True);best-=best.mean(axis=0);objective,planar,anchor=residual_parts(best)
    residuals={'initialMaximum':float(np.max(np.abs(before))),'maximum':float(np.max(np.abs(objective))),
               'rms':float(np.sqrt(np.mean(objective*objective))),'maximumPlanarity':float(np.max(np.abs(planar))),
               'maximumAnchor':float(np.max(np.abs(anchor)))}
    satisfied=residuals['maximum']<=args['residual_tolerance'] and residuals['maximumAnchor']<=args['residual_tolerance']
    candidate=deepcopy(original);candidate['vertices']=(origin+best*scale).tolist()
    for key in ('facetEquations','facetVertices','measure','validation','fingerprint','rationalCoordinates','rationalFacetEquations'):
        candidate.pop(key,None)
    candidate['numeric']={'mode':'float64-approximate','certified':False,'tolerance':EPS}
    valid=True;diagnostics=[]
    try:_qualify(candidate,origin)
    except GeometryError as error:valid=False;diagnostics.append(str(error))
    evidence={'algorithmVersion':VERSION,'sourceModelId':original.get('id'),'sourceFingerprint':identity(original),
        'sourceSnapshotSha256':source_digest,'parameters':args,'resolvedTarget':None if target is None else target*scale**(2 if args['mode']=='equal-areas' else 1),
        'normalization':{'origin':origin.tolist(),'meanEdgeLength':scale},'residuals':residuals,'solverTermination':termination,
        'requestedConstraintsSatisfied':satisfied,'geometricValidity':{'passed':valid,'diagnostics':diagnostics},
        'work':{'residualCalls':calls,'requestedEvaluations':args['max_evaluations']},'limits':dict(LIMITS),
        'backend':{'scipy':scipy.__version__,'numpy':np.__version__,'solver':'least_squares/trf/lsmr/2-point'},
        'uniformityEstablished':False,'globalFeasibilityEstablished':False,'certified':False,'hullRepair':False}
    status='invalid-realization' if not valid else 'constraints-satisfied' if satisfied else 'stationary-residual' if termination['success'] else 'work-limit'
    if valid:
        candidate.update(id='fit-'+_digest({'source':source_digest,'parameters':args,'vertices':candidate['vertices']}),
            name='Fitted '+original.get('name','source'),provenance={'operation':'geometry-fit','algorithmVersion':VERSION,
                'sourceModelId':original.get('id'),'sourceSnapshotSha256':source_digest,'parameters':args,'convexified':False})
        metadata=original.get('metadata',{})
        candidate['metadata']={'geometryFitting':deepcopy(evidence),'sourceMetadata':deepcopy(metadata)}
        for key in ('coordinateUnits','offColors'):
            if key in metadata:candidate['metadata'][key]=deepcopy(metadata[key])
        candidate['fingerprint']=identity(candidate);candidate['validation']=validate(candidate)
    checkpoint(full=True)
    return {'status':status,'model':candidate if valid else None,'evidence':evidence,
            'preview':None if valid else {'vertices':candidate['vertices'],'publishable':False},'certified':False}


def dispatch_geometry_fit(request):
    if type(request) is not dict or set(request)-{'op','params','model','id','algorithmVersion'} or request.get('op') not in ('geometry-fit','geometry-fit-preview'):
        raise GeometryError('Fitting requires a supported source request.')
    if request.get('algorithmVersion',VERSION)!=VERSION:raise GeometryError('Unsupported fitting algorithm version.')
    raw=request.get('params',{})
    if type(raw) is not dict:raise GeometryError('Fitting parameters require a plain object.')
    params=deepcopy(raw);adoption=params.pop('adoption','constraints-satisfied')
    if adoption not in ('constraints-satisfied','valid-near-miss'):raise GeometryError('Unsupported fitting adoption policy.')
    try:
        result=fit_geometry(request.get('model'),params)
        if request['op']=='geometry-fit-preview':return result
        if result['model'] is None:raise GeometryError('Fitted candidate is invalid; no model adopted. '+'; '.join(result['evidence']['geometricValidity']['diagnostics']))
        if not result['evidence']['requestedConstraintsSatisfied'] and adoption!='valid-near-miss':
            raise GeometryError('Fitting targets remain unresolved; preview residuals and explicitly accept a valid near miss.')
        result['model']['metadata']['geometryFitting']['adoption']=adoption
        return result['model']
    except GeometryError:raise
    except (TypeError,ValueError,KeyError,IndexError,ArithmeticError,np.linalg.LinAlgError) as error:
        raise GeometryError('Malformed or numerically unresolved fitting request.') from error
