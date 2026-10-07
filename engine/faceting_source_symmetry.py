"""Exhaustive exact metric/incidence automorphisms for bounded FAC sources.

Distance row invariants prune candidates, but complete bijections are verified
against the original ordered incidence. Exhaustion, not invariants, establishes
maximality. No hull, approximate coordinate snapping or axis assumptions.
"""
from collections import Counter, defaultdict
from copy import deepcopy
from fractions import Fraction
from itertools import combinations

from engine.geometry import GeometryError, canonical_cycle, identity
from engine.history import _source_hash

VERSION='0.1.0'
WORK_LIMIT=500_000


def symmetry_options(value):
    if type(value) is not dict or set(value)-{'mode','work_limit'}:
        raise GeometryError('Automatic source symmetry uses mode all/proper and optional work_limit only.')
    mode=value.get('mode','all');limit=value.get('work_limit',WORK_LIMIT)
    if mode not in ('all','proper') or type(limit) is not int or not 1<=limit<=WORK_LIMIT:
        raise GeometryError('Automatic source symmetry mode must be all/proper; work cap is 1 through 500000.')
    return {'mode':mode,'work_limit':limit}


class _Stop(Exception):
    def __init__(self,status,reason):self.status,self.reason=status,reason


def _inverse(rows, fraction):
    table=[list(row)+[Fraction(int(i==j)) for j in range(3)] for i,row in enumerate(rows)]
    for column in range(3):
        pivot=next(i for i in range(column,3) if table[i][column])
        table[column],table[pivot]=table[pivot],table[column]
        divisor=table[column][column]
        table[column]=[fraction(x/divisor) for x in table[column]]
        for i in range(3):
            if i!=column:
                multiplier=table[i][column]
                table[i]=[fraction(x-multiplier*y) for x,y in zip(table[i],table[column])]
    return [row[3:] for row in table]


