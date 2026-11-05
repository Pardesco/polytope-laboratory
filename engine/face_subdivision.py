"""Literal planar convex-face refinement; no hull, weld or star filling."""
from copy import deepcopy
import math
import numpy as np
from .geometry import GeometryError, identity, validate
from .history import _json_bytes

VERSION='0.1.0'
EPS=1e-8


def source_faces(source, convex=False):
    _json_bytes(source,16*1024*1024)
    if (type(source) is not dict or source.get('dimension')!=3 or source.get('embeddingDimension',3)!=3
            or source.get('interpretation') not in ('convex-polytope','generalized-complex')
            or source.get('components') is not None or source.get('cells')):
        raise GeometryError('Choose a single intrinsic 3D polygonal source, without compound components or cells.')
    if not 4<=len(source.get('vertices',[]))<=2048 or not 1<=len(source.get('faces',[]))<=4096:
        raise GeometryError('Face construction supports 4..2048 vertices and 1..4096 faces.')
    from .compounds import _check_source
    _check_source(source)
    p=np.asarray(source['vertices'],dtype=float)
    if p.shape!=(len(source['vertices']),3) or not np.isfinite(p).all() or np.max(np.abs(p))>1e100:
        raise GeometryError('Face construction requires finite bounded XYZ coordinates.')
    span=float(np.max(np.ptp(p,axis=0)))
    if span<=0:raise GeometryError('Source has no spatial extent.')
    normals=[]
    for fi,face in enumerate(source['faces']):
        if not 3<=len(face)<=128:raise GeometryError('Faces must contain 3..128 vertices.')
        q=(p[face]-p[face].mean(axis=0))/span
        _,s,vt=np.linalg.svd(q,full_matrices=False)
        if s[1]<EPS or s[-1]>EPS:
            raise GeometryError(f'Face {fi} is nonplanar or degenerate.')
        normal=vt[-1]
        # Every directed side must support the entire polygon on the same side.
        # This rejects pentagrams as well as concave and repeated boundary turns.
        signs=[]
        for i in range(len(face)):
            a,b=q[i],q[(i+1)%len(face)]
            side=np.cross(b-a,q-a)@normal
            if np.linalg.norm(b-a)<EPS or max(side)>EPS and min(side)<-EPS:
                raise GeometryError(f'Face {fi}: star/self-crossing or concave faces are unsupported; choose simple convex planar faces.')
            signs.append(1 if max(side)>EPS else -1)
        if len(set(signs))!=1:
            raise GeometryError(f'Face {fi}: star/self-crossing or degenerate face boundary is unsupported.')
        normal*=signs[0]
        if np.dot(normal,p[face].mean(axis=0)-p.mean(axis=0))<0:normal=-normal
        normals.append(normal)
    if convex:
        if source.get('interpretation')!='convex-polytope':raise GeometryError('This action requires a closed convex 3D polyhedron.')
        from .convex_classification import analyze_convex_boundary
        if analyze_convex_boundary(source)['status']!='passed':raise GeometryError('Source is not a verified complete convex boundary.')
        from .geometric_fitting import _qualify
        _qualify(deepcopy(source),p.mean(axis=0))
    return p,normals


def persist_model(result):
    from .formats import validate_project
    return validate_project({'format':'polytope-laboratory','version':1,'active':0,
        'documents':[{'cursor':0,'states':[{'model':result,'view':{}}]}]})['documents'][0]['states'][0]['model']


