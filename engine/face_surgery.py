"""Bounded convex-source excavation, prism drilling and literal vertex copies."""
from copy import deepcopy
import hashlib
import math
import uuid

import numpy as np

from .augmentation import _source, _normal, _frame, _orientation, _measures
from .compounds import _colors, add_models
from .face_blending import blend_faces
from .geometry import GeometryError, TOLERANCE, hull, identity, validate
from .history import _json_bytes
from .specialized_catalog import surface_topology, boundary_parts
from .stewart_checks import _plane, _intersections

VERSION = '0.1.0'
OPERATION = 'face-surgery'
MAX_FACES = 256
NAMESPACE = uuid.UUID('962a438e-90b5-4a50-8233-98418145cc72')


def _id(value):
    return str(uuid.uuid5(NAMESPACE, hashlib.sha256(_json_bytes(value)).hexdigest()))


def _index(value, count, label):
    if type(value) is not int or not 0 <= value < count:
        raise GeometryError(label+' must be an in-range literal integer source ID.')
    return value


def _number(value, low, high, label):
    if type(value) not in (int, float) or not math.isfinite(value) or not low <= value <= high:
        raise GeometryError(label+f' must be finite in {low:g}..{high:g}.')
    return float(value)


def _edges(faces):
    return [list(e) for e in sorted({tuple(sorted((a,b))) for f in faces for a,b in zip(f,f[1:]+f[:1])})]


def _outward(source, proof):
    p=np.asarray(source['vertices'], dtype=float)
    return [list(f) if _orientation(p,f,_normal(proof,i))>0 else list(reversed(f))
            for i,f in enumerate(source['faces'])]


def _same_polygon(a, b, tolerance):
    if len(a)!=len(b):return False
    da=np.linalg.norm(a[:,None]-a[None,:],axis=2)
    for sign in (1,-1):
        for offset in range(len(b)):
            q=b[[(offset+sign*j)%len(b) for j in range(len(b))]]
            if np.max(np.abs(da-np.linalg.norm(q[:,None]-q[None,:],axis=2)))<=tolerance:return True
    return False


