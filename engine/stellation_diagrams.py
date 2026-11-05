"""Source-bound finite facial diagrams and numerical cell symmetry actions."""
import numpy as np
from scipy.spatial import cKDTree
from .geometry import GeometryError,TOLERANCE,canonical_cycle
from .stellation import arrangement,arrangement_diagram,region_union
from .stellation_cells import cell_graph
from .symmetry import geometric_symmetry

VERSION='0.1.0'


def diagram_data(arrangement,source):
    graph=cell_graph(arrangement,source)
    regions=[r for r in arrangement['regions'] if graph['nodes'][r['id']]['selectable']]
    if not regions:raise GeometryError('No enclosed cells; enlarge the observation box.')
    group=geometric_symmetry(source)
    if not group['complete']:raise GeometryError('Source symmetry search limited; no diagram symmetry claim is available.')
    ids=[r['id'] for r in regions];centers=np.asarray([graph['nodes'][i]['centroid'] for i in ids]);tree=cKDTree(centers)
    center=np.asarray(group['center']);scale=float(np.max(np.ptp(np.asarray(arrangement['bounds']),axis=0)));tol=TOLERANCE*scale*8
    actions=[];max_error=0.0
    for action in group['actions']:
        matrix=np.asarray(action['matrix']);distances,mapping=tree.query((centers-center)@matrix.T+center)
        if np.max(distances)>tol or len(set(mapping))!=len(regions):continue
        residual=float(np.max(distances));valid=True
        for i,j in enumerate(mapping):
            p=np.asarray(regions[i]['model']['vertices']);q=np.asarray(regions[j]['model']['vertices'])
            if len(p)!=len(q):valid=False;break
            error,vertex_map=cKDTree(q).query((p-center)@matrix.T+center)
            if np.max(error)>tol or len(set(vertex_map))!=len(p):valid=False;break
            target={canonical_cycle(f) for f in regions[j]['model']['faces']}
            if any(canonical_cycle(vertex_map[f].tolist()) not in target for f in regions[i]['model']['faces']):valid=False;break
            residual=max(residual,float(np.max(error)))
        if valid:
            actions.append({'regionIds':[ids[j] for j in mapping],'orientation':1 if np.linalg.det(matrix)>0 else -1})
            max_error=max(max_error,residual)
    permutations={tuple(a['regionIds']) for a in actions};index={i:j for j,i in enumerate(ids)}
    if not actions or any(tuple(a['regionIds'][index[i]] for i in b['regionIds']) not in permutations for a in actions for b in actions):
        raise GeometryError('Numerical cell actions do not close; enlarge the observation domain.')
    orbits={}
    for mode in ('full','proper','individual'):
        acting=[a for a in actions if mode=='full' or a['orientation']==1] if mode!='individual' else [{'regionIds':ids}]
        unseen=set(ids);rows=[]
        while unseen:
            first=min(unseen);orbit=sorted({a['regionIds'][index[first]] for a in acting});unseen.difference_update(orbit);rows.append(orbit)
        orbits[mode]=rows
    graph.update(diagrams=[arrangement_diagram(arrangement,i) for i in range(len(arrangement['planes']))],
                 symmetry={'regionIds':ids,'actions':actions,'orbits':orbits,'sourceOrder':group['order'],
                           'actingOrder':len(actions),'preservesFullGroup':len(actions)==group['order'],
                           'clippedBoundedRegionIds':[r['id'] for r in arrangement['regions'] if r['boundedness']=='bounded-numerical' and not graph['nodes'][r['id']]['selectable']],
                           'maxVertexResidual':max_error,'tolerance':tol,'certified':False})
    return graph


def enumerate_supported(arrangement,source,orientation='proper',identify_mirrors=True,max_results=4096):
    if orientation not in ('full','proper') or type(identify_mirrors) is not bool or type(max_results) is not int or not 1<=max_results<=100000:
        raise GeometryError('Supported search needs full/proper symmetry, a literal mirror-equivalence flag and 1..100000 results.')
    graph=diagram_data(arrangement,source);symmetry=graph['symmetry']
    if not symmetry['preservesFullGroup'] or symmetry['clippedBoundedRegionIds'] or not graph['completeWithinObservedFacetDomain']:
        raise GeometryError('Supported search requires every observed bounded cell enclosed, full source actions and resolved facets; enlarge observation scale.')
    orbits=symmetry['orbits'][orientation]
    if len(orbits)>20:raise GeometryError('Supported search exceeds 20 cell orbits; no enumeration was committed.')
    ids=symmetry['regionIds'];index={i:j for j,i in enumerate(ids)};seen=set();results=[];evaluated=0;termination='exhausted'
    reversing=next((a['regionIds'] for a in symmetry['actions'] if a['orientation']==-1),None)
    for mask in range(1<<len(orbits)):
        evaluated+=1;selected={i for j,row in enumerate(orbits) if mask&(1<<j) for i in row}
        if not selected or any(not set(graph['nodes'][i]['supports'])<=selected for i in selected):continue
        own=tuple(sorted(selected));mirror=tuple(sorted(reversing[index[i]] for i in selected)) if reversing else own
        key=min(own,mirror) if identify_mirrors else own
        if key in seen:continue
        seen.add(key)
        reflexible=bool(reversing and mirror==own)
        results.append({'regionIds':sorted(selected),'regionCount':len(selected),'volume':sum(arrangement['regions'][i]['volume'] for i in selected),'reflexibleWithinSourceGroup':reflexible})
        if len(results)>=max_results and evaluated<(1<<len(orbits)):termination='result-limit';break
    return {'candidates':results,'orbits':orbits,'criteria':{'ruleSet':'all-lower-facet-supports','orientation':orientation,'identifyMirrors':identify_mirrors,'millerRules':False},
            'group':{'actingOrder':sum(orientation=='full' or a['orientation']==1 for a in symmetry['actions']),'fullSourceGroupVerified':orientation=='full','preservesAllSourceActions':True},
            'subsetsEvaluated':evaluated,'totalOrbitSubsets':1<<len(orbits),'termination':termination,'completeWithinDeclaredCriteria':termination=='exhausted',
            'unrestrictedStellationEnumerationComplete':False,'domain':{'regionIds':ids,'description':'Observed bounded cell domain; all lower full-facet neighbors are required. Numerical predicates.'},'algorithmVersion':VERSION}


def make_base(source,region_signs,box_scale=3,plane_ids=None,bounds=None):
    if type(region_signs) is not list or not 1<=len(region_signs)<=2048 or any(type(row) is not list or any(type(s) is not int or s not in (-1,1) for s in row) for row in region_signs):
        raise GeometryError('Make base requires 1..2048 literal signed cell signatures.')
    signatures=[tuple(row) for row in region_signs]
    if len(set(signatures))!=len(signatures):raise GeometryError('Selected cell signatures must be distinct.')
    a=arrangement(source,box_scale=box_scale,plane_ids=plane_ids,bounds=bounds)
    lookup={tuple(r['signs']):r['id'] for r in a['regions']}
    if any(s not in lookup for s in signatures):raise GeometryError('Selected cells no longer exist in this arrangement.')
    return region_union(a,[lookup[s] for s in signatures],source=source)
