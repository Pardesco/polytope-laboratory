"""Source-owned projective polarity and bounded affine wire display.

No point at infinity is encoded as a large finite model vertex. Ideal links
use the whole projective supporting line, with both affine directions shown.
Faces retain cyclic incidence; this module does not choose infinite fillings.
"""
from collections import defaultdict
from copy import deepcopy
import hashlib,json,math
import numpy as np
from .geometry import GeometryError,identity,validate
from .history import _json_bytes

VERSION='0.1.0'
OPERATION='projective-incidence-dual'
EPS=1e-9
IDEAL_EPS=1e-12

def digest(value):
    _json_bytes(value,32*1024*1024)
    def portable(item):
        if type(item) is dict:return ['object',[[k,portable(v)] for k,v in sorted(item.items())]]
        if type(item) is list:return ['array',[portable(v) for v in item]]
        if type(item) in (int,float):
            try:number=float(item)
            except OverflowError as error:raise GeometryError('Source owner numbers exceed binary64.') from error
            if not math.isfinite(number) or type(item) is int and int(number)!=item:raise GeometryError('Source owner integers need lossless binary64 representation.')
            return ['number',(number if number else 0.).hex()]
        return ['scalar',item]
    raw=json.dumps(portable(value),ensure_ascii=False,allow_nan=False,separators=(',',':')).encode('utf-8')
    if len(raw)>32*1024*1024:raise GeometryError('Portable projective source ownership exceeds 32 MiB.')
    return hashlib.sha256(raw).hexdigest()

def settings(value):
    if type(value) is not dict or set(value)-{'version','center','radius','clipBound'} or (type(value.get('version',1)) is not int or value.get('version',1)!=1):
        raise GeometryError('Projective dual requires version1 center/radius/clipBound settings.')
    center=value.get('center')
    def number(x):return type(x) in (int,float) and math.isfinite(x)
    if center is not None and (type(center) is not list or len(center)!=3 or not all(number(x) and abs(x)<=1e12 for x in center)):
        raise GeometryError('Projective dual center requires three bounded finite source coordinates.')
    radius=value.get('radius',1);bound=value.get('clipBound',4)
    if not number(radius) or not 1e-6<=radius<=1e6 or not number(bound) or not 1e-6<=bound<=1e9:
        raise GeometryError('Reciprocal radius must be 1e-6..1e6; affine clipping half-width 1e-6..1e9 source units.')
    return {'version':1,'center':deepcopy(center),'radius':radius,'clipBound':bound}

def context(value):
    if type(value) is not dict or set(value)-{'notes','unit','documentMetadata'} or type(value.get('notes','')) is not str or value.get('unit','model') not in ('model','mm','cm','m','in','ft'):
        raise GeometryError('Projective dual source context needs literal notes and coordinate units.')
    result={'notes':value.get('notes',''),'unit':value.get('unit','model'),'documentMetadata':deepcopy(value.get('documentMetadata'))};digest(result);return result

def source_binding(source,source_context):
    return {'sourceModelId':source.get('id'),'sourceFingerprint':identity(source),'sourceSnapshotSha256':digest(source),'sourceContextSha256':digest(context(source_context))}

def links(source):
    edge_faces=defaultdict(list);vertex_faces=defaultdict(set)
    for fi,cycle in enumerate(source['faces']):
        for vi in cycle:vertex_faces[vi].add(fi)
        for a,b in zip(cycle,cycle[1:]+cycle[:1]):edge_faces[tuple(sorted((a,b)))].append(fi)
    keys=[tuple(sorted(edge)) for edge in source['edges']]
    if len(set(keys))!=len(keys) or set(keys)!=set(edge_faces) or any(len(fs)!=2 or len(set(fs))!=2 for fs in edge_faces.values()):
        raise GeometryError('Projective polarity requires two distinct face incidences per literal source edge; nonordinary edge occurrences need a separate object class.')
    cycles=[]
    for vi in range(len(source['vertices'])):
        adjacency=defaultdict(list)
        for edge,faces in edge_faces.items():
            if vi in edge:
                a,b=faces;adjacency[a].append(b);adjacency[b].append(a)
        if len(adjacency)<3 or set(adjacency)!=vertex_faces[vi] or any(len(ns)!=2 or len(set(ns))!=2 for ns in adjacency.values()):
            raise GeometryError(f'Source vertex {vi} has a nonordinary/repeated link; no ordinary projective surface is asserted.')
        first=min(adjacency);order=[first];previous=first;current=min(adjacency[first])
        while current!=first:
            if current in order:raise GeometryError(f'Source vertex {vi} has a repeated cyclic link.')
            order.append(current);previous,current=current,next(n for n in adjacency[current] if n!=previous)
        if set(order)!=vertex_faces[vi]:raise GeometryError(f'Source vertex {vi} has disconnected cyclic links.')
        cycles.append(order)
    return keys,edge_faces,cycles

