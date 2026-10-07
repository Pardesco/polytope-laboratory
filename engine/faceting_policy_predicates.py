"""Unmounted exact FAC-03 predicates; no search, Hull substitution or solid claim.

Policy truth concerns supplied rational/binary64 coordinates, not an intended
algebraic source. Native source validity and float reciprocal readiness are
separate gates. A predicate receipt is not an enumeration/completeness count.
"""
from collections import Counter, defaultdict
from copy import deepcopy
from fractions import Fraction
from itertools import combinations
import json
import math

from engine.compounds import _check_source
from engine.geometry import GeometryError, canonical_cycle, identity
from engine.history import _json_bytes, _source_hash

VERSION = '0.1.0'
LIMITS = {'vertices':32, 'faces':128, 'faceCorners':16, 'fractionBits':4096,
          'inputBytes':16*1024*1024, 'outputBytes':32*1024*1024, 'work':500_000}


def _bytes(value, maximum=LIMITS['inputBytes']):
    try:
        return _json_bytes(value, maximum)
    except (UnicodeError, RecursionError, OverflowError, ValueError, TypeError) as exc:
        raise GeometryError('Faceting policy requires bounded finite UTF-8 JSON.') from exc


def _hash(value):
    # Native JSON arrays may begin as tuples in Python layouts; compare their
    # portable array/numeric meaning, never boolean-as-integer Python equality.
    return _source_hash(json.loads(_bytes(value, LIMITS['outputBytes'])))


def _f(value):
    if type(value) not in (int, float, str, Fraction):
        raise GeometryError('Exact policy values require numeric or rational literals, never booleans.')
    if type(value) is str and len(value)>256:
        raise GeometryError('Exact policy rational literal exceeds 256 characters.')
    if type(value) is int and value.bit_length()>LIMITS['fractionBits']:
        raise GeometryError('Exact policy integer exceeds its bit bound.')
    try:
        result=Fraction(value)
    except (ValueError, OverflowError, ZeroDivisionError, TypeError) as exc:
        raise GeometryError('Exact policy value is not a finite rational number.') from exc
    if max(result.numerator.bit_length(),result.denominator.bit_length())>LIMITS['fractionBits']:
        raise GeometryError('Exact policy arithmetic exceeds its 4096-bit bound.')
    return result


def _plane(points, ids):
    a,b,c=(points[i] for i in ids)
    u=[_f(y-x) for x,y in zip(a,b)];v=[_f(y-x) for x,y in zip(a,c)]
    n=[_f(u[1]*v[2]-u[2]*v[1]),_f(u[2]*v[0]-u[0]*v[2]),_f(u[0]*v[1]-u[1]*v[0])]
    pivot=next((x for x in n if x),None)
    if pivot is None:return None
    d=-_f(sum(x*y for x,y in zip(n,a)))
    return tuple(_f(x/pivot) for x in n+[d])


def _value(plane,point):
    return _f(sum(x*y for x,y in zip(plane[:3],point))+plane[3])


def _edges(face):
    return [tuple(sorted((a,b))) for a,b in zip(face,face[1:]+face[:1])]


class _Stop(Exception):
    def __init__(self,status,reason):self.status=status;self.reason=reason


