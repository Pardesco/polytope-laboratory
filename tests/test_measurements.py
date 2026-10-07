from copy import deepcopy
import math
import numpy as np
import pytest
from engine.geometry import hull,analyze,intrinsic_measures,GeometryError
from engine.generators import regular
from engine.measurements import entity_measure,entity_info,dihedrals,align_section
from engine.operations import section,transform
from engine.formats import save_project,load_file


def ref(kind,index):return {'kind':kind,'index':index}
def flat(kind,ids):return {'kind':kind,'vertices':ids}


@pytest.mark.parametrize('dimension',[3,4])
def test_affine_distances_point_line_plane_hyperplane_and_witnesses(dimension):
    p=[[-2,0,0],[2,0,0],[0,1,0],[0,1,2],[0,0,1],[1,0,1],[0,1,1],[0,0,3]]
    if dimension==4:p=[v+[0] for v in p]+[[0,0,0,2],[1,0,0,2],[0,1,0,2]]
    # Generalized empty-boundary point container supports custom flat tests.
    model={'dimension':dimension,'embeddingDimension':dimension,'vertices':p,'edges':[],'faces':[],'cells':[],'interpretation':'generalized-complex'}
    fixtures=[([ref('vertex',7),flat('line',[0,1])],3),([flat('line',[0,1]),flat('line',[2,3])],1),
              ([flat('plane',[4,5,6]),ref('vertex',7)],2)]
    if dimension==4:fixtures.append(([flat('plane',[4,5,6]),flat('plane',[8,9,10])],math.sqrt(5)))
    for entities,expected in fixtures:
        result=entity_measure(model,entities=entities);assert result['value']==pytest.approx(expected)
        a,b=np.asarray(result['witnessPoints']);assert np.linalg.norm(a-b)==pytest.approx(expected)
        reverse=entity_measure(model,entities=entities[::-1]);assert reverse['value']==pytest.approx(expected)


def test_bounded_edge_distances_use_segments_and_exact_endpoints():
    cube=regular('cube');before=deepcopy(cube)
    edge=next(i for i,e in enumerate(cube['edges']) if e==[0,1])
    for vertex,expected in [(0,0),(1,0),(2,2),(7,math.sqrt(8))]:
        result=entity_measure(cube,entities=[ref('vertex',vertex),ref('edge',edge)],bounded=True)
        assert result['value']==pytest.approx(expected,abs=1e-12)
    # A point projects outside a short segment, distinguishing its infinite line.
    model={'dimension':3,'embeddingDimension':3,'vertices':[[0,0,0],[1,0,0],[3,1,0]],'edges':[[0,1]],'faces':[],'cells':[],'interpretation':'generalized-complex'}
    entities=[ref('vertex',2),ref('edge',0)]
    assert entity_measure(model,entities=entities)['value']==pytest.approx(1)
    result=entity_measure(model,entities=entities,bounded=True);assert result['value']==pytest.approx(math.sqrt(5));assert result['witnessPoints'][1]==[1,0,0]
    assert cube==before


def test_bounded_parallel_crossing_skew_and_reversed_edges():
    fixtures=[([[0,0,0],[1,0,0],[2,1,0],[3,1,0]],math.sqrt(2)),
              ([[-1,0,0],[1,0,0],[0,-1,0],[0,1,0]],0),
              ([[-1,0,0],[1,0,0],[0,-1,2],[0,1,2]],2)]
    for points,expected in fixtures:
        for edges in ([[0,1],[2,3]],[[1,0],[3,2]]):
            model={'dimension':3,'embeddingDimension':3,'vertices':points,'edges':edges,'faces':[],'cells':[],'interpretation':'generalized-complex'}
            result=entity_measure(model,entities=[ref('edge',0),ref('edge',1)],bounded=True)
            assert result['value']==pytest.approx(expected,abs=1e-12)


