"""GPL-3.0-or-later. Four-face source-edge assembly, not an ordinary shell.

Bounded embedded closed ordinary pieces meet at explicit literal edges. No source weld,
hull replacement, face deletion, or assertion of an ordinary source manifold.
Rigid charts use explicit face-pair connections; paper flaps retain physical mm.
"""
from copy import deepcopy
from itertools import combinations
import math
import xml.etree.ElementTree as ET
import numpy as np
from scipy.spatial.transform import Rotation
from .geometry import GeometryError,identity,validate,polygon_area
from .generalized_nets import _shell_geometry,source_triangles,polygon_overlap
from .nets import fold_net,net_svg
from .net_printing import pack_net
from .net_color_printing import face_colors
from .automatic_faceting import _hash
from .automatic_faceting_workflow import _portable

VERSION='0.1.0'
POLICIES=('tongue-in-groove','internal-support','no-internal-support','disconnected')
SVG='http://www.w3.org/2000/svg'
EPS=1e-8
def _stop(cancelled):
    if cancelled is not None and cancelled():raise GeometryError('Coincident-edge assembly canceled before publication.')
def source_hash(source):return _hash({k:v for k,v in source.items() if k not in ('fingerprint','validation','measure')})
def _pairs(value):return sorted(sorted(pair) for pair in value)
def _cid(edge,pair):return 'E'+str(edge)+'/F'+':'.join(str(i) for i in sorted(pair))
def _number(value,low,high,label):
    if type(value) not in (int,float) or not math.isfinite(value) or not low<=value<=high:raise GeometryError(label+' is outside its finite physical bound.')
    return value

