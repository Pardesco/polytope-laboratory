"""Offline, fixed-recipe near-miss constructions and symmetry-constrained fits."""
from collections import Counter
from copy import deepcopy
import math

import numpy as np
from scipy.optimize import least_squares, minimize
from scipy.linalg import qr

from .condition_fitting import condition_arrays, _symmetry_basis
from .generators import regular, generate
from .geometry import GeometryError, hull, identity, validate, canonical_cycle
from .geometric_fitting import _qualify
from .operations import dual, truncate

RECIPES=(
    ('chamfered-cube','Chamfered cube','Oh',48),
    ('chamfered-dodecahedron','Chamfered dodecahedron','Ih',120),
    ('rectified-truncated-icosahedron','Rectified truncated icosahedron','Ih',120),
    ('truncated-truncated-icosahedron','Truncated truncated icosahedron','Ih',120),
    ('expanded-truncated-icosahedron','Expanded truncated icosahedron','Ih',120),
    ('truncated-triakis-tetrahedron','Truncated triakis tetrahedron','Td',24),
    ('associahedron-k5','Associahedron K5','D3h',12),
    ('wedge-4-5','Square-pentagon wedge','Cs',2),
    ('wedge-4-5-top-augmented','Top-augmented square-pentagon wedge','Cs',2),
    ('wedge-4-5-side-augmented','Side-augmented square-pentagon wedge','Cs',2),
)


def selective_truncate(source,degree,amount=.3):
    p=np.asarray(source['vertices']);p=p-p.mean(axis=0);valence=Counter(v for e in source['edges'] for v in e)
    points=[p[v] for v in range(len(p)) if valence[v]!=degree]
    neighbors={v:[b if a==v else a for a,b in source['edges'] if v in (a,b)] for v in range(len(p))}
    heights={v:amount*min(p[v]@(p[v]-p[b]) for b in neighbors[v]) for v in range(len(p)) if valence[v]==degree}
    points.extend(p[a]+heights[a]/(p[a]@(p[a]-p[b]))*(p[b]-p[a]) for e in source['edges'] for a,b in (e,e[::-1]) if valence[a]==degree)
    return hull(points)


def wedge():
    points=[]
    for n,z in ((4,0),(5,1)):
        radius=1/(2*math.sin(math.pi/n));apothem=radius*math.cos(math.pi/n)
        for i in range(n):
            angle=-math.pi/2+(2*i-1)*math.pi/n
            points.append([radius*math.cos(angle),radius*math.sin(angle)+apothem,z])
    p=np.asarray(points);source=hull(p);edges=np.asarray(source['edges'])
    def coordinates(x):
        phi,theta=x;q=p.copy();top=p[:,2]>.5
        q[top,1]=math.sin(phi)+p[top,1]*math.cos(theta)
        q[top,2]=math.cos(phi)+p[top,1]*math.sin(theta)
        return q
    solved=least_squares(lambda x:np.linalg.norm(coordinates(x)[edges[:,0]]-coordinates(x)[edges[:,1]],axis=1)-1,
        [.5,-.5],ftol=1e-14,xtol=1e-14,gtol=1e-14,max_nfev=100)
    return hull(coordinates(solved.x))


def augment_square(source,side):
    p=np.asarray(source['vertices']);face=next(f for f in source['faces'] if len(f)==4 and (np.ptp(p[f,2])>.5)==side)
    center=p[face].mean(axis=0);normal=np.cross(p[face[1]]-p[face[0]],p[face[2]]-p[face[0]])
    normal/=np.linalg.norm(normal)
    if normal@(center-p.mean(axis=0))<0:normal=-normal
    return hull([*p,center+normal/math.sqrt(2)])


def construct(key):
    if key not in {r[0] for r in RECIPES}:raise GeometryError('Unknown fixed near-miss construction.')
    if key=='chamfered-cube':return selective_truncate(dual(regular('cuboctahedron')),4)
    if key=='chamfered-dodecahedron':return selective_truncate(dual(regular('icosidodecahedron')),5)
    if key=='truncated-triakis-tetrahedron':return selective_truncate(regular('triakis-tetrahedron'),6)
    if key=='associahedron-k5':return selective_truncate(dual(generate('prism',n=3,height=1)),4)
    if key.startswith('wedge-4-5'):
        source=wedge()
        return source if key=='wedge-4-5' else augment_square(source,'side' in key)
    source=regular('truncated-icosahedron')
    if key=='rectified-truncated-icosahedron':return truncate(source,.5)
    if key=='truncated-truncated-icosahedron':return truncate(source,.2)
    if key=='expanded-truncated-icosahedron':return truncate(truncate(source,.5),.5)
    raise GeometryError('Unknown fixed near-miss construction.')


