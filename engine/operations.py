from itertools import product, permutations
from copy import deepcopy
from collections import Counter
import math
import uuid
import numpy as np
from scipy.spatial import cKDTree
from .geometry import hull, GeometryError, points_array, rank, TOLERANCE, identity, validate, polygon_area, canonical_cycle


def require_convex(model):
    if model.get('interpretation') != 'convex-polytope':
        raise GeometryError('This operation supports convex polytopes only. Generalized/star incidence is preserved without convex substitution.')
    if not validate(model)['passed']:
        raise GeometryError('Source incidence failed validation.')


def record(result, source, operation, parameters):
    result['provenance'] = {'operation': operation, 'sourceId': source['id'], 'sourceFingerprint': source.get('fingerprint', identity(source)),
                            'parameters': parameters, 'algorithmVersion': '0.1.0'}
    return result


def dual(model, center=None, radius=1):
    require_convex(model)
    p = points_array(model['vertices'])
    center = np.mean(p, axis=0) if center is None else np.asarray(center, dtype=float)
    if center.shape != (model['dimension'],) or not np.isfinite(center).all() or not math.isfinite(radius) or radius <= 0:
        raise GeometryError('Dual requires a finite center of the correct dimension and a positive radius.')
    eq = model.get('facetEquations')
    if not eq:
        eq = hull(p)['facetEquations']
    eq = np.asarray(eq)
    offsets = -(eq[:, :-1] @ center + eq[:, -1])
    if np.min(offsets) <= TOLERANCE * max(float(np.max(np.ptp(p, axis=0))), np.finfo(float).tiny):
        raise GeometryError('Reciprocation center must lie strictly inside every supporting half-space; this choice gives an unbounded or singular polar.')
    result = hull(center + eq[:, :-1] * (radius ** 2 / offsets[:, None]), 'Dual of ' + model['name'])
    return record(result, model, 'dual', {'center': center.tolist(), 'radius': radius})


def truncate(model, amount=1/3):
    require_convex(model)
    if not math.isfinite(amount) or not 0 <= amount <= 0.5:
        raise GeometryError('Convex edge-cut truncation amount must be in [0, 0.5].')
    p = points_array(model['vertices'])
    points = [p[a] * (1 - amount) + p[b] * amount for edge in model['edges'] for a, b in (edge, edge[::-1])]
    label = 'Rectification of ' if amount == 0.5 else 'Truncation of '
    return record(hull(points, label + model['name']), model, 'truncate', {'amount': amount, 'definition': 'hull of directed edge-cut points'})


def section(model, normal=None, offset=0, fill_rule='nonzero'):
    if model.get('interpretation')=='polyhedral-region-union':
        from .stellation import section_union
        return section_union(model,normal,offset)
    if model.get('interpretation') == 'generalized-complex':
        from .generalized_sections import generalized_section
        return generalized_section(model,normal,offset,fill_rule)
    return convex_section(model,normal,offset)


def convex_section(model, normal=None, offset=0):
    require_convex(model)
    p = points_array(model['vertices'])
    d = model['dimension']
    if d not in (3, 4):
        raise GeometryError('Sections currently reduce 3D to 2D or 4D to 3D.')
    n = np.asarray(normal if normal is not None else [0] * (d - 1) + [1], dtype=float)
    if n.shape != (d,) or not np.isfinite(n).all() or np.linalg.norm(n) == 0 or not math.isfinite(offset):
        raise GeometryError('Section requires a finite nonzero normal and finite offset.')
    n = n / np.linalg.norm(n)
    scale = max(float(np.max(np.ptp(p, axis=0))), np.finfo(float).tiny)
    tol = TOLERANCE * scale
    distances = p @ n - offset
    hits, refs = [], []
    for i, (a, b) in enumerate(model['edges']):
        da, db = distances[a], distances[b]
        if abs(da) <= tol:
            hits.append(p[a]); refs.append({'vertex': a, 'edge': i})
        if abs(db) <= tol:
            hits.append(p[b]); refs.append({'vertex': b, 'edge': i})
        if (da < -tol and db > tol) or (db < -tol and da > tol):
            t = da / (da - db)
            hits.append(p[a] + t * (p[b] - p[a])); refs.append({'edge': i, 'parameter': float(t)})
    _, _, vt = np.linalg.svd(n[None, :], full_matrices=True)
    basis = vt[1:].T
    origin = n * offset
    common = {'normal': n.tolist(), 'offset': offset, 'origin': origin.tolist(), 'basis': basis.tolist(), 'sourceId': model['id']}
    if not hits:
        return {'status': 'empty', 'model': None, 'intersection': [], **common}
    hits = np.asarray(hits)
    # Merge edge hits at vertices without altering the original model.
    unique, source_refs = [], []
    for h, ref in zip(hits, refs):
        index = next((i for i, q in enumerate(unique) if np.linalg.norm(h - q) <= tol), None)
        if index is None:
            unique.append(h); source_refs.append([ref])
        else:
            source_refs[index].append(ref)
    local = (np.asarray(unique) - origin) @ basis
    actual_rank = rank(local / scale)
    if actual_rank < d - 1:
        return {'status': 'degenerate', 'model': None, 'intersection': local.tolist(), 'affineDimension': actual_rank, 'sourceReferences': source_refs, **common}
    result = hull(local, f'Section of {model["name"]}')
    used = result['provenance']['extremeInputIndices']
    record(result, model, 'section', {'normal': n.tolist(), 'offset': offset})
    result['metadata']['sectionEmbedding'] = common
    return {'status': 'full-dimensional', 'model': result, 'intersection': local.tolist(), 'sourceReferences': [source_refs[i] for i in used], **common}