class _Job:
    def __init__(self,source,cycles,policy,params,max_work,cancelled):
        _bytes(source);_bytes(cycles);_bytes(params)
        if type(max_work) is not int or not 1<=max_work<=LIMITS['work']:
            raise GeometryError('Policy max_work must be an integer from 1 to 500000.')
        if cancelled is not None and not callable(cancelled):
            raise GeometryError('Policy cancellation requires an injected callable, not JSON.')
        if (type(source) is not dict or type(source.get('id')) is not str or
            not 1<=len(source['id'])<=128 or source.get('dimension')!=3 or
            source.get('embeddingDimension',3)!=3):
            raise GeometryError('Policy requires an identified intrinsic and embedded 3D source Model.')
        vertices=source.get('vertices');faces=source.get('faces')
        if (type(vertices) is not list or not 4<=len(vertices)<=LIMITS['vertices'] or
            type(faces) is not list or len(faces)>LIMITS['faces'] or
            any(type(face) is not list or len(face)>LIMITS['faceCorners'] for face in faces) or
            type(source.get('edges')) is not list or len(source['edges'])>256):
            raise GeometryError('Policy source exceeds bounded vertex/face/edge domain.')
        _check_source(deepcopy(source))
        if (type(cycles) is not list or not 1<=len(cycles)<=LIMITS['faces'] or
            any(type(face) is not list or not 3<=len(face)<=LIMITS['faceCorners'] or
                any(type(v) is not int or not 0<=v<len(vertices) for v in face) for face in cycles)):
            raise GeometryError('Policy cycles require 1 to 128 bounded literal source-ID faces.')
        self.source=source;self.original_cycles=cycles;self.original_params=params
        self.source_hash=_hash(source);self.cycles_hash=_hash(cycles);self.params_hash=_hash(params)
        self.snapshot=deepcopy(source);self.cycles=deepcopy(cycles);self.params=deepcopy(params)
        self.points=[tuple(_f(x) for x in point) for point in vertices]
        numeric='exact supplied integer/binary64 ratios'
        rational=source.get('rationalCoordinates')
        if rational is not None:
            if (type(rational) is not list or len(rational)!=len(vertices) or
                any(type(row) is not list or len(row)!=3 or
                    any(type(x) is not str for x in row) for row in rational)):
                raise GeometryError('Policy rationalCoordinates must be a complete string ratio table.')
            exact=[tuple(_f(x) for x in row) for row in rational]
            try:
                agrees=all(float(q)==float(v) and (not q or float(q)!=0)
                           for row,display in zip(exact,vertices) for q,v in zip(row,display))
            except (OverflowError,ValueError):agrees=False
            if not agrees:
                raise GeometryError('Exact rational source coordinates disagree with native display coordinates.')
            self.points=exact;numeric='exact supplied rationalCoordinates; display agreement checked'
        if len(set(self.points))!=len(self.points):
            raise GeometryError('Policy does not weld coincident source vertex IDs.')
        self.max_work=max_work;self.work=0;self.cancelled=cancelled
        self.receipt={'version':VERSION,'policy':policy,'sourceId':source['id'],
            'sourceFingerprint':identity(source),'sourceSnapshotHash':self.source_hash,
            'sourceSnapshot':self.snapshot,'cycles':self.cycles,'parameters':self.params,
            'numericPredicate':numeric,'numericCertifiedModel':False,
            'status':'complete','passed':None,'diagnostics':[],'witnesses':{},
            'limits':deepcopy(LIMITS),'maxWork':max_work,'workUsed':0,
            'enumerationComplete':False,'enumerationCount':None,
            'sourceGeometryChanged':False,'implicitWeld':False}

    def step(self,amount=1):
        if self.cancelled is not None and self.cancelled():
            raise _Stop('user-cancelled','Injected policy cancellation; no acceptance or search count.')
        if self.work+amount>self.max_work:
            raise _Stop('resource-limited','Exact predicate work budget reached; verdict unknown.')
        self.work+=amount

    def rank(self):
        for ids in combinations(range(len(self.points)),3):
            self.step();plane=_plane(self.points,ids)
            if plane is not None:
                for point in self.points:
                    self.step()
                    if _value(plane,point):return
                break
        raise _Stop('unsupported','Source must have exact affine rank three.')

    def finish(self):
        if (_hash(self.source)!=self.source_hash or _hash(self.original_cycles)!=self.cycles_hash or
            _hash(self.original_params)!=self.params_hash):
            raise GeometryError('Policy source/cycle/parameter ownership changed during evaluation.')
        self.receipt['workUsed']=self.work
        self.receipt['id']='faceting-policy-'+_hash(self.receipt)
        _bytes(self.receipt,LIMITS['outputBytes'])
        return self.receipt


def _face_planes(job,points,cycles):
    planes=[]
    for face_id,face in enumerate(cycles):
        plane=None
        for ids in combinations(dict.fromkeys(face),3):
            job.step();plane=_plane(points,ids)
            if plane is not None:break
        if plane is None:
            raise _Stop('unsupported',f'Face {face_id} has no noncollinear source-plane anchor.')
        for v in face:
            job.step()
            if _value(plane,points[v]):
                raise _Stop('unsupported',f'Face {face_id} is not exactly planar in the declared numeric domain.')
        planes.append(plane)
    return planes


