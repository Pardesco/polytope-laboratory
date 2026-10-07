"""Approximate intersections of winding-filled source faces with a hyperplane.

The result is a surface intersection, not a section of an asserted solid.
In 4D this retains the intersected 2-faces as curves and coplanar faces;
it does not infer filled 3-cells or replace source cycles by a convex hull.
"""
from itertools import product
from collections import defaultdict
import math
import uuid

import numpy as np

from .geometry import GeometryError, TOLERANCE, identity, points_array, rank, validate

MAX_FACE_VERTICES = 512
MAX_FACE_INCIDENCES = 500000
MAX_SECTION_VERTICES = 20000
MAX_SECTION_EDGES = 100000


def _frame(points):
    cloud = points - points[0]
    scale = float(np.max(np.linalg.norm(cloud, axis=1)))
    if not scale:
        raise GeometryError('Source face has affine dimension below two.')
    normalized = cloud / scale
    _, singular, vt = np.linalg.svd(normalized, full_matrices=False)
    if len(singular) < 2 or singular[1] <= TOLERANCE:
        raise GeometryError('Source face has affine dimension below two.')
    basis = vt[:2].T
    local = normalized @ basis
    if np.max(np.linalg.norm(normalized - local @ basis.T, axis=1)) > TOLERANCE * 4:
        raise GeometryError('Source face is nonplanar.')
    return local, basis, scale


def _inside(point, cycle, rule):
    """Half-open horizontal ray test: vertices are counted exactly once."""
    winding = 0
    x, y = point
    for a, b in zip(cycle, np.roll(cycle, -1, axis=0)):
        cross = (b[0]-a[0])*(y-a[1])-(b[1]-a[1])*(x-a[0])
        if a[1] <= y < b[1] and cross > 0:
            winding += 1
        elif b[1] <= y < a[1] and cross < 0:
            winding -= 1
    return winding != 0 if rule == 'nonzero' else winding % 2 != 0


