"""GPL-3.0-or-later. Source-cycle density and algebraic 3D measures.

Closed orientable signed surface chains, including star face cycles. No hull,
ordinary interior, union volume, unsigned filled area, or material density.
"""
from copy import deepcopy
from collections import defaultdict
import math,json,csv,io
import numpy as np
from .geometry import GeometryError,identity,validate
from .automatic_faceting import _hash
from .automatic_faceting_workflow import _portable,_structured

VERSION='0.26.0-generalized-density'
EPS=1e-8
LIMITS=dict(vertices=10000,faces=2000,faceCorners=512,boundaryCorners=50000,fanTriangles=50000)
UNITS=('model','mm','cm','m','in','ft')

def _require(value,message):
    if not value:raise GeometryError('Generalized density: '+message)
def source_hash(source):return _hash({k:v for k,v in source.items() if k not in ('fingerprint','validation','measure')})
def _stop(cancelled):
    if cancelled is not None and cancelled():raise GeometryError('Generalized density canceled before publication.')
def _cross(a,b):return float(a[0]*b[1]-a[1]*b[0])
def _face_winding(point,cycle,tol):
    winding=0
    for a,b in zip(cycle,np.roll(cycle,-1,axis=0)):
        edge=b-a;length=float(np.linalg.norm(edge));_require(length>tol,'zero-length source face edge is unresolved.')
        side=_cross(edge,point-a)
        if abs(side)<=tol*length and float((point-a)@(point-b))<=tol**2:return None
        if a[1]<=point[1]<b[1] and side>0:winding+=1
        if b[1]<=point[1]<a[1] and side<0:winding-=1
    return winding
def _angle(point,triangles):
    if not triangles:return 0.
    r=np.asarray(triangles)-point;scale=np.max(abs(r),axis=(1,2));r=r/scale[:,None,None]
    a,b,c=r[:,0],r[:,1],r[:,2];la=np.linalg.norm(a,axis=1);lb=np.linalg.norm(b,axis=1);lc=np.linalg.norm(c,axis=1)
    top=np.einsum('ij,ij->i',a,np.cross(b,c));bottom=la*lb*lc+np.einsum('ij,ij->i',a,b)*lc+np.einsum('ij,ij->i',b,c)*la+np.einsum('ij,ij->i',c,a)*lb
    return float(np.sum(2*np.arctan2(top,bottom)))