def vertex_figure(model, vertex=0, fraction=0.15):
    require_convex(model)
    p = points_array(model['vertices'])
    if not 0 <= vertex < len(p) or not 0 < fraction < 1:
        raise GeometryError('Choose an existing vertex and a cut fraction strictly between 0 and 1.')
    direction = p.mean(axis=0) - p[vertex]
    direction /= np.linalg.norm(direction)
    projection = (p - p[vertex]) @ direction
    positive = projection[projection > TOLERANCE * np.max(np.ptp(p, axis=0))]
    if not len(positive) or np.min(projection) < -TOLERANCE:
        raise GeometryError('Cannot isolate this vertex using the centroid direction.')
    offset = float(p[vertex] @ direction + fraction * min(positive))
    result = section(model, direction, offset)
    if result['model']:
        result['model']['name'] = f'Vertex figure {vertex} of {model["name"]}'
        record(result['model'], model, 'vertex-figure', {'vertex': vertex, 'fraction': fraction, 'definition': 'local convex slicing realization'})
    return result


def extrude(model, height=2):
    require_convex(model)
    if model['dimension'] not in (2, 3) or not math.isfinite(height) or height <= 0:
        raise GeometryError('Extrusion requires a 2D/3D convex base and positive finite height.')
    p = [v + [s * height / 2] for s in (-1, 1) for v in model['vertices']]
    return record(hull(p, 'Prism over ' + model['name']), model, 'extrude', {'height': height})


def transform(model, matrix=None, translation=None, scale=1):
    d = model['embeddingDimension']
    a = np.eye(d) if matrix is None else np.asarray(matrix, dtype=float)
    t = np.zeros(d) if translation is None else np.asarray(translation, dtype=float)
    if a.shape != (d, d) or t.shape != (d,) or not np.isfinite(a).all() or not np.isfinite(t).all() or not math.isfinite(scale) or scale == 0 or abs(np.linalg.det(a)) < 1e-12:
        raise GeometryError('Transform requires a nonsingular finite matrix, finite translation, and nonzero scale.')
    result = deepcopy(model)
    result.pop('rationalCoordinates', None)
    result.pop('rationalFacetEquations', None)
    result.pop('certificate', None)
    result['numeric'] = {**model['numeric'], 'mode':'float64-approximate', 'certified':False,
                         'inputInterpretation':'Float affine transform; any source rational guarantee is retained only in provenance.'}
    result.update({'id': str(uuid.uuid4()), 'name': 'Transform of ' + model['name'], 'vertices': ((np.asarray(model['vertices']) @ a.T) * scale + t).tolist()})
    if d==3 and np.linalg.det(a)*scale**3<0:
        result['faces']=[list(reversed(face)) for face in result['faces']]
    result.pop('facetEquations', None)
    result.pop('measure', None)
    if model.get('interpretation')=='polyhedral-region-union':
        result['convexPieces']=[transform(piece,matrix=a,translation=t,scale=scale) for piece in model['convexPieces']]
        result['measure']={'content':sum(piece['measure']['content'] for piece in result['convexPieces']),
                           'boundaryMeasure':sum(polygon_area(np.asarray(result['vertices'])[face]) for face in result['faces']),
                           'dimension':3,'units':'model-units','definition':'disjoint-interior convex-region volume sum and exposed facet area'}
    elif model.get('interpretation')=='planar-region-union':
        points=np.asarray(result['vertices']);counts=Counter(tuple(sorted((u,v))) for f in result['faces'] for u,v in zip(f,f[1:]+f[:1]))
        result['measure']={'content':sum(polygon_area(points[f]) for f in result['faces']),
                           'boundaryMeasure':sum(float(np.linalg.norm(points[u]-points[v])) for (u,v),count in counts.items() if count==1),
                           'dimension':2,'units':'model-units'}
    if result['interpretation'] == 'convex-polytope':
        computed = hull(result['vertices'])
        result['measure'] = computed['measure']
        # Equations follow existing facet order by matching vertex sets.
        fmap = {tuple(sorted(f)): eq for f, eq in zip(computed['facetVertices'], computed['facetEquations'])}
        result['facetEquations'] = [fmap[tuple(sorted(f))] for f in result['facetVertices']]
    result['fingerprint'] = identity(result)
    result['validation'] = validate(result)
    return record(result, model, 'transform', {'matrix': a.tolist(), 'translation': t.tolist(), 'scale': scale})


