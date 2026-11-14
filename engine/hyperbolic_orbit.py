"""Deterministic, bounded cell-adjacency development; no radius-pruned BFS."""

from collections import Counter
from itertools import product
import math
import time

import numpy as np

from .geometry import GeometryError
from .hyperbolic_coverage import CellBall
from .hyperbolic import (
    DEVELOPMENT_RELATIVE_GATE,
    EDGE_GATE,
    J,
    lorentz_gram_schmidt,
    lorentz_inner,
    matrix_discrepancy,
    matrix_metric_residual,
    point_discrepancy,
    point_metric_residual,
    record_residual,
    reflection_matrix,
    regular_cell_template,
)

HARD_LIMITS = {
    'maxCells': 4096,
    'maxCandidates': 50000,
    'maxBytes': 256 * 1024 * 1024,
    'timeMs': 2000,
    'pageSize': 256,
    'candidatesPerPage': 50000,
}
DEFAULT_BUDGET = {**HARD_LIMITS, 'candidatesPerPage': 256}
WORD_LIMIT = 256
BUCKET_WIDTH = 1e-5
MAX_NEIGHBOR_UPDATES = 2048


def repair_frame(matrix, word_length):
    # Reflection words alternate handedness. Repair their SO+ factor, then
    # restore that known parity without changing any template correspondence.
    parity = np.diag([1.0, 1.0, 1.0, (-1.0) ** word_length])
    return lorentz_gram_schmidt(matrix @ parity) @ parity


class DevelopmentResidualError(GeometryError):
    def __init__(self, diagnostics):
        self.diagnostics = diagnostics
        super().__init__(
            f'Hyperbolic development residual gate failed at word length {diagnostics["wordLength"]}: '
            f'{diagnostics}; rebase nearer the observer. Relative gate is {DEVELOPMENT_RELATIVE_GATE}.'
        )


def budget_options(value=None):
    if value is None:
        return dict(DEFAULT_BUDGET)
    if not isinstance(value, dict) or set(value) - set(HARD_LIMITS):
        raise GeometryError('Unknown hyperbolic budget option.')
    result = dict(DEFAULT_BUDGET)
    for key, maximum in HARD_LIMITS.items():
        v = value.get(key, result[key])
        if type(v) is not int or not 1 <= v <= maximum:
            raise GeometryError(f'{key} must be an integer in 1..{maximum}.')
        result[key] = v
    if result['maxBytes'] < estimated_bytes(1, 0):
        raise GeometryError('maxBytes is below the minimum initial working estimate (81920 bytes).')
    return result


def estimated_bytes(cells, candidates):
    # Conservative working estimate includes transforms, buckets, words,
    # incidence, temporary arrays and Python object overhead.
    return 65536 + cells * 16384 + candidates * 512


def _key(center):
    return tuple(np.floor(center[1:] / center[0] / BUCKET_WIDTH).astype(np.int64))


