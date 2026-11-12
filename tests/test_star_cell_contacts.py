from collections import Counter
from copy import deepcopy
import json
import math
import runpy
import subprocess
import sys
import numpy as np
import pytest
from engine import server
from engine.geometry import GeometryError, identity
from engine.independent_cell_sections import independent_cell_section, LIMITS
from engine.recipes import run_recipe, replay_document
from engine.formats import save_project, load_file


def source():
    return runpy.run_path('tests/test_independent_cell_sections.py')['product_source']()


def pieces(rule):
    phi = (1 + math.sqrt(5)) / 2
    r = phi**-2

    def point(radius, angle):
        return np.array([radius * math.cos(angle), radius * math.sin(angle)])

    center = [point(r, (2 * i + 1) * math.pi / 5) for i in range(5)]
    tips = [
        [point(1, 2 * i * math.pi / 5), point(r, (2 * i + 1) * math.pi / 5), point(r, (2 * i - 1) * math.pi / 5)]
        for i in range(5)
    ]
    return [center] + tips if rule == 'nonzero' else tips if rule == 'even-odd' else [center]


def clip(polygon, height, sign):
    result = []
    for a, b in zip(polygon, polygon[1:] + polygon[:1]):
        da = sign * (a[1] - height)
        db = sign * (b[1] - height)
        if da <= 1e-13:
            result.append(a)
        if da * db < 0:
            result.append(a + da / (da - db) * (b - a))
    return result


def area(polygon):
    if len(polygon) < 3:
        return 0.0
    p = np.asarray(polygon)
    return abs(float(np.sum(p[:, 0] * np.roll(p[:, 1], -1) - p[:, 1] * np.roll(p[:, 0], -1)))) / 2


def slab_oracle(rule, t):
    clipped = [clip(clip(P, t - 1, -1), t + 1, 1) for P in pieces(rule)]
    clipped = [P for P in clipped if area(P) > 1e-13]
    lengths = {}
    counts = Counter()
    for P in clipped:
        for a, b in zip(P, P[1:] + P[:1]):
            if np.linalg.norm(a - b) < 1e-12:
                continue
            key = tuple(sorted((tuple(np.round(a, 10)), tuple(np.round(b, 10)))))
            counts[key] += 1
            lengths[key] = math.sqrt((a[0] - b[0]) ** 2 + 2 * (a[1] - b[1]) ** 2)
    return (
        math.sqrt(2) * sum(map(area, clipped)),
        sum(lengths[E] for E, count in counts.items() if count == 1),
        len(clipped) if rule == 'even-odd' else int(bool(clipped)),
    )


def intervals_oracle(rule, height):
    intervals = []
    for P in pieces(rule):
        cuts = []
        for a, b in zip(P, P[1:] + P[:1]):
            if abs(a[1] - height) < 1e-13:
                cuts.append(float(a[0]))
            if (a[1] - height) * (b[1] - height) < 0:
                cuts.append(float((a + (height - a[1]) / (b[1] - a[1]) * (b - a))[0]))
        if len(cuts) > 1 and max(cuts) - min(cuts) > 1e-12:
            intervals.append((min(cuts), max(cuts)))
    merged = []
    for a, b in sorted(intervals):
        if merged and a <= merged[-1][1] + 1e-12:
            merged[-1] = (merged[-1][0], max(b, merged[-1][1]))
        else:
            merged.append((a, b))
    return 2 * sum(b - a for a, b in merged), sum(4 + 2 * (b - a) for a, b in merged), len(merged)


def metric(result, cell):
    regions = [r for r in result['cellSectionRegions'] if r['sourceCell'] == cell]
    if not regions:
        return 0.0, 0.0
    region = regions[0]
    P = np.asarray(result['origin']) + np.asarray(result['model']['vertices']) @ np.asarray(result['basis']).T
    measured = 0.0
    for f in region['outputFaces']:
        Q = P[result['model']['faces'][f]]
        q = Q - Q[0]
        for i in range(1, len(Q) - 1):
            a, b = q[i : i + 2]
            measured += math.sqrt(max(0.0, float(a @ a) * float(b @ b) - float(a @ b) ** 2)) / 2
    length = sum(np.linalg.norm(P[b] - P[a]) for L in region['boundaryLoops'] for a, b in zip(L, L[1:] + L[:1]))
    assert measured == pytest.approx(region['area'], abs=1e-9)
    owners = Counter(
        tuple(sorted((a, b)))
        for f in region['outputFaces']
        for F in [result['model']['faces'][f]]
        for a, b in zip(F, F[1:] + F[:1])
    )
    boundary = Counter(tuple(sorted((a, b))) for L in region['boundaryLoops'] for a, b in zip(L, L[1:] + L[:1]))
    assert {E for E, c in owners.items() if c == 1} == set(boundary)
    assert set(owners.values()) <= {1, 2} and set(boundary.values()) == {1}
    return measured, length


