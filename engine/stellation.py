"""Bounded observation of a 3D plane arrangement and explicit region unions.

Every supplied plane splits every current full-dimensional region. Results
enumerate the arrangement *inside the stated observation box*, rather than
claiming unrestricted stellation enumeration. Region boundedness is tested
against the original signed half-spaces, without observation-box constraints.
All predicates and LP classifications are approximate and reported as such.
"""
from itertools import product
from collections import defaultdict
import math
import uuid
import numpy as np
from scipy.optimize import linprog
from scipy.spatial import cKDTree
from .geometry import GeometryError, hull, rank, TOLERANCE, validate, identity, polygon_area
from .operations import require_convex

VERSION='0.2.0'


def normalize_planes(planes):
    try:a=np.asarray(planes,dtype=float)
    except (ValueError,TypeError) as exc:raise GeometryError('Planes must be rows [nx,ny,nz,offset].') from exc
    if a.ndim!=2 or a.shape[1]!=4 or not 1<=len(a)<=32 or not np.isfinite(a).all():
        raise GeometryError('Supply 1–32 finite 3D planes [nx,ny,nz,offset], meaning n·x+offset=0.')
    norms=np.linalg.norm(a[:,:3],axis=1)
    if any(norms<=np.finfo(float).tiny):raise GeometryError('Plane normals must be nonzero.')
    return a/norms[:,None]


def clip_halfspace(model,plane):
    p=np.asarray(model['vertices']);values=p@plane[:3]+plane[3]
    scale=float(np.max(np.ptp(p,axis=0)));tol=TOLERANCE*scale
    if max(values)<=tol:return model
    if min(values)>=-tol:return None
    points=[v for v,value in zip(p,values) if value<=tol]
    for a,b in model['edges']:
        da,db=values[a],values[b]
        if (da<-tol and db>tol) or (db<-tol and da>tol):
            points.append(p[a]+(da/(da-db))*(p[b]-p[a]))
    if len(points)<4 or rank(np.asarray(points)/scale)!=3:return None
    return hull(points,'Arrangement region')


def boundedness(planes,signs,origin=None,scale=1):
    """Coordinate objectives detect nonzero recession directions; no box used."""
    inequalities=np.asarray(planes).copy()
    origin=np.zeros(3) if origin is None else np.asarray(origin)
    inequalities[:,3]=(inequalities[:,:3]@origin+inequalities[:,3])/scale
    inequalities*=np.asarray(signs)[:,None]
    unresolved=[]
    for axis in range(3):
        for direction in (-1,1):
            objective=np.zeros(3);objective[axis]=direction
            result=linprog(objective,A_ub=inequalities[:,:3],b_ub=-inequalities[:,3],
                           bounds=[(None,None)]*3,method='highs')
            if result.status==3:return 'unbounded-numerical'
            if result.status!=0:unresolved.append(result.message)
    return 'unresolved' if unresolved else 'bounded-numerical'


