"""CON-05 literal-source qualification; analytic supports never call a hull."""

from collections import Counter
from copy import deepcopy
from itertools import combinations, product
import json
import math
from pathlib import Path
import sys
from unittest.mock import patch

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from engine import server
from engine.formats import save_project, load_file
from engine.geometry import GeometryError, identity, validate
from engine.recipes import run_recipe, replay_document

SOURCES = json.loads((ROOT / 'tests/fixtures/cut-expansion-oracles.json').read_text())['sources']
KINDS = ('vertices', 'edges', 'faces', 'cells')
TOL = 2e-11
CUT_TABLE = {
    'cube': [(8, 12, 6, 0), (24, 36, 14, 0), (12, 24, 14, 0), (24, 36, 14, 0)],
    'tesseract': [(16, 32, 24, 8), (64, 128, 88, 24), (32, 96, 88, 24), None],
    'tetrahedron': [(4, 6, 4, 0), (12, 18, 8, 0), (6, 12, 8, 0), (12, 18, 8, 0)],
    'octagram_cube': [(24, 36, 14, 0), (72, 108, 38, 0), (36, 72, 38, 0), (72, 108, 38, 0)],
}
DEPTHS = (0, 0.25, 0.5, 0.5001)


def counts(m):
    return tuple(len(m[k]) for k in KINDS)


def cloud_error(actual, expected):
    a = np.asarray(actual)
    b = np.asarray(expected)
    distances = np.linalg.norm(a[:, None, :] - b[None, :, :], axis=2)
    owners = distances.argmin(axis=1)
    assert len(a) == len(b) == len(set(owners))
    error = float(distances.min(axis=1).max())
    assert error < TOL
    return owners, error


def rank(points, ids):
    cloud = points[list(ids)]
    return np.linalg.matrix_rank(cloud - cloud.mean(axis=0), tol=1e-9)


def support_complex(vertices, equations):
    """Intersect known analytic supporting flats, without kernel incidence."""
    points = np.asarray(vertices)
    d = points.shape[1]
    facets = set()
    residual = 0.0
    for normal, height in equations:
        offsets = points @ normal - height
        residual = max(residual, float(max(0, offsets.max())))
        ids = frozenset(np.flatnonzero(abs(offsets) < TOL))
        if len(ids) >= d and rank(points, ids) == d - 1:
            facets.add(ids)
    assert residual < TOL
    faces = (
        facets
        if d == 3
        else {a & b for a, b in combinations(facets, 2) if len(a & b) >= 3 and rank(points, a & b) == 2}
    )
    edges = {a & b for a, b in combinations(faces, 2) if len(a & b) == 2}
    return {'vertices': vertices, 'edges': edges, 'faces': faces, 'facets': facets, 'residual': residual}


def assert_complex(model, oracle):
    owners, error = cloud_error(model['vertices'], oracle['vertices'])

    def mapped(ids):
        return frozenset(int(owners[i]) for i in ids)

    assert {mapped(e) for e in model['edges']} == oracle['edges']
    assert {mapped(f) for f in model['faces']} == oracle['faces']
    for face in model['faces']:
        assert all(mapped([a, b]) in oracle['edges'] for a, b in zip(face, face[1:] + face[:1]))
    if model['dimension'] == 4:
        assert {mapped({v for fi in cell for v in model['faces'][fi]}) for cell in model['cells']} == oracle['facets']
        assert Counter(fi for cell in model['cells'] for fi in cell) == Counter(
            {i: 2 for i in range(len(model['faces']))}
        )
    return error


def cut_cube_oracle(d, t):
    # Intersect the sign cube with corner cuts s.x <= d-2t.
    signs = list(product((-1, 1), repeat=d))
    vertices = sorted({tuple(s[j] * (1 - 2 * t if i == j else 1) for j in range(d)) for s in signs for i in range(d)})
    equations = [(np.eye(d)[i] * s, 1) for i in range(d) for s in (-1, 1)]
    equations.extend((np.asarray(s), d - 2 * t) for s in signs)
    return support_complex(vertices, equations)


