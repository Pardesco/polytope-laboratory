# SPDX-License-Identifier: GPL-3.0-only
"""Actual observed cell facets and conservative inaccessible-region filling."""
from collections import defaultdict
import hashlib
import math
import numpy as np
from scipy.spatial import cKDTree
from .geometry import GeometryError,TOLERANCE,identity,canonical_cycle
from .operations import require_convex
from .history import _json_bytes
from .stellation import normalize_planes

VERSION='0.1.0'
MAX_REGIONS=2048
MAX_FACETS=100000


def arrangement_binding(arrangement):
    return {key:arrangement.get(key) for key in ('id','source','planes','bounds','regions','algorithmVersion','completeWithinDeclaredDomain','parameters')}


def cell_graph(arrangement,source=None):
    if type(arrangement) is not dict:raise GeometryError('Choose a completed finite observation arrangement.')
    raw=_json_bytes(arrangement_binding(arrangement),64*1024*1024)
    if type(arrangement) is not dict or arrangement.get('completeWithinDeclaredDomain') is not True:
        raise GeometryError('Cell graph requires a completed finite observation arrangement.')
    regions=arrangement.get('regions');bounds=np.asarray(arrangement.get('bounds'),dtype=float)
    if type(regions) is not list or not 1<=len(regions)<=MAX_REGIONS or bounds.shape!=(2,3) or not np.isfinite(bounds).all() or np.any(bounds[1]<=bounds[0]):
        raise GeometryError('Cell graph needs 1..2048 observed regions and finite positive box extents.')
    planes=normalize_planes(arrangement.get('planes'));scale=float(np.max(bounds[1]-bounds[0]));origin=bounds.mean(axis=0);tol=TOLERANCE*8
    source_info=arrangement.get('source',{})
    if source is not None:
        require_convex(source)
        if source['dimension']!=3 or source_info.get('id')!=source.get('id') or source_info.get('fingerprint')!=identity(source):
            raise GeometryError('Cell graph source changed; evaluate the arrangement again.')
        ids=source_info.get('faceIds')
        if type(ids) is not list or len(ids)!=len(planes) or len(set(ids))!=len(ids) or any(type(i) is not int or not 0<=i<len(source['faces']) for i in ids):raise GeometryError('Cell graph source facial-plane IDs are invalid.')
        points=np.asarray(source['vertices'])
        for face_id,plane in zip(ids,planes):
            if np.max(abs(points[source['faces'][face_id]]@plane[:3]+plane[3]))>tol*scale or np.max(points@plane[:3]+plane[3])>tol*scale:
                raise GeometryError('Arrangement planes disagree with their actual source faces.')
    elif source_info.get('id'):
        raise GeometryError('Source-linked cell graphs require their original source model.')
    records=[];groups=defaultdict(list);nodes=[];unresolved=set();facets=0
    for index,region in enumerate(regions):
        if type(region) is not dict or type(region.get('id')) is not int or region['id']!=index or region.get('boundedness') not in ('bounded-numerical','unbounded-numerical','unresolved') or type(region.get('touchesObservationBox')) is not bool:
            raise GeometryError('Cell graph requires ordered distinct IDs and explicit boundedness/box status.')
        signs=region.get('signs')
        if type(signs) is not list or len(signs)!=len(planes) or any(type(sign) is not int or sign not in (-1,1) for sign in signs):raise GeometryError('Region half-space signatures are invalid.')
        model=region.get('model');require_convex(model);p=np.asarray(model['vertices']);normalized=(p-origin)/scale
        if np.max((p@planes[:,:3].T+planes[:,3])*np.asarray(signs))>tol*scale or np.any(p<bounds[0]-tol*scale) or np.any(p>bounds[1]+tol*scale):raise GeometryError('Observed region disagrees with its half-spaces or box.')
        actual_touch=bool(np.any(abs(p-bounds[0])<=tol*scale) or np.any(abs(p-bounds[1])<=tol*scale))
        outside=sum(sign<0 for sign in signs);nodes.append({'id':index,'outsidePlaneCount':outside,'boundedness':region['boundedness'],'touchesObservationBox':region['touchesObservationBox'] or actual_touch,'centroid':p.mean(axis=0).tolist()})
        facets+=len(model['faces'])
        if facets>MAX_FACETS:raise GeometryError('Cell graph exceeds its actual facet resource limit.')
        for face_id,face in enumerate(model['faces']):
            cloud=p[face]
            box_face=any(np.max(abs(cloud[:,axis]-bounds[side,axis]))<=tol*scale for axis in range(3) for side in range(2))
            if box_face:continue
            plane_ids=[i for i,plane in enumerate(planes) if np.max(abs(cloud@plane[:3]+plane[3]))<=tol*scale]
            if not plane_ids:unresolved.add(index);continue
            record={'region':index,'face':face_id,'points':normalized[face],'planes':plane_ids,'paired':False,'peers':set()}
            number=len(records);records.append(record)
            for plane_id in plane_ids:groups[plane_id].append(number)
    adjacency={i:set() for i in range(len(regions))};connections={}
    for plane_id,indices in groups.items():
        centers=np.array([records[i]['points'].mean(axis=0) for i in indices]);tree=cKDTree(centers)
        for first,second in tree.query_pairs(tol*2):
            left,right=records[indices[first]],records[indices[second]]
            if left['region']==right['region']:continue
            if regions[left['region']]['signs'][plane_id]==regions[right['region']]['signs'][plane_id]:continue
            p,q=left['points'],right['points']
            if len(p)!=len(q):continue
            distances,mapping=cKDTree(q).query(p)
            if np.max(distances)>tol or len(set(mapping))!=len(p) or canonical_cycle(mapping.tolist())!=canonical_cycle(list(range(len(p)))):continue
            a,b=sorted((left['region'],right['region']));key=(a,b)
            adjacency[a].add(b);adjacency[b].add(a);left['paired']=right['paired']=True
            left['peers'].add(right['region']);right['peers'].add(left['region'])
            connection=connections.setdefault(key,{'regions':[a,b],'planeIds':[],'sourceFaceIds':[],'regionFaceIds':{}})
            if plane_id not in connection['planeIds']:connection['planeIds'].append(plane_id)
            if source_info.get('faceIds'):
                source_face=source_info['faceIds'][plane_id]
                if source_face not in connection['sourceFaceIds']:connection['sourceFaceIds'].append(source_face)
            connection['regionFaceIds'][str(left['region'])]=left['face'];connection['regionFaceIds'][str(right['region'])]=right['face']
    for record in records:
        if not record['paired']:unresolved.add(record['region'])
    # Any ambiguous multi-owner facet seeds the exterior conservatively.
    for record in records:
        if len(record['peers'])>1:unresolved.add(record['region']);unresolved.update(record['peers'])
    for node in nodes:
        node['facetAdjacencyUnresolved']=node['id'] in unresolved
        node['selectable']=node['boundedness']=='bounded-numerical' and not node['touchesObservationBox']
        node['supports']=[i for i in sorted(adjacency[node['id']]) if nodes[i]['outsidePlaneCount']<node['outsidePlaneCount']]
    exterior=[node['id'] for node in nodes if not node['selectable'] or node['facetAdjacencyUnresolved']]
    return {'algorithmVersion':VERSION,'arrangementId':arrangement.get('id'),'arrangementSha256':hashlib.sha256(raw).hexdigest(),'sourceId':source_info.get('id'),'sourceFingerprint':source_info.get('fingerprint'),
            'nodes':nodes,'links':list(connections.values()),'adjacency':{str(i):sorted(v) for i,v in adjacency.items()},'exteriorSeedIds':exterior,
            'completeWithinObservedFacetDomain':not unresolved,'unresolvedFacetRegionIds':sorted(unresolved),'numericMode':'float64-approximate','certified':False,
            'domain':'Actual full facets of all full-dimensional regions in the completed observation box; no edge/vertex-contact adjacency.',
            'layerDefinition':'Count of original signed facial planes on whose exterior side a region lies; dependencies follow actual shared facets to lower counts.',
            'fillDefinition':'Unselected selectable regions unreachable through full facets from any unbounded, unresolved, box-touching or facet-uncertain region. All uncertain regions seed the exterior.',
            'unrestrictedStellationEnumerationComplete':False,'resourceBounds':{'regions':MAX_REGIONS,'facets':MAX_FACETS}}


