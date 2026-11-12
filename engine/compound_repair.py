"""Bounded reconstruction of two demitesseractic sources; no native hull calls."""

from collections import Counter
from copy import deepcopy
from itertools import combinations, permutations, product
import hashlib
import json
from pathlib import Path
import uuid

import numpy as np

from .geometry import GeometryError, identity, validate

DATA = Path(__file__).resolve().parent / 'catalog_data/compound_repair'
KINDS = ('vertices', 'edges', 'faces', 'cells')
SOURCE_PINS = {
    'haddet': ('2hex-Haddet.off', 'ce3346a17176df5b323a321c93b1cbf72a8659f36c769ae12c7cfa3ebe86ad85'),
    'dathah': ('2tho-a-Dathah.off', '1fcba6e5b53a74f43c80e69e5593a3741896b34d7a0b93721cb74309ba91bec0'),
}


def _require(ok, message):
    if not ok:
        raise GeometryError('Compound reconstruction: ' + message)


def literal(raw):
    """Only the bounded, pinned 16-vertex triangular sources are supported."""
    _require(type(raw) is bytes and len(raw) < 8192, 'expected a bounded OFF byte string.')
    lines = [line.split('#', 1)[0].strip() for line in raw.decode('utf-8-sig').splitlines()]
    lines = [line for line in lines if line]
    _require(len(lines) > 2 and lines[0] == '4OFF', 'expected 4OFF.')
    try:
        nv, nf, ne, nc = map(int, lines[1].split())
        _require(
            (nv, nf, ne) == (16, 64, 48) and nc in (16, 24) and len(lines) == 2 + nv + nf + nc,
            'unsupported source counts or trailing records.',
        )
        vertices = [list(map(float, line.split())) for line in lines[2 : 2 + nv]]
        faces = [list(map(int, line.split())) for line in lines[2 + nv : 2 + nv + nf]]
        cells = [list(map(int, line.split())) for line in lines[2 + nv + nf :]]
        _require(
            all(len(f) == 4 and f[0] == 3 and len(set(f[1:])) == 3 and all(0 <= v < nv for v in f[1:]) for f in faces),
            'unsupported face record.',
        )
        _require(
            all(len(c) == c[0] + 1 and len(set(c[1:])) == c[0] and all(0 <= f < nf for f in c[1:]) for c in cells),
            'invalid cell record.',
        )
        faces = [f[1:] for f in faces]
        cells = [c[1:] for c in cells]
        edges = sorted({tuple(sorted(e)) for f in faces for e in combinations(f, 2)})
        _require(len(edges) == ne, 'edge header differs from face incidence.')
        return {
            'dimension': 4,
            'embeddingDimension': 4,
            'vertices': vertices,
            'edges': list(map(list, edges)),
            'faces': faces,
            'cells': cells,
            'interpretation': 'generalized-complex',
            'metadata': {},
        }
    except (ValueError, IndexError) as error:
        raise GeometryError('Compound reconstruction: malformed numeric record.') from error


def _flatness(points, faces, cell):
    ids = sorted({v for f in cell for v in faces[f]})
    cloud = points[ids] - points[ids].mean(axis=0)
    _, s, vt = np.linalg.svd(cloud, full_matrices=False)
    return int(np.count_nonzero(s > 1e-9)), float(np.max(np.linalg.norm(cloud @ vt[3:].T, axis=1)) / 2)


