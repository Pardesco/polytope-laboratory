"""Independent radical coordinates, periodic links, metrics and native persistence."""
from collections import Counter
from copy import deepcopy
import json
import math

import numpy as np
import pytest

import engine.torus as kernel
from engine.formats import export_off, parse_off, validate_project, save_project, load_file
from engine.geometry import GeometryError, identity, intrinsic_measures, validate
from engine.history import canonical_model
from engine.torus import polyhedral_torus


KINDS = ('vertices','edges','faces','cells')


def counts(model):
    return tuple(len(model[kind]) for kind in KINDS)


def evidence(model):
    return model['metadata']['polyhedralTorus']


def test_literal_four_by_four_radical_coordinates_and_complete_boundaries():
    # Cardinal vectors and a diamond meridian, independent of angular sampling.
    xy = [(1,0),(0,1),(-1,0),(0,-1)]
    meridian = [(1.5,0),(1,.5),(.5,0),(1,-.5)]
    expected = [[r*x,r*y,z] for x,y in xy for r,z in meridian]
    result = polyhedral_torus(4,4)
    assert np.allclose(result['vertices'],expected,rtol=0,atol=3e-16)
    assert result['edges'] == [[0,4],[1,5],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],
                               [8,12],[9,13],[10,14],[11,15],[12,0],[13,1],[14,2],[15,3],
                               [0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],
                               [8,9],[9,10],[10,11],[11,8],[12,13],[13,14],[14,15],[15,12]]
    assert result['faces'] == [[0,4,5,1],[1,5,6,2],[2,6,7,3],[3,7,4,0],
                               [4,8,9,5],[5,9,10,6],[6,10,11,7],[7,11,8,4],
                               [8,12,13,9],[9,13,14,10],[10,14,15,11],[11,15,12,8],
                               [12,0,1,13],[13,1,2,14],[14,2,3,15],[15,3,0,12]]
    assert counts(result) == (16,32,16,0)
    assert result['cells'] == [] and result['fingerprint'] == identity(result)
    assert result['metadata']['family']=='Torus' and result['metadata']['topologicalGenus']==1


