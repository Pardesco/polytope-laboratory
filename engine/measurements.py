"""Intrinsic affine-flat measurements and convex facet dihedrals in 2/3/4D."""
from collections import defaultdict
from itertools import product
import math
import numpy as np
from .geometry import GeometryError, TOLERANCE, points_array, validate, identity, polygon_area, intrinsic_measures

VERSION='0.6.0'


def entity_frame(model, entity, points=None):
    p=points_array(model['vertices']) if points is None else points
    if not isinstance(entity,dict):raise GeometryError('Each entity needs a kind and source index, or explicit vertex IDs.')
    kind=entity.get('kind');d=p.shape[1]
    if kind in ('vertex','edge','face','cell'):
        field={'vertex':'vertices','edge':'edges','face':'faces','cell':'cells'}[kind]
        index=entity.get('index')
        if type(index) is not int or not 0<=index<len(model.get(field,[])):raise GeometryError('Source entity index is outside this model.')
        if kind=='vertex':ids=[index]
        elif kind=='cell':ids=sorted({v for f in model['cells'][index] for v in model['faces'][f]})
        else:ids=list(model[field][index])
        expected={'vertex':0,'edge':1,'face':2,'cell':3}[kind]
    elif kind in ('line','plane','hyperplane'):
        ids=entity.get('vertices')
        expected={'line':1,'plane':2,'hyperplane':d-1}[kind]
        if not isinstance(ids,list) or len(ids)<expected+1:raise GeometryError('A flat needs enough distinct source vertex IDs to span its declared dimension.')
    else:raise GeometryError('Entity kind is vertex, edge, face, cell, line, plane or hyperplane.')
    if expected>d or len(set(ids))!=len(ids) or any(type(v) is not int or not 0<=v<len(p) for v in ids):
        raise GeometryError('Entity vertices are invalid, repeated, or exceed the embedding dimension.')
    cloud=p[ids];origin=cloud.mean(axis=0);scale=max(float(np.max(np.ptp(p,axis=0))),np.finfo(float).tiny)
    _,singular,vt=np.linalg.svd((cloud-origin)/scale,full_matrices=True)
    actual=int(np.sum(singular>TOLERANCE))
    if actual!=expected:raise GeometryError(f'{kind.title()} has affine rank {actual}; expected {expected}. Coincident, collinear or nonplanar input is unresolved.')
    basis=vt[:expected].T
    return {'kind':kind,'vertices':ids,'origin':origin,'basis':basis,'dimension':actual,'scale':scale}


def entity_measure(model, kind='flat-distance', entities=None, bounded=False):
    if not validate(model)['passed']:raise GeometryError('Cannot measure invalid source incidence.')
    if not isinstance(entities,list) or len(entities)!=2:raise GeometryError('Choose two source entities or explicitly defined flats.')
    p=points_array(model['vertices']);a,b=[entity_frame(model,item,p) for item in entities]
    common={'sourceFingerprint':identity(model),'entities':entities,'numericMode':'float64-approximate','algorithmVersion':VERSION,
            'entityDimensions':[a['dimension'],b['dimension']],'intrinsicDimension':p.shape[1]}
    if type(bounded) is not bool:raise GeometryError('Bounded distance is an explicit boolean option.')
    if kind=='flat-angle':
        if not min(a['dimension'],b['dimension']):raise GeometryError('Angles of direction spaces are undefined for a point entity.')
        cosines=np.linalg.svd(a['basis'].T@b['basis'],compute_uv=False)
        angles=np.degrees(np.arccos(np.clip(cosines,0,1)))
        return {**common,'value':float(angles[0]) if len(angles)==1 else None,'angles':angles.tolist(),
                'units':'degrees','definition':'unsigned principal angles of intrinsic direction spaces, ordered from smallest to largest in [0,90]'}
    if kind!='flat-distance':raise GeometryError('Entity measurement kind is flat-distance or flat-angle.')
    if bounded and any(item['kind'] not in ('vertex','edge') for item in (a,b)):
        from .bounded_entity_distance import bounded_entity_distance
        return {**common,**bounded_entity_distance(model,[a,b],entities,p)}
    scale=a['scale']
    if bounded:
        origins=[p[item['vertices'][0]] for item in (a,b)]
        vectors=[(p[item['vertices'][1]]-p[item['vertices'][0]])/scale if item['kind']=='edge' else None for item in (a,b)]
        columns=[v*(1 if i==0 else -1) for i,v in enumerate(vectors) if v is not None]
        matrix=np.column_stack(columns) if columns else np.empty((len(p[0]),0))
        rhs=(origins[1]-origins[0])/scale
        # At most two segment parameters: exhaust bound/free active sets.
        # This includes endpoints exactly and handles parallel rank-deficient
        # segments without an iterative solver's endpoint stopping error.
        candidates=[]
        for active in product((None,0,1),repeat=len(columns)):
            candidate=np.asarray([0 if value is None else value for value in active],dtype=float)
            free=[i for i,value in enumerate(active) if value is None]
            if free:candidate[free]=np.linalg.lstsq(matrix[:,free],rhs-matrix@candidate,rcond=TOLERANCE)[0]
            if np.all(candidate>=-1e-12) and np.all(candidate<=1+1e-12):
                candidate=np.clip(candidate,0,1);candidates.append((float(np.linalg.norm(matrix@candidate-rhs)),candidate))
        coefficients=min(candidates,key=lambda item:item[0])[1]
        witness=[q.copy() for q in origins];cursor=0
        for i,v in enumerate(vectors):
            if v is not None:witness[i]+=v*scale*coefficients[cursor];cursor+=1
        definition='minimum intrinsic distance between bounded source vertices/edge segments'
    else:
        matrix=np.column_stack((a['basis'],-b['basis']));rhs=(b['origin']-a['origin'])/scale
        coefficients=np.linalg.lstsq(matrix,rhs,rcond=TOLERANCE)[0]
        split=a['dimension'];witness=[a['origin']+a['basis']@coefficients[:split]*scale,b['origin']+b['basis']@coefficients[split:]*scale]
        definition='minimum intrinsic distance between infinite supporting affine flats; polygons/cells are not bounded regions'
    value=float(np.linalg.norm(witness[1]-witness[0]))
    return {**common,'value':value,'units':'model-units','definition':definition,'bounded':bounded,
            'witnessPoints':[q.tolist() for q in witness],'numericallyIncident':value<=scale*TOLERANCE*8}


