"""Bounded literal tiled boundaries and isometrically creased triangular grids."""

import math
import numpy as np
from .geometry import GeometryError, identity
from .basic_solids import _length, _vector, _model


def subdivided_block(dimensions=None, subdivisions=None, unit='model'):
    dimensions = _vector([1, 1, 1] if dimensions is None else dimensions, 3, 'Block dimensions')
    counts = [1, 1, 1] if subdivisions is None else subdivisions
    if type(counts) is not list or len(counts) != 3 or any(type(n) is not int or not 1 <= n <= 32 for n in counts):
        raise GeometryError('Block subdivisions require three integers from 1 to 32.')
    counts = list(counts)
    x, y, z = counts
    if 2 * (x * y + x * z + y * z) + 2 > 4000:
        raise GeometryError('Block boundary exceeds the 4000-vertex limit.')
    if min(d / n for d, n in zip(dimensions, counts)) / max(dimensions) <= 1e-7:
        raise GeometryError('Block tile size is unresolved relative to its largest dimension.')
    vertices = []
    indices = {}
    faces = []

    def vertex(p):
        if p not in indices:
            indices[p] = len(vertices)
            vertices.append([d * i / n for d, i, n in zip(dimensions, p, counts)])
        return indices[p]

    for axis in range(3):
        u, v = (axis + 1) % 3, (axis + 2) % 3
        for side in (0, counts[axis]):
            for i in range(counts[u]):
                for j in range(counts[v]):
                    face = []
                    for a, b in ((i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1)):
                        p = [0, 0, 0]
                        p[axis] = side
                        p[u] = a
                        p[v] = b
                        face.append(vertex(tuple(p)))
                    faces.append(list(reversed(face)) if side == 0 else face)
    parameters = {'dimensions': dimensions, 'subdivisions': counts}
    result = _model('block', vertices, faces, parameters, unit, False)
    result['metadata']['basicConstruction'].update(
        boundaryArea=2 * sum(dimensions[a] * dimensions[b] for a, b in ((0, 1), (0, 2), (1, 2))),
        enclosedVolume=math.prod(dimensions),
        unitCellCount=x * y * z,
        definition='Exterior tiled cuboid boundary only; internal cell faces are omitted. Equal dimension/subdivision ratios give cubes.',
    )
    return result


def triangular_grid(subdivisions=4, edge_length=1, shape='triangle', fold_angle=0, unit='model'):
    n = subdivisions
    edge = _length(edge_length, 'Small triangle edge')
    if type(n) is not int or not 1 <= n <= 50:
        raise GeometryError('Triangular grid subdivisions must be an integer from 1 to 50.')
    if shape not in ('triangle', 'hexagon'):
        raise GeometryError('Choose a triangle or hexagon grid boundary.')
    if type(fold_angle) not in (int, float) or not -170 <= fold_angle <= 170 or not math.isfinite(fold_angle):
        raise GeometryError('Grid fold angle must be finite between -170 and 170 degrees.')
    if fold_angle and shape == 'triangle' and n < 2:
        raise GeometryError('A folded triangle grid needs at least two subdivisions.')
    if shape == 'hexagon' and 3 * n * (n + 1) + 1 > 4000:
        raise GeometryError('Hexagon grid exceeds the 4000-vertex limit (maximum 36 subdivisions).')
    coordinates = (
        [(i, j) for j in range(n + 1) for i in range(n + 1 - j)]
        if shape == 'triangle'
        else [(i, j) for j in range(-n, n + 1) for i in range(-n, n + 1) if abs(i + j) <= n]
    )
    indices = {p: i for i, p in enumerate(coordinates)}
    faces = []
    anchors = (
        coordinates if shape == 'triangle' else [(i, j) for j in range(-n - 1, n + 1) for i in range(-n - 1, n + 1)]
    )
    for i, j in anchors:
        for triangle in (((i, j), (i + 1, j), (i, j + 1)), ((i + 1, j), (i + 1, j + 1), (i, j + 1))):
            if all(p in indices for p in triangle):
                faces.append([indices[p] for p in triangle])
    planar = [[edge * (i + j / 2), edge * j * math.sqrt(3) / 2] for i, j in coordinates]
    crease = edge * (n // 2 if shape == 'triangle' else 0) * math.sqrt(3) / 2
    angle = math.radians(fold_angle)
    vertices = (
        [
            [x, crease + (y - crease) * math.cos(angle), (y - crease) * math.sin(angle)] if y < crease else [x, y, 0]
            for x, y in planar
        ]
        if fold_angle
        else planar
    )
    parameters = {'subdivisions': n, 'edge_length': edge}
    if shape != 'triangle':
        parameters['shape'] = shape
    if fold_angle:
        parameters['fold_angle'] = float(fold_angle)
    result = _model('triangular-grid', vertices, faces, parameters, unit, False)
    points = np.asarray(vertices)
    residual = max(abs(float(np.linalg.norm(points[a] - points[b])) / edge - 1) for a, b in result['edges'])
    if residual > 1e-8:
        raise GeometryError('Grid fold failed the relative edge-length check.')
    result['metadata']['basicConstruction'].update(
        shape=shape,
        foldAngleDegrees=float(fold_angle),
        creaseY=crease,
        maximumRelativeEdgeResidual=residual,
        definition='Open triangular mesh; points below the horizontal lattice-row crease rotate rigidly about that row. No enclosed solid inferred.',
    )
    result['fingerprint'] = identity(result)
    return result
