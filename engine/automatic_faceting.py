"""Development-only exact source-plane cycles and bounded labeled facet search.

No Hull, angular sorting, convexification or filled-solid measure. Optional
maximal source-group claims require exhausted exact metric/incidence discovery;
no competitor-completeness assertion. Exact predicates concern supplied binary64
coordinates; final native surface validation remains approximate.
"""
from collections import Counter, defaultdict
from copy import deepcopy
from fractions import Fraction
from itertools import combinations, permutations
import hashlib
import math

from engine.compounds import _check_source, _colors
from engine.geometry import GeometryError, TOLERANCE, canonical_cycle, identity, validate
from engine.history import _json_bytes, _source_hash
from engine.faceting_search_filters import PolicyBudget, PolicyStop, apply_policy_evidence
from engine.faceting_tidy_dual import tidy_dual_parameters, validate_tidy_dual_equivalence
from engine.faceting_source_symmetry import faceting_source_group

VERSION = '0.3.0'
LIMITS = {'sourceVertices':12, 'faceCorners':8, 'candidates':4096,
          'cyclesPerPlane':4096, 'searchVariables':256, 'searchNodes':200_000, 'results':128,
          'groupElements':128, 'actionReferences':100_000, 'sourceActionReferences':100_000,
          'fractionBits':4096, 'inputBytes':16*1024*1024, 'outputBytes':64*1024*1024}


def _bytes(value, bound=LIMITS['outputBytes']):
    try:
        return _json_bytes(value, bound)
    except (UnicodeError, RecursionError, OverflowError, TypeError, ValueError) as exc:
        raise GeometryError('Faceting requires finite bounded UTF-8 JSON data.') from exc


def _hash(value):
    # Established native source hashing normalizes integer-valued floats/-0.
    _bytes(value)
    return _source_hash(value)


def _integer(value, name, maximum, minimum=1):
    if type(value) is not int or not minimum <= value <= maximum:
        raise GeometryError(f'Faceting {name} must be an integer from {minimum} to {maximum}.')
    return value


def _source(source):
    _bytes(source, LIMITS['inputBytes'])  # Budget before copies or validators.
    if type(source) is not dict or type(source.get('id')) is not str or not 1 <= len(source['id']) <= 128:
        raise GeometryError('Faceting requires a bounded source model ID.')
    if source.get('dimension') != 3 or source.get('embeddingDimension',3) != 3:
        raise GeometryError('Faceting prototype requires intrinsic 3D source coordinates.')
    vertices=source.get('vertices')
    if type(vertices) is not list or not 4 <= len(vertices) <= LIMITS['sourceVertices']:
        raise GeometryError('Faceting prototype supports 4 to 12 source vertices.')
    _check_source(source)
    points=[tuple(_fraction(value) for value in point) for point in vertices]
    if len(set(points)) != len(points):
        raise GeometryError('Coincident source vertex coordinates are unsupported; IDs are never welded.')
    first_plane=next((plane for ids in combinations(range(len(points)),3)
                      if (plane:=_plane(points,ids)) is not None),None)
    if first_plane is None or not any(_value(first_plane,point) for point in points):
        raise GeometryError('Source points must have exact affine rank three; planar sources are unsupported.')
    return points


def _fraction(value):
    result=Fraction(value)
    if max(result.numerator.bit_length(),result.denominator.bit_length()) > LIMITS['fractionBits']:
        raise GeometryError('Faceting exact binary64-ratio arithmetic exceeds its 4096-bit bound.')
    return result


def _plane(points, ids):
    a,b,c=(points[i] for i in ids)
    u=[_fraction(y-x) for x,y in zip(a,b)]
    v=[_fraction(y-x) for x,y in zip(a,c)]
    normal=[_fraction(u[1]*v[2]-u[2]*v[1]),_fraction(u[2]*v[0]-u[0]*v[2]),_fraction(u[0]*v[1]-u[1]*v[0])]
    pivot=next((x for x in normal if x),None)
    if pivot is None:return None
    offset=-_fraction(sum(x*y for x,y in zip(normal,a)))
    return tuple(_fraction(x/pivot) for x in normal+[offset])


def _value(plane,point):
    return _fraction(sum(x*y for x,y in zip(plane[:3],point))+plane[3])


def _edges(cycle):
    return tuple(sorted(tuple(sorted((a,b))) for a,b in zip(cycle,cycle[1:]+cycle[:1])))


def _canceled(callback):
    if callback is not None and not callable(callback):
        raise GeometryError('Development cancellation requires a callable; it is not a JSON parameter.')
    return callback is not None and bool(callback())


def _determinant(a,b,c):
    return _fraction(a[0]*(b[1]*c[2]-b[2]*c[1])-a[1]*(b[0]*c[2]-b[2]*c[0])+a[2]*(b[0]*c[1]-b[1]*c[0]))


