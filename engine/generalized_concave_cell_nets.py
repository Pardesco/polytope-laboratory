"""Rigid nets of intact ordinary cell boundary shells, including nonconvex cells.

Source cycles define local and global orientation. No hull, replacement cell,
collision removal, or filled-volume certification is involved.
"""
from collections import defaultdict
from copy import deepcopy
import math
import numpy as np
from scipy.spatial.transform import Rotation
from .geometry import GeometryError,identity,TOLERANCE,validate
from .generalized_nets import _simple,_shell_geometry,source_triangles
from .generalized_cell_nets import _connected

EPS=TOLERANCE


def _face_frame(p,ids):
    cloud=p[ids];relative=cloud-cloud[0];u=relative[1]
    length=float(np.linalg.norm(u))
    if length<=EPS:raise GeometryError('A source face has a zero-length first edge.')
    u=u/length;residual=relative-np.outer(relative@u,u)
    v=residual[np.argmax(np.linalg.norm(residual,axis=1))];length=float(np.linalg.norm(v))
    if length<=EPS:raise GeometryError('A source face is degenerate.')
    v=v/length
    if np.max(np.linalg.norm(residual-np.outer(residual@v,v),axis=1))>EPS:
        raise GeometryError('Ordinary cell nets require planar source face cycles.')
    xy=np.column_stack((relative@u,relative@v));_simple(xy,ids)
    return u,v,xy


