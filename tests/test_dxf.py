"""Hand-authored source geometry; expected incidence never comes from a hull."""
import json
import math

import pytest

import engine.dxf as dxf
from engine.dxf import parse_dxf
from engine.geometry import GeometryError, validate


def text(pairs):
    return ''.join(f'{code}\n{value}\n' for code, value in pairs)


def drawing(entities, header=None, tables=None, blocks=None):
    pairs = []
    for name, contents in [('HEADER', header), ('TABLES', tables), ('BLOCKS', blocks), ('ENTITIES', entities)]:
        if contents is not None:
            pairs += [(0, 'SECTION'), (2, name)] + contents + [(0, 'ENDSEC')]
    return text(pairs + [(0, 'EOF')])


def point_groups(point, start=10):
    return [(start + offset, value) for offset, value in zip((0, 10, 20), point)]


def face(points, extra=(), omit_fourth=False):
    points = list(points)
    if len(points) == 3 and not omit_fourth:
        points.append(points[2])
    return [(0, '3DFACE')] + list(extra) + [pair for i, p in enumerate(points) for pair in point_groups(p, 10+i)]


CUBE = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
        [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]]
CUBE_FACES = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4],
              [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]
TETRA = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]]
TETRA_FACES = [[0, 2, 1], [0, 1, 3], [0, 3, 2], [1, 2, 3]]


def polyface(points, faces, counts=None, faces_first=False):
    counts = counts or (len(points), len(faces))
    start = [(0, 'POLYLINE'), (70, 64), (71, counts[0]), (72, counts[1])]
    coordinates = [pair for p in points for pair in [(0, 'VERTEX'), (70, 192)] + point_groups(p)]
    boundaries = [pair for f in faces for pair in [(0, 'VERTEX'), (70, 128), (10, 0), (20, 0), (30, 0)] + list(zip(range(71, 75), f))]
    return start + (boundaries + coordinates if faces_first else coordinates + boundaries) + [(0, 'SEQEND')]


def world_faces(model):
    return [[model['vertices'][v] for v in cycle] for cycle in model['faces']]


@pytest.mark.parametrize('points,cycles,counts', [(CUBE, CUBE_FACES, (8, 12, 6)), (TETRA, TETRA_FACES, (4, 6, 4))])
def test_3dface_exact_incidence_and_source_coordinates(points, cycles, counts):
    source = [pair for cycle in cycles for pair in face([points[v] for v in cycle])]
    model = parse_dxf(drawing(source), 'Hand-authored boundary')
    assert tuple(len(model[key]) for key in ('vertices', 'edges', 'faces')) == counts
    assert world_faces(model) == [[points[v] for v in cycle] for cycle in cycles]
    assert model['cells'] == [] and model['interpretation'] == 'generalized-complex'
    assert model['metadata']['dxf']['affineDimension'] == 3
    assert validate(model)['passed']
    assert all(model['vertices'][s['modelVertex']] == s['coordinates'] for s in model['metadata']['dxf']['sourceVertexMap'])
    # Incidence is retained instead of adding support planes or convexification.
    assert 'facetEquations' not in model and 'measure' not in model


@pytest.mark.parametrize('faces_first', [False, True])
def test_polyface_cube_accepts_odd_record_order_with_identical_incidence(faces_first):
    indices = [[v+1 for v in f] for f in CUBE_FACES]
    model = parse_dxf(drawing(polyface(CUBE, indices, faces_first=faces_first)))
    assert (len(model['vertices']), len(model['edges']), len(model['faces'])) == (8, 12, 6)
    assert model['vertices'] == CUBE
    assert model['faces'] == CUBE_FACES
    assert model['metadata']['dxf']['entities'][0]['actualCounts'] == {'vertices': 8, 'faces': 6}


def test_polyface_negative_index_hides_starting_edge_without_deleting_it():
    model = parse_dxf(drawing(polyface(TETRA[:3], [[-1, 2, 3, 0]], counts=(0, 0))))
    metadata = model['metadata']['dxf']
    assert model['faces'] == [[0, 1, 2]] and len(model['edges']) == 3
    assert metadata['faces'][0]['hiddenBoundaryEdges'] == [0]
    assert metadata['faces'][0]['signedIndices'] == [-1, 2, 3]
    assert metadata['warnings'] and 'advisory counts' in metadata['warnings'][0]
    assert model['validation']['passed']


