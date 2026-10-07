"""Radial sphere projection with literal source incidence and planarity checks.

The Stella Modify > Project onto Sphere workflow refuses newly nonplanar
faces (https://www.software3d.com/Manual/Subdivide.php, section 9.12).
No face/cell is triangulated or replaced by a hull to make projection succeed.
"""
from copy import deepcopy
import hashlib,json,math
import numpy as np
from .geometry import GeometryError,identity,validate

VERSION='0.1.0'
EPS=1e-8


def _rank(points):
    relative=points-points.mean(axis=0);scale=float(np.max(np.ptp(points,axis=0)))
    if not math.isfinite(scale) or scale<=0:return 0
    return int(np.sum(np.linalg.svd(relative/scale,compute_uv=False)>EPS))


def project_sphere(source,center=None,radius=None):
    try:original=deepcopy(source);raw=json.dumps(original,allow_nan=False,sort_keys=True,separators=(',',':')).encode()
    except (TypeError,ValueError,OverflowError) as error:raise GeometryError('Sphere projection requires finite JSON source data.') from error
    if len(raw)>16*1024*1024:raise GeometryError('Sphere projection source exceeds 16 MiB.')
    if type(original) is not dict or original.get('dimension') not in (3,4) or original.get('embeddingDimension',original['dimension'])!=original['dimension']:
        raise GeometryError('Sphere projection requires intrinsic XYZ3D or XYZW4D source geometry.')
    if original.get('interpretation') not in ('convex-polytope','generalized-complex') or not validate(original)['passed']:
        raise GeometryError('Sphere projection requires valid source incidence.')
    for field,maximum in [('vertices',4096),('faces',8192),('cells',4096)]:
        if type(original.get(field)) is not list or len(original[field])>maximum:raise GeometryError('Sphere projection '+field+' exceeds its work bound.')
    d=original['dimension']
    if any(type(v) is not list or len(v)!=d or any(type(x) not in (int,float) or not math.isfinite(x) or abs(x)>1e100 for x in v) for v in original['vertices']):
        raise GeometryError('Sphere projection requires bounded finite literal source coordinates.')
    points=np.asarray(original['vertices'],dtype=float)
    if points.ndim!=2 or points.shape[1]!=d or not np.isfinite(points).all() or np.max(np.abs(points),initial=0)>1e100:
        raise GeometryError('Sphere projection requires bounded finite source coordinates.')
    if center is not None and (type(center) is not list or len(center)!=d or any(type(x) not in (int,float) or not math.isfinite(x) or abs(x)>1e100 for x in center)):
        raise GeometryError('Sphere center needs finite intrinsic coordinates matching the source dimension.')
    origin=points.mean(axis=0) if center is None else np.asarray(center,dtype=float)
    vectors=points-origin;distances=np.linalg.norm(vectors,axis=1);scale=max(float(np.max(distances,initial=0)),np.finfo(float).tiny)
    if len(points)==0 or min(distances)<=scale*EPS:raise GeometryError('A source vertex lies at or numerically too close to the sphere center.')
    if radius is not None and (type(radius) not in (int,float) or not math.isfinite(radius) or not 1e-8<=radius<=1e100):
        raise GeometryError('Sphere radius must be finite and positive, at least 0.00000001.')
    resolved=float(np.mean(distances)) if radius is None else float(radius)
    projected=origin+vectors*(resolved/distances)[:,None]
    if not np.isfinite(projected).all() or _rank(projected)!=_rank(points):
        raise GeometryError('Sphere projection collapses the source affine dimension.')
    for index,face in enumerate(original['faces']):
        if len(face)>256:raise GeometryError('Sphere projection face exceeds 256 source vertices.')
        if _rank(points[face])!=2 or _rank(projected[face])!=2:
            raise GeometryError(f'Face {index} is nonplanar or degenerate after sphere projection; subdivide it explicitly first.')
    for index,cell in enumerate(original['cells']):
        ids=sorted({v for face in cell for v in original['faces'][face]})
        if len(ids)>256:raise GeometryError('Sphere projection cell exceeds 256 source vertices.')
        if _rank(points[ids])!=3 or _rank(projected[ids])!=3:
            raise GeometryError(f'Cell {index} is nonplanar or degenerate after sphere projection.')
    result=deepcopy(original)
    for key in ('facetEquations','facetVertices','measure','validation','fingerprint','rationalCoordinates','rationalFacetEquations','certificate'):
        result.pop(key,None)
    result.update(vertices=projected.tolist(),interpretation='generalized-complex',
        numeric={'mode':'float64-approximate','certified':False,'tolerance':EPS})
    qualification={'convex':False,'filledContentAssigned':False}
    if original['interpretation']=='convex-polytope':
        from .geometric_fitting import _qualify
        checked=deepcopy(result);checked['interpretation']='convex-polytope'
        try:_qualify(checked,projected.mean(axis=0))
        except GeometryError as error:qualification['diagnostic']=str(error)
        else:result=checked;qualification.update(convex=True,filledContentAssigned=True)
    evidence={'algorithmVersion':VERSION,'sourceModelId':original.get('id'),'sourceFingerprint':identity(original),
        'sourceSnapshotSha256':hashlib.sha256(raw).hexdigest(),'sourceModel':original,
        'center':origin.tolist(),'centerPolicy':'vertex mean' if center is None else 'explicit intrinsic coordinates',
        'radius':resolved,'radiusPolicy':'mean source vertex radius' if radius is None else 'explicit radius',
        'maximumRadiusResidual':float(np.max(np.abs(np.linalg.norm(projected-origin,axis=1)-resolved))),
        'facesPlanar':True,'cellsPlanar':True,'incidenceUnchanged':True,'hullRepair':False,'qualification':qualification}
    metadata={'family':'Sphere projection','sphereProjection':evidence,'sourceMetadata':deepcopy(original.get('metadata',{}))}
    for key in ('coordinateUnits','offColors'):
        if key in original.get('metadata',{}):metadata[key]=deepcopy(original['metadata'][key])
    result.update(id='sphere-'+hashlib.sha256(json.dumps([evidence['sourceSnapshotSha256'],origin.tolist(),resolved]).encode()).hexdigest(),
        name='Sphere projection of '+original.get('name','source'),metadata=metadata,
        provenance={'operation':'sphere-project','algorithmVersion':VERSION,'sourceModelId':original.get('id'),
            'parameters':{'center':center,'radius':radius},'sourceVertexIds':list(range(len(points))),'convexified':False})
    result['validation']=validate(result)
    if not result['validation']['passed']:raise GeometryError('Sphere projection failed literal source incidence validation.')
    result['fingerprint']=identity(result)
    # The native project reader normalizes measurement caches. Do that before
    # content binds to the complete result model, so Save/Open retains ownership.
    from .formats import validate_project
    checked=validate_project({'format':'polytope-laboratory','version':1,'active':0,
        'documents':[{'cursor':0,'states':[{'model':result,'view':{}}]}]})['documents'][0]['states'][0]['model']
    if checked['vertices']!=projected.tolist() or any(checked[key]!=original[key] for key in ('edges','faces','cells')):
        raise GeometryError('Native persistence changed sphere projection source incidence.')
    result=checked
    return result


def dispatch_sphere_projection(request):
    if type(request) is not dict or set(request)-{'op','params','model','id','algorithmVersion'} or request.get('op')!='sphere-project':
        raise GeometryError('Sphere projection requires its supported source request.')
    if request.get('algorithmVersion',VERSION)!=VERSION:raise GeometryError('Unsupported sphere projection algorithm version.')
    params=request.get('params',{})
    if type(params) is not dict or set(params)-{'center','radius'}:raise GeometryError('Unsupported sphere projection controls.')
    return project_sphere(request.get('model'),**params)