def qualify_cell_shells(model):
    if model.get('dimension')!=4 or model.get('embeddingDimension')!=4 or not validate(model)['passed']:
        raise GeometryError('Ordinary cell nets require validated intrinsic 4D coordinates/incidence.')
    cells=model['cells'];faces=model['faces'];original=np.asarray(model['vertices'],dtype=float)
    if not cells or len(cells)>1024 or any(len(c)>250 for c in cells) or any(len(f)>128 for f in faces) or sum(map(len,faces))>100000:
        raise GeometryError('Ordinary cell limits: 1,024 cells, 250 faces per cell, 128 vertices per face and 100,000 face-boundary vertices.')
    span=float(np.max(np.ptp(original,axis=0)))
    if span<=0:raise GeometryError('Source has no metric extent.')
    p=(original-original.mean(axis=0))/span
    if np.linalg.matrix_rank(p-p[0],EPS)!=4:raise GeometryError('Source does not span intrinsic affine dimension four.')
    cell_vertices=[sorted({v for f in cell for v in faces[f]}) for cell in cells]
    if any(len(ids)>256 for ids in cell_vertices) or sum(map(len,cell_vertices))>20000:
        raise GeometryError('Ordinary cell limit: 256 vertices per cell and 20,000 cell-vertex incidences.')
    frames=[_face_frame(p,face) for face in faces];adjacency=[[] for _ in faces];raw=[];orientations={};inwards={};records=[];full_convex=[]
    source_edges={tuple(sorted(e)) for e in model['edges']};used_edges=set();used_vertices=set()
    for ci,(cell,ids) in enumerate(zip(cells,cell_vertices)):
        cloud=p[ids];relative=cloud-cloud[0];_,s,axes=np.linalg.svd(relative,full_matrices=False)
        if s[2]<=EPS or s[3]>EPS:raise GeometryError(f'Source cell {ci} must have affine dimension three.')
        normal=axes[-1];basis=axes[:3].T;raw.append(normal);mapping={v:i for i,v in enumerate(ids)}
        local=(cloud-cloud.mean(axis=0))@basis
        local_faces=[[mapping[v] for v in faces[fi]] for fi in cell]
        local_edges=sorted({tuple(sorted((a,b))) for f in local_faces for a,b in zip(f,f[1:]+f[:1])})
        if sum(map(len,local_faces))>4000:raise GeometryError('Ordinary cell limit: 4,000 local face-boundary vertices per source cell.')
        local_model={'dimension':3,'embeddingDimension':3,'interpretation':'generalized-complex','vertices':local.tolist(),'edges':[list(e) for e in local_edges],'faces':local_faces,'cells':[]}
        _,normals,_=_shell_geometry(local_model)
        # Planar-face divergence integral, directly from complete ordered face
        # cycles. This scalar chooses boundary orientation; no replacement
        # triangles/cells or source volume certificate are constructed.
        areas=[float(np.linalg.norm(np.sum(np.cross(local[f],np.roll(local[f],-1,axis=0)),axis=0)))/2 for f in local_faces]
        terms=[float(local[f[0]]@n)*a/3 for f,n,a in zip(local_faces,normals,areas)]
        volume=math.fsum(terms);uncertainty=max(EPS**2*float(np.max(np.ptp(local,axis=0)))**3,np.finfo(float).eps*math.fsum(map(abs,terms))*64)
        if abs(volume)<=uncertainty:raise GeometryError(f'Source cell {ci} has zero or numerically unresolved oriented boundary volume.')
        normals=[n*(1 if volume>0 else -1) for n in normals]
        edge_faces=defaultdict(list);supports=set();convex=True;complete_facets=True
        for fi,f,n in zip(cell,local_faces,normals):
            adjacency[fi].append(ci);u,v,_=frames[fi];inward=-basis@n;inwards[(ci,fi)]=inward
            orientation=float(np.linalg.det(np.column_stack((u,v,inward,normal))))
            if abs(orientation)<.5:raise GeometryError('Cell/face orientation is numerically unresolved.')
            orientations[(ci,fi)]=1 if orientation>0 else -1
            signed=(cloud-p[faces[fi][0]])@inward
            convex=convex and bool(min(signed)>=-EPS*4)
            support={ids[i] for i,x in enumerate(signed) if abs(x)<=EPS*4}
            complete_facets=complete_facets and support==set(faces[fi]) and frozenset(support) not in supports
            supports.add(frozenset(support))
            for a,b in zip(faces[fi],faces[fi][1:]+faces[fi][:1]):edge_faces[tuple(sorted((a,b)))].append(fi)
        links={fi:[] for fi in cell}
        for pair in edge_faces.values():a,b=pair;links[a].append(b);links[b].append(a)
        if not _connected(cell,links):raise GeometryError(f'Source cell {ci} has disconnected boundary shells; multiply shelled cells are unsupported.')
        euler=len(ids)-len(edge_faces)+len(cell);full_convex.append(convex and complete_facets and euler==2)
        records.append({'id':ci,'sourceFaceIds':list(cell),'boundaryEulerCharacteristic':euler,'convexBoundary':convex,'orientationVolume':abs(volume)*span**3,'orientationVolumeCertified':False,'simplePlanarFaces':True,'connectedOrientableBoundary':True})
        used_edges.update(edge_faces);used_vertices.update(ids)
    if used_edges!=source_edges or used_vertices!=set(range(len(p))) or any(len(c)!=2 or c[0]==c[1] for c in adjacency):
        raise GeometryError('Closed cell shells require exactly two distinct cells per source face and no unused source entities.')
    neighbors=[[] for _ in cells]
    for fi,(a,b) in enumerate(adjacency):
        relation=-orientations[(a,fi)]*orientations[(b,fi)]
        neighbors[a].append((b,relation));neighbors[b].append((a,relation))
    signs={}
    for root in range(len(cells)):
        if root in signs:continue
        signs[root]=1;queue=[root]
        while queue:
            parent=queue.pop()
            for child,relation in neighbors[parent]:
                wanted=signs[parent]*relation
                if child in signs:
                    if signs[child]!=wanted:raise GeometryError('Source cell shell is nonorientable; coherent whole-cell nets are unavailable.')
                else:signs[child]=wanted;queue.append(child)
    face_edges=[{tuple(sorted((a,b))) for a,b in zip(f,f[1:]+f[:1])} for f in faces]
    for edge in source_edges:
        incident=[fi for fi,edges in enumerate(face_edges) if edge in edges];nodes={c for fi in incident for c in adjacency[fi]};links={c:[] for c in nodes}
        for fi in incident:a,b=adjacency[fi];links[a].append(b);links[b].append(a)
        if any(len(v)!=2 for v in links.values()) or not _connected(nodes,links):raise GeometryError('Source edge has a pinched/nonmanifold cell link.')
    for vertex in used_vertices:
        incident=[fi for fi,f in enumerate(faces) if vertex in f];nodes={c for fi in incident for c in adjacency[fi]};links={c:[] for c in nodes}
        for fi in incident:a,b=adjacency[fi];links[a].append(b);links[b].append(a)
        if sum(vertex in e for e in source_edges)-len(incident)+len(nodes)!=2 or not _connected(nodes,links):
            raise GeometryError('Source vertex has a pinched/nonmanifold cell link.')
    triangles=source_triangles([{'id':i,'points':frames[i][2].tolist(),'sourceVertices':face} for i,face in enumerate(faces)])
    return {'normals':[n*signs[i] for i,n in enumerate(raw)],'inwards':inwards,'cells':records,'nonconvexCells':sum(not r['convexBoundary'] for r in records),'allFullConvexCells':all(full_convex),'faceTriangles':triangles}


