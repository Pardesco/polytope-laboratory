"""Finite spherical Coxeter reflection orbit, with convex-hull realization.

Seed solves <root_i,x>=weight_i. Equal positive ring weights give standard
convex Wythoff realizations. This does not enumerate nonconvex uniform forms.
"""
from collections import deque
from itertools import product
import math
import numpy as np
from .geometry import hull, GeometryError

FAMILIES={'A3':[3,3],'B3':[4,3],'H3':[5,3],'A4':[3,3,3],'B4':[4,3,3],'F4':[3,4,3],'H4':[5,3,3]}
GROUP_ORDERS={'A3':24,'B3':48,'H3':120,'A4':120,'B4':384,'F4':1152,'H4':14400}
# Euclidean distance on the unit seed sphere, independent of supplied units.
ORBIT_TOLERANCE=1e-9


def _inactive_stabilizer_order(diagram, rings):
    """Unringed connected components generate the chamber seed stabilizer.

    Every proper connected subdiagram of these rank-three/four chains has
    rank at most three. Orders here come from finite Coxeter group orders,
    independently of numerical orbit enumeration.
    """
    chain_orders={():2,(3,):6,(4,):8,(5,):10,
                  (3,3):24,(4,3):48,(3,4):48,(5,3):120,(3,5):120}
    stabilizer=1;start=0
    while start<len(rings):
        if rings[start]:
            start+=1;continue
        end=start+1
        while end<len(rings) and not rings[end]:end+=1
        stabilizer*=chain_orders[tuple(diagram[start:end-1])]
        start=end
    return stabilizer


class _OrbitIndex:
    """Spatial buckets accelerate actual distance checks across boundaries."""
    def __init__(self, tolerance=ORBIT_TOLERANCE):
        self.tolerance=tolerance
        self.width=16*tolerance
        self.buckets={}

    def add(self, point):
        key=tuple(math.floor(float(x)/self.width) for x in point)
        self.buckets.setdefault(key,[]).append(point)

    def find(self, point):
        ranges=[range(math.floor((float(x)-self.tolerance)/self.width),
                      math.floor((float(x)+self.tolerance)/self.width)+1) for x in point]
        for key in product(*ranges):
            for existing in self.buckets.get(key,()):
                delta=point-existing
                if float(np.dot(delta,delta))<=self.tolerance**2:
                    return existing
        return None


def _verify_orbit_closure(vertices, roots, index):
    residual=0.0
    for point in vertices:
        for root in roots:
            reflected=point-2*np.dot(point,root)*root
            match=index.find(reflected)
            if match is None:
                raise GeometryError('Coxeter orbit closure is numerically unresolved; no incomplete polytope was returned.')
            residual=max(residual,math.hypot(*(reflected-match)))
    return residual


