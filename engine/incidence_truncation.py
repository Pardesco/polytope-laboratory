"""Literal 3D edge cuts, midpoint rectification and regular-face quasitruncation.

Construction uses directed source edges and cyclic vertex links. No hull,
coordinate welding or angular incidence sorting supplies the result boundary.
"""
from collections import Counter, defaultdict
from copy import deepcopy
import hashlib
import json
import math

import numpy as np

from engine.geometry import GeometryError, identity, validate
from engine.history import _json_bytes
from engine.dual_morph_expansion import _cycle, _plane, EPS

VERSION = '0.1.0'
LIMITS = {'vertices':256, 'edges':1024, 'faces':512, 'faceVertices':64,
          'incidences':8192, 'sourceBytes':8*1024*1024, 'amount':1024}
PRESETS = ('manual', 'normal', 'quasi', 'rectify')


def _check(condition, message):
    if not condition:raise GeometryError(message)


def _flat(points, ids, label):
    cloud=points[ids]-points[ids].mean(axis=0)
    _, singular, basis=np.linalg.svd(cloud, full_matrices=True)
    _check(len(singular)>=2 and singular[1]>EPS and (len(singular)<3 or singular[2]<=8*EPS),
           label+' is nonplanar or has unresolved affine rank; no hull repair is performed.')
    return basis[-1]


def _source(model):
    original=json.loads(_json_bytes(model,LIMITS['sourceBytes']))
    _check(type(original) is dict and original.get('dimension')==3 and original.get('embeddingDimension',3)==3
           and original.get('interpretation') in ('convex-polytope','generalized-complex'),
           'Incidence truncation needs an intrinsic closed XYZ3D source surface.')
    _check(not original.get('components') and not original.get('cells'),
           'Extract a compound component or 3D cell before incidence truncation.')
    for key in ('vertices','edges','faces'):
        _check(type(original.get(key)) is list and 0<len(original[key])<=LIMITS[key],
               'Incidence truncation source '+key+' exceeds its work bound.')
    _check(all(type(row) is list and len(row)==3 and all(type(x) in (int,float) and math.isfinite(x) and abs(x)<=1e100 for x in row)
               for row in original['vertices']), 'Source coordinates must be finite literal XYZ numbers.')
    _check(all(type(f) is list and 3<=len(f)<=LIMITS['faceVertices'] for f in original['faces'])
           and sum(map(len,original['faces']))<=LIMITS['incidences'], 'Source face incidence exceeds the bounded work domain.')
    checked=validate(original);_check(checked['passed'],'Invalid literal source incidence: '+'; '.join(checked['errors']))
    _check(original.get('fingerprint',identity(original))==identity(original),'Source fingerprint is stale.')
    points=np.asarray(original['vertices'],dtype=float);scale=float(np.max(np.ptp(points,axis=0)))
    _check(math.isfinite(scale) and scale>0,'Source scale is unresolved.')
    local=(points-points.mean(axis=0))/scale
    _check(np.linalg.matrix_rank(local,EPS)==3,'Source must resolve a full XYZ3D affine span.')
    edges={tuple(sorted(edge)):i for i,edge in enumerate(original['edges'])}
    _check(len(edges)==len(original['edges']), 'Source repeats an edge identity.')
    counts=Counter();links=[defaultdict(list) for _ in points];incident=[[] for _ in points]
    for fi,face in enumerate(original['faces']):
        _flat(local,face,'Source face '+str(fi))
        for i,v in enumerate(face):
            previous,following=face[i-1],face[(i+1)%len(face)]
            counts[tuple(sorted((v,following)))]+=1
            links[v][previous].append(following);links[v][following].append(previous);incident[v].append(fi)
    _check(set(counts)==set(edges) and all(count==2 for count in counts.values()),
           'Every literal source edge must have exactly two source face incidences; open or extra edges are unsupported.')
    cycles=[_cycle(link,'Source vertex '+str(v)) for v,link in enumerate(links)]
    for a,b in original['edges']:_check(float(np.linalg.norm(local[a]-local[b]))>EPS,'Source edge length is unresolved.')
    return original,points,local,edges,cycles,incident