def arrangement(model=None,planes=None,plane_ids=None,box_scale=3,bounds=None,max_regions=2048,diagram_plane=0):
    if not math.isfinite(box_scale) or not 1.01<=box_scale<=100:
        raise GeometryError('Observation box scale must be in 1.01–100.')
    if type(max_regions) is not int or not 1<=max_regions<=8192:
        raise GeometryError('Region limit must be an integer in 1–8,192.')
    source={}
    if planes is None:
        if not model:raise GeometryError('Choose a convex 3D seed or supply explicit planes.')
        require_convex(model)
        if model['dimension']!=3:raise GeometryError('Facial-plane stellation currently supports 3D seeds.')
        reference=model if model.get('facetEquations') else hull(model['vertices'])
        lookup={frozenset(vertices):equation for vertices,equation in zip(reference['facetVertices'],reference['facetEquations'])}
        all_planes=[lookup[frozenset(face)] for face in model['faces']]
        plane_ids=list(range(len(all_planes))) if plane_ids is None else plane_ids
        if len(set(plane_ids))!=len(plane_ids) or any(type(i) is not int or not 0<=i<len(all_planes) for i in plane_ids):
            raise GeometryError('Facial-plane indices must be distinct existing face IDs.')
        planes=[all_planes[i] for i in plane_ids]
        source={'id':model['id'],'fingerprint':identity(model),'name':model['name'],'faceIds':plane_ids}
    planes=normalize_planes(planes)
    if bounds is None:
        if model:
            p=np.asarray(model['vertices']);center=(p.max(axis=0)+p.min(axis=0))/2
            half=max(float(np.max(np.ptp(p,axis=0)))/2,1e-12)*box_scale
        else:center=np.zeros(3);half=box_scale
        low,high=center-half,center+half
    else:
        a=np.asarray(bounds,dtype=float)
        if a.shape!=(2,3) or not np.isfinite(a).all() or any(a[1]<=a[0]):raise GeometryError('Bounds must be finite [minimumXYZ,maximumXYZ] with positive extents.')
        low,high=a
    box=hull(list(product(*zip(low,high))),'Observation box')
    regions=[{'model':box,'signs':[]}]
    stages=[]
    for index,plane in enumerate(planes):
        next_regions=[]
        for region in regions:
            for sign in (1,-1):
                clipped=clip_halfspace(region['model'],sign*plane)
                if clipped:
                    next_regions.append({'model':clipped,'signs':region['signs']+[sign]})
                    if len(next_regions)>max_regions:
                        raise GeometryError(f'Arrangement exceeded {max_regions} regions at plane {index}; enumeration did not complete and no result was committed.')
        regions=next_regions;stages.append({'plane':index,'regionCount':len(regions)})
    scale=float(np.max(high-low));tol=TOLERANCE*scale*4
    regions.sort(key=lambda r:tuple(r['signs']))
    for index,region in enumerate(regions):
        p=np.asarray(region['model']['vertices'])
        region.update({'id':index,'boundedness':boundedness(planes,region['signs'],(low+high)/2,scale),
                       'touchesObservationBox':bool(np.any(np.abs(p-low)<tol) or np.any(np.abs(p-high)<tol)),
                       'centroid':p.mean(axis=0).tolist(),'volume':region['model']['measure']['content'],
                       'exteriorPlaneCount':sum(sign<0 for sign in region['signs'])})
    total=sum(r['volume'] for r in regions);box_volume=float(np.prod(high-low))
    if not math.isclose(total,box_volume,rel_tol=1e-6,abs_tol=box_volume*1e-8):
        raise GeometryError('Arrangement partitions fail observation-box volume conservation.')
    result={'id':str(uuid.uuid4()),'source':source,'planes':planes.tolist(),'bounds':[low.tolist(),high.tolist()],
            'regions':regions,'stages':stages,'algorithmVersion':VERSION,'numericMode':'float64-approximate',
            'termination':'exhausted within observation box','completeWithinDeclaredDomain':True,
            'domain':'full-dimensional regions intersecting the declared finite observation box',
            'unrestrictedEnumerationComplete':False,'validation':{'partitionVolume':total,'boxVolume':box_volume,'volumeConserved':True},
            'parameters':{'box_scale':box_scale,'plane_ids':plane_ids,'bounds':bounds,'max_regions':max_regions}}
    result['diagram']=arrangement_diagram(result,diagram_plane)
    return result


def arrangement_diagram(arrangement,plane=0):
    planes=np.asarray(arrangement['planes'])
    if type(plane) is not int or not 0<=plane<len(planes):raise GeometryError('Diagram plane index is outside the supplied plane list.')
    n=planes[plane,:3];offset=planes[plane,3];origin=-offset*n
    _,_,vt=np.linalg.svd(n[None,:],full_matrices=True);basis=vt[1:].T
    scale=float(np.max(np.ptp(np.asarray(arrangement['bounds']),axis=0)));tol=TOLERANCE*scale*4
    polygons={}
    for region in arrangement['regions']:
        m=region['model'];p=np.asarray(m['vertices'])
        for face in m['faces']:
            cloud=p[face]
            if np.max(np.abs(cloud@n+offset))>tol:continue
            key=tuple(sorted(tuple(np.round(v/scale,7)) for v in cloud))
            if key not in polygons:
                polygons[key]={'points':((cloud-origin)@basis).tolist(),'regionIds':[]}
            polygons[key]['regionIds'].append(region['id'])
    return {'plane':plane,'sourceFace':arrangement.get('source',{}).get('faceIds',[plane]*len(planes))[plane],
            'normal':n.tolist(),'origin':origin.tolist(),'basis':basis.tolist(),'polygons':list(polygons.values()),
            'semantics':'Each polygon is a planar arrangement region inside the observation box; IDs identify its incident 3D regions.'}


