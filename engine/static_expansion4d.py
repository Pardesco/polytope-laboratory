"""Closed static 4D expansion with independently measured supporting 3-cells."""
from collections import Counter
from copy import deepcopy
import hashlib
import json
import math
import uuid

import numpy as np

from engine.geometry import GeometryError, identity, validate
from engine.dual_morph_expansion import EPS, _clone, _plane, prepare_dual_morph

VERSION = '0.1.0'


def _cell_volume(points, vertices, faces):
    """Qualify a convex 3-cell and integrate its oriented polygon boundary."""
    cloud=points[vertices]
    center=cloud.mean(axis=0)
    _, singular, basis=np.linalg.svd(cloud-center, full_matrices=False)
    if len(singular)!=4 or singular[2]<=EPS or singular[3]>EPS*8:
        raise GeometryError('Expansion boundary cell has unresolved affine dimension.')
    tangent=(cloud-center)@basis[:3].T
    scale=float(np.max(np.ptp(tangent,axis=0)))
    if not math.isfinite(scale) or scale<=EPS:
        raise GeometryError('Expansion boundary cell is unresolved or degenerate.')
    lookup={v:i for i,v in enumerate(vertices)}
    oriented=Counter();volume=0.0
    for face in faces:
        ids=[lookup[v] for v in face]
        normal,_=_plane(tangent,ids,np.zeros(3),scale)
        vector=sum((np.cross(tangent[a],tangent[b]) for a,b in zip(ids,ids[1:]+ids[:1])),np.zeros(3))
        if float(vector@normal)<0:ids.reverse()
        for a,b in zip(ids,ids[1:]+ids[:1]):oriented[(a,b)]+=1
        anchor=tangent[ids[0]]
        for i in range(1,len(ids)-1):
            volume+=float(anchor@np.cross(tangent[ids[i]],tangent[ids[i+1]]))/6
    if any(count!=1 or oriented[(b,a)]!=1 for (a,b),count in oriented.items()):
        raise GeometryError('Expansion boundary cell is not consistently closed and oriented.')
    if len(vertices)-len(oriented)//2+len(faces)!=2 or not math.isfinite(volume) or volume<=np.finfo(float).tiny:
        raise GeometryError('Expansion boundary cell has unresolved volume or spherical incidence.')
    return volume


def expand_runcinate4d(source, *, ratio=0.5, radius=1.0, center=None, color_policy='source'):
    original=_clone(source)
    if type(original) is not dict or original.get('dimension')!=4 or original.get('embeddingDimension',4)!=4:
        raise GeometryError('4D expansion requires an intrinsic convex 4D source.')
    if type(ratio) not in (int,float) or not math.isfinite(ratio) or not 0<=ratio<=1:
        raise GeometryError('Expansion ratio must be a finite number from 0 to 1.')
    if color_policy not in ('source','complement','none'):
        raise GeometryError('Expansion colors must be source, complement, or none.')
    working=deepcopy(original)
    if color_policy=='none':working.setdefault('metadata',{})['offColors']={}
    plan=prepare_dual_morph({'model':working},center,radius,complement=color_policy=='complement')
    descriptor=plan.descriptor();frame=plan.evaluate('expansion',ratio);result=frame['model']
    points=np.asarray(result['vertices'],dtype=float);origin=np.asarray(descriptor['center'],dtype=float)
    scale=float(np.max(np.ptp(points,axis=0)));local=(points-origin)/scale
    facets=[];equations=[];cell_volumes=[];boundary=content=0.0;face_counts=Counter()
    for cell in result['cells']:
        if len(set(cell))!=len(cell):raise GeometryError('Expansion cell repeats a boundary face.')
        faces=[result['faces'][f] for f in cell]
        vertices=sorted({v for face in faces for v in face})
        normal,height=_plane(points,vertices,origin,scale)
        volume=_cell_volume(local,vertices,faces)
        boundary+=volume;content+=volume*(height/scale)/4
        facets.append(vertices);equations.append([*map(float,normal),-float(height+normal@origin)])
        cell_volumes.append(volume);face_counts.update(cell)
    if len(face_counts)!=len(result['faces']) or any(count!=2 for count in face_counts.values()):
        raise GeometryError('Every expansion ridge must bound exactly two 3-cells.')
    if len(points)-len(result['edges'])+len(result['faces'])-len(result['cells'])!=0:
        raise GeometryError('Expansion 4D boundary has nonspherical incidence.')
    try:
        boundary*=scale**3;content*=scale**4;cell_volumes=[v*scale**3 for v in cell_volumes]
    except OverflowError as error:raise GeometryError('4D expansion measures overflowed.') from error
    if not all(math.isfinite(v) and v>=np.finfo(float).tiny for v in [boundary,content,*cell_volumes]):
        raise GeometryError('4D expansion measures overflowed, underflowed, or are unresolved.')
    binding={'sourceModelId':original.get('id'),'sourceFingerprint':identity(original),
             'sourceSnapshotSha256':hashlib.sha256(json.dumps(original,sort_keys=True,separators=(',',':')).encode()).hexdigest()}
    parameters={'ratio':float(ratio),'radius':descriptor['radius'],'center':descriptor['center'],'color_policy':color_policy}
    result['metadata']={'sourceMetadata':deepcopy(original.get('metadata',{})),**deepcopy(result.get('metadata',{})),
                        'staticExpansion':{'version':VERSION,**binding,'parameters':parameters,'sourceMaps':frame['sourceMaps'],
                            'endpoint':frame['endpoint'],'definition':'affine primal/reciprocal incidence product','hullRepair':False,
                            'boundaryCellVolumes':cell_volumes}}
    result.update(id=str(uuid.uuid4()),name='Expansion of '+original.get('name','source'),interpretation='convex-polytope',
        facetVertices=facets,facetEquations=equations,numeric={'mode':'float64-approximate','certified':False,'tolerance':EPS},
        provenance={'operation':'expand-runcinate','algorithmVersion':VERSION,**binding,'parameters':parameters,'convexified':False},
        measure={'content':content,'boundaryMeasure':boundary,'dimension':4,'units':'model-units',
                 'method':'supporting 3-cell tetrahedral boundary integration','certified':False})
    result['fingerprint']=identity(result);result['validation']=validate(result)
    if not result['validation']['passed']:
        raise GeometryError('4D expansion convex validation failed: '+'; '.join(result['validation']['errors']))
    return result
