"""Editable rigid-face forests and folding for convex 3D boundaries.

Preserves face and source-edge identity. Overlap is detected and reported;
this algorithm does not promise a nonoverlapping net for arbitrary polyhedra.
"""
import math
import uuid
from copy import deepcopy
import numpy as np
from scipy.spatial.transform import Rotation
from .geometry import GeometryError, hull, polygon_area, identity, validate
from .operations import require_convex, record


def extract_entity(model, kind='cell', index=0):
    if type(index) is not int or not validate(model)['passed']:
        raise GeometryError('Extract an integer entity index from a validated source.')
    if kind == 'cell' and model['dimension'] == 4:
        if not 0 <= index < len(model['cells']):
            raise GeometryError('Cell index is outside this model.')
        ids = sorted(set(v for f in model['cells'][index] for v in model['faces'][f]))
        dim = 3
    elif kind == 'face':
        if not 0 <= index < len(model['faces']):
            raise GeometryError('Face index is outside this model.')
        ids = model['faces'][index]
        dim = 2
    else:
        raise GeometryError('Choose a 4D cell or a face.')
    p = np.asarray(model['vertices'])[ids]
    origin = p.mean(axis=0)
    _,_,vt = np.linalg.svd(p-origin,full_matrices=False)
    basis = vt[:dim].T
    if model.get('interpretation')=='convex-polytope':
        result = hull((p-origin)@basis,f'{kind.title()} {index} of {model["name"]}')
    else:
        mapping={v:i for i,v in enumerate(ids)}
        face_ids=model['cells'][index] if kind=='cell' else [index]
        faces=[[mapping[v] for v in model['faces'][f]] for f in face_ids]
        edges=sorted({tuple(sorted((a,b))) for f in faces for a,b in zip(f,f[1:]+f[:1])})
        result={'id':str(uuid.uuid4()),'name':f'{kind.title()} {index} of {model["name"]}',
                'dimension':dim,'embeddingDimension':dim,'interpretation':'generalized-complex',
                'vertices':((p-origin)@basis).tolist(),'edges':[list(e) for e in edges],'faces':faces,'cells':[],
                'numeric':{'mode':'float64-approximate','tolerance':1e-8,'certified':False},
                'metadata':{'faceInterpretation':'Source ordered cycles retained; no convexification or fill inferred'}}
        result['validation']=validate(result)
        if not result['validation']['passed']:raise GeometryError('Extracted source entity failed incidence checks.')
        result['fingerprint']=identity(result)
    result['metadata']['sourceEmbedding'] = {'origin':origin.tolist(),'basis':basis.tolist(),'sourceVertexIds':ids,
                                             'sourceFaceIds':model['cells'][index] if kind=='cell' else [index]}
    return record(result,model,'extract-'+kind,{'index':index})


def overlaps(a,b,tolerance=1e-7):
    for p in (a,b):
        for u,v in zip(p,np.roll(p,-1,axis=0)):
            edge=v-u
            axis=np.array([-edge[1],edge[0]])
            axis/=np.linalg.norm(axis)
            x,y=a@axis,b@axis
            if min(max(x),max(y))-max(min(x),min(y)) <= tolerance:
                return False
    return True