def check_analytic_embedding(result, cell, t, rule):
    region = next((r for r in result['cellSectionRegions'] if r['sourceCell'] == cell), None)
    if not region:
        return
    P = np.asarray(result['origin']) + np.asarray(result['model']['vertices']) @ np.asarray(result['basis']).T

    def inside(p, polygon):
        return all(
            float(np.linalg.det(np.array([b - a, p - a]))) >= -1e-10 for a, b in zip(polygon, polygon[1:] + polygon[:1])
        )

    for face in region['outputFaces']:
        Q = P[result['model']['faces'][face]]
        assert np.max(abs(Q[:, 1] + Q[:, 3] - t)) < 1e-10
        assert max(abs(Q[:, 2])) <= 1 + 1e-10 and max(abs(Q[:, 3])) <= 1 + 1e-10
        if cell in (2, 3):
            assert Q[:, 2] == pytest.approx([-1 if cell == 2 else 1] * len(Q), abs=1e-10)
            assert all(any(inside(q[:2], polygon) for polygon in pieces(rule)) for q in Q)
            assert any(inside(Q[:, :2].mean(0), polygon) for polygon in pieces(rule))
        elif cell in (0, 1):
            w = -1 if cell == 0 else 1
            assert Q[:, 3] == pytest.approx([w] * len(Q), abs=1e-10)
            assert Q[:, 1] == pytest.approx([t - w] * len(Q), abs=1e-10)
            assert all(any(inside(q[:2], polygon) for polygon in pieces(rule)) for q in Q)


@pytest.mark.parametrize('rule,k', [('nonzero', 1), ('even-odd', 1), ('threshold', 2)])
@pytest.mark.parametrize('t', [-1.0001, -1.0, -0.9999])
def test_pentagram_product_edge_event_and_neighbors_against_independent_polygons(rule, k, t):
    s = source()
    before = deepcopy(s)
    result = independent_cell_section(s, [0, 1, 0, 1], t / math.sqrt(2), rule, k)
    assert s == before and result['status'] == 'independent-cell-section'
    # z caps are the pentagram slabs lifted by w=t-y; area factor sqrt(2).
    for cell in (2, 3):
        expected = slab_oracle(rule, t)
        assert metric(result, cell) == pytest.approx(expected[:2], abs=2e-8)
        assert (
            len(next(r for r in result['cellSectionRegions'] if r['sourceCell'] == cell)['boundaryLoops'])
            == expected[2]
        )
    # w caps are horizontal pentagram intervals times the height-two z interval.
    for cell, w in ((0, -1), (1, 1)):
        expected = intervals_oracle(rule, t - w)
        assert metric(result, cell) == pytest.approx(expected[:2], abs=2e-8)
        region = next((r for r in result['cellSectionRegions'] if r['sourceCell'] == cell), None)
        assert (len(region['boundaryLoops']) if region else 0) == expected[2]
    for cell in range(4):
        check_analytic_embedding(result, cell, t, rule)
    # Remaining cells are literal chord x z x w boxes, density one.
    p = np.asarray(s['vertices'])
    for cell in range(4, 9):
        cap = s['faces'][s['cells'][cell][0]]
        a, b = p[cap[:2], :2]
        low, high = 0.0, 1.0
        if abs(b[1] - a[1]) < 1e-12:
            if not t - 1 <= a[1] <= t + 1:
                high = 0.0
        else:
            bounds = sorted(((t - 1 - a[1]) / (b[1] - a[1]), (t + 1 - a[1]) / (b[1] - a[1])))
            low = max(0.0, bounds[0])
            high = min(1.0, bounds[1])
        fraction = max(0.0, high - low)
        length = fraction * math.sqrt((a[0] - b[0]) ** 2 + 2 * (a[1] - b[1]) ** 2)
        expected = (2 * length, 4 + 2 * length) if length > 1e-12 and rule != 'threshold' else (0.0, 0.0)
        assert metric(result, cell) == pytest.approx(expected, abs=2e-8)
    diagnostic = result['densityDiagnostics']
    assert diagnostic['certified'] is False and diagnostic['globalInteriorAsserted'] is False
    assert diagnostic['maxIntegerResidual'] < 1e-10 and diagnostic['partitionResidual'] < 1e-10
    if t == -1:
        assert len(diagnostic['contactEvents']) == 4 and diagnostic['maxPlaneResidual'] < 1e-12
        assert [r['sourceCell'] for r in diagnostic['contactEvents']] == [0, 2, 3, 8]
        assert [r['sourceEdgeIds'] for r in diagnostic['contactEvents']] == [[2], [], [], [2]]
    else:
        assert 'contactEvents' not in diagnostic


