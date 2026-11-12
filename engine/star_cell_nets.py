"""Rigid whole-cell star nets with incidence orientation and literal cycles."""

from collections import defaultdict
import math
import numpy as np
from .geometry import GeometryError
from .dual_morph_expansion import _require
from .combinatorial_vertex_figures import source_boundary, EPS
from .generalized_nets import _simple
from .generalized_concave_cell_nets import _ordinary_cell_net


def oriented_signs(neighbors, label):
    signs = {}
    for root in range(len(neighbors)):
        if root in signs:
            continue
        signs[root] = 1
        pending = [root]
        while pending:
            a = pending.pop()
            for b, relation in neighbors[a]:
                wanted = signs[a] * relation
                _require(b not in signs or signs[b] == wanted, label + ' is nonorientable.')
                if b not in signs:
                    signs[b] = wanted
                    pending.append(b)
    return signs


def star_cell_net(model, root=0, connections=None, placements=None):
    source, original, p, boundary = source_boundary(model)
    _require(source['dimension'] == 4, 'Whole-cell star nets require intrinsic 4D cells.')
    cells = source['cells']
    faces = source['faces']
    span = float(np.max(np.ptp(original, axis=0)))
    _require(
        len(cells) <= 1024
        and max(map(len, cells)) <= 250
        and max(map(len, faces)) <= 128
        and max(map(len, boundary['cellVertices'])) <= 256
        and sum(map(len, boundary['cellVertices'])) <= 20000
        and sum(map(len, faces)) <= 100000
        and all(sum(len(faces[f]) for f in c) <= 4000 for c in cells),
        'Whole-cell star net work limits exceeded.',
    )
    frames = []
    star_faces = []
    for fi, face in enumerate(faces):
        cloud = p[face]
        _, _, axes = np.linalg.svd(cloud - cloud[0], full_matrices=False)
        u, v = axes[:2]
        xy = (cloud - cloud[0]) @ axes[:2].T
        try:
            _simple(xy, fi)
        except GeometryError:
            # Regular star cycles are admitted explicitly. Arbitrary touching,
            # retraced and irregular self-crossing polygons remain unsupported.
            radial = xy - xy.mean(axis=0)
            r = np.linalg.norm(radial, axis=1)
            sides = np.linalg.norm(np.roll(xy, -1, axis=0) - xy, axis=1)
            angles = np.arctan2(
                radial[:, 0] * np.roll(radial[:, 1], -1) - radial[:, 1] * np.roll(radial[:, 0], -1),
                np.sum(radial * np.roll(radial, -1, axis=0), axis=1),
            )
            winding = float(sum(angles) / (2 * math.pi))
            _require(
                min(r) > EPS
                and min(sides) > EPS
                and np.ptp(r) <= EPS
                and np.ptp(sides) <= EPS
                and np.ptp(angles) <= EPS
                and abs(winding) > 1.5
                and abs(winding - round(winding)) < EPS
                and math.gcd(len(face), abs(round(winding))) == 1,
                'Star-cell nets require simple planar or regular star face cycles; irregular crossing/touching faces are unsupported.',
            )
            star_faces.append(fi)
        frames.append((u, v))
    normals = []
    inwards = {}
    orientations = {}
    records = []
    for ci, (cell, ids) in enumerate(zip(cells, boundary['cellVertices'])):
        cloud = p[ids]
        _, _, axes = np.linalg.svd(cloud - cloud[0], full_matrices=False)
        normal = axes[-1]
        basis = axes[:3].T
        normals.append(normal)
        lookup = {v: i for i, v in enumerate(ids)}
        local = (cloud - cloud.mean(axis=0)) @ basis
        local_faces = [[lookup[v] for v in faces[fi]] for fi in cell]
        uses = defaultdict(list)
        raw = []
        for j, f in enumerate(local_faces):
            vector = np.sum(np.cross(local[f], np.roll(local[f], -1, axis=0)), axis=0)
            length = float(np.linalg.norm(vector))
            _require(length > EPS**2, 'Cell face has unresolved signed area.')
            raw.append(vector)
            for a, b in zip(f, f[1:] + f[:1]):
                uses[tuple(sorted((a, b)))].append((j, 1 if a < b else -1))
        neighbors = [[] for _ in cell]
        for pair in uses.values():
            _require(len(pair) == 2, 'Source cell has an open face shell.')
            (a, da), (b, db) = pair
            neighbors[a].append((b, -da * db))
            neighbors[b].append((a, -da * db))
        signs = oriented_signs(neighbors, 'Source cell boundary')
        terms = [float(local[f[0]] @ raw[j]) * signs[j] / 6 for j, f in enumerate(local_faces)]
        volume = math.fsum(terms)
        uncertainty = max(EPS**2, np.finfo(float).eps * sum(map(abs, terms)) * 64)
        _require(abs(volume) > uncertainty, 'Star cell has zero or unresolved signed orientation volume.')
        convex = True
        for j, fi in enumerate(cell):
            outward = raw[j] / np.linalg.norm(raw[j]) * signs[j] * (1 if volume > 0 else -1)
            inward = -basis @ outward
            inwards[ci, fi] = inward
            u, v = frames[fi]
            convex = convex and fi not in star_faces and bool(np.min((cloud - p[faces[fi][0]]) @ inward) >= -EPS)
            determinant = float(np.linalg.det(np.column_stack((u, v, inward, normal))))
            _require(abs(determinant) > 0.5, 'Star-cell face orientation is unresolved.')
            orientations[ci, fi] = 1 if determinant > 0 else -1
        records.append(
            {
                'id': ci,
                'sourceFaceIds': cell[:],
                'boundaryEulerCharacteristic': len(ids) - len(uses) + len(cell),
                'simplePlanarFaces': not any(fi in star_faces for fi in cell),
                'connectedOrientableBoundary': True,
                'convexBoundary': convex,
                'orientationVolume': abs(volume) * span**3,
                'orientationVolumeCertified': False,
            }
        )
    neighbors = [[] for _ in cells]
    for fi, (a, b) in enumerate(boundary['faceCells']):
        relation = -orientations[a, fi] * orientations[b, fi]
        neighbors[a].append((b, relation))
        neighbors[b].append((a, relation))
    signs = oriented_signs(neighbors, 'Source 4D cell shell')
    qualification = {
        'normals': [n * signs[i] for i, n in enumerate(normals)],
        'inwards': inwards,
        'cells': records,
        'nonconvexCells': sum(not c['convexBoundary'] for c in records),
        'faceTriangles': None,
    }
    result = _ordinary_cell_net(source, qualification, root, connections, placements)
    result.update(
        algorithmVersion='star-cell-nets-0.1.0',
        domain='closed orientable 4D incidence shell; intact cells with simple or regular star planar faces',
    )
    result['cellQualification'].update(starFacesRepresented=len(star_faces), sphericalVertexLinksRequired=False)
    return result