def unfold(model, root=0, edge_length_mm=25, tabs=True, hinges=None, cut_edges=None, placements=None, element_annotations=None, tab_options=None):
    if tab_options is not None:
        from .net_tabs import unfold_tabbed
        return unfold_tabbed(model,tab_options,root=root,edge_length_mm=edge_length_mm,tabs=tabs,hinges=hinges,cut_edges=cut_edges,placements=placements,element_annotations=element_annotations)
    if model.get('interpretation') != 'convex-polytope':
        from .generalized_nets import unfold_generalized
        return unfold_generalized(model,root=root,edge_length_mm=edge_length_mm,tabs=tabs,
            hinges=hinges,cut_edges=cut_edges,placements=placements,element_annotations=element_annotations)
    if element_annotations is not None:
        from .element_annotations import validate_document
        validate_document(element_annotations, model)
    require_convex(model)
    if model['dimension'] != 3:
        raise GeometryError('Face unfolding currently supports convex 3D polyhedra.')
    original=np.asarray(model['vertices'])
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
    normals=[]
    for face in faces:
        cloud=p[face];_,_,vt=np.linalg.svd(cloud-cloud[0],full_matrices=False);n=vt[-1]
        if np.dot(n,cloud.mean(axis=0))<0:n=-n
        normals.append(n)
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
    pairs=[(a,b) for a in coords for b in coords if a<b and overlaps(coords[a],coords[b],edge_length_mm*1e-8)]
    records=[{'id':i,'sourceVertices':faces[i],'points':coords[i].tolist(),'parent':parents[i],
              'parentHinge':parent_edges[i],'foldAngle':fold_angles[i],'component':components_by_face[i],
              'edges':[{'id':edge_lookup[tuple(sorted((a,b)))],'hinge':edge_lookup[tuple(sorted((a,b)))] in chosen} for a,b in zip(faces[i],faces[i][1:]+faces[i][:1])]} for i in sorted(coords)]
    all_points=np.concatenate(list(coords.values()))
    bounds=[all_points.min(axis=0).tolist(),all_points.max(axis=0).tolist()]
    result={'faces':records,'hinges':chosen,'overlapPairs':pairs,'hasOverlap':bool(pairs),'bounds':bounds,
            'scale':factor,'referenceEdge':0,'referenceEdgeLengthMm':edge_length_mm,'units':'mm','tabs':bool(tabs),
            'root':root,'placements':deepcopy(placements),'components':components,'traversalOrder':traversal,'sourceEdges':model['edges'],
            'targetVertices':target.tolist(),'sourceFingerprint':identity(model),'algorithmVersion':'0.3.0',
            'sourceId':model['id'],'algorithm':'rigid-face hinge forest','status':'face overlap detected; rearrangement required' if pairs else 'no convex-face interior overlaps detected',
            'sourceFaceCount':len(faces),'validation':{'allFacesRepresented':len(coords)==len(faces),'areaPreserved':all(abs(polygon_area(p[faces[i]])*normalized_factor**2-polygon_area(coords[i]))<1e-7*max(1,polygon_area(coords[i])) for i in coords)}}
    result['foldValidation']=fold_net(result,1)['validation']
    tab_polygons=tab_geometry(result);tab_pairs=[]
    for index,tab in enumerate(tab_polygons):
        for face in result['faces']:
            if face['id']!=tab['face'] and overlaps(np.asarray(tab['points']),np.asarray(face['points']),edge_length_mm*1e-8):
                tab_pairs.append({'edge':tab['edge'],'face':face['id']})
        for other in tab_polygons[index+1:]:
            if overlaps(np.asarray(tab['points']),np.asarray(other['points']),edge_length_mm*1e-8):tab_pairs.append({'edge':tab['edge'],'otherTabEdge':other['edge']})
    result['tabOverlapPairs']=tab_pairs;result['hasTabOverlap']=bool(tab_pairs)
    if not result['foldValidation']['endpointReconstructed']:raise GeometryError('Net folding endpoint did not reconstruct the source coordinates.')
    if element_annotations is not None:
        result['elementAnnotations'] = deepcopy(element_annotations)
    from .net_color_printing import attach_print_source
    attach_print_source(result,model)
    return result