def entity_info(model, entity):
    if not validate(model)['passed']:raise GeometryError('Cannot inspect invalid source incidence.')
    frame=entity_frame(model,entity);p=np.asarray(model['vertices'])[frame['vertices']];center=frame['origin'];scale=frame['scale']
    radii=np.linalg.norm(p-center,axis=1);circumradius=None;circumcenter=None;fit_error=None
    if frame['dimension']:
        local=(p-center)@frame['basis']/scale
        matrix=2*(local-local[0]);rhs=np.einsum('ij,ij->i',local,local)-local[0]@local[0]
        fitted=np.linalg.lstsq(matrix,rhs,rcond=TOLERANCE)[0];distances=np.linalg.norm(local-fitted,axis=1)
        radius=float(np.mean(distances));fit_error=float(np.max(abs(distances-radius))*scale)
        if fit_error<=max(radius,np.finfo(float).tiny)*scale*TOLERANCE*8:
            circumradius=radius*scale;circumcenter=(center+frame['basis']@fitted*scale).tolist()
    content=None;content_units=None;definition='No bounded content assigned to an infinite supporting flat or point.'
    if frame['kind']=='edge':content=float(np.linalg.norm(p[1]-p[0]));content_units='model-units';definition='intrinsic length of the source edge segment'
    elif frame['kind']=='face':
        content=polygon_area(p);content_units='model-units^2'
        definition='ordinary convex polygon area' if model.get('interpretation')=='convex-polytope' else 'absolute algebraic area of ordered source face cycle; not a filled star-face area'
    elif frame['kind']=='cell':
        if model.get('interpretation')=='convex-polytope':
            intrinsic_measures(model)
            from .nets import extract_entity
            content=intrinsic_measures(extract_entity(model,'cell',entity['index']))['content'];content_units='model-units^3';definition='intrinsic volume of the complete convex source 3-cell'
        else:definition='Generalized cell volume is unavailable without an explicit filled-solid interpretation.'
    return {'entity':entity,'sourceVertexIds':frame['vertices'],'affineDimension':frame['dimension'],
            'vertexMean':center.tolist(),'vertexMeanRadiusRange':[float(min(radii)),float(max(radii))],
            'circumradius':circumradius,'circumcenter':circumcenter,'circumsphereFitError':fit_error,
            'circumsphereDefinition':'unique common sphere in the entity affine hull; unavailable when vertices are not cospherical',
            'content':content,'contentUnits':content_units,'contentDefinition':definition,
            'units':'model-units','numericMode':'float64-approximate','algorithmVersion':VERSION,'sourceFingerprint':identity(model)}


def facet_normals(model):
    if model.get('interpretation')!='convex-polytope' or model.get('dimension') not in (3,4):
        raise GeometryError('Interior dihedrals require a convex 3D/4D source; generalized branch conventions are not inferred.')
    p=points_array(model['vertices']);d=p.shape[1];scale=float(np.max(np.ptp(p,axis=0)));q=(p-p.mean(axis=0))/scale
    sets=model['faces'] if d==3 else [sorted({v for f in cell for v in model['faces'][f]}) for cell in model['cells']]
    normals=[]
    for ids in sets:
        cloud=q[ids];_,s,vt=np.linalg.svd(cloud-cloud.mean(axis=0),full_matrices=True)
        if int(np.sum(s>TOLERANCE))!=d-1:raise GeometryError('Facet hyperplane is not well defined.')
        normal=vt[-1];center=cloud.mean(axis=0)
        if normal@center<0:normal=-normal
        if max((q-center)@normal)>TOLERANCE*8:raise GeometryError('Facet does not support all source vertices; a convex interior angle is unavailable.')
        normals.append(normal)
    return normals