def _symmetry(source,points,actions):
    n=len(points);_bytes(actions,LIMITS['inputBytes'])
    if actions is None:actions=[list(range(n))]
    if (type(actions) is not list or not 1<=len(actions)<=LIMITS['groupElements'] or
        any(type(row) is not list or len(row)!=n or any(type(v) is not int or not 0<=v<n for v in row) or
            len(set(row))!=n for row in actions)):
        raise GeometryError('Supply 1 to 128 complete source symmetry permutations with bounded distinct integer vertex IDs.')
    action_set={tuple(row) for row in actions}
    if len(action_set)!=len(actions):raise GeometryError('Duplicate symmetry actions are not a complete distinct element list.')
    if tuple(range(n)) not in action_set:raise GeometryError('A source symmetry subgroup must include the identity action.')
    pairs=list(combinations(range(n),2))
    work=len(action_set)*(len(pairs)+2*len(source['edges'])+sum(map(len,source['faces']))+sum(map(len,source.get('cells',[]))))
    if work>LIMITS['sourceActionReferences']:
        raise GeometryError('Source symmetry incidence/distance verification exceeds its 100,000-reference work bound.')
    squared=[_fraction(sum((x-y)**2 for x,y in zip(points[a],points[b]))) for a,b in pairs]
    edges=Counter(tuple(sorted(e)) for e in source['edges'])
    faces=Counter(canonical_cycle(f) for f in source['faces'])
    cells=Counter(tuple(sorted(cell)) for cell in source.get('cells',[]))
    face_blocks=defaultdict(list)
    for i,face in enumerate(source['faces']):face_blocks[canonical_cycle(face)].append(i)
    face_ranks={face_id:rank for block in face_blocks.values() for rank,face_id in enumerate(block)}
    anchor=next(ids for ids in combinations(range(n),4) if _determinant(*[
        [_fraction(x-y) for x,y in zip(points[v],points[ids[0]])] for v in ids[1:]])!=0)
    source_det=_determinant(*[[x-y for x,y in zip(points[v],points[anchor[0]])] for v in anchor[1:]])
    ordered=sorted(action_set);signs=[];face_actions=[]
    for row in ordered:
        if any(_fraction(sum((x-y)**2 for x,y in zip(points[row[a]],points[row[b]])))!=distance
               for (a,b),distance in zip(pairs,squared)):
            raise GeometryError('Forged symmetry action does not preserve every exact source squared distance.')
        mapped_faces=[canonical_cycle([row[v] for v in face]) for face in source['faces']]
        if (Counter(tuple(sorted(row[v] for v in e)) for e in source['edges'])!=edges or Counter(mapped_faces)!=faces):
            raise GeometryError('Source symmetry must preserve full original edges and ordered face/cell incidence, not just its point set.')
        mapped_ids=[face_blocks[face][face_ranks[i]] for i,face in enumerate(mapped_faces)]
        if Counter(tuple(sorted(mapped_ids[f] for f in cell)) for cell in source.get('cells',[]))!=cells:
            raise GeometryError('Source symmetry does not preserve original cell face IDs under its declared source-face lift.')
        face_actions.append(mapped_ids)
        det=_determinant(*[[x-y for x,y in zip(points[row[v]],points[row[anchor[0]]])] for v in anchor[1:]])
        ratio=_fraction(det/source_det)
        if ratio not in (-1,1):raise GeometryError('Source action has unresolved proper/improper orientation.')
        signs.append(int(ratio))
    for left in ordered:
        inverse=tuple(left.index(i) for i in range(n))
        if inverse not in action_set:raise GeometryError('Incomplete source symmetry action list: an inverse is missing.')
        for right in ordered:
            if tuple(left[right[i]] for i in range(n)) not in action_set:
                raise GeometryError('Incomplete source symmetry action list: composition closure fails; provide all subgroup elements, not generators.')
    receipt={'version':VERSION,'sourceId':source['id'],'sourceFingerprint':identity(source),
        'sourceSnapshotHash':_hash(source),'permutations':[list(row) for row in ordered],
        'orientationSigns':signs,'orientationAnchorVertexIds':list(anchor),'order':len(ordered),
        'sourceFaceActionIndices':face_actions,'verificationReferences':work,
        'squaredDistanceWitnessHash':_hash([str(value) for value in squared]),
        'distancePredicate':'exact supplied integer/binary64-ratio squared distances',
        'originalIncidencePreserved':True,'identityInverseCompositionVerified':True,
        'maximalSourceSymmetryClaim':False,'attributeInvarianceRequired':False}
    receipt['id']='source-subgroup-'+_hash(receipt)
    return receipt


def verify_source_symmetry(source,symmetry_permutations=None):
    """Verify a complete finite element list, not generators or maximal symmetry.

    An exact full-dimensional point-set isometry uniquely defines a rigid affine
    action; complete source incidence is checked separately. Colors are retained
    source attributes, deliberately not a restriction on the geometric subgroup.
    """
    return _symmetry(source,_source(source),symmetry_permutations)