def region_union(arrangement,region_ids,allow_clipped=False,source=None):
    if not isinstance(region_ids,list) or not region_ids or len(set(region_ids))!=len(region_ids):
        raise GeometryError('Select one or more distinct arrangement region IDs.')
    regions=arrangement.get('regions',[])
    if any(type(i) is not int or not 0<=i<len(regions) for i in region_ids):raise GeometryError('Region selection is outside this arrangement.')
    if source and arrangement.get('source',{}).get('fingerprint')!=identity(source):
        raise GeometryError('Arrangement source changed; evaluate it again before selecting regions.')
    chosen=[regions[i] for i in sorted(region_ids)]
    if not allow_clipped and any(r['touchesObservationBox'] or r['boundedness']!='bounded-numerical' for r in chosen):
        raise GeometryError('Selection contains an unbounded, unresolved, or box-clipped region. Increase observation bounds or explicitly request an artificial clipped union.')
    planes=np.asarray(arrangement['planes']);scale=float(np.max(np.ptp(np.asarray(arrangement['bounds']),axis=0)));tol=TOLERANCE*scale*4
    points=[];face_map=defaultdict(list);pieces=[]
    for region in chosen:
        m=region['model'];require_convex(m)
        m=hull(m['vertices'],'Selected arrangement region')
        values=np.asarray(m['vertices'])@planes[:,:3].T+planes[:,3]
        if np.max(values*np.asarray(region['signs']))>tol:raise GeometryError('Region geometry disagrees with its arrangement half-space signature.')
        pieces.append(m)
        remap=[]
        for p in m['vertices']:
            match=next((i for i,q in enumerate(points) if np.linalg.norm(np.asarray(p)-q)<=tol),None)
            if match is None:match=len(points);points.append(p)
            remap.append(match)
        for face in m['faces']:
            cycle=[remap[v] for v in face]
            face_map[frozenset(cycle)].append(cycle)
    if any(len(faces)>2 for faces in face_map.values()):raise GeometryError('More than two region facets coincide; union semantics are unresolved.')
    boundary=[faces[0] for faces in face_map.values() if len(faces)==1]
    used=sorted({v for face in boundary for v in face});mapping={v:i for i,v in enumerate(used)}
    boundary=[[mapping[v] for v in face] for face in boundary]
    edges=sorted({tuple(sorted((a,b))) for f in boundary for a,b in zip(f,f[1:]+f[:1])})
    result={'id':str(uuid.uuid4()),'name':'Stellation region union of '+arrangement.get('source',{}).get('name','plane arrangement'),
            'dimension':3,'embeddingDimension':3,'interpretation':'polyhedral-region-union',
            'vertices':[points[v] for v in used],'edges':[list(e) for e in edges],'faces':boundary,'cells':[],
            'convexPieces':pieces,'numeric':{'mode':'float64-approximate','tolerance':TOLERANCE,'certified':False,'algorithm':'signed plane-region union','version':VERSION},
            'metadata':{'family':'Stellation region selection','fillSemantics':'ordinary-convex-faces','regionIds':sorted(region_ids),'artificialClipping':allow_clipped,
                        'arrangementPlanes':arrangement['planes'],'observationBounds':arrangement['bounds']},
            'provenance':{'operation':'stellation-region-union','sourceId':arrangement.get('source',{}).get('id'),
                          'sourceFingerprint':arrangement.get('source',{}).get('fingerprint'),'algorithmVersion':VERSION,
                          'parameters':{'region_ids':sorted(region_ids),'allow_clipped':allow_clipped,**arrangement.get('parameters',{})}},
            'measure':{'content':sum(piece['measure']['content'] for piece in pieces),'boundaryMeasure':sum(polygon_area(np.asarray(points)[[used[v] for v in f]]) for f in boundary),
                       'dimension':3,'units':'model-units','definition':'disjoint-interior convex-region volume sum and exposed facet area'}}
    result['validation']=validate(result)
    if not result['validation']['passed']:raise GeometryError('Region union boundary failed structural checks: '+'; '.join(result['validation']['errors']))
    result['fingerprint']=identity(result)
    return result