def test_triangle_hidden_fourth_source_edge_maps_to_closing_boundary():
    model = parse_dxf(drawing(face(TETRA[:3], [(70, 8)])))
    assert len(model['vertices']) == 3 and len(model['edges']) == 3
    assert model['metadata']['dxf']['entities'][0]['invisibleEdgeFlags'] == 8
    assert model['metadata']['dxf']['faces'][0]['hiddenBoundaryEdges'] == [2]
    implicit = parse_dxf(drawing(face(TETRA[:3], omit_fourth=True)))
    assert implicit['faces'] == model['faces']
    assert implicit['metadata']['dxf']['entities'][0]['implicitFourthCorner']


def test_quad_hidden_edge_and_layer_units_truecolor_metadata_json_persistence():
    tables = [(0, 'TABLE'), (2, 'LAYER'), (0, 'LAYER'), (2, 'boundary'), (70, 1),
              (62, -3), (420, 0x204060), (0, 'ENDTAB')]
    header = [(9, '$INSUNITS'), (70, 4), (9, '$ACADVER'), (1, 'AC1032')]
    source = face(CUBE[:4], [(8, 'boundary'), (62, 256), (70, 5), (60, 1)])
    model = parse_dxf(drawing(source, header, tables))
    metadata = model['metadata']['dxf']
    assert metadata['insunits'] == 4 and metadata['unitName'] == 'millimeters'
    assert metadata['coordinatesScaled'] is False and model['vertices'] == CUBE[:4]
    assert metadata['layers']['boundary']['frozen']
    assert metadata['layers']['boundary']['color']['off']
    assert metadata['entities'][0]['color']['resolvedLayerColor']['rgb'] == [32, 64, 96]
    assert metadata['entities'][0]['invisible']
    assert metadata['faces'][0]['hiddenBoundaryEdges'] == [0, 2]
    assert len(model['edges']) == 4  # Visibility is not incidence.
    assert json.loads(json.dumps(model))['metadata'] == model['metadata']


def test_line_point_wcs_extrusion_and_duplicate_line_sources():
    a, b = [2, 3, 4], [6, 3, 4]
    line = [(0, 'LINE'), (62, 0), (210, 1), (220, 0), (230, 0)] + point_groups(a) + point_groups(b, 11)
    source = line + line + [(0, 'POINT'), (420, 0xff0080)] + point_groups([10, 0, 0])
    model = parse_dxf(drawing(source))
    assert model['vertices'] == [a, b, [10, 0, 0]] and model['edges'] == [[0, 1]]
    metadata = model['metadata']['dxf']
    assert len(metadata['edgeSources'][0]) == 2
    assert metadata['entities'][0]['color']['method'] == 'byblock'
    assert metadata['entities'][2]['color']['rgb'] == [255, 0, 128]
    assert metadata['entities'][0]['extrusionDirection'] == [1, 0, 0]
    assert metadata['unitName'] == 'unspecified' and metadata['insunits'] is None
    assert model['faces'] == [] and validate(model)['passed']


def test_point_only_and_line_only_affine_domains_are_explicit():
    point = parse_dxf(drawing([(0, 'POINT')] + point_groups([7, 8, 9])))
    assert point['metadata']['dxf']['affineDimension'] == 0
    line = parse_dxf(drawing([(0, 'LINE')] + point_groups([0, 0, 0]) + point_groups([0, 0, 2], 11)))
    assert line['metadata']['dxf']['affineDimension'] == 1
    assert point['dimension'] == line['dimension'] == 3
    assert point['embeddingDimension'] == line['embeddingDimension'] == 3


