"""Incidence-preserving Euclidean symmetries from exhaustive vertex frames.

Every symmetry fixes the vertex mean. Its images on a spanning vertex frame
determine its orthogonal matrix uniquely. Enumerating all Gram-compatible
image frames therefore covers every possible action, independent of the
coordinate axes. Completeness is numerical for the supplied coordinates,
and resource termination never receives a completeness claim.
"""
from collections import deque
import numpy as np
from scipy.spatial import cKDTree
from .geometry import GeometryError, TOLERANCE, points_array, validate, identity

VERSION='0.7.0'


def cycle_rows(rows):
    """Canonical cyclic order, including reversal; unique vertex IDs required."""
    rows=np.asarray(rows,dtype=np.int32);n,width=rows.shape
    start=np.argmin(rows,axis=1);step=np.where(rows[np.arange(n),(start+1)%width]<rows[np.arange(n),(start-1)%width],1,-1)
    return rows[np.arange(n)[:,None],(start[:,None]+step[:,None]*np.arange(width))%width]


class RowLookup:
    """Exact integer row comparison, with no digest collision assumptions."""
    def __init__(self, rows):
        self.rows=np.ascontiguousarray(rows,dtype=np.int32)
        self.dtype=np.dtype(f'V{self.rows.shape[1]*4}')
        keys=self.rows.view(self.dtype).ravel();self.order=np.argsort(keys);self.keys=keys[self.order]
        if len(self.keys)>1 and np.any(self.keys[1:]==self.keys[:-1]):
            raise GeometryError('Symmetry entity occurrence is ambiguous: repeated face cycles or cell boundaries are unsupported.')

    def map(self, rows):
        keys=np.ascontiguousarray(rows,dtype=np.int32).view(self.dtype).ravel()
        index=np.searchsorted(self.keys,keys)
        if np.any(index>=len(self.keys)):return None
        if not np.all(self.keys[index]==keys):return None
        mapped=self.order[index]
        if len(np.unique(mapped))!=len(mapped):return None
        return mapped


class IncidenceActions:
    """Compile source cyclic incidence once, then verify whole actions in batches."""
    def __init__(self, model):
        self.vertex_count=len(model['vertices']);self.edges=np.asarray(model['edges'],dtype=np.int32).reshape(-1,2)
        self.edge_lookup=RowLookup(np.sort(self.edges,axis=1)) if len(self.edges) else None
        self.faces=[];self.face_count=len(model['faces']);self.cells=[];self.cell_count=len(model.get('cells',[]))
        for width in sorted(set(map(len,model['faces']))):
            ids=np.asarray([i for i,f in enumerate(model['faces']) if len(f)==width],dtype=np.int32)
            rows=np.asarray([model['faces'][i] for i in ids],dtype=np.int32)
            self.faces.append((ids,rows,RowLookup(cycle_rows(rows))))
        for width in sorted(set(map(len,model.get('cells',[])))):
            ids=np.asarray([i for i,c in enumerate(model['cells']) if len(c)==width],dtype=np.int32)
            rows=np.asarray([sorted(model['cells'][i]) for i in ids],dtype=np.int32)
            self.cells.append((ids,rows,RowLookup(rows)))

    def maps(self, permutation):
        permutation=np.asarray(permutation,dtype=np.int32)
        if self.edge_lookup:
            edge=self.edge_lookup.map(np.sort(permutation[self.edges],axis=1))
            if edge is None:return None
        else:edge=np.empty(0,dtype=np.int32)
        face=np.empty(self.face_count,dtype=np.int32)
        for ids,rows,lookup in self.faces:
            mapped=lookup.map(cycle_rows(permutation[rows]))
            if mapped is None:return None
            face[ids]=ids[mapped]
        cell=np.empty(self.cell_count,dtype=np.int32)
        for ids,rows,lookup in self.cells:
            mapped=lookup.map(np.sort(face[rows],axis=1))
            if mapped is None:return None
            cell[ids]=ids[mapped]
        return {'vertex':permutation,'edge':edge,'face':face,'cell':cell}