def expansion_oracle(d, t, center=None):
    # Minkowski sum (1-t)[-1,1]^d + t*polar_C(cube), radius squared = 2.
    c = np.asarray(center if center is not None else [0] * d)
    signs = list(product((-1, 1), repeat=d))
    vertices = set()
    equations = []
    for s in signs:
        for i in range(d):
            q = c.copy()
            q[i] += 2 * s[i] / (1 - s[i] * c[i])
            vertices.add(tuple((1 - t) * np.asarray(s) + t * q))
    for k in range(1, d + 1):
        for axes in combinations(range(d), k):
            for s in product((-1, 1), repeat=k):
                n = np.zeros(d)
                for i, sign in zip(axes, s):
                    n[i] = sign * (1 - sign * c[i]) / 2
                equations.append((n, (1 - t) * sum(abs(n)) + t * (1 + n @ c)))
    # Endpoint duplicates are literal, not numerical welds.
    return support_complex(sorted(vertices), equations)


def normalized_planarity(model):
    p = np.asarray(model['vertices'])
    p = (p - p.mean(axis=0)) / np.ptp(p, axis=0).max()
    maximum = 0.0
    entities = [(f, 2) for f in model['faces']]
    entities.extend((sorted({v for fi in c for v in model['faces'][fi]}), 3) for c in model['cells'])
    for ids, k in entities:
        cloud = p[ids] - p[ids].mean(axis=0)
        _, _, axes = np.linalg.svd(cloud, full_matrices=False)
        maximum = max(maximum, float(np.linalg.norm(cloud - (cloud @ axes[:k].T) @ axes[:k], axis=1).max()))
    assert maximum < TOL
    return maximum


def qualify_cut(key, t):
    source = deepcopy(SOURCES[key])
    before = deepcopy(source)
    expected = CUT_TABLE[key][DEPTHS.index(t)]
    request = {'op': 'incidence-truncate-preview', 'model': source, 'params': {'preset': 'manual', 'amount': t}}
    if expected is None:
        with pytest.raises(GeometryError, match='extrapolation'):
            server.dispatch(request)
        assert source == before
        return {'source': key, 'fraction': t, 'status': 'refused', 'boundary': '4D extrapolation above 1/2'}
    with patch('engine.geometry.hull', side_effect=AssertionError('No hull oracle or repair')):
        packet = server.dispatch(request)
    m = packet['model']
    info = packet['construction']
    assert counts(m) == expected and validate(m)['passed']
    assert info['parameters']['amount'] == t and info['sourceModel'] == source
    assert info['hullUsed'] is False and info['toleranceWeld'] is False
    expected_points = (
        source['vertices']
        if t == 0
        else sorted(
            {
                tuple((1 - t) * np.asarray(source['vertices'][a]) + t * np.asarray(source['vertices'][b]))
                for edge in source['edges']
                for a, b in (edge, edge[::-1])
            }
        )
    )
    _, coordinate_error = cloud_error(m['vertices'], expected_points)
    if key in ('cube', 'tesseract') and t <= 0.5:
        coordinate_error = assert_complex(m, cut_cube_oracle(source['dimension'], t))
    if t == 0:
        assert identity(m) == identity(source)
        for kind in KINDS:
            assert m[kind] == source[kind]
    elif source['dimension'] == 3:
        # A trivalent closed surface: each old edge yields 2 corners (1 at rectify),
        # each old face doubles its sides, and each old vertex contributes a triangle.
        assert Counter(map(len, m['faces'])) == Counter(
            [len(f) * (1 if t == 0.5 else 2) for f in source['faces']] + [3] * len(source['vertices'])
        )
        assert Counter(v for e in m['edges'] for v in e) == Counter(
            {i: 4 if t == 0.5 else 3 for i in range(len(m['vertices']))}
        )
    if t > 0.5 or key == 'octagram_cube':
        assert m['interpretation'] == 'generalized-complex' and not info['solidInteriorInferred']
        assert 'measure' not in m
    assert source == before
    return {
        'source': key,
        'fraction': t,
        'status': 'passed',
        'expected': expected,
        'actual': counts(m),
        'coordinateResidual': coordinate_error,
        'normalizedPlanarityResidual': normalized_planarity(m),
        'interpretation': m['interpretation'],
    }


@pytest.mark.parametrize('key', CUT_TABLE)
@pytest.mark.parametrize('t', DEPTHS)
def test_con_05_cut_transitions(key, t):
    qualify_cut(key, t)


@pytest.mark.parametrize('d', [3, 4])
@pytest.mark.parametrize('t', [0, 0.25, 0.5, 0.75, 1])
@pytest.mark.parametrize('shifted', [False, True])
def test_con_05_expansion_support_incidence_and_measures(d, t, shifted):
    qualify_expansion(d, t, shifted)


