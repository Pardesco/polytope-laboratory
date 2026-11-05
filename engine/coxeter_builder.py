"""Friendly names and bounded convex constructions for the interactive builder."""
import math
import numpy as np
from .geometry import GeometryError
from .wythoff import FAMILIES, diagram_edges, wythoff

NAMES3={
    'A3':['Tetrahedron','Octahedron','Truncated tetrahedron','Tetrahedron','Cuboctahedron','Truncated tetrahedron','Truncated octahedron'],
    'B3':['Octahedron','Cuboctahedron','Truncated octahedron','Cube','Rhombicuboctahedron','Truncated cube','Truncated cuboctahedron'],
    'H3':['Icosahedron','Icosidodecahedron','Truncated icosahedron','Dodecahedron','Rhombicosidodecahedron','Truncated dodecahedron','Truncated icosidodecahedron'],
}
# D4 triality and the enhanced F4 symmetries identify alternate diagrams
# for entries already in the local uniform catalog.
D4_EQUIVALENTS={(0,1):('B4','0001'),(0,2):('B4','0100'),(0,3):('F4','0100'),
    (1,0):('F4','1000'),(1,1):('B4','0011'),(1,2):('B4','0110'),(1,3):('F4','1100')}
B4_EQUIVALENTS={'0010':('F4','1000'),'0101':('F4','0100'),'0111':('F4','1100')}


def catalog_entry(family,rings,entries):
    mask=''.join(map(str,rings));target=(family,mask)
    if family=='D4':target=D4_EQUIVALENTS[rings[1],sum(rings[i] for i in (0,2,3))]
    if family=='B4':target=B4_EQUIVALENTS.get(mask,target)
    return next((e for e in entries if e.get('coxeterFamily')==target[0] and
        (e.get('rings')==list(map(int,target[1])) or target[0] in ('A4','F4') and e.get('rings')==list(map(int,target[1][::-1])))),None)


def build_coxeter(family='B3',rings=None,snub=False,hand='A'):
    if family not in FAMILIES:raise GeometryError('Choose A3, B3, H3, A4, B4, D4, F4 or H4 symmetry.')
    rank=len(FAMILIES[family])+1
    rings=[1]+[0]*(rank-1) if rings is None else rings
    if type(rings) is not list or len(rings)!=rank or any(type(r) is not int or r not in (0,1) for r in rings) or not any(rings):
        raise GeometryError('Choose at least one ring, with one binary value per diagram node.')
    if type(snub) is not bool:raise GeometryError('Snub must be a boolean.')
    if hand not in ('A','B'):raise GeometryError('Choose snub hand A or B.')
    if snub:
        if family not in ('B3','H3') or rings!=[1,1,1]:raise GeometryError('Twisted (snub) shapes require B3 or H3 with every node ringed.')
        from .chiral import snub as make_snub
        result=make_snub(family,hand)
    elif rank==3:
        result=wythoff(family,rings)
        result['name']=NAMES3[family][int(''.join(map(str,rings)),2)-1]
    else:
        from .uniform4 import wythoff_boundary, manifest
        result=wythoff_boundary(family,rings)
        entry=catalog_entry(family,rings,manifest()['entries'])
        if entry:result['name']=entry['name'];result['metadata'].update({k:entry[k] for k in ('key','bowers','aliases') if k in entry})
        else:result['name']=family+' '+''.join(('x' if r else 'o')+(str(FAMILIES[family][i]) if i<rank-1 else '') for i,r in enumerate(rings)) if family!='D4' else 'D4 · rings '+''.join(map(str,rings))
    points=np.asarray(result['vertices']);edges=np.asarray(result['edges'])
    lengths=np.linalg.norm(points[edges[:,0]]-points[edges[:,1]],axis=1)
    spread=float(np.ptp(lengths)/np.mean(lengths))
    if not math.isfinite(spread) or spread>1e-7:raise GeometryError('Equal-edge check failed; no uniform shape was returned.')
    result['metadata'].update(coxeterFamily=family,rings=rings,diagramEdges=diagram_edges(family),
        shapeBuilder={'edgeRelativeSpread':spread,'exact':False,'snub':snub,'hand':hand if snub else None})
    evidence=result.get('provenance',{})
    result['provenance']={**evidence,'operation':'coxeter-build','algorithmVersion':'0.1.0',
        'parameters':{'family':family,'rings':rings,'snub':snub,'hand':hand}}
    return result
