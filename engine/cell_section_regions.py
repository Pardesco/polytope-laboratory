"""Bounded planar regions with literal boundary IDs, including holes.

Virtual bridges are used only for ear triangulation; they never replace a
region boundary. No new coordinates, hulls or geometric identity welding.
"""
from collections import Counter
import numpy as np
from .geometry import GeometryError
from .generalized_nets import _cross,_signed_area,_simple,_touch,polygon_overlap
from .generalized_sections import _inside

EPS=1e-8
MAX_REGION_VERTICES=512
MAX_TRIANGLE_PAIRS=100000

def _require(value,message):
    if not value:raise GeometryError('Ordinary cell section: '+message+' Choose the surface-section option to retain curves.')

def planar_regions(loops,points):
    """Partition disjoint simple cycles by nesting, without filling holes."""
    _require(sum(map(len,loops))<=MAX_REGION_VERTICES,'cell boundary exceeds 512 cut vertices.')
    cloud=np.asarray(points);q=cloud-cloud[loops[0][0]];extent=max(float(np.max(np.ptp(q,axis=0))),1e-15)
    _,s,vt=np.linalg.svd(q[sorted(set(v for loop in loops for v in loop))]/extent,full_matrices=False)
    _require(len(s)>=2 and s[1]>EPS and (len(s)<3 or s[2]<=EPS*8),'cell cut has unresolved planar rank.')
    xy=q@vt[:2].T;scale=max(float(np.max(np.ptp(xy,axis=0))),1e-15);xy/=scale
    for loop in loops:_simple(xy[loop],loop)
    for i,A in enumerate(loops):
        for B in loops[i+1:]:
            _require(not any(_touch(xy[a],xy[b],xy[c],xy[d]) for a,b in zip(A,A[1:]+A[:1]) for c,d in zip(B,B[1:]+B[:1])),'section components touch or cross at unresolved branches.')
    contains=[[j for j,B in enumerate(loops) if i!=j and _inside(xy[A[0]],xy[B],'nonzero')] for i,A in enumerate(loops)]
    parents=[min(C,key=lambda j:abs(_signed_area(xy[loops[j]]))) if C else None for C in contains]
    oriented=[]
    for i,L in enumerate(loops):
        positive=len(contains[i])%2==0;oriented.append(L[:] if (_signed_area(xy[L])>0)==positive else L[::-1])
    regions=[]
    for i,L in enumerate(oriented):
        if len(contains[i])%2==0:
            regions.append({'outer':L,'holes':[oriented[j] for j,parent in enumerate(parents) if parent==i]})
    return regions,xy,scale

def triangulate_holes(region,xy):
    """Visibility bridges + weakly-simple ear clipping; verify actual coverage."""
    outer=region['outer'];holes=region['holes'];loops=[outer]+holes
    allBoundary=[(a,b) for L in loops for a,b in zip(L,L[1:]+L[:1])]
    def inside(p):return _inside(p,xy[outer],'nonzero') and not any(_inside(p,xy[H],'nonzero') for H in holes)
    contour=outer[:];bridges=[]
    for hole in sorted(holes,key=lambda H:max(xy[v][0] for v in H),reverse=True):
        hi=max(range(len(hole)),key=lambda i:(xy[hole[i]][0],-xy[hole[i]][1],-hole[i]));h=hole[hi];candidates=[]
        for mi,m in enumerate(contour):
            if m==h:continue
            if any(_touch(xy[h],xy[m],xy[a],xy[b]) for a,b in allBoundary+bridges if h not in (a,b) and m not in (a,b)):continue
            if not all(inside(xy[h]+fraction*(xy[m]-xy[h])) for fraction in (.2,.5,.8)):continue
            candidates.append((float(np.linalg.norm(xy[h]-xy[m])),m,mi))
        _require(bool(candidates),'hole has no resolved visible source-corner bridge.')
        _,m,mi=min(candidates);rotated=hole[hi:]+hole[:hi]
        contour=contour[:mi+1]+rotated+[h,m]+contour[mi+1:];bridges.append((h,m))
    triangles=[];removed=[];work=0
    while len(contour)>3:
        found=False
        for j,b in enumerate(contour):
            work+=len(contour);_require(work<=2000000,'hole triangulation work bound exceeded.')
            a,c=contour[j-1],contour[(j+1)%len(contour)];cross=_cross(xy[b]-xy[a],xy[c]-xy[b])
            if a!=c and abs(cross)<=EPS**2 and float((xy[b]-xy[a])@(xy[c]-xy[b]))>=0:
                removed.append((a,b,c));contour.pop(j);found=True;break
            if len({a,b,c})<3 or cross<=EPS**2:continue
            def inTriangle(v):return all(_cross(xy[y]-xy[x],xy[v]-xy[x])>=-EPS**2 for x,y in ((a,b),(b,c),(c,a)))
            if any(inTriangle(v) for v in contour if v not in (a,b,c)):continue
            if not inside((xy[a]+xy[b]+xy[c])/3):continue
            triangles.append([a,b,c]);contour.pop(j);found=True;break
        _require(found,'hole triangulation has an unresolved weakly simple contact.')
    _require(len(set(contour))==3 and _signed_area(xy[contour])>EPS**2,'hole triangulation ended in a collapsed triangle.')
    triangles.append(contour)
    # Restore every collinear native cut vertex rather than silently removing
    # it from a neighboring source-cell face's boundary incidence.
    for a,b,c in reversed(removed):
        restored=False
        for i,T in enumerate(triangles):
            if a in T and c in T:
                other=next(v for v in T if v not in (a,c));U=[a,b,other];V=[b,c,other]
                if _signed_area(xy[U])<0:U.reverse()
                if _signed_area(xy[V])<0:V.reverse()
                triangles[i:i+1]=[U,V];restored=True;break
        _require(restored,'a collinear boundary identity could not be restored.')
    actual=Counter(tuple(sorted((a,b))) for T in triangles for a,b in zip(T,T[1:]+T[:1]));boundary=Counter(tuple(sorted(E)) for E in allBoundary)
    _require(all(actual[E]==1 for E in boundary) and all(count==2 for E,count in actual.items() if E not in boundary),'hole tessellation does not preserve every literal boundary edge.')
    expected=_signed_area(xy[outer])+sum(_signed_area(xy[H]) for H in holes);area=sum(_signed_area(xy[T]) for T in triangles)
    _require(abs(area-expected)<=max(1e-10,abs(expected)*1e-8),'hole tessellation area does not match its ordered region.')
    _require(len(triangles)*(len(triangles)-1)//2<=MAX_TRIANGLE_PAIRS,'hole overlap verification work exceeds its bound.')
    for i,A in enumerate(triangles):
        for B in triangles[i+1:]:
            _require(not polygon_overlap(xy[A],xy[B],tolerance=1e-9),'hole tessellation triangles overlap in their interiors.')
    return triangles