def qualify_expansion(d, t, shifted):
    source = deepcopy(SOURCES['cube' if d == 3 else 'tesseract'])
    before = deepcopy(source)
    center = [0.125, -0.25, 0.0625] + ([0.1875] if d == 4 else []) if shifted else [0] * d
    params = {'ratio': t, 'radius': math.sqrt(2), 'center': center, 'color_policy': 'source'}
    with patch('engine.geometry.hull', side_effect=AssertionError('No hull oracle or repair')):
        m = server.dispatch({'op': 'expand-runcinate', 'model': source, 'params': params})
    error = assert_complex(m, expansion_oracle(d, t, center))
    expected = (
        ((8, 12, 6, 0) if d == 3 else (16, 32, 24, 8))
        if t == 0
        else ((6, 12, 8, 0) if d == 3 else (8, 24, 32, 16))
        if t == 1
        else ((24, 48, 26, 0) if d == 3 else (64, 192, 208, 80))
    )
    assert counts(m) == expected
    assert m['interpretation'] == 'convex-polytope' and m['validation']['passed'] and not m['numeric']['certified']
    measure_error = None
    if not shifted:
        a = 1 - t
        b = 2 * t
        volume = sum(math.comb(d, k) * (2 * a) ** (d - k) * 2**k * b**k / math.factorial(k) for k in range(d + 1))
        area = sum(
            math.comb(d, k) * 2**k * math.sqrt(k) * (2 * a) ** (d - k) * b ** (k - 1) / math.factorial(k - 1)
            for k in range(1, d + 1)
        )
        measure_error = max(abs(m['measure']['content'] - volume), abs(m['measure']['boundaryMeasure'] - area))
        assert measure_error < TOL
    assert source == before
    return {
        'dimension': d,
        'ratio': t,
        'center': center,
        'status': 'passed',
        'expected': expected,
        'actual': counts(m),
        'coordinateResidual': error,
        'normalizedPlanarityResidual': normalized_planarity(m),
        'measureResidual': measure_error,
    }


@pytest.mark.parametrize('preset,t,winding', [('normal', 1 - math.sqrt(2) / 2, 1), ('quasi', 1 + math.sqrt(2) / 2, 3)])
@pytest.mark.parametrize('colors', ['inherit', 'none'])
def test_con_05_normal_quasi_literal_reference(preset, t, winding, colors):
    qualify_regular(preset, t, winding, colors)


def qualify_regular(preset, t, winding, colors):
    source = deepcopy(SOURCES['cube'])
    color = {'encoding': 'byte', 'values': [10, 40, 90, 127]}
    source['metadata']['offColors'] = {'faces': [color] * 6}
    params = {'preset': preset, 'reference_face': 2, 'cap_colors': colors}
    packet = server.dispatch({'op': 'incidence-truncate-preview', 'model': source, 'params': params})
    m = packet['model']
    info = packet['construction']
    assert counts(m) == (24, 36, 14, 0) and abs(info['parameters']['amount'] - t) < TOL
    assert info['regularReference']['face'] == 2 and info['parameters']['cap_colors'] == colors
    assert Counter(map(len, m['faces'])) == {8: 6, 3: 8}
    lengths = [math.dist(m['vertices'][a], m['vertices'][b]) for a, b in m['edges']]
    assert max(lengths) - min(lengths) < TOL
    # Each source square remains in its plane. Its eight-cycle turns once / three
    # times around its own center, independently distinguishing the octagram.
    winding_error = 0.0
    for face in m['faces'][:6]:
        p = np.asarray(m['vertices'])[face]
        cloud = p - p.mean(axis=0)
        _, _, axes = np.linalg.svd(cloud)
        xy = cloud @ axes[:2].T
        angle = sum(math.atan2(a[0] * b[1] - a[1] * b[0], a @ b) for a, b in zip(xy, np.roll(xy, -1, axis=0)))
        winding_error = max(winding_error, abs(abs(angle) / (2 * math.pi) - winding))
        assert winding_error < TOL
    assigned = m['metadata']['offColors']['faces']
    assert assigned[:6] == [color] * 6 and assigned[6:] == ([color] * 8 if colors == 'inherit' else [None] * 8)
    if preset == 'quasi':
        cloud_error(m['vertices'], SOURCES['octagram_cube']['vertices'])
        assert m['interpretation'] == 'generalized-complex' and 'measure' not in m
    return {
        'preset': preset,
        'referenceFace': 2,
        'capColors': colors,
        'status': 'passed',
        'expected': (24, 36, 14, 0),
        'actual': counts(m),
        'fraction': info['parameters']['amount'],
        'fractionResidual': abs(info['parameters']['amount'] - t),
        'edgeLengthSpread': max(lengths) - min(lengths),
        'faceWinding': winding,
        'windingResidual': winding_error,
        'normalizedPlanarityResidual': normalized_planarity(m),
    }


