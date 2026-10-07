# Persisted v0.1 solver: deterministic work budget, no clock.
# Independent frozen initial candidate remains development/spring_relaxation.py.
# Integral JSON number normalization follows the native portable binding policy.
"""Versioned spring-network numeric core; no Stella description grammar.

Minimize explicit Hookean pair-distance energy using a bounded sparse solver.
An optimizer stopping, small stress, a valid native boundary, and uniformity
are separate assertions. Literal source incidence is never replaced by Hull.
"""
from collections import Counter, defaultdict
from copy import deepcopy
import hashlib
import json
import math
import scipy

import numpy as np
from scipy.optimize import least_squares
from scipy.sparse import csr_matrix

from engine.geometry import GeometryError, identity, validate
from engine.history import _json_bytes as _native_json_bytes
from engine.augmentation_workflow import equivalent_json
from engine.compounds import _colors

VERSION='0.1.0'
LIMITS={'vertices':256,'edges':2048,'faces':512,'faceVertices':64,
        'incidences':16384,'springs':8192,'sourceBytes':16*1024*1024,
        'outputBytes':32*1024*1024,'evaluations':2000,'springVisits':2_000_000,
        'normalizedCoordinate':1e6,'traceEntries':128}
OPTION_KEYS={'initialization','seed','random_scale','edge_length','edge_lengths',
             'edge_weights','extra_springs','regular_faces','face_steps',
             'face_weights','pins','max_evaluations','residual_tolerance',
             'solver_tolerance'}


def _json_bytes(value,limit=128*1024*1024):
    return _native_json_bytes(equivalent_json(value,limit),limit)


def _detach(value,limit):
    return json.loads(_json_bytes(value,limit))


def _digest(value,limit=LIMITS['sourceBytes']):
    return hashlib.sha256(_json_bytes(value,limit)).hexdigest()


def _number(value,label,low,high):
    if type(value) not in (int,float) or abs(value)>high or not math.isfinite(value) or value<low:
        raise GeometryError('Spring '+label+' must be a finite primitive number in ['+str(low)+', '+str(high)+'].')
    return float(value)


def _integer(value,label,low,high):
    if type(value) is not int or not low<=value<=high:
        raise GeometryError('Spring '+label+' must be a literal integer in the supported bound.')
    return value


def _vector(value,label):
    if type(value) is not list or len(value)!=3:
        raise GeometryError('Spring '+label+' requires three source-unit coordinates.')
    return [_number(x,label,-1e100,1e100) for x in value]