def test_principal_angles_distinguish_4d_plane_angles_and_line_plane_incidence():
    a,b=math.radians(25),math.radians(60)
    points=[[0,0,0,0],[1,0,0,0],[0,1,0,0],[math.cos(a),0,math.sin(a),0],[0,math.cos(b),0,math.sin(b)],[0,0,1,0]]
    model={'dimension':4,'embeddingDimension':4,'vertices':points,'edges':[],'faces':[],'cells':[],'interpretation':'generalized-complex'}
    result=entity_measure(model,'flat-angle',[flat('plane',[0,1,2]),flat('plane',[0,3,4])]);assert result['value'] is None and result['angles']==pytest.approx([25,60])
    assert entity_measure(model,'flat-angle',[flat('line',[0,1]),flat('plane',[0,1,2])])['value']==pytest.approx(0)
    assert entity_measure(model,'flat-angle',[flat('line',[0,5]),flat('plane',[0,1,2])])['value']==pytest.approx(90)


@pytest.mark.parametrize('key,expected',[('tetrahedron',math.degrees(math.acos(1/3))),('cube',90),('simplex4',math.degrees(math.acos(1/4))),('tesseract',90),('cross4',120),('cell24',120)])
def test_convex_interior_dihedrals_analytic_fixtures(key,expected):
    model=regular(key);before=deepcopy(model);result=dihedrals(model)
    assert result['min']==pytest.approx(expected) and result['max']==pytest.approx(expected)
    assert len(result['records'])==len(model['edges'] if model['dimension']==3 else model['faces'])
    assert dihedrals(model,ridge=0)['value']==pytest.approx(expected)
    assert analyze(model)['dihedral']['mean']==pytest.approx(expected)
    assert model==before


@pytest.mark.parametrize('key,kind,count',[('cube','face',4),('tesseract','cell',8),('simplex4','cell',4)])
def test_entity_aligned_sections_hit_complete_facet_and_relative_offset(key,kind,count):
    model=regular(key);before=deepcopy(model);aligned=align_section(model,ref(kind,0));n=np.asarray(aligned['normal'])
    assert np.linalg.norm(n)==pytest.approx(1)
    ids=model['faces'][0] if kind=='face' else sorted({v for f in model['cells'][0] for v in model['faces'][f]})
    assert np.asarray(model['vertices'])[ids]@n==pytest.approx(np.full(len(ids),aligned['offset']))
    assert len(section(model,n,aligned['offset'])['model']['vertices'])==count
    moved=align_section(model,ref(kind,0),offset=.2);assert moved['offset']==pytest.approx(aligned['offset']+.2)
    assert section(model,moved['normal'],moved['offset'])['status']=='empty'
    assert model==before


def test_measurements_and_section_alignment_are_covariant_under_scale_rotation_translation():
    model=regular('tesseract');q,_=np.linalg.qr(np.random.default_rng(10).normal(size=(4,4)))
    original=entity_measure(model,entities=[ref('vertex',0),ref('cell',7)])
    for s in (1e-9,1e9):
        changed=transform(model,matrix=q,scale=s,translation=np.array([3,-4,2,5])*s)
        measured=entity_measure(changed,entities=[ref('vertex',0),ref('cell',7)])
        assert measured['value']==pytest.approx(original['value']*s,abs=s*1e-7)
        assert dihedrals(changed)['min']==pytest.approx(90)
        aligned=align_section(changed,ref('cell',0));assert len(section(changed,aligned['normal'],aligned['offset'])['model']['vertices'])==8


def test_degeneracy_domain_and_multidirection_alignment_diagnostics():
    cube=regular('cube')
    for entities in ([flat('line',[0,0]),ref('vertex',0)],[flat('plane',[0,1,4,7]),ref('vertex',0)],[ref('cell',0),ref('vertex',0)]):
        with pytest.raises(GeometryError):entity_measure(cube,entities=entities)
    with pytest.raises(GeometryError):entity_measure(cube,'flat-angle',[ref('vertex',0),ref('edge',0)])
    assert entity_measure(cube,entities=[ref('face',0),ref('vertex',cube['faces'][0][0])],bounded=True)['value']==pytest.approx(0,abs=1e-8)
    with pytest.raises(GeometryError):entity_measure(cube,entities=[flat('plane',cube['faces'][0]),ref('vertex',0)],bounded=True)
    with pytest.raises(GeometryError):dihedrals(regular('great-dodecahedron'))
    with pytest.raises(GeometryError):dihedrals(cube,ridge=True)
    tesseract=regular('tesseract');plane=flat('plane',[0,1,2]);aligned=align_section(tesseract,plane,direction=[1,0,0,0]);assert aligned['normal']==pytest.approx([1,0,0,0])
    with pytest.raises(GeometryError):align_section(tesseract,plane,direction=[0,0,0,1])
    with pytest.raises(GeometryError):align_section(cube,flat('line',[0,7]))