def qualify_assembly(source,*,cancelled=None):
    source=_portable(source,32*1024*1024);_stop(cancelled)
    if type(source) is not dict or type(source.get('id')) is not str or not 1<=len(source['id'])<=128:raise GeometryError('Assembly source requires its bounded literal source ID.')
    if source.get('dimension')!=3 or source.get('embeddingDimension',3)!=3 or not validate(source)['passed']:
        raise GeometryError('Assembly requires a structurally valid intrinsic3D source; an invalid convex shell is not relabeled.')
    vertices=source['vertices'];faces=source['faces'];edges=source['edges']
    if not 4<=len(vertices)<=512 or not 4<=len(faces)<=250 or sum(map(len,faces))>4000 or any(len(f)>128 for f in faces):raise GeometryError('Assembly limits:512vertices,250faces,128corners/face,4000boundary corners.')
    p=np.asarray(vertices,dtype=float);span=float(np.max(np.ptp(p,axis=0)));tol=span*EPS
    if span<=0:raise GeometryError('Assembly source has no extent.')
    for i in range(len(p)):
        if any(np.linalg.norm(p[i]-p[j])<=tol for j in range(i)):raise GeometryError('Distinct coincident source vertex IDs require an explicit source correspondence; assembly does not infer a weld.')
    lookup={tuple(sorted(e)):i for i,e in enumerate(edges)};incidence={i:[] for i in range(len(edges))};directions={}
    for fi,face in enumerate(faces):
        for a,b in zip(face,face[1:]+face[:1]):
            edge=lookup.get(tuple(sorted((a,b))))
            if edge is None:raise GeometryError('Every ordered source face boundary must have its literal source edge.')
            incidence[edge].append(fi);directions[fi,edge]=1 if a<b else -1
    if {v for face in faces for v in face}!=set(range(len(vertices))):raise GeometryError('Assembly requires every source vertex in its closed piece neighborhoods; unused source vertices are not discarded.')
    if any(len(v) not in (2,4) or len(set(v))!=len(v) for v in incidence.values()):raise GeometryError('Assembly requires exactly two or four distinct source faces at each used edge.')
    pinched=[e for e,owners in incidence.items() if len(owners)==4]
    if not 1<=len(pinched)<=32:raise GeometryError('Choose a source with1to32 literal four-face edges; ordinary shells use ordinary nets.')
    graph={f:set() for f in range(len(faces))}
    for owners in incidence.values():
        if len(owners)==2:a,b=owners;graph[a].add(b);graph[b].add(a)
    groups=[];seen=set()
    for root in range(len(faces)):
        if root in seen:continue
        todo=[root];group=[]
        while todo:
            face=todo.pop()
            if face in seen:continue
            seen.add(face);group.append(face);todo.extend(graph[face]-seen)
        groups.append(sorted(group))
    if not 2<=len(groups)<=16:raise GeometryError('Four-face edges must separate2to16 ordinary pieces through source incidence; ambiguous pieces need explicit future decomposition.')
    face_piece={f:i for i,group in enumerate(groups) for f in group}
    from .ordinary_assembly_solids import qualify_piece_solids
    solid=qualify_piece_solids(p,faces,groups,edges,pinched,cancelled=cancelled)
    normals=solid['normals'];proofs=solid['pieces'];contacts=solid['contacts'];work=solid['work']
    joints=[]
    for edge in pinched:
        owners=sorted(incidence[edge]);parts={face_piece[f] for f in owners}
        if len(parts)!=2 or any(sum(face_piece[f]==part for f in owners)!=2 for part in parts):raise GeometryError('Each four-face edge must have two faces from each of two qualified pieces.')
        if not any(c['sourceEdgeId']==edge for c in contacts):raise GeometryError('Four-face edge lacks its checked piece-contact evidence.')
        outside=_pairs([[f for f in owners if face_piece[f]==part] for part in sorted(parts)])
        a,b=edges[edge];axis=p[b]-p[a];axis/=np.linalg.norm(axis);mid=(p[a]+p[b])/2;rays={}
        for f in owners:
            cycle=faces[f];cloud=p[cycle]-p[cycle[0]]
            raw=np.sum(np.cross(cloud,np.roll(cloud,-1,axis=0)),axis=0);raw/=np.linalg.norm(raw)
            slot=next(i for i,v in enumerate(cycle) if {v,cycle[(i+1)%len(cycle)]}=={a,b})
            boundary=p[cycle[(slot+1)%len(cycle)]]-p[cycle[slot]]
            q=np.cross(raw,boundary)
            if np.linalg.norm(q)<=tol:raise GeometryError('Four-face edge has an undefined local interior face ray.')
            rays[f]=q/np.linalg.norm(q)
        x=rays[owners[0]];y=np.cross(axis,x)
        ordered=sorted(owners,key=lambda f:math.atan2(float(rays[f]@y),float(rays[f]@x)))
        if any(np.linalg.norm(rays[f]-rays[g])<=EPS*4 for f,g in combinations(owners,2)):raise GeometryError('Coincident face rays make outside/inside pairings ambiguous.')
        matches=[_pairs([[ordered[0],ordered[1]],[ordered[2],ordered[3]]]),_pairs([[ordered[1],ordered[2]],[ordered[3],ordered[0]]])]
        if outside not in matches:raise GeometryError('Declared ordinary pieces interleave around the edge; outside pairing is not a pair of disjoint solid wedges.')
        inside=matches[1-matches.index(outside)]
        joints.append(dict(edge=edge,sourceVertexIds=edges[edge],incidentFaceIds=owners,outsidePairs=outside,insidePairs=inside,radialOrder=ordered,
            faceRays={str(f):rays[f].tolist() for f in owners},pieceIds=sorted(parts)))
    return dict(format='coincident-edge-qualification',version=1,kernelVersion=VERSION,sourceId=source['id'],sourceFingerprint=identity(source),sourceHash=source_hash(source),
        sourceDomain='embedded closed ordinary pieces with disjoint interiors meeting along literal four-face edges',pieces=proofs,joints=joints,contacts=contacts,
        validation=dict(sourceGeometryUnchanged=True,ordinarySourceManifold=False,contactWork=work,contactTolerance=solid['tolerance'],solidSideTriangleVisits=solid['queryVisits'],contactMethod='source triangle intersections and signed-solid-angle sides'),_normals=normals,_directions=directions)

def public_qualification(source,**options):
    result=qualify_assembly(source,**options);result.pop('_normals');result.pop('_directions');return result