def _candidate_actions(candidates,group,generation_status,cancelled=None):
    receipt={'group':group,'status':'complete','candidateActionIndices':[], 'orbits':[],'limitReasons':[]}
    if group.get('automaticGroupComplete') is False:
        receipt.update(status=group['automaticGroupStatus'],limitReasons=['automatic source group discovery incomplete'])
        return receipt
    if len(candidates)*group['order']>LIMITS['actionReferences']:
        receipt.update(status='resource-limited',limitReasons=['source candidate action-reference cap'])
        return receipt
    lookup={tuple(row['cycle']):i for i,row in enumerate(candidates)}
    actions=[]
    for permutation in group['permutations']:
        if _canceled(cancelled):receipt.update(status='user-cancelled',limitReasons=['source candidate action construction canceled']);return receipt
        mapped=[]
        for row in candidates:
            key=canonical_cycle([permutation[v] for v in row['cycle']])
            if key not in lookup:
                if generation_status=='complete':raise GeometryError('Verified source subgroup does not preserve the full ordered candidate domain.')
                receipt.update(status='resource-limited',limitReasons=['limited candidate table is not closed under selected subgroup'])
                return receipt
            mapped.append(lookup[key])
        actions.append(mapped)
    remaining=set(range(len(candidates)))
    while remaining:
        first=min(remaining);orbit=sorted({action[first] for action in actions});remaining.difference_update(orbit)
        ids=sorted(candidates[i]['id'] for i in orbit)
        record={'id':'candidate-orbit-'+_hash({'subgroup':group['id'],'candidateIds':ids}),
                'candidateIds':ids,'representativeCandidateId':ids[0],'size':len(ids)}
        receipt['orbits'].append(record)
        for i in orbit:candidates[i]['subgroupOrbitId']=record['id']
    receipt['candidateActionIndices']=actions
    return receipt


def candidate_facets(source, *, max_face_vertices=8, max_candidates=4096,
                     max_cycles_per_plane=4096, symmetry_permutations=None, source_symmetry=None, cancelled=None):
    """Every labeled simple cycle in exact source-supported planes, within caps.

    Self-crossings are retained; traversal never repeats a source vertex. Rank-one
    subsets are excluded. Rotation/reversal identify equivalent cyclic boundaries.
    Center planes remain eligible. Caller caps explicitly restrict the domain.
    """
    corners=_integer(max_face_vertices,'face-corner cap',LIMITS['faceCorners'],3)
    cap=_integer(max_candidates,'candidate cap',LIMITS['candidates'])
    per_plane=_integer(max_cycles_per_plane,'per-plane cap',LIMITS['cyclesPerPlane'])
    points=_source(source)
    group,discovery=faceting_source_group(source,points,symmetry_permutations,source_symmetry,cancelled=cancelled)
    if cancelled is not None and not callable(cancelled):
        raise GeometryError('Development cancellation requires a callable.')
    planes={};examined=0;status=discovery['status'] if discovery else 'complete';reasons=list(discovery['limitReasons']) if discovery else []
    for ids in combinations(range(len(points)),3):
        if discovery and not discovery['complete']:break
        if _canceled(cancelled):status='user-cancelled';reasons.append('candidate-plane generation canceled');break
        examined+=1;plane=_plane(points,ids)
        if plane is not None and plane not in planes:
            planes[plane]={'id':'plane-'+_hash([str(x) for x in plane]),
                          'exactPlane':[str(x) for x in plane],'anchorVertexIds':list(ids),
                          'sourceVertexIds':[i for i,point in enumerate(points) if _value(plane,point)==0]}
    original=defaultdict(list)
    for i,face in enumerate(source['faces']):original[canonical_cycle(face)].append(i)
    candidates=[];plane_records=sorted(planes.values(),key=lambda row:row['id']);stop=status!='complete'
    for plane in plane_records:
        generated=0;plane['generatedCycles']=0;plane['cycleLimitReached']=False
        if stop:continue
        ids=plane['sourceVertexIds']
        for size in range(3,min(len(ids),corners)+1):
            if stop:break
            for subset in combinations(ids,size):
                if stop:break
                if not any(_plane(points,triple) is not None for triple in combinations(subset,3)):continue
                for tail in permutations(subset[1:]):
                    if tail[0]>tail[-1]:continue  # Opposite traversal of the same cycle.
                    if _canceled(cancelled):status='user-cancelled';reasons.append('candidate-cycle generation canceled');stop=True;break
                    if generated>=per_plane:
                        status='resource-limited';reasons.append('per-plane candidate cap');plane['cycleLimitReached']=True;break
                    if len(candidates)>=cap:
                        status='resource-limited';reasons.append('global candidate cap');stop=True;break
                    cycle=[subset[0],*tail]
                    candidates.append({'id':'facet-'+_hash({'planeId':plane['id'],'cycle':cycle}),
                        'planeId':plane['id'],'cycle':cycle,'edges':[list(edge) for edge in _edges(cycle)],
                        'sourceFaceIds':original.get(tuple(cycle),[])})
                    generated+=1
                if plane['cycleLimitReached']:break
            if plane['cycleLimitReached']:break
        plane['generatedCycles']=generated
    generation_status='not-started' if discovery and not discovery['complete'] else status
    actions=_candidate_actions(candidates,group,status,cancelled)
    if _hash(source)!=group['sourceSnapshotHash']:
        raise GeometryError('Faceting source snapshot changed during candidate construction; no receipt was published.')
    if actions['status']=='user-cancelled':status='user-cancelled'
    elif actions['status']!='complete' and status=='complete':status='resource-limited'
    reasons.extend(actions['limitReasons'])
    return {**({'sourceSymmetryOptions':discovery['options'],'sourceSymmetryDiscovery':discovery} if discovery else {}),
            'version':VERSION,'status':status,'generationStatus':generation_status,'sourceId':source['id'],
            'sourceFingerprint':identity(source),'sourceSnapshotHash':_hash(source),
            'domain':{'intrinsicDimension':3,'maximumFaceVertices':corners,
                      'maximumCandidates':cap,'maximumCyclesPerPlane':per_plane,
                      'planarity':'exact supplied integer/binary64-ratio planes',
                      'repeatedVertices':False,'selfCrossingCycles':True,
                      'cycleEquivalence':'source-ID cycle rotation or reversal',
                      'symmetry':'verified source subgroup full-cycle action','subgroupId':group['id']},
            'symmetry':actions,
            'planes':plane_records,'candidates':candidates,'triplesExamined':examined,
            'limitReasons':list(dict.fromkeys(reasons)),
            'restrictedFaceSize':corners<len(points)}