def vertex_configurations(model):
    configurations=Counter()
    for v in range(len(model['vertices'])):
        incident=[i for i,f in enumerate(model['faces']) if v in f];adjacent={i:[] for i in incident}
        for i in incident:
            for j in incident:
                if i!=j and len(set(model['faces'][i])&set(model['faces'][j]))==2:adjacent[i].append(j)
        cycle=[min(incident)];previous=None
        while True:
            options=[i for i in adjacent[cycle[-1]] if i!=previous];nxt=min(options)
            if nxt==cycle[0]:break
            previous=cycle[-1];cycle.append(nxt)
        if len(cycle)!=len(incident):raise GeometryError('Near-miss vertex link did not close.')
        configurations['.'.join(map(str,canonical_cycle([len(model['faces'][i]) for i in cycle])))]+=1
    return dict(sorted(configurations.items()))


def fit_catalog_source(source):
    """Same regular-face/edge residuals as condition fitting, fixed bounded data.

    The larger bound applies only to these offline recipes, never user input.
    Least squares initializes SLSQP with independent planarity equalities and
    strict supporting-plane inequalities. Native qualification checks all faces.
    """
    if not 4<=len(source['vertices'])<=180:raise GeometryError('Near-miss recipe exceeds 180 vertices.')
    p=np.asarray(source['vertices']);edges=np.asarray(source['edges']);faces=source['faces']
    p-=p.mean(axis=0);p/=np.linalg.norm(p[edges[:,0]]-p[edges[:,1]],axis=1).mean()
    basis,symmetry=_symmetry_basis(source,p)
    def coordinates(x):
        q=(basis@x).reshape(p.shape);q-=q.mean(axis=0)
        return q/np.linalg.norm(q[edges[:,0]]-q[edges[:,1]],axis=1).mean()
    def residual(x):
        a=condition_arrays(coordinates(x),edges,faces)
        return np.r_[a['equal-edges'],a['regular-faces'],1e4*a['planar-faces']]
    x0=basis.T@p.ravel()
    def planar(x):
        q=coordinates(x);values=[]
        for f in faces:
            a=q[f]-q[f[0]];normal=np.cross(a[1],a[2]);normal/=np.linalg.norm(normal)
            values.extend(a[3:]@normal)
        return np.asarray(values)
    jac=np.column_stack([(planar(x0+np.eye(len(x0))[i]*1e-5)-planar(x0))/1e-5 for i in range(len(x0))])
    _,r,pivot=qr(jac.T,pivoting=True,mode='economic');rank=np.linalg.matrix_rank(r,tol=1e-5);ids=pivot[:rank]
    def support(x):
        q=coordinates(x);values=[]
        for f in faces:
            c=q[f].mean(axis=0);normal=np.cross(q[f[1]]-q[f[0]],q[f[2]]-q[f[0]])
            normal/=np.linalg.norm(normal)
            if normal@c<0:normal=-normal
            other=[i for i in range(len(q)) if i not in f]
            values.append(-float(np.max((q[other]-c)@normal))-1e-4)
        return np.asarray(values)
    def energy(x):
        a=condition_arrays(coordinates(x),edges,faces);r=np.r_[a['equal-edges'],a['regular-faces']];return float(r@r)
    constraints=[{'type':'ineq','fun':support}]
    if rank:constraints.append({'type':'eq','fun':lambda x:planar(x)[ids]})
    trial=least_squares(residual,x0,max_nfev=400,ftol=1e-11,xtol=1e-11,gtol=1e-11)
    if np.min(support(trial.x))>=0:x0=trial.x
    solved=minimize(energy,x0,method='SLSQP',constraints=constraints,options={'maxiter':400,'ftol':1e-12})
    if not solved.success or np.min(support(solved.x))<-1e-8:raise GeometryError('Near-miss constrained fit did not converge inside its convex domain.')
    result=deepcopy(source);result['vertices']=coordinates(solved.x).tolist()
    for field in ('facetEquations','facetVertices','measure','validation','fingerprint'):result.pop(field,None)
    _qualify(result,np.zeros(3))
    if not validate(result)['passed']:raise GeometryError('Near-miss fitted incidence is invalid.')
    result['fingerprint']=identity(result)
    return result,{'method':'condition_arrays regular-faces + equal-edges; symmetry-invariant least-squares initialization and constrained SLSQP',
        'symmetry':symmetry,'success':bool(solved.success),'evaluations':int(solved.nfev),
        'termination':str(solved.message),'cost':float(solved.fun/2),'initialPlanarityWeight':10000,
        'supportClearanceMeanEdges':.0001,'independentPlanarityConstraints':int(rank),'iterationLimit':400,
        'globalMinimumEstablished':False,'certified':False}