def test_source_embedding_and_contact_incidence_are_independently_reversible():
    s = source()
    r = independent_cell_section(s, [0, 1, 0, 1], -1 / math.sqrt(2))
    m = r['model']
    P = np.asarray(r['origin']) + np.asarray(m['vertices']) @ np.asarray(r['basis']).T
    assert np.max(abs(P[:, 1] + P[:, 3] + 1)) < 1e-12
    records = m['metadata']['independentCellSection']['cells']
    raw = np.asarray(s['vertices'])
    for p, refs in zip(P, r['sourceReferences']):
        ref = refs[0]
        record = records[ref['cell']]
        if 'vertex' in ref:
            assert p == pytest.approx(raw[ref['vertex']], abs=1e-10)
        else:
            assert p == pytest.approx(
                np.asarray(record['origin']) + np.asarray(record['basis']) @ ref['cellCoordinates'], abs=1e-10
            )
            assert (
                np.linalg.matrix_rank(
                    np.vstack(
                        [
                            raw[record['sourceVertexIds']] - raw[record['sourceVertexIds'][0]],
                            p - raw[record['sourceVertexIds'][0]],
                        ]
                    ),
                    tol=1e-9,
                )
                == 3
            )
    for event in r['densityDiagnostics']['contactEvents']:
        assert set(event['sourceVertexIds']) <= set(records[event['sourceCell']]['sourceVertexIds'])
        assert np.max(abs(raw[event['sourceVertexIds'], 1] + raw[event['sourceVertexIds'], 3] + 1)) < 1e-12
        assert all(set(s['edges'][e]) <= set(event['sourceVertexIds']) for e in event['sourceEdgeIds'])
    assert r['densityDiagnostics']['maxSourceContactResidual'] < 1e-12
    assert r['densityDiagnostics']['maxCellEmbeddingResidual'] < 1e-12
    for kind in ('vertices', 'edges', 'faces'):
        assert len(m['metadata']['elementSourceMaps'][kind]) == len(m[kind])
    assert m['provenance']['convexified'] is False and m['numeric']['certified'] is False


def test_vertex_only_event_rotation_scale_reflection_and_local_orientation():
    s = source()
    n = np.array([0.17, 0.23, 0.31, 1])
    n /= np.linalg.norm(n)
    d = float(np.asarray(s['vertices'])[0] @ n)
    first = independent_cell_section(s, n.tolist(), d)
    assert first['densityDiagnostics']['contactEvents']
    assert all(not e['sourceEdgeIds'] for e in first['densityDiagnostics']['contactEvents'])
    # An independent orthogonal mixing of all four source coordinates.
    Q = np.array([[1, 1, 1, 1], [1, -1, 1, -1], [1, 1, -1, -1], [1, -1, -1, 1]]) / 2
    moved = deepcopy(s)
    translation = np.array([2.0, -3.0, 7.0, 5.0])
    moved['vertices'] = (-3 * np.asarray(s['vertices']) @ Q.T + translation).tolist()
    for i in range(0, len(moved['faces']), 2):
        moved['faces'][i].reverse()
    moved['fingerprint'] = identity(moved)
    newNormal = Q @ n
    second = independent_cell_section(moved, newNormal.tolist(), -3 * d + float(translation @ newNormal))
    assert [r['area'] for r in second['cellSectionRegions']] == pytest.approx(
        [9 * r['area'] for r in first['cellSectionRegions']], abs=1e-8
    )