def inaccessible_regions(graph,selected_ids):
    if type(selected_ids) is not list or len(set(selected_ids))!=len(selected_ids) or any(type(i) is not int or not 0<=i<len(graph['nodes']) or not graph['nodes'][i]['selectable'] for i in selected_ids):raise GeometryError('Select distinct enclosed source regions.')
    selected=set(selected_ids);reachable=set();pending=list(set(graph['exteriorSeedIds'])-selected)
    while pending:
        i=pending.pop()
        if i not in reachable and i not in selected:reachable.add(i);pending.extend(set(graph['adjacency'][str(i)])-reachable-selected)
    return sorted(node['id'] for node in graph['nodes'] if node['selectable'] and node['id'] not in selected|reachable)


def dispatch_stellation_cells(request):
    try:
        _json_bytes(request,64*1024*1024)
        if type(request) is not dict or request.get('op')!='stellation-cell-graph' or set(request)-{'op','params','model','id'} or type(request.get('params')) is not dict or set(request['params'])!={'arrangement'}:raise GeometryError('Cell graph accepts exactly params.arrangement and its optional source model.')
        return cell_graph(request['params']['arrangement'],request.get('model'))
    except (TypeError,ValueError,KeyError,AttributeError,ArithmeticError) as exc:
        raise GeometryError('Invalid stellation cell graph: '+str(exc)) from exc
