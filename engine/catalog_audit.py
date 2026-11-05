"""Reproducible, read-only catalog audit: python -m engine.catalog_audit --help."""
from collections import Counter, defaultdict, deque
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date
from fractions import Fraction
from functools import lru_cache
from itertools import combinations
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import re
import subprocess
import sys
import time

import numpy as np
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parents[1]
KINDS = ('vertices', 'edges', 'faces', 'cells')
TOLERANCE = 1e-9
VERSION = 1
CHECKS = ('load', 'source_hash', 'source_header', 'manifest_counts', 'expected_counts', 'incidence', 'euler',
          'equal_edges', 'face_planarity', 'cell_flatness', 'vertex_figures',
          'ridge_incidence', 'duplicate_vertices', 'orientation')


def check(status, **evidence):
    return {'status': status, **evidence}


def result(ok, **evidence):
    return check('pass' if ok else 'fail', **evidence)


def not_applicable(reason, **evidence):
    return check('not-applicable', reason=reason, **evidence)


def _components(nodes, edges):
    remaining = set(nodes)
    while remaining:
        part = {remaining.pop()}
        pending = list(part)
        while pending:
            a = pending.pop()
            for u, v, _ in edges:
                b = v if a == u else u if a == v else None
                if b in remaining:
                    remaining.remove(b); part.add(b); pending.append(b)
        yield part


def _order(nodes, edges):
    """Finite parabolic orders, including disconnected products (integer only)."""
    answer = 1
    for part in _components(nodes, edges):
        labels = sorted(m for a, b, m in edges if a in part and b in part)
        n = len(part)
        if n == 1: value = 2
        elif n == 2: value = 2 * labels[0]
        elif n == 3: value = {(3, 3): 24, (3, 4): 48, (3, 5): 120}[tuple(labels)]
        else: raise ValueError('Only proper rank-three-or-less parabolics are required.')
        if value is None: raise ValueError('Unsupported finite Coxeter parabolic.')
        answer *= value
    return answer


