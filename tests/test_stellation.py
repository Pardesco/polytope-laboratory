from itertools import product
import json
import numpy as np
import pytest
from engine.generators import regular
from engine.stellation import arrangement,region_union,arrangement_diagram,boundedness,enumerate_unions
from engine.geometry import GeometryError,analyze,validate
from engine.formats import save_project,load_file
from engine.operations import section,transform

@pytest.mark.parametrize('key,count,bounded',[('tetrahedron',15,1),('cube',27,1),('octahedron',59,9)])
def test_independent_plane_arrangement_counts_and_volume(key,count,bounded):
    result=arrangement(regular(key))
    assert len(result['regions'])==count
    assert sum(r['boundedness']=='bounded-numerical' for r in result['regions'])==bounded
    assert sum(not r['touchesObservationBox'] for r in result['regions'])==bounded
    assert result['completeWithinDeclaredDomain'] and not result['unrestrictedEnumerationComplete']
    assert result['validation']['partitionVolume']==pytest.approx(result['validation']['boxVolume'])
    assert all(validate(r['model'])['passed'] for r in result['regions'])

def test_octahedron_all_bounded_regions_form_stella_octangula_solid():
    source=regular('octahedron');a=arrangement(source)
    ids=[r['id'] for r in a['regions'] if r['boundedness']=='bounded-numerical']
    result=region_union(a,ids,source=source)
    assert result['measure']['content']==pytest.approx(4)
    assert [len(result[k]) for k in ('vertices','edges','faces')]==[14,36,24]
    p=np.asarray(result['vertices'])
    signed_volume=sum(np.linalg.det(p[[f[0],f[i],f[i+1]]])/6 for f in result['faces'] for i in range(1,len(f)-1))
    assert signed_volume==pytest.approx(4)
    assert result['metadata']['fillSemantics']=='ordinary-convex-faces'

def test_seed_region_is_recovered_and_source_does_not_mutate():
    seed=regular('cube');original=json.dumps(seed,sort_keys=True);a=arrangement(seed)
    ids=[r['id'] for r in a['regions'] if r['exteriorPlaneCount']==0]
    result=region_union(a,ids,source=seed)
    assert analyze(result)['measure']['content']==pytest.approx(8)
    assert len(result['faces'])==6
    assert json.dumps(seed,sort_keys=True)==original
    with pytest.raises(GeometryError):region_union(a,[0])
    clipped=region_union(a,[0],allow_clipped=True)
    assert clipped['metadata']['artificialClipping']

def test_arbitrary_planes_parallel_degeneracy_and_limits():
    a=arrangement(planes=[[1,0,0,0],[0,1,0,0],[0,0,1,0]],bounds=[[-1,-1,-1],[1,1,1]])
    assert len(a['regions'])==8 and sum(r['volume'] for r in a['regions'])==pytest.approx(8)
    assert all(r['boundedness']=='unbounded-numerical' for r in a['regions'])
    b=arrangement(planes=[[1,0,0,0],[1,0,0,0],[1,0,0,-0.5]],bounds=[[-1,-1,-1],[1,1,1]])
    assert len(b['regions'])==3
    with pytest.raises(GeometryError):arrangement(regular('cube'),max_regions=5)
    with pytest.raises(GeometryError):arrangement(regular('tesseract'))
    with pytest.raises(GeometryError):arrangement(planes=[[0,0,0,1]])

def test_diagram_regions_have_two_incident_cells_and_lie_on_plane():
    a=arrangement(regular('octahedron'));d=arrangement_diagram(a,3)
    assert d['polygons']
    for polygon in d['polygons']:
        assert len(polygon['regionIds'])==2
        assert a['regions'][polygon['regionIds'][0]]['signs'][3]!=a['regions'][polygon['regionIds'][1]]['signs'][3]
        p=np.asarray(polygon['points'])@np.asarray(d['basis']).T+d['origin']
        assert max(abs(p@d['normal']+a['planes'][3][-1]))<1e-8

def test_region_selection_persists_with_piece_semantics(tmp_path):
    seed=regular('octahedron');a=arrangement(seed)
    result=region_union(a,[r['id'] for r in a['regions'] if r['boundedness']=='bounded-numerical'])
    project={'format':'polytope-laboratory','version':1,'active':0,'documents':[{'cursor':0,'states':[{'model':result,'arrangement':a}]}]}
    path=tmp_path/'stellation.polyproj';save_project(path,project)
    saved=load_file(path)['project']['documents'][0]['states'][0]
    assert saved['model']['convexPieces']==result['convexPieces'] and saved['arrangement']['planes']==a['planes']

def test_nonconvex_sections_and_tangent_interfaces():
    source=regular('octahedron');a=arrangement(source);ids=[r['id'] for r in a['regions'] if r['boundedness']=='bounded-numerical']
    m=region_union(a,ids)
    for z,area in [(0,2),(0.25,2.625),(0.5,2.5),(0.75,1.625),(1,0)]:
        s=section(m,offset=z)
        if z==1:
            assert s['status']=='degenerate' and s['maximumStratumDimension']==1
        else:
            assert s['status']=='full-dimensional'
            assert s['model']['interpretation']=='planar-region-union'
            assert s['model']['measure']['content']==pytest.approx(area)
    assert section(m,offset=1.1)['status']=='empty'
    split_ids=[r['id'] for r in a['regions'] if r['boundedness']=='bounded-numerical' and r['centroid'][2]>0.1 and r['centroid'][0]*r['centroid'][1]>0.1]
    split=region_union(a,split_ids)
    sliced=section(split,offset=0.5)['model']
    assert len(sliced['faces'])==2
    assert set(sliced['faces'][0]).isdisjoint(sliced['faces'][1])