def signed_symmetry(model):
    """Verify a finite signed-axis-permutation subgroup, including full incidence.

    Completeness is asserted only for the analytic cube/cross reference family;
    this is not a general symmetry enumeration algorithm.
    """
    if not validate(model)['passed']:
        raise GeometryError('Source model failed validation.')
    p = points_array(model['vertices'])
    d = p.shape[1]
    center = p.mean(axis=0)
    p = p - center
    tree = cKDTree(p)
    scale = max(float(np.max(np.ptp(p, axis=0))), np.finfo(float).tiny)
    face_cycles=[canonical_cycle(f) for f in model['faces']]
    faces=Counter(face_cycles)
    cells=Counter(tuple(sorted(face_cycles[f] for f in c)) for c in model.get('cells',[]))
    edges=Counter(tuple(sorted(e)) for e in model['edges'])
    actions = []
    for perm in permutations(range(d)):
        for signs in product((-1, 1), repeat=d):
            transformed = p[:, perm] * signs
            dist, mapping = tree.query(transformed)
            if max(dist) > TOLERANCE * scale or len(set(mapping)) != len(p):
                continue
            if Counter(tuple(sorted(mapping[e])) for e in model['edges'])!=edges:
                continue
            mapped_cycles=[canonical_cycle(mapping[f].tolist()) for f in model['faces']]
            if Counter(mapped_cycles)!=faces:
                continue
            if Counter(tuple(sorted(mapped_cycles[f] for f in c)) for c in model.get('cells',[]))!=cells:
                continue
            matrix = np.eye(d)[list(perm)] * np.asarray(signs)[:, None]
            actions.append({'permutation': mapping.tolist(), 'matrix': matrix.tolist(), 'determinant': round(float(np.linalg.det(matrix)))})
    # Completeness depends on the supplied metric vertex set, never a mutable
    # catalog label. The cube/cross metric group is exactly the signed group.
    tol=TOLERANCE*scale
    cube=len(p)==2**d and np.max(np.abs(np.abs(p)-np.max(np.abs(p))))<=tol
    cross=len(p)==2*d and np.all(np.sum(np.abs(p)>tol,axis=1)==1) and np.ptp(np.linalg.norm(p,axis=1))<=tol
    complete=(cube or cross) and len(actions)==math.factorial(d)*2**d
    return {'order': len(actions), 'properOrder': sum(a['determinant'] == 1 for a in actions), 'complete': complete,
            'status': 'complete for supplied cube/cross metric vertex set' if complete else 'verified signed-coordinate subgroup; full group not enumerated',
            'numericMode': 'float64-approximate', 'center': center.tolist(), 'actions': actions,
            'checks': ['vertex bijection', 'metric action', 'edge multiplicity', 'ordered face cycles', 'cell face incidence']}


def measure(model, kind, indices):
    p = points_array(model['vertices'])
    if any(type(i) is not int or not 0 <= i < len(p) for i in indices):
        raise GeometryError('Measurement vertex IDs are outside this model.')
    if kind == 'distance' and len(indices) == 2:
        value = float(np.linalg.norm(p[indices[1]] - p[indices[0]]))
        return {'value': value, 'units': 'model-units', 'definition': 'intrinsic Euclidean vertex distance', 'indices': indices}
    if kind == 'angle' and len(indices) == 3:
        a, b, c = p[indices]
        u, v = a-b, c-b
        if np.linalg.norm(u) == 0 or np.linalg.norm(v) == 0:
            raise GeometryError('Angle is undefined for a zero-length ray.')
        return {'value': math.degrees(math.acos(float(np.clip(np.dot(u, v) / np.linalg.norm(u) / np.linalg.norm(v), -1, 1)))),
                'units': 'degrees', 'definition': 'unsigned intrinsic angle, middle vertex is apex', 'indices': indices}
    raise GeometryError('Distance needs two vertex IDs; angle needs three.')