def _ordinary_cell_net(model,qualification,root=0,connections=None,placements=None):
    cells=model['cells'];faces=model['faces'];original=np.asarray(model['vertices'],dtype=float);span=float(np.max(np.ptp(original,axis=0)))
    normals=qualification['normals'];inwards=qualification['inwards']
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
                    if sine<TOLERANCE:
                        cosine=1. if cosine>0 else -1.;sine=0.
                        v=pr@inwards[(parent,face)];v-=u*float(u@v);v/=np.linalg.norm(v)
                    else:v/=sine
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
    result={'cells':records,'connections':chosen,'components':components,'traversalOrder':traversal,'root':root,'placements':deepcopy(placements),
            'faceAdjacency':{str(i):adjacency[i] for i in sorted(adjacency)},'bounds':[cloud.min(axis=0).tolist(),cloud.max(axis=0).tolist()],
            'sourceId':model['id'],'sourceFingerprint':identity(model),'units':'model-units','numericMode':'float64-approximate','algorithmVersion':'generalized-concave-cell-nets-0.24.0',
            'domain':'closed orientable intrinsic 4D cell shell; intact ordinary 3D cells with simple planar face boundaries',
            'cellQualification':{'sourceCellsPreserved':True,'sourceFaceCyclesPreserved':True,'shellCellsChecked':len(cells),'nonconvexCellsRepresented':qualification['nonconvexCells'],'globalConvexityRequired':False,'cellConvexityRequired':False,'hullReplacementUsed':False,'replacementCellsUsed':False,'cellBoundaryEmbeddednessChecked':False},
            'cellShellQualifications':qualification['cells'],
            'algorithm':'complete cells rotated around shared 2-faces into a common 3D hyperplane',
            'validation':{'allCellsRepresented':len(records)==len(cells),'rigidityPreserved':True,'connectedFacesJoined':True,'maxRigidDistanceError':rigid_error,
                          'maxConnectedFaceGap':max(gaps,default=0),'commonHyperplaneResidual':residual*span,'tolerance':tolerance,'cellIntersectionsChecked':False},
            'intersectionPolicy':'Complete intact cells retained; intersections between arranged cells are ignored.'}
    result['sourceFaceTriangles']=qualification['faceTriangles']
    return result


def ordinary_cell_net(model,root=0,connections=None,placements=None):
    qualification=qualify_cell_shells(model)
    # Keep the already reviewed full-convex-cell domain byte-for-byte compatible.
    if qualification['allFullConvexCells']:
        from .generalized_cell_nets import generalized_cell_net
        return generalized_cell_net(model,root=root,connections=connections,placements=placements)
    return _ordinary_cell_net(model,qualification,root=root,connections=connections,placements=placements)