def test_explicit_welding_retains_first_source_coordinates_and_map():
    source = [(0, 'LINE')] + point_groups([0, 0, 0]) + point_groups([1, 0, 0], 11)
    source += [(0, 'LINE')] + point_groups([1.0005, 0, 0]) + point_groups([2, 0, 0], 11)
    exact = parse_dxf(drawing(source))
    welded = parse_dxf(drawing(source), weld_tolerance=.001)
    assert len(exact['vertices']) == 4
    assert welded['vertices'] == [[0, 0, 0], [1, 0, 0], [2, 0, 0]]
    assert welded['edges'] == [[0, 1], [1, 2]]
    mapping = welded['metadata']['dxf']['sourceVertexMap']
    assert [s['modelVertex'] for s in mapping] == [0, 1, 1, 2]
    assert mapping[2]['coordinates'] == [1.0005, 0, 0]
    assert mapping[1]['coordinates'] != mapping[2]['coordinates']
    assert welded['provenance']['parameters']['weldTolerance'] == .001


def test_weld_is_not_transitive_chain_clustering_and_handles_tiny_tolerance():
    source = [pair for x in (0, .09, .18) for pair in [(0, 'POINT')] + point_groups([x, 0, 0])]
    model = parse_dxf(drawing(source), weld_tolerance=.1)
    assert model['vertices'] == [[0, 0, 0], [.18, 0, 0]]
    tiny = parse_dxf(drawing([(0, 'POINT')] + point_groups([1e99, 0, 0])), weld_tolerance=5e-324)
    assert tiny['vertices'] == [[1e99, 0, 0]]


@pytest.mark.parametrize('entity', ['CIRCLE', 'ARC', 'LWPOLYLINE', 'SPLINE', 'INSERT', 'MESH', 'SOLID', 'TEXT'])
def test_unsupported_geometry_after_valid_entity_rejects_entire_file(entity):
    source = face(TETRA[:3]) + [(0, entity)]
    with pytest.raises(GeometryError, match='unsupported entity'):
        parse_dxf(drawing(source))


@pytest.mark.parametrize('extra,message', [([(39, 1)], 'thickness'), ([(67, 1)], 'paper-space'),
                                         ([(60, 2)], 'visibility'), ([(70, 16)], 'mask'),
                                         ([(62, 300)], 'ACI'), ([(420, 0x1000000)], '24-bit'),
                                         ([(10, 2)], 'duplicate group')])
def test_invalid_face_fields_fail(extra, message):
    with pytest.raises(GeometryError, match=message):
        parse_dxf(drawing(face(TETRA[:3], extra)))


@pytest.mark.parametrize('indices', [[1, 2, 9], [0, 2, 3], [1, 2, 0, 3], [1, 2, 2], [1, 2]])
def test_invalid_local_polyface_incidence_rejected(indices):
    with pytest.raises(GeometryError):
        parse_dxf(drawing(polyface(TETRA[:3], [indices])))


@pytest.mark.parametrize('source', ['0\nSECTION\n2\nENTITIES\n0\nPOINT\n10\n',
                                   '0\nSECTION\n2\nENTITIES\n0\nEOF\n',
                                   '0\nSECTION\n2\nENTITIES\n0\nENDSEC\n',
                                   'oops\nEOF\n', 'AutoCAD Binary DXF\r\n\x1a\x00'])
def test_malformed_structure_rejected(source):
    with pytest.raises(GeometryError):
        parse_dxf(source)


@pytest.mark.parametrize('value', ['nan', 'inf', '-inf', '1e200', 'not-a-number', '1_000', '١'])
def test_nonfinite_or_unbounded_coordinates_rejected(value):
    with pytest.raises(GeometryError):
        parse_dxf(drawing([(0, 'POINT'), (10, value), (20, 0)]))


@pytest.mark.parametrize('tolerance', [True, -.1, math.inf, math.nan, '0', 10**500])
def test_invalid_welding_tolerance_rejected(tolerance):
    with pytest.raises(GeometryError):
        parse_dxf(drawing([(0, 'POINT')] + point_groups([0, 0, 0])), weld_tolerance=tolerance)


def test_weld_collapsed_face_and_nonplanar_quad_rejected():
    with pytest.raises(GeometryError, match='collapsed'):
        parse_dxf(drawing(face([[0, 0, 0], [.0001, 0, 0], [0, 1, 0]])), weld_tolerance=.001)
    with pytest.raises(GeometryError, match='planar'):
        parse_dxf(drawing(face([[0, 0, 0], [1, 0, 0], [1, 1, 1], [0, 1, 0]])))