def _recipe(source,parameters,qualified):
    if type(parameters) is not dict or set(parameters)-{'root','edge_length_mm','joints','connections','placements','ordinary_tabs','width_mm'}:raise GeometryError('Use exact bounded assembly recipe fields.')
    recipe=deepcopy(parameters);recipe.setdefault('root',0);recipe.setdefault('edge_length_mm',25);recipe.setdefault('placements',[]);recipe.setdefault('ordinary_tabs','single');recipe.setdefault('width_mm',3)
    if type(recipe['root']) is not int or not 0<=recipe['root']<len(source['faces']):raise GeometryError('Choose an existing source root face.')
    _number(recipe['edge_length_mm'],1,1000,'E0');_number(recipe['width_mm'],.1,100,'Tab width')
    if recipe['ordinary_tabs'] not in ('none','single','double'):raise GeometryError('Ordinary cut tabs are none, single or double.')
    items=recipe.get('joints');expected={item['edge']:item for item in qualified['joints']}
    if type(items) is not list or len(items)!=len(expected):raise GeometryError('Supply an explicit face-pairing/policy record for every four-face source edge.')
    seen=set()
    for item in items:
        if type(item) is not dict or set(item)!={'edge','outsidePairs','insidePairs','policy','supportSide'} or type(item['edge']) is not int or item['edge'] not in expected or item['edge'] in seen:raise GeometryError('Assembly joints require distinct source-edge/outsidePairs/insidePairs/policy/supportSide records.')
        known=expected[item['edge']];seen.add(item['edge'])
        if item['outsidePairs']!=known['outsidePairs'] or item['insidePairs']!=known['insidePairs']:raise GeometryError('Supplied face pairings differ from the qualified literal source incidence and solid wedge order.')
        if item['policy'] not in POLICIES or type(item['supportSide']) is not int or item['supportSide'] not in (0,1):raise GeometryError('Choose one documented policy and literal support side0or1.')
    recipe['joints']=sorted(items,key=lambda item:item['edge'])
    return recipe

def _connections(source,recipe):
    incident={i:[] for i in range(len(source['edges']))};lookup={tuple(sorted(e)):i for i,e in enumerate(source['edges'])}
    for f,face in enumerate(source['faces']):
        for a,b in zip(face,face[1:]+face[:1]):incident[lookup[tuple(sorted((a,b)))]].append(f)
    joints={j['edge']:j for j in recipe['joints']};records=[]
    for edge,owners in incident.items():
        joint=joints.get(edge);pairs=joint['insidePairs'] if joint and joint['policy']=='disconnected' else joint['outsidePairs'] if joint else [sorted(owners)]
        for index,pair in enumerate(pairs):
            forced=bool(joint and (joint['policy']=='tongue-in-groove' or joint['policy']=='internal-support' and index==joint['supportSide']))
            records.append(dict(id=_cid(edge,pair),sourceEdgeId=edge,sourceFaceIds=pair,policy=joint['policy'] if joint else 'ordinary',pairing='inside' if joint and joint['policy']=='disconnected' else 'outside',forcedCut=forced))
    return records

