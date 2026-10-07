"""Convex incidence reconstruction, numerical validation, and intrinsic measures.

Qhull triangulates facets. We merge them by their full support-vertex sets,
then intersect true facets to recover ridges; display triangles never define
the mathematical identity. All geometric predicates here are float64, not exact.
"""
from collections import Counter
from fractions import Fraction
from itertools import combinations
import hashlib
import json
import math
import uuid

import numpy as np
from scipy.spatial import ConvexHull, QhullError

VERSION = '0.1.0'
TOLERANCE = 1e-8
MAX_VERTICES = 20000


class GeometryError(ValueError):
    pass


def points_array(points, dimensions=(2, 3, 4)):
    try:
        p = np.asarray(points, dtype=float)
    except (ValueError, TypeError) as exc:
        raise GeometryError('Coordinates must be a rectangular numeric array.') from exc
    if p.ndim != 2 or p.shape[1] not in dimensions:
        raise GeometryError('Expected coordinates in dimension ' + ', '.join(map(str, dimensions)) + '.')
    if not len(p) or len(p) > MAX_VERTICES or not np.isfinite(p).all():
        raise GeometryError(f'Expected 1–{MAX_VERTICES} vertices with finite coordinates.')
    return p


def rank(points, tol=TOLERANCE):
    p = np.asarray(points)
    return int(np.linalg.matrix_rank(p - p[0], tol)) if len(p) > 1 else 0


def cycle(points, ids):
    ids = sorted(ids)
    p = points[ids]
    center = p.mean(axis=0)
    _, _, vt = np.linalg.svd(p - center, full_matrices=False)
    local = (p - center) @ vt[:2].T
    return [ids[i] for i in np.argsort(np.arctan2(local[:, 1], local[:, 0]))]


def polygon_area(points):
    p = np.asarray(points)
    if len(p) < 3:
        return 0.0
    _, _, vt = np.linalg.svd(p - p[0], full_matrices=False)
    q = (p - p[0]) @ vt[:2].T
    return float(abs(np.dot(q[:, 0], np.roll(q[:, 1], -1)) - np.dot(q[:, 1], np.roll(q[:, 0], -1))) / 2)