def generating_closure(actions, basis, vertex_count):
    """Generator Cayley traversal proves closure without an order-squared loop.

    Every action is a verified orthogonal vertex permutation. Equality on a
    spanning frame is equality everywhere. Reaching every listed action by
    words, with every generator transition staying listed, proves closure.
    """
    lookup={tuple(a['permutation'][i] for i in basis):j for j,a in enumerate(actions)}
    if len(lookup)!=len(actions):raise GeometryError('Repeated symmetry action keys cannot define a verified group.')
    identity_index=lookup.get(tuple(basis))
    if identity_index is None or actions[identity_index]['permutation']!=list(range(vertex_count)):
        raise GeometryError('Numerical symmetry actions lack the identity; group closure is unresolved.')
    generators=[];reached={identity_index};transitions=0
    for index in range(len(actions)):
        if index in reached:continue
        generators.append(index);reached={identity_index};pending=deque([identity_index])
        while pending:
            current=pending.popleft();frame=[actions[current]['permutation'][i] for i in basis]
            for generator in generators:
                permutation=actions[generator]['permutation'];key=tuple(permutation[i] for i in frame)
                target=lookup.get(key);transitions+=1
                if target is None:raise GeometryError('Numerical symmetry actions fail generator closure; no completeness claim is available.')
                if target not in reached:reached.add(target);pending.append(target)
    if len(reached)!=len(actions):raise GeometryError('Generator traversal does not cover every listed action.')
    return generators,identity_index,transitions


