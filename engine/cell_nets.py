"""Whole-cell 3D arrangements of convex 4D polytopes.

Cells rotate rigidly in 4D around shared 2-faces into one 3D hyperplane.
Complete cells and duplicate source incidences are retained. Intersections
between arranged cells are intentionally not removed or tested.
"""
from collections import defaultdict
from copy import deepcopy
import math
import numpy as np
from scipy.spatial.transform import Rotation
from .geometry import GeometryError,identity,TOLERANCE
from .operations import require_convex


def cell_net(model,root=0,connections=None,placements=None):
    if model.get('interpretation')!='convex-polytope':
        from .generalized_concave_cell_nets import ordinary_cell_net
        return ordinary_cell_net(model,root=root,connections=connections,placements=placements)
    require_convex(model)
    if model['dimension']!=4 or model['embeddingDimension']!=4:
        raise GeometryError('Whole-cell nets require a convex 4D source in intrinsic 4D coordinates.')
    cells=model['cells'];faces=model['faces'];original=np.asarray(model['vertices']);span=float(np.max(np.ptp(original,axis=0)))
    if type(root) is not int or not 0<=root<len(cells) or len(cells)>1024:
        raise GeometryError('Choose an existing root cell; current cell-net limit is 1,024 complete cells.')
    p=(original-original.mean(axis=0))/span
    vertices=[sorted({v for face in cell for v in faces[face]}) for cell in cells]
    adjacency=defaultdict(list)
    for i,cell in enumerate(cells):
        for face in cell:adjacency[face].append(i)
    if len(adjacency)!=len(faces) or any(len(ids)!=2 for ids in adjacency.values()):raise GeometryError('Each source face must join exactly two cells.')
    if connections is not None:
        if not isinstance(connections,list) or any(type(i) is not int or not 0<=i<len(faces) for i in connections) or len(set(connections))!=len(connections):raise GeometryError('Connections must be distinct source face IDs.')
        selected=set(connections);representatives=list(range(len(cells)))
        def find(i):
            while representatives[i]!=i:i=representatives[i]
            return i
        for face in selected:
            a,b=adjacency[face];ra,rb=find(a),find(b)
            if ra==rb:raise GeometryError('Cell connections form a cycle; cut a connection or reattach a non-root cell first.')
            representatives[ra]=rb
    else:selected=None
    normals=[]
    for ids in vertices:
        cloud=p[ids];_,_,vt=np.linalg.svd(cloud-cloud[0],full_matrices=False);normal=vt[-1]
        if normal@cloud.mean(axis=0)<0:normal=-normal
        normals.append(normal)
    coordinates={};transforms={};parents={};parent_faces={};components=[];chosen=[];traversal=[];residual=0
    for component_root in [root]+[i for i in range(len(cells)) if i!=root]:
        if component_root in coordinates:continue
        ids=vertices[component_root];_,_,vt=np.linalg.svd(p[ids]-p[ids[0]],full_matrices=False)
        matrix=np.vstack((vt[:3],normals[component_root]))
        if np.linalg.det(matrix)<0:matrix[2]*=-1
        translation=-matrix@p[ids[0]]
        transforms[component_root]=(matrix,translation);parents[component_root]=None;parent_faces[component_root]=None
        coordinates[component_root]=(p[ids]@matrix.T+translation)[:,:3]
        queue=[component_root];members=[]
        while queue:
            parent=queue.pop(0);traversal.append(parent);members.append(parent);pr,pt=transforms[parent]
            for face in cells[parent]:
                if selected is not None and face not in selected:continue
                for child in adjacency[face]:
                    if child in coordinates:continue
                    u=pr@normals[child];target=pr@normals[parent];cosine=float(np.clip(u@target,-1,1));v=target-cosine*u;sine=float(np.linalg.norm(v))
                    if sine<TOLERANCE:raise GeometryError('Adjacent cell planes have a numerically singular hinge rotation.')
                    v/=sine
                    rotation=np.eye(4)+(cosine-1)*(np.outer(u,u)+np.outer(v,v))+sine*(np.outer(v,u)-np.outer(u,v))
                    anchor=pr@p[faces[face][0]]+pt;cr=rotation@pr;ct=rotation@(pt-anchor)+anchor
                    transformed=p[vertices[child]]@cr.T+ct;residual=max(residual,float(np.max(abs(transformed[:,3]))))
                    if residual>TOLERANCE*16:raise GeometryError('Cell unfolding failed the common-hyperplane residual check.')
                    coordinates[child]=transformed[:,:3];transforms[child]=(cr,ct);parents[child]=parent;parent_faces[child]=face
                    chosen.append(face);queue.append(child)
        components.append({'root':component_root,'cells':members})
    if selected is not None and set(chosen)!=selected:raise GeometryError('Requested cell forest was not completely represented.')
    coordinates={i:q*span for i,q in coordinates.items()};cursor=0
    for component in components:
        cloud=np.concatenate([coordinates[i] for i in component['cells']]);low,high=cloud.min(axis=0),cloud.max(axis=0)
        shift=np.array([cursor-low[0],-low[1],-low[2]]) if len(components)>1 else np.zeros(3)
        for i in component['cells']:coordinates[i]+=shift
        cursor+=high[0]-low[0]+span*.5
    placements=[] if placements is None else placements
    if not isinstance(placements,list):raise GeometryError('Cell placements must be a list of component root, quaternion and translation records.')
    roots={c['root'] for c in components};seen=set()
    for item in placements:
        if not isinstance(item,dict) or type(item.get('root')) is not int or item['root'] not in roots or item['root'] in seen:raise GeometryError('Each cell placement must name a distinct current component root.')
        seen.add(item['root']);quaternion=np.asarray(item.get('quaternion',[0,0,0,1]),dtype=float);translation=np.asarray(item.get('translation',[0,0,0]),dtype=float)
        if quaternion.shape!=(4,) or translation.shape!=(3,) or not np.isfinite(quaternion).all() or not np.isfinite(translation).all() or np.linalg.norm(quaternion)<1e-12:raise GeometryError('Cell placements require a finite nonzero quaternion and finite 3D translation.')
        rotation=Rotation.from_quat(quaternion).as_matrix()
        for i in next(c['cells'] for c in components if c['root']==item['root']):coordinates[i]=coordinates[i]@rotation.T+translation
    component_by_cell={i:c['root'] for c in components for i in c['cells']};records=[];rigid_error=0;gaps=[]
    for i in range(len(cells)):
        ids=vertices[i];mapping={v:j for j,v in enumerate(ids)};cloud=coordinates[i]
        expected=p[ids]*span;rigid_error=max(rigid_error,float(np.max(abs(np.linalg.norm(cloud[:,None]-cloud[None,:],axis=2)-np.linalg.norm(expected[:,None]-expected[None,:],axis=2)))))
        records.append({'id':i,'sourceVertices':ids,'points':cloud.tolist(),'parent':parents[i],'parentFace':parent_faces[i],'component':component_by_cell[i],
                        'faces':[{'id':f,'vertices':[mapping[v] for v in faces[f]],'connected':f in chosen,'neighbor':next(j for j in adjacency[f] if j!=i)} for f in cells[i]]})
    for i,record in enumerate(records):
        if parents[i] is None:continue
        parent=records[parents[i]]
        for v in faces[parent_faces[i]]:gaps.append(float(np.linalg.norm(coordinates[i][vertices[i].index(v)]-coordinates[parent['id']][parent['sourceVertices'].index(v)])))
    tolerance=span*TOLERANCE*16
    if rigid_error>tolerance or max(gaps,default=0)>tolerance:raise GeometryError('Cell rigidity or connected-face joins failed the declared numerical tolerance.')
    cloud=np.concatenate(list(coordinates.values()))
    return {'cells':records,'connections':chosen,'components':components,'traversalOrder':traversal,'root':root,'placements':deepcopy(placements),
            'faceAdjacency':{str(i):adjacency[i] for i in sorted(adjacency)},'bounds':[cloud.min(axis=0).tolist(),cloud.max(axis=0).tolist()],
            'sourceId':model['id'],'sourceFingerprint':identity(model),'units':'model-units','numericMode':'float64-approximate','algorithmVersion':'0.4.0',
            'algorithm':'complete cells rotated around shared 2-faces into a common 3D hyperplane',
            'validation':{'allCellsRepresented':len(records)==len(cells),'rigidityPreserved':True,'connectedFacesJoined':True,'maxRigidDistanceError':rigid_error,
                          'maxConnectedFaceGap':max(gaps,default=0),'commonHyperplaneResidual':residual*span,'tolerance':tolerance,'cellIntersectionsChecked':False},
            'intersectionPolicy':'Complete intact cells retained; intersections between arranged cells are ignored.'}


