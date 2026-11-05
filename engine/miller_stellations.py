"""Miller's finite-solid interpretation, exhausted over the 12 Du Val cell sets."""
import numpy as np
from .geometry import GeometryError,TOLERANCE
from .operations import require_convex
from .stellation_diagrams import diagram_data

VERSION='0.1.0'
CELL_TYPES=('a','b','c','d','e1','e2','f1',"f1'",'f2','g1','g2','h')
CELL_SIGNATURES=((0,1),(1,20),(2,30),(3,60),(4,20),(4,60),(5,60),(5,60),(5,12),(6,30),(6,60),(7,60))
LAYER_EDGES=((0,1),(1,2),(2,3),(3,4),(3,5),(4,6),(4,7),(5,6),(5,7),(5,8),(6,9),(7,9),(6,10),(7,10),(8,10),(9,11),(10,11))
MIRROR=(0,1,2,3,4,5,7,6,8,9,10,11)
# Third-edition Crennell indices; used only for ordering, never acceptance.
BOOK_CODES=(1,3,7,15,63,511,2047,4095,16,192,512,208,720,704,32,256,1024,288,1312,1280,31,255,1023,223,735,767,47,319,1535,303,1327,1343,
            64,80,95,576,592,607,1088,1104,1119,1344,1360,1375,96,111,127,608,623,639,352,367,383,864,879,895,1376,1391,1407)
RULES={
    'i':'Only the twenty bounding face planes of a regular icosahedron.',
    'ii':'The same face parts in every plane; disconnected face parts are permitted.',
    'iii':'Trigonal face symmetry, with or without reflections: complete proper icosahedral cell orbits.',
    'iv':'Every unselected cell is accessible from the exterior through unselected full-facet neighbors; no buried cavities.',
    'v':'No separated symmetric shells (edge/vertex contact does not join shells); allow a pair of disjoint mirror-related shells.'}


def _reach(seeds,domain,adjacency):
    reached=set();pending=list(set(seeds)&domain)
    while pending:
        i=pending.pop()
        if i not in reached:reached.add(i);pending.extend(adjacency[i]&domain-reached)
    return reached


def miller_criterion(code,adjacency=None,exterior=None):
    if type(code) is not int or not 1<=code<4096:raise GeometryError('Miller cell code must be an integer in 1..4095.')
    if adjacency is None:
        adjacency=[set() for _ in CELL_TYPES]
        for a,b in LAYER_EDGES:adjacency[a].add(b);adjacency[b].add(a)
    exterior={11} if exterior is None else exterior
    selected={i for i in range(12) if code>>i&1};empty=set(range(12))-selected
    accessible=_reach(exterior,empty,adjacency)==empty
    unseen=selected.copy();components=[]
    while unseen:
        part=_reach({min(unseen)},selected,adjacency);components.append(part);unseen-=part
    exception=len(components)==2 and {MIRROR[i] for i in components[0]}==components[1]
    return {'accepted':accessible and (len(components)==1 or exception),'accessible':accessible,
            'symmetricShellComponents':len(components),'enantiomorphicPairException':exception,
            'reflexible':{MIRROR[i] for i in selected}==selected}


def cell_label(code):
    prefix='';remaining=code
    for label,mask in reversed(tuple(zip('ABCDEFGH',(1,3,7,15,63,511,2047,4095)))):
        if code&mask==mask:prefix=label;remaining=code^mask;break
    parts=[]
    for i,label in enumerate(CELL_TYPES):
        if i==6 and remaining&192==192:parts.append('f1*');remaining^=192
        elif remaining>>i&1:parts.append(label)
    return prefix+''.join(parts)


def _regular_icosahedron(source,arrangement):
    require_convex(source)
    if source['dimension']!=3 or len(source['vertices'])!=12 or len(source['edges'])!=30 or len(source['faces'])!=20 or any(len(f)!=3 for f in source['faces']):
        raise GeometryError("Miller's 59 requires a regular convex 3D icosahedron and all twenty face planes.")
    p=np.asarray(source['vertices']);lengths=np.array([np.linalg.norm(p[a]-p[b]) for a,b in source['edges']])
    if np.ptp(lengths)>TOLERANCE*float(np.max(lengths))*8:
        raise GeometryError("Miller's 59 requires equal regular icosahedron edges (numerical tolerance).")
    if len(arrangement.get('planes',[]))!=20 or sorted(arrangement.get('source',{}).get('faceIds',[]))!=list(range(20)):
        raise GeometryError("Miller's rules require all twenty source facial planes, each once.")


