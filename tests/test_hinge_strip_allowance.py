from copy import deepcopy
import csv
import io
import json
import math
import subprocess
import sys
import xml.etree.ElementTree as ET

import numpy as np
import pytest
from engine.generators import regular
from engine.geometry import GeometryError, hull
from engine.generalized_nets import unfold_source
from engine.hinge_strip_allowance import hinge_strip_allowance, POLICY
from engine.net_fabrication import dispatch_fabrication
from engine.server import dispatch
from test_generalized_nets import l_prism

SVG = '{http://www.w3.org/2000/svg}'
NET = {'edge_length_mm': 30, 'tabs': False}


def rows(result):
    return list(csv.DictReader(io.StringIO(result['csv'])))


@pytest.mark.parametrize('key,angle', [('cube', 90), ('tetrahedron', math.degrees(math.acos(1 / 3)))])
@pytest.mark.parametrize('e0', [20, 50])
@pytest.mark.parametrize('setback', [0, 2])
def test_analytic_regular_lengths_angles_ids_and_cut_csv(key, angle, e0, setback):
    source = regular(key)
    source['metadata']['coordinateUnits'] = 'in'
    before = deepcopy(source)
    result = dispatch(
        {
            'op': 'net-hinge-strip-allowance',
            'model': source,
            'params': {
                'netParameters': {**NET, 'edge_length_mm': e0},
                'options': {'end_setback_mm': setback, 'strip_width_mm': 8},
            },
        }
    )
    assert result['numericMode'] == 'float64-approximate' and result['policy'] == POLICY
    assert result['units'] == 'mm' and result['contentScale'] == 1 and source == before
    assert result['maxAttachmentResidualMm'] < 1e-10 and result['maxEdgeFlatteningResidualMm'] < 1e-10
    parsed = rows(result)
    assert len(parsed) == len(source['edges'])
    for edge_id, row in enumerate(parsed):
        a, b = source['edges'][edge_id]
        owners = [i for i, f in enumerate(source['faces']) if any({u, v} == {a, b} for u, v in zip(f, f[1:] + f[:1]))]
        assert row['source_hash'] == result['sourceHash'] and row['policy'] == POLICY
        assert (
            row['part_id'] == f'H-E{edge_id}'
            and row['match_id'] == f'E{edge_id}'
            and int(row['source_edge_id']) == edge_id
        )
        assert list(map(int, row['source_vertex_ids'].split(';'))) == [a, b]
        assert list(map(int, row['source_face_ids'].split(';'))) == owners
        assert [int(label.split('/F')[1]) for label in row['adjacent_faces'].split(';')] == owners
        for column, expected in [
            ('reference_e0_mm', e0),
            ('source_length_mm', e0),
            ('end_setback_mm', setback),
            ('cut_length_mm', e0 - 2 * setback),
            ('width_mm', 8),
            ('cut_perimeter_mm', 2 * (e0 - 2 * setback + 8)),
            ('score_length_mm', e0 - 2 * setback),
            ('interior_dihedral_deg', angle),
        ]:
            assert float(row[column]) == pytest.approx(expected)
        assert row['fold'] == 'valley'
    assert result['totalCutLengthMm'] == pytest.approx(len(parsed) * 2 * (e0 - 2 * setback + 8))
    assert result['totalScoreLengthMm'] == pytest.approx(len(parsed) * (e0 - 2 * setback))


def test_unequal_box_edges_use_each_source_length_not_e0_for_all():
    source = hull([[x, y, z] for x in (-1, 1) for y in (-2, 2) for z in (-3, 3)], 'Unequal box')
    result = hinge_strip_allowance(source, NET, {'end_setback_mm': 1.25})
    points = np.array(source['vertices'])
    a, b = source['edges'][0]
    scale = 30 / np.linalg.norm(points[b] - points[a])
    expected = []
    for row, (a, b) in zip(rows(result), source['edges']):
        length = np.linalg.norm(points[b] - points[a]) * scale
        expected.append(length)
        assert float(row['source_length_mm']) == pytest.approx(length)
        assert float(row['cut_length_mm']) == pytest.approx(length - 2.5)
    assert len(set(round(x, 8) for x in expected)) == 3


def test_source_attachment_and_component_placements_are_independently_reconstructed():
    source = regular('cube')
    base = hinge_strip_allowance(source, {**NET, 'hinges': [], 'placements': []})
    root = base['parts'][0]['netScoreSegments'][0]['componentRoot']
    params = {**NET, 'hinges': [], 'placements': [{'root': root, 'translation': [17, -23], 'angle': 37}]}
    moved = hinge_strip_allowance(source, params)
    assert moved['sourceHash'] == base['sourceHash']
    theta = math.radians(37)
    rotation = np.array([[math.cos(theta), -math.sin(theta)], [math.sin(theta), math.cos(theta)]])
    source_points = np.array(source['vertices'])
    net = unfold_source(source, **params)
    for before, after in zip(base['parts'], moved['parts']):
        assert after['adjacentFaces'] == before['adjacentFaces'] and not after['netHinge']
        a, b = after['sourceVertexIds']
        direction = source_points[b] - source_points[a]
        direction /= np.linalg.norm(direction)
        # Target points use a translated source frame; differences and setbacks are invariant.
        segment = np.array(after['sourceScoreSegmentMm'])
        target = np.array(net['targetVertices'])
        assert segment[0] == pytest.approx(target[a] + 2 * direction)
        assert segment[1] == pytest.approx(target[b] - 2 * direction)
        for original, placed in zip(before['netScoreSegments'], after['netScoreSegments']):
            points = np.array(original['pointsMm'])
            expected = points @ rotation.T + [17, -23] if original['componentRoot'] == root else points
            assert np.array(placed['pointsMm']) == pytest.approx(expected)
            assert np.linalg.norm(np.diff(placed['pointsMm'], axis=0)) == pytest.approx(after['cutLengthMm'])
            assert placed['faceLabel'] in after['adjacentFaces']


