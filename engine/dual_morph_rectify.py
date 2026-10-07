"""Declared polygon/tilted-fan path through source/dual edge-foot rectification."""
from collections import defaultdict
from copy import deepcopy
import hashlib,json
import numpy as np
from engine.geometry import GeometryError
from engine.dual_morph_sizing import prepare_sizing
from engine.dual_morph_expansion import EPS,MAX_FACES,MAX_VERTICES,_color_record,_cycle,_finite,_geometry,_plane,_require

VERSION='0.1.0-tilting-rectify-continuation'


class TiltingRectifyPlan:
    def __init__(self,state,center=None,radius=1.0):
        self._sizing=prepare_sizing(state,center,radius);self._state=self._sizing.source_snapshot;self._dual=self._sizing.dual
        descriptor=self._sizing.descriptor();self._center=np.asarray(descriptor['center']);self._radius=descriptor['radius'];self._fingerprint=descriptor['sourceFingerprint']
        p=self._state['model'];q=self._dual
        feet=[]
        for model in (p,q):
            values=np.asarray(model['vertices'])-self._center;points=[]
            for v,w in model['edges']:
                delta=values[w]-values[v];length2=float(delta@delta);_require(length2>0,'Rectify source edge vanished.')
                points.append(self._center+values[v]-delta*float(values[v]@delta)/length2)
            feet.append(np.asarray(points))
        self._points=(feet[0]+feet[1])/2
        lookups=[{frozenset(e):i for i,e in enumerate(m['edges'])} for m in (p,q)]
        source_faces=[[lookups[0][frozenset((v,face[(i+1)%len(face)]))] for i,v in enumerate(face)] for face in p['faces']]
        vertex_faces=[]
        for v in range(len(p['vertices'])):
            adjacency=defaultdict(list)
            for face in p['faces']:
                if v not in face:continue
                i=face.index(v);a=lookups[0][frozenset((v,face[i-1]))];b=lookups[0][frozenset((v,face[(i+1)%len(face)]))]
                adjacency[a].append(b);adjacency[b].append(a)
            vertex_faces.append(_cycle(adjacency,'Rectified source vertex '+str(v)))
        faces=source_faces+vertex_faces
        edges=sorted({tuple(sorted((v,face[(i+1)%len(face)]))) for face in faces for i,v in enumerate(face)})
        _require(len(self._points)<=MAX_VERTICES and len(edges)<=MAX_FACES and len(faces)<=MAX_FACES,'Rectification exceeds output budgets.')
        self._r_topology={'edges':[list(e) for e in edges],'faces':faces,'cells':[]}
        self._r_owners=[{'sourceRank':2,'sourceElement':i} for i in range(len(source_faces))]+[{'sourceRank':0,'sourceElement':i} for i in range(len(vertex_faces))]
        facecolors=[]
        for owner in self._r_owners:
            records=[_color_record(p,'faces',owner['sourceElement'])] if owner['sourceRank']==2 else [_color_record(p,'faces',i) for i,face in enumerate(p['faces']) if owner['sourceElement'] in face]
            facecolors.append(deepcopy(records[0]) if records and all(x==records[0] for x in records) else None)
        self._r_metadata={'coordinateUnits':p.get('metadata',{}).get('coordinateUnits','model'),'sourceMetadata':deepcopy(p.get('metadata',{})),
                          'offColors':{'vertices':[_color_record(p,'edges',e) for e in range(len(self._points))],'edges':[None for _ in edges],'faces':facecolors,'cells':[]},
                          'colorPolicy':'Literal original face RGBA; unanimous incident source faces for new vertex faces; conflicts unassigned.'}
        r=_geometry(p,self._points,self._r_topology,'Shared edge-foot rectification',self._r_metadata)
        scale=float(np.max(np.ptp(self._points,axis=0)))
        for face in faces:_plane(self._points,face,self._center,scale)
        self._rectified=r
        self._half_plans={}
        for component,model,lookup in (('source',p,lookups[0]),('dual',q,lookups[1])):
            base=[]
            for f,face in enumerate(model['faces']):
                ids=[lookup[frozenset((v,face[(i+1)%len(face)]))] for i,v in enumerate(face)]
                target=len(p['faces'])+f if component=='dual' else f
                base.append({'start':[model['vertices'][v] for v in face],'end':self._points[ids].tolist(),
                             'vertices':face,'edges':ids,'targetFace':target,'originFace':f})
            targets=range(len(p['faces']),len(faces)) if component=='source' else range(len(p['faces']))
            fans=[]
            for f in targets:
                face=faces[f];centroid=np.mean(self._points[face],axis=0)
                for i,e in enumerate(face):
                    following=face[(i+1)%len(face)];a,b=model['edges'][e]
                    start=np.asarray([model['vertices'][a],model['vertices'][b],(np.asarray(model['vertices'][a])+model['vertices'][b])/2])
                    fans.append({'start':start.tolist(),'end':[self._points[e].tolist(),self._points[following].tolist(),centroid.tolist()],
                                 'targetFace':f,'edge':e})
            _require(sum(len(x['vertices']) for x in base)+len(fans)*3<=MAX_VERTICES and len(base)+len(fans)<=MAX_FACES,'Tilting rectification fan budget exceeded.')
            self._half_plans[component]={'polygons':base,'fans':fans}

    @property
    def source_snapshot(self):return deepcopy(self._state)

    @property
    def dual(self):return deepcopy(self._dual)

    def descriptor(self):
        return {'version':1,'algorithmVersion':VERSION,'method':'tilting-to-rectify','dimension':3,'certified':False,
                'sourceModelId':self._state['model'].get('id'),'sourceFingerprint':self._fingerprint,
                'sourceSnapshotSha256':hashlib.sha256(json.dumps(self._state,sort_keys=True,separators=(',', ':')).encode()).hexdigest(),
                'center':self._center.tolist(),'radius':self._radius,'original':deepcopy(self._state['model']),'dual':self.dual,
                'rectified':deepcopy(self._rectified),'halfPlans':deepcopy(self._half_plans),
                'parameterization':'Shared midpoint is average corresponding source/dual orthogonal edge feet; each half interpolates source face corners to outgoing edge feet and new tilted triangular fans from source edges.',
                'limitations':['Finite intrinsic convex 3D with supporting planar shared edge-foot rectification only.',
                               'Intermediate fan patches may intersect or leave gaps; no filled manifold/volume claim.',
                               'Installed trajectory, nonconvex, infinite, extrapolation and 4D domains remain open.']}

    def _face_owner(self,index):
        owner=deepcopy(self._r_owners[index]);source=self._state['model']
        if owner['sourceRank']==0:owner['sourceVertexIds']=[owner['sourceElement']];owner['sourceFaceIds']=[f for f,face in enumerate(source['faces']) if owner['sourceElement'] in face]
        else:owner['sourceFaceIds']=[owner['sourceElement']];owner['sourceVertexIds']=deepcopy(source['faces'][owner['sourceElement']])
        return owner

    def evaluate(self,ratio,*,clamp=True):
        requested=_finite(ratio,'Tilting rectify ratio');_require(type(clamp) is bool,'Tilting rectify clamp must be boolean.')
        t=min(1.0,max(0.0,requested)) if clamp else requested;_require(0<=t<=1,'Tilting rectify extrapolation outside [0,1] is not implemented.')
        source=self._state['model']
        if t in (0.0,1.0):model=deepcopy(source) if t==0 else self.dual;maps=self._sizing.evaluate(t)['sourceMaps']
        elif t==.5:
            model=deepcopy(self._rectified);maps={'vertices':[{'sourceRank':1,'sourceElement':e,'sourceVertexIds':list(edge)} for e,edge in enumerate(source['edges'])],
                    'edges':[{'owners':[deepcopy(self._r_owners[f]) for f,face in enumerate(self._r_topology['faces']) if a in face and b in face]} for a,b in self._r_topology['edges']],
                    'faces':[self._face_owner(f) for f in range(len(self._r_topology['faces']))],'cells':[]}
        else:
            component='source' if t<.5 else 'dual';u=2*t if t<.5 else 2*(1-t);plans=self._half_plans[component]
            coordinates=[];topology={'edges':[],'faces':[],'cells':[]};maps={k:[] for k in ('vertices','edges','faces','cells')};colors={k:[] for k in maps}
            def polygon(points,owner,color,vertex_owners=None):
                offset=len(coordinates);coordinates.extend(np.asarray(points).tolist());ids=list(range(offset,offset+len(points)));topology['faces'].append(ids)
                topology['edges'].extend([[ids[i],ids[(i+1)%len(ids)]] for i in range(len(ids))]);maps['faces'].append(deepcopy(owner));colors['faces'].append(deepcopy(color))
                for i in range(len(ids)):maps['vertices'].append(deepcopy(vertex_owners[i] if vertex_owners else owner));maps['edges'].append(deepcopy(owner));colors['vertices'].append(None);colors['edges'].append(None)
            for part in plans['polygons']:
                points=np.asarray(part['start'])*(1-u)+np.asarray(part['end'])*u;owner=self._face_owner(part['targetFace']);owners=[]
                for v,e in zip(part['vertices'],part['edges']):
                    entry=deepcopy(owner);entry['owners']=[{'sourceRank':0 if component=='source' else 2,'sourceElement':v},{'sourceRank':1,'sourceElement':e}];owners.append(entry)
                polygon(points,owner,self._r_metadata['offColors']['faces'][part['targetFace']],owners)
            scale=float(np.max(np.ptp(np.asarray(source['vertices']),axis=0)))
            for fan in plans['fans']:
                points=np.asarray(fan['start'])*(1-u)+np.asarray(fan['end'])*u;area=float(np.linalg.norm(np.cross(points[1]-points[0],points[2]-points[0])))
                _require(np.isfinite(points).all() and area>EPS*scale*scale,'Tilting rectification fan is degenerate or numerically unresolved.')
                owner=self._face_owner(fan['targetFace']);owner['owners']=[{'sourceRank':1,'sourceElement':fan['edge']}]
                polygon(points,owner,self._r_metadata['offColors']['faces'][fan['targetFace']])
            metadata={'coordinateUnits':self._r_metadata['coordinateUnits'],'sourceMetadata':deepcopy(source.get('metadata',{})),
                      'offColors':colors,'colorPolicy':self._r_metadata['colorPolicy'],'half':component,'halfProgress':u}
            model=_geometry(source,np.asarray(coordinates),topology,'Tilting to rectify of '+source.get('name','source'),metadata)
        return {'method':'tilting-to-rectify','requestedRatio':requested,'ratio':t,'endpoint':t in (0.0,1.0),'model':model,'sourceMaps':maps,
                'sourceModelId':source.get('id'),'sourceFingerprint':self._fingerprint,'algorithmVersion':VERSION,'certified':False,
                'diagnostics':['Distinct rotating polygon/tilted fan path through shared edge-foot rectification; no truncation/hull alias.',
                               'Intermediate fan patches may intersect or leave gaps; installed timing and filled-volume equivalence are not claimed.']}


def prepare_tilting_rectify(state,center=None,radius=1.0):
    try:return TiltingRectifyPlan(state,center,radius)
    except GeometryError:raise
    except (KeyError,TypeError,ValueError,IndexError,ArithmeticError,RecursionError) as error:
        raise GeometryError('Malformed/unresolved tilting rectify source or parameters.') from error