def _tidy(job,points,cycles,allow):
    planes=_face_planes(job,points,cycles);incidence=defaultdict(list)
    repeated=[];zero=[]
    for face_id,face in enumerate(cycles):
        job.step(len(face))
        if len(set(face))!=len(face):repeated.append(face_id)
        for edge in _edges(face):
            incidence[edge].append(face_id)
            if edge[0]==edge[1]:zero.append([face_id,list(edge)])
    bad=[{'edge':list(e),'faceIds':ids} for e,ids in sorted(incidence.items())
         if len(ids)!=2 or len(set(ids))!=2]
    coplanar=[]
    for a,b in combinations(range(len(cycles)),2):
        job.step()
        shared=sorted(set(cycles[a])&set(cycles[b]))
        if planes[a]==planes[b] and shared:coplanar.append({'faceIds':[a,b],'vertexIds':shared})
    duplicates=[];blocks=defaultdict(list)
    for i,face in enumerate(cycles):blocks[canonical_cycle(face)].append(i)
    for ids in blocks.values():
        if len(ids)>1:duplicates.append(ids)
    return {'passed':not (repeated or zero or bad or (coplanar and not allow)),
        'facePlanes':[[str(x) for x in plane] for plane in planes],
        'edgeIncidence':[{'edge':list(e),'faceIds':ids} for e,ids in sorted(incidence.items())],
        'nonTwoFaceEdges':bad,'repeatedFaceVertexIds':repeated,'zeroLengthEdges':zero,
        'coplanarSharing':coplanar,'allowCoplanarSharing':allow,
        'repeatedCycleOwnerGroups':duplicates,'additionalRepeatedFaceExclusionApplied':False,
        'singleVertexLinkRequired':False,'selfIntersectionExcluded':False}


def _spiky(job):
    _face_planes(job,job.points,job.cycles)
    supports={}
    for ids in combinations(range(len(job.points)),3):
        job.step();plane=_plane(job.points,ids)
        if plane is None or plane in supports:continue
        values=[]
        for point in job.points:job.step();values.append(_value(plane,point))
        if any(v>0 for v in values) and any(v<0 for v in values):continue
        if not any(values):continue
        supports[plane]={'plane':[str(x) for x in plane],'anchorVertexIds':list(ids),
            'zeroVertexIds':[i for i,v in enumerate(values) if not v],
            'side':-1 if any(v<0 for v in values) else 1}
    support_rows=[supports[key] for key in sorted(supports)]
    edges=sorted(set(edge for face in job.cycles for edge in _edges(face)));rows=[]
    for edge in edges:
        job.step(len(support_rows))
        if edge[0]==edge[1]:raise _Stop('unsupported','Zero-length candidate segment is not a spiky edge.')
        common=[i for i,row in enumerate(support_rows) if all(v in row['zeroVertexIds'] for v in edge)]
        mid=[_f((x+y)/2) for x,y in zip(job.points[edge[0]],job.points[edge[1]])]
        rows.append({'edge':list(edge),'hullBoundarySegment':bool(common),'supportPlaneIds':common,
            'midpoint':[str(x) for x in mid],
            'endpointExtremeStatusNotUsed':True})
    job.receipt['witnesses']={'supportPlanes':support_rows,'edges':rows,
        'allSupportingTriplesExhausted':True,
        'criterion':'whole segment on boundary iff both endpoints lie in a common support plane',
        'notAHullOneSkeletonTest':True}
    job.receipt['passed']=not any(row['hullBoundarySegment'] for row in rows)


def _links(job,cycles,tidy):
    """All link components, rather than an invented single-link tidy constraint."""
    edges=tidy['edgeIncidence'];result=[]
    active=sorted(set(v for face in cycles for v in face))
    for vertex in active:
        graph=defaultdict(list)
        for row in edges:
            job.step()
            if vertex in row['edge']:
                a,b=row['faceIds'];graph[a].append(b);graph[b].append(a)
        if any(len(neighbors)!=2 for neighbors in graph.values()):
            raise _Stop('unsupported','Reciprocal vertex link is not a degree-two incidence graph.')
        unseen=set(graph);components=[]
        while unseen:
            start=min(unseen);cycle=[];previous=None;current=start
            while current not in cycle:
                job.step();cycle.append(current)
                neighbors=sorted(graph[current]);next_id=next((n for n in neighbors if n!=previous),None)
                if next_id is None:
                    raise _Stop('unsupported','Reciprocal vertex link collapses to a two-face digon.')
                previous,current=current,next_id
            if current!=start or len(cycle)<3:
                raise _Stop('unsupported','Reciprocal link is degenerate or ambiguously repeated.')
            unseen.difference_update(cycle);components.append(list(canonical_cycle(cycle)))
        result.append({'sourceVertexId':vertex,'faceCycles':components})
    return result


