"""Independent Tits/coset/vertex-star checks. No imports from engine/.

Development dependencies: numpy, sympy. Run capture-hyperbolic-receipts.py first.
"""

import argparse
import hashlib
import itertools
import json
import math
from pathlib import Path

import numpy as np
from sympy import Matrix, ZZ
from sympy.matrices.normalforms import smith_normal_form

ROOT = Path(__file__).resolve().parents[1]
EXPECTED = {'534': [1, 12, 102, 812], '435': [1, 6, 30, 126], '535': [1, 12, 132, 1392], '353': [1, 20, 260, 3212]}
TABLE = 'Celińska-Kopczyńska–Kopczyński, Table 2, arXiv:2208.13816 (https://arxiv.org/pdf/2208.13816)'
J = np.diag([-1.0, 1.0, 1.0, 1.0])


class PointIndex:
    """Own 4-coordinate buckets; compare every coordinate, never bucket alone."""

    def __init__(self, tolerance=1e-7):
        self.buckets = {}
        self.tolerance = tolerance
        self.count = 0

    def add(self, point):
        grid = point / 1e-4
        base = np.floor(grid).astype(np.int64)
        choices = []
        for value, bucket in zip(grid, base):
            options = [int(bucket)]
            if value - bucket < self.tolerance / 1e-4:
                options.append(int(bucket - 1))
            if bucket + 1 - value < self.tolerance / 1e-4:
                options.append(int(bucket + 1))
            choices.append(options)
        for key in itertools.product(*choices):
            for old in self.buckets.get(key, []):
                if np.max(np.abs(point - old)) < self.tolerance:
                    return False
        self.buckets.setdefault(tuple(base), []).append(point.copy())
        self.count += 1
        return True


def tits_rings(pqr):
    gram = np.eye(4)
    for i, m in enumerate(pqr):
        gram[i, i + 1] = gram[i + 1, i] = -math.cos(math.pi / m)
    mirrors = []
    for i in range(4):
        reflection = np.eye(4)
        reflection[i] -= 2 * gram[i]
        mirrors.append(reflection)
    # W_{012} fixes a cell centre; its orbit of root 3 gives the face mirrors.
    roots, index = [np.eye(4)[:, 3]], PointIndex()
    index.add(roots[0])
    for root in roots:
        for mirror in mirrors[:3]:
            candidate = mirror @ root
            if index.add(candidate):
                roots.append(candidate)
                assert len(roots) <= 20
    faces = [np.eye(4) - 2 * np.outer(n, n @ gram) for n in roots]
    centre = np.linalg.solve(gram, np.eye(4)[:, 3])
    centre /= math.sqrt(-centre @ gram @ centre)
    current, index, counts = [centre], PointIndex(), [1]
    index.add(centre)
    for _ in range(3):
        following = []
        for point in current:
            for mirror in faces:
                candidate = mirror @ point
                if index.add(candidate):
                    following.append(candidate)
        counts.append(len(following))
        current = following
    return {
        'rings': counts,
        'faceMirrors': len(faces),
        'coordinateStatus': 'independent float64 Tits representation; 1e-7 full-coordinate deduplication',
    }


