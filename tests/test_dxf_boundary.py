"""Independent group-pair reader and literal-coordinate expectations for IO-02 DXF."""

from copy import deepcopy
from pathlib import Path
import numpy as np
import pytest
from engine.dxf import parse_dxf
from engine.export_context import prepare_export
from engine.formats import load_file, validate_project
from engine.generators import regular
from engine.geometry import GeometryError, validate
from engine.operations import section, transform
from engine.server import dispatch


def independent_read(text):
    lines = text.splitlines()
    assert len(lines) % 2 == 0
    pairs = [(int(lines[i]), lines[i + 1]) for i in range(0, len(lines), 2)]
    units = int(pairs[pairs.index((9, '$INSUNITS')) + 1][1])
    start = pairs.index((2, 'ENTITIES')) + 1
    entities = []
    for code, value in pairs[start:]:
        if (code, value) == (0, 'ENDSEC'):
            break
        if code == 0:
            entities.append({'type': value, 'fields': {}})
        else:
            assert code not in entities[-1]['fields']
            entities[-1]['fields'][code] = value
    for entity in entities:
        f = entity['fields']
        count = {'3DFACE': 4, 'LINE': 2, 'POINT': 1}[entity['type']]
        entity['points'] = [[float(f[10 + i + 10 * a]) for a in range(3)] for i in range(count)]
        if entity['type'] == '3DFACE' and entity['points'][-1] == entity['points'][-2]:
            entity['points'].pop()
    return units, entities


def boundary(model, source='model', target='model', **kwargs):
    return dispatch(
        {
            'op': 'prepare-export',
            'model': model,
            'params': {
                'format': 'dxf',
                'source_unit': source,
                'target_unit': target,
                'include_text': True,
                'dxf_profile': 'boundary',
                **kwargs,
            },
        }
    )


@pytest.mark.parametrize('source_kind', ['cube', 'section'])
@pytest.mark.parametrize('target,code,extent', [('mm', 4, 25.4), ('in', 1, 1.0)])
def test_cube_and_central_tesseract_section_independent_units_incidence_rgb(source_kind, target, code, extent):
    source = regular('cube') if source_kind == 'cube' else section(regular('tesseract'))['model']
    source = transform(source, scale=12.7)
    source['metadata']['offColors'] = {'faces': [{'encoding': 'byte', 'values': [17, 128, 250]}] * 6}
    before = deepcopy(source)
    result = boundary(source, 'mm', target)
    units, entities = independent_read(result['text'])
    assert units == code and len(entities) == 6
    assert all(e['type'] == '3DFACE' for e in entities)
    assert all(int(e['fields'][420]) == 0x1180FA for e in entities)
    xyz = np.array([p for e in entities for p in e['points']])
    assert xyz.min(axis=0) == pytest.approx([-extent / 2] * 3, abs=1e-14, rel=0)
    assert xyz.max(axis=0) == pytest.approx([extent / 2] * 3, abs=1e-14, rel=0)
    assert len(set(map(tuple, xyz))) == 8
    edges = {
        tuple(sorted((tuple(a), tuple(b))))
        for e in entities
        for a, b in zip(e['points'], e['points'][1:] + e['points'][:1])
    }
    assert len(edges) == 12 and all(len(e['points']) == 4 for e in entities)
    factor = 1 if target == 'mm' else 1 / 25.4
    for face, entity in zip(source['faces'], entities):
        assert np.array_equal(np.array(entity['points']), np.array(source['vertices'])[face] * factor)
    restored = parse_dxf(result['text'])
    assert restored['metadata']['coordinateUnits'] == target
    assert restored['metadata']['offColors']['faces'] == source['metadata']['offColors']['faces']
    assert tuple(len(restored[k]) for k in ('vertices', 'edges', 'faces')) == (8, 12, 6)
    assert result['report']['dxf']['maxRGBChannelResidual'] == 0
    assert source == before