def _reciprocal(job):
    center=[_f(x) for x in job.params['center']];radius=_f(job.params['radius'])
    original=defaultdict(list)
    for i,face in enumerate(job.snapshot['faces']):original[canonical_cycle(face)].append(i)
    selected_owners=[original.get(canonical_cycle(face),[]) for face in job.cycles]
    job.receipt['witnesses']['selectedFaceToOriginalSourceFaceIds']=selected_owners
    primal=_tidy(job,job.points,job.cycles,False)
    job.receipt['witnesses']['primalTidy']=primal
    if not primal['passed']:
        job.receipt['passed']=False;job.receipt['diagnostics'].append('Primal is not tidy.');return
    planes=[tuple(_f(x) for x in row) for row in primal['facePlanes']]
    offsets=[-_value(plane,center) for plane in planes]
    infinite=[i for i,h in enumerate(offsets) if not h]
    job.receipt['witnesses'].update(center=[str(x) for x in center],radius=str(radius),
        planeOffsets=[str(x) for x in offsets],infiniteSelectedFaceIds=infinite)
    if infinite:
        job.receipt['passed']=False
        job.receipt['diagnostics'].append('Source planes through the exact center have infinite reciprocal vertices; no Model emitted.')
        return
    dual=[]
    for plane,h in zip(planes,offsets):
        job.step();dual.append(tuple(_f(c+radius*radius*n/h) for c,n in zip(center,plane[:3])))
    blocks=defaultdict(list)
    for i,p in enumerate(dual):blocks[p].append(i)
    collisions=[ids for ids in blocks.values() if len(ids)>1]
    job.receipt['witnesses']['coincidentDualVertexSelectedFaceGroups']=collisions
    if collisions:
        job.receipt['passed']=False
        job.receipt['diagnostics'].append('Distinct coplanar source faces produce coincident reciprocal vertices; no weld performed.')
        return
    links=_links(job,job.cycles,primal)
    job.receipt['witnesses']['sourceVertexLinkComponents']=links
    if any(len(row['faceCycles'])!=1 for row in links):
        # The published definition permits a pinched primal but does not choose
        # whether several polar faces at its vertex are separate owners.
        raise _Stop('unsupported','Finite reciprocal has multiple link components at a source vertex; baseline dual ownership is not specified.')
    cycles=[row['faceCycles'][0] for row in links]
    dual_tidy=_tidy(job,dual,cycles,False)
    native_ready=True;display=[]
    try:
        display=[[float(x) for x in row] for row in dual]
        native_ready=all(math.isfinite(v) and abs(v)<=1e100 and (not q or v!=0)
                         for exact,approx in zip(dual,display) for q,v in zip(exact,approx))
        native_ready=native_ready and len(set(map(tuple,display)))==len(dual)
    except (OverflowError,ValueError):native_ready=False
    vertex_map=[None]*len(job.points)
    for face_id,row in enumerate(links):vertex_map[row['sourceVertexId']]=face_id
    original_faces=[[] for _ in job.snapshot['faces']]
    for dual_id,owners in enumerate(selected_owners):
        for owner in owners:original_faces[owner].append(dual_id)
    job.receipt['witnesses'].update(dualVertices=[[str(x) for x in row] for row in dual],
        dualFaces=cycles,dualTidy=dual_tidy,nativeFloatCoordinatesRepresentable=native_ready,
        nativeModelValidated=False,selectedFaceToDualVertex=list(range(len(dual))),
        originalSourceFaceToDualVertices=original_faces,sourceVertexToDualFace=vertex_map,
        dualFaceToSourceVertex=[row['sourceVertexId'] for row in links])
    job.receipt['passed']=dual_tidy['passed']
    if not native_ready:job.receipt['diagnostics'].append('Exact reciprocal is finite; native display/measure readiness is unsupported.')


def _partial(job):
    from engine.automatic_faceting import _symmetry
    actions=job.params['symmetry_permutations'];n=len(job.points)
    count=len(actions) if type(actions) is list else 1
    job.step(count*(n*n+len(job.source['edges'])*2+sum(map(len,job.source['faces'])))+count*count*n)
    group=_symmetry(job.snapshot,job.points,actions)
    # The frozen helper also accepts these Fraction points internally. Name
    # that actual domain rather than repeating its binary64-only public label.
    group['distancePredicate']=job.receipt['numericPredicate']+' squared distances'
    group.pop('id');group['id']='source-subgroup-'+_hash(group)
    selected=Counter(canonical_cycle(face) for face in job.cycles)
    action_invariant=True
    for action in group['permutations']:
        job.step(sum(map(len,job.cycles)))
        if Counter(canonical_cycle([action[v] for v in face]) for face in job.cycles)!=selected:
            action_invariant=False
    active=set(v for face in job.cycles for v in face);remaining=set(range(n));orbits=[]
    while remaining:
        v=min(remaining);orbit=sorted({action[v] for action in group['permutations']})
        orbits.append(orbit);remaining.difference_update(orbit)
    split=[orbit for orbit in orbits if active.intersection(orbit) and not set(orbit)<=active]
    unused=sorted(set(range(n))-active)
    job.receipt['witnesses']={'verifiedSourceSubgroup':group,'vertexOrbits':orbits,
        'activeVertexIds':sorted(active),'unusedVertexIds':unused,'splitVertexOrbits':split,
        'selectedCyclesInvariant':action_invariant,'usesAllSourceVertices':not unused,
        'selectedFaceOwnerIds':list(range(len(job.cycles))),
        'partialMeaning':'omitted whole vertex orbits; full selected cycles retain the declared subgroup',
        'maximalSymmetryClaim':False}
    job.receipt['passed']=action_invariant and not split and (job.params['accept_partial'] or not unused)