def _source(value):
    if (type(value) is not dict or type(value.get('dimension')) is not int or value.get('dimension')!=3 or
        type(value.get('embeddingDimension',3)) is not int or value.get('embeddingDimension',3)!=3):
        raise GeometryError('Spring relaxation requires an intrinsic XYZ3D source.')
    source=json.loads(_native_json_bytes(value,LIMITS['sourceBytes']))
    if type(source.get('id')) is not str or not 1<=len(source['id'])<=128:
        raise GeometryError('Spring source requires a bounded stable model ID.')
    if source.get('cells',[])!=[]:
        raise GeometryError('Spring3D source must not contain4D cells.')
    for key in ('vertices','edges','faces'):
        if type(source.get(key)) is not list or not 1<=len(source[key])<=LIMITS[key]:
            raise GeometryError('Spring source '+key+' resource bound exceeded or malformed.')
    if len(source['vertices'])<4:
        raise GeometryError('Spring closed3D source needs at least four vertices.')
    points=[_vector(p,'source vertex') for p in source['vertices']]
    n=len(points);links=Counter();neighbors=defaultdict(set);vertex_links=defaultdict(list);incidences=0
    for edge in source['edges']:
        if type(edge) is not list or len(edge)!=2 or any(type(v) is not int or not 0<=v<n for v in edge) or edge[0]==edge[1]:
            raise GeometryError('Spring source edges require two distinct literal in-range IDs.')
        incidences+=2;neighbors[edge[0]].add(edge[1]);neighbors[edge[1]].add(edge[0])
    keys=[tuple(sorted(e)) for e in source['edges']]
    if len(set(keys))!=len(keys):raise GeometryError('Spring source has duplicate undirected edge incidence.')
    for face in source['faces']:
        if (type(face) is not list or not 3<=len(face)<=LIMITS['faceVertices'] or
            any(type(v) is not int or not 0<=v<n for v in face) or len(set(face))!=len(face)):
            raise GeometryError('Spring face cycles need distinct literal IDs within the face bound.')
        incidences+=len(face)
        for i,v in enumerate(face):
            links[tuple(sorted((v,face[(i+1)%len(face)])))]+=1
            vertex_links[v].append(tuple(sorted((face[i-1],face[(i+1)%len(face)]))))
    if incidences>LIMITS['incidences']:raise GeometryError('Spring source incidence cap exceeded.')
    if set(links)!=set(keys) or any(count!=2 for count in links.values()):
        raise GeometryError('Spring source must be closed: exactly two source faces per literal edge, without leftover strata.')
    if set(neighbors)!=set(range(n)):raise GeometryError('Spring source has unowned or isolated vertices.')
    for v in range(n):
        rows=vertex_links[v];graph=defaultdict(set)
        if len(rows)!=len(set(rows)):raise GeometryError('Spring vertex link has duplicate edges.')
        for a,b in rows:graph[a].add(b);graph[b].add(a)
        if set(graph)!=neighbors[v] or any(len(row)!=2 for row in graph.values()):
            raise GeometryError('Spring source vertex links must be single closed cycles.')
        reached={next(iter(graph))};todo=list(reached)
        while todo:
            for other in graph[todo.pop()]-reached:reached.add(other);todo.append(other)
        if reached!=set(graph):raise GeometryError('Spring source has a disconnected vertex link.')
    components=[];remaining=set(range(n))
    while remaining:
        first=min(remaining);reached={first};todo=[first]
        while todo:
            for other in neighbors[todo.pop()]-reached:reached.add(other);todo.append(other)
        remaining-=reached;components.append(sorted(reached))
    metadata=source.get('metadata',{})
    if type(metadata) is not dict:raise GeometryError('Spring source metadata must be a JSON object.')
    unit=metadata.get('coordinateUnits')
    if unit is not None and unit not in ('model','mm','cm','m','in','ft'):
        raise GeometryError('Spring coordinate units are unsupported; no conversion is inferred.')
    _colors(source,'vertices');_colors(source,'faces');_colors(source,'cells')
    return _detach(source,LIMITS['sourceBytes']),np.array(points),components


