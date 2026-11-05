from copy import deepcopy
import json
import math
import numpy as np
import pytest
from engine.generators import regular
from engine.cupola import cupola
from engine.geometry import GeometryError, hull
from engine.information_panel import information_panel, surface_topology, polygon_measure
from engine.operations import transform
from engine.server import dispatch
from engine.formats import validate_project, parse_off
from pathlib import Path


def test_cube_radii_angles_adjacency_area_volume_and_genus():
    source=regular('cube');before=deepcopy(source);r=dispatch({'op':'information-panel','model':source})
    for name,expected in [('circumradius',math.sqrt(3)),('midradius',math.sqrt(2)),('inradius',1)]:
        assert r['radii'][name]['value']==pytest.approx(expected)
        assert r['radii'][name]['residual']<r['radii']['tolerance']
    edge=r['rows']['edge'][0];assert edge['count']==12 and edge['length']==pytest.approx(2)
    assert edge['dihedrals']==[dict(adjacentTypes=[0,0],adjacentKind='face',min=90,max=90)]
    face=r['rows']['face'][0];assert face['interiorAngles']==pytest.approx([90]*4)
    assert face['sideLengths']==pytest.approx([2]*4) and face['area']==pytest.approx(4)
    assert face['count']==6 and face['shape']=='square'
    assert r['measure']['content']==pytest.approx(8) and r['measure']['boundaryMeasure']==pytest.approx(24)
    assert r['topology']['euler']==2 and r['topology']['genus']==0 and r['topology']['orientableClosed']
    assert source==before


@pytest.mark.parametrize('key,face_count,angle,dihedral',[
    ('icosahedron',20,60,math.degrees(math.acos(-math.sqrt(5)/3))),
    ('cuboctahedron',None,None,math.degrees(math.acos(-math.sqrt(3)/3)))])
def test_icosahedron_and_two_face_cuboctahedron(key,face_count,angle,dihedral):
    r=information_panel(regular(key));assert r['typesAvailable']
    assert all(a['min']==pytest.approx(dihedral) and a['max']==pytest.approx(dihedral) for t in r['rows']['edge'] for a in t['dihedrals'])
    if face_count:
        face=r['rows']['face'][0];assert face['count']==face_count and face['interiorAngles']==pytest.approx([angle]*3)
        assert all(r['radii'][k]['value'] is not None for k in ('circumradius','midradius','inradius'))
    else:
        assert sorted(t['count'] for t in r['rows']['face'])==[6,8]
        assert sorted(len(t['sideLengths']) for t in r['rows']['face'])==[3,4]
        assert r['rows']['edge'][0]['dihedrals'][0]['adjacentTypes']==[0,1]
        assert r['radii']['inradius']['value'] is None


@pytest.mark.parametrize('key,cells,name,angle',[('tesseract',8,'cube',90),('cell600',600,'tetrahedron',math.degrees(math.acos(-(1+3*math.sqrt(5))/8)))])
def test_four_dimensional_cells_ridge_angles_and_content(key,cells,name,angle):
    r=information_panel(regular(key));assert r['typesAvailable']
    cell=r['rows']['cell'][0];assert cell['count']==cells and cell['shape']==name
    assert cell['volume']>0 and cell['surfaceArea']>0 and r['measure']['content']>0
    assert r['rows']['face'][0]['dihedrals'][0]['min']==pytest.approx(angle)
    assert r['rows']['face'][0]['dihedrals'][0]['adjacentKind']=='cell'
    assert r['rows']['face'][0]['dihedrals'][0]['adjacentTypes']==[0,0]
    assert r['topology']['euler']==0 and r['topology']['genus'] is None
    if key=='tesseract':
        assert cell['volume']==pytest.approx(8) and cell['surfaceArea']==pytest.approx(24)
        assert r['measure']['content']==pytest.approx(16)
        assert r['radii']['circumradius']['value']==pytest.approx(2)
    else:assert r['radii']['circumradius']['value']==pytest.approx(1)


def test_johnson_triangular_cupola_has_no_insphere_and_noncospherical_hull():
    r=information_panel(cupola(3))
    assert r['radii']['inradius']['value'] is None
    assert r['radii']['inradius']['residual']>r['radii']['tolerance']
    source=regular('cube');source['vertices'][0][0]-=.2;r=information_panel(hull(source['vertices']))
    assert r['radii']['circumradius']['value'] is None and r['radii']['midradius']['value'] is None