def coset_homology(path):
    data = json.loads(path.read_text(encoding='utf8'))
    vertices, edges, faces = data['ballVertices'], data['edges'], data['faces']
    local = [
        [(v,) for v in range(len(vertices))],
        [tuple(e) for e in edges],
        [tuple(f) for f in faces],
        [tuple(range(len(vertices)))],
    ]
    labels = [sum(int(x) << i for i, x in enumerate(row)) for row in data['lambda']]
    groups, ids = [], []
    for dimension, entities in enumerate(local):
        dimension_ids, dimension_groups = {}, []
        for e, entity in enumerate(entities):
            incident = [] if dimension == 3 else [f for f, face in enumerate(faces) if set(entity) <= set(face)]
            span = {0}
            for f in incident:
                span |= {x ^ labels[f] for x in tuple(span)}
            cosets = {g: min(g ^ h for h in span) for g in range(8)}
            for g in range(8):
                canonical = (e, cosets[g])
                if canonical not in dimension_ids:
                    dimension_ids[canonical] = len(dimension_groups)
                    dimension_groups.append(canonical)
                dimension_ids[(e, g)] = dimension_ids[canonical]
        ids.append(dimension_ids)
        groups.append(dimension_groups)
    counts = list(map(len, groups))
    assert counts == [20, 60, 48, 8], counts
    boundary = [np.zeros((counts[d - 1], counts[d]), dtype=np.int64) for d in (1, 2, 3)]
    edge_ids = {tuple(sorted(e)): i for i, e in enumerate(edges)}
    for column, (edge, g) in enumerate(groups[1]):
        a, b = edges[edge]
        boundary[0][ids[0][(a, g)], column] -= 1
        boundary[0][ids[0][(b, g)], column] += 1
    for column, (face, g) in enumerate(groups[2]):
        cycle = faces[face]
        for a, b in zip(cycle, cycle[1:] + cycle[:1]):
            edge = edge_ids[tuple(sorted((a, b)))]
            sign = 1 if edges[edge] == [a, b] else -1
            boundary[1][ids[1][(edge, g)], column] += sign
    points = np.asarray(vertices)
    for column, (_, g) in enumerate(groups[3]):
        for f, face in enumerate(faces):
            a, b, c = points[face[:3]]
            sign = 1 if np.dot(np.cross(b - a, c - a), points[face].mean(axis=0)) > 0 else -1
            boundary[2][ids[2][(f, g)], column] += sign
    squared = [int(np.max(np.abs(a @ b))) for a, b in zip(boundary, boundary[1:])]
    assert squared == [0, 0], squared
    # Graph spanning tree collapse: non-tree edge coefficients are an integral
    # basis of ker d1, so deleting tree rows from d2 is unimodular on cycles.
    reached = {0}
    tree = set()
    while len(reached) < counts[0]:
        before = len(reached)
        for edge, column in enumerate(boundary[0].T):
            ends = set(np.flatnonzero(column))
            if len(ends & reached) == 1:
                reached |= ends
                tree.add(edge)
        assert len(reached) > before
    cycles = [e for e in range(counts[1]) if e not in tree]
    smith = smith_normal_form(Matrix(boundary[1][cycles].tolist()), domain=ZZ)
    diagonal = [abs(int(smith[i, i])) for i in range(min(smith.shape)) if smith[i, i]]
    torsion = [n for n in diagonal if n > 1]
    b1 = len(cycles) - len(diagonal)
    assert b1 == 0 and torsion == [2] * 9, (b1, torsion)
    # Exact odd parity checks orientability for this small cover.
    orientable = all(sum(row) % 2 == 1 for row in data['lambda'])
    assert orientable
    return {
        'counts': counts,
        'boundarySquaredResiduals': squared,
        'H1': {'freeRank': b1, 'torsion': torsion},
        'orientable': orientable,
        'chi': sum((-1) ** d * n for d, n in enumerate(counts)),
        'dataSha256': hashlib.sha256(path.read_bytes()).hexdigest(),
        'method': 'P × (Z/2)^3 / ~; graph tree collapse; sympy integer Smith normal form; no engine pairings or homology code',
    }