def test_parsed_svg_cuts_and_scores_match_csv_mm_and_page_placement_once():
    result = hinge_strip_allowance(
        regular('cube'),
        NET,
        {'end_setback_mm': 2, 'strip_width_mm': 8},
        paper={'width_mm': 140, 'height_mm': 120, 'margin_mm': 10},
    )
    cutlist = {row['part_id']: row for row in rows(result)}
    seen = []
    assert len(result['pages']) > 1
    for page in result['pages']:
        root = ET.fromstring(page['svg'])
        assert (
            root.attrib['width'] == '140mm'
            and root.attrib['height'] == '120mm'
            and root.attrib['viewBox'] == '0 0 140 120'
        )
        placement = {p['partId']: p for p in page['placements']}
        boxes = []
        for polygon in root.iter(SVG + 'polygon'):
            part_id = polygon.attrib['data-part-id']
            seen.append(part_id)
            row = cutlist[part_id]
            points = np.array([[float(v) for v in q.split(',')] for q in polygon.attrib['points'].split()])
            assert int(polygon.attrib['data-source-edge-id']) == int(row['source_edge_id'])
            assert points[0] == pytest.approx(placement[part_id]['translationMm'])
            assert np.linalg.norm(points[1] - points[0]) == pytest.approx(float(row['cut_length_mm']))
            assert np.linalg.norm(points[2] - points[1]) == pytest.approx(float(row['width_mm']))
            assert sum(np.linalg.norm(b - a) for a, b in zip(points, np.roll(points, -1, axis=0))) == pytest.approx(
                float(row['cut_perimeter_mm'])
            )
            assert points.min() >= 10 and points[:, 0].max() <= 130 and points[:, 1].max() <= 110
            for low, high in boxes:
                assert np.any(points.min(axis=0) >= high) or np.any(points.max(axis=0) <= low)
            boxes.append((points.min(axis=0), points.max(axis=0)))
        for line in root.iter(SVG + 'line'):
            row = cutlist[line.attrib['data-part-id']]
            a = np.array([float(line.attrib[k]) for k in ('x1', 'y1')])
            b = np.array([float(line.attrib[k]) for k in ('x2', 'y2')])
            assert (
                np.linalg.norm(b - a) == pytest.approx(float(row['score_length_mm']))
                and line.attrib['data-role'] == 'score'
            )
        labels = ' '.join(root.itertext())
        for part in page['placements']:
            assert part['partId'] in labels and f"E{part['sourceEdgeId']}" in labels
    assert sorted(seen) == sorted(cutlist) and len(seen) == len(set(seen))
    stack = ET.fromstring(result['svg'])
    assert len(stack.findall(SVG + 'svg')) == len(result['pages'])


@pytest.mark.parametrize(
    'options',
    [
        {'end_setback_mm': 15},
        {'end_setback_mm': 100},
        {'end_setback_mm': -1},
        {'end_setback_mm': True},
        {'end_setback_mm': float('nan')},
        {'strip_width_mm': 0},
        {'strip_width_mm': '8'},
        {'kerf_mm': 1},
        [],
    ],
)
def test_invalid_or_collapsed_allowances_refuse_without_clipping(options):
    with pytest.raises(GeometryError):
        hinge_strip_allowance(regular('cube'), NET, options)


@pytest.mark.parametrize('kind', ['concave', 'open', 'four-face', '4d'])
def test_unsupported_shells_and_assemblies_refuse(kind):
    source = l_prism() if kind == 'concave' else regular('tesseract' if kind == '4d' else 'cube')
    if kind == 'open':
        source['faces'].pop()
    if kind == 'four-face':
        source['faces'] += source['faces'][:2]
    with pytest.raises(GeometryError):
        hinge_strip_allowance(source, NET)


def test_oversized_pattern_refuses_physical_paper_and_cancellation_ownership_is_fenced():
    with pytest.raises(GeometryError, match='fit.*No scaling'):
        hinge_strip_allowance(regular('cube'), {**NET, 'edge_length_mm': 500})
    request = {'op': 'net-hinge-strip-allowance', 'model': regular('cube'), 'params': {'netParameters': NET}}
    with pytest.raises(GeometryError, match='canceled'):
        dispatch_fabrication(request, cancelled=lambda: True)
    calls = 0

    def changed():
        nonlocal calls
        calls += 1
        if calls == 3:
            request['model']['metadata']['owner'] = 'changed'
        return False

    with pytest.raises(GeometryError, match='ownership changed'):
        dispatch_fabrication(request, cancelled=changed)


def test_warm_json_lines_repeats_after_refusal_without_state_leak():
    source = regular('cube')
    good = {'id': 'a', 'op': 'net-hinge-strip-allowance', 'model': source, 'params': {'netParameters': NET}}
    bad = deepcopy(good)
    bad['id'] = 'b'
    bad['params']['options'] = {'end_setback_mm': 15}
    again = deepcopy(good)
    again['id'] = 'c'
    result = subprocess.run(
        [sys.executable, '-B', '-m', 'engine.server'],
        input=''.join(json.dumps(r) + '\n' for r in (good, bad, again)),
        capture_output=True,
        text=True,
        timeout=45,
    )
    assert result.returncode == 0, result.stderr
    a, b, c = map(json.loads, result.stdout.splitlines())
    assert a['ok'] and not b['ok'] and c['ok']
    assert a['result'] == c['result'] and 'collapses' in b['error']