def test_union_affine_transform_preserves_piece_and_measure_semantics():
    a=arrangement(regular('octahedron'));m=region_union(a,[r['id'] for r in a['regions'] if r['boundedness']=='bounded-numerical'])
    t=transform(m,scale=2,translation=[3,4,5])
    assert t['measure']['content']==pytest.approx(32)
    assert section(t,offset=5)['model']['measure']['content']==pytest.approx(8)
    assert validate(t)['passed']

def test_finite_criteria_enumeration_is_independently_exhaustive():
    seed=regular('octahedron');a=arrangement(seed)
    symmetric=enumerate_unions(a,seed)
    assert symmetric['group']['actingOrder']==48 and symmetric['group']['fullSourceGroupVerified']
    assert sorted(map(len,symmetric['orbits']))==[1,8]
    assert len(symmetric['candidates'])==2
    assert symmetric['completeWithinDeclaredCriteria'] and symmetric['subsetsEvaluated']==4
    assert not symmetric['unrestrictedStellationEnumerationComplete']
    unrestricted=enumerate_unions(a,seed,symmetry='none')
    assert len(unrestricted['candidates'])==256 and unrestricted['subsetsEvaluated']==512
    connected=enumerate_unions(a,seed,symmetry='none',include_seed=False)
    assert len(connected['candidates'])==264
    limited=enumerate_unions(a,seed,symmetry='none',max_results=2)
    assert limited['termination']=='result-limit' and not limited['completeWithinDeclaredCriteria']

def test_arrangement_scale_covariance_and_source_face_identity():
    source=regular('cube')
    for scale in (1e-9,1e9):
        a=arrangement(transform(source,scale=scale))
        assert len(a['regions'])==27
        assert sum(r['boundedness']=='bounded-numerical' for r in a['regions'])==1
    from engine.formats import parse_off,export_off
    source['faces']=list(reversed(source['faces']))
    imported=parse_off(export_off(source))
    a=arrangement(imported,plane_ids=[0])
    assert len(a['regions'])==2
    face=np.asarray(imported['vertices'])[imported['faces'][0]]
    assert max(abs(face@np.asarray(a['planes'])[0,:3]+a['planes'][0][3]))<1e-8

def test_reflection_retains_outward_union_orientation():
    a=arrangement(regular('octahedron'));m=region_union(a,[r['id'] for r in a['regions'] if r['boundedness']=='bounded-numerical'])
    reflected=transform(m,matrix=[[-1,0,0],[0,1,0],[0,0,1]])
    p=np.asarray(reflected['vertices'])
    signed_volume=sum(np.linalg.det(p[[f[0],f[i],f[i+1]]])/6 for f in reflected['faces'] for i in range(1,len(f)-1))
    assert signed_volume==pytest.approx(4)


def test_icosahedral_arrangement_and_full_group_search():
    m=regular('icosahedron');a=arrangement(m);r=enumerate_unions(a,m)
    assert len(a['planes'])==20 and len(a['regions'])==703
    assert len(r['domain']['regionIds'])==341
    assert r['group']['actingOrder']==120 and r['group']['fullSourceGroupVerified']
    assert sorted(map(len,r['orbits']))==[1,20,20,30,30,60,60,120]
    assert len(r['candidates'])==13 and r['totalOrbitSubsets']==256 and r['completeWithinDeclaredCriteria']
    # Region search does not claim the classic 59-stellation criterion set.
    assert not r['unrestrictedStellationEnumerationComplete']


def test_observation_clipping_restricts_the_acting_group_explicitly():
    source=regular('dodecahedron')
    small=arrangement(source,box_scale=3);partial=enumerate_unions(small,source)
    assert partial['group']['sourceOrder']==120 and partial['group']['actingOrder']==24
    assert not partial['group']['fullSourceGroupVerified']
    large=arrangement(source,box_scale=5);complete=enumerate_unions(large,source)
    assert len(complete['domain']['regionIds'])==63 and sorted(map(len,complete['orbits']))==[1,12,20,30]
    assert complete['group']['fullSourceGroupVerified'] and complete['group']['actingOrder']==120
    assert complete['completeWithinDeclaredCriteria'] and len(complete['candidates'])==4


def test_selected_verified_subgroups_act_on_region_search_without_full_group_claims():
    from engine.symmetry import geometric_symmetry
    source=regular('octahedron');a=arrangement(source);full=geometric_symmetry(source)
    reflection=next(i for i,g in enumerate(full['actions']) if np.max(abs(np.asarray(g['matrix'])-np.diag([-1,1,1])))<1e-8)
    selected=enumerate_unions(a,source,symmetry_options={'generator_ids':[reflection]})
    assert selected['group']['actingOrder']==selected['group']['sourceOrder']==2
    assert selected['group']['unrestrictedSourceOrder']==48 and selected['group']['selectedSourceGroupComplete']
    assert not selected['group']['fullSourceGroupVerified'] and selected['group']['preservesAllSourceActions']
    assert sorted(map(len,selected['orbits']))==[1,2,2,2,2]
    assert selected['totalOrbitSubsets']==32 and len(selected['candidates'])==16
    assert selected['criteria']['symmetryOptions']=={'generator_ids':[reflection]}
    proper=enumerate_unions(a,source,symmetry_options={'orientation':'proper'})
    assert proper['group']['actingOrder']==24 and not proper['group']['fullSourceGroupVerified']
    assert len(proper['candidates'])==2 and proper['completeWithinDeclaredCriteria']
    with pytest.raises(GeometryError):enumerate_unions(a,source,symmetry='none',symmetry_options={'orientation':'proper'})