def entity_orbits(incidence, actions, generators):
    maps=[incidence.maps(actions[i]['permutation']) for i in generators]
    output={}
    for kind,count in (('vertex',incidence.vertex_count),('edge',len(incidence.edges)),('face',incidence.face_count),('cell',incidence.cell_count)):
        parent=list(range(count))
        def root(i):
            while parent[i]!=i:parent[i]=parent[parent[i]];i=parent[i]
            return i
        for action in maps:
            for a,b in enumerate(action[kind]):
                ra,rb=root(a),root(int(b))
                if ra!=rb:parent[max(ra,rb)]=min(ra,rb)
        groups={}
        for i in range(count):groups.setdefault(root(i),[]).append(i)
        output[kind]=[{'ids':ids,'size':len(ids),'stabilizerOrder':len(actions)//len(ids)} for ids in groups.values()]
    return output


def generated_actions(actions, basis, generator_ids):
    lookup={tuple(a['permutation'][i] for i in basis):j for j,a in enumerate(actions)}
    unit=lookup[tuple(basis)];reached={unit};pending=deque([unit])
    while pending:
        current=pending.popleft();frame=[actions[current]['permutation'][i] for i in basis]
        for generator in generator_ids:
            permutation=actions[generator]['permutation'];target=lookup.get(tuple(permutation[i] for i in frame))
            if target is None:raise GeometryError('Requested generators do not close within the verified source group.')
            if target not in reached:reached.add(target);pending.append(target)
    return [actions[i] for i in sorted(reached)]


def geometric_symmetry(model, max_frames=100000, orientation='all', stabilize=None, generator_ids=None):
    if not validate(model)['passed']:
        raise GeometryError('Source incidence failed validation.')
    p=points_array(model['vertices']);d=p.shape[1]
    if len(p)>1000 or type(max_frames) is not int or not 1<=max_frames<=1000000:
        raise GeometryError('Geometric symmetry limits: 1,000 vertices and 1–1,000,000 candidate frames.')
    if orientation not in ('all','proper'):raise GeometryError('Symmetry orientation is all or proper.')
    if generator_ids is not None and (not isinstance(generator_ids,list) or len(generator_ids)>64 or any(type(i) is not int or i<0 for i in generator_ids) or len(set(generator_ids))!=len(generator_ids)):
        raise GeometryError('A generated subgroup uses up to 64 distinct nonnegative source action IDs; an empty list gives the identity group.')
    incidence=IncidenceActions(model)
    if stabilize is not None:
        counts={'vertex':len(p),'edge':len(model['edges']),'face':len(model['faces']),'cell':len(model.get('cells',[]))}
        if not isinstance(stabilize,dict) or stabilize.get('kind') not in counts or type(stabilize.get('index')) is not int or not 0<=stabilize['index']<counts[stabilize['kind']]:
            raise GeometryError('Choose a valid source vertex/edge/face/cell to stabilize setwise.')
    center=p.mean(axis=0);scale=float(np.max(np.ptp(p,axis=0)));p=(p-center)/scale
    tol=TOLERANCE*8
    if np.linalg.matrix_rank(p,tol=tol)!=d:
        raise GeometryError('A full-dimensional vertex set is required for a finite Euclidean symmetry group.')
    radii=np.einsum('ij,ij->i',p,p)
    choices=[np.flatnonzero(np.abs(radii-r)<=tol) for r in radii];all_gram=p@p.T
    # Rare radius classes prune the enumeration; a well-conditioned frame
    # keeps the resulting matrix stable. No source vertex is discarded.
    basis=[]
    for _ in range(d):
        eligible=[i for i in range(len(p)) if i not in basis and np.linalg.matrix_rank(p[basis+[i]],tol=tol)==len(basis)+1]
        if not eligible:raise GeometryError('No stable spanning vertex frame was found.')
        def score(i):
            compatible=np.sum(np.all(np.abs(all_gram[np.ix_(choices[i],basis)]-all_gram[i,basis])<=tol,axis=1)) if basis else len(choices[i])
            return len(choices[i]),int(compatible),-float(np.prod(np.linalg.svd(p[basis+[i]],compute_uv=False))),i
        best=min(eligible,key=score)
        basis.append(best)
    frame=p[basis];inverse=np.linalg.inv(frame);gram=frame@frame.T;tree=cKDTree(p)
    actions={};frames=0;nodes=0;termination='exhausted';max_nodes=max_frames*10+d

    def verify(target):
        nonlocal frames,termination
        if frames>=max_frames:termination='frame-limit';return
        frames+=1
        matrix=(inverse@p[target]).T
        if np.max(np.abs(matrix@matrix.T-np.eye(d)))>tol*4:return
        distances,mapping=tree.query(p@matrix.T)
        if max(distances)>tol or len(set(mapping))!=len(p):return
        if incidence.maps(mapping) is None:return
        actions[tuple(mapping[basis])]={'permutation':mapping.tolist(),'matrix':matrix.tolist(),'determinant':round(float(np.linalg.det(matrix)))}

    def visit(target):
        nonlocal nodes,termination
        if nodes>=max_nodes:termination='search-node-limit';return
        nodes+=1
        if len(target)==d:verify(target);return
        k=len(target)
        candidates=choices[basis[k]]
        if target:
            dots=all_gram[np.ix_(candidates,target)]
            candidates=candidates[np.all(np.abs(dots-gram[k,:k])<=tol,axis=1)]
        for i in candidates:
            visit(target+[i])
            if termination!='exhausted':return
    visit([])
    ordered=[actions[key] for key in sorted(actions)]
    full_order=len(ordered)
    complete=termination=='exhausted';source_generators=[];source_identity=None;source_transitions=0
    for i,a in enumerate(ordered):a['sourceActionId']=i
    if complete:source_generators,source_identity,source_transitions=generating_closure(ordered,basis,len(p))
    source_actions=ordered
    if orientation=='proper':ordered=[a for a in ordered if a['determinant']==1]
    if stabilize is not None:ordered=[a for a in ordered if incidence.maps(a['permutation'])[stabilize['kind']][stabilize['index']]==stabilize['index']]
    if generator_ids is not None:
        if not complete:raise GeometryError('Generator-defined subgroups require an exhausted complete source-group search.')
        allowed={a['sourceActionId'] for a in ordered}
        if any(i not in allowed for i in generator_ids):raise GeometryError('Generator ID is unavailable or violates the requested orientation/entity stabilizer.')
        ordered=generated_actions(source_actions,basis,generator_ids)
    closed=None;generators=[];identity_index=None;transitions=0;orbits=None
    if complete:
        if len(ordered)==full_order:generators,identity_index,transitions=source_generators,source_identity,source_transitions
        else:generators,identity_index,transitions=generating_closure(ordered,basis,len(p))
        closed=True
        orbits=entity_orbits(incidence,ordered,generators)
    restricted=orientation!='all' or stabilize is not None or generator_ids is not None
    return {'order':len(ordered),'properOrder':sum(a['determinant']==1 for a in ordered),'complete':complete,
            'status':('exhaustive selected subgroup' if restricted else 'exhaustive incidence-preserving Euclidean group')+' for supplied coordinates (numerical)' if complete else termination+'; verified actions only, group completeness unresolved',
            'numericMode':'float64-approximate','tolerance':tol,'center':center.tolist(),'actions':ordered,
            'method':'exhaustive Gram-compatible spanning vertex frames','basisVertexIds':[int(i) for i in basis],'candidateFramesEvaluated':frames,
            'searchNodesEvaluated':nodes,'searchNodeLimit':max_nodes,'frameConditionNumber':float(np.linalg.cond(frame)),
            'termination':termination,'closureVerified':closed,'closureMethod':'generator Cayley traversal on spanning-frame action keys' if closed else None,
            'generatorIndices':generators,'identityIndex':identity_index,'closureTransitionsChecked':transitions,'entityOrbits':orbits,
            'orientation':orientation,'stabilizedEntity':stabilize,'requestedGeneratorIds':generator_ids,'unrestrictedVerifiedOrder':full_order,
            'unrestrictedGeneratorIndices':source_generators,'sourceFingerprint':identity(model),'algorithmVersion':VERSION,
            'checks':['vertex bijection','orthogonal metric action','edge multiplicity','ordered face cycles','cell face incidence','frame enumeration']+(['generator closure','entity orbits and orbit-stabilizer orders'] if closed else [])}