def build_assembly_net(source,parameters,*,element_annotations=None,cancelled=None,_qualified=None,_validation_only=False):
    original_source=source;original=_hash([source,parameters,element_annotations]);source=_portable(source,32*1024*1024);qualified=qualify_assembly(source,cancelled=cancelled) if _qualified is None else _qualified
    if qualified['sourceHash']!=source_hash(source):raise GeometryError('Internal assembly qualification differs from its source.')
    recipe=_recipe(source,parameters,qualified)
    p=np.asarray(source['vertices'],dtype=float);center=p.mean(axis=0);length=float(np.linalg.norm(p[source['edges'][0][1]]-p[source['edges'][0][0]]));scale=recipe['edge_length_mm']/length
    if np.max(np.abs((p-center)*scale))>1000000:raise GeometryError('Physical assembly coordinates exceed their1million mm bound.')
    target=(p-center)*scale;p=p-center;faces=source['faces'];normals=qualified['_normals'];connections=_connections(source,recipe);by_id={c['id']:c for c in connections};adj={f:[] for f in range(len(faces))}
    for record in connections:
        a,b=record['sourceFaceIds'];adj[a].append((b,record));adj[b].append((a,record))
    # Coherent sheet orientation is checked for the actual chosen pairing,
    # including inside reconnection. Vertex links may normalize to several
    # ordinary circles at a pinched source vertex; each circle is recorded.
    signs={};links={v:{f:[] for f,face in enumerate(faces) if v in face} for v in range(len(p))}
    for record in connections:
        a,b=record['sourceFaceIds'];edge=record['sourceEdgeId'];relation=-qualified['_directions'][a,edge]*qualified['_directions'][b,edge]
        record['_relation']=relation
        for v in source['edges'][edge]:links[v][a].append(b);links[v][b].append(a)
    normalized=[]
    for v,link in links.items():
        if not link or any(len(row)!=2 for row in link.values()):raise GeometryError('Assembly pairing has a noncircular source vertex neighborhood.')
        seen=set();circles=[]
        for f in link:
            if f in seen:continue
            todo=[f];circle=[]
            while todo:
                a=todo.pop()
                if a in seen:continue
                seen.add(a);circle.append(a);todo.extend(link[a])
            circles.append(sorted(circle))
        normalized.append(dict(sourceVertexId=v,faceLinkCircles=circles,ordinaryAfterAbstractNormalization=True))
    for root in range(len(faces)):
        if root in signs:continue
        signs[root]=1;todo=[root]
        while todo:
            a=todo.pop()
            for b,c in adj[a]:
                wanted=signs[a]*c['_relation']
                if b in signs and signs[b]!=wanted:raise GeometryError('Selected face pairing has a nonorientable sheet; no rigid assembly net is available.')
                if b not in signs:signs[b]=wanted;todo.append(b)
    # Normals above already use ordinary-piece orientation. Obtain coherent
    # selected-sheet signs from the original source-cycle Newell normals.
    raw={f:np.sum(np.cross(p[face],np.roll(p[face],-1,axis=0)),axis=0) for f,face in enumerate(faces)}
    normals={f:normal/np.linalg.norm(normal)*signs[f] for f,normal in raw.items()}
    requested=recipe.get('connections');selected=None if requested is None else set(requested)
    if requested is not None and (type(requested) is not list or any(type(i) is not str or i not in by_id or by_id[i]['forcedCut'] for i in requested) or len(selected)!=len(requested)):raise GeometryError('Hinges require distinct current face-pair connection IDs; required double-tab pairs must be cut.')
    coords={};transforms={};parents={};hinges={};angles={};chosen=[];components=[];traversal=[]
    for root in [recipe['root']]+[f for f in range(len(faces)) if f!=recipe['root']]:
        if root in coords:continue
        face=faces[root];u=p[face[1]]-p[face[0]];u/=np.linalg.norm(u);normal=normals[root];r=np.asarray([u,np.cross(normal,u),normal]);t=-r@p[face[0]]
        transforms[root]=(r,t);coords[root]=(p[face]@r.T+t)[:,:2];parents[root]=None;hinges[root]=None;angles[root]=0;queue=[root];members=[]
        while queue:
            a=queue.pop(0);members.append(a);traversal.append(a);pr,pt=transforms[a]
            for b,record in adj[a]:
                if record['forcedCut'] or selected is not None and record['id'] not in selected or b in coords:continue
                ea,eb=source['edges'][record['sourceEdgeId']];anchor=pr@p[ea]+pt;axis=pr@(p[eb]-p[ea]);axis/=np.linalg.norm(axis)
                child=pr@normals[b];parent=pr@normals[a];angle=math.atan2(float(axis@np.cross(child,parent)),float(np.clip(child@parent,-1,1)));rotate=Rotation.from_rotvec(axis*angle).as_matrix()
                cr=rotate@pr;ct=rotate@(pt-anchor)+anchor;transforms[b]=(cr,ct);coords[b]=(p[faces[b]]@cr.T+ct)[:,:2];parents[b]=a;hinges[b]=record['sourceEdgeId'];angles[b]=-angle;chosen.append(record['id']);queue.append(b)
        components.append(dict(root=root,faces=members))
    if selected is not None and set(chosen)!=selected:raise GeometryError('Requested face-pair hinges contain a cycle; cut a hinge before joining this connection.')
    coords={f:q*scale for f,q in coords.items()};transforms={f:(r,t*scale) for f,(r,t) in transforms.items()};cursor=0
    for component in components:
        cloud=np.concatenate([coords[f] for f in component['faces']]);low,high=cloud.min(axis=0),cloud.max(axis=0);shift=np.array([cursor-low[0],-low[1]]) if len(components)>1 else np.zeros(2)
        for f in component['faces']:coords[f]+=shift;r,t=transforms[f];transforms[f]=(r,t+np.r_[shift,0])
        cursor+=high[0]-low[0]+10
    placements=recipe['placements'];roots={c['root']:c for c in components};seen=set()
    if type(placements) is not list or len(placements)>len(roots):raise GeometryError('Use bounded distinct current component placements.')
    for place in placements:
        if type(place) is not dict or set(place)!={'root','translation','angle'} or type(place['root']) is not int or place['root'] not in roots or place['root'] in seen or type(place['translation']) is not list or len(place['translation'])!=2:raise GeometryError('A placement requires a distinct current root,2D translation and angle.')
        seen.add(place['root']);angle=_number(place['angle'],-360000,360000,'Placement angle');shift=np.array([_number(v,-100000,100000,'Placement mm') for v in place['translation']]);r=Rotation.from_euler('z',angle,degrees=True).as_matrix()
        for f in roots[place['root']]['faces']:coords[f]=coords[f]@r[:2,:2].T+shift;old,t=transforms[f];transforms[f]=(r@old,r@t+np.r_[shift,0])
    for component in components:
        r,t=transforms[component['root']];component['targetQuaternion']=Rotation.from_matrix(r.T).as_quat().tolist();component['targetTranslation']=(-r.T@t).tolist()
    component_id={f:i for i,c in enumerate(components) for f in c['faces']};face_connections={};records=[];lookup={tuple(sorted(e)):i for i,e in enumerate(source['edges'])}
    for f,face in enumerate(faces):
        edge_records=[];refs=[]
        for a,b in zip(face,face[1:]+face[:1]):
            edge=lookup[tuple(sorted((a,b)))];c=next(c for c in connections if c['sourceEdgeId']==edge and f in c['sourceFaceIds']);refs.append(c['id']);edge_records.append(dict(id=edge,hinge=c['id'] in chosen))
        face_connections[str(f)]=refs;records.append(dict(id=f,sourceVertices=face,points=coords[f].tolist(),parent=parents[f],parentHinge=hinges[f],foldAngle=angles[f],component=component_id[f],edges=edge_records))
    joint_map={j['edge']:j for j in recipe['joints']};tabs=[];instructions=[]
    for c in connections:
        joint=joint_map.get(c['sourceEdgeId']);pair=c['sourceFaceIds'];tab_faces=[];role='ordinary-glue-tab';direction='inside'
        if joint:
            policy=joint['policy'];slot=joint['outsidePairs'].index(pair) if policy!='disconnected' else joint['insidePairs'].index(pair)
            if policy=='tongue-in-groove':tab_faces=pair;role='tongue-double-tab' if slot==joint['supportSide'] else 'groove-double-tab';direction='outside' if slot==joint['supportSide'] else 'inside'
            elif policy=='internal-support' and slot==joint['supportSide']:tab_faces=pair;role='internal-support-double-tab';direction='toward-back-of-opposite-pair'
            elif policy=='disconnected' and c['id'] not in chosen:tab_faces=pair if recipe['ordinary_tabs']=='double' else pair[:1] if recipe['ordinary_tabs']=='single' else []
        elif c['id'] not in chosen:tab_faces=pair if recipe['ordinary_tabs']=='double' else pair[:1] if recipe['ordinary_tabs']=='single' else []
        for f in tab_faces:
            face=records[f];q=np.asarray(face['points']);k=next(i for i,e in enumerate(face['edges']) if e['id']==c['sourceEdgeId']);a,b=q[k],q[(k+1)%len(q)];length=float(np.linalg.norm(b-a));u=(b-a)/length;width=recipe['width_mm']
            if width>length/4:raise GeometryError('Requested tab width exceeds one quarter of a physical source edge; decrease width or increase E0. No automatic width clipping is applied.')
            signed=sum(float(np.cross(x,y)) for x,y in zip(q,np.roll(q,-1,axis=0)));out=(1 if signed>0 else -1)*np.array([u[1],-u[0]]);bevel=min(width,length/5)
            tabs.append(dict(face=f,edge=c['sourceEdgeId'],connectionId=c['id'],sourceFacePair=pair,points=np.asarray([a,a+u*bevel+out*width,b-u*bevel+out*width,b]).tolist(),widthMm=width,role=role,foldDirection=direction))
    for joint in recipe['joints']:
        outside=joint['outsidePairs'];side=joint['supportSide'];policy=joint['policy']
        action={'tongue-in-groove':'Glue the selected outside pair double tabs pointing out; slide the joined tongue between the opposite double tabs and glue.',
            'internal-support':'Glue the selected outside pair double tabs to the backs of the opposite two source faces; the receiver pair may hinge.',
            'no-internal-support':'No tabs at this source edge; outside pairs may hinge or use a user supplied non-tab attachment.',
            'disconnected':'Reconnect the inside face pairs; the original outside solid-piece pairs are not attached along this source edge.'}[policy]
        instructions.append(dict(sourceEdgeId=joint['edge'],policy=policy,outsidePairs=outside,insidePairs=joint['insidePairs'],supportSide=side,action=action))
    cloud=np.concatenate([np.asarray(f['points']) for f in records]+[np.asarray(t['points']) for t in tabs])
    if np.max(np.abs(cloud))>1000000:raise GeometryError('Placed assembly layout exceeds its1million physical-mm bound; no automatic rescaling is applied.')
    area_preserved=all(abs(polygon_area(p[faces[f]])*scale**2-polygon_area(coords[f]))<=1e-7*max(1,polygon_area(coords[f])) for f in range(len(faces)))
    endpoint=fold_net(dict(faces=records,components=components,traversalOrder=traversal,sourceEdges=source['edges'],targetVertices=target.tolist(),referenceEdgeLengthMm=recipe['edge_length_mm'],sourceFingerprint=identity(source)),1)['validation']
    if not area_preserved or not endpoint['endpointReconstructed']:raise GeometryError('Assembly rigid charts failed source area or complete endpoint reconstruction.')
    if _validation_only:
        _stop(cancelled)
        if _hash([original_source,parameters,element_annotations])!=original:raise GeometryError('Saved assembly ownership changed during validation.')
        if element_annotations is not None:
            from .element_annotations import validate_document
            validate_document(element_annotations,source)
        return True
    overlaps=[]
    for a,b in combinations(records,2):
        if polygon_overlap(np.asarray(a['points']),np.asarray(b['points']),recipe['edge_length_mm']*1e-8):overlaps.append([a['id'],b['id']])
    tab_pairs=[]
    for i,tab in enumerate(tabs):
        _stop(cancelled)
        for face in records:
            if polygon_overlap(np.asarray(tab['points']),np.asarray(face['points']),recipe['edge_length_mm']*1e-8):tab_pairs.append(dict(edge=tab['edge'],face=face['id']))
        for other in tabs[i+1:]:
            if polygon_overlap(np.asarray(tab['points']),np.asarray(other['points']),recipe['edge_length_mm']*1e-8):tab_pairs.append(dict(edge=tab['edge'],otherTabEdge=other['edge']))
    recipe['connections']=chosen
    result=dict(algorithmVersion='coincident-edge-assembly-0.26.0',sourceDomain=qualified['sourceDomain'],sourceId=source['id'],sourceFingerprint=identity(source),sourceHash=source_hash(source),units='mm',scale=scale,referenceEdge=0,referenceEdgeLengthMm=recipe['edge_length_mm'],sourceFaceCount=len(faces),sourceEdges=source['edges'],targetVertices=target.tolist(),
        root=recipe['root'],faces=records,components=components,traversalOrder=traversal,hinges=[by_id[i]['sourceEdgeId'] for i in chosen],connectionHinges=chosen,connections=[{k:v for k,v in c.items() if not k.startswith('_')} for c in connections],faceConnections=face_connections,
        placements=placements,tabs=bool(tabs),tabRecords=tabs,overlapPairs=overlaps,hasOverlap=bool(overlaps),tabOverlapPairs=tab_pairs,hasTabOverlap=bool(tab_pairs),bounds=[cloud.min(axis=0).tolist(),cloud.max(axis=0).tolist()],fillSemantics='simple-planar-source-faces',faceTriangles=source_triangles(records),
        recipe=recipe,assemblyInstructions=instructions,sourceVertexNeighborhoods=normalized,qualification={k:v for k,v in qualified.items() if not k.startswith('_')},validation=dict(allFacesRepresented=True,sourceGeometryUnchanged=True,ordinarySourceManifold=False,areaPreserved=area_preserved),status='Explicit four-face source assembly; overlaps require user rearrangement')
    result['foldValidation']=endpoint
    if not result['foldValidation']['endpointReconstructed']:raise GeometryError('Assembly rigid chart endpoint failed original source corner reconstruction.')
    if element_annotations is not None:result['elementAnnotations']=deepcopy(element_annotations)
    result['svg']=assembly_svg(source,result)
    _stop(cancelled)
    if _hash([original_source,parameters,element_annotations])!=original:raise GeometryError('Source assembly ownership changed during evaluation.')
    return result