def fold_net(net,fraction=1):
    """Rigid forest folding; separated roots return to common source positions."""
    if not isinstance(fraction,(int,float)) or not math.isfinite(fraction) or not 0<=fraction<=1:raise GeometryError('Fold fraction must be finite in [0,1].')
    target=np.asarray(net['targetVertices']);faces={f['id']:f for f in net['faces']};transforms={};points={}
    roots={c['root']:c for c in net['components']}
    for i in net['traversalOrder']:
        face=faces[i];parent=face['parent'];flat=np.column_stack((face['points'],np.zeros(len(face['points']))))
        if parent is None:
            item=roots[i];rotation=Rotation.from_rotvec(Rotation.from_quat(item['targetQuaternion']).as_rotvec()*fraction).as_matrix()
            translation=np.asarray(item['targetTranslation'])*fraction
        else:
            pr,pt=transforms[parent];parent_face=faces[parent];a,b=net['sourceEdges'][face['parentHinge']]
            source_flat=np.column_stack((parent_face['points'],np.zeros(len(parent_face['points']))))
            aa=pr@source_flat[parent_face['sourceVertices'].index(a)]+pt
            bb=pr@source_flat[parent_face['sourceVertices'].index(b)]+pt
            axis=bb-aa;axis/=np.linalg.norm(axis)
            r=Rotation.from_rotvec(axis*face['foldAngle']*fraction).as_matrix()
            rotation=r@pr;translation=r@(pt-aa)+aa
        transforms[i]=(rotation,translation);points[i]=flat@rotation.T+translation
    endpoint=max(float(np.max(np.linalg.norm(points[i]-target[faces[i]['sourceVertices']],axis=1))) for i in faces)
    rigidity=max(float(np.max(np.abs(np.linalg.norm(points[i][:,None]-points[i][None,:],axis=2)-np.linalg.norm(np.asarray(faces[i]['points'])[:,None]-np.asarray(faces[i]['points'])[None,:],axis=2)))) for i in faces)
    gaps=[]
    for i,face in faces.items():
        if face['parent'] is None:continue
        parent=faces[face['parent']]
        for v in net['sourceEdges'][face['parentHinge']]:gaps.append(float(np.linalg.norm(points[i][face['sourceVertices'].index(v)]-points[parent['id']][parent['sourceVertices'].index(v)])))
    tolerance=net['referenceEdgeLengthMm']*1e-7
    return {'fraction':fraction,'units':'mm','faces':[{'id':i,'sourceVertices':faces[i]['sourceVertices'],'points':points[i].tolist(),'component':faces[i]['component']} for i in sorted(faces)],
            'sourceFingerprint':net['sourceFingerprint'],'algorithm':'rigid signed-dihedral hinge rotations; root rigid-pose interpolation',
            'validation':{'maxRigidDistanceErrorMm':rigidity,'maxHingeGapMm':max(gaps,default=0),'maxEndpointErrorMm':endpoint,
                          'rigidityPreserved':rigidity<=tolerance,'hingesJoined':max(gaps,default=0)<=tolerance,
                          'endpointReconstructed':fraction==1 and endpoint<=tolerance,'toleranceMm':tolerance,
                          'collisionChecked':False}}


def reconstruct_net(model,net):
    if net.get('sourceFingerprint')!=identity(model):raise GeometryError('Net source changed; generate a new net before editing or folding.')
    return unfold(model,root=net['root'],edge_length_mm=net['referenceEdgeLengthMm'],tabs=net['tabs'],hinges=net['hinges'],placements=net.get('placements',[]),element_annotations=net.get('elementAnnotations'),tab_options=net.get('tabOptions'))


def edit_net(model,net,action,edge=None,component=None,translation=None,angle=0,tabs=None,tab_options=None):
    if net.get('tabOptions') is not None or action=='set-tab-options':
        from .net_tabs import edit_tabbed
        return edit_tabbed(model,net,action,tab_options=tab_options,edge=edge,component=component,translation=translation,angle=angle,tabs=tabs)
    net=reconstruct_net(model,net);hinges=list(net['hinges']);targets={f['id']:np.asarray(f['points']) for f in net['faces']}
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
    base=unfold(model,root=net['root'],edge_length_mm=net['referenceEdgeLengthMm'],tabs=net['tabs'] if tabs is None else bool(tabs),hinges=hinges,element_annotations=net.get('elementAnnotations'))
    placements=[]
    for item in base['components']:
        i=item['root'];p=np.asarray(base['faces'][i]['points']);q=targets[i]
        u,v=p[1]-p[0],q[1]-q[0];theta=math.atan2(float(np.cross(u,v)),float(u@v))
        r=Rotation.from_rotvec([0,0,theta]).as_matrix()[:2,:2]
        placements.append({'root':i,'angle':math.degrees(theta),'translation':(q[0]-r@p[0]).tolist()})
    return unfold(model,root=net['root'],edge_length_mm=net['referenceEdgeLengthMm'],tabs=base['tabs'],hinges=hinges,placements=placements,element_annotations=net.get('elementAnnotations'))


def tab_geometry(net):
    result=[];tabbed=set()
    if not net.get('tabs'):return result
    if 'tabRecords' in net:return deepcopy(net['tabRecords'])
    for face in net['faces']:
        p=np.asarray(face['points']);center=p.mean(axis=0)
        for i,edge in enumerate(face['edges']):
            if edge['hinge'] or edge['id'] in tabbed:continue
            tabbed.add(edge['id']);a,b=p[i],p[(i+1)%len(p)];length=np.linalg.norm(b-a);u=(b-a)/length
            outward=np.array([u[1],-u[0]])
            if np.dot(outward,(a+b)/2-center)<0:outward=-outward
            depth=min(4,float(length)/5);ta,tb=a+u*depth+outward*depth,b-u*depth+outward*depth
            result.append({'face':face['id'],'edge':edge['id'],'points':np.asarray([a,ta,tb,b]).tolist()})
    return result


