"""Numerical symmetry-axis zones and Minkowski zone addition."""
from copy import deepcopy
from itertools import combinations, product
import math
import numpy as np
from .geometry import GeometryError, hull, identity
from .face_subdivision import source_faces, persist_model
from .symmetry import geometric_symmetry
from .zonohedron_support import zonohedron_support
from .sphere_targets import edge_variation

VERSION='0.1.0'


def symmetry_axes(source, fold):
    if type(fold) is not int or fold not in (2,3,5):raise GeometryError('Choose 2-, 3- or 5-fold rotation axes.')
    p,_=source_faces(source,convex=True)
    if len(p)>256:raise GeometryError('Axis extraction supports at most 256 source vertices.')
    group=geometric_symmetry(source,orientation='proper')
    if not group['complete']:raise GeometryError('Symmetry search did not exhaust; all-of-type axes are unavailable.')
    center=np.asarray(group['center']);axes=[];orders=[];residual=0.
    candidates=[row-center for row in p]
    candidates.extend((p[a]+p[b])/2-center for a,b in source['edges'])
    candidates.extend(p[face].mean(axis=0)-center for face in source['faces'])
    for action in group['actions']:
        permutation=action['permutation'];seen=set();order=1
        for i in range(len(permutation)):
            if i in seen:continue
            j=i;length=0
            while j not in seen:seen.add(j);length+=1;j=permutation[j]
            order=math.lcm(order,length)
        if order==1:continue
        matrix=np.asarray(action['matrix']);_,_,vt=np.linalg.svd(matrix-np.eye(3));axis=vt[-1]
        existing=next((i for i,a in enumerate(axes) if np.linalg.norm(np.cross(axis,np.asarray(a)))<1e-7),None)
        if existing is not None:
            orders[existing]=max(orders[existing],order);continue
        # Retain an actual source feature direction when it realizes this axis;
        # avoid inventing noisy near-rational directions from an eigenvector.
        matching=[v for v in candidates if np.linalg.norm(v)>1e-10 and np.linalg.norm(np.cross(v/np.linalg.norm(v),axis))<1e-7]
        raw=max(matching,key=lambda v:np.linalg.norm(v)) if matching else axis
        raw=raw/max(abs(raw));raw[np.abs(raw)<1e-12]=0
        if next(x for x in raw if x)<0:raw=-raw
        unit=raw/np.linalg.norm(raw);residual=max(residual,float(np.linalg.norm(matrix@unit-unit)))
        # Axis IDs are deterministic within this literal source representation.
        axes.append(raw.tolist());orders.append(order)
    axes=[axis for axis,order in zip(axes,orders) if order==fold]
    axes.sort(key=lambda a:tuple(round(x,10) for x in a))
    if not axes:raise GeometryError(f'This source has no {fold}-fold rotation axes.')
    return {'fold':fold,'axes':axes,'count':len(axes),'center':center.tolist(),'complete':True,
        'maximumAxisResidual':residual,'groupOrder':group['order'],'axisTypeDefinition':'maximal proper rotation order fixing the unoriented axis pointwise',
        'numericMode':'float64-approximate'}


def axis_zonohedron(source, fold=3, axis_ids=None, edge_length=1):
    report=symmetry_axes(source,fold);axes=report['axes']
    if axis_ids is None:ids=list(range(len(axes)))
    elif (type(axis_ids) is list and axis_ids and len(set(axis_ids))==len(axis_ids)
            and all(type(i) is int and 0<=i<len(axes) for i in axis_ids)):ids=axis_ids
    else:raise GeometryError('Axis IDs must be a nonempty distinct in-range integer list, or blank for all of type.')
    if not 3<=len(ids)<=32:raise GeometryError('Choose 3..32 axes spanning 3D.')
    directions=[axes[i] for i in ids];method='native support zonohedron'
    try:result=zonohedron_support(directions,edge_length=edge_length)
    except GeometryError as error:
        if not str(error).startswith(('Numerical Hull omitted','Numerical Hull differs')):raise
        result=_numerical_axis_zonotope(directions,edge_length)
        method='incremental numerical Minkowski hull; near-coplanar supports merged at native hull tolerance'
    generators=np.asarray(directions,dtype=float)
    generators*=float(edge_length)/np.linalg.norm(generators,axis=1)[:,None]
    support_residual=max(abs(float(eq[3])+float(np.sum(np.abs(generators@np.asarray(eq[:3]))))/2) for eq in result['facetEquations'])
    variation=edge_variation(result)
    if support_residual>float(edge_length)*1e-6 or abs(variation['minimum']/float(edge_length)-1)>1e-6 or abs(variation['maximum']/float(edge_length)-1)>1e-6:
        raise GeometryError('Axis zonohedron failed numerical support or equal-edge verification.')
    # The outer receipt owns the adapted ID; nested generator receipts are
    # historical and must not masquerade as receipts for this adapted model.
    result['metadata']={'family':'Symmetry-axis zonohedron','axisZonohedron':{
        'algorithmVersion':VERSION,'sourceFingerprint':identity(source),'axisReport':report,
        'axisIds':ids,'edgeLength':edge_length,'allOfType':axis_ids is None,
        'constructionMethod':method,'maximumSupportResidual':support_residual,'edgeVariation':variation}}
    if 'coordinateUnits' in source.get('metadata',{}):result['metadata']['coordinateUnits']=source['metadata']['coordinateUnits']
    result['id']='axis-zonohedron-'+identity(result)
    result['name']=f'{fold}-fold axis zonohedron of '+source.get('name','source')
    result['provenance']={'operation':'axis-zonohedron','algorithmVersion':VERSION}
    return persist_model(result)