REFUSAL_CASES = [
    ('cube', 'truncate', {'amount': -0.0001}, 'amount'),
    ('cube', 'truncate', {'amount': 0.5001}, 'amount'),
    ('tesseract', 'truncate', {'amount': 0.5001}, 'amount'),
    ('cube', 'incidence-truncate', {'amount': -0.0001}, 'fraction'),
    ('cube', 'incidence-truncate', {'amount': 1}, 'collapses'),
    ('tesseract', 'incidence-truncate', {'amount': -0.0001}, 'fraction'),
    ('tesseract', 'incidence-truncate', {'amount': 0.5001}, 'extrapolation'),
    ('cube', 'incidence-truncate', {'amount': 1e-12}, 'unresolved'),
    ('cube', 'incidence-truncate', {'amount': 0.5 - 1e-12}, 'unresolved'),
    ('cube', 'incidence-truncate', {'amount': 0.5 + 1e-12}, 'unresolved'),
    ('tesseract', 'incidence-truncate', {'amount': 1e-12}, 'unresolved'),
    ('tesseract', 'incidence-truncate', {'amount': 0.5 - 1e-12}, 'unresolved'),
    ('tesseract', 'incidence-truncate', {'preset': 'normal'}, 'manual'),
    ('tetrahedron', 'incidence-truncate', {'preset': 'quasi'}, 'even-sided'),
    ('cube', 'expand-runcinate', {'ratio': -0.0001}, 'ratio'),
    ('cube', 'expand-runcinate', {'ratio': 1.0001}, 'ratio'),
    ('tesseract', 'expand-runcinate', {'ratio': -0.0001}, 'ratio'),
    ('tesseract', 'expand-runcinate', {'ratio': 1.0001}, 'ratio'),
    ('octagram_cube', 'expand-runcinate', {}, 'convex'),
    ('cube', 'expand-runcinate', {'center': [1, 0, 0]}, 'center'),
    ('tesseract', 'expand-runcinate', {'center': [0, 0, 0, 1]}, 'center'),
]


@pytest.mark.parametrize('key,op,params,message', REFUSAL_CASES)
def test_refusal_boundaries_are_atomic(key, op, params, message):
    qualify_refusal(key, op, params, message)


def qualify_refusal(key, op, params, message):
    source = deepcopy(SOURCES[key])
    before = deepcopy(source)
    with pytest.raises(GeometryError, match=message) as refused:
        server.dispatch({'op': op, 'model': source, 'params': params})
    doc = {'id': 'refused', 'cursor': 0, 'states': [{'model': source, 'view': {}, 'notes': 'Retain source'}]}
    snapshot = deepcopy(doc)
    with pytest.raises(GeometryError):
        run_recipe(doc, op, params, server.dispatch)
    assert source == before and doc == snapshot
    return {
        'source': key,
        'operation': op,
        'parameters': params,
        'status': 'refused-atomically',
        'message': str(refused.value),
    }


HISTORY_CASES = (
    [('tesseract', 'incidence-truncate', {'amount': t, 'cap_colors': 'none'}) for t in (0, 0.25, 0.5)]
    + [
        ('cube', 'incidence-truncate', {'preset': preset, 'reference_face': 2, 'cap_colors': 'inherit'})
        for preset in ('normal', 'quasi')
    ]
    + [('octagram_cube', 'incidence-truncate', {'amount': 0.5001})]
    + [
        (key, 'expand-runcinate', {'ratio': t, 'radius': math.sqrt(2), 'center': center})
        for key, center in [('cube', [0.125, -0.25, 0.0625]), ('tesseract', [0.125, -0.25, 0.0625, 0.1875])]
        for t in (0, 0.5, 1)
    ]
)