def generalized_section(model, normal=None, offset=0, fill_rule='nonzero'):
    if fill_rule not in ('nonzero', 'even-odd'):
        raise GeometryError('Face fill rule must be nonzero or even-odd.')
    d = model.get('embeddingDimension', model.get('dimension'))
    if d not in (3, 4) or model.get('dimension') not in (3, 4):
        raise GeometryError('Generalized surface sections reduce 3D to 2D or 4D to 3D.')
    if sum(len(f) for f in model.get('faces', [])) > MAX_FACE_INCIDENCES or len(model.get('edges', [])) > MAX_SECTION_EDGES:
        raise GeometryError('Generalized surface section exceeds the source-incidence resource limit.')
    if not validate(model)['passed']:
        raise GeometryError('Source incidence failed validation.')
    p = points_array(model['vertices'])
    try:
        n = np.asarray(normal if normal is not None else [0]*(d-1)+[1], dtype=float)
        finite_offset = math.isfinite(offset)
    except (TypeError, ValueError):
        raise GeometryError('Section requires a finite nonzero normal and finite offset.') from None
    if n.shape != (d,) or not np.isfinite(n).all() or np.max(abs(n)) == 0 or not finite_offset:
        raise GeometryError('Section requires a finite nonzero normal and finite offset.')
    n /= float(np.max(abs(n)))
    n /= np.linalg.norm(n)
    scale = max(float(np.max(np.ptp(p, axis=0))), np.finfo(float).tiny)
    tol = TOLERANCE * scale * 4
    distances = p @ n - offset
    _, _, vt = np.linalg.svd(n[None, :], full_matrices=True)
    basis = vt[1:].T
    origin = n * offset
    common = {'normal': n.tolist(), 'offset': float(offset), 'origin': origin.tolist(), 'basis': basis.tolist(),
              'sourceId': model['id'], 'semantics': 'source-face surface intersection; no filled-solid section',
              'fillRule': fill_rule}
    vertices, refs, faces, face_refs, diagnostics = [], [], [], [], []
    edges, edge_refs, bins = [], [], defaultdict(list)
    edge_map = {}
    source_edges = {tuple(sorted(edge)): i for i, edge in enumerate(model['edges'])}
    face_cells = defaultdict(list)
    for cell_id, cell in enumerate(model.get('cells', [])):
        for face in cell:
            face_cells[face].append(cell_id)

    def point_id(point, reference):
        local = (point-origin) @ basis
        key = tuple(int(math.floor(x/tol)) for x in local)
        index = None
        for delta in product((-1, 0, 1), repeat=d-1):
            for candidate in bins.get(tuple(a+b for a,b in zip(key, delta)), ()):
                if np.linalg.norm(local-vertices[candidate]) <= tol:
                    index = candidate
                    break
            if index is not None:
                break
        if index is None:
            if len(vertices) >= MAX_SECTION_VERTICES:
                raise GeometryError('Generalized surface section exceeds the output-vertex resource limit.')
            index = len(vertices)
            vertices.append(local.tolist()); refs.append([]); bins[key].append(index)
        if reference not in refs[index]:
            refs[index].append(reference)
        return index

    def add_edge(a, b, reference):
        if a == b:
            return
        key = tuple(sorted((a,b)))
        if key not in edge_map:
            if len(edges) >= MAX_SECTION_EDGES:
                raise GeometryError('Generalized surface section exceeds the output-edge resource limit.')
            edge_map[key] = len(edges); edges.append(list(key)); edge_refs.append([])
        index = edge_map[key]
        if reference not in edge_refs[index]:
            edge_refs[index].append(reference)

    # Retain boundary tangencies and coplanar source edges, including loose edges.
    for edge_id, (a,b) in enumerate(model['edges']):
        da, db = distances[a], distances[b]
        ends = []
        if abs(da) <= tol:
            ends.append(point_id(p[a], {'vertex': a, 'edge': edge_id}))
        if abs(db) <= tol:
            ends.append(point_id(p[b], {'vertex': b, 'edge': edge_id}))
        if len(ends) == 2:
            add_edge(*ends, {'edge': edge_id, 'coplanar': True})
        elif da < -tol and db > tol or db < -tol and da > tol:
            t = da/(da-db)
            point_id(p[a]+t*(p[b]-p[a]), {'edge': edge_id, 'parameter': float(t)})

    for face_id, cycle in enumerate(model['faces']):
        cloud, ds = p[cycle], distances[cycle]
        if float(np.min(ds)) > tol or float(np.max(ds)) < -tol:
            continue
        if len(cycle) > MAX_FACE_VERTICES:
            diagnostics.append({'face': face_id, 'reason': 'face exceeds vertex resource limit; boundary intersections retained'})
            continue
        if np.max(abs(ds)) <= tol:
            remap = [point_id(point, {'face': face_id, 'vertex': vertex}) for vertex, point in zip(cycle, cloud)]
            # Geometrically collapsed source IDs remain in references, but do not
            # introduce invalid repeated IDs into a display face.
            if len(set(remap)) == len(remap) and rank(np.asarray([vertices[i] for i in remap])/scale) == 2:
                faces.append(remap); face_refs.append({'face': face_id, 'cells': face_cells[face_id], 'coplanar': True})
                for a,b in zip(remap, remap[1:]+remap[:1]):
                    add_edge(a,b, {'face': face_id, 'cells': face_cells[face_id], 'coplanar': True})
            else:
                diagnostics.append({'face': face_id, 'reason': 'coplanar face has coincident projected vertices; boundary retained'})
            continue
        local, face_basis, face_scale = _frame(cloud)
        cut_normal = n @ face_basis
        if np.linalg.norm(cut_normal) <= TOLERANCE:
            # Parallel faces within tolerance have already been treated above.
            diagnostics.append({'face': face_id, 'reason': 'near-parallel face intersection unresolved'})
            continue
        direction = np.array([-cut_normal[1], cut_normal[0]])
        direction /= np.linalg.norm(direction)
        hits = []
        for i, (a,b) in enumerate(zip(cycle, cycle[1:]+cycle[:1])):
            da, db = distances[a], distances[b]
            edge_id = source_edges[tuple(sorted((a,b)))]
            if abs(da) <= tol:
                hits.append((cloud[i], local[i], {'vertex': a, 'edge': edge_id, 'face': face_id}))
            if da < -tol and db > tol or db < -tol and da > tol:
                t = da/(da-db)
                source_t = t if model['edges'][edge_id][0] == a else 1-t
                hits.append((p[a]+t*(p[b]-p[a]), local[i]+t*(local[(i+1)%len(cycle)]-local[i]),
                             {'edge': edge_id, 'parameter': float(source_t), 'face': face_id}))
        hits.sort(key=lambda hit: float(hit[1] @ direction))
        groups = []
        for point, uv, ref in hits:
            index = point_id(point, ref)
            if not groups or np.linalg.norm(uv-groups[-1][1])*face_scale > tol:
                groups.append((index,uv))
        for (a,uv_a),(b,uv_b) in zip(groups,groups[1:]):
            if _inside((uv_a+uv_b)/2, local, fill_rule):
                add_edge(a,b, {'face': face_id, 'cells': face_cells[face_id], 'fillRule': fill_rule})

    common.update({'intersection': vertices, 'sourceReferences': refs, 'edgeSourceReferences': edge_refs,
                   'faceSourceReferences': face_refs, 'diagnostics': diagnostics})
    if not vertices:
        return {'status': 'empty', 'model': None, **common}
    result = {'id': str(uuid.uuid4()), 'name': 'Surface intersection of '+model['name'], 'dimension': d-1,
              'embeddingDimension': d-1, 'interpretation': 'surface-section', 'vertices': vertices,
              'edges': edges, 'faces': faces, 'cells': [],
              'numeric': {'mode': 'float64-approximate', 'tolerance': TOLERANCE, 'certified': False,
                          'algorithm': 'source-cycle winding intervals and coplanar source faces', 'version': '0.9.0'},
              'metadata': {'fillSemantics': 'source-face-intersection', 'fillRule': fill_rule,
                           'sectionEmbedding': {k:common[k] for k in ('normal','offset','origin','basis','sourceId')},
                           'faceInterpretation': common['semantics'], 'sourceReferences': refs,
                           'edgeSourceReferences': edge_refs, 'faceSourceReferences': face_refs,
                           'diagnostics': diagnostics},
              'provenance': {'operation': 'generalized-surface-section', 'sourceId': model['id'],
                             'sourceFingerprint': identity(model), 'parameters': {'normal': n.tolist(), 'offset': float(offset), 'fill_rule': fill_rule},
                             'algorithmVersion': '0.9.0', 'convexified': False}}
    result['validation'] = validate(result)
    if not result['validation']['passed']:
        raise GeometryError('Surface intersection failed validation: '+'; '.join(result['validation']['errors']))
    result['fingerprint'] = identity(result)
    return {'status': 'surface-intersection', 'model': result, 'affineDimension': rank(np.asarray(vertices)/scale), **common}