def test_analysis_and_native_roundtrip_ignore_forged_measure_cache(tmp_path):
    cube=regular('cube');cube['measure']={'content':999,'boundaryMeasure':-2};before=deepcopy(cube)
    result=analyze(cube);assert result['measure']['content']==pytest.approx(8);assert result['measure']['boundaryMeasure']==pytest.approx(24);assert cube==before
    star=regular('small-stellated-dodecahedron');star['measure']={'content':999}
    assert analyze(star)['measure'] is None
    project={'format':'polytope-laboratory','version':1,'active':0,'documents':[{'cursor':0,'states':[{'model':cube},{'model':star}]}]}
    path=tmp_path/'measured.polyproj';save_project(path,project);states=load_file(path)['project']['documents'][0]['states']
    assert states[0]['model']['measure']['content']==pytest.approx(8) and 'measure' not in states[1]['model']


def test_entity_content_circumradius_and_noncospherical_diagnostics():
    t=regular('tesseract');cell=entity_info(t,ref('cell',0));face=entity_info(t,ref('face',0));edge=entity_info(t,ref('edge',0))
    assert cell['content']==pytest.approx(8) and cell['circumradius']==pytest.approx(math.sqrt(3))
    assert face['content']==pytest.approx(4) and face['circumradius']==pytest.approx(math.sqrt(2))
    assert edge['content']==pytest.approx(2) and edge['circumradius']==pytest.approx(1)
    source={'dimension':3,'embeddingDimension':3,'vertices':[[0,0,0],[3,0,0],[2,3,0],[0,1,0]],'edges':[[0,1],[1,2],[2,3],[0,3]],'faces':[[0,1,2,3]],'cells':[],'interpretation':'generalized-complex'}
    result=entity_info(source,ref('face',0));assert result['circumradius'] is None and result['circumcenter'] is None
    star=entity_info(regular('small-stellated-dodecahedron'),ref('face',0));assert star['circumradius']>0 and 'algebraic' in star['contentDefinition']
    generalized=deepcopy(t);generalized['interpretation']='generalized-complex';assert entity_info(generalized,ref('cell',0))['content'] is None


def test_two_dimensional_face_area_and_supporting_plane_distance():
    source=hull([[-1,-1],[1,-1],[1,1],[-1,1]])
    info=entity_info(source,ref('face',0));assert info['content']==pytest.approx(4) and info['circumradius']==pytest.approx(math.sqrt(2))
    assert entity_measure(source,entities=[ref('vertex',0),ref('face',0)])['value']==pytest.approx(0)


def test_piece_and_planar_union_measures_recompute_without_cached_scalars():
    from engine.stellation import arrangement,region_union
    a=arrangement(regular('octahedron'));source=region_union(a,[r['id'] for r in a['regions'] if r['boundedness']=='bounded-numerical'])
    source['measure']['content']=999
    for piece in source['convexPieces']:piece['measure']['content']=999
    assert analyze(source)['measure']['content']==pytest.approx(4)
    sliced=section(source,offset=.5)['model'];sliced['measure']['content']=999
    assert analyze(sliced)['measure']['content']==pytest.approx(2.5)


def test_convex_measure_reconstruction_requires_complete_source_boundary():
    source=regular('cube');source['faces'][0]=list(source['faces'][1]);source.pop('facetEquations')
    with pytest.raises(GeometryError,match='incidence differs'):intrinsic_measures(source)