CRITERIA_KEYS = ('accept_partial','coplanar_vertices','isohedral','min_face_types',
                 'max_face_types','max_faces_per_plane','plane_face_counts','tidy','spiky',
                 'tidy_dual','dual_center','dual_radius')


def _criteria(value):
    if value is None:value={}
    _bytes(value,LIMITS['inputBytes'])
    if type(value) is not dict or set(value)-set(CRITERIA_KEYS):
        raise GeometryError('Development criteria support partial/coplanar, result-subgroup isohedral/type and exact plane-count filters; optional exact tidy/spiky and source-incidence polar tidy-dual filters.')
    for name in ('tidy','spiky'):
        if name in value and type(value[name]) is not bool:
            raise GeometryError('Faceting tidy/spiky policy filters must be boolean.')
    partial=value.get('accept_partial',False);coplanar=value.get('coplanar_vertices','disjoint')
    if type(partial) is not bool or coplanar not in ('disjoint','allow'):
        raise GeometryError('Use boolean accept_partial and coplanar_vertices disjoint or allow.')
    isohedral=value.get('isohedral',False)
    if type(isohedral) is not bool:raise GeometryError('Faceting isohedral must be boolean.')
    minimum=_integer(value.get('min_face_types',1),'minimum face types',LIMITS['candidates'])
    maximum=_integer(value.get('max_face_types',0),'maximum face types',LIMITS['candidates'],0)
    if maximum and maximum<minimum:raise GeometryError('Maximum face types must be zero (unlimited) or at least the minimum.')
    plane_max=_integer(value.get('max_faces_per_plane',0),'maximum result faces per plane',LIMITS['candidates'],0)
    plane_counts=value.get('plane_face_counts',{})
    if (type(plane_counts) is not dict or len(plane_counts)>LIMITS['candidates'] or
        any(type(key) is not str or not 1<=len(key)<=128 for key in plane_counts)):
        raise GeometryError('Exact plane_face_counts must map generated plane IDs to bounded integer counts.')
    for count in plane_counts.values():_integer(count,'exact plane face count',LIMITS['candidates'],0)
    return {'accept_partial':partial,'coplanar_vertices':coplanar,'isohedral':isohedral,
            'min_face_types':minimum,'max_face_types':maximum,'max_faces_per_plane':plane_max,
            'plane_face_counts':dict(sorted(plane_counts.items())),
            'twoDistinctFacesPerEdge':True,'singleSimpleVertexLinks':True,
            **{name:value[name] for name in ('tidy','spiky') if name in value},
            **tidy_dual_parameters(value)}


def _validate_plane_filters(catalogue,criteria,equivalence):
    """Fixed source-plane constraints cannot change under a quotient action."""
    requested=criteria['plane_face_counts'];planes=catalogue['planes']
    known={plane['id'] for plane in planes}
    if not set(requested)<=known:raise GeometryError('Exact face-count filter names an unknown source plane ID.')
    if equivalence!='subgroup' or not requested:return
    by_vertices={tuple(plane['sourceVertexIds']):plane['id'] for plane in planes}
    for action in catalogue['symmetry']['group']['permutations']:
        for plane in planes:
            target=by_vertices.get(tuple(sorted(action[v] for v in plane['sourceVertexIds'])))
            if target is None or requested.get(plane['id'])!=requested.get(target):
                raise GeometryError('Exact plane-count constraints are not invariant under subgroup equivalence; use labeled equivalence or complete plane-orbit constraints.')


def _filter_evidence(rows,catalogue,criteria,types):
    planes={plane['id']:plane for plane in catalogue['planes']};owners=defaultdict(list)
    for row in rows:owners[row['planeId']].append(row['id'])
    requested=criteria['plane_face_counts'];counts={key:len(ids) for key,ids in owners.items()}
    records=[{'planeId':key,'exactPlane':planes[key]['exactPlane'],
              'faceCount':counts.get(key,0),'candidateIds':sorted(owners.get(key,[]))}
             for key in sorted(set(owners)|set(requested))]
    checks={'isohedral':not criteria['isohedral'] or types==1,
            'minimumFaceTypes':types>=criteria['min_face_types'],
            'maximumFaceTypes':not criteria['max_face_types'] or types<=criteria['max_face_types'],
            'maximumFacesPerPlane':not criteria['max_faces_per_plane'] or all(
                count<=criteria['max_faces_per_plane'] for count in counts.values()),
            'exactPlaneFaceCounts':all(counts.get(key,0)==count for key,count in requested.items())}
    return {'criteria':deepcopy(criteria),'checks':checks,'accepted':all(checks.values()),
            'typeScope':'result stabilizer within verified source subgroup',
            'exactPlaneOwnership':True,'planeFaceCounts':records}