def reflection_orbit(family='B4', rings=None, weights=None, max_vertices=4096):
    if family not in FAMILIES:
        raise GeometryError('Supported finite Coxeter families: '+', '.join(FAMILIES))
    diagram=FAMILIES[family];d=len(diagram)+1
    rings=[1]+[0]*(d-1) if rings is None else rings
    if len(rings)!=d or any(x not in (0,1) for x in rings) or not any(rings):
        raise GeometryError(f'Choose a nonempty binary ring mask with {d} nodes.')
    weights=rings if weights is None else weights
    if len(weights)!=d or any(not math.isfinite(float(x)) or x<0 for x in weights) or not any(weights):
        raise GeometryError('Seed weights must be finite, nonnegative, and not all zero.')
    if any(bool(a)!=bool(b) for a,b in zip(rings,weights)):
        raise GeometryError('Positive weights must match the ringed nodes.')
    if type(max_vertices) is not int or not 1<=max_vertices<=20000:
        raise GeometryError('Orbit resource limit must be in 1–20,000 vertices.')
    stabilizer_order=_inactive_stabilizer_order(diagram,rings)
    expected_size=GROUP_ORDERS[family]//stabilizer_order
    if expected_size>max_vertices:
        raise GeometryError(f'Coxeter orbit requires {expected_size} vertices and exceeds the {max_vertices}-vertex resource limit; no incomplete polytope was returned.')
    gram=np.eye(d)
    for i,m in enumerate(diagram):
        gram[i,i+1]=gram[i+1,i]=-math.cos(math.pi/m)
    roots=np.linalg.cholesky(gram)
    # Scale before solving, including for subnormal or very large weights.
    # Restore supplied model units only after all predicates have passed.
    weight_scale=max(float(w) for w in weights)
    seed=np.linalg.solve(roots,np.asarray(weights,dtype=float)/weight_scale)
    seed_norm=math.hypot(*seed)
    seed_scale=seed_norm*weight_scale
    if not math.isfinite(seed_scale) or seed_scale==0:
        raise GeometryError('Seed scale cannot be represented in finite float64 model units.')
    seed=seed/seed_norm
    vertices=[seed];queue=deque([seed]);index=_OrbitIndex();index.add(seed)
    while queue:
        point=queue.popleft()
        for root in roots:
            reflected=point-2*np.dot(point,root)*root
            if index.find(reflected) is None:
                if len(vertices)>=expected_size:
                    raise GeometryError(f'Coxeter orbit exceeded its independently expected {expected_size} vertices; numerical matching is unresolved and no incomplete polytope was returned.')
                index.add(reflected);vertices.append(reflected);queue.append(reflected)
    if len(vertices)!=expected_size:
        raise GeometryError(f'Coxeter orbit resolved {len(vertices)} of {expected_size} expected vertices; seed weights are numerically indistinguishable and no incomplete polytope was returned.')
    closure_residual=_verify_orbit_closure(vertices,roots,index)
    with np.errstate(over='ignore',invalid='ignore',under='ignore'):
        scaled_vertices=np.asarray(vertices)*seed_scale
        restored=scaled_vertices/seed_scale
    restoration_residual=max(math.hypot(*delta) for delta in restored-np.asarray(vertices))
    if not np.isfinite(scaled_vertices).all() or restoration_residual>ORBIT_TOLERANCE:
        raise GeometryError('Coxeter orbit cannot be resolved in the supplied float64 model units; rescale the seed weights. No incomplete polytope was returned.')
    return {'vertices':list(scaled_vertices),'family':family,'diagram':diagram,'rings':list(rings),'weights':list(weights),
            'mirrorGramResidual':float(np.max(np.abs(roots@roots.T-gram))),
            'expectedOrbitSize':expected_size,'coxeterGroupOrder':GROUP_ORDERS[family],
            'inactiveStabilizerOrder':stabilizer_order,'orbitTolerance':ORBIT_TOLERANCE,
            'orbitPredicateScale':'unit-seed-circumradius','seedScale':seed_scale,
            'orbitClosureResidual':closure_residual,'modelUnitRestorationResidual':restoration_residual}


def wythoff(family='B4', rings=None, weights=None, max_vertices=4096):
    orbit=reflection_orbit(family,rings,weights,max_vertices)
    vertices=orbit['vertices'];rings=orbit['rings'];weights=orbit['weights'];diagram=orbit['diagram']
    mask=''.join(map(str,rings))
    result=hull(vertices,f'{family} Wythoff {mask}',{'family':'Convex Wythoff', 'coxeterFamily':family, 'diagram':diagram, 'rings':rings,
                                                    'weights':list(weights),'source':'Finite reflection orbit of fundamental-chamber seed',
                                                    'uniformCandidate':len(set(float(w) for w in weights if w))==1})
    result['provenance']={'operation':'wythoff','algorithmVersion':'0.2.0','parameters':{'family':family,'rings':rings,'weights':list(weights)},
                           'orbitCompleteWithinFiniteGroup':True,'orbitSize':len(vertices),'mirrorGramResidual':orbit['mirrorGramResidual']}
    result['provenance'].update({key:orbit[key] for key in ('expectedOrbitSize','coxeterGroupOrder',
        'inactiveStabilizerOrder','orbitTolerance','orbitPredicateScale','seedScale','orbitClosureResidual',
        'modelUnitRestorationResidual')})
    return result
