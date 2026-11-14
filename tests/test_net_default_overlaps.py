"""The 18 Platonic/Archimedean defaults, excluding alternate chiral mirrors."""

from copy import deepcopy
from itertools import combinations
import xml.etree.ElementTree as ET
import numpy as np
import pytest
from engine.catalog import get_catalog
from engine.generators import generate
from engine.nets import unfold, reconstruct_net, net_svg, overlaps
from engine.net_printing import pack_net
from engine.element_annotations import new_document, set_text
from engine.net_tab_assignment import choose_tabs
from engine.formats import validate_project


SOLIDS = [
    row['key']
    for row in get_catalog()
    if row['family'] in ('Platonic', 'Archimedean') and not row['key'].endswith('-mirror')
]


def area(p):
    p = np.asarray(p)
    return abs(float(np.sum(p[:, 0] * np.roll(p[:, 1], -1) - p[:, 1] * np.roll(p[:, 0], -1)))) / 2


@pytest.mark.parametrize('key', SOLIDS)
def test_default_has_no_face_or_glue_tab_overlaps(key, record_property):
    assert len(SOLIDS) == 18
    model = generate('regular', key=key)
    before = deepcopy(model)
    net = unfold(model)
    record_property('glue_tab_overlap_pairs', len(net['tabOverlapPairs']))
    assert net['overlapPairs'] == []
    assert net['tabOverlapPairs'] == [], f'{key}: {len(net["tabOverlapPairs"])} glue-tab overlaps'
    assert not net['hasOverlap'] and not net['hasTabOverlap']
    tabs = net['tabRecords']
    assert len(tabs) == len(model['edges']) - len(model['faces']) + 1
    assert len({t['edge'] for t in tabs}) == len(tabs)
    assert model == before
    tolerance = net['referenceEdgeLengthMm'] * 1e-8
    for tab in tabs:
        face = net['faces'][tab['face']]
        index = next(i for i, e in enumerate(face['edges']) if e['id'] == tab['edge'])
        a, b = np.asarray(face['points'])[index], np.asarray(face['points'])[(index + 1) % len(face['points'])]
        p = np.asarray(tab['points'])
        assert p[0] == pytest.approx(a)
        assert p[-1] == pytest.approx(b)
        length = float(np.linalg.norm(b - a))
        depth = min(4, length / 5)
        original_area = (length - depth) * depth
        assert original_area * 0.1 - tolerance <= area(p) <= original_area + tolerance
        assert not any(overlaps(p, np.asarray(f['points']), tolerance) for f in net['faces'])
    assert not any(
        overlaps(np.asarray(a['points']), np.asarray(b['points']), tolerance) for a, b in combinations(tabs, 2)
    )
    assert net['foldValidation']['maxEndpointErrorMm'] <= net['foldValidation']['toleranceMm']
    assert reconstruct_net(model, net)['tabRecords'] == tabs
    assert net_svg(net).count('data-net-tab=') == len(tabs)


def test_corner_trimmed_tabs_survive_annotation_sanitizing_packing_and_native_reopen():
    model = generate('regular', key='dodecahedron')
    annotations = set_text(new_document(model), model, 'face', 0, 'Glue after dry fitting')
    net = unfold(model, element_annotations=annotations)
    svg = net_svg(net)
    assert 'Glue after dry fitting' in svg
    assert svg.count('data-net-tab=') == len(net['tabRecords'])
    pages = pack_net(net)
    assert sum(p['svg'].count('data-net-tab=') for p in pages['pages']) == len(net['tabRecords'])
    for page in pages['pages']:
        ET.fromstring(page['svg'])
    state = {
        'model': model,
        'view': {'net': {'root': 0, 'length': 25, 'tabs': True}, 'elementAnnotations': annotations},
        'netLayout': net,
        'netPages': pages,
    }
    project = {
        'format': 'polytope-laboratory',
        'version': 1,
        'active': 0,
        'documents': [{'id': 'default-net', 'cursor': 0, 'states': [state]}],
    }
    tampered = deepcopy(project)
    tampered['documents'][0]['states'][0]['netLayout']['tabRecords'][0]['points'] = [[999, 999]] * 4
    restored = validate_project(tampered)['documents'][0]['states'][0]
    assert restored['netLayout']['tabRecords'] == net['tabRecords']
    assert restored['netLayout']['tabOverlapPairs'] == []
    assert restored['netLayout']['svg'] == svg


def test_side_assignment_uses_clear_side_and_reports_unsatisfied_geometry_deterministically():
    def square(x):
        return [[x, 0], [x + 1, 0], [x + 1, 1], [x, 1]]

    candidates = [{'edge': 0, 'face': 0, 'points': square(0)}, {'edge': 0, 'face': 1, 'points': square(3)}]
    faces = [{'points': square(0)}]
    assert choose_tabs(candidates, faces, 1e-8, convex=True)[0]['face'] == 1
    blocked = faces + [{'points': square(3)}]
    chosen = choose_tabs(candidates, blocked, 1e-8, convex=True)
    assert chosen == choose_tabs(candidates, blocked, 1e-8, convex=True)
    assert len(chosen) == 1
    assert any(
        overlaps(np.asarray(chosen[0]['points'], dtype=float), np.asarray(f['points'], dtype=float)) for f in blocked
    )