def assembly_svg(source,net,*,expected_face_ids=None):
    safe=deepcopy(net);safe.pop('svg',None);safe.pop('elementAnnotations',None);safe.pop('tabRecords',None);safe['tabs']=False
    if net.get('elementAnnotations') is not None:
        from .element_annotations import annotated_net_svg
        text,_=annotated_net_svg(net['elementAnnotations'],source,safe,expected_face_ids=expected_face_ids)
    else:text=net_svg(safe)
    root=ET.fromstring(text);root.set('data-assembly-source',str(source['id']));metadata=ET.SubElement(root,'{'+SVG+'}metadata');metadata.text=str(net['assemblyInstructions'])+'; tabs are physical flat patterns, not a material/glue stiffness certificate.'
    colors=face_colors(source);low=np.asarray(net['bounds'][0]);records={f['id']:f for f in net['faces']};tab_lookup={(t['edge'],t['face']):t for t in net['tabRecords']}
    for group in root.iter('{'+SVG+'}g'):
        if 'data-net-face' not in group.attrib:continue
        f=int(group.attrib['data-net-face']);face=records[f];polygon=group.find('{'+SVG+'}polygon')
        if colors[f]:r,g,b,a=colors[f];polygon.set('fill',f'rgb({r*255:.8g},{g*255:.8g},{b*255:.8g})');polygon.set('fill-opacity',format(a,'.8g'))
        for node in list(group):
            if node.tag=='{'+SVG+'}text' and node.text and node.text.startswith('E'):
                edge=int(node.text[1:]);k=next(i for i,e in enumerate(face['edges']) if e['id']==edge);label=net['faceConnections'][str(f)][k];node.text=label;node.set('data-assembly-connection',label);node.set('font-size','1.4')
        for edge in face['edges']:
            tab=tab_lookup.get((edge['id'],f))
            if tab:
                q=np.asarray(tab['points'])-low+8;path=ET.SubElement(group,'{'+SVG+'}path',{'data-assembly-tab':tab['connectionId'],'data-tab-role':tab['role'],'data-tab-direction':tab['foldDirection'],'d':'M '+' L '.join(f'{x:.12g} {y:.12g}' for x,y in q),'fill':'none','stroke':'#995c26','stroke-width':'.18'})
                center=q.mean(axis=0);label=ET.SubElement(group,'{'+SVG+'}text',{'x':format(center[0],'.12g'),'y':format(center[1],'.12g'),'font-size':'1.1','text-anchor':'middle','fill':'#713d1d','data-assembly-tab-direction':tab['connectionId']});label.text='OUT' if tab['foldDirection']=='outside' else 'SUP' if tab['role']=='internal-support-double-tab' else 'IN'
    return ET.tostring(root,encoding='unicode')