def _regular_face(local, face):
    """Recognize the actual regular ordered cycle, including regular star order."""
    cloud=local[face]-local[face].mean(axis=0);normal=_flat(local,face,'Reference face')
    radius=np.linalg.norm(cloud,axis=1);sides=np.roll(cloud,-1,axis=0)-cloud;lengths=np.linalg.norm(sides,axis=1)
    if np.min(radius)<=EPS or np.min(lengths)<=EPS:return None
    tolerance=EPS*8
    if np.ptp(radius)>tolerance*np.max(radius) or np.ptp(lengths)>tolerance*np.max(lengths):return None
    radial_dot=np.sum(cloud*np.roll(cloud,-1,axis=0),axis=1)/(radius*np.roll(radius,-1))
    radial_turn=np.cross(cloud,np.roll(cloud,-1,axis=0))@normal/(radius*np.roll(radius,-1))
    if np.ptp(radial_dot)>tolerance or np.ptp(radial_turn)>tolerance or np.min(np.abs(radial_turn))<=EPS:return None
    previous=np.roll(cloud,1,axis=0)-cloud;following=np.roll(cloud,-1,axis=0)-cloud
    coefficient=np.linalg.norm(previous-following,axis=1)/(2*lengths)
    if np.ptp(coefficient)>tolerance or not EPS<float(coefficient.mean())<1-EPS:return None
    return float(coefficient.mean())


def _options(local, faces, preset, amount, reference_face, cap_colors):
    _check(preset in PRESETS,'Choose manual, normal, quasi or rectify truncation.')
    _check(cap_colors in ('inherit','none'),'Cap colors must be inherit or none.')
    _check(reference_face is None or type(reference_face) is int and 0<=reference_face<len(faces), 'Reference face needs a literal source face ID.')
    reference=None
    if preset in ('normal','quasi'):
        candidates=[]
        for fi in ([reference_face] if reference_face is not None else range(len(faces))):
            coefficient=_regular_face(local,faces[fi])
            if coefficient is not None:candidates.append((len(faces[fi]),-fi,coefficient))
        _check(bool(candidates),'No regular ordered source face is available; select a manual edge-cut fraction instead.')
        n,negative,coefficient=max(candidates);fi=-negative
        _check(preset!='quasi' or n%2==0,'The regular-face quasi preset requires an even-sided reference face; manual deep cuts remain available.')
        amount=1/(2*(1+coefficient if preset=='normal' else 1-coefficient))
        reference={'face':fi,'sides':n,'cornerCoefficient':coefficient,
                   'definition':'corner edge = 2*t*c*source edge; retained edge = abs(1-2*t)*source edge'}
    elif preset=='rectify':amount=.5
    _check(type(amount) in (int,float) and math.isfinite(amount) and 0<=amount<=LIMITS['amount'],
           'Edge-cut fraction must be a finite literal number from 0 to 1024.')
    _check(amount!=1,'Fraction 1 collapses distinct source-owned corners; choose a different depth.')
    return float(amount),reference,{'preset':preset,'amount':float(amount),'reference_face':reference_face,'cap_colors':cap_colors}


def _supporting_boundary(model):
    """Promote only actual strict convex cycles with a complete supporting shell."""
    points=np.asarray(model['vertices']);origin=points.mean(axis=0);scale=float(np.max(np.ptp(points,axis=0)))
    local=(points-origin)/scale;directed=Counter();equations=[];area=volume=0.0
    for face in model['faces']:
        normal,height=_plane(points,face,origin,scale)
        ids=list(face)
        vector=sum((np.cross(local[a],local[b]) for a,b in zip(ids,ids[1:]+ids[:1])),np.zeros(3))
        if float(vector@normal)<0:ids.reverse()
        cloud=local[ids]
        for i in range(len(ids)):
            a,b=cloud[i],cloud[(i+1)%len(ids)];signed=np.cross(b-a,cloud-a)@normal
            _check(all(signed[j]>EPS for j in range(len(ids)) if j not in (i,(i+1)%len(ids))),
                   'Ordered face is not strictly convex; retain generalized surface semantics.')
        for a,b in zip(ids,ids[1:]+ids[:1]):directed[(a,b)]+=1
        anchor=local[ids[0]]
        for i in range(1,len(ids)-1):
            b,c=local[ids[i]],local[ids[i+1]];area+=float(np.linalg.norm(np.cross(b-anchor,c-anchor)))/2;volume+=float(anchor@np.cross(b,c))/6
        equations.append([*map(float,normal),-float(height+normal@origin)])
    _check(all(count==1 and directed[(b,a)]==1 for (a,b),count in directed.items()),'Boundary orientation is inconsistent.')
    _check(len(points)-len(model['edges'])+len(model['faces'])==2,'Boundary is not spherical.')
    area*=scale**2;volume*=scale**3
    _check(all(math.isfinite(x) and x>=np.finfo(float).tiny for x in (area,volume)),'Supporting boundary measures are unresolved.')
    return {'facetVertices':deepcopy(model['faces']),'facetEquations':equations,
            'measure':{'content':volume,'boundaryMeasure':area,'dimension':3,'units':'model-units',
                       'method':'literal oriented supporting-face integration','certified':False}}