def segment_clip(a,b,bound):
    """Clip positive-w homogeneous segment against six affine cube planes."""
    lo,hi=0.,1.;delta=b-a
    for axis in range(3):
        for sign in (-1,1):
            initial=bound*a[3]+sign*a[axis];slope=bound*delta[3]+sign*delta[axis]
            if abs(slope)<=1e-15:
                if initial<0:return []
            elif slope>0:lo=max(lo,-initial/slope)
            else:hi=min(hi,-initial/slope)
    if lo>hi or hi<0 or lo>1:return []
    points=[]
    for t in (max(0,lo),min(1,hi)):
        h=a+t*delta
        if h[3]<=0:raise GeometryError('Clipped finite segment lost its affine chart.')
        points.append((h[:3]/h[3]).tolist())
    return points

def line_clip(anchor,direction,bound):
    lo,hi=-math.inf,math.inf
    for axis in range(3):
        if abs(direction[axis])<=1e-14:
            if abs(anchor[axis])>bound+EPS*bound:return []
        else:
            t0=(-bound-anchor[axis])/direction[axis];t1=(bound-anchor[axis])/direction[axis]
            lo=max(lo,min(t0,t1));hi=min(hi,max(t0,t1))
    if lo>hi:return []
    return [(anchor+t*direction).tolist() for t in (lo,hi)]

