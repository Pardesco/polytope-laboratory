"""Source-preserving rigid nets of orientable shells with simple planar faces.

This bounded float64 kernel never constructs a hull or replaces source cycles.
Global self-intersections and collisions during folding are not certified.
Convex sources retain the established kernel through unfold_source().
"""
import math
from copy import deepcopy
from functools import lru_cache
import numpy as np
from scipy.spatial.transform import Rotation
from .geometry import GeometryError, identity, polygon_area, validate
from .nets import unfold as convex_unfold, fold_net, overlaps as convex_overlap

EPS = 1e-8
MAX_FACE_VERTICES = 128
MAX_BOUNDARY_VERTICES = 4000


def _cross(a, b):
    return float(a[0]*b[1]-a[1]*b[0])


def _signed_area(q):
    return float(np.sum(q[:,0]*np.roll(q[:,1],-1)-q[:,1]*np.roll(q[:,0],-1)))/2


def _touch(a,b,c,d):
    def orient(x,y,z):return _cross(y-x,z-x)
    aa,bb,cc,dd=orient(a,b,c),orient(a,b,d),orient(c,d,a),orient(c,d,b)
    if aa*bb < -EPS**4 and cc*dd < -EPS**4:return True
    for value,p,x,y in ((aa,c,a,b),(bb,d,a,b),(cc,a,c,d),(dd,b,c,d)):
        if abs(value)<=EPS**2 and np.all(p>=np.minimum(x,y)-EPS) and np.all(p<=np.maximum(x,y)+EPS):return True
    return False


def _simple(q, face):
    if any(np.linalg.norm(a-b)<=EPS for a,b in zip(q,np.roll(q,-1,axis=0))):
        raise GeometryError(f'Face {face} has a zero-length boundary edge.')
    for i in range(len(q)):
        # Adjacent segments may meet only at their common endpoint.
        a,b,c=q[i-1],q[i],q[(i+1)%len(q)]
        if abs(_cross(b-a,c-b))<=EPS**2 and float((b-a)@(c-b))<0:
            raise GeometryError(f'Face {face} retraces its boundary.')
        for j in range(i+1,len(q)):
            if j==i+1 or i==0 and j==len(q)-1:continue
            if _touch(q[i],q[(i+1)%len(q)],q[j],q[(j+1)%len(q)]):
                raise GeometryError(f'Face {face} is self-crossing or touching; generalized nets require simple planar face cycles.')
    if abs(_signed_area(q))<=EPS**2:raise GeometryError(f'Face {face} has zero area.')


def _shell_geometry(model):
    if model.get('dimension')!=3 or not validate(model)['passed']:
        raise GeometryError('Generalized face nets require a validated intrinsic 3D source shell.')
    faces=model['faces'];source=np.asarray(model['vertices'],dtype=float)
    if not faces or len(faces)>250 or sum(map(len,faces))>MAX_BOUNDARY_VERTICES or any(len(f)>MAX_FACE_VERTICES for f in faces):
        raise GeometryError('Generalized net limits: 250 faces, 128 vertices per face, 4,000 face-boundary vertices.')
    span=float(np.max(np.ptp(source,axis=0)));origin=source.mean(axis=0)
    if span<=0:raise GeometryError('Source shell has no metric extent.')
    centered=(source-origin)/span
    _,singular,vt=np.linalg.svd(centered,full_matrices=False)
    if len(singular)<3 or singular[2]<=EPS or len(singular)>3 and singular[3]>EPS:
        raise GeometryError('Source vertices must have intrinsic affine dimension three.')
    basis=np.eye(3) if source.shape[1]==3 else vt[:3].T
    original=source if source.shape[1]==3 else (source-origin)@basis
    p=(original-original.mean(axis=0))/span
    embedding={'origin':origin.tolist(),'basis':basis.tolist(),'coordinates':'centered intrinsic 3D source chart; source cycle IDs retained'}
    edges={tuple(sorted(e)):i for i,e in enumerate(model['edges'])};incidences={};normals=[]
    for fi,face in enumerate(faces):
        cloud=p[face];relative=cloud-cloud[0];_,s,axes=np.linalg.svd(relative,full_matrices=False)
        if s[1]<=EPS or s[-1]>EPS:raise GeometryError(f'Face {fi} is degenerate or nonplanar.')
        q=relative@axes[:2].T;_simple(q,fi)
        normal=np.sum(np.cross(cloud,np.roll(cloud,-1,axis=0)),axis=0)
        normal/=np.linalg.norm(normal);normals.append(normal)
        for a,b in zip(face,face[1:]+face[:1]):
            key=tuple(sorted((a,b)));incidences.setdefault(key,[]).append((fi,1 if a<b else -1))
    if set(incidences)!=set(edges) or any(len(v)!=2 or v[0][0]==v[1][0] for v in incidences.values()):
        raise GeometryError('Closed shell nets require exactly two distinct source faces per source edge, with no unused edges.')
    neighbors=[[] for _ in faces]
    for pair in incidences.values():
        (a,da),(b,db)=pair;relation=-da*db
        neighbors[a].append((b,relation));neighbors[b].append((a,relation))
    signs={}
    for root in range(len(faces)):
        if root in signs:continue
        signs[root]=1;queue=[root]
        while queue:
            parent=queue.pop()
            for child,relation in neighbors[parent]:
                wanted=signs[parent]*relation
                if child in signs:
                    if signs[child]!=wanted:raise GeometryError('Source shell is nonorientable; a coherent rigid face net is unavailable.')
                else:signs[child]=wanted;queue.append(child)
    # Edge-manifold alone permits pinched shells. Require one circular face link
    # at every used vertex, without changing any source incidence.
    for vertex in range(len(p)):
        incident={fi for fi,f in enumerate(faces) if vertex in f}
        if not incident:raise GeometryError('Source shell contains an unused vertex.')
        links={fi:[] for fi in incident}
        for key,pair in incidences.items():
            if vertex in key:
                a,b=pair[0][0],pair[1][0];links[a].append(b);links[b].append(a)
        seen=set();queue=[next(iter(incident))]
        while queue:
            face=queue.pop()
            if face in seen:continue
            seen.add(face);queue.extend(links[face])
        if seen!=incident or any(len(v)!=2 for v in links.values()):
            raise GeometryError(f'Vertex {vertex} has a pinched or nonmanifold shell link.')
    return original,[normal*signs[i] for i,normal in enumerate(normals)],embedding