@pytest.mark.parametrize('n,m', [(3,3),(3,4),(4,3),(5,7),(10,8),(19,11),(3,1333),(50,80)])
def test_periodic_surface_counts_orientation_links_and_source_maps(n,m):
    result = polyhedral_torus(n,m)
    assert counts(result) == (n*m,2*n*m,n*m,0)
    boundary = Counter(tuple(sorted((a,b))) for face in result['faces'] for a,b in zip(face,face[1:]+face[:1]))
    assert boundary == Counter({tuple(sorted(edge)):2 for edge in result['edges']})
    assert set(Counter(v for edge in result['edges'] for v in edge).values()) == {4}
    directions = Counter((a,b) for face in result['faces'] for a,b in zip(face,face[1:]+face[:1]))
    assert all(directions[(a,b)] == directions[(b,a)] == 1 for a,b in result['edges'])
    for vertex in (0,m-1,n*m-1,n*m//2):
        incident = [face for face in result['faces'] if vertex in face]
        link = Counter()
        for face in incident:
            j = face.index(vertex)
            link[tuple(sorted((face[j-1],face[(j+1)%4])))] += 1
        assert len(incident) == len(link) == 4
        assert set(Counter(v for edge in link for v in edge).values()) == {2}
    assert result['validation']['passed'] and result['validation']['eulerCharacteristic'] == 0
    assert evidence(result)['topology'] == {'connectedComponents':1,'orientable':True,'genus':1,
        'eulerCharacteristic':0,'vertexLink':'simple four-edge cycle','edgeFaceDegree':2}
    maps = evidence(result)['maps']
    assert [len(maps[kind]) for kind in KINDS] == list(counts(result))
    assert maps['vertices'][0] == {'ringIndex':0,'armIndex':0}
    assert maps['vertices'][-1] == {'ringIndex':n-1,'armIndex':m-1}
    assert maps['faces'] == maps['vertices']
    for e, record in enumerate(maps['edges']):
        a,b = result['edges'][e]
        i,j = record['ringIndex'],record['armIndex']
        assert a == i*m+j
        if record['direction'] == 'ring':
            assert maps['vertices'][b] == {'ringIndex':(i+1)%n,'armIndex':j}
        else:
            assert maps['vertices'][b] == {'ringIndex':i,'armIndex':(j+1)%m}
    assert evidence(result)['sourceFingerprint'] == identity(result)
    assert evidence(result)['sourceModelId'] == result['id']


@pytest.mark.parametrize('n,m,ratio', [(3,3,.25),(4,4,.5),(5,7,.8),(10,8,.5),(17,19,.1)])
def test_independent_planarity_radii_edge_metrics_and_outward_normals(n,m,ratio):
    result = polyhedral_torus(n,m,ratio,ring_radius=3)
    p = np.asarray(result['vertices'])
    radial = np.hypot(p[:,0],p[:,1])
    assert np.allclose((radial-3)**2+p[:,2]**2,(3*ratio)**2,rtol=1e-13,atol=1e-13)
    for edge, record in zip(result['edges'],evidence(result)['maps']['edges']):
        a,b = edge
        expected = (2*radial[a]*math.sin(math.pi/n) if record['direction']=='ring'
                    else 6*ratio*math.sin(math.pi/m))
        assert math.dist(p[a],p[b]) == pytest.approx(expected,rel=1e-13)
    for face, record in zip(result['faces'],evidence(result)['maps']['faces']):
        q = p[face]
        normal = np.cross(q[1]-q[0],q[2]-q[0])
        assert abs(np.dot(normal,q[3]-q[0])) < 1e-11
        u,v = (record['ringIndex']+.5)*2*math.pi/n,(record['armIndex']+.5)*2*math.pi/m
        outward = [math.cos(u)*math.cos(v),math.sin(u)*math.cos(v),math.sin(v)]
        assert np.dot(normal,outward) > 0
    # Signed tetrahedral integration checks orientation; this value is not a
    # production solid claim. Independent meridian area × polygonal sweep.
    signed_volume = sum(np.dot(p[f[0]],np.cross(p[f[j]],p[f[j+1]]))/6
                        for f in result['faces'] for j in (1,2))
    meridian_area = m*(3*ratio)**2*math.sin(2*math.pi/m)/2
    expected_volume = n*math.sin(2*math.pi/n)*3*meridian_area
    assert signed_volume == pytest.approx(expected_volume,rel=1e-13)
    assert 'measure' not in result and intrinsic_measures(result) is None
    assert 'facetEquations' not in result and 'facetVertices' not in result
    assert result['interpretation']=='generalized-complex' and result['numeric']['certified'] is False


@pytest.mark.parametrize('scale', [1e-100,1e-20,.25,2,1e50,1e99])
def test_safe_scaling_keeps_literal_topology_and_native_project_roundtrip(scale):
    unit = polyhedral_torus(5,7,.3)
    result = polyhedral_torus(5,7,.3,scale)
    assert result['edges']==unit['edges'] and result['faces']==unit['faces']
    assert np.allclose(np.asarray(result['vertices'])/scale,unit['vertices'],rtol=1e-14,atol=1e-14)
    before=deepcopy(result)
    project={'format':'polytope-laboratory','version':1,'active':0,'documents':[{
        'id':'literal-torus','cursor':0,'states':[{'model':result,'view':{},'notes':'Genus one source'}]}]}
    restored=validate_project(json.loads(json.dumps(project,allow_nan=False)))['documents'][0]['states'][0]['model']
    assert canonical_model(restored)==canonical_model(before)
    assert restored['metadata']==before['metadata'] and result==before
    assert 'measure' not in restored


def test_colors_are_copied_per_face_and_native_save_reopen_preserves_all_evidence(tmp_path):
    rgba={'encoding':'unit','values':[.2,.4,.8,.25]}
    rgb={'encoding':'byte','values':[10,80,255]}
    colors=[rgba,rgb]+[None]*14
    original=deepcopy(colors)
    result=polyhedral_torus(4,4,face_colors=colors)
    before=deepcopy(result)
    project={'format':'polytope-laboratory','version':1,'active':0,'documents':[{
        'id':'colored-torus','cursor':0,'states':[{'model':result,'view':{},'notes':'retained α'}]}]}
    path=tmp_path/'torus-project.json'
    save_project(path,deepcopy(project))
    restored=load_file(path)['project']['documents'][0]['states'][0]['model']
    assert restored['metadata']==before['metadata']
    assert restored['provenance']==before['provenance']
    assert restored['fingerprint']==before['fingerprint']
    assert canonical_model(restored)==canonical_model(before) and result==before and colors==original
    result['metadata']['offColors']['faces'][0]['values'][0]=.9
    assert colors==original and result['provenance']['parameters']['face_colors']==original


def test_off_roundtrip_preserves_literal_genus_one_quads_and_rgba():
    colors=[{'encoding':'unit','values':[.1,.2,.3,.4]}]+[None]*79
    result=polyhedral_torus(face_colors=colors)
    restored=parse_off(export_off(result))
    assert counts(restored)==(80,160,80,0)
    assert restored['vertices']==result['vertices'] and restored['faces']==result['faces']
    assert {tuple(sorted(e)) for e in restored['edges']}=={tuple(sorted(e)) for e in result['edges']}
    assert restored['metadata']['offColors']==result['metadata']['offColors']
    assert restored['interpretation']=='generalized-complex' and validate(restored)['passed']


@pytest.mark.parametrize('value',[0,1,2,-1,4001,10**500,True,4.0,'4',None])
@pytest.mark.parametrize('field',['ring_segments','arm_segments'])
def test_strict_segment_count_domain(value,field):
    with pytest.raises(GeometryError,match='segment count'):
        polyhedral_torus(**{field:value})


@pytest.mark.parametrize('value',[0,-1,True,'1',None,math.nan,math.inf,-math.inf,1e101,10**500])
def test_radius_numeric_domain_is_structured(value):
    with pytest.raises(GeometryError,match='ring radius'):
        polyhedral_torus(ring_radius=value)


@pytest.mark.parametrize('value',[0,-1,True,'0.5',None,math.nan,math.inf,1,1.5,10**500])
def test_ratio_numeric_and_horn_spindle_domain(value):
    with pytest.raises(GeometryError,match='ratio'):
        polyhedral_torus(arm_ratio=value)


@pytest.mark.parametrize('ratio',[1e-10,1e-100,1-1e-10,math.nextafter(1,0)])
def test_unresolved_arm_or_hole_rejected_without_geometry_repair(ratio):
    with pytest.raises(GeometryError,match='unresolved'):
        polyhedral_torus(arm_ratio=ratio)


def test_count_budget_rejected_before_coordinate_allocation(monkeypatch):
    def forbidden(*args,**kwargs):
        raise AssertionError('No coordinate allocation before checking budgets.')
    monkeypatch.setattr(kernel.np,'asarray',forbidden)
    with pytest.raises(GeometryError,match='resource'):
        polyhedral_torus(100,100)


def test_output_coordinate_underflow_overflow_and_payload_bounds(monkeypatch):
    with pytest.raises(GeometryError,match='output coordinates'):
        polyhedral_torus(ring_radius=1e100)
    with pytest.raises(GeometryError,match='unresolved|native numeric'):
        polyhedral_torus(ring_radius=5e-324)
    monkeypatch.setattr(kernel,'MAX_PAYLOAD_BYTES',1000)
    with pytest.raises(GeometryError,match='resource'):
        polyhedral_torus()


@pytest.mark.parametrize('colors',[[None]*15,True,{'faces':[]},
    [{'encoding':'unit','values':[0,0,0,2]}]+[None]*15,
    [{'encoding':'byte','values':[0,.5,255]}]+[None]*15,
    [{'encoding':'unit','values':[0,True,1]}]+[None]*15,
    [{'encoding':'unit','values':[0,math.inf,1]}]+[None]*15,
    [{'encoding':'unit','values':[0,10**500,1]}]+[None]*15])
def test_malformed_colors_atomic_refusal(colors):
    before=deepcopy(colors)
    with pytest.raises(GeometryError):
        polyhedral_torus(4,4,face_colors=colors)
    assert colors==before


def test_no_hull_called_even_during_native_roundtrip(monkeypatch):
    def forbidden(*args,**kwargs):
        raise AssertionError('A ring torus must not be replaced by its convex hull.')
    monkeypatch.setattr('engine.geometry.hull',forbidden)
    monkeypatch.setattr('engine.geometry.ConvexHull',forbidden)
    monkeypatch.setattr('scipy.spatial.ConvexHull',forbidden)
    result=polyhedral_torus()
    project={'format':'polytope-laboratory','version':1,'active':0,'documents':[{
        'id':'no-hull','cursor':0,'states':[{'model':result,'view':{}}]}]}
    assert validate_project(project)['documents'][0]['states'][0]['model']['faces']==result['faces']


def test_distinct_calls_do_not_share_mutable_attributes_and_binding_tracks_geometry_only():
    first=polyhedral_torus(4,4)
    second=polyhedral_torus(4,4)
    assert first['id']!=second['id'] and first['fingerprint']==second['fingerprint']
    first['metadata']['polyhedralTorus']['maps']['vertices'][0]['ringIndex']=99
    assert evidence(second)['maps']['vertices'][0]['ringIndex']==0
    second['vertices'][0][0]+=0.01
    assert identity(second)!=evidence(second)['sourceFingerprint']


def test_explicit_runtime_topology_gate_rejects_nonmanifold_and_misoriented_cycles():
    result=polyhedral_torus(4,4)
    missing=deepcopy(result['faces']);missing.pop()
    with pytest.raises(GeometryError,match='two face'):
        kernel._topology(result['vertices'],result['edges'],missing)
    reversed_face=deepcopy(result['faces']);reversed_face[0].reverse()
    with pytest.raises(GeometryError,match='orientation'):
        kernel._topology(result['vertices'],result['edges'],reversed_face)