def section_union(model,normal=None,offset=0):
    """Slice a declared disjoint-interior 3D convex-region union.

    The 2D result retains a face subdivision, disconnected components and
    degenerate strata. Shared planar interfaces are deduplicated when the
    slice coincides with a partition plane. Arbitrary generalized imports
    are not assumed to have these solid-union semantics.
    """
    from .operations import convex_section
    if model.get('dimension')!=3 or not model.get('convexPieces'):
        raise GeometryError('Nonconvex section requires a declared 3D convex-region solid union.')
    if not validate(model)['passed']:raise GeometryError('Source union failed geometry validation.')
    n=np.asarray([0,0,1] if normal is None else normal,dtype=float)
    if n.shape!=(3,) or not np.isfinite(n).all() or np.linalg.norm(n)==0 or not math.isfinite(offset):raise GeometryError('Section requires a finite nonzero 3D normal and finite offset.')
    n/=np.linalg.norm(n)
    scale=float(np.max(np.ptp(np.asarray(model['vertices']),axis=0)));tol=TOLERANCE*scale*4
    points=[];faces=[];face_keys=set();strata=[];loose_edges=set();results=[]
    def point_id(p):
        match=next((i for i,q in enumerate(points) if np.linalg.norm(np.asarray(p)-q)<=tol),None)
        if match is None:match=len(points);points.append(list(p))
        return match
    for index,piece in enumerate(model['convexPieces']):
        result=convex_section(piece,n,offset);results.append(result)
        if result['model']:
            m=result['model'];remap=[point_id(p) for p in m['vertices']]
            for f in m['faces']:
                cycle=[remap[v] for v in f];key=frozenset(cycle)
                if key not in face_keys:face_keys.add(key);faces.append(cycle)
        elif result['status']=='degenerate':
            ids=[point_id(p) for p in result['intersection']]
            strata.append({'piece':index,'dimension':result['affineDimension'],'vertices':ids})
            if result['affineDimension']==1 and len(ids)>1:
                cloud=np.asarray([points[i] for i in ids]);_,_,vt=np.linalg.svd(cloud-cloud[0],full_matrices=False)
                values=cloud@vt[0];loose_edges.add(tuple(sorted((ids[int(np.argmin(values))],ids[int(np.argmax(values))]))))
    common={'normal':n.tolist(),'offset':offset,'origin':results[0]['origin'],'basis':results[0]['basis'],'sourceId':model['id'],
            'degenerateStrata':strata,'intersection':points,'pieceResults':[{'status':r['status']} for r in results]}
    if not points:return {'status':'empty','model':None,**common}
    if not faces:
        return {'status':'degenerate','model':None,'affineDimension':rank(np.asarray(points)/scale),
                'maximumStratumDimension':max((s['dimension'] for s in strata),default=0),**common}
    edge_counts=defaultdict(int)
    for f in faces:
        for a,b in zip(f,f[1:]+f[:1]):edge_counts[tuple(sorted((a,b)))]+=1
    edges=sorted(set(edge_counts)|loose_edges)
    cloud=np.asarray(points)
    result={'id':str(uuid.uuid4()),'name':'Section of '+model['name'],'dimension':2,'embeddingDimension':2,
            'interpretation':'planar-region-union','vertices':points,'edges':[list(e) for e in edges],'faces':faces,'cells':[],
            'numeric':{'mode':'float64-approximate','tolerance':TOLERANCE,'certified':False,'algorithm':'convex-piece sections with shared-interface deduplication','version':VERSION},
            'metadata':{'family':'Nonconvex union section','fillSemantics':'ordinary-convex-faces','sectionEmbedding':{k:common[k] for k in ('normal','offset','origin','basis','sourceId')},
                        'degenerateStrata':strata,'interiorEdgeIds':[i for i,e in enumerate(edges) if edge_counts[e]==2],
                        'faceInterpretation':'convex planar subdivision cells; disconnected and degenerate strata retained'},
            'provenance':{'operation':'nonconvex-union-section','sourceId':model['id'],'sourceFingerprint':identity(model),
                          'parameters':{'normal':n.tolist(),'offset':offset},'algorithmVersion':VERSION},
            'measure':{'content':sum(polygon_area(cloud[f]) for f in faces),
                       'boundaryMeasure':sum(float(np.linalg.norm(cloud[a]-cloud[b])) for (a,b),count in edge_counts.items() if count==1),
                       'dimension':2,'units':'model-units','definition':'unique planar-cell area sum; perimeter of area-cell boundary excludes isolated strata'}}
    result['validation']=validate(result)
    if not result['validation']['passed']:raise GeometryError('Union section complex failed validation: '+'; '.join(result['validation']['errors']))
    result['fingerprint']=identity(result)
    return {'status':'full-dimensional','model':result,**common}


