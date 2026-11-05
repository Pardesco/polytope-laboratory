from copy import deepcopy
import json
import pytest
from engine.element_types import element_types, _cache
from engine.generators import regular, generate
from engine.operations import truncate, transform
from engine.geometry import GeometryError, hull
from engine.formats import validate_project
from engine.server import dispatch


@pytest.mark.parametrize('key,counts',[
    ('cube',[1,1,1,0]),('cuboctahedron',[1,1,2,0]),
    ('truncated-icosahedron',[1,2,2,0]),('rhombic-dodecahedron',[2,1,1,0]),
    ('tesseract',[1,1,1,1]),('cell24',[1,1,1,1])])
def test_known_types_partition_all_source_elements(key,counts):
    model=regular(key);before=deepcopy(model);result=dispatch({'op':'element-types','model':model})
    assert result['available'] and result['complete'] and result['closureVerified']
    assert result['componentCount']==1 and result['maxNormalizedVertexResidual']<result['tolerance']
    assert [len(result['types'][kind]) for kind in ('vertex','edge','face','cell')]==counts
    for kind,field in [('vertex','vertices'),('edge','edges'),('face','faces'),('cell','cells')]:
        assert sorted(i for t in result['types'][kind] for i in t['ids'])==list(range(len(model[field])))
        for t in result['types'][kind]:
            assert t['count']==len(t['ids']) and t['representative']==t['ids'][0]
            assert t['stabilizerOrder']*t['count']==result['groupOrder']
    assert model==before


def test_rectified_5_cell_has_two_cell_types_despite_identical_face_sizes():
    result=element_types(truncate(regular('simplex4'),.5))
    assert result['available'] and result['groupOrder']==120
    assert [t['count'] for t in result['types']['cell']]==[5,5]
    assert {t['description'] for t in result['types']['cell']}=={
        '4 vertices, 4 faces (4 3-gons)','6 vertices, 8 faces (8 3-gons)'}


def test_counts_descriptions_and_transitivity_are_group_based():
    result=element_types(regular('truncated-icosahedron'))
    assert {(t['count'],t['description']) for t in result['types']['face']}=={(12,'pentagon'),(20,'hexagon')}
    assert sorted(t['count'] for t in result['types']['edge'])==[30,60]
    assert 'vertex-transitive (isogonal)' in result['transitivity']
    assert not any('edge-transitive' in s for s in result['transitivity'])
    assert 'face-transitive (isohedral)' in element_types(regular('rhombic-dodecahedron'))['transitivity']


def test_johnson_square_pyramid_and_broken_metric_do_not_merge_types():
    # J1: base radius 1, side and base edges sqrt(2), height 1.
    source=generate('pyramid',n=4,height=1)
    result=element_types(source)
    assert result['available'] and result['groupOrder']==8
    assert [len(result['types'][kind]) for kind in ('vertex','edge','face')]==[2,2,2]
    source=hull([[0,0,0],[1,0,0],[0,2,0],[0,0,3]])
    result=element_types(source)
    assert result['groupOrder']==1 and len(result['types']['vertex'])==4


def test_components_count_disconnected_source_graph_with_shared_symmetry():
    a=regular('cube');b=transform(a,translation=[4,0,0]);n=len(a['vertices'])
    model=deepcopy(a);model['vertices']+=b['vertices'];model['edges'] += [[v+n for v in e] for e in b['edges']]
    model['faces'] += [[v+n for v in face] for face in b['faces']];model['interpretation']='generalized-complex'
    result=element_types(model)
    assert result['available'] and result['componentCount']==2


def test_rotation_subgroup_and_unavailable_limits_are_honest():
    source=regular('cube');result=element_types(source,orientation='proper')
    assert result['available'] and result['groupOrder']==24 and result['orientation']=='proper'
    limited=element_types(source,max_frames=1)
    assert not limited['available'] and limited['types'] is None and limited['termination']=='frame-limit'
    oversized=deepcopy(source);oversized['vertices']*=33
    assert not element_types(oversized)['available']
    flat=hull([[0,0],[1,0],[1,1],[0,1]]);flat['vertices']=[p+[0] for p in flat['vertices']];flat['embeddingDimension']=3
    assert not element_types(flat)['available']
    for kwargs in ({'max_frames':True},{'max_frames':20001},{'orientation':'other'}):
        with pytest.raises(GeometryError):element_types(source,**kwargs)


def test_cache_is_detached_and_keys_literal_source_not_claimed_fingerprint():
    _cache.clear();source=regular('cube');first=element_types(source);first['types']['vertex'][0]['ids'].clear()
    assert len(element_types(source)['types']['vertex'][0]['ids'])==8
    source['vertices'][0][0]+=.15
    changed=element_types(source)
    assert not changed['available'] or changed['groupOrder']<48


@pytest.mark.parametrize('mode',['face-type','cell-type'])
def test_color_and_selected_type_project_persistence_round_trip(mode):
    source=regular('tesseract');view={'surfaceColors':mode,'entitySelection':{'kind':'face','index':0,'ids':[0,1],'typeLabel':'face type 1'}}
    project={'format':'polytope-laboratory','version':1,'active':0,'documents':[{'cursor':0,'states':[{'model':source,'view':view}]}]}
    saved=validate_project(json.loads(json.dumps(project)))
    assert saved['documents'][0]['states'][0]['view']==view
    for ids in ([0,0],[-1],[len(source['faces'])],[True]):
        bad=deepcopy(project);bad['documents'][0]['states'][0]['view']['entitySelection']['ids']=ids
        with pytest.raises(GeometryError):validate_project(bad)