def assembly_pages(source,parameters,*,element_annotations=None,paper=None,cancelled=None):
    net=build_assembly_net(source,parameters,element_annotations=element_annotations,cancelled=cancelled);safe=deepcopy(net);safe.pop('elementAnnotations',None);safe.pop('svg',None)
    packed=pack_net(safe,**(paper or {}));by_id={f['id']:f for f in net['faces']}
    if len(packed['pages'])>250:raise GeometryError('Assembly paper page count exceeds250.')
    for page in packed['pages']:
        _stop(cancelled);faces=[];tabs=[]
        for part in page['parts']:
            r=Rotation.from_euler('z',part['angle'],degrees=True).as_matrix()[:2,:2];t=np.asarray(part['translation'])-8
            for f in part['faceIds']:record=deepcopy(by_id[f]);record['points']=(np.asarray(record['points'])@r.T+t).tolist();faces.append(record)
            for tab in net['tabRecords']:
                if tab['face'] in part['faceIds']:record=deepcopy(tab);record['points']=(np.asarray(tab['points'])@r.T+t).tolist();tabs.append(record)
        printable={**net,'faces':faces,'tabRecords':tabs,'bounds':[[0,0],[page['widthMm']-16,page['heightMm']-16]]}
        page['svg']=assembly_svg(source,printable,expected_face_ids=sorted(f['id'] for f in faces))
    return {**packed,'sourceHash':net['sourceHash'],'assemblyInstructions':net['assemblyInstructions'],'connectionLabels':[c['id'] for c in net['connections']],
        'validation':{**packed['validation'],'explicitFourFacePairings':True,'ordinarySourceManifold':False}}