def density_info(model,point=None,orientation='positive-algebraic-volume',unit='model',*,cancelled=None):
    _require(type(model) is dict,'source must be a native model object.')
    original=model;ownership=source_hash(model);source=_portable(model,32*1024*1024);_stop(cancelled)
    _require(type(source) is dict and type(source.get('id')) is str and 1<=len(source['id'])<=128,'source needs its bounded literal ID.')
    _require(source.get('dimension')==3 and source.get('embeddingDimension',3)==3,'requires an intrinsic 3D source; no 4D volume is assigned.')
    _require(orientation in ('source-anchor','positive-algebraic-volume'),'choose source-anchor or positive-algebraic-volume orientation.')
    _require(unit in UNITS,'coordinate unit must be an existing model/mm/cm/m/in/ft declaration; no conversion is implicit.')
    vertices=source.get('vertices');faces=source.get('faces');edges=source.get('edges')
    _require(type(vertices) is list and type(faces) is list and type(edges) is list and all(type(f) is list for f in faces),'source needs literal vertex/edge/ordered face arrays.')
    _require(4<=len(vertices)<=LIMITS['vertices'] and 4<=len(faces)<=LIMITS['faces'] and len(edges)<=LIMITS['boundaryCorners'] and sum(map(len,faces))<=LIMITS['boundaryCorners'] and all(len(f)<=LIMITS['faceCorners'] for f in faces),'source exceeds bounded vertex/face/corner work limits.')
    _require(validate(source)['passed'],'original source geometry/incidence is invalid; no replacement is inferred.')
    raw=np.asarray(vertices,dtype=float);origin=raw.mean(0);span=float(np.max(np.ptp(raw,axis=0)));_require(math.isfinite(span) and span>0,'source extent is numerically unresolved.')
    p=(raw-origin)/span;_,singular,_=np.linalg.svd(p,full_matrices=False);_require(singular[2]>EPS,'source has no full-dimensional 3D surface realization.')
    if point is None:point=origin.tolist()
    _require(type(point) is list and len(point)==3 and all(type(x) in (int,float) and math.isfinite(x) and abs(x)<=1e100 for x in point),'declared point needs three bounded finite source coordinates.')
    query=(np.asarray(point,dtype=float)-origin)/span;_require(np.isfinite(query).all(),'declared point normalization overflowed.')
    edge_lookup={tuple(sorted(e)):i for i,e in enumerate(edges)};owners=defaultdict(list);neighbor={f:[] for f in range(len(faces))}
    for f,cycle in enumerate(faces):
        for a,b in zip(cycle,cycle[1:]+cycle[:1]):owners[edge_lookup[tuple(sorted((a,b)))]].append((f,1 if a<b else -1))
    _require(set(owners)==set(range(len(edges))) and all(len(v)==2 and v[0][0]!=v[1][0] for v in owners.values()),'signed density requires exactly two distinct incident faces at every source edge, including no unused/open/four-face edge.')
    for edge,pair in owners.items():
        (a,da),(b,db)=pair;relation=-da*db;neighbor[a].append((b,relation,edge));neighbor[b].append((a,relation,edge))
    signs={};groups=[]
    for root in range(len(faces)):
        if root in signs:continue
        signs[root]=1;todo=[root];group=[]
        while todo:
            _stop(cancelled);f=todo.pop();group.append(f)
            for g,relation,edge in neighbor[f]:
                wanted=signs[f]*relation
                _require(g not in signs or signs[g]==wanted,f'nonorientable incidence at source edge {edge}; no signed branch is assigned.')
                if g not in signs:signs[g]=wanted;todo.append(g)
        groups.append(sorted(group))
    frames=[];triangles=[];triangle_count=0;areas=[];volumes=[];diagnostics=[]
    for f,cycle in enumerate(faces):
        _stop(cancelled);cloud=p[cycle];relative=cloud-cloud[0];_,s,axes=np.linalg.svd(relative,full_matrices=False)
        _require(s[1]>EPS and s[-1]<=EPS,f'face {f} needs a nondegenerate planar ordered cycle.')
        normal=axes[-1];normal=normal if normal[np.argmax(abs(normal))]>0 else -normal
        u=axes[0];v=np.cross(normal,u);basis=np.asarray([u,v]);xy=relative@basis.T
        _face_winding(np.array([1e6,1e6]),xy,EPS*8) # verifies source boundary metric lengths
        fan=[cloud[[0,i,i+1]] for i in range(1,len(cycle)-1) if np.linalg.norm(np.cross(cloud[i]-cloud[0],cloud[i+1]-cloud[0]))>EPS**2]
        triangle_count+=len(fan);_require(triangle_count<=LIMITS['fanTriangles'],'signed fan work exceeds 50000 triangles.')
        area=np.sum(np.cross(cloud,np.roll(cloud,-1,axis=0)),axis=0)/2
        if np.linalg.norm(area)<=EPS**2:diagnostics.append(f'Face {f} has zero algebraic vector area; signed face regions can cancel. No unsigned filled area is reported.')
        frames.append((cloud,normal,basis,xy));triangles.append(fan);areas.append(area);volumes.append(float(cloud[0]@area)/3)
    components=[];orientation_ambiguous=False
    for i,group in enumerate(groups):
        volume=sum(signs[f]*volumes[f] for f in group);factor=1
        if orientation=='positive-algebraic-volume':
            if abs(volume)<=EPS**2:
                orientation_ambiguous=True;diagnostics.append(f'Component {i} has zero/unresolved algebraic volume: positive-volume orientation is ambiguous. Choose source-anchor explicitly.')
            elif volume<0:factor=-1
        for f in group:signs[f]*=factor
        components.append(dict(id=i,rootFace=group[0],sourceFaceIds=group,anchorInputCycle=faces[group[0]],anchorSign=signs[group[0]],orientationQualified=not (orientation=='positive-algebraic-volume' and abs(volume)<=EPS**2),algebraicVolume=volume*factor*span**3))
    face_records=[];on_surface=[];angles=[]
    for f,(cloud,normal,basis,xy) in enumerate(frames):
        _stop(cancelled);near=abs(float((query-cloud[0])@normal))<=EPS*8
        if near:
            winding=_face_winding((query-cloud[0])@basis.T,xy,EPS*8)
            if winding is None or winding!=0:on_surface.append(dict(sourceFaceId=f,faceWinding=winding,atLiteralBoundary=winding is None))
            contribution=0. # outside the signed filled cycle in its own plane
        else:contribution=signs[f]*_angle(query,triangles[f])
        angles.append(contribution)
        face_records.append(dict(sourceFaceId=f,sourceVertexIds=cycle,orientationSign=signs[f],areaVector=(areas[f]*signs[f]*span**2).tolist(),
            absoluteAlgebraicArea=float(np.linalg.norm(areas[f]))*span**2,algebraicVolumeContribution=signs[f]*volumes[f]*span**3,
            solidAngleSteradians=None if near and (winding is None or winding!=0) else contribution))
    winding=float(math.fsum(angles)/(4*math.pi));density=None;signed=None;status='qualified'
    if on_surface:status='on-source-surface';diagnostics.append('Declared point is on a literal boundary or nonzero-winding source face region; density at this point is undefined.')
    elif orientation_ambiguous:status='ambiguous-orientation'
    elif not math.isfinite(winding) or abs(winding-round(winding))>1e-6:status='numerically-unresolved';diagnostics.append('Signed solid-angle sum is not within tolerance of an integer; no density is rounded into existence.')
    else:signed=int(round(winding));density=abs(signed)
    component_angles=[math.fsum(angles[f] for f in c['sourceFaceIds'])/(4*math.pi) for c in components]
    if status=='qualified' and any(not math.isfinite(a) or abs(a-round(a))>1e-6 for a in component_angles):
        status='numerically-unresolved';signed=density=None;diagnostics.append('A closed source component has an unresolved noninteger solid-angle sum; total cancellation cannot qualify it.')
    for c,angle in zip(components,component_angles):
        c['windingNumberApproximate']=None if on_surface else angle
        c['signedDensity']=int(round(angle)) if status=='qualified' and abs(angle-round(angle))<=1e-6 else None
    vector=np.sum([r['areaVector'] for r in face_records],axis=0)
    measures=dict(orientedAlgebraicVolume=math.fsum(c['algebraicVolume'] for c in components) if not orientation_ambiguous else None,
        absoluteAlgebraicFaceAreaSum=math.fsum(r['absoluteAlgebraicArea'] for r in face_records),closedChainVectorArea=vector.tolist(),bulkUnionVolume=None,unsignedFilledSurfaceArea=None,
        lengthUnit=unit,areaUnit=unit+'^2',volumeUnit=unit+'^3')
    result=dict(format='generalized-density-info',version=1,algorithmVersion=VERSION,sourceId=source['id'],sourceFingerprint=identity(source),sourceHash=ownership,
        parameters=dict(point=point,orientation=orientation,unit=unit),status=status,pointDensity=dict(signedWinding=signed,densityMagnitude=density,windingNumberApproximate=winding if not on_surface else None,onSurface=on_surface,units='dimensionless'),
        measures=measures,components=components,faces=face_records,diagnostics=diagnostics,
        definitions=dict(density='Signed degree of the coherently oriented source surface about the declared off-surface point; magnitude is reported separately.',
            volume='Oriented algebraic surface integral, equivalently signed tetrahedron fan contributions or integral of spatial winding with multiplicity; not ordinary filled/union bulk volume.',
            area='Sum of magnitudes of ordered face-cycle algebraic area vectors; neither unsigned filled star-region area nor a union surface area.',
            orientation='Coherent incidence signs anchored to each lowest source face; optional per-component positive algebraic volume flip. Literal input cycles remain unchanged.'),
        numericMode='float64-approximate',validation=dict(sourceGeometryUnchanged=True,closedOrientedChain=True,ordinaryFilledInteriorAsserted=False,integerTolerance=1e-6,sourceContactTolerance=span*EPS*8,
            fanTriangleCount=triangle_count,sourceEdgesChecked=len(owners),limits=LIMITS))
    _require(all(math.isfinite(x) for r in face_records for x in [r['absoluteAlgebraicArea'],r['algebraicVolumeContribution'],*r['areaVector']]),'scaled algebraic measure overflowed.')
    _require(all(math.isfinite(x) for x in [*vector,measures['absoluteAlgebraicFaceAreaSum'],*[c['algebraicVolume'] for c in components]]),'scaled total measure overflowed.')
    _stop(cancelled);_require(source_hash(original)==ownership,'source attributes changed before publication.')
    result['receiptHash']=_hash(result);return result

