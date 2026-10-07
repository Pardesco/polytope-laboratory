"""Isolated augmentation continuation: polar of reversed truncation.

Webb, Polyhedron Navigator section 8 identifies this geometric dual sequence.
Its affine timing inherits our declared truncation scales, not Stella timing.
Imports the complete mounted engine package; no test-only package adapter.
"""
from copy import deepcopy
import numpy as np

from engine.geometry import GeometryError
from engine.dual_morph_expansion import (
    EPS, _color_record, _dual_topology, _finite, _geometry, _lattice, _plane, _require,
)
from engine.dual_morph_truncation import prepare_truncation

VERSION = '0.1.0-augmentation-continuation'


class AugmentationPlan:
    def __init__(self, state, center=None, radius=1.0):
        self._truncation = prepare_truncation(state, center, radius)
        self._state = self._truncation.source_snapshot
        descriptor = self._truncation.descriptor()
        self._center = np.asarray(descriptor['center'])
        self._radius = descriptor['radius']
        self._radius2 = self._radius * self._radius
        self._descriptor = descriptor

    @property
    def source_snapshot(self):
        return deepcopy(self._state)

    @property
    def dual(self):
        return self._truncation.dual

    def descriptor(self):
        return {'version': 1, 'algorithmVersion': VERSION, 'method': 'augmentation',
                'dimension': 3, 'certified': False,
                'sourceModelId': self._descriptor['sourceModelId'],
                'sourceFingerprint': self._descriptor['sourceFingerprint'],
                'sourceSnapshotSha256': self._descriptor['sourceSnapshotSha256'],
                'center': self._center.tolist(), 'radius': self._radius,
                'original': deepcopy(self._state['model']), 'dual': self.dual,
                'reversedTruncation': deepcopy(self._descriptor),
                'parameterization': 'Spherical reciprocal of declared truncation at 1-ratio; literal endpoints.',
                'limitations': ['Intrinsic finite convex 3D only.', 'Approximate binary64 and bounded topology classification.',
                                'Installed parameter trajectory equivalence and nonconvex domains remain open.']}

    def evaluate(self, ratio, *, clamp=True):
        requested = _finite(ratio, 'Augmentation ratio')
        _require(type(clamp) is bool, 'Augmentation clamp must be boolean.')
        t = min(1.0, max(0.0, requested)) if clamp else requested
        _require(0 <= t <= 1, 'Augmentation extrapolation outside [0,1] is not implemented.')
        reversed_frame = self._truncation.evaluate(1-t, clamp=False)
        source = self._state['model']
        if t in (0.0, 1.0):
            model = deepcopy(source) if t == 0 else self.dual
            component = 'source' if t == 0 else 'dual'
            maps = {kind: [{'component': component, 'sourceRank': rank if t == 0 else 2-rank,
                            'sourceElement': i} for i in range(len(model.get(kind, [])))]
                    for rank, kind in enumerate(('vertices', 'edges', 'faces'))}
            maps['cells'] = []
            residual = 0.0
        else:
            truncated = reversed_frame['model']
            points = np.asarray(truncated['vertices'])
            scale = float(np.max(np.ptp(points, axis=0)))
            topology, supers = _dual_topology(truncated, _lattice(truncated))
            coordinates = []
            for face in truncated['faces']:
                normal, height = _plane(points, face, self._center, scale)
                coordinates.append(self._center + normal * (self._radius2 / height))
            coordinates = np.asarray(coordinates)
            _require(np.isfinite(coordinates).all(), 'Augmentation reciprocal overflowed.')
            residual = 0.0
            for v, faces in enumerate(supers[0]):
                for f in faces:
                    value = float((points[v]-self._center) @ (coordinates[f]-self._center))
                    residual = max(residual, abs(value-self._radius2))
            _require(residual <= EPS * max(1.0, self._radius2) * 32,
                     'Augmentation reciprocal incidence residual is unresolved.')
            original_maps = reversed_frame['sourceMaps']
            maps = {'vertices': deepcopy(original_maps['faces']),
                    'edges': deepcopy(original_maps['edges']),
                    'faces': deepcopy(original_maps['vertices']), 'cells': []}
            # Retain literal RGBA when contributors agree; record disagreement
            # explicitly instead of inventing an indexed/averaged color.
            colors = []
            color_ancestry = []
            for owner in maps['faces']:
                contributors = [_color_record(source, 'faces', i) for i in owner.get('sourceFaceIds', [])]
                color_ancestry.append(deepcopy(contributors))
                colors.append(deepcopy(contributors[0]) if contributors and all(c == contributors[0] for c in contributors) else None)
            model = _geometry(source, coordinates, topology,
                              'Augmentation display of ' + source.get('name', 'source'),
                              {'coordinateUnits': source.get('metadata', {}).get('coordinateUnits', 'model'),
                               'sourceMetadata': deepcopy(source.get('metadata', {})),
                               'offColors': {'vertices': [_color_record(truncated, 'faces', i) for i in range(len(coordinates))],
                                             'edges': [_color_record(truncated, 'edges', i) for i in range(len(topology['edges']))],
                                             'faces': colors, 'cells': []},
                               'faceColorContributors': color_ancestry,
                               'colorPolicy': 'Literal source face RGBA when all reciprocal-vertex contributors agree; conflicts explicitly unassigned.'})
        return {'method': 'augmentation', 'requestedRatio': requested, 'ratio': t,
                'endpoint': t in (0.0, 1.0), 'model': model, 'sourceMaps': maps,
                'sourceModelId': self._descriptor['sourceModelId'],
                'sourceFingerprint': self._descriptor['sourceFingerprint'],
                'algorithmVersion': VERSION, 'certified': False,
                'maximumPolarityResidual': residual,
                'reversedTruncationRatio': 1-t,
                'statistics': deepcopy(reversed_frame['statistics']),
                'diagnostics': ['Reciprocal of reversed supporting-halfspace truncation; no Hull or coordinate welding.',
                                'Affine enclosure scales are declared; installed slider trajectory equivalence remains unqualified.']}


def prepare_augmentation(state, center=None, radius=1.0):
    try:
        return AugmentationPlan(state, center, radius)
    except GeometryError:
        raise
    except (KeyError, TypeError, ValueError, IndexError, ArithmeticError, RecursionError) as error:
        raise GeometryError('Malformed/unresolved augmentation source or parameters.') from error