@lru_cache(maxsize=512)
def _triangles_cached(key):
    q=np.asarray(key,dtype=float);q=q if _signed_area(q)>0 else q[::-1]
    scale=max(float(np.max(np.ptp(q,axis=0))),1e-15);local=(q-q[0])/scale
    ids=list(range(len(q)));result=[];eps=1e-12
    # Collinear boundary vertices are unnecessary for overlap triangles but
    # remain present in the face record and physical hinge geometry.
    changed=True
    while changed and len(ids)>3:
        changed=False
        for j,b in enumerate(ids):
            a,c=ids[j-1],ids[(j+1)%len(ids)]
            if abs(_cross(local[b]-local[a],local[c]-local[b]))<=eps:
                ids.pop(j);changed=True;break
    while len(ids)>3:
        found=False
        for j,b in enumerate(ids):
            a,c=ids[j-1],ids[(j+1)%len(ids)]
            if _cross(local[b]-local[a],local[c]-local[b])<=eps:continue
            def inside(k):
                p=local[k];return all(_cross(v-u,p-u)>=-eps for u,v in ((local[a],local[b]),(local[b],local[c]),(local[c],local[a])))
            if any(inside(k) for k in ids if k not in (a,b,c)):continue
            result.append(q[[a,b,c]]);ids.pop(j);found=True;break
        if not found:raise GeometryError('Simple-face overlap triangulation exceeded numerical tolerance; no overlap claim was made.')
    result.append(q[ids]);return tuple(result)


def polygon_overlap(a,b,tolerance=1e-7):
    a=np.asarray(a);b=np.asarray(b)
    if np.any(np.minimum(a.max(axis=0),b.max(axis=0))-np.maximum(a.min(axis=0),b.min(axis=0))<=tolerance):return False
    first=_triangles_cached(tuple(map(tuple,a)));second=_triangles_cached(tuple(map(tuple,b)))
    return any(convex_overlap(x,y,tolerance) for x in first for y in second)


def generalized_tabs(net):
    result=[];tabbed=set()
    if not net.get('tabs'):return result
    for face in net['faces']:
        p=np.asarray(face['points']);sign=1 if _signed_area(p)>0 else -1
        for i,edge in enumerate(face['edges']):
            if edge['hinge'] or edge['id'] in tabbed:continue
            tabbed.add(edge['id']);a,b=p[i],p[(i+1)%len(p)];length=np.linalg.norm(b-a);u=(b-a)/length
            outward=sign*np.array([u[1],-u[0]]);depth=min(4,float(length)/5)
            result.append({'face':face['id'],'edge':edge['id'],'points':np.asarray([a,a+u*depth+outward*depth,b-u*depth+outward*depth,b]).tolist()})
    return result