def compact_density_state(source,report):
    return dict(format='generalized-density-info-state',version=1,sourceId=source['id'],sourceHash=source_hash(source),parameters=deepcopy(report['parameters']),report=deepcopy(report))
def validate_density_state(source,value,unit=None,*,cancelled=None):
    value=_portable(value,4*1024*1024)
    _require(type(value) is dict and set(value)=={'format','version','sourceId','sourceHash','parameters','report'} and value['format']=='generalized-density-info-state' and value['version']==1 and value['sourceId']==source['id'] and value['sourceHash']==source_hash(source),'saved evidence belongs to another source or unsupported schema.')
    parameters=value['parameters'];_require(type(parameters) is dict and set(parameters)=={'point','orientation','unit'},'saved query parameters are malformed.')
    if unit is not None:_require(parameters['unit']==unit,'saved evidence units changed; recompute explicitly.')
    current=density_info(source,**parameters,cancelled=cancelled);_require(_hash(current)==_hash(value['report']),'saved evidence differs from actual source reconstruction; recompute explicitly.')
    return deepcopy(value)
def density_csv(report):
    out=io.StringIO(newline='');writer=csv.writer(out);writer.writerow(['source_id','source_hash','entity','id','quantity','value','units','definition'])
    source=report['sourceId'];source="'"+source if source[:1] in ('=','+','-','@') else source
    def row(entity,index,quantity,value,unit,definition):writer.writerow([source,report['sourceHash'],entity,index,quantity,'' if value is None else value,unit,definition])
    row('point','all','point_status',report['status'],'text','Qualified off-surface point, on-source-surface, ambiguous orientation, or numerically unresolved.')
    row('source','all','orientation_policy',report['parameters']['orientation'],'text',report['definitions']['orientation'])
    row('source','all','receipt_hash',report['receiptHash'],'text','Digest of complete native measurement evidence.')
    for axis,value in zip('xyz',report['parameters']['point']):row('point','all','coordinate_'+axis,value,report['measures']['lengthUnit'],'Declared point in original source coordinates.')
    row('point',' '.join(map(str,report['parameters']['point'])),'signed_density',report['pointDensity']['signedWinding'],'dimensionless',report['definitions']['density'])
    row('point','all','density_magnitude',report['pointDensity']['densityMagnitude'],'dimensionless','Magnitude of qualified signed degree; undefined at unqualified points.')
    row('source','all','algebraic_volume',report['measures']['orientedAlgebraicVolume'],report['measures']['volumeUnit'],report['definitions']['volume'])
    row('source','all','absolute_algebraic_face_area_sum',report['measures']['absoluteAlgebraicFaceAreaSum'],report['measures']['areaUnit'],report['definitions']['area'])
    for f in report['faces']:
        row('face',f['sourceFaceId'],'absolute_algebraic_area',f['absoluteAlgebraicArea'],report['measures']['areaUnit'],report['definitions']['area'])
        row('face',f['sourceFaceId'],'algebraic_volume_contribution',f['algebraicVolumeContribution'],report['measures']['volumeUnit'],report['definitions']['volume'])
    return out.getvalue()
@_structured
def dispatch_density(request,*,cancelled=None):
    original=request;ownership=_hash(request);request=_portable(request,32*1024*1024)
    _require(type(request) is dict and set(request)-{'op','model','params','id','algorithmVersion'}==set() and {'op','model','params'}<=set(request) and request.get('algorithmVersion',VERSION)==VERSION,'use exact bounded op/model/params and supported version.')
    _require(type(request['params']) is dict,'params must be an object.')
    if request['op']=='generalized-density-info':
        _require(set(request['params'])<= {'point','orientation','unit'},'unsupported density parameters.')
        report=density_info(request['model'],**request['params'],cancelled=cancelled)
    elif request['op']=='generalized-density-restore':
        _require(set(request['params'])=={'state'},'restore requires a saved source-bound state.')
        report=validate_density_state(request['model'],request['params']['state'],cancelled=cancelled)['report']
    else:raise GeometryError('Unknown generalized density operation.')
    result=dict(report=report,state=compact_density_state(request['model'],report),csv=density_csv(report))
    _stop(cancelled);_require(_hash(original)==ownership,'request source/query changed before publication.');return _portable(result,64*1024*1024)