def _piece(base, face_id, params):
    piece=params.get('piece','pyramid')
    if piece in ('model','library'):
        if piece=='library':
            from .generators import generate
            key=params.get('library_key')
            if type(key) is not str or not 1<=len(key)<=128:raise GeometryError('Enter a bounded built-in library model key.')
            addition=generate('regular',key=key)
            addition['id']=_id(['library',key,identity(addition)])
            if 'coordinateUnits' in base.get('metadata',{}):addition['metadata']['coordinateUnits']=base['metadata']['coordinateUnits']
        else:addition=deepcopy(params.get('addition'))
        proof,_=_source(addition)
        fi=_index(params.get('addition_face_id',0),len(addition['faces']),'Addition face')
        return addition,fi,proof
    if piece not in ('pyramid','prism','antiprism','cupola'):
        raise GeometryError('Choose pyramid, prism, antiprism, cupola or a convex model memory. Rotundas can be supplied from a model memory.')
    p=np.asarray(base['vertices'],dtype=float);face=base['faces'][face_id];n=len(face)
    if not 3<=n<=32:raise GeometryError('Generated pieces require 3..32 face vertices.')
    edge=float(np.linalg.norm(p[face[1]]-p[face[0]]))
    height=edge*_number(params.get('height',.25),.0001,100,'Height / edge')
    if piece=='cupola':
        from .cupola import cupola
        if n%2 or n<6:raise GeometryError('Cupola attachment uses its even lower ring (6 or more sides).')
        addition=cupola(n//2,edge_length=edge,height=height);fi=1
    else:
        from .generators import generate
        addition=generate(piece,n=n,height=height)
        fi=next((i for i,f in enumerate(addition['faces']) if len(f)==n and
                 np.ptp(np.asarray(addition['vertices'])[f,2])<TOLERANCE),None)
        if fi is None:raise GeometryError('Generated piece has no matching attachment ring.')
        q=np.asarray(addition['vertices'],dtype=float)
        scale=edge/np.linalg.norm(q[addition['faces'][fi][1]]-q[addition['faces'][fi][0]])
        q[:,:2]*=scale
        addition=hull(q.tolist(),addition['name'])
        fi=next(i for i,f in enumerate(addition['faces']) if len(f)==n and np.ptp(np.asarray(addition['vertices'])[f,2])<TOLERANCE)
    addition['id']=_id({'piece':piece,'geometry':identity(addition)})
    if 'coordinateUnits' in base.get('metadata',{}):
        addition['metadata']['coordinateUnits']=base['metadata']['coordinateUnits']
    proof,_=_source(addition)
    return addition,fi,proof


def _aligned(p, bf, bn, addition, af_id, proof, offset, scale, inward, tolerance):
    q=np.asarray(addition['vertices'],dtype=float);af=addition['faces'][af_id]
    if len(af)!=len(bf):raise GeometryError('Attachment faces have different polygon side counts.')
    _index(offset,len(bf),'Twist cycle offset')
    an=_normal(proof,af_id)
    direction=(1 if inward else -1)*_orientation(p,bf,bn)*_orientation(q,af,an)
    targets=[bf[(offset+direction*j)%len(bf)] for j in range(len(bf))]
    rotation=_frame(p,targets,bn if inward else -bn)@_frame(q,af,an).T
    transformed=((q-q[af[0]])*scale)@rotation.T+p[targets[0]]
    residual=float(max(np.linalg.norm(transformed[a]-p[b]) for a,b in zip(af,targets)))
    if residual>tolerance:raise GeometryError('Ordered face polygons do not match at the chosen scale and twist.')
    for a,b in zip(af,targets):transformed[a]=p[b]
    return transformed,dict(zip(af,targets)),residual


def _blend(model):
    """Use the native no-hole blender only for equal-color convex unions."""
    while True:
        p=np.asarray(model['vertices']);scale=np.max(np.ptp(p,axis=0));q=(p-p.mean(axis=0))/scale
        planes=[_plane(q[f]) for f in model['faces']];colors=_colors(model,'faces');candidate=None
        for i,a in enumerate(model['faces']):
            for j in range(i):
                b=model['faces'][j]
                if colors[i]!=colors[j] or len(set(a)&set(b))!=2:continue
                ca,na,_=planes[i];cb,nb,_=planes[j]
                if np.linalg.norm(np.cross(na,nb))>1e-8 or abs((ca-cb)@na)>1e-8:continue
                try:merged=blend_faces(model,[j,i],tolerance=0)
                except GeometryError:continue
                old=q[b];new=q[merged['faces'][j]]
                normal=lambda poly:sum((np.cross(u,v) for u,v in zip(poly-poly[0],np.roll(poly,-1,axis=0)-poly[0])),np.zeros(3))
                if np.dot(normal(old),normal(new))<0:merged['faces'][j].reverse()
                # Later intersection checks require convex individual polygons.
                valid=True
                for face in merged['faces']:
                    poly=q[face];_,normal,_=_plane(poly)
                    turns=[np.dot(np.cross(poly[(k+1)%len(poly)]-poly[k],poly[(k+2)%len(poly)]-poly[(k+1)%len(poly)]),normal) for k in range(len(poly))]
                    valid &= min(turns)>=-1e-8 or max(turns)<=1e-8
                if valid:candidate=merged;break
            if candidate is not None:break
        if candidate is None:return model
        model=candidate


def _finish(base, vertices, faces, colors, evidence, params, genus):
    if len(vertices)>4096 or len(faces)>MAX_FACES:raise GeometryError('Surgery output exceeds 4096 vertices or 256 faces.')
    model={'id':_id([identity(base),params]),'name':base.get('name','Model')+' '+params.get('mode','augment'),
        'dimension':3,'embeddingDimension':3,'interpretation':'generalized-complex',
        'vertices':vertices,'faces':faces,'edges':_edges(faces),'cells':[],
        'metadata':{'offColors':{'faces':colors,'cells':[]}},
        'numeric':{'mode':'float64-approximate','tolerance':TOLERANCE,'certified':False}}
    p=np.asarray(model['vertices'],dtype=float);span=float(np.max(np.ptp(p,axis=0)))
    if not np.isfinite(p).all() or np.max(np.abs(p))>1e100 or not math.isfinite(span) or span<=0:
        raise GeometryError('Surgery coordinates exceed numerical bounds.')
    q=(p-p.mean(axis=0))/span
    intersections=_intersections(q,model['faces'],[_plane(q[f]) for f in model['faces']],1e-8)
    if not intersections['passed']:
        raise GeometryError('Self-intersection or coincident cavity faces: '+str(intersections['conflicts'][:4])+'. Reduce height or choose fewer faces.')
    # Audit convex face pairs before native area-preserving unions introduce collinear seam vertices.
    original_faces=len(faces)
    if params.get('blend',True):model=_blend(model)
    model['metadata'].pop('faceEditing',None)
    from .construction_names import surgery_name
    model['name']=surgery_name(base,params)
    evidence['coplanarFaceReduction']=original_faces-len(model['faces'])
    intersections['scope']='Pre-blend convex polygon segmentation; native no-hole area-preserving coplanar unions follow.'
    topology=surface_topology(model['vertices'],model['faces'])
    if len(boundary_parts(model))!=1 or topology['genus']!=genus or not topology['closedVertexManifold']:
        raise GeometryError('Surgery did not produce the expected connected closed orientable boundary.')
    # Check supplied winding as well as abstract orientability.
    directed={}
    for f in model['faces']:
        for a,b in zip(f,f[1:]+f[:1]):directed[a,b]=directed.get((a,b),0)+1
    if any(directed.get((b,a))!=n for (a,b),n in directed.items()):
        raise GeometryError('Surgery boundary winding is inconsistent.')
    topology['genusScope']='Connected closed orientable boundary; bounded numerical face-intersection checks passed.'
    evidence.update(topology=topology,intersections=intersections,
        measureEvidence=_measures(model,[1]*len(model['faces'])),
        numeric='float64 approximate; no exact Boolean or algebraic certification')
    evidence['measureEvidence']['definition']='oriented embedded closed-boundary integration'
    if 'disjointInteriorContent' in evidence['measureEvidence']:
        evidence['measureEvidence']['enclosedVolume']=evidence['measureEvidence'].pop('disjointInteriorContent')
    model['id']=_id([identity(base),params])
    model['metadata'].update(faceSurgery=evidence,topologicalGenus=genus)
    if 'coordinateUnits' in base.get('metadata',{}):model['metadata']['coordinateUnits']=base['metadata']['coordinateUnits']
    model['provenance']={'operation':OPERATION,'algorithmVersion':VERSION,'sourceModelId':base['id'],
        'sourceFingerprint':identity(base),'parameters':deepcopy(params)}
    model['validation']=validate(model)
    if not model['validation']['passed']:raise GeometryError('Surgery validation failed: '+str(model['validation']['errors']))
    model['fingerprint']=identity(model)
    evidence['resultFingerprint']=model['fingerprint']
    _json_bytes(model,64*1024*1024)
    return model


def _caps(base, proof, params):
    p=np.asarray(base['vertices'],dtype=float);fi=_index(params.get('face_id'),len(base['faces']),'Selected face')
    span=float(np.max(np.ptp(p,axis=0)));tol=1e-8*span
    addition,af,ap=_piece(base,fi,params)
    if base.get('metadata',{}).get('coordinateUnits')!=addition.get('metadata',{}).get('coordinateUnits'):
        raise GeometryError('Source coordinate units differ; convert explicitly before surgery.')
    selected=[fi]
    if params.get('all_of_type',False):
        selected=[i for i,f in enumerate(base['faces']) if _same_polygon(p[base['faces'][fi]],p[f],tol)]
    if len(selected)>64:raise GeometryError('At most 64 matching faces can be changed in one action.')
    inward=params.get('mode','augment')=='excavate';offset=params.get('cycle_offset',0)
    scale=_number(params.get('scale',1),.0001,100,'Piece scale')
    vertices=deepcopy(base['vertices']);outward=_outward(base,proof)
    faces=[f for i,f in enumerate(outward) if i not in selected]
    source_colors=_colors(base,'faces');colors=[deepcopy(c) for i,c in enumerate(source_colors) if i not in selected]
    addition_colors=_colors(addition,'faces');afaces=_outward(addition,ap);placements=[]
    for i in selected:
        transformed,mapping,residual=_aligned(p,base['faces'][i],_normal(proof,i),addition,af,ap,offset,scale,inward,tol)
        nonseam=[v for v in range(len(transformed)) if v not in mapping]
        if inward:
            for k,f in enumerate(base['faces']):
                if k==i:continue
                distance=(transformed[nonseam]-p[f[0]])@_normal(proof,k)
                if len(distance) and max(distance)>=-tol:
                    raise GeometryError('Excavated piece touches or pokes through another face (self-intersection). Reduce height; use Drill for a through tunnel.')
        for v,point in enumerate(transformed):
            if v not in mapping:mapping[v]=len(vertices);vertices.append(point.tolist())
        for k,f in enumerate(afaces):
            if k==af:continue
            cycle=[mapping[v] for v in f]
            faces.append(list(reversed(cycle)) if inward else cycle)
            colors.append(deepcopy(addition_colors[k]))
        placements.append({'faceId':i,'maximumMatchResidual':residual,'vertexMap':[mapping[v] for v in range(len(transformed))]})
    return _finish(base,vertices,faces,colors,{'mode':'excavate' if inward else 'augment','placements':placements,
        'removedBaseFaces':selected,'additionFaceId':af,'reversedCavityFaces':inward,
        'faceType':'congruent ordered polygon, including size; not a symmetry-orbit claim'},params,0)


def _drill(base, proof, params):
    if params.get('piece','prism')!='prism':raise GeometryError('Drill currently supports straight prism tunnels only; choose Prism.')
    if params.get('all_of_type',False):raise GeometryError('Drill operates on one opposite-face pair per action.')
    p=np.asarray(base['vertices'],dtype=float);i=_index(params.get('face_id'),len(base['faces']),'Selected face')
    n=_normal(proof,i);a=base['faces'][i];span=float(np.max(np.ptp(p,axis=0)));tol=span*1e-8
    center=p[a].mean(axis=0);opposite=[]
    for j,b in enumerate(base['faces']):
        if i!=j and np.linalg.norm(_normal(proof,j)+n)<1e-8 and len(a)==len(b):
            delta=p[b].mean(axis=0)-center
            mapping=[int(np.argmin(np.linalg.norm(p[b]-(p[v]+delta),axis=1))) for v in a]
            if len(set(mapping))==len(a) and max(np.linalg.norm(p[b[k]]-(p[v]+delta)) for v,k in zip(a,mapping))<=tol:
                opposite.append((j,[b[k] for k in mapping]))
    if len(opposite)!=1:raise GeometryError('Drill requires a unique opposite parallel congruent face related by translation.')
    j,b=opposite[0];ratio=_number(params.get('inset',.5),.01,.99,'Tunnel radius / face radius')
    vertices=deepcopy(base['vertices']);rings=[]
    for f in (a,b):
        c=p[f].mean(axis=0);rings.append(list(range(len(vertices),len(vertices)+len(f))))
        vertices.extend((c+ratio*(p[f]-c)).tolist())
    outward=_outward(base,proof);faces=[f for k,f in enumerate(outward) if k not in (i,j)]
    source_colors=_colors(base,'faces');colors=[deepcopy(c) for k,c in enumerate(source_colors) if k not in (i,j)]
    # Use source outward winding for annuli; reversed inner edges bound the cavity.
    for face_id,f,ring in ((i,a,rings[0]),(j,b,rings[1])):
        sign=_orientation(p,f,_normal(proof,face_id))
        for k in range(len(a)):
            t=(k+1)%len(a);cycle=[f[k],f[t],ring[t],ring[k]]
            faces.append(cycle if sign>0 else cycle[::-1]);colors.append(deepcopy(source_colors[face_id]))
    for k in range(len(a)):
        t=(k+1)%len(a);cycle=[rings[0][k],rings[0][t],rings[1][t],rings[1][k]]
        faces.append(cycle if _orientation(p,a,n)>0 else cycle[::-1]);colors.append(None)
    return _finish(base,vertices,faces,colors,{'mode':'drill','entryFaceId':i,'exitFaceId':j,
        'insetRatio':ratio,'tunnel':'translated homothetic polygon rings; straight prism',
        'stewartClassification':'not asserted; tunnel annuli need not be regular polygons'},params,1)


def _vertices(base, proof, params):
    if params.get('piece') not in ('model','library'):raise GeometryError('Vertex placement requires a chosen model memory or library model.')
    addition,af,ap=_piece(base,0,params)
    if base.get('metadata',{}).get('coordinateUnits')!=addition.get('metadata',{}).get('coordinateUnits'):
        raise GeometryError('Vertex-placement source coordinate units differ.')
    p=np.asarray(base['vertices'],dtype=float);q=np.asarray(addition['vertices'],dtype=float)
    vi=_index(params.get('vertex_id'),len(p),'Selected vertex');ids=[vi]
    if params.get('all_of_type',False):
        from .symmetry import geometric_symmetry
        symmetry=geometric_symmetry(base)
        if not symmetry.get('complete'):raise GeometryError('Vertex type requires a complete verified metric symmetry search.')
        ids=next(row['ids'] for row in symmetry['entityOrbits']['vertex'] if vi in row['ids'])
    if len(ids)>64 or len(p)+len(ids)*len(q)>4096:raise GeometryError('Vertex placement exceeds 64 copies or 4096 total vertices.')
    scale=_number(params.get('scale',1),.0001,100,'Copy scale');height=_number(params.get('height',0),0,100,'Vertex offset')
    source_anchor=q[addition['faces'][af]].mean(axis=0);source_frame=_frame(q,addition['faces'][af],-_normal(ap,af))
    models=[deepcopy(base)];placements=[]
    center=p.mean(axis=0)
    for v in ids:
        axis=p[v]-center;axis/=np.linalg.norm(axis)
        tangent=np.eye(3)[int(np.argmin(np.abs(axis)))];tangent-=np.dot(tangent,axis)*axis;tangent/=np.linalg.norm(tangent)
        frame=np.column_stack((tangent,np.cross(axis,tangent),axis));rotation=frame@source_frame.T
        copy=deepcopy(addition);copy['id']=_id([identity(addition),v,params]);copy['vertices']=(((q-source_anchor)*scale)@rotation.T+p[v]+height*axis).tolist()
        for key in ('measure','certificate','rationalCoordinates','components','fingerprint'):copy.pop(key,None)
        copy['interpretation']='generalized-complex';copy['metadata']={'offColors':{'faces':deepcopy(_colors(addition,'faces')),'cells':[]}}
        if 'coordinateUnits' in base.get('metadata',{}):copy['metadata']['coordinateUnits']=base['metadata']['coordinateUnits']
        copy['numeric']={'mode':'float64-approximate','certified':False};copy['validation']=validate(copy);copy['fingerprint']=identity(copy)
        _source(copy);models.append(copy);placements.append({'vertexId':v,'axis':axis.tolist(),'rotation':rotation.tolist()})
    def combine(items):
        if len(items)==1:return items[0]
        middle=len(items)//2;result=add_models(combine(items[:middle]),combine(items[middle:]))
        result['id']=_id([identity(result),params])
        for k,component in enumerate(result['components']):component['id']=_id([result['id'],k])
        return result
    result=combine(models)
    from .construction_names import surgery_name
    result['name']=surgery_name(base,params)
    result['metadata']['faceSurgery']={'mode':'vertices','placements':placements,'welded':False,
        'intersectionPolicy':'literal compound; overlaps and coincidences retained; no union volume inferred',
        'axisDefinition':'addition selected-face inward normal to base vertex minus vertex mean'}
    result['provenance']={'operation':OPERATION,'algorithmVersion':VERSION,'parameters':deepcopy(params)}
    return result


def dispatch_surgery(request):
    _json_bytes(request,32*1024*1024)
    if request.get('algorithmVersion',VERSION)!=VERSION:raise GeometryError('Unsupported face surgery algorithm version.')
    if set(request)-{'op','model','params','id','algorithmVersion'}:raise GeometryError('Unknown face surgery request fields.')
    params=request.get('params');base=request.get('model')
    allowed={'mode','face_id','vertex_id','piece','addition','addition_face_id','library_key','height','scale','cycle_offset','all_of_type','inset','blend'}
    if type(params) is not dict or set(params)-allowed:raise GeometryError('Unknown or malformed face surgery parameters.')
    for key in ('all_of_type','blend'):
        if key in params and type(params[key]) is not bool:raise GeometryError(key+' requires a boolean.')
    if params.get('mode','augment') not in ('augment','excavate','drill','vertices'):raise GeometryError('Unknown face surgery mode.')
    proof,_=_source(base)
    unit=base.get('metadata',{}).get('coordinateUnits')
    if unit is not None and (type(unit) is not str or unit not in ('model','mm','cm','m','in','ft')):
        raise GeometryError('Surgery source coordinate units are unsupported; convert explicitly first.')
    if len(base['faces'])>128:raise GeometryError('Surgery source exceeds 128 faces.')
    for f in base['faces']:
        if len(f)>64:raise GeometryError('Surgery source face exceeds 64 vertices.')
    mode=params.get('mode','augment')
    if mode=='drill':return _drill(base,proof,params)
    if mode=='vertices':return _vertices(base,proof,params)
    return _caps(base,proof,params)
