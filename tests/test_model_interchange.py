import json
import pytest
from engine.generators import regular
from engine.formats import export_model, load_file
from engine.geometry import GeometryError
from engine.history import canonical_model


def test_obj_numeric_coordinates_and_ordered_source_faces():
    cube=regular('cube');text=export_model(cube,'obj')
    points=[list(map(float,line.split()[1:])) for line in text.splitlines() if line.startswith('v ')]
    faces=[[int(v)-1 for v in line.split()[1:]] for line in text.splitlines() if line.startswith('f ')]
    assert points==cube['vertices']
    assert faces==cube['faces']


def test_dxf_numeric_edges_against_literal_cube(tmp_path):
    path=tmp_path/'cube.dxf';path.write_text(export_model(regular('cube'),'dxf'))
    imported=load_file(path)['model']
    assert len(imported['vertices'])==8 and len(imported['edges'])==12
    assert sorted(map(tuple,imported['vertices']))==sorted(map(tuple,regular('cube')['vertices']))


@pytest.mark.parametrize('key',['cube','tesseract','great-icosahedron'])
def test_json_model_import_revalidates_full_geometry_and_measure(tmp_path,key):
    original=regular(key);data=json.loads(export_model(original,'json'))
    data['measure']={'content':99999}
    path=tmp_path/'model.json';path.write_text(json.dumps(data))
    restored=load_file(path)['model']
    assert canonical_model(restored)==canonical_model(original)
    assert restored.get('measure')==original.get('measure')
    assert restored['provenance']['sourceFileSha256']


@pytest.mark.parametrize('data',[{},[],{'vertices':[]},{'format':'polytope-laboratory','version':9}])
def test_json_unknown_or_invalid_model_rejected(tmp_path,data):
    path=tmp_path/'invalid.json';path.write_text(json.dumps(data))
    with pytest.raises(GeometryError):load_file(path)