def source_triangles(records):
    result=[]
    for face in records:
        points=np.asarray(face['points']);indices={tuple(p):i for i,p in enumerate(points)}
        for triangle in _triangles_cached(tuple(map(tuple,points))):
            result.append({'face':face['id'],'sourceVertices':[face['sourceVertices'][indices[tuple(p)]] for p in triangle]})
    return result


def unfold_generalized(model, root=0, edge_length_mm=25, tabs=True, hinges=None, cut_edges=None, placements=None, element_annotations=None, tab_options=None):
    if tab_options is not None:
        from .net_tabs import unfold_tabbed
        return unfold_tabbed(model,tab_options,root=root,edge_length_mm=edge_length_mm,tabs=tabs,hinges=hinges,cut_edges=cut_edges,placements=placements,element_annotations=element_annotations)
    if element_annotations is not None:
        from .element_annotations import validate_document
        validate_document(element_annotations, model)
    original,normals,source_embedding=_shell_geometry(model)
    span=float(np.max(np.ptp(original,axis=0)))
    p=(original-original.mean(axis=0))/span
    faces=model['faces']
    if type(root) is not int or not 0 <= root < len(faces) or len(faces)>250:
        raise GeometryError('Choose an existing root face. Net limit is 250 faces.')
    if not math.isfinite(edge_length_mm) or not 1 <= edge_length_mm <= 1000:
        raise GeometryError('Physical reference-edge length must be 1–1,000 mm.')
    edge_lookup={tuple(sorted(e)):i for i,e in enumerate(model['edges'])}
    adjacency={}
    for fi,f in enumerate(faces):
        for a,b in zip(f,f[1:]+f[:1]):
            adjacency.setdefault(tuple(sorted((a,b))),[]).append(fi)
    if any(len(v)!=2 for v in adjacency.values()):raise GeometryError('Net requires exactly two source faces at each edge.')
    def edge_ids(value,label):
        if value is None:return None
        if not isinstance(value,list) or any(type(i) is not int or not 0<=i<len(model['edges']) for i in value) or len(set(value))!=len(value):
            raise GeometryError(label+' must be distinct existing source edge IDs.')
        return set(value)
    selected=edge_ids(hinges,'Hinges');excluded=edge_ids(cut_edges,'Cuts') or set()
    if selected is not None and selected&excluded:raise GeometryError('An edge cannot be both a requested hinge and a requested cut.')
    if selected is not None:
        representatives=list(range(len(faces)))
        def component(i):
            while representatives[i]!=i:i=representatives[i]
            return i
        for edge in sorted(selected):
            a,b=adjacency[tuple(sorted(model['edges'][edge]))];ra,rb=component(a),component(b)
            if ra==rb:raise GeometryError('Hinges form a cycle. Cut an existing hinge before joining this edge; flat forest nets require acyclic connections.')
            representatives[ra]=rb
    coords={};parents={};parent_edges={};fold_angles={};transforms={};components=[];traversal=[];chosen=[]
    for component_root in [root]+[i for i in range(len(faces)) if i!=root]:
        if component_root in coords:continue
        f=faces[component_root];u=p[f[1]]-p[f[0]];u/=np.linalg.norm(u)
        n=normals[component_root];v=np.cross(n,u);r=np.asarray([u,v,n]);t=-r@p[f[0]]
        transforms[component_root]=(r,t);coords[component_root]=(p[f]@r.T+t)[:,:2]
        parents[component_root]=None;parent_edges[component_root]=None;fold_angles[component_root]=0
        queue=[component_root];members=[]
        while queue:
            parent=queue.pop(0);traversal.append(parent);members.append(parent)
            pr,pt=transforms[parent]
            for a,b in zip(faces[parent],faces[parent][1:]+faces[parent][:1]):
                key=tuple(sorted((a,b)));edge=edge_lookup[key]
                if edge in excluded or selected is not None and edge not in selected:continue
                for child in adjacency[key]:
                    if child in coords:continue
                    # Always use source edge ordering so fold signs survive
                    # face orientation changes and independent tree roots.
                    a,b=model['edges'][edge];anchor=pr@p[a]+pt
                    axis=pr@(p[b]-p[a]);axis/=np.linalg.norm(axis)
                    child_normal=pr@normals[child];target_normal=pr@normals[parent]
                    angle=math.atan2(float(axis@np.cross(child_normal,target_normal)),float(np.clip(child_normal@target_normal,-1,1)))
                    rotation=Rotation.from_rotvec(axis*angle).as_matrix()
                    cr=rotation@pr;ct=rotation@(pt-anchor)+anchor
                    transforms[child]=(cr,ct);coords[child]=(p[faces[child]]@cr.T+ct)[:,:2]
                    parents[child]=parent;parent_edges[child]=edge;fold_angles[child]=-angle
                    chosen.append(edge);queue.append(child)
        components.append({'root':component_root,'faces':members})
    if selected is not None and set(chosen)!=selected:raise GeometryError('Requested hinge forest could not be reconstructed.')
    reference=model['edges'][0]
    normalized_factor=edge_length_mm/np.linalg.norm(p[reference[0]]-p[reference[1]])
    factor=normalized_factor/span
    coords={k:v*normalized_factor for k,v in coords.items()}
    transforms={k:(r,t*normalized_factor) for k,(r,t) in transforms.items()}
    target=p*normalized_factor
    # Deterministic separation supplies a usable layout for a forest. Explicit
    # component placements are rigid transforms relative to this base layout.
    cursor=0
    for item in components:
        points=np.concatenate([coords[i] for i in item['faces']]);low,high=points.min(axis=0),points.max(axis=0)
        shift=np.array([cursor-low[0],-low[1]]) if len(components)>1 else np.zeros(2)
        for i in item['faces']:
            coords[i]+=shift;r,t=transforms[i];transforms[i]=(r,t+np.r_[shift,0])
        cursor+=high[0]-low[0]+10
    placements=[] if placements is None else placements
    if not isinstance(placements,list):raise GeometryError('Component placements must be a list of root/translation/angle records.')
    roots={c['root'] for c in components};seen=set()
    for placement in placements:
        if not isinstance(placement,dict) or type(placement.get('root')) is not int or placement['root'] not in roots or placement['root'] in seen:
            raise GeometryError('Each placement must name a distinct current component root.')
        seen.add(placement['root']);translation=np.asarray(placement.get('translation',[0,0]),dtype=float);angle=placement.get('angle',0)
        if translation.shape!=(2,) or not np.isfinite(translation).all() or not isinstance(angle,(int,float)) or not math.isfinite(angle):raise GeometryError('Placements require finite 2D translations in mm and finite angles in degrees.')
        rotation=Rotation.from_rotvec([0,0,math.radians(angle)]).as_matrix();shift=np.r_[translation,0]
        item=next(c for c in components if c['root']==placement['root'])
        for i in item['faces']:
            coords[i]=(np.column_stack((coords[i],np.zeros(len(coords[i]))))@rotation.T+shift)[:,:2]
            r,t=transforms[i];transforms[i]=(rotation@r,rotation@t+shift)
    for item in components:
        r,t=transforms[item['root']];inverse=r.T
        item['targetQuaternion']=Rotation.from_matrix(inverse).as_quat().tolist()
        item['targetTranslation']=(-inverse@t).tolist()
    components_by_face={i:c['root'] for c in components for i in c['faces']}
    pairs=[[a,b] for a in coords for b in coords if a<b and polygon_overlap(coords[a],coords[b],edge_length_mm*1e-8)]
    records=[{'id':i,'sourceVertices':faces[i],'points':coords[i].tolist(),'parent':parents[i],
              'parentHinge':parent_edges[i],'foldAngle':fold_angles[i],'component':components_by_face[i],
              'edges':[{'id':edge_lookup[tuple(sorted((a,b)))],'hinge':edge_lookup[tuple(sorted((a,b)))] in chosen} for a,b in zip(faces[i],faces[i][1:]+faces[i][:1])]} for i in sorted(coords)]
    all_points=np.concatenate(list(coords.values()))
    bounds=[all_points.min(axis=0).tolist(),all_points.max(axis=0).tolist()]
    result={'faces':records,'hinges':chosen,'overlapPairs':pairs,'hasOverlap':bool(pairs),'bounds':bounds,
            'scale':factor,'referenceEdge':0,'referenceEdgeLengthMm':edge_length_mm,'units':'mm','tabs':bool(tabs),
            'root':root,'placements':deepcopy(placements),'components':components,'traversalOrder':traversal,'sourceEdges':model['edges'],
            'targetVertices':target.tolist(),'sourceFingerprint':identity(model),'algorithmVersion':'generalized-face-nets-0.23.0',
            'sourceId':model['id'],'algorithm':'source-cycle coherent-normal rigid-face hinge forest','status':'face overlap detected; rearrangement required' if pairs else 'no simple-face interior overlaps detected',
            'sourceFaceCount':len(faces),'validation':{'allFacesRepresented':len(coords)==len(faces),'areaPreserved':all(abs(polygon_area(p[faces[i]])*normalized_factor**2-polygon_area(coords[i]))<1e-7*max(1,polygon_area(coords[i])) for i in coords)}}
    result['sourceEmbedding']=source_embedding
    result['domain']='closed orientable 3D shells with simple planar faces; intersections between distinct source faces are not certified'
    result['fillSemantics']='simple-planar-source-faces'
    result['faceTriangles']=source_triangles(records)
    result['tabRecords']=generalized_tabs(result)
    result['foldValidation']=fold_net(result,1)['validation']
    tab_polygons=generalized_tabs(result);tab_pairs=[]
    for index,tab in enumerate(tab_polygons):
        for face in result['faces']:
            if polygon_overlap(np.asarray(tab['points']),np.asarray(face['points']),edge_length_mm*1e-8):
                tab_pairs.append({'edge':tab['edge'],'face':face['id']})
        for other in tab_polygons[index+1:]:
            if polygon_overlap(np.asarray(tab['points']),np.asarray(other['points']),edge_length_mm*1e-8):tab_pairs.append({'edge':tab['edge'],'otherTabEdge':other['edge']})
    result['tabOverlapPairs']=tab_pairs;result['hasTabOverlap']=bool(tab_pairs)
    if not result['foldValidation']['endpointReconstructed']:raise GeometryError('Net folding endpoint did not reconstruct the source coordinates.')
    if element_annotations is not None:
        result['elementAnnotations'] = deepcopy(element_annotations)
    from .net_color_printing import attach_print_source
    attach_print_source(result,model)
    return result