def enumerate_miller(arrangement,source):
    _regular_icosahedron(source,arrangement)
    graph=diagram_data(arrangement,source);symmetry=graph['symmetry']
    if not symmetry['preservesFullGroup'] or symmetry['sourceOrder']!=120 or symmetry['clippedBoundedRegionIds'] or not graph['completeWithinObservedFacetDomain']:
        raise GeometryError('Miller enumeration needs all 473 bounded cells, the full icosahedral group and resolved facets; enlarge observation scale (10 for the standard seed).')
    orbits=symmetry['orbits']['proper']
    if len(orbits)!=12 or len(symmetry['regionIds'])!=473:raise GeometryError('Miller cell domain does not have the twelve expected proper orbits / 473 bounded cells.')
    ordered=[]
    for power,count in CELL_SIGNATURES:
        matches=[row for row in orbits if len(row)==count and all(graph['nodes'][i]['outsidePlaneCount']==power for i in row)]
        matches.sort(key=lambda row:sorted(tuple(arrangement['regions'][i]['signs']) for i in row))
        if len(matches)!=(2 if (power,count)==(5,60) else 1):raise GeometryError('Miller cell-layer multiplicities could not be verified.')
        ordered.append(matches[1 if len(ordered)==7 else 0])
    owner={i:j for j,row in enumerate(ordered) for i in row};adjacency=[set() for _ in ordered];exterior=set()
    for i,j in owner.items():
        for k in graph['adjacency'][str(i)]:
            if k in owner:
                if owner[k]!=j:adjacency[j].add(owner[k])
            else:exterior.add(j)
    edges={(i,j) for i,row in enumerate(adjacency) for j in row if i<j}
    if edges!=set(LAYER_EDGES) or exterior!={11}:raise GeometryError('Observed full-facet layer graph disagrees with the Miller icosahedron domain.')
    indices={i:j for j,i in enumerate(symmetry['regionIds'])}
    reversing=next((a for a in symmetry['actions'] if a['orientation']==-1),None)
    if reversing is None or any({owner[reversing['regionIds'][indices[i]]] for i in row}!={MIRROR[j]} for j,row in enumerate(ordered)):
        raise GeometryError('Miller cell reflection action could not be verified.')
    results=[]
    for code in range(1,4096):
        mirror=sum(1<<MIRROR[i] for i in range(12) if code>>i&1)
        if code>mirror:continue
        evidence=miller_criterion(code,adjacency,exterior)
        if not evidence['accepted']:continue
        regions=sorted(i for j,row in enumerate(ordered) if code>>j&1 for i in row)
        results.append({'cellCode':code,'coxeterLabel':cell_label(code),'cellTypes':[label for i,label in enumerate(CELL_TYPES) if code>>i&1],
                        'regionIds':regions,'regionCount':len(regions),'volume':sum(arrangement['regions'][i]['volume'] for i in regions),
                        'reflexibleWithinSourceGroup':evidence['reflexible'],'ruleEvidence':evidence})
    if {r['cellCode'] for r in results}!=set(BOOK_CODES):raise GeometryError('Miller enumeration differs from the independently tabulated 59 cell sets; no complete result was published.')
    order={code:i+1 for i,code in enumerate(BOOK_CODES)};results.sort(key=lambda r:order[r['cellCode']])
    for row in results:row['bookIndex']=order[row['cellCode']]
    return {'candidates':results,'orbits':ordered,'cellTypes':list(CELL_TYPES),'layerEdges':[[CELL_TYPES[a],CELL_TYPES[b]] for a,b in LAYER_EDGES],
            'criteria':{'ruleSet':'miller-59','millerRules':True,'orientation':'proper','identifyMirrors':True,'rules':RULES,'interpretation':'Book finite-solid / full-facet symmetric-shell convention'},
            'group':{'actingOrder':60,'fullSourceGroupVerified':False,'preservesAllSourceActions':True},
            'counts':{'reflexible':sum(r['reflexibleWithinSourceGroup'] for r in results),'chiral':sum(not r['reflexibleWithinSourceGroup'] for r in results)},
            'subsetsEvaluated':4095,'totalOrbitSubsets':4095,'termination':'exhausted','completeWithinDeclaredCriteria':True,
            'unrestrictedStellationEnumerationComplete':False,'sourceFingerprint':graph['sourceFingerprint'],'arrangementSha256':graph['arrangementSha256'],
            'numericMode':'float64-approximate','certified':False,'maxVertexResidual':symmetry['maxVertexResidual'],'tolerance':symmetry['tolerance'],
            'labelConvention':"f1* means both mirror sets (bold f1 in the book); f1 / f1' are deterministically chosen by signed-cell order, without an absolute right-hand designation.",
            'algorithmVersion':VERSION}
