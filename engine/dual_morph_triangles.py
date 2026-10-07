"""Tilting triangles: reciprocal of a reversed, declared flag omnitruncation.

Primary evidence: Webb describes tilting triangles as dual to omnitruncation
in his March 2026 Morphing suggestions reply. The coefficients below are our
explicit continuation, not a claim about Stella's slider parameterization.
"""
from collections import defaultdict
from copy import deepcopy
import hashlib
import json

import numpy as np

from engine.geometry import GeometryError
from engine.dual_morph_sizing import prepare_sizing
from engine.dual_morph_expansion import (
    EPS, MAX_FACES, MAX_PAIRS, MAX_VERTICES, _color_record, _cycle, _dual_topology,
    _finite, _geometry, _lattice, _plane, _require,
)

VERSION = '0.1.0-tilting-triangles-continuation'


class TiltingTrianglesPlan:
    def __init__(self, state, center=None, radius=1.0):
        baseline = prepare_sizing(state, center, radius)
        self._state = baseline.source_snapshot
        self._dual = baseline.dual
        descriptor = baseline.descriptor()
        self._fingerprint = descriptor['sourceFingerprint']
        self._center = np.asarray(descriptor['center'])
        self._radius = descriptor['radius']
        self._radius2 = self._radius * self._radius
        source = self._state['model']
        lattice = _lattice(source)
        p = np.asarray(source['vertices']) - self._center
        q = np.asarray(self._dual['vertices']) - self._center
        edge_lookup = {frozenset(edge): e for e, edge in enumerate(source['edges'])}
        feet = []
        for v, w in source['edges']:
            delta = p[w] - p[v]
            length2 = float(delta @ delta)
            _require(length2 > 0, 'Tilting triangles source edge vanished.')
            fraction = -float(p[v] @ delta) / length2
            feet.append(p[v] + fraction * delta)
        feet = np.asarray(feet)
        flags = []
        for f, face in enumerate(source['faces']):
            for i, v in enumerate(face):
                w = face[(i + 1) % len(face)]
                e = edge_lookup[frozenset((v, w))]
                flags.extend(((v, e, f), (w, e, f)))
        _require(len(flags) <= MAX_VERTICES, 'Triangle omnitruncation flags exceed the vertex budget.')
        _require(len(set(flags)) == len(flags), 'Triangle omnitruncation has duplicate flags.')
        neighbors = [set() for _ in flags]
        # A flag has exactly three adjacent flags, each changing one rank.
        for change in range(3):
            groups = defaultdict(list)
            for i, flag in enumerate(flags):
                groups[tuple(value for rank, value in enumerate(flag) if rank != change)].append(i)
            for pair in groups.values():
                _require(len(pair) == 2, 'Triangle omnitruncation requires two flags across every rank swap.')
                a, b = pair
                neighbors[a].add(b); neighbors[b].add(a)
        _require(all(len(n) == 3 for n in neighbors), 'Triangle omnitruncation flag links must be trivalent.')
        edges = [[a, b] for a, adjacent in enumerate(neighbors) for b in sorted(adjacent) if a < b]
        faces = []; owners = []
        for rank, elements in enumerate(lattice):
            groups = defaultdict(set)
            for i, flag in enumerate(flags): groups[flag[rank]].add(i)
            for element in range(len(elements)):
                ids = groups[element]
                adjacency = {i: sorted(neighbors[i] & ids) for i in ids}
                faces.append(_cycle(adjacency, 'Omnitruncation rank %d element %d' % (rank, element)))
                owners.append({'sourceRank': rank, 'sourceElement': element})
        _require(len(edges) <= MAX_FACES and len(faces) <= MAX_FACES, 'Triangle omnitruncation incidence exceeds its budget.')
        _require(len(flags) * len(faces) <= MAX_PAIRS, 'Triangle supporting incidence exceeds the bounded pair budget.')
        self._flags = flags
        self._factors = np.asarray([[p[v], feet[e], q[f]] for v, e, f in flags])
        self._omni_topology = {'edges': edges, 'faces': faces, 'cells': []}
        middle = self._center + np.sum(self._factors * .5, axis=1)
        omnitruncation = _geometry(source, middle, self._omni_topology, 'Omnitruncation preflight', {})
        self._topology, supers = _dual_topology(omnitruncation, _lattice(omnitruncation))
        _require(all(len(face) == 3 for face in self._topology['faces']), 'Tilting reciprocal must have triangular flag faces.')
        scale = float(np.max(np.ptp(middle, axis=0)))
        normals = []; offsets = []
        # Qualify all three factors separately. Nonnegative coefficient changes
        # then retain supporting planes and literal incidence, without a Hull.
        for face in faces:
            normal, _ = _plane(middle, face, self._center, scale)
            heights = []
            for factor in range(3):
                values = self._factors[:, factor] @ normal
                height = float(values[face[0]])
                _require(height > EPS * scale and np.max(np.abs(values[face] - height)) <= EPS * scale * 16,
                         'Tilting triangle factors have unresolved/nonconstant supporting offsets.')
                _require(np.max(values - height) <= EPS * scale * 16,
                         'Source edge-foot/reciprocal factors do not support flag omnitruncation; no Hull repair is substituted.')
                heights.append(height)
            normals.append(normal); offsets.append(heights)
        self._normals = np.asarray(normals)
        self._offsets = np.asarray(offsets)
        vertex_maps = deepcopy(owners)
        edge_maps = []
        for a, b in edges:
            common = [(rank, value) for rank, value in enumerate(flags[a]) if value == flags[b][rank]]
            edge_maps.append({'owners': [{'sourceRank': rank, 'sourceElement': value} for rank, value in common]})
        face_maps = [{'owners': [{'sourceRank': rank, 'sourceElement': value} for rank, value in enumerate(flag)],
                      'sourceFaceIds': [flag[2]]} for flag in flags]
        self._maps = {'vertices': vertex_maps, 'edges': edge_maps, 'faces': face_maps, 'cells': []}
        self._supers = supers
        self._metadata = {'coordinateUnits': source.get('metadata', {}).get('coordinateUnits', 'model'),
                          'sourceMetadata': deepcopy(source.get('metadata', {})),
                          'offColors': {'vertices': [_color_record(source, ('vertices', 'edges', 'faces')[o['sourceRank']], o['sourceElement']) for o in owners],
                                        'edges': [None for _ in self._topology['edges']],
                                        'faces': [_color_record(source, 'faces', f) for v, e, f in flags], 'cells': []},
                          'colorPolicy': 'Literal source face RGBA per vertex-edge-face flag; no palette interpolation.'}

    @property
    def source_snapshot(self): return deepcopy(self._state)

    @property
    def dual(self): return deepcopy(self._dual)

    def descriptor(self):
        source = self._state['model']
        return {'version': 1, 'algorithmVersion': VERSION, 'method': 'tilting-triangles', 'dimension': 3, 'certified': False,
                'sourceModelId': source.get('id'), 'sourceFingerprint': self._fingerprint,
                'sourceSnapshotSha256': hashlib.sha256(json.dumps(self._state, sort_keys=True, separators=(',', ':')).encode()).hexdigest(),
                'center': self._center.tolist(), 'radius': self._radius, 'original': deepcopy(source), 'dual': self.dual,
                'flags': [list(flag) for flag in self._flags], 'factors': self._factors.tolist(),
                'omnitruncationTopology': deepcopy(self._omni_topology), 'topology': deepcopy(self._topology),
                'normals': self._normals.tolist(), 'offsets': self._offsets.tolist(), 'sourceMaps': deepcopy(self._maps),
                'parameterization': 'Polar of flag factors (1-s)*vertex + 2*s*(1-s)*edge-foot + s*dual-facet at s=1-ratio; literal endpoints.',
                'limitations': ['Finite intrinsic convex 3D with independently supporting flag factors only; other original domains remain open.',
                                'Approximate binary64; unresolved near-endpoint incidence is refused.',
                                'No installed trajectory, nonconvex, extrapolation, or 4D equivalence claim.']}

    def evaluate(self, ratio, *, clamp=True):
        requested = _finite(ratio, 'Tilting triangles ratio')
        _require(type(clamp) is bool, 'Tilting triangles clamp must be boolean.')
        t = min(1.0, max(0.0, requested)) if clamp else requested
        _require(0 <= t <= 1, 'Tilting triangles extrapolation outside [0,1] is not implemented.')
        source = self._state['model']; residual = 0.0
        if t in (0.0, 1.0):
            model = deepcopy(source) if t == 0 else self.dual
            maps = {kind: [{'component': 'source' if t == 0 else 'dual', 'sourceRank': rank if t == 0 else 2-rank,
                            'sourceElement': i} for i in range(len(model[kind]))] for rank, kind in enumerate(('vertices', 'edges', 'faces'))}
            maps['cells'] = []
        else:
            weights = np.asarray([t, 2*t*(1-t), 1-t])
            offsets = self._offsets @ weights
            _require(np.min(offsets) > EPS * float(np.max(offsets)) * 8, 'Tilting triangles hit an unresolved reciprocal pole.')
            coordinates = self._center + self._normals * (self._radius2 / offsets[:, None])
            model = _geometry(source, coordinates, self._topology, 'Tilting triangles of ' + source.get('name', 'source'), self._metadata)
            # Independently check each evaluated triangle against its exact flag
            # support. Degenerate slivers are refused rather than silently kept.
            omni_points = np.sum(self._factors * weights[None, :, None], axis=1)
            scale = float(np.max(np.ptp(coordinates, axis=0)))
            for i, triangle in enumerate(model['faces']):
                _plane(coordinates, triangle, self._center, scale)
                values = (coordinates[triangle] - self._center) @ omni_points[i]
                residual = max(residual, float(np.max(np.abs(values - self._radius2))))
            _require(residual <= EPS * self._radius2 * 32, 'Tilting triangles polarity incidence is unresolved.')
            maps = deepcopy(self._maps)
        return {'method': 'tilting-triangles', 'requestedRatio': requested, 'ratio': t, 'endpoint': t in (0.0, 1.0),
                'model': model, 'sourceMaps': maps, 'sourceModelId': source.get('id'), 'sourceFingerprint': self._fingerprint,
                'algorithmVersion': VERSION, 'certified': False, 'maximumPolarityResidual': residual,
                'diagnostics': ['Distinct flag omnitruncation reciprocal, not split coplanar tilting quads.',
                                'Declared coefficients; installed parameter trajectory equivalence remains unqualified.']}


def prepare_tilting_triangles(state, center=None, radius=1.0):
    try: return TiltingTrianglesPlan(state, center, radius)
    except GeometryError: raise
    except (KeyError, TypeError, ValueError, IndexError, ArithmeticError, RecursionError) as error:
        raise GeometryError('Malformed/unresolved tilting triangles source or parameters.') from error