def _incidence(selected,vertex_count,criteria):
    edge_faces=defaultdict(list);vertices=set();plane_vertices=defaultdict(set)
    for face_id,row in enumerate(selected):
        cycle=row['cycle'];verts=set(cycle);vertices.update(verts)
        if criteria['coplanar_vertices']=='disjoint' and plane_vertices[row['planeId']]&verts:
            return None
        plane_vertices[row['planeId']].update(verts)
        for edge in _edges(cycle):edge_faces[edge].append(face_id)
    if not selected or any(len(faces)!=2 or len(set(faces))!=2 for faces in edge_faces.values()):return None
    if not criteria['accept_partial'] and len(vertices)!=vertex_count:return None
    links={}
    for vertex in sorted(vertices):
        adjacency=defaultdict(list)
        for edge,faces in edge_faces.items():
            if vertex in edge:
                a,b=faces;adjacency[a].append(b);adjacency[b].append(a)
        if len(adjacency)<3 or any(len(ids)!=2 or len(set(ids))!=2 for ids in adjacency.values()):return None
        first=min(adjacency);visited={first};current=first;stack=[first]
        while stack:
            current=stack.pop()
            for adjacent in adjacency[current]:
                if adjacent not in visited:visited.add(adjacent);stack.append(adjacent)
        if len(visited)!=len(adjacency):return None
        links[str(vertex)]=sorted(visited)
    # Face-component count is combinatorial, never filled-solid union content.
    face_adjacency=defaultdict(set)
    for a,b in edge_faces.values():face_adjacency[a].add(b);face_adjacency[b].add(a)
    remaining=set(range(len(selected)));components=[]
    while remaining:
        first=min(remaining);remaining.remove(first);component=[first];stack=[first]
        while stack:
            for neighbor in sorted(face_adjacency[stack.pop()]):
                if neighbor in remaining:remaining.remove(neighbor);component.append(neighbor);stack.append(neighbor)
        components.append(sorted(component))
    return {'activeVertexIds':sorted(vertices),'unusedSourceVertexIds':sorted(set(range(vertex_count))-vertices),
            'edges':[list(edge) for edge in sorted(edge_faces)],'edgeFaceCounts':[2]*len(edge_faces),
            'vertexFaceLinks':links,'faceComponents':components}


def _result(rows, catalogue, criteria, vertex_count, equivalence, *, source=None, policy_budget=None, cancelled=None):
    lookup={row['id']:i for i,row in enumerate(catalogue['candidates'])}
    all_rows=catalogue['candidates'];actions=catalogue['symmetry']['candidateActionIndices']
    indices=[lookup[row['id']] for row in rows]
    images=[tuple(sorted(all_rows[action[i]]['id'] for i in indices)) for action in actions]
    canonical=min(images)
    if equivalence=='subgroup':
        rows=[all_rows[lookup[i]] for i in canonical];indices=[lookup[row['id']] for row in rows]
        images=[tuple(sorted(all_rows[action[i]]['id'] for i in indices)) for action in actions]
    ids=tuple(row['id'] for row in rows)
    stabilizers=[i for i,image in enumerate(images) if image==ids]
    if not stabilizers:raise GeometryError('Faceting source subgroup lacks a stabilizing identity action.')
    remaining=set(indices);types=[]
    while remaining:
        first=min(remaining);orbit=sorted({actions[g][first] for g in stabilizers});remaining.difference_update(orbit)
        members=sorted(all_rows[i]['id'] for i in orbit)
        types.append({'candidateIds':members,'size':len(members)})
    order=catalogue['symmetry']['group']['order'];orbit_size=len(set(images))
    if orbit_size*len(stabilizers)!=order:raise GeometryError('Faceting subgroup orbit/stabilizer identity failed.')
    result={'candidateIds':list(ids),'cycles':[row['cycle'] for row in rows],
        'incidence':_incidence(rows,vertex_count,criteria),
        'criteriaEvidence':_filter_evidence(rows,catalogue,criteria,len(types)),
        'symmetryEvidence':{'subgroupId':catalogue['symmetry']['group']['id'],
            'canonicalCandidateIds':list(canonical),'selectionOrbitSize':orbit_size,
            'stabilizerActionIndices':stabilizers,'stabilizerOrder':len(stabilizers),
            'faceTypes':types,'faceTypeCount':len(types),
            'isohedralWithinSelectedSubgroup':len(types)==1,
            'fullResultSymmetryClaim':False,'attributeEquivalence':False}}
    return apply_policy_evidence(source,result,criteria,budget=policy_budget,cancelled=cancelled)