def enumerate_unions(arrangement,source=None,symmetry='geometric',include_seed=True,connected=True,max_orbits=20,max_results=4096,symmetry_options=None):
    """Exhaustive orbit-subset search in a declared finite enclosed-region set.

    These are explicit custom criteria, not Stella's undocumented option-level
    criteria. Connectivity means full-facet adjacency of 3D region interiors.
    Enumeration does not convexify selected regions or ignore inaccessible ones.
    """
    if symmetry not in ('none','signed-axis','geometric'):raise GeometryError('Enumeration symmetry is none, signed-axis, or geometric.')
    if symmetry_options is not None and (symmetry!='geometric' or not isinstance(symmetry_options,dict) or any(k not in ('orientation','stabilize','generator_ids','max_frames') for k in symmetry_options)):
        raise GeometryError('Geometric symmetry options are orientation, stabilize, generator_ids and max_frames; other symmetry modes do not accept them.')
    if type(max_orbits) is not int or not 1<=max_orbits<=20 or type(max_results) is not int or not 1<=max_results<=100000:
        raise GeometryError('Search limits: 1–20 region orbits and 1–100,000 results.')
    regions=[r for r in arrangement['regions'] if r['boundedness']=='bounded-numerical' and not r['touchesObservationBox']]
    if not regions:raise GeometryError('No enclosed regions exist in this observation box.')
    if source and arrangement.get('source',{}).get('fingerprint')!=identity(source):raise GeometryError('Enumeration source changed; re-evaluate the arrangement.')
    ids=[r['id'] for r in regions];centers=np.asarray([r['centroid'] for r in regions]);tree=cKDTree(centers)
    scale=float(np.max(np.ptp(np.asarray(arrangement['bounds']),axis=0)));tol=TOLERANCE*scale*8
    actions=[list(range(len(regions)))];full_source=False;source_order=1;unrestricted_order=None;selected_complete=True
    if symmetry in ('signed-axis','geometric'):
        if not source:raise GeometryError('Symmetry-constrained enumeration requires its validated source model.')
        from .operations import signed_symmetry
        from .symmetry import geometric_symmetry
        group=geometric_symmetry(source,**(symmetry_options or {})) if symmetry=='geometric' else signed_symmetry(source)
        if symmetry=='geometric' and not group['complete']:raise GeometryError('Geometric symmetry search hit its frame limit; choose a verified subgroup explicitly or simplify the source.')
        source_order=group['order'];unrestricted_order=group.get('unrestrictedVerifiedOrder');selected_complete=group['complete'];center=np.asarray(group['center']);actions=[]
        for action in group['actions']:
            matrix=np.asarray(action['matrix']);transformed=(centers-center)@matrix.T+center
            distances,mapping=tree.query(transformed)
            if max(distances)>tol or len(set(mapping))!=len(regions):continue
            valid=True
            for i,j in enumerate(mapping):
                p=np.asarray(regions[i]['model']['vertices']);q=np.asarray(regions[j]['model']['vertices'])
                if len(p)!=len(q):valid=False;break
                error,vertex_map=cKDTree(q).query((p-center)@matrix.T+center)
                if max(error)>tol or len(set(vertex_map))!=len(p):valid=False;break
                target={frozenset(f) for f in regions[j]['model']['faces']}
                if any(frozenset(vertex_map[f]) not in target for f in regions[i]['model']['faces']):valid=False;break
            if valid:actions.append(mapping.tolist())
        actions=sorted({tuple(a) for a in actions})
        full_source=group['complete'] and len(actions)==source_order and (symmetry!='geometric' or source_order==unrestricted_order)
    action_set={tuple(a) for a in actions}
    if not actions or any(tuple(a[b[i]] for i in range(len(regions))) not in action_set for a in actions for b in actions):
        raise GeometryError('Numerical region actions do not close as a subgroup; enumeration stopped without a completeness claim.')
    orbits=[];unseen=set(range(len(regions)))
    while unseen:
        first=min(unseen);orbit={a[first] for a in actions};unseen-=orbit;orbits.append(sorted(ids[i] for i in orbit))
    if len(orbits)>max_orbits:raise GeometryError(f'{len(orbits)} region orbits exceed the {max_orbits}-orbit exhaustive search limit.')
    facet_map=defaultdict(list)
    for region in regions:
        p=np.asarray(region['model']['vertices'])
        for face in region['model']['faces']:
            key=frozenset(tuple(np.round(v/scale,7)) for v in p[face]);facet_map[key].append(region['id'])
    adjacency={i:set() for i in ids}
    for neighbors in facet_map.values():
        if len(neighbors)==2:
            a,b=neighbors;adjacency[a].add(b);adjacency[b].add(a)
    seed={r['id'] for r in regions if r['exteriorPlaneCount']==0}
    if include_seed and not seed:raise GeometryError('Seed-inclusion criterion requires an enclosed original seed region.')
    results=[];evaluated=0;termination='exhausted'
    for mask in range(1<<len(orbits)):
        evaluated+=1;selected={i for k,orbit in enumerate(orbits) if mask&(1<<k) for i in orbit}
        if not selected or include_seed and not seed<=selected:continue
        if connected:
            reached=set();pending=[min(selected)]
            while pending:
                i=pending.pop()
                if i in reached:continue
                reached.add(i);pending.extend((adjacency[i]&selected)-reached)
            if reached!=selected:continue
        results.append({'regionIds':sorted(selected),'regionCount':len(selected),'volume':sum(arrangement['regions'][i]['volume'] for i in selected)})
        if len(results)>=max_results and evaluated<(1<<len(orbits)):
            termination='result-limit';break
    return {'candidates':results,'orbits':orbits,'regionAdjacency':{str(i):sorted(v) for i,v in adjacency.items()},
            'criteria':{'symmetry':symmetry,'symmetryOptions':symmetry_options,'includeSeed':include_seed,'connectedByFullFacets':connected},
            'group':{'actingOrder':len(actions),'sourceOrder':source_order,'sourceSignedAxisOrder':source_order if symmetry=='signed-axis' else None,'fullSourceGroupVerified':full_source,
                     'preservesAllSourceActions':len(actions)==source_order,
                     'selectedSourceGroupComplete':selected_complete,'unrestrictedSourceOrder':unrestricted_order,
                     'regionActionsClosed':True,'numericMode':'float64-approximate'},
            'domain':{'regionIds':ids,'description':'enclosed, unclipped full-dimensional regions in the recorded observation box'},
            'subsetsEvaluated':evaluated,'totalOrbitSubsets':1<<len(orbits),'termination':termination,
            'completeWithinDeclaredCriteria':termination=='exhausted','unrestrictedStellationEnumerationComplete':False,
            'algorithmVersion':VERSION}