def check_vertex_stars(receipts):
    reports = []
    for receipt in receipts['receipts']:
        pages = receipt['pages']
        coverage = pages[-1]['coverage']
        assert coverage['mode'] == 'radius' and coverage['complete'] is True
        assert np.asarray(receipt['inputObserver']).reshape(4, 4)[0, 0] > 1.1, 'Probe must be off-centre'
        template = pages[0]['templates'][0]
        normals = np.asarray(template['facePlanes'])
        vertices = np.asarray(template['vertices'])
        transforms = [np.asarray(c['matrix']).reshape(4, 4) for page in pages for c in page['instances']]
        actual = np.asarray([m[:, 0] for m in transforms])
        # Locate a complete interior vertex star relative to each of several
        # nearby cells; output coordinates may have been observer-centered.
        observer = np.asarray(coverage['observer'])
        radius = coverage['radius']
        reflections = [np.eye(4) - 2 * np.outer(n, n @ J) for n in normals]
        source = receipt['source']
        key = ''.join(map(str, source.get('pqr', [5, 3, 4])))
        expected = {'534': 8, '435': 20, '535': 20, '353': 12}[key]
        tested = 0
        maximum = 0.0
        seen = set()
        for base in transforms[:8]:
            for vertex in vertices:
                world = base @ vertex
                distance = math.acosh(max(1, float(-observer @ J @ world)))
                if distance >= radius - 1e-6:
                    continue
                vkey = tuple(np.round(world, 6))
                if vkey in seen:
                    continue
                seen.add(vkey)
                star = [base]
                centres = PointIndex()
                centres.add(base[:, 0])
                for matrix in star:
                    local = J @ matrix.T @ J @ world
                    for face, n in enumerate(normals):
                        if abs(n @ J @ local) > 1e-8:
                            continue
                        candidate = matrix @ reflections[face]
                        if centres.add(candidate[:, 0]):
                            star.append(candidate)
                            assert len(star) <= expected, 'Invalid spherical star'
                assert len(star) == expected, (key, len(star), expected)
                for matrix in star:
                    discrepancy = float(np.min(np.max(np.abs(actual - matrix[:, 0]), axis=1)))
                    scale = max(1, float(np.max(np.abs(matrix[:, 0]))))
                    maximum = max(maximum, discrepancy / scale)
                    assert discrepancy / scale < 1e-8, (key, 'missing vertex-star cell', discrepancy)
                tested += 1
        assert tested >= 1, 'No tested interior vertex; receipt cannot support claim'
        reports.append(
            {
                'source': source,
                'cells': len(transforms),
                'verticesTested': tested,
                'cellsPerStar': expected,
                'maximumRelativeCentreDiscrepancy': maximum,
                'gate': 1e-8,
                'missingStarCells': 0,
            }
        )
    assert len(reports) == 10 and len({str(r['source']) for r in reports}) == 5
    return reports


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--receipts', type=Path, default=ROOT / 'artifacts/verify-hyperbolic/engine-receipts.json')
    parser.add_argument('--output', type=Path, default=ROOT / 'artifacts/verify-hyperbolic')
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    report = {
        'status': 'FAIL',
        'publishedTable': TABLE,
        'limits': [
            'Table values transcribed from the design contract; source PDF extract/hash not present offline. No transition-matrix or general growth-series claim.',
            'Vertex-star probes test local completeness at selected vertices, not every cell of the metric ball. Float64 geometry is not exact certification.',
        ],
    }
    try:
        report['rings'] = {}
        for key, expected in EXPECTED.items():
            result = tits_rings(list(map(int, key)))
            assert result['rings'] == expected, (key, result, expected)
            report['rings'][key] = {**result, 'published': expected, 'pass': True}
        report['smallCover'] = coset_homology(ROOT / 'engine/hyperbolic_data/small-cover-v1.json')
        if not args.receipts.exists():
            raise AssertionError('Missing independent input: run python scripts/capture-hyperbolic-receipts.py first')
        raw = args.receipts.read_bytes()
        report['receiptsSha256'] = hashlib.sha256(raw).hexdigest()
        report['vertexStars'] = check_vertex_stars(json.loads(raw))
        report['status'] = 'PASS'
    except Exception as error:
        report['error'] = str(error)
        raise
    finally:
        (args.output / 'report.json').write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding='utf8')
        lines = [
            '# Independent hyperbolic verification',
            '',
            f"Status: **{report['status']}**",
            '',
            f'Published ring table: {TABLE}',
            '',
            '| Preset | Computed rings 0–3 | Published | Pass |',
            '| --- | --- | --- | --- |',
        ]
        for key, row in report.get('rings', {}).items():
            lines.append(f"| {key} | {row['rings']} | {row['published']} | {row['pass']} |")
        if 'smallCover' in report:
            h = report['smallCover']
            lines.extend(
                [
                    '',
                    f"Coset counts: {h['counts']}; d²: {h['boundarySquaredResiduals']}; H1 = (Z/2)^9, b1 = 0; χ = {h['chi']}; orientable: {h['orientable']}.",
                    f"Data SHA-256: `{h['dataSha256']}`.",
                ]
            )
        lines.extend(['', f"Off-centre vertex-star receipts: {len(report.get('vertexStars', []))}."])
        for row in report.get('vertexStars', []):
            lines.append(
                f"- {row['source']}: {row['verticesTested']} vertices, {row['cellsPerStar']} cells per star, missing 0, max relative centre error {row['maximumRelativeCentreDiscrepancy']:.3e} < {row['gate']}."
            )
        lines.extend(['', 'Limits:'] + ['- ' + item for item in report['limits']])
        if report.get('error'):
            lines.extend(['', 'Error: ' + report['error']])
        (args.output / 'report.md').write_text('\n'.join(lines) + '\n', encoding='utf8')
    print(
        f"PASS: four Tits ring tables, coset H1, {len(report['vertexStars'])} off-centre receipts. {args.output / 'report.md'}"
    )


if __name__ == '__main__':
    main()