def net_svg(net):
    if net.get('elementAnnotations') is not None:
        from .element_annotations import annotated_net_svg
        document = net['elementAnnotations']
        svg, _ = annotated_net_svg(document, document['source'], net,
                                  expected_face_ids=net.get('annotationFaceIds'))
        return svg
    low,high=np.asarray(net['bounds']); margin=8
    width,height=high-low+2*margin
    out=[f'<svg xmlns="http://www.w3.org/2000/svg" width="{width:.8g}mm" height="{height:.8g}mm" viewBox="0 0 {width:.8g} {height:.8g}">',
         '<metadata>Intrinsic face net; dimensions in mm. '+net['status']+f'. Tab overlap pairs: {len(net.get("tabOverlapPairs",[]))}. Print at 100%.</metadata>',
         '<rect width="100%" height="100%" fill="white"/>']
    tab_lookup={(t['edge'],t['face']):t for t in tab_geometry(net)}
    warned={p['edge'] for p in net.get('tabOverlapPairs',[])}|{p['otherTabEdge'] for p in net.get('tabOverlapPairs',[]) if 'otherTabEdge' in p}
    component=None
    for face in sorted(net['faces'],key=lambda f:(f['component'],f['id'])):
        if component!=face['component']:
            if component is not None:out.append('</g>')
            component=face['component'];out.append(f'<g data-net-component="{component}">')
        p=np.asarray(face['points'])-low+margin
        points=' '.join(f'{x:.8g},{y:.8g}' for x,y in p)
        out.append(f'<g data-net-face="{face["id"]}" data-component="{component}"><polygon points="{points}" fill="#e6f5f0" stroke="none"/>')
        center=p.mean(axis=0)
        out.append(f'<text x="{center[0]:.8g}" y="{center[1]:.8g}" font-size="3" text-anchor="middle" fill="#28534d" pointer-events="none">F{face["id"]}</text>')
        for i,edge in enumerate(face['edges']):
            a,b=p[i],p[(i+1)%len(p)]
            mid=(a+b)/2
            u=(b-a)/np.linalg.norm(b-a);outward=np.array([u[1],-u[0]])
            if net.get('fillSemantics')=='simple-planar-source-faces':
                if np.sum(p[:,0]*np.roll(p[:,1],-1)-p[:,1]*np.roll(p[:,0],-1))<0:outward=-outward
            elif np.dot(outward,mid-center)<0:outward=-outward
            label=mid-outward*2
            style='stroke="#359da6" stroke-dasharray="1.5 1"' if edge['hinge'] else 'stroke="#243942"'
            out.append(f'<path d="M {a[0]:.8g} {a[1]:.8g} L {b[0]:.8g} {b[1]:.8g}" {style} stroke-width="0.22"/>')
            out.append(f'<path data-net-edge="{edge["id"]}" d="M {a[0]:.8g} {a[1]:.8g} L {b[0]:.8g} {b[1]:.8g}" fill="none" stroke="transparent" stroke-width="2.5"/>')
            if not edge['hinge']:
                out.append(f'<text x="{label[0]:.8g}" y="{label[1]:.8g}" text-anchor="middle" font-size="1.9" fill="#476374" pointer-events="none">E{edge["id"]}</text>')
                tab=tab_lookup.get((edge['id'],face['id']))
                if tab and tab['face']==face['id']:
                    a,ta,tb,b=np.asarray(tab['points'])-low+margin
                    color='#ba743c' if edge['id'] in warned else '#82958f'
                    out.append(f'<path data-net-tab="{edge["id"]}" d="M {a[0]:.8g} {a[1]:.8g} L {ta[0]:.8g} {ta[1]:.8g} L {tb[0]:.8g} {tb[1]:.8g} L {b[0]:.8g} {b[1]:.8g}" fill="none" stroke="{color}" stroke-width="0.18"/>')
        out.append('</g>')
    if component is not None:out.append('</g>')
    out.append('</svg>')
    return '\n'.join(out)