def edit_assembly(source,parameters,action,*,connection=None,component=None,translation=None,angle=0,element_annotations=None,cancelled=None):
    net=build_assembly_net(source,parameters,element_annotations=element_annotations,cancelled=cancelled);recipe=deepcopy(net['recipe'])
    points={f['id']:np.asarray(f['points']) for f in net['faces']};targets=points
    if action=='toggle-connection':
        known=next((c for c in net['connections'] if c['id']==connection),None)
        if known is None or known['forcedCut']:raise GeometryError('Choose an existing optional face-pair connection; required policy cuts cannot be joined.')
        chosen=recipe['connections'];chosen.remove(connection) if connection in chosen else chosen.append(connection);recipe['placements']=[]
    elif action=='move-component':
        part=next((c for c in net['components'] if c['root']==component),None)
        if part is None or type(translation) is not list or len(translation)!=2:raise GeometryError('Choose an existing component root and2D physical translation.')
        shift=np.asarray([_number(v,-100000,100000,'Move mm') for v in translation]);angle=_number(angle,-360000,360000,'Move angle');center=np.concatenate([points[f] for f in part['faces']]).mean(axis=0);r=Rotation.from_euler('z',angle,degrees=True).as_matrix()[:2,:2]
        targets={f:(points[f]-center)@r.T+center+shift if f in part['faces'] else points[f] for f in points};recipe['placements']=[]
    else:raise GeometryError('Assembly edits are toggle-connection or move-component.')
    base=build_assembly_net(source,recipe,element_annotations=element_annotations,cancelled=cancelled)
    for c in base['components']:
        f=c['root'];p=np.asarray(base['faces'][f]['points']);q=targets[f];u=p[1]-p[0];v=q[1]-q[0];theta=math.atan2(float(np.cross(u,v)),float(u@v));r=Rotation.from_euler('z',theta).as_matrix()[:2,:2]
        recipe['placements'].append(dict(root=f,translation=(q[0]-r@p[0]).tolist(),angle=math.degrees(theta)))
    return build_assembly_net(source,recipe,element_annotations=element_annotations,cancelled=cancelled)

def validate_assembly_state(source,value,*,element_annotations=None,cancelled=None):
    value=_portable(value,8*1024*1024)
    if type(value) is not dict or set(value)!={'format','version','kernelVersion','sourceId','sourceHash','states','cursor'} or value['format']!='coincident-edge-assembly-state' or value['version']!=1 or value['kernelVersion']!=VERSION or value['sourceId']!=source['id'] or value['sourceHash']!=source_hash(source):raise GeometryError('Saved assembly state belongs to another source or unsupported schema; reset explicitly.')
    if type(value['states']) is not list or not 1<=len(value['states'])<=100 or type(value['cursor']) is not int or not 0<=value['cursor']<len(value['states']):raise GeometryError('Assembly history requires1to100recipes and a literal current cursor.')
    qualified=qualify_assembly(source,cancelled=cancelled)
    # Each retained entry needs real pairing/forest/placement validation; cached
    # math and SVG are intentionally absent from the persisted compact history.
    for recipe in value['states']:build_assembly_net(source,recipe,element_annotations=element_annotations,cancelled=cancelled,_qualified=qualified,_validation_only=True)
    return deepcopy(value)