def enumerate_facetings(source, candidate_ids=None, *, criteria=None, max_face_vertices=8,
                        max_candidates=4096, max_cycles_per_plane=4096,
                        node_limit=200_000, result_limit=128, symmetry_permutations=None,
                        equivalence='labeled', invariant_under_subgroup=False, source_symmetry=None, cancelled=None):
    """Deterministic labeled-cycle subset search with explicit closed-link tests.

    A complete status exhausts the RECORDED candidate and face-size domain only.
    It never establishes baseline-wide completeness, congruence classes or a solid.
    """
    nodes_cap=_integer(node_limit,'node cap',LIMITS['searchNodes']);result_cap=_integer(result_limit,'result cap',LIMITS['results'])
    if equivalence not in ('labeled','subgroup') or type(invariant_under_subgroup) is not bool:
        raise GeometryError('Choose labeled or subgroup equivalence and boolean invariant_under_subgroup.')
    checked=_criteria(criteria)
    catalogue=candidate_facets(source,max_face_vertices=max_face_vertices,max_candidates=max_candidates,
        max_cycles_per_plane=max_cycles_per_plane,symmetry_permutations=symmetry_permutations,source_symmetry=source_symmetry,cancelled=cancelled)
    lookup={row['id']:row for row in catalogue['candidates']}
    if candidate_ids is None:ids=list(lookup)
    elif (type(candidate_ids) is not list or len(candidate_ids)>LIMITS['candidates'] or
          any(type(i) is not str or i not in lookup for i in candidate_ids) or len(set(candidate_ids))!=len(candidate_ids)):
        raise GeometryError('Select distinct generated source candidate IDs; unknown or duplicate candidates are invalid.')
    else:ids=list(candidate_ids)
    ids.sort();rows=[lookup[i] for i in ids];results=[];nodes=0;status=catalogue['status'];reasons=list(catalogue['limitReasons'])
    chosen=[];counts=Counter();plane_vertices=defaultdict(set);selected_domain_hash=_hash(ids)
    labeled_accepted=0;incidence_found=0;criteria_rejected=0;result_keys=set();search_status='not-started'
    tidy_dual_rejections=Counter()
    if catalogue['generationStatus']!='user-cancelled' and catalogue['symmetry']['group'].get('automaticGroupComplete') is not False:
        _validate_plane_filters(catalogue,checked,equivalence)
        validate_tidy_dual_equivalence(source,checked,catalogue['symmetry']['group'],equivalence)
    all_lookup={row['id']:i for i,row in enumerate(catalogue['candidates'])};domain_indices={all_lookup[i] for i in ids}
    if catalogue['symmetry']['status']=='complete':
        for action in catalogue['symmetry']['candidateActionIndices']:
            if {action[i] for i in domain_indices}!=domain_indices:
                raise GeometryError('Explicit candidate domain is not closed under the selected source subgroup; expand to complete candidate orbits.')
    row_lookup={row['id']:i for i,row in enumerate(rows)}
    variables=([sorted(row_lookup[i] for i in orbit['candidateIds']) for orbit in catalogue['symmetry']['orbits']
                if set(orbit['candidateIds'])<=set(ids)] if invariant_under_subgroup else [[i] for i in range(len(rows))])
    result_plane_counts=Counter();policy_budget=PolicyBudget()

    def visit(index):
        nonlocal nodes,status,labeled_accepted,incidence_found,criteria_rejected,search_status
        if status=='user-cancelled':return False
        if _canceled(cancelled):status='user-cancelled';search_status='user-cancelled';reasons.append('subset search canceled');return False
        if nodes>=nodes_cap:status='resource-limited';search_status='resource-limited';reasons.append('subset node cap');return False
        nodes+=1
        if index==len(variables):
            selected=[rows[i] for i in sorted(chosen)];evidence=_incidence(selected,len(source['vertices']),checked)
            if evidence is None:return True
            incidence_found+=1
            try:
                result=_result(selected,catalogue,checked,len(source['vertices']),equivalence,
                    source=source,policy_budget=policy_budget,cancelled=cancelled)
            except PolicyStop as stop:
                status=stop.status;search_status=stop.status;reasons.append(stop.reason);return False
            if not result['criteriaEvidence']['accepted']:
                criteria_rejected+=1
                if checked.get('tidy_dual'):
                    row=result['criteriaEvidence'].get('policyEvidence',{}).get('tidy_dual')
                    if row and row['passed'] is False:
                        for reason in row['diagnostics'] or ['Finite reciprocal is not tidy.']:
                            tidy_dual_rejections[reason]+=1
                return True
            labeled_accepted+=1
            result['id']='faceting-'+_hash(result)
            if result['id'] in result_keys:return True
            result_keys.add(result['id'])
            results.append(result)
            if len(results)>=result_cap:
                status='resource-limited';search_status='resource-limited';reasons.append('result storage cap');return False
            return True
        # Exclude-first is stable; edge-count pruning never removes a valid branch.
        if not visit(index+1):return False
        additions=[rows[i] for i in variables[index]];edges=Counter(tuple(edge) for row in additions for edge in row['edges'])
        if any(counts[edge]+amount>2 for edge,amount in edges.items()):return True
        plane_additions=Counter(row['planeId'] for row in additions)
        for plane,amount in plane_additions.items():
            total=result_plane_counts[plane]+amount
            if checked['max_faces_per_plane'] and total>checked['max_faces_per_plane']:return True
            if plane in checked['plane_face_counts'] and total>checked['plane_face_counts'][plane]:return True
        new_planes=defaultdict(set)
        for row in additions:
            verts=set(row['cycle']);plane=row['planeId']
            if checked['coplanar_vertices']=='disjoint' and (plane_vertices[plane]|new_planes[plane])&verts:return True
            new_planes[plane].update(verts)
        old={plane:plane_vertices[plane].copy() for plane in new_planes}
        for plane,verts in new_planes.items():plane_vertices[plane].update(verts)
        counts.update(edges);result_plane_counts.update(plane_additions);chosen.extend(variables[index])
        try:return visit(index+1)
        finally:
            del chosen[-len(variables[index]):];counts.subtract(edges);result_plane_counts.subtract(plane_additions)
            for plane,verts in old.items():plane_vertices[plane]=verts

    if catalogue['symmetry']['status']!='complete':
        # A bounded/incomplete action table is not a subgroup orbit computation.
        pass
    elif len(variables)>LIMITS['searchVariables']:
        if status!='user-cancelled':status='resource-limited'
        search_status='resource-limited'
        reasons.append('subset variable-domain frontier (256); select a smaller domain or verified orbit-union search')
    elif status!='user-cancelled':search_status='complete';visit(0)
    if _hash(source)!=catalogue['sourceSnapshotHash']:
        raise GeometryError('Faceting source snapshot changed during subset search; no receipt was published.')
    report={**({key:deepcopy(catalogue[key]) for key in ('sourceSymmetryOptions','sourceSymmetryDiscovery')} if 'sourceSymmetryOptions' in catalogue else {}),
        'version':VERSION,'status':status,'sourceId':source['id'],'sourceFingerprint':identity(source),
        'sourceSnapshotHash':catalogue['sourceSnapshotHash'],'candidateGenerationStatus':catalogue['generationStatus'],
        'candidateCatalogueStatus':catalogue['status'],
        'phaseStatus':{**({'sourceSymmetryDiscovery':catalogue['sourceSymmetryDiscovery']['status']} if 'sourceSymmetryDiscovery' in catalogue else {}),
                       'candidateGeneration':catalogue['generationStatus'],
                       'symmetryAction':catalogue['symmetry']['status'],'subsetSearch':search_status},
        'domain':catalogue['domain'],'selectedCandidateIds':ids,'selectedDomainHash':selected_domain_hash,
        'explicitCandidateSelection':candidate_ids is not None,'criteria':checked,
        'symmetry':catalogue['symmetry'],'equivalence':equivalence,
        'invariantUnderSubgroup':invariant_under_subgroup,'searchVariables':len(variables),
        'limits':{'nodeLimit':nodes_cap,'resultLimit':result_cap},'nodesVisited':nodes,
        'candidateCount':len(ids),'results':results,'limitReasons':list(dict.fromkeys(reasons)),
        'labeledSelectionsAccepted':labeled_accepted,'distinctResultsFound':len(results),
        'incidenceSelectionsExamined':incidence_found,'criteriaRejectedAtLeaves':criteria_rejected,
        'criteriaRejectionCountIncludesPrunedBranches':False,
        'countMeaning':'exhausted recorded domain' if status=='complete' else 'found lower bound; search not exhausted'}
    if checked.get('tidy_dual'):
        report['tidyDualRejections']=dict(sorted(tidy_dual_rejections.items()))
        report['tidyDualScope']='Strict primal and finite polar dual tidy; source vertex links; native numerical qualification; recorded 4-12 vertex single-link domain'
    if any(checked.get(key,False) for key in ('tidy','spiky','tidy_dual')):
        report['exactPolicyWork']={'limit':policy_budget.maximum,'used':policy_budget.used}
    _bytes(report)
    return report


