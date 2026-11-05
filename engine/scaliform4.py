"""Two independently constructed, source-identified non-uniform scaliforms."""
from collections import Counter
from copy import deepcopy
from functools import lru_cache
from itertools import combinations, permutations, product
import math
import uuid
import numpy as np
from .geometry import GeometryError, hull, identity, validate, canonical_cycle

VERSION='0.1.0'
BOWERS='https://polytope.net/hedrondude/simplesc.htm'
KLITZING='https://bendwavy.org/klitzing/incmats/'
ENTRIES=[
    ('tuta','Truncated tetrahedral alterprism (Tuta)',[24,60,52,16],True,'tut=invtut',
     ['tuta','tutcup','tutaltut','pabdirit','K-4.55','S1']),
    ('koho','Skew octahemioctachoron (Koho)',[8,24,28,12],False,'koho',['koho','S7']),
]


def scaliform4_catalog():
    return [{'key':'scaliform4-'+key,'name':name,'dimension':4,'family':'Scaliform polychora','counts':counts,
        'aliases':aliases,'bowers':key,'scaliform':True,'uniform':False,'vertexTransitive':True,'convex':convex,
        'fissary':False,'classificationReference':BOWERS,'referenceUrls':[KLITZING+page+'.htm',BOWERS],
        'source':'independent analytic construction','numericContract':'Float64 coordinates and incidence predicates; no exact certificate'}
        for key,name,counts,convex,page,aliases in ENTRIES]


def _koho():
    points=np.concatenate([np.eye(4),-np.eye(4)])/math.sqrt(2)
    tetra=[[(i+j)%8 for j in range(4)] for i in range(8)]
    triangle_counts=Counter(tuple(sorted(f)) for t in tetra for f in combinations(t,3))
    faces=[list(f) for f in sorted(triangle_counts)];lookup={canonical_cycle(f):i for i,f in enumerate(faces)}
    cells=[[lookup[canonical_cycle(f)] for f in combinations(t,3)] for t in tetra]
    squares=[[i,(i+1)%8,(i+4)%8,(i+5)%8] for i in range(4)]
    square_ids=[]
    for f in squares:square_ids.append(len(faces));faces.append(f)
    for i in range(4):
        vs=set(squares[i]+squares[(i+1)%4])
        boundary=[lookup[canonical_cycle(f)] for f,n in triangle_counts.items() if n==1 and set(f)<=vs]
        if len(boundary)!=4:raise GeometryError('Koho bowtie-bipyramid boundary could not be resolved.')
        cells.append(boundary+[square_ids[i],square_ids[(i+1)%4]])
    edges=sorted({tuple(sorted(e)) for f in faces for e in zip(f,f[1:]+f[:1])})
    return {'id':'scaliform4-koho','name':'Koho','dimension':4,'embeddingDimension':4,
        'interpretation':'generalized-complex','vertices':points.tolist(),'edges':[list(e) for e in edges],
        'faces':faces,'cells':cells,'metadata':{},'numeric':{'mode':'float64-approximate','certified':False,'tolerance':1e-8},
        'provenance':{'operation':'scaliform4','algorithmVersion':VERSION,'construction':'Klitzing xyzwXYZW skew octagon: consecutive tetrahedra and adjacent-square bowtie bipyramids; original cycles, no hull.'}}


def _verify(model):
    points=np.asarray(model['vertices']);lengths=np.asarray([np.linalg.norm(points[a]-points[b]) for a,b in model['edges']])
    spread=float(np.ptp(lengths)/np.mean(lengths));radial=0.
    for ids in model['faces']+[sorted({v for f in cell for v in model['faces'][f]}) for cell in model['cells']]:
        p=points[ids];center=p.mean(axis=0);delta=p-center
        offset=np.linalg.lstsq(2*delta,np.sum(delta*delta,axis=1)-np.mean(np.sum(delta*delta,axis=1)),rcond=None)[0]
        radii=np.linalg.norm(delta-offset,axis=1)
        radial=max(radial,float(np.ptp(radii)/np.mean(radii)))
    for cell in model['cells']:
        edges=Counter(tuple(sorted(e)) for f in cell for e in zip(model['faces'][f],model['faces'][f][1:]+model['faces'][f][:1]))
        if any(n!=2 for n in edges.values()):raise GeometryError('Scaliform cell boundary is not closed.')
    ridges=Counter(f for c in model['cells'] for f in c)
    if len(ridges)!=len(model['faces']) or any(n!=2 for n in ridges.values()):
        raise GeometryError('Scaliform ridge incidence is not closed.')
    if spread>1e-8 or radial>1e-8:raise GeometryError('Scaliform equal-edge or circumsphere residual exceeds tolerance.')
    from .symmetry import geometric_symmetry
    symmetry=geometric_symmetry(model)
    if not symmetry['complete'] or not symmetry['closureVerified'] or len(symmetry['entityOrbits']['vertex'])!=1:
        raise GeometryError('Scaliform vertex transitivity was not verified.')
    return {'edgeRelativeSpread':spread,'maxElementCircumsphereRelativeSpread':radial,
        'symmetryOrder':symmetry['order'],'closureVerified':True,'vertexOrbitCount':1,'certified':False}


@lru_cache(maxsize=2)
def _build(key):
    entry=next((r for r in scaliform4_catalog() if r['key']==key),None)
    if entry is None:raise GeometryError('Unknown scaliform polychoron key.')
    if key=='scaliform4-tuta':
        points=[[*p,1] for p in sorted(set(permutations([3,1,1])))]
        points=np.asarray([np.asarray(p)*s/math.sqrt(8) for p in points for s in product((-1,1),repeat=4) if np.prod(s)>0])
        result=hull(points,entry['name'])
        construction='Klitzing (3,1,1,1)/sqrt(8): permutations of first three coordinates and even sign changes; convex hull.'
    else:result=_koho();construction=result['provenance']['construction']
    if [len(result[k]) for k in ('vertices','edges','faces','cells')]!=entry['counts']:
        raise GeometryError('Scaliform counts differ from published incidence.')
    evidence=_verify(result)
    inventory=Counter((len({v for f in c for v in result['faces'][f]}),len(c)) for c in result['cells'])
    expected={(12,8):2,(9,8):8,(4,4):6} if entry['bowers']=='tuta' else {(4,4):8,(6,6):4}
    if inventory!=expected:raise GeometryError('Scaliform cell inventory differs from published incidence.')
    result['name']=entry['name'];result['metadata'].update(deepcopy(entry))
    result['metadata']['scaliform4Evidence']={**evidence,'resultFingerprint':identity(result),'construction':construction,
        'cellInventory':([{'name':'Truncated tetrahedron','count':2},{'name':'Triangular cupola (J3)','count':8},{'name':'Tetrahedron','count':6}]
                         if entry['bowers']=='tuta' else [{'name':'Tetrahedron','count':8},{'name':'Bowtie bipyramid','count':4}]),
        'definition':'Vertex-transitive, equal edges, circumscribable elements. Cells need not be uniform.',
        'filledInteriorClaim':entry['convex']}
    result['provenance'].update(catalogKey=key,algorithmVersion=VERSION)
    result['fingerprint']=identity(result);result['id']=str(uuid.uuid5(uuid.NAMESPACE_URL,'polytope:'+result['fingerprint']))
    result['validation']=validate(result)
    if not result['validation']['passed']:raise GeometryError('Scaliform incidence validation failed.')
    return result


def load_scaliform4(key):return deepcopy(_build(key))