def unfold_source(model, **params):
    if model.get('interpretation') == 'convex-polytope':
        return convex_unfold(model, **params)
    return unfold_generalized(model, **params)

def reconstruct_source_net(model,net):
    if net.get('sourceId')!=model.get('id') or net.get('sourceFingerprint')!=identity(model):raise GeometryError('Net source changed; generate a new net before editing or folding.')
    return unfold_source(model,root=net['root'],edge_length_mm=net['referenceEdgeLengthMm'],tabs=net['tabs'],hinges=net['hinges'],placements=net.get('placements',[]),element_annotations=net.get('elementAnnotations'),tab_options=net.get('tabOptions'))


def edit_source_net(model,net,action,edge=None,component=None,translation=None,angle=0,tabs=None,tab_options=None):
    if net.get('tabOptions') is not None or action=='set-tab-options':
        from .net_tabs import edit_tabbed
        return edit_tabbed(model,net,action,tab_options=tab_options,edge=edge,component=component,translation=translation,angle=angle,tabs=tabs)
    net=reconstruct_source_net(model,net);hinges=list(net['hinges']);targets={f['id']:np.asarray(f['points']) for f in net['faces']}
    if action=='toggle-edge':
        if type(edge) is not int or not 0<=edge<len(model['edges']):raise GeometryError('Choose an existing source edge.')
        if edge in hinges:hinges.remove(edge)
        else:hinges.append(edge)
    elif action=='move-component':
        item=next((c for c in net['components'] if c['root']==component),None)
        delta=np.asarray([0,0] if translation is None else translation,dtype=float)
        if type(component) is not int or item is None or delta.shape!=(2,) or not np.isfinite(delta).all() or not isinstance(angle,(int,float)) or not math.isfinite(angle):raise GeometryError('Choose a component root and finite translation/rotation.')
        center=np.concatenate([targets[i] for i in item['faces']]).mean(axis=0)
        r=Rotation.from_rotvec([0,0,math.radians(angle)]).as_matrix()[:2,:2]
        for i in item['faces']:targets[i]=(targets[i]-center)@r.T+center+delta
    elif action!='set-tabs':raise GeometryError('Net edits are toggle-edge, move-component, or set-tabs.')
    base=unfold_source(model,root=net['root'],edge_length_mm=net['referenceEdgeLengthMm'],tabs=net['tabs'] if tabs is None else bool(tabs),hinges=hinges,element_annotations=net.get('elementAnnotations'))
    placements=[]
    for item in base['components']:
        i=item['root'];p=np.asarray(base['faces'][i]['points']);q=targets[i]
        u,v=p[1]-p[0],q[1]-q[0];theta=math.atan2(float(np.cross(u,v)),float(u@v))
        r=Rotation.from_rotvec([0,0,theta]).as_matrix()[:2,:2]
        placements.append({'root':i,'angle':math.degrees(theta),'translation':(q[0]-r@p[0]).tolist()})
    return unfold_source(model,root=net['root'],edge_length_mm=net['referenceEdgeLengthMm'],tabs=base['tabs'],hinges=hinges,placements=placements,element_annotations=net.get('elementAnnotations'))