def discover_source_symmetry(source, options=None, *, cancelled=None):
    from engine.automatic_faceting import _source, _fraction, _determinant, _bytes, _symmetry
    config=symmetry_options({} if options is None else options)
    points=_source(source);n=len(points);snapshot=_source_hash(source)
    if cancelled is not None and not callable(cancelled):raise GeometryError('Source symmetry cancellation must be callable.')
    used=0;nodes=0;leaves=0;reasons=[];status='complete';actions=[]
    def step(amount=1):
        nonlocal used
        if cancelled is not None and cancelled():raise _Stop('user-cancelled','automatic source symmetry canceled; full group unresolved')
        if used+amount>config['work_limit']:raise _Stop('resource-limited','automatic source symmetry work cap; full group unresolved')
        used+=amount
    edges=Counter(tuple(sorted(edge)) for edge in source['edges'])
    faces=Counter(canonical_cycle(face) for face in source['faces'])
    cells=Counter(tuple(sorted(cell)) for cell in source.get('cells',[]))
    blocks=defaultdict(list)
    for i,face in enumerate(source['faces']):blocks[canonical_cycle(face)].append(i)
    ranks={face:rank for block in blocks.values() for rank,face in enumerate(block)}
    anchor=next(ids for ids in combinations(range(n),4) if _determinant(*[
        [_fraction(x-y) for x,y in zip(points[v],points[ids[0]])] for v in ids[1:]]))
    # Column-vector convention: M (p-c) = p' - c; affine translation is
    # separately retained. Exact orthogonality and all source images are checked.
    frame=[[_fraction(points[anchor[j+1]][k]-points[anchor[0]][k]) for j in range(3)] for k in range(3)]
    inverse=_inverse(frame,_fraction)
    center=[_fraction(sum(p[k] for p in points)/n) for k in range(3)]
    distance=[[Fraction(0) for _ in points] for _ in points]
    mapping=[None]*n;available=set(range(n));domains=[]
    def full_action():
        nonlocal leaves
        leaves+=1
        step(len(source['edges'])+sum(map(len,source['faces']))+sum(map(len,source.get('cells',[]))))
        if Counter(tuple(sorted(mapping[v] for v in edge)) for edge in source['edges'])!=edges:return
        mapped_faces=[canonical_cycle([mapping[v] for v in f]) for f in source['faces']]
        if Counter(mapped_faces)!=faces:return
        face_map=[blocks[face][ranks[i]] for i,face in enumerate(mapped_faces)]
        if Counter(tuple(sorted(face_map[f] for f in cell)) for cell in source.get('cells',[]))!=cells:return
        step(100+n*9)
        target=[[_fraction(points[mapping[anchor[j+1]]][k]-points[mapping[anchor[0]]][k]) for j in range(3)] for k in range(3)]
        matrix=[[_fraction(sum(target[i][k]*inverse[k][j] for k in range(3))) for j in range(3)] for i in range(3)]
        translation=[_fraction(points[mapping[anchor[0]]][i]-sum(matrix[i][k]*points[anchor[0]][k] for k in range(3))) for i in range(3)]
        if any(_fraction(sum(matrix[k][i]*matrix[k][j] for k in range(3)))!=int(i==j) for i in range(3) for j in range(3)):
            raise GeometryError('Exact metric action failed orthogonal affine-frame reconstruction.')
        if any(_fraction(sum(matrix[i][k]*p[k] for k in range(3))+translation[i])!=points[mapping[v]][i] for v,p in enumerate(points) for i in range(3)):
            raise GeometryError('Exact affine action failed a full source vertex image.')
        if any(_fraction(sum(matrix[i][k]*center[k] for k in range(3))+translation[i])!=center[i] for i in range(3)):
            raise GeometryError('Exact affine source symmetry does not fix the full source centroid.')
        determinant=_determinant(*matrix)
        if determinant not in (-1,1):raise GeometryError('Exact source symmetry orientation is unresolved.')
        actions.append({'permutation':list(mapping),'matrix':[[str(x) for x in row] for row in matrix],
            'translation':[str(x) for x in translation],'determinant':int(determinant),'sourceFaceActionIndices':face_map})
        if len(actions)>128:raise _Stop('resource-limited','automatic source symmetry action cap128; full group unresolved')
    def visit(depth):
        nonlocal nodes
        step();nodes+=1
        if depth==n:full_action();return
        assigned=[v for v,image in enumerate(mapping) if image is not None]
        choices=[]
        for vertex in range(n):
            if mapping[vertex] is not None:continue
            targets=[]
            for target in domains[vertex]:
                if target not in available:continue
                valid=True
                for other in assigned:
                    step()
                    if distance[vertex][other]!=distance[target][mapping[other]] or edges[tuple(sorted((vertex,other)))]!=edges[tuple(sorted((target,mapping[other])))]:
                        valid=False;break
                if valid:targets.append(target)
            choices.append((len(targets),vertex,targets))
        _,vertex,targets=min(choices)
        for target in targets:
            mapping[vertex]=target;available.remove(target)
            try:visit(depth+1)
            finally:available.add(target);mapping[vertex]=None
    selected=None
    try:
        for a,b in combinations(range(n),2):
            step();distance[a][b]=distance[b][a]=_fraction(sum((x-y)**2 for x,y in zip(points[a],points[b])))
        signatures=[tuple(sorted(row)) for row in distance]
        domains=[[j for j in range(n) if signatures[i]==signatures[j]] for i in range(n)]
        visit(0)
        actions.sort(key=lambda row:row['permutation'])
        selected_actions=[row for row in actions if config['mode']=='all' or row['determinant']==1]
        references=len(selected_actions)*(n*(n-1)//2+2*len(source['edges'])+sum(map(len,source['faces']))+sum(map(len,source.get('cells',[]))))
        if references>100_000:
            raise _Stop('resource-limited','selected source group verification reference cap100000; completeness unresolved')
        step(len(selected_actions)**2*n + references)
        selected=_symmetry(source,points,[row['permutation'] for row in selected_actions])
    except _Stop as stop:
        status=stop.status;reasons.append(stop.reason)
        actions.sort(key=lambda row:row['permutation'])
    if _source_hash(source)!=snapshot:raise GeometryError('Automatic source symmetry source snapshot changed; no receipt was published.')
    receipt={'version':VERSION,'status':status,'complete':status=='complete','options':config,
        'sourceId':source['id'],'sourceFingerprint':identity(source),'sourceSnapshotHash':snapshot,
        'method':'exhaustive exact distance-compatible source vertex bijections with full ordered incidence',
        'numericPredicate':'exact supplied integer/binary64-ratio squared distances and rational affine matrices',
        'attributeInvarianceRequired':False,'sourceGeometryChanged':False,'implicitWeld':False,
        'anchorVertexIds':list(anchor),'center':[str(x) for x in center],
        'matrixConvention':'column vector p -> matrix*p + translation; every action fixes full-source center',
        'workUsed':used,'workLimit':config['work_limit'],'nodesVisited':nodes,'completeBijectionsChecked':leaves,
        'actions':actions,'verifiedActionsFound':len(actions),'selectedGroup':selected,
        'maximalSourceSymmetryClaim':status=='complete','limitReasons':reasons,
        'countMeaning':'exhausted full metric/incidence automorphism domain' if status=='complete' else 'verified actions only; not a group or maximality claim'}
    receipt['id']='source-symmetry-discovery-'+_source_hash(receipt)
    _bytes(receipt)
    return receipt


def faceting_source_group(source, points, permutations, options, *, cancelled=None):
    from engine.automatic_faceting import _symmetry
    if options is None:return _symmetry(source,points,permutations),None
    if permutations is not None:raise GeometryError('Choose automatic source symmetry or declared permutations, not both.')
    discovery=discover_source_symmetry(source,options,cancelled=cancelled)
    group=deepcopy(discovery['selectedGroup']) if discovery['complete'] else _symmetry(source,points,None)
    group['automaticDiscoveryId']=discovery['id']
    group['automaticSelection']=discovery['options']['mode']
    group['automaticGroupComplete']=discovery['complete']
    group['automaticGroupStatus']=discovery['status']
    group['maximalSourceSymmetryClaim']=discovery['complete'] and discovery['options']['mode']=='all'
    group['id']='source-subgroup-'+_source_hash({k:v for k,v in group.items() if k!='id'})
    return group,discovery
