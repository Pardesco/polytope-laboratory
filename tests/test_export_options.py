from copy import deepcopy
import json
import pytest
from engine.export_context import export_options, prepare_export
from engine.formats import export_model, parse_off
from engine.generators import regular, generate
from engine.geometry import GeometryError
from engine.server import dispatch


def availability(model):
    return {row['format']: row for row in export_options(model)['formats']}


@pytest.mark.parametrize('key,available',[
    ('cube', {'off','json','obj','stl','dxf','vrml','pov'}),
    ('tesseract', {'off','json'}),
    ('great-icosahedron', {'off','json','obj','dxf','vrml'}),
])
def test_format_domains_are_enforced_before_serialization_or_file_selection(key, available, tmp_path):
    model = regular(key)
    for format, row in availability(model).items():
        assert row['available'] == (format in available)
        if row['available']:
            assert not row['reason']
            result = prepare_export(model, format, include_text=True)
            assert result['text'] == export_model(result['model'], format)
        else:
            assert row['reason']
            with pytest.raises(GeometryError):
                prepare_export(model, format, include_text=True)
            file = tmp_path / ('preserved.' + format)
            file.write_text('prior literal content')
            with pytest.raises(GeometryError):
                dispatch({'op':'export','model':model,'params':{'format':format,'path':str(file)}})
            assert file.read_text() == 'prior literal content'


def test_polygon_defaults_to_json_instead_of_unwritable_off():
    model = generate('polygon',n=5)
    options = availability(model)
    assert not options['off']['available']
    assert not options['stl']['available']
    assert options['obj']['available'] and options['json']['available']


def test_off_refuses_loose_edges_instead_of_writing_an_unreadable_header():
    model = regular('cube')
    model['interpretation'] = 'generalized-complex'
    model['edges'].append([0,7])
    assert not availability(model)['off']['available']
    with pytest.raises(GeometryError, match='edges outside face'):
        prepare_export(model, 'off')
    for format in ('obj','vrml'):
        assert any('Edges outside face' in loss for loss in prepare_export(model, format)['report']['losses'])
    assert prepare_export(model,'json',include_text=True)['text']
    assert prepare_export(model,'dxf',include_text=True)['text']


def test_extra_embedding_coordinates_never_become_invalid_off_or_obj_records():
    model = regular('cube')
    model['embeddingDimension'] = 4
    model['vertices'] = [point+[0] for point in model['vertices']]
    for format, row in availability(model).items():
        assert row['available'] == (format == 'json')


def test_prepared_utf8_json_keeps_units_notes_metadata_and_source_unchanged():
    source = regular('cube'); before = deepcopy(source)
    result = prepare_export(source,'json','mm','in',{'title':'研究 — π'},'Literal notes',True)
    decoded = json.loads(result['text'])
    assert decoded['metadata']['coordinateUnits'] == 'in'
    assert decoded['metadata']['documentMetadata']['title'] == '研究 — π'
    assert decoded['metadata']['documentNotes'] == 'Literal notes'
    assert decoded['vertices'][0] == pytest.approx([value/25.4 for value in source['vertices'][0]])
    assert source == before
    off = prepare_export(source,'off',include_text=True)
    assert parse_off(off['text'])['faces'] == source['faces']


def test_native_availability_route_and_explicit_triangulation_notice():
    source = regular('cube')
    assert dispatch({'op':'export-options','model':source}) == export_options(source)
    assert any('triangulated' in loss for loss in prepare_export(source,'stl')['report']['losses'])
    with pytest.raises(GeometryError, match='boolean'):
        prepare_export(source,'json',include_text='true')