def reconstruct(source, kind):
    """Derive constituent incidence from the demicube graph, then group planes.

    The source stores two coplanar tetrahedra as one disconnected cell group.
    Constituent Euler checks apply BEFORE grouping; grouped records are not
    promoted to ordinary 3-cells or to a filled solid.
    """
    _require(kind in SOURCE_PINS, 'only Haddet and Dathah are supported.')
    p = np.asarray(source['vertices'], dtype=float)
    _require(
        p.shape == (16, 4) and np.isfinite(p).all() and set(map(tuple, p)) == set(product((-1.0, 1.0), repeat=4)),
        'expected the complete distinct signed unit 4-cube vertex set.',
    )
    faces = source['faces']
    face_ids = {tuple(sorted(f)): i for i, f in enumerate(faces)}
    _require(len(face_ids) == 64 and all(len(f) == 3 for f in faces), 'expected 64 distinct triangles.')
    distance = np.sum((p[:, None] - p[None, :]) ** 2, axis=2)
    remaining = set(range(16))
    parts = []
    while remaining:
        reached = {min(remaining)}
        pending = list(reached)
        while pending:
            a = pending.pop()
            for b in sorted(remaining - reached):
                if distance[a, b] == 8:
                    reached.add(b)
                    pending.append(b)
        remaining -= reached
        parts.append(sorted(reached))
    _require(
        len(parts) == 2 and all(len(v) == 8 for v in parts), 'demicube edge graph did not split into two 16-cells.'
    )
    rebuilt = []
    component_reports = []
    coordinate_cells = []
    all_faces = set()
    all_edges = set()
    for vs in parts:
        es = {e for e in combinations(vs, 2) if distance[e] == 8}
        triangles = {f for f in combinations(vs, 3) if all(e in es for e in combinations(f, 2))}
        _require(
            len(es) == 24 and len(triangles) == 32 and triangles <= face_ids.keys(),
            'source triangles differ from the demicube graph.',
        )
        all_faces |= triangles
        all_edges |= es
        tetrahedra = [t for t in combinations(vs, 4) if all(e in es for e in combinations(t, 2))]
        _require(len(tetrahedra) == 16, 'cross-polytope tetrahedral facet count differs.')
        coordinate = [t for t in tetrahedra if any(np.ptp(p[list(t), a]) == 0 for a in range(4))]
        _require(len(coordinate) == 8, 'expected eight coordinate-plane tetrahedra per constituent.')
        cells = tetrahedra
        if kind == 'dathah':
            opposite = [e for e in combinations(vs, 2) if distance[e] == 16]
            _require(len(opposite) == 4, 'expected four antipodal pairs.')
            octahedra = [tuple(v for v in vs if v not in pair) for pair in opposite]
            cells = coordinate + octahedra
        incidence = [sorted(face_ids[f] for f in triangles if set(f) <= set(c)) for c in cells]
        _require(
            all(_flatness(p, faces, c)[0] == 3 and _flatness(p, faces, c)[1] <= 1e-9 for c in incidence),
            'reconstructed constituent cell is nonflat.',
        )
        uses = Counter(f for c in incidence for f in c)
        _require(
            set(uses) == {face_ids[f] for f in triangles} and set(uses.values()) == {2},
            'constituent ridges must have two owners.',
        )
        chi = len(vs) - len(es) + len(triangles) - len(cells)
        _require(chi == (0 if kind == 'haddet' else 4), 'constituent Euler characteristic differs.')
        component_reports.append(
            {
                'sourceVertexIds': vs,
                'sourceCellFaceIds': incidence,
                'counts': [len(vs), len(es), len(triangles), len(cells)],
                'eulerCharacteristic': chi,
                'topology': 'spherical 16-cell boundary'
                if kind == 'haddet'
                else 'nonorientable hemi polychoron; spherical Euler 0 is inapplicable',
            }
        )
        coordinate_ids = {tuple(t) for t in coordinate}
        for c, ids in zip(cells, incidence):
            if tuple(c) in coordinate_ids:
                coordinate_cells.append((c, ids))
            else:
                rebuilt.append(ids)
    _require(
        all_faces == set(face_ids) and all_edges == {tuple(sorted(e)) for e in source['edges']},
        'source face/edge tables differ from reconstructed components.',
    )
    # Coalesce only the coplanar tetrahedral pairs, preserving the source convention.
    for axis in range(4):
        for sign in (-1, 1):
            cells = [ids for vs, ids in coordinate_cells if np.all(p[list(vs), axis] == sign)]
            _require(len(cells) == 2, 'coordinate plane must contain one tetrahedron from each constituent.')
            rebuilt.append(sorted(f for c in cells for f in c))
    expected = {tuple(c) for c in rebuilt}
    _require(len(expected) == len(source['cells']) == (24 if kind == 'haddet' else 16), 'grouped cell count differs.')
    bad = [i for i, c in enumerate(source['cells']) if tuple(sorted(c)) not in expected]
    missing = sorted(expected - {tuple(sorted(c)) for c in source['cells']})
    _require(
        len(bad) == len(missing) == 2 and all(_flatness(p, faces, source['cells'][i])[0] == 4 for i in bad),
        'not precisely two nonflat records; refusing a broader repair.',
    )
    corrected = deepcopy(source)
    for i, c in zip(bad, missing):
        corrected['cells'][i] = list(c)
    residual = max(_flatness(p, faces, c)[1] for c in corrected['cells'])
    _require(
        residual <= 1e-9 and all(_flatness(p, faces, c)[0] == 3 for c in corrected['cells']),
        'corrected groups are nonflat.',
    )
    _require(validate(corrected)['passed'], 'corrected literal incidence failed validation.')
    # Exhaust all signed coordinate permutations, checking full grouped incidence.
    vertex_ids = {tuple(v): i for i, v in enumerate(p)}
    signatures = {frozenset(c) for c in corrected['cells']}
    actions = 0
    for perm in permutations(range(4)):
        for signs in product((-1, 1), repeat=4):
            mapping = [vertex_ids[tuple(v[list(perm)] * signs)] for v in p]
            fm = [face_ids[tuple(sorted(mapping[v] for v in f))] for f in faces]
            _require(
                {frozenset(fm[f] for f in c) for c in corrected['cells']} == signatures,
                'signed-coordinate action does not preserve corrected incidence.',
            )
            actions += 1
    evidence = {
        'kind': kind,
        'changedCellIds': bad,
        'components': component_reports,
        'componentCount': len(parts),
        'groupedCounts': [len(corrected[k]) for k in KINDS],
        'groupedEulerCharacteristic': 16 - 48 + 64 - len(corrected['cells']),
        'cellGrouping': 'Eight disconnected coplanar pairs of tetrahedral boundaries; each pair has boundary Euler 4. These are cell groups, not ordinary 3-cells.',
        'symmetryOrder': actions,
        'symmetryScope': 'All 384 signed coordinate permutations; complete 4-cube vertex symmetry group.',
        'maxRelativeCellFlatnessResidual': residual,
        'tolerance': 1e-9,
        'certified': False,
        'replacements': [{'cellId': i, 'before': source['cells'][i], 'after': corrected['cells'][i]} for i in bad],
    }
    return corrected, evidence