def test_orphan_missing_seqend_and_nonpolyface_polyline_rejected():
    for source in [[(0, 'VERTEX'), (70, 192)], polyface(TETRA[:3], [[1, 2, 3]])[:-1], [(0, 'POLYLINE'), (70, 8)]]:
        with pytest.raises(GeometryError):
            parse_dxf(drawing(source))


def test_blocks_with_geometry_reject_and_empty_definitions_are_allowed():
    empty = [(0, 'BLOCK'), (2, '*Model_Space'), (0, 'ENDBLK')]
    source = [(0, 'POINT')] + point_groups([0, 0, 0])
    assert parse_dxf(drawing(source, blocks=empty))['validation']['passed']
    with pytest.raises(GeometryError, match='BLOCKS'):
        parse_dxf(drawing(source, blocks=empty[:-1]+source+empty[-1:]))


@pytest.mark.parametrize('header', [[(9, '$INSUNITS'), (70, -1)], [(9, '$INSUNITS'), (70, 25)],
                                   [(9, '$INSUNITS'), (1, 4)], [(9, '$INSUNITS'), (70, 4), (70, 6)]])
def test_ambiguous_or_invalid_units_rejected(header):
    with pytest.raises(GeometryError):
        parse_dxf(drawing([(0, 'POINT')] + point_groups([0, 0, 0]), header=header))


@pytest.mark.parametrize('limit', ['MAX_PAIRS', 'MAX_ENTITIES', 'MAX_SOURCE_VERTICES', 'MAX_VERTICES'])
def test_resource_budgets_reject_without_partial_model(monkeypatch, limit):
    monkeypatch.setattr(dxf, limit, 1)
    source = [(0, 'LINE')] + point_groups([0, 0, 0]) + point_groups([1, 0, 0], 11)
    source += [(0, 'POINT')] + point_groups([2, 0, 0])
    with pytest.raises(GeometryError, match='resource limit'):
        parse_dxf(drawing(source))


def test_duplicate_face_identity_is_retained_and_comments_order_are_tolerated():
    source = face(TETRA[:3]) + [(999, 'a source comment')] + face(TETRA[:3])
    model = parse_dxf(drawing(source))
    assert model['faces'] == [[0, 1, 2], [0, 1, 2]]
    assert len(model['metadata']['dxf']['faces']) == 2
    shuffled = [(0, 'POINT'), (30, 4), (20, 3), (10, 2)]
    assert parse_dxf(drawing(shuffled))['vertices'] == [[2, 3, 4]]


def test_group_integer_overflow_and_invalid_unicode_are_diagnosed():
    with pytest.raises(GeometryError):
        parse_dxf('9'*5000+'\nEOF\n')
    with pytest.raises(GeometryError, match='Unicode'):
        parse_dxf('\ud800')


def test_byte_and_weld_comparison_budgets(monkeypatch):
    source = drawing([(0, 'POINT')] + point_groups([0, 0, 0]))
    monkeypatch.setattr(dxf, 'MAX_FILE_BYTES', 10)
    with pytest.raises(GeometryError, match='file exceeds'):
        parse_dxf(source)
    monkeypatch.setattr(dxf, 'MAX_FILE_BYTES', 128*1024*1024)
    monkeypatch.setattr(dxf, 'MAX_WELD_COMPARISONS', 1)
    points = [pair for x in (0, .09, .18) for pair in [(0, 'POINT')] + point_groups([x, 0, 0])]
    with pytest.raises(GeometryError, match='comparison resource'):
        parse_dxf(drawing(points), weld_tolerance=.1)


def test_fitted_polyface_and_wrong_table_record_are_not_silently_ignored():
    source = polyface(TETRA[:3], [[1, 2, 3]])
    source.insert(6, (42, .5))
    with pytest.raises(GeometryError, match='bulged'):
        parse_dxf(drawing(source))
    tables = [(0, 'TABLE'), (2, 'LTYPE'), (0, 'LINE'), (0, 'ENDTAB')]
    with pytest.raises(GeometryError, match='does not belong'):
        parse_dxf(drawing([(0, 'POINT')] + point_groups([0, 0, 0]), tables=tables))