@pytest.mark.parametrize('key,density',[('great-stellated-dodecahedron',7),('small-stellated-dodecahedron',3)])
def test_star_density_uses_existing_source_winding(key,density):
    r=information_panel(regular(key));assert r['density']['value']==density
    assert r['density']['windingApproximate']==pytest.approx(density)
    assert r['algebraicMeasures'] and r['measure'] is None
    assert r['radii']['inradius']['value'] is None
    assert r['rows']['edge'][0]['dihedrals']==[]
    assert 'pentagram' in r['rows']['face'][0]['shape']
    assert r['rows']['face'][0]['interiorAngles']==pytest.approx([36]*5)


def test_radius_translation_scale_and_rotation_covariance_and_cache_detachment():
    source=regular('cube');q,_=np.linalg.qr(np.random.default_rng(4).normal(size=(3,3)))
    for scale in (1e-9,1e9):
        r=information_panel(transform(source,matrix=q,scale=scale,translation=np.array([4,8,-3])*scale))
        assert r['radii']['circumradius']['value']==pytest.approx(math.sqrt(3)*scale)
        assert r['radii']['inradius']['value']==pytest.approx(scale)
    r=information_panel(source);r['rows']['face'].clear();assert information_panel(source)['rows']['face']


def test_genus_refuses_open_and_pinched_surfaces_and_handles_concave_angles():
    source=regular('cube');source['faces'].pop();assert surface_topology(source)['genus'] is None
    p=[[0,0,0],[2,0,0],[1,1,0],[2,2,0],[0,2,0]]
    angles=polygon_measure(p)['interiorAngles'];assert max(angles)==pytest.approx(270) and sum(angles)==pytest.approx(540)
    assert polygon_measure([[0,0,0],[1,1,0],[0,1,0],[1,0,0]])['interiorAngles']==[None]*4
    source=regular('cube');other=regular('cube');offset=len(source['vertices'])-1
    source['vertices']+=other['vertices'][1:]
    source['edges'] += [[0 if v==0 else v+offset for v in e] for e in other['edges']]
    source['faces'] += [[0 if v==0 else v+offset for v in f] for f in other['faces']]
    assert surface_topology(source)['genus'] is None


def test_generalized_4d_density_and_unsupported_dimension_are_explicit():
    source=regular('tesseract');source['interpretation']='generalized-complex';r=information_panel(source)
    assert r['density']['value']==1 and 'two independent' in r['density']['status']
    assert r['algebraicMeasures']['orientedAlgebraicContent4D']==pytest.approx(16)
    assert r['rows']['cell'][0]['algebraicVolume']==pytest.approx(8)
    source['cells']=[];r=information_panel(source)
    assert r['density']['value'] is None and 'explicit closed cells' in r['density']['status']
    with pytest.raises(GeometryError,match='3D or 4D'):information_panel(hull([[0,0],[1,0],[0,1]]))


def test_star_polychoron_density_reports_existing_two_ray_classifier_evidence():
    path=Path(__file__).resolve().parents[1]/'engine/catalog_data/miratope/raw/Grand hexacosichoron.off'
    r=information_panel(parse_off(path.read_text(),'Grand hexacosichoron'))
    assert r['density']['value']==191 and r['density']['signed']==191
    assert r['density']['maxIntegerResidual']<1e-6
    assert r['algebraicMeasures']['orientedAlgebraicContent4D']>0
    assert r['rows']['cell'][0]['shape']=='tetrahedron' and r['rows']['cell'][0]['volume']>0


def test_stereo_view_native_round_trip_and_range_validation():
    project=dict(format='polytope-laboratory',version=1,active=0,documents=[dict(cursor=0,states=[dict(model=regular('tesseract'),view=dict(stereoMode='cross-eyed',stereoEyeSeparation=.1,stereoConvergence=4))])])
    assert validate_project(json.loads(json.dumps(project)))['documents'][0]['states'][0]['view']==project['documents'][0]['states'][0]['view']
    for field,values in [('stereoEyeSeparation',[-1,1.1,True,float('nan')]),('stereoConvergence',[0,1001,True,float('inf')])]:
        for value in values:
            bad=deepcopy(project);bad['documents'][0]['states'][0]['view'][field]=value
            with pytest.raises(GeometryError):validate_project(bad)