@pytest.mark.parametrize('key,op,params', HISTORY_CASES)
def test_saved_parameters_preview_adopt_replay(tmp_path, key, op, params):
    source = deepcopy(SOURCES[key])
    source['metadata']['asset'] = {'raw': [0.125, 'unchanged']}
    d = source['dimension']
    kind = 'cells' if d == 4 else 'faces'
    color = {'encoding': 'byte', 'values': [10, 40, 90, 127]}
    source['metadata']['offColors'] = {kind: [color] * len(source[kind])}
    doc = {
        'id': 'literal-source',
        'cursor': 0,
        'states': [{'model': source, 'view': {'coordinateUnit': 'mm'}, 'notes': 'Literal notes'}],
    }
    before = deepcopy(doc)
    preview = server.dispatch(
        {'op': 'incidence-truncate-preview' if op == 'incidence-truncate' else op, 'model': source, 'params': params}
    )
    built = run_recipe(doc, op, params, server.dispatch)
    adopted = built['states'][1]['model']
    assert identity(preview['model'] if op == 'incidence-truncate' else preview) == identity(adopted)
    node = next(n for n in built['operationHistory']['nodes'] if n['op'] == op)
    assert node['params'] == params
    path = tmp_path / 'cut-expansion.polyproj'
    save_project(path, {'format': 'polytope-laboratory', 'version': 1, 'active': 0, 'documents': [built]})
    saved = load_file(path)['project']['documents'][0]
    replay = replay_document(saved, server.dispatch)['states'][0]
    assert identity(replay['model']) == identity(saved['states'][1]['model'])
    assert replay['model']['metadata'] == saved['states'][1]['model']['metadata']
    assert replay['notes'] == 'Literal notes' and replay['view']['coordinateUnit'] == 'mm'
    assert identity(built['states'][0]['model']) == identity(source)
    assert doc == before


@pytest.mark.parametrize('d', [3, 4])
@pytest.mark.parametrize('t', [0, 0.25, 0.5])
def test_convex_hull_adapter_against_analytic_cut_supports(d, t):
    qualify_convex_adapter(d, t)


def qualify_convex_adapter(d, t):
    source = SOURCES['cube' if d == 3 else 'tesseract']
    m = server.dispatch({'op': 'truncate', 'model': source, 'params': {'amount': t}})
    oracle = cut_cube_oracle(d, t)
    error = assert_complex(m, oracle)
    return {
        'dimension': d,
        'fraction': t,
        'operation': 'truncate',
        'status': 'passed',
        'actual': counts(m),
        'expected': (
            len(oracle['vertices']),
            len(oracle['edges']),
            len(oracle['faces']),
            len(oracle['facets']) if d == 4 else 0,
        ),
        'coordinateResidual': error,
        'normalizedPlanarityResidual': normalized_planarity(m),
    }


def test_zero_4d_receipt_has_unchanged_owners_and_detached_attributes():
    source = deepcopy(SOURCES['tesseract'])
    before = deepcopy(source)
    packet = server.dispatch(
        {'op': 'incidence-truncate-preview', 'model': source, 'params': {'amount': 0, 'cap_colors': 'none'}}
    )
    m = packet['model']
    info = packet['construction']
    for kind in KINDS:
        singular = {'vertices': 'vertex', 'edges': 'edge', 'faces': 'face', 'cells': 'cell'}[kind]
        assert [r[singular] for r in info[singular + 'Sources']] == list(range(len(source[kind])))
    assert info['sourceFingerprint'] == identity(source) and info['solidInteriorInferred']
    m['metadata']['fixture'] = 'Changed result'
    assert source == before and info['sourceModel'] == source


if __name__ == '__main__':
    report = {
        'scenarioIds': ['con-05-cut-transitions', 'con-05-normal-quasi', 'con-05-expand-3d', 'con-05-expand-4d'],
        'scope': 'Native literal-source qualification; competitor extrapolation semantics and desktop execution unverified',
        'cuts': [qualify_cut(key, t) for key in CUT_TABLE for t in DEPTHS],
        'convexCutAdapter': [qualify_convex_adapter(d, t) for d in (3, 4) for t in (0, 0.25, 0.5)],
        'normalQuasi': [
            qualify_regular(preset, t, winding, colors)
            for preset, t, winding in [('normal', 1 - math.sqrt(2) / 2, 1), ('quasi', 1 + math.sqrt(2) / 2, 3)]
            for colors in ('inherit', 'none')
        ],
        'expansions': [
            qualify_expansion(d, t, shifted)
            for d in (3, 4)
            for shifted in (False, True)
            for t in (0, 0.25, 0.5, 0.75, 1)
        ],
        'refusals': [qualify_refusal(*case) for case in REFUSAL_CASES],
    }
    Path(sys.argv[1]).write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