def _options(value,source):
    if type(value) is not dict or set(value)-OPTION_KEYS:raise GeometryError('Unsupported spring controls or malformed options.')
    raw=json.loads(_native_json_bytes(value,1024*1024));n=len(source['vertices']);ne=len(source['edges']);nf=len(source['faces'])
    result={'initialization':raw.get('initialization','source'),'seed':raw.get('seed',0),
        'random_scale':_number(raw.get('random_scale',1),'random scale',.001,1000),
        'edge_length':_number(raw.get('edge_length',1),'edge length',1e-100,1e100),
        'regular_faces':raw.get('regular_faces',False),
        'max_evaluations':_integer(raw.get('max_evaluations',500),'evaluation count',1,LIMITS['evaluations']),
        'residual_tolerance':_number(raw.get('residual_tolerance',1e-8),'residual tolerance',1e-12,1e-3),
        'solver_tolerance':_number(raw.get('solver_tolerance',1e-11),'solver tolerance',1e-14,1e-3)}
    if result['initialization'] not in ('source','random'):raise GeometryError('Spring initialization is source or random.')
    _integer(result['seed'],'seed',0,2**32-1)
    if type(result['regular_faces']) is not bool:raise GeometryError('Spring regular_faces must be a boolean.')
    for key,count,default,low,high in [('edge_lengths',ne,result['edge_length'],1e-100,1e100),
        ('edge_weights',ne,1,1e-12,1e12),('face_weights',nf,1,1e-12,1e12)]:
        values=raw.get(key,[default]*count)
        if type(values) is not list or len(values)!=count:raise GeometryError('Spring '+key+' must align with all original source IDs.')
        result[key]=[_number(x,key,low,high) for x in values]
    steps=raw.get('face_steps',[1]*nf)
    if type(steps) is not list or len(steps)!=nf:raise GeometryError('Spring face_steps must align with source faces.')
    for face,d in zip(source['faces'],steps):
        if type(d) is not int or not 0<abs(d)<len(face) or math.gcd(len(face),d)!=1:
            raise GeometryError('Spring regular-face step must be a literal signed coprime polygon step; unreduced components are not guessed.')
    result['face_steps']=steps
    extra=raw.get('extra_springs',[])
    if type(extra) is not list or len(extra)>LIMITS['springs']:raise GeometryError('Spring supplemental constraint bound exceeded.')
    result['extra_springs']=[]
    for row in extra:
        if type(row) is not dict or set(row)!={'vertices','length','weight'}:
            raise GeometryError('Extra springs require vertices, length and weight exactly.')
        pair=row['vertices']
        if type(pair) is not list or len(pair)!=2 or any(type(v) is not int or not 0<=v<n for v in pair) or pair[0]==pair[1]:
            raise GeometryError('Extra spring endpoint IDs must be distinct source vertices.')
        result['extra_springs'].append({'vertices':pair,'length':_number(row['length'],'extra length',1e-100,1e100),
                                      'weight':_number(row['weight'],'extra weight',1e-12,1e12)})
    pins=raw.get('pins',[])
    if type(pins) is not list or len(pins)>n:raise GeometryError('Spring pinned vertex bound exceeded.')
    result['pins']=[];seen=set()
    for row in pins:
        if type(row) is not dict or set(row)!={'vertex','position'}:raise GeometryError('Spring pins require vertex and position exactly.')
        vertex=_integer(row['vertex'],'pin source ID',0,n-1)
        if vertex in seen:raise GeometryError('Spring pin IDs must be unique.')
        seen.add(vertex);result['pins'].append({'vertex':vertex,'position':_vector(row['position'],'pin position')})
    return result


def _springs(source,options):
    rows=[];scale=options['edge_length']
    def append(a,b,length,weight,owner):
        if len(rows)>=LIMITS['springs']:raise GeometryError('Spring compiled constraint cap exceeded; no source prefix is solved.')
        target=length/scale
        if not math.isfinite(target) or not 1e-8<=target<=1e6:
            raise GeometryError('Spring target/normalization ratio is outside its well-scaled numeric domain.')
        rows.append({'vertices':[a,b],'length':length,'normalizedLength':target,'weight':weight,'owner':owner})
    for i,(a,b) in enumerate(source['edges']):append(a,b,options['edge_lengths'][i],options['edge_weights'][i],{'kind':'edge','id':i})
    if options['regular_faces']:
        for fi,(face,step,weight) in enumerate(zip(source['faces'],options['face_steps'],options['face_weights'])):
            n=len(face);denominator=abs(math.sin(math.pi*step/n))
            for i in range(n):
                for j in range(i+1,n):
                    length=scale*abs(math.sin(math.pi*(j-i)*step/n))/denominator
                    append(face[i],face[j],length,weight,{'kind':'face','id':fi,'corners':[i,j],'step':step})
    for i,row in enumerate(options['extra_springs']):append(*row['vertices'],row['length'],row['weight'],{'kind':'extra','id':i})
    return rows


def _metrics(points,rows):
    residuals=[]
    for row in rows:
        a,b=row['vertices'];distance=float(np.linalg.norm(points[b]-points[a]));error=distance-row['normalizedLength']
        residuals.append({'owner':deepcopy(row['owner']),'vertices':row['vertices'],
                          'normalizedDistance':distance,'normalizedError':error,'weight':row['weight']})
    errors=np.array([row['normalizedError'] for row in residuals]);weights=np.array([row['weight'] for row in residuals])
    return {'maximumAbsoluteNormalizedResidual':float(np.max(np.abs(errors))),
        'rmsNormalizedResidual':float(np.sqrt(np.mean(errors*errors))),
        'weightedSpringEnergy':float(np.dot(errors*errors,weights)*.5),'perConstraint':residuals}


