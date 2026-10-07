# SPDX-License-Identifier: GPL-3.0-only
"""Bounded numerical R/A/Q/T/D checks for ordinary 3D polygon boundaries."""
from collections import defaultdict
import math
import numpy as np
from scipy.spatial import ConvexHull
from engine.geometry import GeometryError
from engine.specialized_catalog import boundary_parts,surface_topology

TOLERANCE=1e-7


def _plane(poly):
    center=poly.mean(axis=0)
    _,_,basis=np.linalg.svd(poly-center,full_matrices=False)
    return center,basis[-1],basis[:2]


def _area(poly):
    if len(poly)<3:return 0.
    return abs(sum(np.cross(a,b) for a,b in zip(poly,np.roll(poly,-1,axis=0))))/2


def _clip(subject,clip):
    """Closed convex 2D clipping; area oracle for coplanar interiors."""
    result=list(subject)
    winding=sum(np.cross(a,b) for a,b in zip(clip,np.roll(clip,-1,axis=0)))
    for a,b in zip(clip,np.roll(clip,-1,axis=0)):
        if not result:break
        old=result;result=[]
        distance=lambda x:float(np.cross(b-a,x-a))*(1 if winding>0 else -1)
        for p,q in zip(old,old[1:]+old[:1]):
            dp,dq=distance(p),distance(q)
            if dp>=0:result.append(p)
            if (dp<0<dq) or (dq<0<dp):result.append(p+(q-p)*(dp/(dp-dq)))
    return np.asarray(result)


def _cut(poly,center,normal,tol):
    distances=(poly-center)@normal;result=[]
    for i,p in enumerate(poly):
        q=poly[(i+1)%len(poly)];a=distances[i];b=distances[(i+1)%len(poly)]
        if abs(a)<=tol:result.append(p)
        if a*b<0 and abs(a)>tol and abs(b)>tol:result.append(p+(q-p)*a/(a-b))
    return np.asarray(result)


def _intersections(points,faces,planes,tol):
    """Every convex face pair, including pairs sharing source incidence.

    Nonparallel plane intersections reduce to interval overlap on their line.
    An overlap is permitted only on a shared source edge or vertex. Coplanar
    polygon interiors use independent closed clipping and signed area.
    """
    conflicts=[];pairs=0;coplanar=0
    for i,a in enumerate(faces):
        pa=points[a];ca,na,ba=planes[i]
        for j in range(i):
            pairs+=1;b=faces[j];pb=points[b];cb,nb,_=planes[j]
            if np.any(pa.max(axis=0)<pb.min(axis=0)-tol) or np.any(pb.max(axis=0)<pa.min(axis=0)-tol):continue
            direction=np.cross(na,nb);length=np.linalg.norm(direction)
            if length<=tol:
                if abs(float((cb-ca)@na))>tol:continue
                coplanar+=1
                if _area(_clip((pa-ca)@ba.T,(pb-ca)@ba.T))>tol:
                    conflicts.append([j,i,'coplanar interior overlap'])
                continue
            direction/=length
            qa=_cut(pa,cb,nb,tol);qb=_cut(pb,ca,na,tol)
            if not len(qa) or not len(qb):continue
            lo=max(float(min(qa@direction)),float(min(qb@direction)))
            hi=min(float(max(qa@direction)),float(max(qb@direction)))
            if lo>hi+tol:continue
            common=sorted(set(a)&set(b));permitted=False
            if common:
                boundary=points[common]@direction
                if len(common)==1:permitted=abs(hi-lo)<=2*tol and abs((hi+lo)/2-boundary[0])<=2*tol
                elif len(common)==2:
                    edge=tuple(common)
                    edges=lambda f:{tuple(sorted((u,v))) for u,v in zip(f,f[1:]+f[:1])}
                    permitted=edge in edges(a)&edges(b) and lo>=min(boundary)-2*tol and hi<=max(boundary)+2*tol
            if not permitted:conflicts.append([j,i,'nonincident face intersection'])
    return {'passed':not conflicts,'facePairsChecked':pairs,'coplanarPairsChecked':coplanar,'conflicts':conflicts,
        'method':'Complete convex-face pair plane-line interval checks and coplanar closed polygon clipping; shared source edges/vertices retained.'}


