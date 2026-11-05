from copy import deepcopy
import pytest
from engine.conway import conway
from engine.construction_names import construction_name
from engine.generators import regular
from engine.face_subdivision import subdivide_faces
from engine.edge_subdivision import subdivide_edges
from engine.add_dual import add_dual
from engine.server import dispatch


@pytest.mark.parametrize('notation,name',[
    ('tI','Truncated icosahedron'),('tT','Truncated tetrahedron'),
    ('aC','Cuboctahedron'),('aI','Icosidodecahedron'),('dC','Octahedron'),
    ('tC','t(Cube)'),('tD','t(Dodecahedron)')])
def test_conway_result_names(notation,name):
    assert conway(regular('cube'),notation)['name']==name


def test_source_name_and_operator_order_survive_fallback():
    source=regular('cube');source['name']='Workshop cube'
    assert conway(source,'t')['name']=='t(Workshop cube)'
    assert conway(source,'e')['name']=='e(Workshop cube)'


def test_recognition_rejects_counts_without_regular_faces_and_metric_match():
    model=regular('truncated-icosahedron');original=deepcopy(model)
    assert construction_name(model,'fallback')=='Truncated icosahedron'
    model['vertices'][0][0]+=.01
    assert construction_name(model,'fallback')=='fallback'
    assert construction_name(regular('truncated-cube'),'fallback')=='Truncated cube'
    assert construction_name(regular('truncated-octahedron'),'fallback')=='Truncated octahedron'
    assert original['name']=='Truncated icosahedron'


def test_subdivision_and_dual_already_keep_the_source_name():
    source=regular('cube')
    assert subdivide_faces(source)['name']=='Centroid subdivision of Cube'
    assert subdivide_edges(source)['name']=='Edge subdivision of Cube'
    assert add_dual(source)['name']=='Cube + dual'


@pytest.mark.parametrize('params,name',[
    ({'mode':'augment','height':.25},'Cube + pyramid on face 0'),
    ({'mode':'excavate','height':.25},'Cube with pyramid excavation on face 0'),
    ({'mode':'drill','piece':'prism'},'Cube with prism tunnel')])
def test_surgery_names_describe_the_action(params,name):
    result=dispatch({'op':'face-surgery','model':regular('cube'),
                     'params':{'face_id':0,'piece':'pyramid',**params}})
    assert result['name']==name