def realize_faceting(source, search, result_id):
    """Reconstruct one bounded closed-link selection, not an entire search proof.

    Rebuilds candidate/source/selected-incidence ownership before native validation.
    Search interruption/completion is not a mathematical certificate on the model.
    """
    _bytes(search);_source(source)
    if (type(search) is not dict or search.get('version')!=VERSION or search.get('sourceId')!=source['id'] or
        search.get('sourceFingerprint')!=identity(source) or search.get('sourceSnapshotHash')!=_hash(source)):
        raise GeometryError('Faceting search belongs to a different source snapshot or version.')
    if type(result_id) is not str or type(search.get('results')) is not list:
        raise GeometryError('Choose a recorded faceting result ID.')
    selected=next((row for row in search['results'] if type(row) is dict and row.get('id')==result_id),None)
    if selected is None:raise GeometryError('Unknown faceting result ID.')
    domain=search.get('domain',{});criteria=search.get('criteria',{})
    if type(domain) is not dict or type(criteria) is not dict:
        raise GeometryError('Faceting recorded domain and criteria must be objects.')
    checked=_criteria({key:criteria[key] for key in CRITERIA_KEYS if key in criteria})
    if _hash(criteria)!=_hash(checked):raise GeometryError('Recorded faceting incidence criteria were modified.')
    criteria=checked
    symmetry=search.get('symmetry');equivalence=search.get('equivalence');invariant=search.get('invariantUnderSubgroup')
    if (type(symmetry) is not dict or type(symmetry.get('group')) is not dict or
        equivalence not in ('labeled','subgroup') or type(invariant) is not bool):
        raise GeometryError('Recorded faceting source subgroup/equivalence fields are malformed.')
    catalogue=candidate_facets(source,max_face_vertices=domain.get('maximumFaceVertices'),
        max_candidates=domain.get('maximumCandidates'),max_cycles_per_plane=domain.get('maximumCyclesPerPlane'),
        symmetry_permutations=None if 'sourceSymmetryOptions' in search else symmetry['group'].get('permutations'),
        source_symmetry=search.get('sourceSymmetryOptions'))
    if catalogue['symmetry']['status']!='complete' or _hash(symmetry)!=_hash(catalogue['symmetry']):
        raise GeometryError('Recorded faceting source subgroup/candidate actions or orbits were modified or incomplete.')
    _validate_plane_filters(catalogue,criteria,equivalence)
    validate_tidy_dual_equivalence(source,criteria,catalogue['symmetry']['group'],equivalence)
    lookup={row['id']:row for row in catalogue['candidates']};ids=selected.get('candidateIds')
    if (type(ids) is not list or not ids or len(ids)>LIMITS['candidates'] or
        any(type(i) is not str or i not in lookup for i in ids) or len(set(ids))!=len(ids)):
        raise GeometryError('Recorded faceting candidate IDs are malformed or no longer reconstructible.')
    domain_ids=search.get('selectedCandidateIds')
    if (type(domain_ids) is not list or any(type(i) is not str or i not in lookup for i in domain_ids) or
        len(set(domain_ids))!=len(domain_ids) or search.get('selectedDomainHash')!=_hash(domain_ids) or
        not set(ids)<=set(domain_ids) or _hash(domain)!=_hash(catalogue['domain'])):
        raise GeometryError('Recorded faceting candidate domain was modified.')
    all_lookup={row['id']:i for i,row in enumerate(catalogue['candidates'])};domain_indices={all_lookup[i] for i in domain_ids}
    if any({action[i] for i in domain_indices}!=domain_indices for action in catalogue['symmetry']['candidateActionIndices']):
        raise GeometryError('Recorded faceting candidate domain is not closed under the selected source subgroup.')
    rows=[lookup[i] for i in ids];incidence=_incidence(rows,len(source['vertices']),criteria)
    try:
        rebuilt=_result(rows,catalogue,criteria,len(source['vertices']),equivalence,source=source)
    except PolicyStop as stop:
        raise GeometryError('Selected faceting exact policy could not be reverified: '+stop.reason) from stop
    if invariant and rebuilt['symmetryEvidence']['stabilizerOrder']!=symmetry['group']['order']:
        raise GeometryError('Recorded faceting does not maintain its selected source subgroup.')
    rebuilt['id']='faceting-'+_hash(rebuilt)
    if incidence is None or not rebuilt['criteriaEvidence']['accepted'] or _hash(selected)!=_hash(rebuilt):
        raise GeometryError('Recorded faceting incidence/ordered cycles were modified or fail closed-link criteria.')
    source_colors=_colors(source,'faces');colors=[];color_warnings=[]
    for i,row in enumerate(rows):
        owners=row['sourceFaceIds'];values=[source_colors[index] for index in owners]
        if values and any(value!=values[0] for value in values):
            raise GeometryError('Matching source-cycle color ownership is ambiguous; no arbitrary color was chosen.')
        colors.append(deepcopy(values[0]) if values else None)
        if not values:color_warnings.append(i)
    source_edges={tuple(sorted(edge)):i for i,edge in enumerate(source['edges'])}
    metadata={'family':'Faceting','sourceVertexIds':list(range(len(source['vertices']))),
        'activeSourceVertexIds':incidence['activeVertexIds'],'unusedSourceVertexIds':incidence['unusedSourceVertexIds'],
        'sourceEdgeIds':[source_edges.get(tuple(edge)) for edge in incidence['edges']],
        'sourceFaceIds':[row['sourceFaceIds'] for row in rows],
        'offColors':{'faces':colors,'cells':[]},'newFaceIdsWithoutSourceColor':color_warnings,
        'facetingSymmetry':deepcopy(rebuilt['symmetryEvidence']),
        'facetingCriteria':deepcopy(rebuilt['criteriaEvidence']),
        'solidInterpretation':'Closed ordered source surface; no filled-volume, convexity or density assertion'}
    if 'coordinateUnits' in source.get('metadata',{}):metadata['coordinateUnits']=deepcopy(source['metadata']['coordinateUnits'])
    model={'id':'automatic-'+_hash({'source':_hash(source),'selection':rebuilt,'criteria':criteria,
                                   'equivalence':equivalence,'invariantUnderSubgroup':invariant}),
        'name':'Faceting of '+source.get('name','source'),'dimension':3,'embeddingDimension':3,
        'interpretation':'generalized-complex','vertices':deepcopy(source['vertices']),
        'edges':deepcopy(incidence['edges']),'faces':deepcopy(rebuilt['cycles']),'cells':[],
        'metadata':metadata,'numeric':{'mode':'float64-approximate','tolerance':TOLERANCE,'certified':False},
        'provenance':{'operation':'automatic-faceting-development','algorithmVersion':VERSION,
            'sourceSnapshot':deepcopy(source),'sourceSnapshotHash':_hash(source),
            'selection':deepcopy(rebuilt),'criteria':criteria,'domain':deepcopy(domain),
            'symmetry':deepcopy(symmetry),'equivalence':equivalence,'invariantUnderSubgroup':invariant,
            'searchObservation':{'status':search.get('status'),'notACompletenessCertificate':True},
            'convexified':False}}
    model['validation']=validate(model)
    if not model['validation']['passed']:
        raise GeometryError('Faceting native source validation failed: '+'; '.join(model['validation']['errors']))
    model['fingerprint']=identity(model);_bytes(model)
    return model