def incidence_truncate(source, *, preset='manual', amount=1/3, reference_face=None, cap_colors='inherit'):
    original,points,local,edge_ids,links,incident=_source(source)
    t,reference,parameters=_options(local,original['faces'],preset,amount,reference_face,cap_colors)
    sha=hashlib.sha256(_json_bytes(original,LIMITS['sourceBytes'])).hexdigest()
    binding={'sourceModelId':original.get('id'),'sourceFingerprint':identity(original),'sourceSnapshotSha256':sha}
    if t==0:
        result=deepcopy(original);vertex_refs=[{'vertex':i} for i in range(len(points))]
        face_refs=[{'face':i} for i in range(len(original['faces']))];edge_refs=[{'edge':i} for i in range(len(original['edges']))]
    else:
        vertices=[];vertex_refs=[];corners={}
        for ei,(a,b) in enumerate(original['edges']):
            for v,w in ((a,b),) if t==.5 else ((a,b),(b,a)):
                index=len(vertices);corners[(v,w)]=index
                if t==.5:corners[(w,v)]=index
                vertices.append(((1-t)*points[v]+t*points[w]).tolist())
                vertex_refs.append({'edge':ei,'vertices':[v,w],'parameter':t,'ownerVertex':None if t==.5 else v})
        faces=[];face_refs=[]
        for fi,face in enumerate(original['faces']):
            cycle=[]
            for i,v in enumerate(face):
                if t!=.5:cycle.append(corners[(v,face[i-1])])
                cycle.append(corners[(v,face[(i+1)%len(face)])])
            faces.append(cycle);face_refs.append({'face':fi})
        for v,link in enumerate(links):
            faces.append([corners[(v,w)] for w in link]);face_refs.append({'vertex':v,'incidentFaces':incident[v]})
        output=np.asarray(vertices);scale=float(np.max(np.ptp(output,axis=0)));normalized=(output-output.mean(axis=0))/scale
        _check(np.isfinite(output).all() and float(np.max(np.abs(output)))<=1e100,'Cut coordinates overflow the display domain.')
        _check(len(set(map(tuple,vertices)))==len(vertices),'Distinct source-owned corners coincide; change the cut depth. No coordinate weld is performed.')
        for fi,face in enumerate(faces):_flat(normalized,face,('Vertex cap ' if fi>=len(original['faces']) else 'Cut source face ')+str(fi))
        counts=Counter(tuple(sorted((a,b))) for face in faces for a,b in zip(face,face[1:]+face[:1]))
        _check(all(count==2 for count in counts.values()),'Constructed literal edge incidence is not closed.')
        edges=list(map(list,sorted(counts)));edge_refs=[];edge_faces=defaultdict(set)
        for fi,face in enumerate(original['faces']):
            for a,b in zip(face,face[1:]+face[:1]):edge_faces[edge_ids[tuple(sorted((a,b)))]].add(fi)
        for a,b in edges:
            ra,rb=vertex_refs[a],vertex_refs[b]
            _check(float(np.linalg.norm(normalized[a]-normalized[b]))>EPS,'An output edge is unresolved near a singular cut depth.')
            if t!=.5 and ra['edge']==rb['edge']:edge_refs.append({'edge':ra['edge']})
            else:edge_refs.append({'vertex':next(iter(set(ra['vertices'])&set(rb['vertices']))),
                                   'faces':sorted(edge_faces[ra['edge']]&edge_faces[rb['edge']])})
        result={'dimension':3,'embeddingDimension':3,'interpretation':'generalized-complex','vertices':vertices,'edges':edges,'faces':faces,'cells':[],
                'numeric':{'mode':'float64-approximate','certified':False,'tolerance':EPS}}
    colors=original.get('metadata',{}).get('offColors',{})
    def color(kind,index):
        values=colors.get(kind,[]);return deepcopy(values[index]) if index is not None and index<len(values) else None
    def identical(records):
        return deepcopy(records[0]) if records and records[0] is not None and all(record==records[0] for record in records) else None
    face_colors=[color('faces',r['face']) if 'face' in r else identical([color('faces',fi) for fi in r['incidentFaces']]) if cap_colors=='inherit' else None for r in face_refs]
    vertex_colors=[color('vertices',r['vertex']) if 'vertex' in r else color('vertices',r['ownerVertex']) if r['ownerVertex'] is not None else
                   identical([color('vertices',v) for v in r['vertices']]) for r in vertex_refs]
    edge_colors=[color('edges',r['edge']) if 'edge' in r else None for r in edge_refs]
    info={'algorithmVersion':VERSION,**binding,'sourceModel':original,'parameters':parameters,'regularReference':reference,
          'vertexSources':vertex_refs,'edgeSources':edge_refs,'faceSources':face_refs,
          'sourceMaps':{'edgeCorners':[[i for i,r in enumerate(vertex_refs) if r.get('edge')==ei] for ei in range(len(original['edges']))],
                        'edgeRemainders':[[i for i,r in enumerate(edge_refs) if r.get('edge')==ei] for ei in range(len(original['edges']))],
                        'faceDescendants':[[i for i,r in enumerate(face_refs) if r.get('face')==fi] for fi in range(len(original['faces']))],
                        'vertexCaps':[[i for i,r in enumerate(face_refs) if r.get('vertex')==v] for v in range(len(points))]},
          'closedIncidence':True,'sourceEulerCharacteristic':len(points)-len(original['edges'])+len(original['faces']),
          'hullUsed':False,'toleranceWeld':False,'capColorRule':'literal common incident color, otherwise no assigned cap color',
          'solidInteriorInferred':False,'semantics':'ordered closed source surface; intersections and winding are retained'}
    metadata={'sourceMetadata':deepcopy(original.get('metadata',{})),'incidenceTruncation':info,
              'offColors':{'faces':face_colors,'vertices':vertex_colors,'edges':edge_colors},
              'fillRule':original.get('metadata',{}).get('fillRule','nonzero')}
    if 'coordinateUnits' in original.get('metadata',{}):metadata['coordinateUnits']=deepcopy(original['metadata']['coordinateUnits'])
    result.update(id='incidence-cut-'+hashlib.sha256((sha+json.dumps(parameters,sort_keys=True)).encode()).hexdigest(),
                  name=('Quasitruncation' if t>.5 else 'Rectification' if t==.5 else 'Truncation')+' of '+original.get('name','source'),metadata=metadata,
                  provenance={'operation':'incidence-truncate','algorithmVersion':VERSION,**binding,'parameters':parameters,'convexified':False})
    if 0<t<=.5 and original['interpretation']=='convex-polytope':
        try:
            support=_supporting_boundary(result);result.update(support,interpretation='convex-polytope')
            info.update(solidInteriorInferred=True,semantics='qualified closed convex supporting boundary')
        except GeometryError as error:info['convexQualificationRefusal']=str(error)
    elif t==0 and result['interpretation']=='convex-polytope':info.update(solidInteriorInferred=True,semantics='unchanged source convex boundary')
    result['fingerprint']=identity(result);result['validation']=validate(result)
    _check(result['validation']['passed'],'Constructed ordered source boundary failed validation: '+'; '.join(result['validation']['errors']))
    return result


def dispatch_incidence_truncation(request):
    _check(type(request) is dict and not set(request)-{'op','params','model','id','algorithmVersion'} and
           request.get('op') in ('incidence-truncate','incidence-truncate-preview'),'Unsupported incidence truncation source request.')
    _check(request.get('algorithmVersion',VERSION)==VERSION,'Unsupported incidence truncation algorithm version.')
    params=request.get('params',{})
    _check(type(params) is dict and not set(params)-{'preset','amount','reference_face','cap_colors'},'Incidence truncation accepts preset, amount, reference_face and cap_colors only.')
    try:
        model=incidence_truncate(request.get('model'),**params)
        if request['op']=='incidence-truncate':return model
        return {'model':model,'construction':deepcopy(model['metadata']['incidenceTruncation'])}
    except GeometryError:raise
    except (TypeError,ValueError,KeyError,IndexError,ArithmeticError,np.linalg.LinAlgError) as error:
        raise GeometryError('Malformed or numerically unresolved incidence truncation.') from error
