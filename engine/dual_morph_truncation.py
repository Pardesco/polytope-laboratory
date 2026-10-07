"""Finite 3D dual truncation by supporting-halfspace intersection.

Plane intersections and active-plane incidence replace no source with a Hull.
Classification is bounded approximate float64, not an exact certificate.
"""
from copy import deepcopy
import importlib.util
from itertools import combinations
import math
from pathlib import Path

import numpy as np

from .dual_morph_expansion import EPS, _color_record, _cycle, _finite, _geometry, _lattice, _plane, _require
from engine.geometry import GeometryError, validate

from . import dual_morph_sizing as _SIZING
VERSION='0.1.0-development'
MAX_TRIPLES=100000
MAX_PAIR_VISITS=100000
MAX_VERTICES=20000
MAX_ELEMENTS=32000


def _rank(rows):
    return int(np.sum(np.linalg.svd(np.asarray(rows),compute_uv=False)>EPS*8)) if len(rows) else 0


class TruncationPlan:
    def __init__(self,state,center=None,radius=1.0):
        self._pair=_SIZING.prepare_sizing(state,center,radius)
        self._state=self._pair.source_snapshot;self._source=self._state['model'];self._dual=self._pair.dual
        descriptor=self._pair.descriptor();self._center=np.asarray(descriptor['center']);self._identity=descriptor['sourceFingerprint']
        self._normals=[];self._offsets=[];self._plane_owners=[]
        for component,model in (('source',self._source),('dual',self._dual)):
            points=np.asarray(model['vertices']);scale=float(np.max(np.ptp(points,axis=0)))
            for face,F in enumerate(model['faces']):
                n,h=_plane(points,list(F),self._center,scale)
                self._normals.append(n);self._offsets.append(h)
                self._plane_owners.append({'component':component,'face':face,'sourceRank':2 if component=='source' else 0,'sourceElement':face})
        self._normals=np.asarray(self._normals);self._offsets=np.asarray(self._offsets);self._cut=len(self._source['faces'])
        self._triple_count=math.comb(len(self._normals),3)
        _require(self._triple_count<=MAX_TRIPLES,'Truncation plane triples exceed the bounded visit budget.')
        P=np.asarray(self._source['vertices'])-self._center;Q=np.asarray(self._dual['vertices'])-self._center
        self._q_enclosure=max(1.0,float(np.max(P@self._normals[self._cut:].T/self._offsets[self._cut:])))
        self._p_enclosure=max(1.0,float(np.max(Q@self._normals[:self._cut].T/self._offsets[:self._cut])))
        _require(math.isfinite(self._q_enclosure) and math.isfinite(self._p_enclosure),'Truncation enclosure scales overflowed.')
        self._source_incidents=self._incidents(self._source)
        self._dual_incidents=self._incidents(self._dual)
        for vertex,planes in enumerate(self._source_incidents['vertices']):
            _require(_rank(self._normals[sorted(planes)])==3,'Truncation requires source vertices to be geometric extreme vertices, not inserted collinear points.')

    @staticmethod
    def _incidents(model):
        return {'vertices':[set(f for f,F in enumerate(model['faces']) if v in F) for v in range(len(model['vertices']))],
                'edges':[set(f for f,F in enumerate(model['faces']) if set(e)<=set(F)) for e in model['edges']]}

    @property
    def source_snapshot(self):return self._pair.source_snapshot

    @property
    def dual(self):return deepcopy(self._dual)

    def descriptor(self):
        return {'version':1,'algorithmVersion':VERSION,'method':'truncation','dimension':3,'certified':False,
                'sourceModelId':self._source.get('id'),'sourceFingerprint':self._identity,
                'sourceSnapshotSha256':self._pair.descriptor()['sourceSnapshotSha256'],
                'center':self._center.tolist(),'radius':self._pair.descriptor()['radius'],
                'normals':self._normals.tolist(),'offsets':self._offsets.tolist(),'sourcePlaneCount':self._cut,
                'planeOwners':deepcopy(self._plane_owners),'reciprocalEnclosure':self._q_enclosure,'sourceEnclosure':self._p_enclosure,
                'parameterization':'First half Q enclosure->1 with P fixed; second half P 1->enclosure with Q fixed; affine scales.',
                'limits':{'planeTriples':MAX_TRIPLES,'vertexPairsPerPass':MAX_PAIR_VISITS,'vertices':MAX_VERTICES,'elementsPerRank':MAX_ELEMENTS},
                'original':deepcopy(self._source),'dual':self.dual}

    def _vertex_owner(self,active):
        primal=set(i for i in active if i<self._cut);dual=set(i-self._cut for i in active if i>=self._cut)
        return {'activePlanes':list(active),'sourceVertexIds':[v for v,F in enumerate(self._source_incidents['vertices']) if F<=primal],
                'sourceEdgeIds':[e for e,F in enumerate(self._source_incidents['edges']) if F<=primal],
                'sourceFaceIds':sorted(primal),'dualVertexSourceFaceIds':[v for v,F in enumerate(self._dual_incidents['vertices']) if F<=dual],
                'dualEdgeSourceEdgeIds':[e for e,F in enumerate(self._dual_incidents['edges']) if F<=dual],
                'dualFaceSourceVertexIds':sorted(dual)}

    def _intersection(self,offsets):
        normals=self._normals;scale=float(np.max(np.abs(offsets)));tolerance=EPS*scale*16
        roundoff_band=np.finfo(float).eps*scale*128
        records={};visits=0;skipped=0
        for triple in combinations(range(len(normals)),3):
            visits+=1;_require(visits<=MAX_TRIPLES,'Truncation exceeded its plane-triple visit budget.')
            matrix=normals[list(triple)]
            if _rank(matrix)<3:skipped+=1;continue
            point=np.linalg.solve(matrix,offsets[list(triple)])
            _require(np.isfinite(point).all(),'Truncation plane solve overflowed.')
            residual=normals@point-offsets
            if float(np.max(residual))>tolerance:continue
            _require(not np.any((np.abs(residual)>roundoff_band)&(np.abs(residual)<=tolerance)),
                     'Truncation is near an unresolved active-plane topology transition; no midpoint/vertex snap is substituted.')
            active=tuple(np.flatnonzero(np.abs(residual)<=tolerance).tolist())
            _require(_rank(normals[list(active)])==3,'Truncation active vertex rank is unresolved.')
            refined=np.linalg.lstsq(normals[list(active)],offsets[list(active)],rcond=None)[0]
            _require(np.max(np.abs(normals[list(active)]@refined-offsets[list(active)]))<=tolerance and np.max(normals@refined-offsets)<=tolerance,
                     'Truncation active-plane intersection is numerically inconsistent.')
            if active in records:
                _require(np.linalg.norm(records[active]-refined)<=tolerance*8,'Truncation active-plane identity is numerically ambiguous.')
            else:records[active]=refined
            _require(len(records)<=MAX_VERTICES,'Truncation output vertices exceed the resource budget.')
        _require(len(records)>=4,'Truncation intersection is empty, lower rank, or unresolved.')
        # Group only identical active-plane identities. Never weld separate
        # vertices just because coordinates happen to be close.
        keys=sorted(records);points=np.asarray([records[k] for k in keys])
        _require(math.comb(len(points),2)<=MAX_PAIR_VISITS,'Truncation vertex pairs exceed the bounded visit budget.')
        for i,j in combinations(range(len(points)),2):
            _require(np.linalg.norm(points[i]-points[j])>tolerance*2,'Distinct truncation identities became numerically coincident; no coordinate weld is substituted.')
        facet_groups={}
        for plane in range(len(normals)):
            vertices=tuple(v for v,active in enumerate(keys) if plane in active)
            if len(vertices)>=3 and _rank(points[list(vertices)][1:]-points[vertices[0]])>=2:
                facet_groups.setdefault(vertices,[]).append(plane)
        enabled=set(p for planes in facet_groups.values() for p in planes)
        edges=[]
        for a,b in combinations(range(len(points)),2):
            shared=sorted(set(keys[a])&set(keys[b])&enabled)
            if _rank(normals[shared])==2:edges.append([a,b])
        _require(len(edges)<=MAX_ELEMENTS and len(facet_groups)<=MAX_ELEMENTS,'Truncation output incidence exceeds the resource budget.')
        faces=[];face_owners=[];colors=[]
        for vertices,planes in sorted(facet_groups.items()):
            adjacency={v:[] for v in vertices}
            for a,b in edges:
                if a in adjacency and b in adjacency:adjacency[a].append(b);adjacency[b].append(a)
            faces.append(_cycle(adjacency,'Truncation supporting face'))
            owners=[deepcopy(self._plane_owners[p]) for p in planes];face_owners.append({'supportingPlanes':planes,'owners':owners})
            contributors=[_color_record(self._source if owner['component']=='source' else self._dual,'faces',owner['face']) for owner in owners]
            face_owners[-1]['colorContributors']=deepcopy(contributors)
            colors.append(contributors[0] if all(c==contributors[0] for c in contributors) else None)
        vertex_owners=[self._vertex_owner(active) for active in keys];edge_owners=[]
        _require(len(points)-len(edges)+len(faces)==2,'Truncation boundary Euler relation failed; no partial boundary is returned.')
        boundary_edges=[{frozenset((f[i],f[(i+1)%len(f)])) for i in range(len(f))} for f in faces]
        _require(all(sum(frozenset(e) in boundary for boundary in boundary_edges)==2 for e in edges),
                 'Truncation boundary edge does not have exactly two face incidences.')
        for a,b in edges:
            shared=tuple(sorted(set(keys[a])&set(keys[b])));owner=self._vertex_owner(shared)
            owner['outputVertices']=[a,b];edge_owners.append(owner)
        def color_at(owner,kind):
            sources=owner['sourceVertexIds'] if kind=='vertices' else owner['sourceEdgeIds']
            duals=owner['dualVertexSourceFaceIds'] if kind=='vertices' else owner['dualEdgeSourceEdgeIds']
            contributors=[_color_record(self._source,kind,i) for i in sources]+[_color_record(self._dual,kind,i) for i in duals]
            return contributors[0] if contributors and all(c==contributors[0] for c in contributors) else None
        topology={'edges':edges,'faces':faces,'cells':[]}
        metadata={'coordinateUnits':self._source.get('metadata',{}).get('coordinateUnits','model'),
                  'offColors':{'vertices':[color_at(v,'vertices') for v in vertex_owners],
                               'edges':[color_at(e,'edges') for e in edge_owners],'faces':colors,'cells':[]},'sourceMetadata':deepcopy(self._source.get('metadata',{})),
                  'colorPolicy':'Retained supporting-plane face color; conflicting coincident contributors explicitly unassigned.'}
        model=_geometry(self._source,points+self._center,topology,'Dual truncation display of '+self._source.get('name','source'),metadata)
        return (model,{'vertices':vertex_owners,'edges':edge_owners,'faces':face_owners,'cells':[]},
               {'visitedTriples':visits,'rankDeficientTriples':skipped,'maximumHalfspaceResidual':float(np.max(points@normals.T-offsets)),
                'activeTolerance':tolerance,'coincidentSupportingFaces':sum(len(p)>1 for p in facet_groups.values())})

    def evaluate(self,ratio,*,clamp=True):
        requested=_finite(ratio,'Truncation ratio');_require(type(clamp) is bool,'Truncation clamp must be boolean.')
        t=min(1.0,max(0.0,requested)) if clamp else requested
        _require(0<=t<=1,'Unclamped truncation outside [0,1] is not implemented; no unsupported clipping path is substituted.')
        pscale=1.0 if t<=.5 else 1+(self._p_enclosure-1)*(2*t-1)
        qscale=self._q_enclosure+(1-self._q_enclosure)*2*t if t<=.5 else 1.0
        if t in (0.0,1.0):
            component='source' if t==0 else 'dual';model=deepcopy(self._source if t==0 else self._dual)
            maps=self._pair._owners(component);statistics={'visitedTriples':0,'literalEndpoint':True}
        else:
            offsets=self._offsets*np.asarray([pscale]*self._cut+[qscale]*(len(self._normals)-self._cut))
            model,maps,statistics=self._intersection(offsets)
        return {'method':'truncation','requestedRatio':requested,'ratio':t,'endpoint':t in (0.0,1.0),
                'phase':'source-truncated-by-reciprocal' if t<.5 else 'midpoint-intersection' if t==.5 else 'reciprocal-truncated-by-source',
                'sourceScale':pscale,'reciprocalScale':qscale,'model':model,'sourceMaps':maps,'statistics':statistics,
                'sourceModelId':self._source.get('id'),'sourceFingerprint':self._identity,'algorithmVersion':VERSION,'certified':False,
                'diagnostics':['Bounded approximate supporting-halfspace intersection, not a Hull, crossfade, solid measure, or exact topology certificate.']}


def prepare_truncation(state,center=None,radius=1.0):
    try:return TruncationPlan(state,center,radius)
    except GeometryError:raise
    except (KeyError,TypeError,ValueError,IndexError,ArithmeticError,RecursionError) as error:
        raise GeometryError('Malformed/unresolved truncation source or parameters.') from error