def dihedrals(model, ridge=None):
    if not validate(model)['passed']:raise GeometryError('Cannot measure invalid source incidence.')
    normals=facet_normals(model);d=model['dimension'];incidence=defaultdict(list)
    if d==3:
        edge_ids={tuple(sorted(e)):i for i,e in enumerate(model['edges'])}
        for i,face in enumerate(model['faces']):
            for a,b in zip(face,face[1:]+face[:1]):incidence[edge_ids[tuple(sorted((a,b))) ]].append(i)
        count=len(model['edges']);kind='edge'
    else:
        for i,cell in enumerate(model['cells']):
            for face in cell:incidence[face].append(i)
        count=len(model['faces']);kind='face'
    if ridge is not None and (type(ridge) is not int or not 0<=ridge<count):raise GeometryError('Choose a valid source ridge ID: edge in 3D, face in 4D.')
    records=[]
    for index in range(count) if ridge is None else [ridge]:
        adjacent=incidence[index]
        if len(adjacent)!=2 or len(set(adjacent))!=2:raise GeometryError('A dihedral ridge must join exactly two distinct facets.')
        angle=180-math.degrees(math.acos(float(np.clip(normals[adjacent[0]]@normals[adjacent[1]],-1,1))))
        records.append({'ridge':index,'ridgeKind':kind,'facets':adjacent,'value':angle})
    values=[r['value'] for r in records]
    return {'value':values[0] if ridge is not None else None,'units':'degrees','records':records,
            'min':min(values),'max':max(values),'mean':float(np.mean(values)),
            'definition':'unsigned convex interior dihedral: 180 degrees minus the angle between outward facet normals',
            'numericMode':'float64-approximate','algorithmVersion':VERSION,'sourceFingerprint':identity(model)}


def align_section(model, entity, direction=None, offset=0):
    if not validate(model)['passed'] or model['dimension'] not in (3,4):raise GeometryError('Section alignment requires a validated 3D/4D source.')
    if not isinstance(offset,(int,float)) or isinstance(offset,bool) or not math.isfinite(offset):raise GeometryError('Alignment offset must be finite model units.')
    frame=entity_frame(model,entity);basis=frame['basis'];d=model['embeddingDimension']
    if frame['dimension']==d:raise GeometryError('The entity spans the full embedding; there is no perpendicular section hyperplane.')
    _,_,vt=np.linalg.svd(basis.T,full_matrices=True);complement=vt[frame['dimension']:].T
    if direction is not None:
        direction=np.asarray(direction,dtype=float)
        if direction.shape!=(d,) or not np.isfinite(direction).all() or not np.linalg.norm(direction):raise GeometryError('Choose a finite nonzero intrinsic direction of the source dimension.')
        normal=complement@(complement.T@(direction/np.linalg.norm(direction)))
        if np.linalg.norm(normal)<=TOLERANCE:raise GeometryError('Requested alignment direction lies in the entity flat; its perpendicular projection is undefined.')
        normal/=np.linalg.norm(normal);policy='perpendicular projection of supplied intrinsic direction'
    elif complement.shape[1]==1:
        normal=complement[:,0];policy='unique perpendicular hyperplane direction, oriented from vertex mean toward entity'
    else:
        radial=frame['origin']-np.mean(model['vertices'],axis=0);normal=complement@(complement.T@radial)
        if np.linalg.norm(normal)<=frame['scale']*TOLERANCE:
            raise GeometryError('Entity has several perpendicular directions and no radial choice; supply an intrinsic direction explicitly.')
        normal/=np.linalg.norm(normal);policy='vertex-mean radial direction projected perpendicular to entity'
    radial=frame['origin']-np.mean(model['vertices'],axis=0)
    if direction is None:
        facing=float(normal@radial)
        if facing<0:normal=-normal
        if abs(facing)<=frame['scale']*TOLERANCE and normal[np.argmax(abs(normal))]<0:normal=-normal
    depth=float(normal@frame['origin'])+offset
    return {'normal':normal.tolist(),'offset':depth,'relativeOffset':offset,'entity':entity,'directionPolicy':policy,
            'sourceFingerprint':identity(model),'units':'model-units','algorithmVersion':VERSION,
            'definition':'section hyperplane contains the selected entity at relative offset 0; positive offsets follow the returned normal'}