def _numerical_axis_zonotope(directions,length):
    units=np.asarray(directions,dtype=float);units/=np.linalg.norm(units,axis=1)[:,None]
    basis=max(combinations(range(len(units)),3),key=lambda ids:abs(np.linalg.det(units[list(ids)])))
    if abs(np.linalg.det(units[list(basis)]))<1e-6:raise GeometryError('Selected axes do not span a well-resolved 3D body.')
    generators=units*float(length)
    result=hull((np.asarray(list(product((-1,1),repeat=3)))@generators[list(basis)]/2).tolist())
    for i in range(len(units)):
        if i in basis:continue
        points=np.asarray(result['vertices'])
        if len(points)*2>4096:raise GeometryError('Axis Minkowski construction exceeded its 4096-point work bound.')
        result=hull(np.vstack((points+generators[i]/2,points-generators[i]/2)).tolist())
    return result


def add_zones(source, directions, edge_length=1):
    p,_=source_faces(source,convex=True)
    if type(edge_length) not in (int,float) or not math.isfinite(edge_length) or not 1e-6<=edge_length<=1e6:
        raise GeometryError('Added segment length must be finite, from 1e-6 to 1e6.')
    if type(directions) is not list or not 1<=len(directions)<=16:
        raise GeometryError('Add 1..16 zone directions.')
    scale=float(np.max(np.ptp(p,axis=0)))
    for fi,face in enumerate(source['faces']):
        q=p[face];n=len(face)
        if n%2 or np.max(np.linalg.norm((q+np.roll(q,n//2,axis=0))/2-q.mean(axis=0),axis=1))>scale*1e-7:
            raise GeometryError(f'Face {fi} is not centrally symmetric: source is not a checked convex zonohedron.')
    current=deepcopy(source);units=[]
    for direction in directions:
        if (type(direction) is not list or len(direction)!=3 or
                any(type(x) not in (int,float) or not math.isfinite(x) or abs(x)>1e100 for x in direction)):
            raise GeometryError('Zone directions require finite bounded XYZ triples.')
        unit=np.array(direction,dtype=float);size=float(np.max(abs(unit)))
        if size==0:raise GeometryError('Zone directions cannot be zero.')
        unit/=size;unit/=np.linalg.norm(unit);units.append(unit.tolist())
        points=np.asarray(current['vertices'])
        if len(points)*2>4096:raise GeometryError('Zone addition exceeds its 4096-point intermediate bound.')
        current=hull(np.vstack((points+unit*edge_length/2,points-unit*edge_length/2)).tolist(),'Added zones')
    current['id']='zone-addition-'+identity(current)
    current['metadata']={'family':'Zonohedron zone addition','zoneAddition':{'algorithmVersion':VERSION,
        'sourceFingerprint':identity(source),'directions':deepcopy(directions),'unitDirections':units,
        'edgeLength':edge_length,'definition':'Minkowski sum with centered segments; parallel additions lengthen an existing zone',
        'edgeVariation':edge_variation(current)}}
    if 'coordinateUnits' in source.get('metadata',{}):current['metadata']['coordinateUnits']=source['metadata']['coordinateUnits']
    current['provenance']={'operation':'add-zones','algorithmVersion':VERSION}
    return persist_model(current)