class Development:
    def __init__(self, pqr, depth=3, radius=2, mode='radius', observer=None, template=None):
        self.template = regular_cell_template(pqr) if template is None else template
        self.cell_ball = CellBall(self.template)
        self.vertices = np.asarray(self.template['vertices'])
        self.edge_indices = np.asarray(self.template['edges'])
        self.generators = [reflection_matrix(n) for n in self.template['facePlanes']]
        self.depth = depth
        self.radius = radius
        self.mode = mode
        self.observer = np.eye(4) if observer is None else np.asarray(observer)
        if mode == 'radius' and not self.cell_ball.meets(np.eye(4), self.observer[:, 0], radius):
            raise GeometryError('Observer ball does not meet the anchor cell; rebase nearer the observer first.')
        self.matrices = [np.eye(4)]
        self.centers = np.empty((HARD_LIMITS['maxCells'], 4))
        self.centers[0] = self.matrices[0][:, 0]
        self.words = [[]]
        self.word_index = {(): 0}
        self.depths = [0]
        self.buckets = {_key(self.matrices[0][:, 0]): [0]}
        self.links = {}
        self.cell_index = 0
        self.face_index = 0
        self.candidates = 0
        self.published = 0
        self.residuals = {
            'coordinates': 0.0,
            'transformMetric': 0.0,
            'mergeDiscrepancy': 0.0,
            'edgeRelativeSpread': 0.0,
            'coordinatesBeforeRepair': 0.0,
            'coordinatesBeforeNormalization': 0.0,
            'coordinatesNormalized': 0.0,
            'coordinatesRelative': 0.0,
            'transformMetricBeforeRepair': 0.0,
            'transformMetricRelative': 0.0,
            'transformCorrection': 0.0,
            'pointCorrection': 0.0,
            'centerDistance': 0.0,
            'maxVertexDistance': 0.0,
            'maxVertexTime': 0.0,
        }
        self.edge_length = np.arccosh(
            -lorentz_inner(self.vertices[self.template['edges'][0][0]], self.vertices[self.template['edges'][0][1]])
        )
        for name in ('mergeDiscrepancy', 'mergeCenterDiscrepancy', 'matrixReconstruction', 'neighborDiscrepancy'):
            record_residual(self.residuals, name, {'absolute': 0.0, 'relative': 0.0, 'scale': 1.0})
        Development._checked(self, np.eye(4), [])

    def _transform(self, word):
        # Use the nearest accepted prefix; cold replay follows the identical
        # one-generator compositions and repairs, without platform longdouble.
        split = len(word)
        while tuple(word[:split]) not in self.word_index:
            split -= 1
        matrix = self.matrices[self.word_index[tuple(word[:split])]].copy()
        for end in range(split + 1, len(word) + 1):
            matrix = self._checked(matrix @ self.generators[word[end - 1]], word[:end])
        return matrix

    def _edge_spread(self, points):
        a, b = points[self.edge_indices[:, 0]], points[self.edge_indices[:, 1]]
        lengths = np.arccosh(np.maximum(1, -lorentz_inner(a, b)))
        return float(np.ptp(lengths) / self.edge_length)

    def _measure(self, matrix):
        vertices = (matrix @ self.vertices.T).T
        coord = float(np.max(np.abs(lorentz_inner(vertices, vertices) + 1)))
        metric = float(np.max(np.abs(matrix.T @ J @ matrix - J)))
        spread = self._edge_spread(vertices)
        return coord, metric, spread

    def _checked(self, matrix, word):
        if not np.isfinite(matrix).all():
            raise GeometryError('Hyperbolic development residual gate failed: nonfinite transform.')
        points = (matrix @ self.vertices.T).T
        diagnostics = {
            'wordLength': len(word),
            'centerDistance': math.acosh(max(1, float(matrix[0, 0]))),
            'maxVertexDistance': math.acosh(max(1, float(points[:, 0].max()))),
            'maxVertexTime': float(points[:, 0].max()),
            'coordinatesNormalized': None,
            'pointCorrection': 0.0,
            'transformCorrection': 0.0,
            'edgeRelativeSpread': self._edge_spread(points),
        }

        def check(name, measurement):
            record_residual(diagnostics, name, measurement)
            if measurement['relative'] > DEVELOPMENT_RELATIVE_GATE:
                raise DevelopmentResidualError(diagnostics)

        measurement = point_metric_residual(points)
        check('coordinatesBeforeRepair', measurement)
        check('coordinates', measurement)
        check('transformMetricBeforeRepair', matrix_metric_residual(matrix))
        if diagnostics['edgeRelativeSpread'] > EDGE_GATE or np.any(points[:, 0] <= 0):
            raise DevelopmentResidualError(diagnostics)
        # At large t, Gram-Schmidt amplifies rounded input by t². Develop
        # distant cells by generator composition; repair only nearby charts.
        repaired = repair_frame(matrix, len(word)) if np.max(np.abs(matrix)) <= 4 else matrix.copy()
        check('transformCorrection', matrix_discrepancy(matrix, repaired))
        check('transformMetric', matrix_metric_residual(repaired))
        points = (repaired @ self.vertices.T).T
        measurement = point_metric_residual(points)
        check('coordinatesBeforeNormalization', measurement)
        check('coordinates', measurement)
        norms = lorentz_inner(points, points)
        if np.any(norms >= 0) or np.any(points[:, 0] <= 0):
            raise DevelopmentResidualError(diagnostics)
        normalized = points / np.sqrt(-norms)[:, None]
        record_residual(diagnostics, 'pointCorrection', point_discrepancy(points, normalized))
        diagnostics['coordinatesNormalized'] = 0.0
        measurement = point_metric_residual(normalized)
        check('coordinatesNormalized', measurement)
        check('coordinates', measurement)
        diagnostics['edgeRelativeSpread'] = max(
            diagnostics['edgeRelativeSpread'], self._edge_spread(points), self._edge_spread(normalized)
        )
        if diagnostics['edgeRelativeSpread'] > EDGE_GATE:
            raise DevelopmentResidualError(diagnostics)
        for key, value in diagnostics.items():
            if key != 'wordLength':
                self.residuals[key] = max(self.residuals.get(key, 0.0), value)
        return repaired

    def _match(self, matrix):
        center = matrix[:, 0]
        key = _key(center)
        for offset in product((-1, 0, 1), repeat=3):
            bucket = tuple(key[i] + offset[i] for i in range(3))
            for index in self.buckets.get(bucket, ()):
                existing = self.matrices[index]
                center_error = point_discrepancy(matrix[:, 0], existing[:, 0])
                if center_error['relative'] > DEVELOPMENT_RELATIVE_GATE:
                    local_center = J @ existing.T @ J @ center
                    if np.linalg.norm(local_center[1:]) < 0.1:
                        raise GeometryError('Near-coincident cell centers failed the linear correspondence gate.')
                    continue
                relative = J @ existing.T @ J @ matrix
                candidate = (relative @ self.vertices.T).T
                distances = np.max(np.abs(candidate[:, None, :] - self.vertices[None, :, :]), axis=2)
                permutation = np.argmin(distances, axis=1)
                discrepancy = point_discrepancy(
                    (matrix @ self.vertices.T).T, (existing @ self.vertices[permutation].T).T
                )
                if discrepancy['relative'] > DEVELOPMENT_RELATIVE_GATE or len(set(permutation.tolist())) != len(
                    self.vertices
                ):
                    raise GeometryError(
                        f'Coincident cell centers failed full template correspondence: {discrepancy}; no page published.'
                    )
                record_residual(self.residuals, 'mergeDiscrepancy', discrepancy)
                record_residual(self.residuals, 'mergeCenterDiscrepancy', center_error)
                return index, permutation.tolist()
        near = -lorentz_inner(self.centers[: len(self.matrices)], center)
        if np.any(near < math.cosh(0.1)):
            raise GeometryError(
                'Near-coincident cell centers failed bucket/correspondence checks; no duplicate accepted.'
            )
        return None, None

    @property
    def finished(self):
        return self.cell_index >= len(self.words) or (
            self.mode == 'complete-depth' and self.depths[self.cell_index] >= self.depth
        )

    def step(self, budget):
        if self.finished:
            return 'depthComplete'
        if self.candidates >= budget['maxCandidates']:
            return 'candidateLimit'
        if estimated_bytes(len(self.words) + 1, self.candidates + 1) > budget['maxBytes']:
            return 'memoryLimit'
        i, f = self.cell_index, self.face_index
        word = self.words[i] + [f]
        if len(word) > WORD_LIMIT:
            return 'wordLimit'
        candidate = self.matrices[i] @ self.generators[f]
        included = self.mode == 'complete-depth' or self.cell_ball.meets(candidate, self.observer[:, 0], self.radius)
        target, permutation = None, None
        if included:
            candidate = self._checked(candidate, word)
            target, permutation = self._match(candidate)
        if target is None and included:
            if len(self.words) >= budget['maxCells']:
                return 'cellLimit'
            target = len(self.words)
            self.words.append(word)
            self.word_index[tuple(word)] = target
            self.depths.append(self.depths[i] + 1)
            self.matrices.append(candidate)
            self.centers[target] = candidate[:, 0]
            self.buckets.setdefault(_key(candidate[:, 0]), []).append(target)
            permutation = list(range(len(self.vertices)))
        to_face = None
        if target is not None:
            target_vertices = {permutation[v] for v in self.template['faces'][f]}
            to_face = next((k for k, face in enumerate(self.template['faces']) if set(face) == target_vertices), None)
            if to_face is None:
                raise GeometryError('Neighbor face permutation did not preserve incidence.')
        self.links[(i, f)] = {
            'cell': i,
            'face': f,
            'toCell': target,
            'toFace': to_face,
            'vertexPermutation': permutation,
            'status': 'expanded' if target is not None else 'outsideBall',
        }
        self.candidates += 1
        self.face_index += 1
        if self.face_index == len(self.generators):
            self.face_index = 0
            self.cell_index += 1
        return None

    def visible(self, i):
        return True

    def checkpoint(self):
        return {
            'words': self.words,
            'types': [0] * len(self.words),
            'next': [self.cell_index, self.face_index],
            'candidates': self.candidates,
            'published': self.published,
        }

    def restore(self, checkpoint, budget, *, deadline=None, clock=time.monotonic):
        """Replay a bounded BFS prefix, never trust claimed incidence or layers."""
        if not isinstance(checkpoint, dict) or set(checkpoint) != {'words', 'types', 'next', 'candidates', 'published'}:
            raise GeometryError('Invalid BFS checkpoint fields.')
        words = checkpoint['words']
        if not isinstance(words, list) or not 1 <= len(words) <= budget['maxCells']:
            raise GeometryError('Invalid checkpoint cell count.')
        types = checkpoint['types']
        if not isinstance(types, list) or len(types) != len(words) or any(type(t) is not int or t != 0 for t in types):
            raise GeometryError('Invalid checkpoint template types.')
        for word in words:
            if (
                not isinstance(word, list)
                or len(word) > WORD_LIMIT
                or any(type(f) is not int or not 0 <= f < len(self.generators) for f in word)
            ):
                raise GeometryError('Invalid checkpoint generator word.')
        count = checkpoint['candidates']
        published = checkpoint['published']
        if (
            type(count) is not int
            or not 0 <= count <= budget['maxCandidates']
            or type(published) is not int
            or published != len(words)
        ):
            raise GeometryError('Invalid checkpoint counters.')
        position = checkpoint['next']
        if not isinstance(position, list) or len(position) != 2 or any(type(x) is not int or x < 0 for x in position):
            raise GeometryError('Invalid checkpoint expansion position.')
        if self.candidates > count or words[: len(self.words)] != self.words:
            raise GeometryError('Checkpoint is not the deterministic BFS prefix claimed.')
        for _ in range(self.candidates, count):
            if deadline is not None and clock() >= deadline:
                raise GeometryError(
                    'Checkpoint verification exceeded the page time limit; start a smaller fresh patch.'
                )
            if self.step(budget) is not None:
                raise GeometryError('Checkpoint exceeds a BFS resource or depth bound.')
        if self.words != words or checkpoint['next'] != [self.cell_index, self.face_index]:
            raise GeometryError('Checkpoint is not the deterministic BFS prefix claimed.')
        self.published = published

    def page(self, budget=None, clock=time.monotonic):
        budget = budget_options(budget)
        start = clock()
        first_candidate = self.candidates
        first_published = self.published
        changed = set()
        instances = []
        reason = None
        while True:
            while self.published < len(self.words) and len(instances) < budget['pageSize']:
                i = self.published
                self.published += 1
                if self.visible(i):
                    instances.append(
                        {
                            'id': i,
                            'type': 0,
                            'word': list(self.words[i]),
                            'matrix': self.matrices[i].ravel().tolist(),
                            'quotientState': None,
                            'templatePermutation': list(range(len(self.vertices))),
                        }
                    )
            if self.finished:
                reason = 'radiusComplete' if self.mode == 'radius' else 'depthComplete'
                break
            if len(self.words) >= budget['maxCells']:
                reason = 'cellLimit'
                break
            if self.candidates >= budget['maxCandidates']:
                reason = 'candidateLimit'
                break
            if len(instances) == budget['pageSize']:
                reason = 'pageLimit'
                break
            if self.candidates - first_candidate >= budget['candidatesPerPage']:
                reason = 'workPageLimit'
                break
            if len(changed) >= MAX_NEIGHBOR_UPDATES:
                reason = 'bytePageLimit'
                break
            if (clock() - start) * 1000 >= budget['timeMs']:
                reason = 'timeLimit'
                break
            edge = (self.cell_index, self.face_index)
            reason = self.step(budget)
            if reason:
                break
            changed.add(edge)
        rows = []
        emitted = {row['id'] for row in instances}
        for i, f in sorted(changed | {(i, f) for i in emitted for f in range(len(self.generators))}):
            rows.append(
                self.links.get(
                    (i, f),
                    {
                        'cell': i,
                        'face': f,
                        'toCell': None,
                        'toFace': None,
                        'vertexPermutation': None,
                        'status': 'unexpanded',
                    },
                )
            )
        counts = Counter(self.depths)
        complete = min(self.depth, self.depths[self.cell_index] if self.cell_index < len(self.words) else self.depth)
        resumable = reason in ('pageLimit', 'workPageLimit', 'bytePageLimit', 'timeLimit') and (
            not self.finished or self.published < len(self.words)
        )
        return {
            'instances': instances,
            'neighbors': rows,
            'coverage': {
                'mode': self.mode,
                'sampled': False,
                'definition': 'every cell meeting the observer ball'
                if self.mode == 'radius'
                else 'face-adjacency layers',
                'complete': self.finished and self.published == len(self.words),
                'observer': self.observer[:, 0].tolist(),
                'radius': self.radius,
                'requestedDepth': self.depth,
                'acceptedCells': len(self.words),
                'visitedCandidates': self.candidates,
                'publishedThrough': self.published,
                'pageScanned': self.published - first_published,
                'frontierCount': len(self.words) - self.cell_index,
                'completedLayers': list(range(complete + 1)) if self.mode == 'complete-depth' else [0],
                'ringCounts': [counts[i] for i in range(self.depth + 1)],
                'stopReason': reason,
                'resumable': resumable,
                'estimatedBytes': estimated_bytes(len(self.words), self.candidates),
            },
            'residuals': dict(self.residuals),
            'checkpoint': self.checkpoint() if resumable else None,
        }
