"""Declared tilted face-fan continuation through the literal source+dual compound.

The public manual's compound midpoint is reproduced. Its unpublished installed
trajectory is not inferred: these fan vertices follow explicit affine paths.
"""
from copy import deepcopy
import hashlib
import json
import numpy as np
from engine.geometry import GeometryError
from engine.dual_morph_sizing import prepare_sizing
from engine.dual_morph_expansion import EPS, MAX_FACES, MAX_VERTICES, _color_record, _finite, _geometry, _require

VERSION = '0.1.0-tilting-compound-continuation'


class TiltingCompoundPlan:
    def __init__(self, state, center=None, radius=1.0):
        self._sizing = prepare_sizing(state, center, radius)
        self._state = self._sizing.source_snapshot
        self._dual = self._sizing.dual
        descriptor = self._sizing.descriptor()
        self._center = np.asarray(descriptor['center'])
        self._radius = descriptor['radius']
        self._fingerprint = descriptor['sourceFingerprint']
        p = self._state['model']; q = self._dual
        self._fan_plans = {}
        for component, model, other in (('source', p, q), ('dual', q, p)):
            edge_lookup = {frozenset(edge): e for e, edge in enumerate(model['edges'])}
            plans = []
            for f, face in enumerate(model['faces']):
                centroid = np.mean(np.asarray(model['vertices'])[face], axis=0)
                for i, v in enumerate(face):
                    w = face[(i+1) % len(face)]; e = edge_lookup[frozenset((v,w))]
                    a, b = other['edges'][e]
                    # Corresponding primal/dual edges are perpendicular, not
                    # a homothetic pair. The emerging triangles actually tilt.
                    start = np.asarray([other['vertices'][a], other['vertices'][b],
                                        (np.asarray(other['vertices'][a])+other['vertices'][b])/2])
                    end = np.asarray([model['vertices'][v], model['vertices'][w], centroid])
                    plans.append({'start':start.tolist(), 'end':end.tolist(), 'edge':e, 'face':f,
                                  'vertices':[v,w], 'sourceRank':2 if component=='source' else 0})
            self._fan_plans[component] = plans
        _require(max(len(v) for v in self._fan_plans.values()) * 3 + max(len(p['vertices']), len(q['vertices'])) <= MAX_VERTICES,
                 'Tilting compound face fans exceed the output vertex budget.')
        _require(max(len(v) for v in self._fan_plans.values()) + max(len(p['faces']),len(q['faces'])) <= MAX_FACES,
                 'Tilting compound face fans exceed the output face budget.')

    @property
    def source_snapshot(self): return deepcopy(self._state)

    @property
    def dual(self): return deepcopy(self._dual)

    def descriptor(self):
        return {'version':1, 'algorithmVersion':VERSION, 'method':'tilting-to-compound', 'dimension':3, 'certified':False,
                'sourceModelId':self._state['model'].get('id'), 'sourceFingerprint':self._fingerprint,
                'sourceSnapshotSha256':hashlib.sha256(json.dumps(self._state,sort_keys=True,separators=(',', ':')).encode()).hexdigest(),
                'center':self._center.tolist(), 'radius':self._radius, 'original':deepcopy(self._state['model']), 'dual':self.dual,
                'faceFans':deepcopy(self._fan_plans),
                'parameterization':'[0,.5]: full source + reciprocal face fans affine from source edges; [.5,1]: full dual + source face fans affine collapsing onto dual edges.',
                'limitations':['Finite intrinsic convex 3D only; intermediate fan patches may intersect or leave gaps.',
                               'Display complex, no filled union/compound volume or manifold claim.',
                               'Installed slider trajectory, generalized, 4D and extrapolation domains remain open.']}

    def _compound(self):
        frame=self._sizing.evaluate(.5)
        model=frame['model']
        coordinates=self._center+(np.asarray(model['vertices'])-self._center)*2
        return _geometry(self._state['model'],coordinates,model,'Source + dual compound',model['metadata']),frame['sourceMaps']

    def evaluate(self, ratio, *, clamp=True):
        requested=_finite(ratio,'Tilting compound ratio');_require(type(clamp) is bool,'Tilting compound clamp must be boolean.')
        t=min(1.0,max(0.0,requested)) if clamp else requested
        _require(0<=t<=1,'Tilting compound extrapolation outside [0,1] is not implemented.')
        source=self._state['model']
        if t in (0.0,1.0):
            model=deepcopy(source) if t==0 else self.dual
            maps=self._sizing.evaluate(t)['sourceMaps']
        elif t==.5:
            model,maps=self._compound()
        else:
            stationary='source' if t<.5 else 'dual';moving='dual' if t<.5 else 'source';u=2*t if t<.5 else 2*(1-t)
            base=source if stationary=='source' else self._dual
            moving_model=self._dual if moving=='dual' else source
            coordinates=deepcopy(base['vertices']);topology={k:deepcopy(base[k]) for k in ('edges','faces','cells')}
            colors={k:[_color_record(base,k,i) for i in range(len(base[k]))] for k in ('vertices','edges','faces','cells')}
            maps=self._sizing.evaluate(0 if stationary=='source' else 1)['sourceMaps']
            scale=float(np.max(np.ptp(np.asarray(source['vertices']),axis=0)))
            for fan in self._fan_plans[moving]:
                points=np.asarray(fan['start'])*(1-u)+np.asarray(fan['end'])*u
                area=float(np.linalg.norm(np.cross(points[1]-points[0],points[2]-points[0])))
                _require(np.isfinite(points).all() and area>EPS*scale*scale,'Tilting compound fan is degenerate or numerically unresolved.')
                offset=len(coordinates);coordinates.extend(points.tolist())
                topology['edges'].extend([[offset,offset+1],[offset+1,offset+2],[offset+2,offset]])
                topology['faces'].append([offset,offset+1,offset+2])
                owner={'component':moving, 'sourceRank':fan['sourceRank'], 'sourceElement':fan['face'],
                       'owners':[{'sourceRank':1,'sourceElement':fan['edge']}],
                       'sourceVertexIds':fan['vertices'] if moving=='source' else [fan['face']],
                       'sourceFaceIds':[fan['face']] if moving=='source' else [f for f,face in enumerate(source['faces']) if fan['face'] in face]}
                for _ in range(3):maps['vertices'].append(deepcopy(owner));maps['edges'].append(deepcopy(owner));colors['vertices'].append(None);colors['edges'].append(None)
                maps['faces'].append(deepcopy(owner));colors['faces'].append(_color_record(moving_model,'faces',fan['face']))
            metadata={'coordinateUnits':source.get('metadata',{}).get('coordinateUnits','model'),
                      'sourceMetadata':deepcopy(source.get('metadata',{})), 'offColors':colors,
                      'colorPolicy':'Literal stationary/source face RGBA; reciprocal rank reversal; no interpolation.',
                      'stationaryComponent':stationary, 'movingFanComponent':moving, 'fanProgress':u}
            model=_geometry(source,np.asarray(coordinates),topology,'Tilting to compound of '+source.get('name','source'),metadata)
        return {'method':'tilting-to-compound','requestedRatio':requested,'ratio':t,'endpoint':t in (0.0,1.0),
                'model':model,'sourceMaps':maps,'sourceModelId':source.get('id'),'sourceFingerprint':self._fingerprint,
                'algorithmVersion':VERSION,'certified':False,
                'diagnostics':['Actual tilted face fans through a literal full source+dual compound at ratio .5.',
                               'Intermediate patches can intersect or leave gaps; no filled volume or installed timing equivalence claim.']}


def prepare_tilting_compound(state,center=None,radius=1.0):
    try:return TiltingCompoundPlan(state,center,radius)
    except GeometryError:raise
    except (KeyError,TypeError,ValueError,IndexError,ArithmeticError,RecursionError) as error:
        raise GeometryError('Malformed/unresolved tilting compound source or parameters.') from error