def stewart_report(model):
    """No hull construction: the hull is used only to audit condition Q."""
    if model.get('dimension')!=3 or not 4<=len(model.get('vertices',[]))<=128 or not 4<=len(model.get('faces',[]))<=128:
        raise GeometryError('Stewart audit requires bounded 3D source geometry (4..128 vertices/faces).')
    points=np.asarray(model['vertices'],dtype=float);faces=model['faces']
    if points.shape!=(len(points),3) or not np.isfinite(points).all():raise GeometryError('Stewart coordinates require finite 3D values.')
    scale=float(np.max(np.ptp(points,axis=0)))
    if scale<=0:raise GeometryError('Stewart source has no spatial extent.')
    points=(points-points.mean(axis=0))/scale;planes=[];residual=0.;face_types=defaultdict(int)
    for face in faces:
        if not 3<=len(face)<=12 or len(set(face))!=len(face) or any(type(v) is not int or not 0<=v<len(points) for v in face):
            raise GeometryError('Stewart source requires ordinary bounded face cycles.')
        poly=points[face];center,normal,basis=_plane(poly);local=(poly-center)@basis.T
        radii=np.linalg.norm(local,axis=1);lengths=np.linalg.norm(poly-np.roll(poly,-1,axis=0),axis=1)
        angles=np.arctan2(local[:,1],local[:,0]);turns=(np.roll(angles,-1)-angles+math.pi)%math.tau-math.pi
        # Constant +/-2pi/n steps excludes star order and repeated winding.
        expected=math.tau/len(face)
        current=max(float(max(abs((poly-center)@normal))),float(np.ptp(radii))/max(float(radii.mean()),1e-100),
            float(np.ptp(lengths))/max(float(lengths.mean()),1e-100),
            float(min(max(abs(turns-expected)),max(abs(turns+expected)))))
        residual=max(residual,current);planes.append((center,normal,basis));face_types[str(len(face))]+=1
    regular=residual<=TOLERANCE
    if not regular:
        return {'classified':False,'R':{'passed':False,'maximumResidual':residual},'reason':'Regular ordinary faces required before intersection/hull audit.'}
    uses=defaultdict(list)
    for i,face in enumerate(faces):
        for a,b in zip(face,face[1:]+face[:1]):uses[tuple(sorted((a,b)))].append(i)
    sine_min=min((float(np.linalg.norm(np.cross(planes[a][1],planes[b][1]))) for ids in uses.values() if len(ids)==2 for a,b in [ids]),default=0.)
    topology=surface_topology(model['vertices'],faces);parts=boundary_parts(model)
    aplanar=all(len(ids)==2 for ids in uses.values()) and sine_min>TOLERANCE
    hull=ConvexHull(points);normal_groups=[];membership=defaultdict(set)
    for triangle,equation in zip(hull.simplices,hull.equations):
        group=next((i for i,x in enumerate(normal_groups) if np.max(abs(x-equation))<=TOLERANCE),None)
        if group is None:group=len(normal_groups);normal_groups.append(equation)
        for a,b in zip(triangle,np.roll(triangle,-1)):membership[tuple(sorted((int(a),int(b))))].add(group)
    # Coplanar triangulation diagonals belong to one supporting plane, so they
    # are excluded. Actual hull ridges belong to at least two plane groups.
    hull_edges=sorted(edge for edge,groups in membership.items() if len(groups)>=2)
    missing=[list(edge) for edge in hull_edges if edge not in uses]
    tunnel=topology['closedVertexManifold'] and topology['orientable'] and len(parts)==1 and type(topology['genus']) is int and 1<=topology['genus']<=8
    disjoint=_intersections(points,faces,planes,TOLERANCE)
    return {'classified':bool(regular and aplanar and not missing and tunnel and disjoint['passed']),
        'mode':'float64-approximate','certified':False,'tolerance':TOLERANCE,'predicateScale':scale,
        'R':{'passed':regular,'maximumResidual':residual,'ordinaryFaceSizeCounts':dict(sorted(face_types.items()))},
        'A':{'passed':aplanar,'minimumAdjacentNormalCrossLength':sine_min},
        'Q':{'passed':not missing,'hullEdgeCount':len(hull_edges),'missingHullEdges':missing},
        'T':{'passed':tunnel,'componentCount':len(parts),'topology':topology},'D':disjoint,
        'scope':'Numerical R/A/Q/T/D for this supplied ordinary regular-faced positive-genus boundary; no exhaustive Stewart catalog or exact certificate.'}