def _constraint_components(count,rows):
    """Translation gauge follows actual spring connectivity, not face ownership."""
    graph=[set() for _ in range(count)]
    for row in rows:
        a,b=row['vertices'];graph[a].add(b);graph[b].add(a)
    remaining=set(range(count));result=[]
    while remaining:
        first=min(remaining);reached={first};pending=[first]
        while pending:
            for other in graph[pending.pop()]-reached:reached.add(other);pending.append(other)
        remaining-=reached;result.append(sorted(reached))
    return result


def _validity(points,source,components,tolerance,checkpoint=lambda:None):
    diagnostics=[];face_reports=[];minimum_edge=float('inf')
    for a,b in source['edges']:minimum_edge=min(minimum_edge,float(np.linalg.norm(points[a]-points[b])))
    if minimum_edge<=1e-9:diagnostics.append('Collapsed source edge.')
    rank_reports=[]
    for component in components:
        checkpoint()
        p=points[component];singular=np.linalg.svd(p-p.mean(axis=0),compute_uv=False)
        rank=int(np.sum(singular>1e-9*max(1.,float(singular[0]))));rank_reports.append(rank)
        if rank!=3:diagnostics.append('Source component no longer resolves affine rank3.')
        for i,a in enumerate(component):
            if any(np.linalg.norm(points[a]-points[b])<=1e-9 for b in component[i+1:]):
                diagnostics.append('Distinct vertices in one source component coincide.');break
    for fi,face in enumerate(source['faces']):
        checkpoint()
        p=points[face];centered=p-p.mean(axis=0);_,singular,vt=np.linalg.svd(centered,full_matrices=False)
        span=max(float(np.linalg.norm(p[i]-p[j])) for i in range(len(p)) for j in range(i))
        residual=float(np.max(np.abs(centered@vt[-1])))/max(span,1e-30)
        area=float(np.linalg.norm(sum((np.cross(p[i]-p[0],p[i+1]-p[0]) for i in range(1,len(p)-1)),np.zeros(3)))*.5)
        rank=int(np.sum(singular>1e-9*max(1.,float(singular[0]))))
        if residual>tolerance or rank!=2 or area<=1e-12:diagnostics.append('Source face '+str(fi)+' is nonplanar or degenerate.')
        face_reports.append({'sourceFaceId':fi,'maximumRelativePlanarityResidual':residual,'algebraicAreaNormalized':area,'rank':rank})
    return {'passed':not diagnostics,'certified':False,'minimumNormalizedSourceEdge':minimum_edge,
        'componentRanks':rank_reports,'faces':face_reports,'diagnostics':list(dict.fromkeys(diagnostics)),
        'scope':'rank, source edge/noncoincident vertex, ordered-face planarity and algebraic area only',
        'selfIntersectionChecked':False,'isomerClassificationPerformed':False,'uniformityEstablished':False}


def relax_spring_network(source,options=None,*,cancel=None,progress=None):
    """Return a source-bound numerical candidate; never mutate/publish source."""
    try:return _relax(source,{} if options is None else options,cancel,progress)
    except GeometryError:raise
    except (ArithmeticError,ValueError,TypeError,KeyError,RecursionError,UnicodeError) as exc:
        raise GeometryError('Malformed or numerically unresolved spring relaxation: '+str(exc)) from exc