def test_literal_import_truecolor_layer_and_polyface_style_survive_file_project_and_export():
    source = Path('tests/fixtures/dxf-boundary/attributed-mm.dxf')
    before = source.read_bytes()
    model = load_file(source)['model']
    assert model['vertices'] == [
        [0, 0, 2],
        [25.4, 0, 2],
        [25.4, 25.4, 2],
        [0, 25.4, 2],
        [50.8, 0, 2],
        [76.2, 0, 2],
        [101.6, 0, 2],
    ]
    assert model['metadata']['coordinateUnits'] == 'mm'
    assert model['metadata']['offColors']['faces'] == [{'encoding': 'byte', 'values': [32, 64, 96]}]
    assert model['metadata']['dxf']['faces'][0]['hiddenBoundaryEdges'] == [0, 2]
    project = {
        'format': 'polytope-laboratory',
        'version': 1,
        'active': 0,
        'documents': [{'cursor': 0, 'states': [{'model': model, 'view': {'coordinateUnit': 'mm'}, 'notes': ''}]}],
    }
    assert validate_project(project)['documents'][0]['states'][0]['model']['metadata'] == model['metadata']
    result = boundary(model, 'mm', 'in')
    units, entities = independent_read(result['text'])
    assert units == 1 and [e['type'] for e in entities] == ['3DFACE', 'LINE', 'POINT']
    assert np.array(entities[0]['points']) == pytest.approx(
        np.array([[0, 0, 2 / 25.4], [1, 0, 2 / 25.4], [1, 1, 2 / 25.4], [0, 1, 2 / 25.4]]), abs=1e-14, rel=0
    )
    assert np.array(entities[1]['points']) == pytest.approx(
        np.array([[2, 0, 2 / 25.4], [3, 0, 2 / 25.4]]), abs=1e-14, rel=0
    )
    assert np.array(entities[2]['points']) == pytest.approx(np.array([[4, 0, 2 / 25.4]]), abs=1e-14, rel=0)
    assert int(entities[0]['fields'][420]) == 0x204060
    restored = parse_dxf(result['text'])
    assert tuple(len(restored[k]) for k in ('vertices', 'edges', 'faces')) == (7, 5, 1)
    assert len(restored['components']) == 3
    assert any('hidden-edge' in loss for loss in result['report']['losses'])
    assert source.read_bytes() == before


def test_polyface_face_style_overrides_parent_for_document_face_palette():
    records = [(0, 'SECTION'), (2, 'ENTITIES'), (0, 'POLYLINE'), (70, 64)]
    for x, y in [(0, 0), (1, 0), (0, 1)]:
        records += [(0, 'VERTEX'), (70, 192), (10, x), (20, y), (30, 0)]
    records += [
        (0, 'VERTEX'),
        (70, 128),
        (420, 0x123456),
        (71, 1),
        (72, 2),
        (73, 3),
        (0, 'SEQEND'),
        (0, 'ENDSEC'),
        (0, 'EOF'),
    ]
    model = parse_dxf(''.join(f'{code}\n{value}\n' for code, value in records))
    assert model['metadata']['offColors']['faces'] == [{'encoding': 'byte', 'values': [18, 52, 86]}]


def test_triangle_fourth_slot_and_float_color_residual_alpha_loss():
    model = regular('tetrahedron')
    model['metadata']['offColors'] = {'faces': [{'encoding': 'unit', 'values': [0.123, 0.456, 0.789, 0.4]}] * 4}
    result = boundary(model)
    _, entities = independent_read(result['text'])
    assert all(len(e['points']) == 3 for e in entities)
    r = result['report']['dxf']['maxRGBChannelResidual']
    assert 0 < r <= 0.5 / 255
    assert any('alpha' in loss for loss in result['report']['losses'])
    assert any('rounded' in loss for loss in result['report']['losses'])