def projective_dual(source,options=None,source_context=None):
    original=deepcopy(source);digest(original)
    if type(original) is not dict or original.get('dimension')!=3 or original.get('embeddingDimension',3)!=3 or not validate(original)['passed']:
        raise GeometryError('Projective reciprocal requires a validated intrinsic 3D source complex.')
    if not 4<=len(original['faces'])<=2048 or len(original['vertices'])>4096 or len(original['edges'])>8192 or any(len(f)>256 for f in original['faces']):
        raise GeometryError('Projective source exceeds bounded plane/incidence work limits.')
    opts=settings(options or {});ctx=context(source_context or {});points=np.asarray(original['vertices'],float)
    if not np.isfinite(points).all() or np.max(np.abs(points))>1e12:raise GeometryError('Projective source requires bounded finite coordinates.')
    origin=points.mean(0) if opts['center'] is None else np.asarray(opts['center'],float);relative=points-origin;span=float(np.max(np.ptp(points,axis=0)))
    if span<=0:raise GeometryError('Projective source has no resolved spatial span.')
    keys,edge_faces,cycles=links(original);vertices=[];hs=[]
    colors=original.get('metadata',{}).get('offColors',{}).get('faces',[])
    radius2=opts['radius']**2
    for fi,cycle in enumerate(original['faces']):
        cloud=relative[cycle];_,singular,vt=np.linalg.svd((cloud-cloud[0])/span,full_matrices=False)
        if singular[1]<=EPS:raise GeometryError(f'Source face {fi} has an unresolved plane.')
        n=vt[-1];distance=float(n@cloud.mean(0));residual=float(np.max(np.abs(cloud@n-distance)))
        if residual>span*EPS:raise GeometryError(f'Source face {fi} is nonplanar.')
        ideal=abs(distance)<=span*IDEAL_EPS
        if (not ideal and distance<0) or (ideal and n[int(np.argmax(np.abs(n)))]<0):n=-n;distance=-distance
        h=np.array([*(radius2*n),0. if ideal else distance]);h=h/max(float(np.max(np.abs(h))),np.finfo(float).tiny);hs.append(h)
        vertices.append({'id':fi,'sourceFace':fi,'homogeneous':h.tolist(),'kind':'ideal-numerical' if ideal else 'finite','planeNormal':n.tolist(),'planeOffset':distance,'planeFitResidual':residual,'idealTolerance':span*IDEAL_EPS,'finitePoint':None if ideal else (origin+h[:3]/h[3]).tolist(),'rawFaceColor':deepcopy(colors[fi] if fi<len(colors) else None)})
    edges=[];bound=opts['clipBound']
    for ei,key in enumerate(keys):
        a,b=edge_faces[key];ha,hb=hs[a],hs[b];ideal_count=int(ha[3]==0)+int(hb[3]==0)
        if ideal_count==2:clipped=[];kind='ideal-line';status='outside-affine-chart'
        elif ideal_count==1:
            finite=hb if ha[3]==0 else ha;ideal=ha if ha[3]==0 else hb
            clipped=line_clip(finite[:3]/finite[3],ideal[:3]/np.linalg.norm(ideal[:3]),bound);kind='projective-full-line';status='visible' if clipped else 'outside-clip'
        else:
            clipped=segment_clip(ha,hb,bound);kind='finite-segment';status='visible' if clipped else 'outside-clip'
        coincident=bool(min(np.linalg.norm(ha-hb),np.linalg.norm(ha+hb))<=EPS)
        if coincident:clipped=[];status='coincident-projective-identities'
        if clipped and np.linalg.norm(np.asarray(clipped[0])-clipped[1])<=bound*1e-12:clipped=[];status='point-intersection'
        edges.append({'id':ei,'sourceEdge':ei,'sourceVertices':list(original['edges'][ei]),'dualVertices':[a,b],'kind':kind,'status':status,'clipPoints':[(origin+np.asarray(p)).tolist() for p in clipped],'coincidentIdentities':coincident})
    faces=[];maximum=0.
    edge_index={key:i for i,key in enumerate(keys)}
    for vi,cycle in enumerate(cycles):
        residual=max(abs(float(relative[vi]@hs[fi][:3]-radius2*hs[fi][3])) for fi in cycle);maximum=max(maximum,residual)
        faces.append({'id':vi,'sourceVertex':vi,'dualVertices':cycle,'sourceEdges':[edge_index[k] for k in keys if vi in k],'homogeneousPlane':[*(relative[vi]/radius2),-1.],'polarityResidual':residual,'hasIdealVertices':any(hs[fi][3]==0 for fi in cycle)})
    if maximum>max(1.,span,radius2)*1e-7:raise GeometryError('Projective face/vertex polarity residual is unresolved.')
    groups=[];seen=set()
    for a in range(len(hs)):
        if a in seen:continue
        group=[b for b in range(a,len(hs)) if min(np.linalg.norm(hs[a]-hs[b]),np.linalg.norm(hs[a]+hs[b]))<=EPS];seen.update(group)
        if len(group)>1:
            groups.append(group)
            for fi in group:vertices[fi]['coincidentSourceFaceIds']=group[:]
    return {'version':1,'algorithmVersion':VERSION,'objectClass':'projective-incidence-complex','numeric':{'mode':'float64-approximate','certified':False,'idealTolerance':span*IDEAL_EPS},'binding':source_binding(original,ctx),'settings':opts,'resolvedCenter':origin.tolist(),'sourceContext':ctx,'sourceAttributes':deepcopy(original.get('metadata',{})),'vertices':vertices,'edges':edges,'faces':faces,'coincidentPlaneIdentityGroups':groups,'maximumPolarityResidual':maximum,'display':{'kind':'clipped-affine-wireframe','clipShape':'cube','halfWidth':bound,'units':ctx['unit'],'idealEdgePolicy':'full supporting projective line: both affine directions','idealIdealPolicy':'retained at infinity; no affine occurrence','faceFill':'unassigned; cycles retained, infinite winding not inferred','geometryModel':False,'measureAssigned':False,'convexified':False}}

def dispatch_projective(request):
    if set(request)-{'op','params','model','id'} or type(request.get('params')) is not dict:raise GeometryError('Projective reciprocal request needs bounded source parameters.')
    params=deepcopy(request['params']);ctx=params.pop('sourceContext',{});return projective_dual(request.get('model'),params,ctx)