def _run(policy,source,cycles,params,*,max_work=LIMITS['work'],cancelled=None):
    job=_Job(source,cycles,policy,params,max_work,cancelled)
    try:
        job.rank()
        if policy=='tidy':
            result=_tidy(job,job.points,job.cycles,params['allow_coplanar_sharing'])
            job.receipt['witnesses']=result;job.receipt['passed']=result['passed']
        elif policy=='spiky':_spiky(job)
        elif policy=='reciprocal':_reciprocal(job)
        elif policy=='partial':_partial(job)
        else:raise GeometryError('Unknown faceting policy.')
    except _Stop as stop:
        job.receipt['status']=stop.status;job.receipt['passed']=None
        job.receipt['diagnostics'].append(stop.reason)
    except (OverflowError,ZeroDivisionError) as exc:
        raise GeometryError('Faceting policy arithmetic cannot resolve this numeric domain.') from exc
    return job.finish()


def analyze_tidy(source,cycles,*,allow_coplanar_sharing=False,**options):
    if type(allow_coplanar_sharing) is not bool:raise GeometryError('Coplanar sharing requires a boolean.')
    return _run('tidy',source,cycles,{'allow_coplanar_sharing':allow_coplanar_sharing},**options)


def analyze_spiky(source,cycles,**options):
    return _run('spiky',source,cycles,{},**options)


def analyze_reciprocal(source,cycles,*,center,radius=1,**options):
    if type(center) is not list or len(center)!=3:
        raise GeometryError('Reciprocal policy requires an explicit three-coordinate center.')
    _bytes(center)
    for x in center:_f(x)
    radius=_f(radius)
    if radius<=0:raise GeometryError('Reciprocal sphere radius must be positive.')
    return _run('reciprocal',source,cycles,{'center':center,'radius':str(radius)},**options)


def analyze_partial(source,cycles,*,symmetry_permutations=None,accept_partial=False,**options):
    if type(accept_partial) is not bool:raise GeometryError('Accept partial requires a boolean.')
    return _run('partial',source,cycles,{'symmetry_permutations':symmetry_permutations,
                'accept_partial':accept_partial},**options)


def verify_policy_receipt(source,receipt):
    """Reexecute deterministic complete/resource-limited policy; no caller IDs trusted."""
    _bytes(receipt,LIMITS['outputBytes'])
    if type(receipt) is not dict or receipt.get('version')!=VERSION:
        raise GeometryError('Unsupported faceting policy receipt version.')
    if receipt.get('status')=='user-cancelled':
        raise GeometryError('Canceled predicate has no deterministic acceptance receipt to verify.')
    if receipt.get('sourceSnapshotHash')!=_hash(source) or _hash(receipt.get('sourceSnapshot'))!=_hash(source):
        raise GeometryError('Faceting policy full source ownership does not match.')
    params=receipt.get('parameters');policy=receipt.get('policy')
    allowed={'tidy':{'allow_coplanar_sharing'},'spiky':set(),
        'reciprocal':{'center','radius'},'partial':{'symmetry_permutations','accept_partial'}}
    if type(policy) is not str or policy not in allowed or type(params) is not dict or set(params)!=allowed[policy]:
        raise GeometryError('Faceting policy parameters do not match the exact policy schema.')
    functions={'tidy':analyze_tidy,'spiky':analyze_spiky,'reciprocal':analyze_reciprocal,'partial':analyze_partial}
    fresh=functions[policy](source,receipt.get('cycles'),max_work=receipt.get('maxWork'),**params)
    if _hash(fresh)!=_hash(receipt):
        raise GeometryError('Faceting policy reconstructed witnesses/accounting/attributes were changed.')
    return fresh