def repair_off(raw, kind):
    _require(
        type(raw) is bytes and kind in SOURCE_PINS and hashlib.sha256(raw).hexdigest() == SOURCE_PINS[kind][1],
        'source hash differs from its immutable pin.',
    )
    source = literal(raw)
    corrected, evidence = reconstruct(source, kind)
    lines = raw.splitlines(keepends=True)
    records = [i for i, line in enumerate(lines) if line.split(b'#', 1)[0].strip()]
    for cell in evidence['changedCellIds']:
        line = records[2 + 16 + 64 + cell]
        old = lines[line]
        ending = b'\r\n' if old.endswith(b'\r\n') else b'\n' if old.endswith(b'\n') else b''
        ids = corrected['cells'][cell]
        lines[line] = ('8 ' + ' '.join(map(str, ids))).encode() + ending
    result = b''.join(lines)
    _require(literal(result)['cells'] == corrected['cells'], 'serialized correction differs.')
    return result, evidence


def compound_repair_catalog():
    return deepcopy(json.loads((DATA / 'manifest.json').read_text(encoding='utf-8'))['entries'])


def load_compound_repair(key):
    entry = next((e for e in compound_repair_catalog() if e['key'] == key), None)
    if entry is None:
        return None
    asset = (DATA / entry['file']).resolve()
    original_asset = (DATA / entry['originalFile']).resolve()
    _require(
        all(p.is_relative_to(DATA.resolve()) and p.stat().st_size < 8192 for p in (asset, original_asset)),
        'asset escapes catalog or exceeds its bound.',
    )
    raw = asset.read_bytes()
    _require(hashlib.sha256(raw).hexdigest() == entry['sha256'], 'derived asset hash differs from its pin.')
    original = original_asset.read_bytes()
    expected, evidence = repair_off(original, entry['repairKind'])
    _require(raw == expected, 'derived asset differs from the independently rebuilt correction.')
    _require(
        entry['counts'] == evidence['groupedCounts']
        and entry['changedCellIds'] == evidence['changedCellIds']
        and entry['sourceSha256'] == SOURCE_PINS[entry['repairKind']][1],
        'retained count/provenance record differs from reconstruction.',
    )
    model = literal(raw)
    model['name'] = entry['name']
    model['id'] = str(uuid.uuid5(uuid.NAMESPACE_URL, 'polytope:compound-repair:' + entry['sha256']))
    model['numeric'] = {
        'mode': 'float64-approximate',
        'tolerance': 1e-9,
        'certified': False,
        'algorithm': 'Demicube graph, clique facets and antipodal-pair octahedra; no hull',
    }
    model['metadata'].update(deepcopy(entry))
    model['metadata']['compoundCellReview'] = evidence
    model['provenance'] = {
        'operation': 'import-off',
        'algorithmVersion': '1',
        'catalogKey': key,
        'compoundCellCorrection': {
            'source': entry['sourcePath'],
            'sourceSha256': SOURCE_PINS[entry['repairKind']][1],
            'sha256': entry['sha256'],
            'cells': evidence['changedCellIds'],
        },
    }
    model['fingerprint'] = identity(model)
    model['validation'] = validate(model)
    return model
