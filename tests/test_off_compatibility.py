from copy import deepcopy
import hashlib

import pytest

from engine.formats import export_off, parse_off, repair_off_edge_count
from engine.generators import regular
from engine.geometry import GeometryError, identity


def colored_source():
    model = regular('cross4')
    model['metadata']['offColors'] = {
        'faces': [None] * len(model['faces']), 'cells': [None] * len(model['cells'])}
    model['metadata']['offColors']['faces'][0] = {'encoding': 'byte', 'values': [255, 0, 128]}
    model['metadata']['offColors']['faces'][1] = {'encoding': 'unit', 'values': [1.0, 0.2, 0.0, 0.5]}
    model['metadata']['offColors']['cells'][0] = {'encoding': 'byte', 'values': [20, 40, 60, 128]}
    return model, export_off(model)


def test_boundary_colors_preserve_incidence_and_both_encodings_roundtrip():
    original, source = colored_source()
    imported = parse_off(source)
    assert identity(imported) == identity(original)
    assert imported['faces'] == original['faces'] and imported['cells'] == original['cells']
    assert imported['metadata']['offColors'] == original['metadata']['offColors']
    assert parse_off(export_off(imported))['metadata']['offColors'] == original['metadata']['offColors']


@pytest.mark.parametrize('suffix', ['1', '1 2', '1 2 3 4 5', '256 0 0', '-1 0 0',
                                   '1.1 0.0 0.0', 'nan 0.0 0.0', 'inf 0.0 0.0', '0.5 0.5 -0.1'])
def test_malformed_color_suffixes_rejected(suffix):
    model = regular('cross4')
    lines = export_off(model).splitlines()
    first_face = 3 + len(model['vertices'])
    lines[first_face] += ' ' + suffix
    with pytest.raises(GeometryError):
        parse_off('\n'.join(lines))


def test_color_suffix_never_hides_invalid_boundary_indices():
    model = regular('cross4')
    lines = export_off(model).splitlines()
    face = 3 + len(model['vertices'])
    lines[face] = '3 0 1 999 255 0 0'
    with pytest.raises(GeometryError, match='out-of-range'):
        parse_off('\n'.join(lines))
    lines[face] = '3 0 1 1 255 0 0'
    lines[1] = '8 32 0 16'
    with pytest.raises(GeometryError, match='incidence'):
        parse_off('\n'.join(lines))


def test_edge_count_copy_corrects_only_header_and_revalidates_everything(tmp_path):
    model, source = colored_source()
    declared = len(model['edges']) + 1
    source = source.replace('8 32 24 16', f'8 32 {declared} 16 # original count comment', 1)
    original = tmp_path / 'linked.off'
    original.write_text(source, encoding='utf-8', newline='')
    before = original.read_bytes()
    with pytest.raises(GeometryError, match='Declared edge count'):
        parse_off(source)
    repaired = repair_off_edge_count(source)
    assert repaired['text'] == source.replace(f'8 32 {declared} 16', '8 32 24 16', 1)
    assert repaired['model']['validation']['passed']
    assert repaired['model']['metadata']['offColors'] == model['metadata']['offColors']
    assert repaired['correction']['declaredEdges'] == declared
    assert repaired['correction']['derivedEdges'] == len(model['edges'])
    assert repaired['correction']['sourceSha256'] == hashlib.sha256(before).hexdigest()
    assert original.read_bytes() == before


def test_copy_repair_rejects_unnecessary_negative_and_invalid_geometry():
    model = regular('cross4')
    source = export_off(model)
    with pytest.raises(GeometryError, match='No declared'):
        repair_off_edge_count(source)
    with pytest.raises(GeometryError, match='resource limits'):
        repair_off_edge_count(source.replace('8 32 24 16', '8 32 -1 16'))
    invalid = deepcopy(model)
    invalid['cells'][0] = [0, 0, 0]
    broken = export_off(invalid).replace('8 32 24 16', '8 32 25 16')
    with pytest.raises(GeometryError, match='Invalid OFF incidence'):
        repair_off_edge_count(broken)


def test_export_rejects_outdated_or_invalid_color_metadata():
    model, _ = colored_source()
    model['metadata']['offColors']['faces'].pop()
    with pytest.raises(GeometryError, match='boundary count'):
        export_off(model)
    model, _ = colored_source()
    model['metadata']['offColors']['faces'][0]['values'] = [500, 0, 0]
    with pytest.raises(GeometryError, match='color channels'):
        export_off(model)


def test_cell_dimension_diagnostic_distinguishes_four_dimensional_cell_from_collapse():
    model = regular('cross4')
    model['cells'][0] = list(range(len(model['faces'])))
    with pytest.raises(GeometryError, match=r'Cell 0 actually spans affine dimension 4 \(expected 3\)'):
        parse_off(export_off(model))