def wythoff_counts(family, rings):
    """Face orbits G/(G_S x G_Z), Z unringed and commuting with S.

    Each component of S must contain a ring. This counts stabilizers without
    constructing coordinates, numerical reflection actions or a convex hull.
    """
    diagrams = {'A3': [3, 3], 'B3': [4, 3], 'H3': [5, 3],
                'A4': [3, 3, 3], 'B4': [4, 3, 3],
                'F4': [3, 4, 3], 'H4': [5, 3, 3]}
    diagram = diagrams[family]; nodes = set(range(len(diagram) + 1))
    if len(rings) != len(nodes) or any(r not in (0, 1) for r in rings) or not any(rings):
        raise ValueError('Nonempty binary rings required.')
    edges = [(i, i+1, m) for i, m in enumerate(diagram)]
    group = {'A3': 24, 'B3': 48, 'H3': 120, 'A4': 120,
             'B4': 384, 'F4': 1152, 'H4': 14400}[family]
    counts = [group // _order([i for i in nodes if not rings[i]], edges)]
    for rank in range(1, len(nodes)):
        count = 0
        for row in combinations(sorted(nodes), rank):
            active = set(row)
            if any(not any(rings[i] for i in part) for part in _components(active, edges)): continue
            inactive = {i for i in nodes-active if not rings[i] and
                        not any((a == i and b in active) or (b == i and a in active) for a, b, _ in edges)}
            count += group // (_order(active, edges) * _order(inactive, edges))
        counts.append(count)
    return counts + ([0] if len(nodes) == 3 else [])


def prism_counts(base):
    v, e, f, _ = base
    return [2*v, 2*e+v, 2*f+e, f+2]


def family_counts(kind, n, m=3):
    if kind == 'duoprism': return [n*m, 2*n*m, n*m+n+m, n+m]
    base = [2*n, 3*n, n+2, 0] if kind == 'prism' else [2*n, 4*n, 2*n+2, 0]
    return prism_counts(base) if kind == 'antiprism-prism' else base


def rational_wythoff_counts(symbol, order):
    """Independent rank-three triangle group, including coincident seed orbits.

    Count vertex/edge/polygon cosets, never supplied asset vertices. A collapsed
    alternating 2n-gon is omitted rather than counted as an n-gon twice traversed.
    """
    left, right = symbol.split('|')
    values = list(map(Fraction,(left+' '+right).split())); rings = len(left.split())
    if len(values)!=3 or not 0<=rings<=3: raise ValueError('Expected a rank-three Wythoff symbol.')
    if not rings:
        v = order//2; degree = 3+sum(q.numerator>2 for q in values)
        f = Fraction(v)+sum(Fraction(v,q.numerator) for q in values if q.numerator>2)
        if f.denominator!=1: raise ValueError('Unresolved snub flag count.')
        return [v,v*degree//2,int(f),0], 0.
    pairs = ((1,2),(0,2),(0,1)); gram = np.eye(3)
    for (a,b), value in zip(pairs,values): gram[a,b]=gram[b,a]=-math.cos(math.pi/float(value))
    roots = np.linalg.cholesky(gram)
    actions = [np.eye(3)-2*np.outer(r,r) for r in roots]
    def group(generators, bound):
        matrices = [np.eye(3)]; pending = deque(matrices)
        seen = {tuple(np.round(matrices[0].flatten(),8))}
        while pending:
            g = pending.popleft()
            for action in generators:
                h = g@action; key = tuple(np.round(h.flatten(),8))
                if key in seen: continue
                if len(matrices)>=bound: raise ValueError('Rational triangle exceeded its finite group bound.')
                seen.add(key); matrices.append(h); pending.append(h)
        return matrices
    matrices = group(actions,order)
    if len(matrices)!=order: raise ValueError('Rational triangle disagrees with finite group order.')
    seed = np.linalg.solve(roots,[1 if i<rings else 0 for i in range(3)])
    seed /= np.linalg.norm(seed); points = []
    for g in matrices:
        p = g@seed
        if not any(np.linalg.norm(p-q)<=TOLERANCE for q in points): points.append(p)
    points = np.asarray(points); tree = cKDTree(points); mapping = []; residual = 0.
    for g in matrices:
        distances, ids = tree.query(points@g.T)
        residual = max(residual,float(max(distances)))
        if residual>TOLERANCE or len(set(ids))!=len(points): raise ValueError('Rational triangle orbit is numerically unresolved.')
        mapping.append(ids)
    edges = set(); faces = set(); v = int(tree.query(seed)[1])
    for action in actions[:rings]:
        other = int(tree.query(action@seed)[1])
        if v!=other:
            for perm in mapping: edges.add(tuple(sorted(perm[[v,other]])))
    for a,b in combinations(range(3),2):
        if a>=rings and b>=rings: continue
        value = values[pairs.index((a,b))]
        subgroup = group([actions[a],actions[b]],2*value.numerator)
        ids = sorted({int(tree.query(g@seed)[1]) for g in subgroup})
        size = value.numerator*(2 if a<rings and b<rings else 1)
        if len(ids)<3 or len(ids)!=size: continue
        for perm in mapping: faces.add(tuple(sorted(perm[ids])))
    return [len(points),len(edges),len(faces),0], residual


@lru_cache(maxsize=1)
def expected_table():
    """Expectations do not read count fields from any asset manifest."""
    table = {}
    def add(key, counts, basis): table[key] = {'counts': counts, 'basis': basis}
    rows = {
        'tetrahedron': ('A3', [1,0,0]), 'cube': ('B3', [1,0,0]),
        'octahedron': ('B3', [0,0,1]), 'dodecahedron': ('H3', [1,0,0]),
        'icosahedron': ('H3', [0,0,1]), 'cuboctahedron': ('B3', [0,1,0]),
        'icosidodecahedron': ('H3', [0,1,0]),
        'truncated-tetrahedron': ('A3', [1,1,0]), 'truncated-cube': ('B3', [1,1,0]),
        'truncated-octahedron': ('B3', [0,1,1]), 'truncated-dodecahedron': ('H3', [1,1,0]),
        'truncated-icosahedron': ('H3', [0,1,1]), 'rhombicuboctahedron': ('B3', [1,0,1]),
        'truncated-cuboctahedron': ('B3', [1,1,1]), 'rhombicosidodecahedron': ('H3', [1,0,1]),
        'truncated-icosidodecahedron': ('H3', [1,1,1])}
    for key, (family, rings) in rows.items():
        add(key, wythoff_counts(family, rings), f'{family} parabolic cosets; rings={rings}')
    for key, group, pentagons in [('snub-cube', 24, 6), ('snub-dodecahedron', 60, 12)]:
        # Free proper-group vertex orbit; degree five; four triangles and one n-gon per vertex.
        for suffix in ('', '-mirror'):
            add(key+suffix, [group, group*5//2, group*4//3+pentagons, 0],
                'Free proper reflection-group orbit; degree 5; four triangles at each vertex')
    for key, v, p, q in [('small-stellated-dodecahedron',12,5,5), ('great-dodecahedron',12,5,5),
                          ('great-stellated-dodecahedron',20,5,3), ('great-icosahedron',12,3,5)]:
        add(key, [v,v*q//2,v*q//p,0], 'Icosahedral vertex orbit; E=Vq/2; F=Vq/p (numerator polygon sizes)')
    from .generators import CATALOG, CATALAN_SOURCES
    for entry in CATALOG:
        key = entry['key']
        if key in CATALAN_SOURCES:
            v,e,f,_ = table[CATALAN_SOURCES[key]]['counts']
            add(key,[f,e,v,0],'Polar incidence dual of '+CATALAN_SOURCES[key])
    from .uniform4 import manifest
    for entry in manifest()['entries']:
        key = entry['key']
        if entry.get('rings'):
            add(key, wythoff_counts(entry['coxeterFamily'],entry['rings']),
                f"{entry['coxeterFamily']} parabolic cosets; rings={entry['rings']}")
        elif entry.get('baseKey'):
            add(key, prism_counts(table[entry['baseKey']]['counts']), 'Cartesian product with interval: '+entry['baseKey'])
    add('uniform4-sadi',[96,96*9//2,(24*20+120*4)//2,24+120],
        'Snub 24-cell: free D4 rotation orbit / stabilizer 1; degree 9; 24 icosahedra + 120 tetrahedra')
    add('uniform4-gap',[100,100*10//2,(300*4+20*12)//2,300+20],
        '600-cell minus two disjoint decagons; degree 10; 300 tetrahedra + 20 pentagonal antiprisms')
    # Regular stars: local flag double counting, rather than retained manifest face vectors.
    poly = {('3','3'):(4,6,4),('4','3'):(8,12,6),('3','4'):(6,12,8),
            ('5','3'):(20,30,12),('3','5'):(12,30,20),('5/2','5'):(12,30,12),
            ('5','5/2'):(12,30,12),('5/2','3'):(20,30,12),('3','5/2'):(12,30,20)}
    from .regular4d_validation import CROSSWALK, CATALOG_IDENTITIES
    for key, name in CATALOG_IDENTITIES.items():
        if key in table: continue
        p,q,r = CROSSWALK[name]['parameters']
        v = 600 if key == 'miratope-great-grand-stellated-hecatonicosachoron' else 120
        vv,ve,vf = poly[q,r]; cv,_,_ = poly[p,q]
        values = [Fraction(v),Fraction(v*vv,2),Fraction(v*ve,Fraction(p).numerator),Fraction(v*vf,cv)]
        assert all(x.denominator == 1 for x in values)
        add(key,list(map(int,values)), 'Regular H4 vertex orbit; V*vertex-figure incidence / vertices per element')
    # Map attributed convex/regular 3D sources by independently retained mathematical names.
    from .catalog import _sources
    for key, (_, _, entry) in _sources().items():
        normalized = entry['name'].lower().replace(' ','-')
        if normalized in table: table[key] = table[normalized]
    from .library_navigation import crosswalk
    from .uniform_snub_catalog import SNUB_INDICES
    for u, row in crosswalk().items():
        key = f'antiprism-u{u}'
        if u==75:
            add(key,[60,60*8//2,60*2//3+60*4//4+60*2//5,0],
                'Exceptional non-Wythoff U75: free icosahedral rotation orbit; vertex configuration 3.4.5/2.4.3.4.5/3.4')
        else:
            values, residual = rational_wythoff_counts(row['wythoff'],24 if u<=4 else 48 if u<=21 else 120)
            add(key,values,'Rational Wythoff triangle '+row['wythoff']+'; finite vertex/edge/polygon cosets; collapsed alternating faces excluded')
            table[key].update(constructionResidual=residual,numericContract='Numerical finite triangle-group orbit; not an exact algebraic certificate.')
        if u in SNUB_INDICES:
            table[key+'-mirror'] = table[key]
    for n in range(3,13):
        for kind in ('prism','antiprism'):
            add(f'uniform-{kind}-{n}',family_counts(kind,n),'Polygon product / antiprism incidence double counting')
    return table


def _flatness(points, ids, dimension):
    cloud = points[ids]; cloud = cloud-cloud.mean(axis=0)
    _, singular, vt = np.linalg.svd(cloud, full_matrices=False)
    residual = float(np.max(np.linalg.norm(cloud-(cloud@vt[:dimension].T)@vt[:dimension],axis=1)))
    rank = int(np.count_nonzero(singular > TOLERANCE))
    return residual, rank


def _orientation(faces):
    uses = defaultdict(list)
    for i, face in enumerate(faces):
        for a,b in zip(face,face[1:]+face[:1]): uses[tuple(sorted((a,b)))].append((i,1 if a<b else -1))
    if any(len(row)!=2 for row in uses.values()): return None, 0, 0
    graph = defaultdict(list); reversed_uses = 0
    for (a,x),(b,y) in uses.values():
        graph[a].append((b,-x*y)); graph[b].append((a,-x*y))
        reversed_uses += x == y
    signs = {}; conflicts = 0; components = 0
    for start in range(len(faces)):
        if start in signs: continue
        components += 1; signs[start] = 1; pending = [start]
        while pending:
            a = pending.pop()
            for b, sign in graph[a]:
                if b in signs: conflicts += signs[b] != signs[a]*sign
                else: signs[b] = signs[a]*sign; pending.append(b)
    return (signs if not conflicts else False), reversed_uses, components


def audit_model(model, record=None):
    record = record or {}; metadata = {**model.get('metadata',{}), **record}
    checks = {'load':result(True)}
    checks['source_hash'] = not_applicable('No source asset hash supplied to this model check.')
    header = model.get('metadata',{}).get('auditOffHeader')
    checks['source_header'] = (result(header['edges'] in (0,len(model['edges'])),declaredEdges=header['edges'],actualEdges=len(model['edges']),
        reason='OFF zero edge count means unspecified; nonzero count must equal boundary-derived unique edges.') if header else not_applicable('Not a literal OFF asset check.'))
    counts = [len(model.get(k,[])) for k in KINDS]
    declared = record.get('counts')
    checks['manifest_counts'] = result(counts==declared,actual=counts,expected=declared) if declared else not_applicable('No retained count record.')
    expected = expected_table().get(record.get('key',metadata.get('key')))
    params = metadata.get('generatorFamily',{})
    if not expected and params.get('family') in ('prism','antiprism','antiprism-prism','duoprism'):
        expected = {'counts':family_counts(params['family'],params['n'],params.get('m',3)), 'basis':'Polygon product / antiprism incidence double counting'}
    checks['expected_counts'] = result(counts==expected['counts'],actual=counts,**expected) if expected else not_applicable('No independent expected face vector for this registration.')
    d = model.get('dimension'); p = np.asarray(model['vertices'],dtype=float)
    if d not in (3,4) or p.ndim!=2 or p.shape[1] not in (3,4) or not len(p) or not np.isfinite(p).all():
        checks['incidence'] = result(False,reason='Expected finite 3D/4D coordinates and dimension.')
        for name in CHECKS: checks.setdefault(name,not_applicable('Invalid coordinate domain.'))
        return {'checks':checks,'counts':counts}
    scale = float(np.max(np.ptp(p,axis=0)))
    p = (p-p.mean(axis=0))/max(scale,np.finfo(float).tiny)
    edges = model.get('edges',[]); faces = model.get('faces',[]); cells = model.get('cells',[])
    invalid_edges = [i for i,e in enumerate(edges) if len(e)!=2 or len(set(e))!=2 or any(type(v) is not int or not 0<=v<len(p) for v in e)]
    invalid_faces = [i for i,f in enumerate(faces) if len(f)<3 or len(set(f))!=len(f) or any(type(v) is not int or not 0<=v<len(p) for v in f)]
    invalid_cells = [i for i,c in enumerate(cells) if len(c)<4 or len(set(c))!=len(c) or any(type(f) is not int or not 0<=f<len(faces) for f in c)]
    if invalid_edges or invalid_faces or invalid_cells:
        checks['incidence'] = result(False,invalidEdges=invalid_edges[:20],invalidFaces=invalid_faces[:20],invalidCells=invalid_cells[:20])
        for name in CHECKS: checks.setdefault(name,not_applicable('Invalid incidence; geometry not indexed.'))
        return {'checks':checks,'counts':counts}
    edge_set = {tuple(sorted(e)) for e in edges}
    face_edges = [[tuple(sorted((a,b))) for a,b in zip(f,f[1:]+f[:1])] for f in faces]
    boundary_edges = {e for row in face_edges for e in row}
    affine_rank = int(np.linalg.matrix_rank(p-p[0],tol=TOLERANCE))
    unused_vertices = sorted(set(range(len(p)))-{v for face in faces for v in face})
    checks['incidence'] = result(edge_set==boundary_edges and len(edge_set)==len(edges) and affine_rank==d,
        affineRank=affine_rank,expectedAffineRank=d,unreferencedVertexCount=len(unused_vertices),unreferencedVertexExamples=unused_vertices[:20],
        missingEdges=len(boundary_edges-edge_set),unusedEdges=len(edge_set-boundary_edges),duplicateEdges=len(edges)-len(edge_set))
    spherical = model.get('interpretation')=='convex-polytope' or metadata.get('convex') is True
    euler = counts[0]-counts[1]+counts[2]-(counts[3] if d==4 else 0)
    checks['euler'] = result(euler==({3:2,4:0}[d]),actual=euler,expected={3:2,4:0}[d]) if spherical else not_applicable('Spherical topology not asserted for generalized/star/compound source.',actual=euler)
    if edges:
        e = np.asarray(edges); lengths = np.linalg.norm(p[e[:,0]]-p[e[:,1]],axis=1); mean = float(np.mean(lengths))
        deviation = float(np.max(abs(lengths-mean))/mean) if mean else 1.
        evidence = {'maxRelativeDeviation':deviation,'relativeSpread':float(np.ptp(lengths)/mean) if mean else 1.,'tolerance':TOLERANCE,'meanLength':mean*scale}
        checks['equal_edges'] = result(deviation<=TOLERANCE,**evidence) if metadata.get('uniform') is True else not_applicable('Uniformity not asserted.',**evidence)
    else: checks['equal_edges'] = not_applicable('No edges.')
    cell_vertices = [sorted({v for fi in cell for v in faces[fi]}) for cell in cells]
    for name, rows, rank in [('face_planarity',faces,2),('cell_flatness',cell_vertices,3)]:
        if not rows:
            checks[name] = not_applicable('No cells in a 3D model.' if rank==3 and d==3 else 'No entities.'); continue
        values = [_flatness(p,row,rank) for row in rows]
        bad = [i for i,(res,r) in enumerate(values) if res>TOLERANCE or r!=rank]
        checks[name] = result(not bad,maxRelativeResidual=max(res for res,_ in values),tolerance=TOLERANCE,
                              invalidCount=len(bad),examples=bad[:20],expectedAffineRank=rank)
    distances, _ = cKDTree(p).query(p,k=2) if len(p)>1 else (np.array([[0.,float('inf')]]),None)
    nearest = distances[:,1]
    checks['duplicate_vertices'] = result(not np.any(nearest<=TOLERANCE),
        minimumRelativeSeparation=float(np.min(nearest)) if len(p)>1 else None,
        verticesWithinTolerance=int(np.count_nonzero(nearest<=TOLERANCE)),tolerance=TOLERANCE,
        literalDuplicateCount=len(p)-len({tuple(row) for row in model['vertices']}),
        reason='Coincident compound vertices may represent distinct abstract vertices; no welding performed.')
    face_use = Counter(fi for c in cells for fi in c)
    edge_use = Counter(e for row in face_edges for e in row)
    uses = [face_use[i] for i in range(len(faces))] if d==4 else [edge_use[e] for e in sorted(edge_set)]
    ordinary = bool(uses) and all(n==2 for n in uses)
    histogram = dict(sorted(Counter(uses).items()))
    exceptional = metadata.get('nonordinaryBoundary') is True or 'compound' in str(model.get('interpretation','')) or metadata.get('componentCount',1)>1
    checks['ridge_incidence'] = (not_applicable('Declared compound/nonordinary boundary; unique geometric incidence may differ from abstract incidence.',histogram=histogram)
        if exceptional and not ordinary else result(ordinary,histogram=histogram,expected=2))
    # Signature is a necessary local incidence/metric invariant, not a transitivity proof.
    at_edge = [[] for _ in p]; at_face = [[] for _ in p]; at_cell = [[] for _ in p]
    for a,b in edges: at_edge[a].append(b); at_edge[b].append(a)
    for fi,f in enumerate(faces):
        for v in f: at_face[v].append(fi)
    for ci,vs in enumerate(cell_vertices):
        for v in vs: at_cell[v].append(ci)
    cell_sig = [(len(vs),len({e for fi in cells[i] for e in face_edges[fi]}),len(cells[i])) for i,vs in enumerate(cell_vertices)]
    signatures = []; metric = []
    for v in range(len(p)):
        link = []
        for fi in at_face[v]:
            f = faces[fi]; i = f.index(v); a,b = f[i-1],f[(i+1)%len(f)]
            link.append(float(np.linalg.norm(p[a]-p[b])))
        signatures.append((len(at_edge[v]),tuple(sorted(len(faces[i]) for i in at_face[v])),tuple(sorted(cell_sig[i] for i in at_cell[v]))))
        metric.append(sorted(link))
    groups = Counter(signatures); metric_residual = 0.
    if len(groups)==1 and metric:
        array = np.asarray(metric); metric_residual = float(np.max(abs(array-array[0]))) if array.size else 0.
    evidence = {'signatureClasses':len(groups),'classSizes':sorted(groups.values()),'maxLinkChordRelativeResidual':metric_residual,
                'tolerance':TOLERANCE,'definition':'Incident degree, face sizes, cell V/E/F signatures and sorted vertex-link chord lengths; necessary, not sufficient for vertex transitivity.'}
    checks['vertex_figures'] = result(len(groups)==1 and metric_residual<=TOLERANCE,**evidence) if metadata.get('vertexTransitive') is True else not_applicable('Vertex transitivity not asserted.',**evidence)
    if d==3:
        signs, reversals, components = _orientation(faces)
        if signs is None: checks['orientation'] = not_applicable('Surface has open/nonordinary edge links.')
        elif signs is False: checks['orientation'] = (result(False,orientable=False) if spherical else not_applicable('Nonorientable generalized surface.',orientable=False))
        else: checks['orientation'] = result(True,orientable=True,components=components,storedCycleConflicts=reversals,
            definition='A consistent orientation exists after independent face reversals. Source face cycles need not store outward winding.')
    else:
        cell_signs = []; cell_conflicts = 0
        for cell in cells:
            signs,_,_ = _orientation([faces[fi] for fi in cell]); cell_signs.append(signs)
            cell_conflicts += signs is False
        if any(s is None for s in cell_signs) or not ordinary:
            checks['orientation'] = not_applicable('Cell or polychoron has nonordinary links.',nonorientableCells=cell_conflicts)
        elif cell_conflicts: checks['orientation'] = (result(False,nonorientableCells=cell_conflicts,orientable=False)
            if spherical else not_applicable('Nonorientable generalized cell boundaries.',nonorientableCells=cell_conflicts,orientable=False))
        else:
            graph = defaultdict(list); uses = defaultdict(list)
            for ci,c in enumerate(cells):
                for j,fi in enumerate(c): uses[fi].append((ci,cell_signs[ci][j]))
            for (a,x),(b,y) in uses.values(): graph[a].append((b,-x*y)); graph[b].append((a,-x*y))
            signs = {}; conflicts = 0
            for start in range(len(cells)):
                if start in signs: continue
                signs[start] = 1; pending = [start]
                while pending:
                    a = pending.pop()
                    for b,s in graph[a]:
                        if b in signs: conflicts += signs[b]!=signs[a]*s
                        else: signs[b]=signs[a]*s; pending.append(b)
            evidence = {'orientable':not conflicts,'conflictingConstraints':conflicts//2,
                'definition':'Orientable cell boundaries and opposite induced shared-ridge signs after cell reversals.'}
            checks['orientation'] = (not_applicable('Nonorientable generalized boundary; no spherical/orientable topology asserted.',**evidence)
                if conflicts and not spherical else result(not conflicts,**evidence))
    return {'checks':checks,'counts':counts,'numericContract':'Float64 residual audit; no exact geometry or algebraic certificate.',
            'coordinateScale':scale,'interpretation':model.get('interpretation')}


def read_off_literal(path):
    """Audit retained records even when the app importer refuses their geometry."""
    raw = Path(path).read_bytes()
    if len(raw)>128*1024*1024: raise ValueError('OFF asset exceeds 128 MiB audit limit.')
    lines = [line.split('#',1)[0].strip() for line in raw.decode('utf-8-sig').splitlines()]
    lines = [line for line in lines if line]
    if not lines or lines[0] not in ('OFF','4OFF'): raise ValueError('Expected OFF / 4OFF marker.')
    d = 4 if lines[0]=='4OFF' else 3
    counts = list(map(int,lines[1].split()))
    if len(counts)!=(4 if d==4 else 3): raise ValueError('Invalid OFF count header.')
    nv,nf,ne = counts[:3]; nc = counts[3] if d==4 else 0
    if nv<1 or min(nf,ne,nc)<0 or nv>20000 or max(nf,ne,nc)>1000000 or len(lines)!=2+nv+nf+nc: raise ValueError('Invalid or unsupported OFF counts / record length.')
    vertices = [list(map(float,line.split())) for line in lines[2:2+nv]]
    if any(len(p)!=d for p in vertices): raise ValueError('Invalid OFF coordinate dimension.')
    from .formats import _off_boundaries
    faces,_ = _off_boundaries(lines[2+nv:2+nv+nf],nv)
    cells,_ = _off_boundaries(lines[2+nv+nf:],nf)
    edges = sorted({tuple(sorted((a,b))) for f in faces for a,b in zip(f,f[1:]+f[:1])})
    return {'dimension':d,'vertices':vertices,'edges':[list(e) for e in edges],'faces':faces,'cells':cells,
            'interpretation':'generalized-complex','metadata':{'auditOffHeader':{'vertices':nv,'faces':nf,'edges':ne,'cells':nc}}}, hashlib.sha256(raw).hexdigest()


def inventory(include_data=True):
    from .catalog import get_catalog
    catalog = get_catalog()
    records = [{'kind':'catalog','id':r['key'],'record':r} for r in catalog]
    from .uniform4 import manifest
    from .regular4d_validation import CROSSWALK, CATALOG_IDENTITIES
    aliases = {CROSSWALK[name]['alias'].lower():key for key,name in CATALOG_IDENTITIES.items()}
    aliases.update({r['bowers']:r['key'] for r in manifest()['entries']})
    by_key = {r['key']:r for r in catalog}
    if include_data:
        pins = {}
        for manifest in sorted((ROOT/'data').rglob('*manifest.json')):
            value = json.loads(manifest.read_text(encoding='utf-8'))
            for entry in value.get('files',[]):
                if entry.get('relativePath') and entry.get('sha256'):
                    pins[(manifest.parent/entry['relativePath']).resolve()] = entry['sha256']
        for path in sorted((ROOT/'data').rglob('*')):
            if path.is_file() and path.suffix.lower()=='.off':
                item = {'kind':'asset','id':path.relative_to(ROOT).as_posix(),'sha256':pins.get(path.resolve())}
                match = re.fullmatch(r'\d+-([A-Za-z]+)',path.stem)
                if match and match[1].lower() in aliases:
                    key = aliases[match[1].lower()]
                    # Identity by an explicit source abbreviation; counts remain independent.
                    if key in by_key: item['record'] = by_key[key]
                records.append(item)
    for kind,n,m in [('prism',17,3),('antiprism',17,3),('antiprism-prism',5,3),('duoprism',3,5),('duoprism',7,11)]:
        records.append({'kind':'sample','id':f'sample-{kind}-{n}x{m}','parameters':{'family':kind,'n':n,'m':m}})
    return records


def repair_unused_duplicates(path, model, record):
    """Correction copy only: independent face vector must prove the compaction."""
    expected = expected_table().get(record.get('key'))
    if expected is None: return None
    used = sorted({v for face in model['faces'] for v in face})
    unused = sorted(set(range(len(model['vertices'])))-set(used))
    positions = {tuple(model['vertices'][v]) for v in used}
    if not unused or not all(tuple(model['vertices'][v]) in positions for v in unused): return None
    if [len(used),*(len(model[k]) for k in KINDS[1:])]!=expected['counts']: return None
    remap = {v:i for i,v in enumerate(used)}
    candidate = {**model,'vertices':[model['vertices'][v] for v in used],
                 'edges':[[remap[v] for v in edge] for edge in model['edges']],
                 'faces':[[remap[v] for v in face] for face in model['faces']],
                 'metadata':{**model['metadata'],'auditOffHeader':{
                     **model['metadata']['auditOffHeader'],'vertices':len(used),'edges':len(model['edges'])}}}
    after = audit_model(candidate,record)
    if any(c['status']=='fail' for c in after['checks'].values()): return None
    raw = Path(path).read_bytes()
    lines = [line.split('#',1)[0].strip() for line in raw.decode('utf-8-sig').splitlines()]
    lines = [line for line in lines if line]
    nv,nf,ne,*tail = map(int,lines[1].split())
    counts = [len(used),nf,len(model['edges']),*tail]
    output = [lines[0],' '.join(map(str,counts)),
              '# Correction copy: remove only unreferenced exact duplicate vertices; preserve all used coordinates and ordered boundaries.']
    output.extend(lines[2+v] for v in used)
    for line in lines[2+nv:2+nv+nf]:
        tokens = line.split(); size = int(tokens[0])
        output.append(' '.join([tokens[0],*(str(remap[int(v)]) for v in tokens[1:1+size]),*tokens[1+size:]]))
    output.extend(lines[2+nv+nf:])
    text = '\n'.join(output)+'\n'
    from .formats import parse_off
    imported = parse_off(text,'Audited correction copy')
    if any(imported[k]!=candidate[k] for k in ('vertices','edges','faces','cells')):
        raise ValueError('Correction copy did not preserve the compacted coordinates/incidence.')
    return text, {'operation':'remove-unreferenced-exact-duplicate-vertices',
                  'removedVertexIds':unused,'removedCount':len(unused),'beforeCounts':[len(model[k]) for k in KINDS],
                  'afterCounts':after['counts'],'expectedCounts':expected,
                  'usedCoordinateResidual':0.,'sourceSha256':hashlib.sha256(raw).hexdigest(),
                  'sha256':hashlib.sha256(text.encode('utf-8')).hexdigest(),
                  'afterChecks':after['checks'],'appImporterPassed':True,
                  'sourcePreserved':True,'colors':'Face/cell suffix tokens preserved verbatim.'}


def _safe_hulls():
    """Keep existing loader calls, but refuse rank-deficient Qhull input first."""
    from . import geometry
    import scipy.spatial
    original = scipy.spatial.ConvexHull
    def guarded(points, *args, **kwargs):
        p = np.asarray(points,dtype=float)
        if p.ndim!=2 or not np.isfinite(p).all() or len(p)<=p.shape[1]: raise geometry.GeometryError('Audit Qhull guard: invalid or undersized input.')
        cloud = p-p.mean(axis=0); scale = float(np.max(abs(cloud)))
        if not scale or np.linalg.matrix_rank(cloud/scale,tol=1e-9)!=p.shape[1]: raise geometry.GeometryError('Audit Qhull guard: degenerate input refused.')
        return original(points,*args,**kwargs)
    geometry.ConvexHull = guarded
    scipy.spatial.ConvexHull = guarded
    if sys.platform=='win32':
        import ctypes
        ctypes.windll.kernel32.SetErrorMode(0x0001 | 0x0002 | 0x8000)


def audit_item(item):
    started = time.monotonic()
    base = {'id':item['id'],'kind':item['kind']}
    try:
        if item['kind']=='catalog':
            from .generators import regular
            model = regular(item['id']); record = item['record']
            base['name'] = record['name']
            base['loadingMode'] = 'application-catalog-loader'
        elif item['kind']=='sample':
            from .uniform4 import uniform_family
            model = uniform_family(**item['parameters']); record = {}
            base['loadingMode'] = 'application-family-generator'
        else:
            model, sha = read_off_literal(ROOT/item['id']); record = item.get('record',{})
            base['sha256'] = sha
            base['loadingMode'] = 'literal-OFF-without-hull-or-convex-recognition'
        base.update(audit_model(model,record))
        if model.get('fingerprint'): base['modelFingerprint'] = model['fingerprint']
        if item['kind']=='asset' and item.get('sha256'):
            base['checks']['source_hash'] = result(base['sha256']==item['sha256'],expected=item['sha256'],actual=base['sha256'])
        if item['kind']=='asset' and item.get('repairDirectory') and base['checks']['source_hash']['status']=='pass':
            repaired = repair_unused_duplicates(ROOT/item['id'],model,record)
            if repaired:
                text, evidence = repaired
                target = Path(item['repairDirectory'])/'repairs'/item['id']
                target.parent.mkdir(parents=True,exist_ok=True); target.write_bytes(text.encode('utf-8'))
                base['repair'] = {'file':target.relative_to(Path(item['repairDirectory'])).as_posix(),**evidence}
    except Exception as exc:
        base['checks'] = {k:not_applicable('Loading failed; no model was audited.') for k in CHECKS}
        base['checks']['load'] = result(False,error=f'{type(exc).__name__}: {exc}')
    base['status'] = 'fail' if any(c['status']=='fail' for c in base['checks'].values()) else 'pass'
    base['elapsedSeconds'] = round(time.monotonic()-started,3)
    return base


def _worker():
    _safe_hulls()
    for line in sys.stdin:
        item = json.loads(line)
        print(json.dumps(audit_item(item),allow_nan=False),flush=True)


class Worker:
    """Persistent worker; deadlines and native failures cannot strand the audit."""
    def __init__(self, timeout): self.timeout=timeout; self.process=None

    def close(self):
        if self.process:
            self.process.kill(); self.process.communicate(); self.process=None

    def run(self, item):
        if self.process is None:
            env = {**os.environ,'OPENBLAS_NUM_THREADS':'1','OMP_NUM_THREADS':'1','PYTHONIOENCODING':'utf-8'}
            self.process = subprocess.Popen([sys.executable,'-m','engine.catalog_audit','--worker'],cwd=ROOT,
                stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True,encoding='utf-8',env=env,
                creationflags=subprocess.CREATE_NO_WINDOW if sys.platform=='win32' else 0)
        # A daemon reader is unblocked by killing the process on deadline.
        from queue import Queue, Empty
        from threading import Thread
        output = Queue()
        process = self.process
        def read(): output.put(process.stdout.readline())
        try:
            self.process.stdin.write(json.dumps(item)+'\n'); self.process.stdin.flush()
            Thread(target=read,daemon=True).start()
            line = output.get(timeout=self.timeout)
            if not line: raise RuntimeError(f'Worker exited ({self.process.poll()}).')
            return json.loads(line)
        except (Empty, OSError, RuntimeError, ValueError) as exc:
            self.close()
            message = f'Worker exceeded {self.timeout}s limit.' if isinstance(exc,Empty) else str(exc)
            return {'id':item['id'],'kind':item['kind'],'status':'fail',
                    'checks':{k:result(False,error=message) if k=='load' else not_applicable('Worker did not complete.') for k in CHECKS}}


def write_report(directory, rows, items, source_sha=None):
    directory = Path(directory); directory.mkdir(parents=True,exist_ok=True)
    rows = sorted(rows,key=lambda r:r['id'])
    totals = Counter(r['status'] for r in rows)
    check_totals = {key:dict(Counter(r['checks'][key]['status'] for r in rows if key in r['checks'])) for key in CHECKS}
    from importlib.metadata import version
    repairs = [{'source':row['id'],**row['repair']} for row in rows if row.get('repair')]
    report = {'schemaVersion':VERSION,'date':directory.name,'tolerance':TOLERANCE,
              'numericContract':'Approximate float64 checks; pass is tolerance satisfaction, never an exact certificate.',
              'sourceSha256':source_sha,'runtime':{'python':sys.version,'numpy':version('numpy'),'scipy':version('scipy')},
              'inventoryCount':len(items),'auditedCount':len(rows),
              'complete':len(rows)==len(items),'totals':dict(totals),'checkTotals':check_totals,
              'expectedCountTable':expected_table(),'repairs':repairs,'models':rows}
    (directory/'report.json').write_text(json.dumps(report,indent=2,ensure_ascii=False,allow_nan=False)+'\n',encoding='utf-8')
    lines = ['# Bundled catalog audit', '', f"Audited {len(rows)} / {len(items)} selected items: {totals['pass']} pass; {totals['fail']} fail.",
             '', 'Float64 residuals, relative tolerance 1e-9. Passing is not an exact certificate.', '',
             '| Check | Pass | Fail | Not applicable |','| --- | ---: | ---: | ---: |']
    for key, counts in check_totals.items(): lines.append(f"| {key} | {counts.get('pass',0)} | {counts.get('fail',0)} | {counts.get('not-applicable',0)} |")
    lines += ['', '## Findings', '', '| Item | Failed checks |', '| --- | --- |']
    for row in rows:
        if row['status']=='fail':
            failures = ', '.join(k+(': '+v['error'] if v.get('error') else '') for k,v in row['checks'].items() if v['status']=='fail')
            lines.append('| '+row['id'].replace('|','\\|')+' | '+failures.replace('|','\\|').replace('\n',' ')+' |')
    if repairs:
        (directory/'repairs.json').write_text(json.dumps({'schemaVersion':1,'sourcePreserved':True,'entries':repairs},indent=2)+'\n',encoding='utf-8')
        lines += ['', '## Validated correction copies', '', 'Original source findings above remain visible. Copy SHA-256 pins and before/after evidence are in `repairs.json`.', '']
        for repair in repairs:
            lines.append(f"- {repair['source']}: removed {repair['removedCount']} unreferenced exact duplicate vertices; {repair['beforeCounts']} → {repair['afterCounts']}; app importer passed.")
    (directory/'summary.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
    return report


def source_digest(root=ROOT):
    digest = hashlib.sha256()
    for path in sorted(set((root/'engine').rglob('*.py')) | set((root/'engine/catalog_data').rglob('*')) | set((root/'data').rglob('*'))):
        if path.is_file() and path.suffix.lower() in ('.py','.json','.off'):
            digest.update(path.relative_to(root).as_posix().encode()); digest.update(hashlib.sha256(path.read_bytes()).digest())
    return digest.hexdigest()


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--date',default=date.today().isoformat())
    parser.add_argument('--output',type=Path,help='Default: artifacts/catalog-audit/<date>')
    parser.add_argument('--keys',nargs='+',help='Select explicit catalog keys / data-relative asset paths.')
    parser.add_argument('--no-data',action='store_true',help='Audit registered catalog only.')
    parser.add_argument('--jobs',type=int,default=3,choices=range(1,9))
    parser.add_argument('--timeout',type=float,default=180,help='Per item wall-time limit in seconds.')
    parser.add_argument('--resume',action='store_true',help='Reuse matching source/inventory checkpoint; source hashes are rechecked.')
    parser.add_argument('--worker',action='store_true',help=argparse.SUPPRESS)
    args = parser.parse_args(argv)
    if args.worker: _worker(); return 0
    if not math.isfinite(args.timeout) or args.timeout<=0: parser.error('--timeout must be positive and finite.')
    try: date.fromisoformat(args.date)
    except ValueError: parser.error('--date must use YYYY-MM-DD.')
    items = inventory(not args.no_data)
    if args.keys:
        selected = set(args.keys); items = [i for i in items if i['id'] in selected]
        missing = selected-{i['id'] for i in items}
        if missing: parser.error('Unknown audit identifiers: '+', '.join(sorted(missing)))
    directory = args.output or ROOT/'artifacts/catalog-audit'/args.date
    directory.mkdir(parents=True,exist_ok=True)
    for item in items:
        if item['kind']=='asset': item['repairDirectory'] = str(directory.resolve())
    checkpoint = directory/'checkpoint.jsonl'
    # Include every raw asset in the resume identity, not just mtime metadata.
    signature = source_digest(); header = {'schemaVersion':VERSION,'sourceSha256':signature,'items':items,'timeout':args.timeout}
    rows = []; resuming = args.resume and checkpoint.exists()
    if resuming:
        with checkpoint.open(encoding='utf-8') as stream:
            if json.loads(next(stream))!=header: parser.error('Checkpoint source/inventory changed; use a fresh output directory.')
            for line in stream:
                try: rows.append(json.loads(line))
                except ValueError: parser.error('Checkpoint has a truncated row; remove that final row before resuming.')
    done = {r['id'] for r in rows}; pending = [i for i in items if i['id'] not in done]
    from queue import Queue, Empty
    queue = Queue()
    for item in pending: queue.put(item)
    from threading import Lock
    lock = Lock()
    with checkpoint.open('a' if resuming else 'w',encoding='utf-8') as stream:
        if not resuming: stream.write(json.dumps(header)+'\n'); stream.flush()
        def batch():
            worker = Worker(args.timeout)
            try:
                while True:
                    try: item = queue.get_nowait()
                    except Empty: break
                    row = worker.run(item)
                    with lock:
                        rows.append(row); stream.write(json.dumps(row,allow_nan=False)+'\n'); stream.flush()
                        if len(rows)%25==0: print(f'{len(rows)}/{len(items)} audited',flush=True)
            finally: worker.close()
        with ThreadPoolExecutor(max_workers=args.jobs) as pool:
            futures = [pool.submit(batch) for _ in range(args.jobs)]
            for future in as_completed(futures): future.result()
    report = write_report(directory,rows,items,signature)
    print(json.dumps({'output':str(directory),'complete':report['complete'],'totals':report['totals']}))
    return 1 if report['totals'].get('fail') else 0


if __name__=='__main__': sys.exit(main())