def subdivide_faces(source, method='centroid', height=0):
    if method not in ('centroid','kis','midpoint'):raise GeometryError('Choose centroid, kis or midpoint face subdivision.')
    if type(height) not in (int,float) or not math.isfinite(height) or not 0<=height<=1e6:
        raise GeometryError('Kis height must be a finite nonnegative source-unit distance, at most 1e6.')
    if method!='kis' and height!=0:raise GeometryError('Only kis subdivision accepts a nonzero height.')
    p,normals=source_faces(source,convex=height>0)
    vertices=p.tolist();faces=[];parents=[];midpoints={}
    bound=len(vertices)+len(source['faces'])+(len(source['edges']) if method=='midpoint' else 0)
    if bound>4096 or sum(len(f) for f in source['faces'])>16384:
        raise GeometryError('Subdivision would exceed 4096 vertices or 16384 face corners.')
    def midpoint(a,b):
        key=tuple(sorted((a,b)))
        if key not in midpoints:
            midpoints[key]=len(vertices);vertices.append(((p[a]+p[b])/2).tolist())
        return midpoints[key]
    for fi,face in enumerate(source['faces']):
        if method=='midpoint':
            mids=[midpoint(a,b) for a,b in zip(face,face[1:]+face[:1])]
            if len(face)==3:
                batch=[[face[i],mids[i],mids[i-1]] for i in range(3)]+[mids]
            else:
                center=len(vertices);vertices.append(p[face].mean(axis=0).tolist())
                batch=[[v,mids[i],center,mids[i-1]] for i,v in enumerate(face)]
        else:
            center=len(vertices);vertices.append((p[face].mean(axis=0)+height*normals[fi]).tolist())
            batch=[[a,b,center] for a,b in zip(face,face[1:]+face[:1])]
        faces.extend(batch);parents.extend([fi]*len(batch))
    boundary={tuple(sorted((a,b))) for f in source['faces'] for a,b in zip(f,f[1:]+f[:1])}
    wires={tuple(sorted(e)) for e in source['edges']}-boundary
    edges=sorted(wires|{tuple(sorted((a,b))) for f in faces for a,b in zip(f,f[1:]+f[:1])})
    metadata={'family':'Face subdivision','faceSubdivision':{'algorithmVersion':VERSION,
        'method':method,'height':height,'sourceFingerprint':identity(source),'sourceFaceIds':parents,
        'sourceMetadata':deepcopy(source.get('metadata',{})),
        'numericPolicy':'float64 approximate; literal subdivision; no hull or weld'}}
    from .sphere_targets import reference_spheres
    metadata['faceSubdivision']['referenceSpheres']=reference_spheres(source)
    if 'coordinateUnits' in source.get('metadata',{}):metadata['coordinateUnits']=source['metadata']['coordinateUnits']
    colors=source.get('metadata',{}).get('offColors',{})
    if type(colors.get('faces')) is list and len(colors['faces'])==len(source['faces']):
        metadata['offColors']={'faces':[deepcopy(colors['faces'][fi]) for fi in parents],'cells':[]}
    result={'id':'pending','name':method.capitalize()+' subdivision of '+source.get('name','source'),
        'dimension':3,'embeddingDimension':3,'interpretation':'generalized-complex','vertices':vertices,
        'edges':[list(e) for e in edges],'faces':faces,'cells':[],
        'numeric':{'mode':'float64-approximate','certified':False,'tolerance':EPS},'metadata':metadata,
        'provenance':{'operation':'subdivide-faces','algorithmVersion':VERSION,'sourceModelId':source.get('id'),
            'parameters':{'method':method,'height':height},'convexified':False}}
    # Zero-height subdivisions have coplanar subfaces, so retain literal incidence
    # as a generalized surface. Positive kis can independently qualify as convex.
    if height>0:
        from .geometric_fitting import _qualify
        checked=deepcopy(result);checked['interpretation']='convex-polytope'
        try:_qualify(checked,np.asarray(vertices).mean(axis=0))
        except GeometryError:pass
        else:result=checked
    result['id']='face-subdivision-'+identity(result)
    result['metadata']['faceSubdivision']['resultFingerprint']=identity(result)
    result['validation']=validate(result)
    if not result['validation']['passed']:raise GeometryError('Subdivision failed native incidence validation.')
    return persist_model(result)