def _relax(original,raw_options,cancel,progress):
    if cancel is not None and not callable(cancel) or progress is not None and not callable(progress):
        raise GeometryError('Spring cancellation/progress hooks must be callable.')
    def canceled():
        if cancel is not None:
            value=cancel()
            if type(value) is not bool:raise GeometryError('Spring cancellation hook must return a boolean.')
            if value:raise GeometryError('Spring relaxation canceled; no candidate published.')
    canceled();original_digest=_digest(original);request_digest=_digest(raw_options,1024*1024)
    requested_options=_detach(raw_options,1024*1024);source,points,components=_source(original)
    options=_options(raw_options,source);rows=_springs(source,options);canceled()
    scale=options['edge_length'];anchor=points[0];offsets=(points-anchor)/scale
    if not np.isfinite(offsets).all() or np.max(np.abs(offsets))>LIMITS['normalizedCoordinate']:
        raise GeometryError('Spring source span/rest-length ratio exceeds the normalized coordinate bound.')
    origin=anchor+offsets.mean(axis=0)*scale;initial=(points-origin)/scale
    if options['initialization']=='random':
        rng=np.random.default_rng(options['seed'])
        for component in components:
            center=initial[component].mean(axis=0);values=rng.uniform(-1,1,(len(component),3))*options['random_scale']
            initial[component]=values-values.mean(axis=0)+center
    pin_ids=set()
    for pin in options['pins']:
        value=(np.array(pin['position'])-origin)/scale
        if not np.isfinite(value).all() or np.max(np.abs(value))>LIMITS['normalizedCoordinate']:
            raise GeometryError('Spring pinned coordinates exceed the normalized bound.')
        initial[pin['vertex']]=value;pin_ids.add(pin['vertex'])
    free=[i for i in range(len(points)) if i not in pin_ids];variable={v:i for i,v in enumerate(free)}
    a=np.array([r['vertices'][0] for r in rows]);b=np.array([r['vertices'][1] for r in rows])
    targets=np.array([r['normalizedLength'] for r in rows]);sqrt_weights=np.sqrt([r['weight'] for r in rows])
    best=initial.copy();best_energy=float('inf');counts={'function':0,'jacobian':0,'springVisits':0};trace=[]
    effective_evaluations=min(options['max_evaluations'],max(1,LIMITS['springVisits']//(2*len(rows))))
    constraint_components=_constraint_components(len(points),rows)
    centers=[initial[c].mean(axis=0) for c in constraint_components]
    def checkpoint():
        canceled()
        if counts['springVisits']+len(rows)>LIMITS['springVisits']:raise _BudgetStop('spring-visit-limit')
        counts['springVisits']+=len(rows)
    def unpack(x):
        result=initial.copy();result[free]=x.reshape((-1,3));return result
    def fun(x):
        nonlocal best,best_energy
        checkpoint();counts['function']+=1;p=unpack(x);distances=np.linalg.norm(p[b]-p[a],axis=1)
        residual=(distances-targets)*sqrt_weights;energy=float(np.dot(residual,residual)*.5)
        if energy<best_energy:best=p.copy();best_energy=energy
        item={'evaluation':counts['function'],'weightedEnergy':energy,'maximumUnweightedResidual':float(np.max(np.abs(distances-targets)))}
        trace.append(item)
        if len(trace)>LIMITS['traceEntries']:del trace[8]
        if progress is not None:progress(deepcopy(item));canceled()
        return residual
    def jac(x):
        checkpoint();counts['jacobian']+=1;p=unpack(x);delta=p[a]-p[b];lengths=np.linalg.norm(delta,axis=1)
        directions=np.divide(delta,lengths[:,None],out=np.zeros_like(delta),where=lengths[:,None]>0)*sqrt_weights[:,None]
        rr=[];cc=[];data=[]
        for i,(u,v) in enumerate(zip(a,b)):
            for endpoint,sign in ((int(u),1),(int(v),-1)):
                if endpoint in variable:
                    for axis in range(3):rr.append(i);cc.append(3*variable[endpoint]+axis);data.append(float(sign*directions[i,axis]))
        return csr_matrix((data,(rr,cc)),shape=(len(rows),3*len(free)))
    termination={'success':False,'status':None,'message':'fixed vertex positions','evaluations':0};budget_stop=None
    try:
        if free:
            result=least_squares(fun,initial[free].ravel(),jac=jac,method='trf',tr_solver='lsmr',
                tr_options={'maxiter':max(10,3*len(free))},max_nfev=effective_evaluations,
                bounds=(-LIMITS['normalizedCoordinate'],LIMITS['normalizedCoordinate']),
                ftol=options['solver_tolerance'],xtol=options['solver_tolerance'],gtol=options['solver_tolerance'])
            termination={'success':bool(result.success),'status':int(result.status),'message':str(result.message),'evaluations':int(result.nfev)}
        else:
            fun(np.zeros(0));termination.update(success=True,status=1,evaluations=1,message='All vertices explicitly pinned; no optimization performed.')
    except _BudgetStop as exc:budget_stop=str(exc);termination.update(message=budget_stop,status=0,evaluations=counts['function'])
    canceled()
    if _digest(original)!=original_digest:raise GeometryError('Spring source geometry or attributes changed before publication; no candidate published.')
    if _digest(raw_options,1024*1024)!=request_digest:raise GeometryError('Spring requested controls changed before publication; no candidate published.')
    for c,center in zip(constraint_components,centers):
        if not any(v in pin_ids for v in c):best[c]+=center-best[c].mean(axis=0)
    physical=origin+best*scale
    for pin in options['pins']:physical[pin['vertex']]=pin['position']
    if not np.isfinite(physical).all():raise GeometryError('Spring output coordinates do not resolve finite source-unit values.')
    best=(physical-origin)/scale
    metrics=_metrics(best,rows);satisfied=metrics['maximumAbsoluteNormalizedResidual']<=options['residual_tolerance']
    validity=_validity(best,source,components,min(1e-8,options['residual_tolerance']),canceled)
    if np.max(np.abs(physical))>1e100:
        validity['passed']=False;validity['diagnostics'].append('Realized source-unit coordinates exceed the bounded finite domain.')
    receipt={'algorithmVersion':VERSION,'sourceModel':source,'sourceModelId':source['id'],
        'sourceFingerprint':identity(source),'sourceSnapshotSha256':original_digest,'parameters':options,
        'requestedParameters':requested_options,
        'implementation':{'solver':'scipy.optimize.least_squares/trf/lsmr','scipyVersion':scipy.__version__,
                          'numpyVersion':np.__version__,'randomGenerator':'numpy.PCG64/default_rng'},
        'normalization':{'origin':origin.tolist(),'edgeLength':scale},'initialNormalizedVertices':initial.tolist(),
        'maps':{key:list(range(len(source[key]))) for key in ('vertices','edges','faces')},
        'componentVertexIds':components,'constraintComponentVertexIds':constraint_components,
        'springs':rows,'residuals':metrics,'solverTermination':termination,
        'requestedConstraintsSatisfied':satisfied,'geometricValidity':validity,'trace':trace,
        'tracePolicy':'first8 and most recent120 function evaluations; may include rejected solver trial steps',
        'resourceBounds':dict(LIMITS),'work':{**counts,'requestedEvaluations':options['max_evaluations'],'effectiveEvaluations':effective_evaluations},
        'limitations':['No installed spring-description grammar or executed Stella equivalence.',
            'Local optimization can produce isomers or self-intersections; no uniformity or global feasibility proof.',
            'Supplemental/regular-face/pinned weighting controls are explicit candidate definitions, not inferred Stella defaults.']}
    model=None
    if validity['passed']:
        model={'id':'spring-'+_digest({'source':source,'options':options,'vertices':physical.tolist()},LIMITS['outputBytes']),
            'name':'Spring candidate of '+source.get('name','Source'),'dimension':3,'embeddingDimension':3,
            'interpretation':'generalized-complex','vertices':physical.tolist(),
            'edges':deepcopy(source['edges']),'faces':deepcopy(source['faces']),'cells':[],
            'numeric':{'mode':'float64-approximate','certified':False},
            'metadata':{'springRelaxation':receipt},'provenance':{'operation':'spring-relaxation','algorithmVersion':VERSION,'sourceId':source['id']}}
        if 'offColors' in source.get('metadata',{}):model['metadata']['offColors']=deepcopy(source['metadata']['offColors'])
        if 'coordinateUnits' in source.get('metadata',{}):model['metadata']['coordinateUnits']=source['metadata']['coordinateUnits']
        model['validation']=validate(model);receipt['nativeValidation']=model['validation']
        if not model['validation']['passed']:
            validity['passed']=False;validity['diagnostics'].append('Native structural/geometric validation did not pass.');model=None
        else:model['fingerprint']=identity(model);receipt.update(resultModelId=model['id'],resultFingerprint=model['fingerprint'])
    if not validity['passed']:status='invalid-realization'
    elif budget_stop:status='resource-limited'
    elif satisfied:status='constraints-satisfied'
    elif termination['success']:status='stationary-residual'
    else:status='evaluation-limit'
    result={'status':status,'model':model,'evidence':receipt,
        'preview':None if model else {'vertices':physical.tolist(),'edges':deepcopy(source['edges']),'faces':deepcopy(source['faces']),
                                    'publishable':False,'diagnostics':validity['diagnostics']},
        'certified':False,'uniform':False,'nearMissClassification':'not established; residuals only'}
    _json_bytes(result,LIMITS['outputBytes']);canceled()
    if _digest(original)!=original_digest:raise GeometryError('Spring source changed before final publication.')
    if _digest(raw_options,1024*1024)!=request_digest:raise GeometryError('Spring requested controls changed before final publication.')
    return result


class _BudgetStop(Exception):
    pass


def verify_spring_candidate(result,expected_source):
    """Verify binding and reported numerical facts, not optimizer execution/global optimality.

    The caller's expected source is essential: a self-declared source snapshot
    is historical data, not independent evidence of the current source owner.
    Invalid previews are deliberately not publishable through this verifier.
    """
    try:
        if type(result) is not dict or type(result.get('model')) is not dict or not validate(result['model'])['passed']:
            raise GeometryError('Spring invalid preview or malformed native model is not publishable.')
        if type(result['model'].get('dimension')) is not int or type(result['model'].get('embeddingDimension')) is not int:
            raise GeometryError('Spring published dimensional declarations must be literal integers.')
        for kind in ('vertices','faces','cells'):_colors(result['model'],kind)
        detached=_detach(result,LIMITS['outputBytes'])
        expected,_,components=_source(expected_source)
        model=detached.get('model');receipt=detached.get('evidence')
        if type(model) is not dict or type(receipt) is not dict:
            raise GeometryError('Spring invalid preview has no publishable candidate.')
        if (receipt.get('algorithmVersion')!=VERSION or receipt.get('sourceModel')!=expected or
            _digest(receipt.get('sourceModel'))!=_digest(expected) or
            receipt.get('sourceModelId')!=expected['id'] or receipt.get('sourceFingerprint')!=identity(expected) or
            receipt.get('sourceSnapshotSha256')!=_digest(expected)):
            raise GeometryError('Spring candidate source binding or full attributes do not match the expected source.')
        options=_options(receipt.get('requestedParameters'),expected);rows=_springs(expected,options)
        if receipt.get('parameters')!=options or receipt.get('springs')!=rows or receipt.get('componentVertexIds')!=components:
            raise GeometryError('Spring candidate constraint/initialization schema changed.')
        if receipt.get('constraintComponentVertexIds')!=_constraint_components(len(expected['vertices']),rows):
            raise GeometryError('Spring candidate constraint translation gauge changed.')
        if receipt.get('maps')!={key:list(range(len(expected[key]))) for key in ('vertices','edges','faces')}:
            raise GeometryError('Spring candidate source incidence maps changed.')
        if (type(model.get('dimension')) is not int or model.get('dimension')!=3 or
            type(model.get('embeddingDimension')) is not int or model.get('embeddingDimension')!=3 or
            model.get('interpretation')!='generalized-complex'):
            raise GeometryError('Spring candidate domain or interpretation changed.')
        if (model.get('edges')!=expected['edges'] or model.get('faces')!=expected['faces'] or model.get('cells')!=[] or
            type(model.get('vertices')) is not list or len(model['vertices'])!=len(expected['vertices'])):
            raise GeometryError('Spring candidate literal source incidence changed.')
        if any(_json_bytes(model[key])!=_json_bytes(expected[key]) for key in ('edges','faces')):
            raise GeometryError('Spring candidate changed literal source incidence types.')
        p=np.array([_vector(row,'candidate vertex') for row in model['vertices']])
        origin=np.array(_vector(receipt.get('normalization',{}).get('origin'),'normalization origin'))
        if receipt.get('normalization',{}).get('edgeLength')!=options['edge_length']:
            raise GeometryError('Spring candidate normalization changed.')
        source_points=np.array(expected['vertices'],dtype=float);anchor=source_points[0]
        required_origin=anchor+((source_points-anchor)/options['edge_length']).mean(axis=0)*options['edge_length']
        if not np.array_equal(origin,required_origin):raise GeometryError('Spring candidate origin is not its original source centroid.')
        if np.max(np.abs((source_points-anchor)/options['edge_length']))>LIMITS['normalizedCoordinate']:
            raise GeometryError('Spring candidate source initialization exceeds its normalized span bound.')
        initial=(source_points-origin)/options['edge_length']
        if options['initialization']=='random':
            rng=np.random.default_rng(options['seed'])
            for component in components:
                center=initial[component].mean(axis=0);values=rng.uniform(-1,1,(len(component),3))*options['random_scale']
                initial[component]=values-values.mean(axis=0)+center
        for pin in options['pins']:initial[pin['vertex']]=(np.array(pin['position'])-origin)/options['edge_length']
        if _json_bytes(receipt.get('initialNormalizedVertices'))!=_json_bytes(initial.tolist()):
            raise GeometryError('Spring candidate original/seeded initialization evidence changed.')
        normalized=(p-origin)/options['edge_length']
        if not np.isfinite(normalized).all() or np.max(np.abs(normalized))>LIMITS['normalizedCoordinate']:
            raise GeometryError('Spring candidate coordinates exceed the normalized domain.')
        for pin in options['pins']:
            if model['vertices'][pin['vertex']]!=pin['position']:raise GeometryError('Spring candidate moved an exactly pinned vertex.')
        metrics=_metrics(normalized,rows);validity=_validity(normalized,expected,components,min(1e-8,options['residual_tolerance']))
        if (_json_bytes(receipt.get('residuals'))!=_json_bytes(metrics) or
            _json_bytes(receipt.get('geometricValidity'))!=_json_bytes(validity) or not validity['passed']):
            raise GeometryError('Spring candidate numerical residual/validity evidence changed or is invalid.')
        if receipt.get('requestedConstraintsSatisfied')!=(metrics['maximumAbsoluteNormalizedResidual']<=options['residual_tolerance']):
            raise GeometryError('Spring candidate residual satisfaction assertion changed.')
        metadata=model.get('metadata',{})
        if metadata.get('springRelaxation')!=receipt:
            raise GeometryError('Spring candidate historical receipt is inconsistent with its publication evidence.')
        for key in ('coordinateUnits','offColors'):
            if (key in metadata)!=(key in expected.get('metadata',{})) or metadata.get(key)!=expected.get('metadata',{}).get(key):
                raise GeometryError('Spring candidate source units or RGBA/null tables changed.')
            if key in metadata and _json_bytes(metadata[key])!=_json_bytes(expected['metadata'][key]):
                raise GeometryError('Spring candidate changed literal source attribute types.')
        required_id='spring-'+_digest({'source':expected,'options':options,'vertices':model['vertices']},LIMITS['outputBytes'])
        if model.get('id')!=required_id or receipt.get('resultModelId')!=required_id:
            raise GeometryError('Spring candidate identity is not bound to the realized geometry.')
        if model.get('fingerprint')!=identity(model) or receipt.get('resultFingerprint')!=identity(model):
            raise GeometryError('Spring candidate fingerprint changed.')
        if not validate(model)['passed']:raise GeometryError('Spring candidate fails native validation.')
        if detached.get('certified') is not False or detached.get('uniform') is not False:
            raise GeometryError('Spring candidate incorrectly claims certification or uniformity.')
        if detached.get('preview') is not None or detached.get('status') not in ('constraints-satisfied','stationary-residual','evaluation-limit','resource-limited'):
            raise GeometryError('Spring candidate publication status or preview changed.')
        satisfied=receipt['requestedConstraintsSatisfied']
        termination=receipt.get('solverTermination',{})
        budget=termination.get('message')=='spring-visit-limit'
        required_status=('resource-limited' if budget else 'constraints-satisfied' if satisfied else
                         'stationary-residual' if termination.get('success') is True else 'evaluation-limit')
        if detached['status']!=required_status:raise GeometryError('Spring candidate falsely reports residual/convergence status.')
        return {'passed':True,'sourceSnapshotSha256':receipt['sourceSnapshotSha256'],
                'resultFingerprint':model['fingerprint'],'constraintsSatisfied':receipt['requestedConstraintsSatisfied'],
                'optimizerExecutionCertified':False,'uniformityEstablished':False}
    except GeometryError:raise
    except (ArithmeticError,ValueError,TypeError,KeyError,RecursionError,UnicodeError) as exc:
        raise GeometryError('Malformed spring candidate verification: '+str(exc)) from exc