def identity(model):
    """Representation hash includes incidence and canonical float coordinates.

    Python/JavaScript JSON round trips can encode 1.0 as 1 and -0.0 as 0.
    These spellings denote the same supplied coordinates, so normalize them
    before hashing. Vertex order and every incidence remain significant.
    """
    fields = {k: model.get(k) for k in ('dimension', 'vertices', 'edges', 'faces', 'cells')}
    if fields['vertices'] is not None:
        fields['vertices']=[[float(x) if x else 0.0 for x in row] for row in fields['vertices']]
    if model.get('rationalCoordinates'):
        fields['rationalCoordinates']=model['rationalCoordinates']
    if model.get('convexPieces'):
        fields['convexPieces']=[identity(piece) for piece in model['convexPieces']]
    return hashlib.sha256(json.dumps(fields, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def canonical_cycle(face):
    """Cycle equality up to rotation/reversal, preserving winding order otherwise."""
    f = tuple(face)
    variants = [f[i:] + f[:i] for i in range(len(f))]
    rev = f[::-1]
    variants += [rev[i:] + rev[:i] for i in range(len(rev))]
    return min(variants)


def hull(points, name='Convex hull', metadata=None):
    p = points_array(points)
    d = p.shape[1]
    scale = float(np.max(np.ptp(p, axis=0)))
    if scale == 0:
        raise GeometryError('All points coincide; a full-dimensional hull does not exist.')
    origin = p.mean(axis=0)
    normalized = (p - origin) / scale
    if rank(normalized) != d:
        raise GeometryError(f'Input has affine dimension {rank(normalized)}, expected {d}. Use a lower-dimensional embedding.')
    try:
        q = ConvexHull(normalized)
    except QhullError as exc:
        raise GeometryError('Hull predicates could not resolve this input. Rescale or remove near-degeneracies.') from exc
    used = sorted(int(i) for i in q.vertices)
    # Recompute with only extreme vertices: incidence IDs must be compact.
    p = p[used]
    normalized = (p - origin) / scale
    q = ConvexHull(normalized)
    supports = {}
    # Qt triangles/tetrahedra repeat the original facet equation exactly.
    # Test each distinct equation once, in its original order. No rounded
    # plane key or local simplex replaces full supporting vertex incidence.
    _,first_equations=np.unique(q.equations,axis=0,return_index=True)
    for eq in q.equations[np.sort(first_equations)]:
        key = tuple(np.flatnonzero(np.abs(normalized @ eq[:-1] + eq[-1]) <= TOLERANCE).tolist())
        if len(key) >= d:
            supports.setdefault(key, eq)
    facet_vertices = sorted(supports)
    equations = [[*supports[f][:-1], float(supports[f][-1] * scale - np.dot(supports[f][:-1], origin))] for f in facet_vertices]
    cells = []
    if d == 2:
        faces = [cycle(p, range(len(p)))]
    elif d == 3:
        faces = [cycle(p, f) for f in facet_vertices]
        # Orient each ordinary convex surface outward.
        for i, f in enumerate(faces):
            normal = np.cross(p[f[1]] - p[f[0]], p[f[2]] - p[f[0]])
            if np.dot(normal, equations[i][:-1]) < 0:
                faces[i] = list(reversed(f))
    else:
        facets = [set(f) for f in facet_vertices]
        ridges = {}
        # Only facet pairs sharing a vertex can meet in a ridge.
        incident = [[] for _ in p]
        for i, f in enumerate(facet_vertices):
            for v in f:
                incident[v].append(i)
        pairs = set(pair for fs in incident for pair in combinations(fs, 2))
        for a, b in sorted(pairs):
            intersection = facets[a] & facets[b]
            if len(intersection) >= 3 and rank(normalized[sorted(intersection)]) == 2:
                ridges.setdefault(tuple(sorted(intersection)),set()).update((a,b))
        faces = [cycle(p, f) for f in sorted(ridges)]
        # The facet pair that generated a ridge supplies its complete cell
        # incidence directly, avoiding a face-by-cell Cartesian scan.
        cells=[[] for _ in facets]
        for i,key in enumerate(sorted(ridges)):
            for cell in sorted(ridges[key]):cells[cell].append(i)
    edge_set = {tuple(sorted((f[i], f[(i + 1) % len(f)]))) for f in faces for i in range(len(f))}
    model = {
        'id': str(uuid.uuid4()), 'name': name, 'dimension': d,
        'embeddingDimension': d, 'interpretation': 'convex-polytope',
        'vertices': p.tolist(), 'edges': [list(e) for e in sorted(edge_set)],
        'faces': faces, 'cells': cells, 'facetVertices': [list(f) for f in facet_vertices],
        'facetEquations': equations,
        'numeric': {'mode': 'float64-approximate', 'tolerance': TOLERANCE,
                    'predicateScale': scale, 'algorithm': 'Qhull + support incidence',
                    'version': VERSION, 'certified': False},
        'metadata': metadata or {},
        'provenance': {'operation': 'convex-hull', 'algorithmVersion': VERSION,
                       'inputVertexCount': len(points), 'extremeInputIndices': used,
                       'supportEquationsTested':len(first_equations),'triangulatedFacetCount':len(q.equations)},
        'measure': {'content': float(q.volume * scale ** d),
                    'boundaryMeasure': float(q.area * scale ** (d - 1)),
                    'dimension': d, 'units': 'model-units'},
    }
    model['fingerprint'] = identity(model)
    model['validation'] = validate(model)
    if not model['validation']['passed']:
        raise GeometryError('Hull incidence reconstruction failed: ' + '; '.join(model['validation']['errors']))
    return model


def validate(model):
    errors, warnings = [], []
    try:
        d = model['dimension']
        if d not in (2, 3, 4):
            raise GeometryError('Supported intrinsic dimensions are 2, 3 and 4.')
        p = points_array(model['vertices'])
        if p.shape[1] != model.get('embeddingDimension', d):
            errors.append('Embedding dimension does not match coordinates.')
        edges, faces, cells = model['edges'], model['faces'], model.get('cells', [])
        convex = model.get('interpretation') == 'convex-polytope'
        for i, e in enumerate(edges):
            if len(e) != 2 or any(type(v) is not int or not 0 <= v < len(p) for v in e) or e[0] == e[1]:
                errors.append(f'Edge {i} has invalid endpoints.')
        edge_set = {tuple(sorted(e)) for e in edges if len(e) == 2 and all(type(v) is int for v in e)}
        if len(edge_set) != len(edges):
            errors.append('Duplicate edges.')
        boundary_count = Counter()
        normalized = (p - p.mean(axis=0)) / max(float(np.max(np.ptp(p, axis=0))), np.finfo(float).tiny)
        for i, f in enumerate(faces):
            if len(f) < 3 or any(type(v) is not int or not 0 <= v < len(p) for v in f) or len(set(f)) != len(f):
                errors.append(f'Face {i} has an invalid boundary cycle.')
                continue
            if rank(normalized[f]) != 2:
                errors.append(f'Face {i} is not a planar polygon.')
            elif convex or model.get('interpretation') in ('polyhedral-region-union','planar-region-union'):
                cloud = normalized[f] - normalized[f[0]]
                _, _, vt = np.linalg.svd(cloud, full_matrices=False)
                plane = cloud @ vt[:2].T
                turns = [float(np.cross(plane[(j+1)%len(f)]-plane[j], plane[(j+2)%len(f)]-plane[(j+1)%len(f)])) for j in range(len(f))]
                if min(turns) < -TOLERANCE and max(turns) > TOLERANCE or polygon_area(plane) <= TOLERANCE**2 or canonical_cycle(f)!=canonical_cycle(cycle(normalized,f)):
                    errors.append(f'Convex face {i} has an inconsistent or zero-area cycle.')
            for a, b in zip(f, f[1:] + f[:1]):
                key = tuple(sorted((a, b)))
                boundary_count[key] += 1
                if key not in edge_set:
                    errors.append(f'Face {i} references a missing edge {key}.')
        face_counts = Counter()
        for i, cell in enumerate(cells):
            if not cell or len(set(cell)) != len(cell) or any(type(f) is not int or not 0 <= f < len(faces) for f in cell):
                errors.append(f'Cell {i} has invalid face IDs.')
                continue
            verts = set(v for f in cell for v in faces[f])
            ce = Counter(tuple(sorted((a, b))) for f in cell for a, b in zip(faces[f], faces[f][1:] + faces[f][:1]))
            if any(n != 2 for n in ce.values()):
                if convex:
                    errors.append(f'Cell {i} has an open or nonmanifold edge link.')
                else:
                    warnings.append(f'Generalized cell {i}: edge links do not all have two face incidences; manifold status is not asserted.')
            if len(verts) - len(ce) + len(cell) != 2:
                if convex:
                    errors.append(f'Cell {i} fails convex 3-cell Euler check.')
                else:
                    warnings.append(f'Generalized cell {i}: Euler characteristic differs from a convex 3-cell boundary.')
            if rank(normalized[sorted(verts)]) != 3:
                errors.append(f'Cell {i} is not affine dimension 3.')
            face_counts.update(cell)
        euler = len(p) - len(edges) + len(faces) - len(cells)
        if convex:
            expected = {2: 1, 3: 2, 4: 0}[d]
            if euler != expected:
                errors.append(f'Euler characteristic is {euler}; expected {expected}.')
            if d == 3 and any(n != 2 for n in boundary_count.values()):
                errors.append('A boundary edge does not belong to exactly two faces.')
            if d == 4 and (len(face_counts) != len(faces) or any(n != 2 for n in face_counts.values())):
                errors.append('A ridge does not belong to exactly two cells.')
            if rank(normalized) != d:
                errors.append('Coordinates do not span the declared intrinsic dimension.')
            if model.get('facetEquations') is not None:
                eq = np.asarray(model['facetEquations'], dtype=float)
                fv = model.get('facetVertices', [])
                if eq.shape != (len(fv), p.shape[1]+1) or not np.isfinite(eq).all() or not len(eq):
                    errors.append('Invalid supporting-hyperplane table.')
                else:
                    if d==3:
                        expected_facets={frozenset(f) for f in faces}
                    elif d==4:
                        expected_facets={frozenset(v for f in c for v in faces[f]) for c in cells}
                    else:
                        expected_facets={frozenset(e) for e in edges}
                    if len(fv)!=len(expected_facets) or {frozenset(f) for f in fv}!=expected_facets:
                        errors.append('Supporting-hyperplane table does not cover the complete source facet incidence.')
                    for i, (equation, verts) in enumerate(zip(eq, fv)):
                        norm = np.linalg.norm(equation[:-1])
                        if not norm or any(type(v) is not int or not 0 <= v < len(p) for v in verts):
                            errors.append(f'Facet {i} has invalid support data.'); continue
                        residual = (p @ equation[:-1] + equation[-1]) / norm
                        tol = TOLERANCE * max(float(np.max(np.ptp(p, axis=0))), np.finfo(float).tiny) * 4
                        if max(residual) > tol or max(abs(residual[verts])) > tol:
                            errors.append(f'Facet {i} fails supporting-hyperplane checks.')
        else:
            warnings.append('Generalized incidence: convex manifold/Euler assertions were not applied.')
        if model.get('interpretation')=='polyhedral-region-union':
            pieces=model.get('convexPieces',[])
            if not isinstance(pieces,list) or not 1<=len(pieces)<=2048:
                errors.append('Solid union requires 1–2,048 convex pieces.')
            else:
                for i,piece in enumerate(pieces):
                    if piece.get('interpretation')!='convex-polytope' or piece.get('dimension')!=3 or not validate(piece)['passed']:
                        errors.append(f'Solid union piece {i} is not a valid convex 3D boundary.')
        if model.get('numeric', {}).get('certified') is not True:
            warnings.append('Geometry is approximate. Structural checks are evidence, not an exact certificate.')
        elif model.get('numeric',{}).get('mode')=='rational-exact':
            rp=[[Fraction(str(x)) for x in row] for row in model.get('rationalCoordinates',[])]
            if len(rp)!=len(p) or any(len(row)!=p.shape[1] for row in rp):
                errors.append('Exact coordinate table does not match display geometry.')
            elif not np.allclose(np.asarray(rp,dtype=float),p,rtol=1e-14,atol=0):
                errors.append('Display geometry disagrees with exact coordinates.')
            rq=model.get('rationalFacetEquations',[])
            fv=model.get('facetVertices',[])
            if len(rq)!=len(fv):
                errors.append('Exact supporting-plane table is incomplete.')
            elif len(rp)==len(p):
                for plane,verts in zip(rq,fv):
                    plane=[Fraction(str(x)) for x in plane]
                    if len(plane)!=p.shape[1]+1 or not any(plane[:-1]):
                        errors.append('Invalid exact support plane.');continue
                    values=[sum(a*b for a,b in zip(row,plane[:-1]))+plane[-1] for row in rp]
                    if max(values)>0 or any(values[v] for v in verts):
                        errors.append('Exact supporting-plane certificate fails.')
            warnings.append('Exact certification applies to supplied rational hull topology; display and measurements remain approximate.')
        return {'passed': not errors, 'errors': errors[:100], 'warnings': warnings,
                'eulerCharacteristic': euler, 'checks': ['index bounds', 'face cycles', 'planarity', 'cell links', 'applicable Euler relations', 'supplied supporting hyperplanes'],
                'algorithmVersion': VERSION}
    except (ValueError, KeyError, TypeError, IndexError) as exc:
        return {'passed': False, 'errors': [str(exc)], 'warnings': warnings, 'algorithmVersion': VERSION}


def intrinsic_measures(model):
    """Geometry is authoritative; cached content/boundary scalars are ignored."""
    interpretation=model.get('interpretation');p=points_array(model['vertices']);d=model['dimension']
    if interpretation=='convex-polytope':
        reference=hull(p)
        same=len(reference['vertices'])==len(p) and Counter(canonical_cycle(f) for f in reference['faces'])==Counter(canonical_cycle(f) for f in model['faces'])
        if d==4:
            source=Counter(tuple(sorted(canonical_cycle(model['faces'][i]) for i in cell)) for cell in model['cells'])
            target=Counter(tuple(sorted(canonical_cycle(reference['faces'][i]) for i in cell)) for cell in reference['cells'])
            same= same and source==target
        if not same:raise GeometryError('Claimed convex incidence differs from the independently reconstructed hull; convex measures are unavailable.')
        return reference['measure']
    if interpretation=='polyhedral-region-union':
        return {'content':sum(intrinsic_measures(piece)['content'] for piece in model['convexPieces']),
                'boundaryMeasure':sum(polygon_area(p[f]) for f in model['faces']),'dimension':3,'units':'model-units',
                'definition':'recomputed convex-piece content sum in declared disjoint-interior domain; exposed ordinary-face area'}
    if interpretation=='planar-region-union':
        counts=Counter(tuple(sorted((a,b))) for f in model['faces'] for a,b in zip(f,f[1:]+f[:1]))
        return {'content':sum(polygon_area(p[f]) for f in model['faces']),
                'boundaryMeasure':sum(float(np.linalg.norm(p[a]-p[b])) for (a,b),count in counts.items() if count==1),
                'dimension':2,'units':'model-units','definition':'recomputed declared planar-cell area sum; area-cell perimeter excludes isolated strata'}
    return None


def analyze(model):
    report = validate(model)
    if not report['passed']:
        raise GeometryError('Cannot measure invalid incidence: ' + '; '.join(report['errors']))
    p = points_array(model['vertices'])
    center = p.mean(axis=0)
    lengths = [float(np.linalg.norm(p[b] - p[a])) for a, b in model['edges']]
    radii = np.linalg.norm(p - center, axis=1)
    areas = [polygon_area(p[f]) for f in model['faces']]
    types = Counter(map(len, model['faces']))
    valences = Counter(v for e in model['edges'] for v in e)
    dihedral=None
    if model.get('interpretation')=='convex-polytope' and model['dimension'] in (3,4):
        from .measurements import dihedrals
        details=dihedrals(model);dihedral={k:v for k,v in details.items() if k!='records'}
    return {'counts': {'vertices': len(p), 'edges': len(lengths), 'faces': len(areas), 'cells': len(model.get('cells', []))},
            'centroid': center.tolist(), 'centroidDefinition': 'vertex arithmetic mean',
            'edgeLength': {'min': min(lengths, default=0), 'max': max(lengths, default=0), 'mean': float(np.mean(lengths)) if lengths else 0},
            'vertexRadius': {'min': float(min(radii)), 'max': float(max(radii))},
            'faceArea': {'min': min(areas, default=0), 'max': max(areas, default=0), 'sum': sum(areas),
                         'definition':'ordinary convex polygon area' if model.get('interpretation')=='convex-polytope' else 'absolute algebraic area of ordered cycle; no star fill interpretation'},
            'faceTypes': dict(sorted(types.items())), 'vertexValences': dict(sorted(Counter(valences.values()).items())),
            'measure': intrinsic_measures(model), 'measureAuthority':'source coordinates and full incidence; cached model.measure ignored',
            'dihedral':dihedral,'validation': report, 'numeric': model.get('numeric')}