def reconstruct_cell_net(model,net):
    if net.get('sourceId')!=model.get('id') or net.get('sourceFingerprint')!=identity(model):raise GeometryError('Cell net source changed; generate a new arrangement.')
    return cell_net(model,root=net['root'],connections=net['connections'],placements=net.get('placements',[]))


def edit_cell_net(model,net,action,face=None,moving_cell=None,component=None,translation=None,angles=None):
    net=reconstruct_cell_net(model,net);connections=list(net['connections']);targets={c['id']:np.asarray(c['points']) for c in net['cells']}
    if action in ('toggle-face','reattach-cell'):
        if type(face) is not int or not 0<=face<len(model['faces']):raise GeometryError('Choose an existing source face ID.')
        if action=='toggle-face':
            if face in connections:connections.remove(face)
            else:connections.append(face)
        else:
            neighbors=net['faceAdjacency'][str(face)]
            if type(moving_cell) is not int or moving_cell not in neighbors:raise GeometryError('The moving cell must be incident to the selected source face.')
            old=net['cells'][moving_cell]['parentFace']
            if old==face:return net
            if old is not None:connections.remove(old)
            connections.append(face)
    elif action=='move-component':
        item=next((c for c in net['components'] if c['root']==component),None)
        delta=np.asarray([0,0,0] if translation is None else translation,dtype=float);angles=np.asarray([0,0,0] if angles is None else angles,dtype=float)
        if type(component) is not int or item is None or delta.shape!=(3,) or angles.shape!=(3,) or not np.isfinite(delta).all() or not np.isfinite(angles).all():raise GeometryError('Choose a current cell component and finite XYZ translations/rotation angles.')
        center=np.concatenate([targets[i] for i in item['cells']]).mean(axis=0);r=Rotation.from_euler('xyz',angles,degrees=True).as_matrix()
        for i in item['cells']:targets[i]=(targets[i]-center)@r.T+center+delta
    else:raise GeometryError('Cell-net edits are toggle-face, reattach-cell or move-component.')
    base=cell_net(model,root=net['root'],connections=connections);placements=[]
    for item in base['components']:
        i=item['root'];p=np.asarray(base['cells'][i]['points']);q=targets[i];pc,qc=p.mean(axis=0),q.mean(axis=0)
        u,_,vt=np.linalg.svd((p-pc).T@(q-qc));r=vt.T@u.T
        if np.linalg.det(r)<0:raise GeometryError('Cell root alignment unexpectedly requires a reflection.')
        placements.append({'root':i,'quaternion':Rotation.from_matrix(r).as_quat().tolist(),'translation':(qc-r@pc).tolist()})
    return cell_net(model,root=net['root'],connections=connections,placements=placements)