def test_17_digit_coordinates_roundtrip_without_source_mutation():
    model = transform(regular('cube'), scale=np.nextafter(0.12345678901234567, 1))
    result = boundary(model)
    _, entities = independent_read(result['text'])
    assert [e['points'] for e in entities] == [[model['vertices'][v] for v in face] for face in model['faces']]


def test_coincident_component_coordinates_keep_distinct_layers_and_incidence():
    from engine.compounds import add_models

    source = regular('cube')
    model = add_models(source, source)
    result = boundary(model)
    _, entities = independent_read(result['text'])
    assert {e['fields'][8] for e in entities} == {'part_1', 'part_2'}
    restored = parse_dxf(result['text'])
    assert tuple(len(restored[k]) for k in ('vertices', 'edges', 'faces')) == (16, 24, 12)
    assert result['report']['dxf']['componentCount'] == 2


@pytest.mark.parametrize('name', ['dodecahedron', 'tesseract'])
def test_unsupported_boundary_domains_refuse_without_triangulation_or_projection(name):
    with pytest.raises(GeometryError, match='quadrilaterals|2D or 3D'):
        boundary(regular(name))


@pytest.mark.parametrize('profile', ['mesh', None, True])
def test_unknown_profile_refuses(profile):
    with pytest.raises(GeometryError, match='Wireframe'):
        prepare_export(regular('cube'), 'dxf', dxf_profile=profile)


def test_boundary_option_does_not_change_legacy_wire_or_other_codecs():
    model = regular('cube')
    _, entities = independent_read(prepare_export(model, 'dxf', include_text=True)['text'])
    assert len(entities) == 12 and all(e['type'] == 'LINE' for e in entities)
    with pytest.raises(GeometryError, match='DXF export only'):
        prepare_export(model, 'off', dxf_profile='boundary')


@pytest.mark.parametrize('unit,code', [('mm', 4), ('cm', 5), ('m', 6), ('in', 1), ('ft', 2), ('model', 0)])
def test_document_unit_metadata_matches_header_without_rescaling(unit, code):
    model = regular('cube')
    result = boundary(model, unit, unit)
    restored = parse_dxf(result['text'])
    assert restored['metadata']['coordinateUnits'] == unit
    assert restored['metadata']['dxf']['insunits'] == code
    assert sorted(map(tuple, restored['vertices'])) == sorted(map(tuple, model['vertices']))


def test_unmapped_physical_units_remain_unscaled_and_explicitly_diagnosed():
    text = Path('tests/fixtures/dxf-boundary/attributed-mm.dxf').read_text()
    restored = parse_dxf(text.replace('$INSUNITS\n70\n4\n', '$INSUNITS\n70\n10\n'))
    assert restored['metadata']['coordinateUnits'] == 'model'
    assert restored['metadata']['dxf']['unitName'] == 'yards'
    assert restored['vertices'][1] == [25.4, 0, 2]
    assert any('declare supported document units' in w for w in restored['validation']['warnings'])


def test_transparency_is_not_silently_presented_as_preserved_alpha():
    text = Path('tests/fixtures/dxf-boundary/attributed-mm.dxf').read_text()
    restored = parse_dxf(text.replace('420\n2113632\n', '420\n2113632\n440\n33554559\n'))
    assert any('palette is opaque' in w for w in restored['validation']['warnings'])
    assert restored['metadata']['dxf']['layers']['plate']['color']['transparencyCode'] == 33554559


def test_unrepresentable_coincident_incidence_refuses_instead_of_welding():
    model = regular('cube')
    model['interpretation'] = 'generalized-complex'
    model['vertices'].append(model['vertices'][0][:])
    assert validate(model)['passed']
    with pytest.raises(GeometryError, match='distinct coincident vertices'):
        boundary(model)


def test_output_respects_importer_occurrence_budget(monkeypatch):
    import engine.dxf as dxf

    monkeypatch.setattr(dxf, 'MAX_SOURCE_VERTICES', 23)
    with pytest.raises(GeometryError, match='resource limit'):
        boundary(regular('cube'))