def test_empty_tangent_coplanar_global_and_resource_policies(monkeypatch):
    s = source()
    n = np.array([0.17, 0.23, 0.31, 1])
    n /= np.linalg.norm(n)
    d = float(max(np.asarray(s['vertices']) @ n))
    assert independent_cell_section(s, n.tolist(), d + 1)['status'] == 'empty'
    tangent = independent_cell_section(s, n.tolist(), d)
    assert tangent['status'] == 'degenerate' and not tangent['model']['faces']
    for normal, depth in [([0, 0, 1, 0], 1), ([1, 0, 0, 0], math.cos(2 * math.pi / 5))]:
        with pytest.raises(GeometryError, match='coplanar'):
            independent_cell_section(s, normal, depth)
    params = dict(normal=[0, 1, 0, 1], offset=-1 / math.sqrt(2), section_domain='density')
    with pytest.raises(GeometryError, match='vertex/edge/coplanar'):
        server.dispatch(dict(op='section', model=s, params=params))
    before = deepcopy(s)
    monkeypatch.setitem(LIMITS, 'arrangementRegions', 1)
    with pytest.raises(GeometryError, match='no partial section'):
        independent_cell_section(s, params['normal'], params['offset'])
    assert s == before


def native_fixture(rule='even-odd', k=1):
    s = source()
    normal = [0, 1, 0, 1]
    offset = -1 / math.sqrt(2)
    view = dict(
        derivedMode='section',
        sectionNormal=normal,
        sectionOffset=offset,
        coordinateUnit='cm',
        densitySection=dict(enabled=True, rule=rule, threshold=k, cellOrientation='independent'),
    )
    state = dict(model=s, view=view, notes='Transverse star-cell contact')
    document = dict(id='contact-source', states=[state], cursor=0)
    params = dict(
        normal=normal,
        offset=offset,
        section_domain='density',
        fill_rule=rule,
        density_threshold=k,
        cell_orientation='independent',
    )
    preview = server.dispatch(dict(op='section', model=s, params=params))
    history = run_recipe(document, 'section', params, server.dispatch, 'Promote transverse star-cell section')
    return dict(state=state, document=document, params=params, preview=preview, history=history)


@pytest.mark.parametrize('rule,k', [('nonzero', 1), ('even-odd', 1), ('threshold', 2)])
def test_native_promotion_undo_redo_reopen_replay_and_contact_provenance(tmp_path, rule, k):
    f = native_fixture(rule, k)
    history = f['history']
    promoted = history['states'][1]
    assert (
        promoted['model'] == f['preview']['model']
        and f['document']['cursor'] == 0
        and len(f['document']['states']) == 1
    )
    assert promoted['notes'] == f['state']['notes'] and promoted['view']['coordinateUnit'] == 'cm'
    assert promoted['view']['derivedMode'] == 'face' and 'densitySection' not in promoted['view']
    path = tmp_path / 'contact.polyproj'
    save_project(path, dict(format='polytope-laboratory', version=1, active=0, documents=[history]))
    opened = load_file(path)['project']['documents'][0]
    opened['cursor'] = 0
    assert opened['states'][opened['cursor']]['model'] == f['state']['model']
    opened['cursor'] = 1
    assert opened['states'][opened['cursor']]['model'] == promoted['model']
    assert replay_document(opened, server.dispatch)['states'][0]['model'] == promoted['model']
    assert len(promoted['model']['metadata']['densitySection']['diagnostics']['contactEvents']) == 4


def test_warm_json_lines_worker_recovers_coplanar_refusal_then_accepts_event_and_neighbor():
    s = source()
    requests = [
        dict(
            op='section',
            model=s,
            params=dict(normal=n, offset=d, section_domain='density', cell_orientation='independent'),
        )
        for n, d in [([0, 0, 1, 0], 1), ([0, 1, 0, 1], -1 / math.sqrt(2)), ([0, 1, 0, 1], -0.9999 / math.sqrt(2))]
    ]
    child = subprocess.run(
        [sys.executable, '-B', 'engine/server.py'],
        input=''.join(json.dumps(r) + '\n' for r in requests),
        text=True,
        capture_output=True,
        timeout=30,
    )
    assert child.returncode == 0, child.stderr
    replies = [json.loads(line) for line in child.stdout.splitlines()]
    assert not replies[0]['ok'] and 'coplanar' in replies[0]['error']
    assert all(r['ok'] for r in replies[1:])
    assert len(replies[1]['result']['densityDiagnostics']['contactEvents']) == 4
