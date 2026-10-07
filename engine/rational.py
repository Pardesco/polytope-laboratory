"""Small exhaustive rational hull certificates and rational polar construction.

Every d-point candidate support plane is tested against all supplied points.
This bounded algorithm is independent of Qhull's facet predicates. Qhull's
candidate boundary is accepted only when it agrees with the exact facet set.
Measurements and display remain float64, even for certified rational topology.
"""
from fractions import Fraction
from itertools import combinations
import math
import numpy as np
from .geometry import hull, GeometryError, identity, validate

MAX_EXACT_POINTS=32


def fraction(x):
    if len(str(x))>256:
        raise GeometryError('Rational literal exceeds 256 characters.')
    try:value=Fraction(str(x))
    except (ValueError,ZeroDivisionError) as exc:raise GeometryError('Use finite decimal, integer, or numerator/denominator rational coordinates.') from exc
    if value.numerator.bit_length()>4096 or value.denominator.bit_length()>4096:
        raise GeometryError('Rational magnitude exceeds the 4,096-bit arithmetic limit.')
    return value


def null_plane(rows):
    """One-dimensional nullspace of d × (d+1) homogeneous point rows."""
    a=[list(row) for row in rows];cols=len(a[0]);pivot_cols=[];row=0
    for col in range(cols):
        pivot=next((i for i in range(row,len(a)) if a[i][col]),None)
        if pivot is None:continue
        a[row],a[pivot]=a[pivot],a[row];divisor=a[row][col];a[row]=[x/divisor for x in a[row]]
        for i in range(len(a)):
            if i!=row and a[i][col]:
                factor=a[i][col];a[i]=[x-factor*y for x,y in zip(a[i],a[row])]
        pivot_cols.append(col);row+=1
        if row==len(a):break
    if len(pivot_cols)!=cols-1:return None
    free=next(i for i in range(cols) if i not in pivot_cols)
    vector=[Fraction(0)]*cols;vector[free]=Fraction(1)
    for i,col in enumerate(pivot_cols):vector[col]=-a[i][free]
    return vector


def rational_hull(points,name='Rational convex hull'):
    if not isinstance(points,list) or not 3<=len(points)<=MAX_EXACT_POINTS:
        raise GeometryError(f'Exact hull input is limited to 3–{MAX_EXACT_POINTS} points.')
    d=len(points[0])
    if d not in (2,3,4) or any(len(p)!=d for p in points):
        raise GeometryError('Exact hull requires a rectangular 2D/3D/4D coordinate array.')
    p=[[fraction(x) for x in row] for row in points]
    approx=[[float(x) for x in row] for row in p]
    if not np.isfinite(approx).all():raise GeometryError('Rational coordinates cannot be represented by the display float64 adapter.')
    result=hull(approx,name)
    used=result['provenance']['extremeInputIndices']
    support={};candidate_count=0
    rows=[row+[Fraction(1)] for row in p]
    for ids in combinations(range(len(p)),d):
        candidate_count+=1
        plane=null_plane([rows[i] for i in ids])
        if plane is None:continue
        values=[sum(a*b for a,b in zip(row,plane)) for row in rows]
        if any(v>0 for v in values) and any(v<0 for v in values):continue
        if not any(values):continue
        if any(v>0 for v in values):plane=[-v for v in plane]
        key=tuple(i for i,v in enumerate(values) if not v)
        support.setdefault(key,plane)
    exact_sets={frozenset(i for i in key if i in used) for key in support}
    candidate_sets={frozenset(used[i] for i in facet) for facet in result['facetVertices']}
    if exact_sets!=candidate_sets:
        raise GeometryError('Float candidate incidence disagrees with exhaustive exact support predicates; no certified model was returned.')
    planes={frozenset(i for i in key if i in used):plane for key,plane in support.items()}
    result['rationalCoordinates']=[[str(x) for x in p[i]] for i in used]
    result['rationalFacetEquations']=[[str(x) for x in planes[frozenset(used[i] for i in facet)]] for facet in result['facetVertices']]
    result['numeric'].update({'mode':'rational-exact','certified':True,'predicates':'Fraction exact exhaustive supporting-plane enumeration',
                              'constructions':'exact supplied rational extreme vertices','measurementMode':'float64-approximate','displayMode':'float64'})
    result['certificate']={'property':'complete convex facet support set relative to supplied rational input',
                            'arithmetic':'Python Fraction','candidatePlaneCount':candidate_count,'exactFacetCount':len(support),
                            'sourceCoordinates':[[str(x) for x in row] for row in p],
                            'extremeInputIndices':used,'algorithmVersion':'0.1.0','exhausted':True,
                            'doesNotCertify':['intended algebraic values','float measurements','generalized or nonconvex geometry']}
    result['provenance']['operation']='rational-hull'
    result['fingerprint']=identity(result)
    return result


def rational_dual(model,center=None,radius='1'):
    if model.get('numeric',{}).get('mode')!='rational-exact' or not model.get('rationalCoordinates') or not model.get('rationalFacetEquations'):
        raise GeometryError('Exact polar dual requires a certified rational hull source.')
    if not validate(model)['passed']:
        raise GeometryError('Exact source coordinates, incidence, or support table failed validation.')
    # Recheck the certificate rather than trusting an edited serialized badge.
    source=rational_hull(model['rationalCoordinates'])
    p=[[fraction(x) for x in row] for row in source['rationalCoordinates']]
    d=model['dimension']
    center=[sum(row[i] for row in p)/len(p) for i in range(d)] if center is None else [fraction(x) for x in center]
    radius=fraction(radius)
    if len(center)!=d or radius<=0:raise GeometryError('Exact dual requires a center of the correct dimension and positive rational radius.')
    points=[]
    for plane in source['rationalFacetEquations']:
        a=[fraction(x) for x in plane]
        offset=-(sum(x*y for x,y in zip(a[:-1],center))+a[-1])
        if offset<=0:raise GeometryError('Exact reciprocation center must lie strictly inside every supporting half-space.')
        points.append([str(c+radius**2*n/offset) for c,n in zip(center,a[:-1])])
    result=rational_hull(points,'Exact dual of '+model['name'])
    result['provenance']={'operation':'rational-dual','sourceId':model['id'],'sourceFingerprint':model.get('fingerprint'),
                          'parameters':{'center':[str(x) for x in center],'radius':str(radius)},'algorithmVersion':'0.1.0'}
    return result
