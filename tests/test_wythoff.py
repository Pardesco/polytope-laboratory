from collections import Counter
import math
import numpy as np
import pytest
from scipy.spatial import cKDTree
from engine.wythoff import wythoff,reflection_orbit,FAMILIES,_OrbitIndex,_verify_orbit_closure
from engine.faceting import facet
from engine.generators import regular,generate
from engine.geometry import GeometryError,analyze
from engine.operations import dual

@pytest.mark.parametrize('family,rings,counts',[
    ('A3',[1,0,0],[4,6,4,0]),('B3',[1,0,0],[8,12,6,0]),('H3',[1,0,0],[20,30,12,0]),
    ('A4',[1,0,0,0],[5,10,10,5]),('B4',[1,0,0,0],[16,32,24,8]),
    ('F4',[1,0,0,0],[24,96,96,24]),('H4',[1,0,0,0],[600,1200,720,120]),
    ('H4',[0,0,0,1],[120,720,1200,600]),('B3',[1,1,1],[48,72,26,0]),('H3',[1,1,1],[120,180,62,0])])
def test_reflection_orbits_independent_regular_and_uniform_counts(family,rings,counts):
    m=wythoff(family,rings)
    assert [len(m[k]) for k in ('vertices','edges','faces','cells')]==counts
    a=analyze(m)
    assert a['edgeLength']['min']==pytest.approx(a['edgeLength']['max'])
    assert m['provenance']['orbitCompleteWithinFiniteGroup']

def test_resources_and_weights():
    with pytest.raises(GeometryError): wythoff('H4',[1,1,1,1],max_vertices=100)
    with pytest.raises(GeometryError): wythoff('B3',[0,0,0])
    with pytest.raises(GeometryError): wythoff('B3',[1,0,0],weights=[1,1,0])
    m=wythoff('B3',[1,1,0],weights=[1,2,0]);a=analyze(m)
    assert a['edgeLength']['max']>a['edgeLength']['min']*1.5


@pytest.mark.parametrize('family,rings,group_order,stabilizer_order,expected',[
    ('A3',[1,0,0],24,6,4),('B3',[0,1,0],48,4,12),
    ('H3',[1,1,1],120,1,120),('A4',[1,0,0,1],120,6,20),
    ('B4',[0,1,0,0],384,12,32),('F4',[0,1,0,1],1152,4,288),
    ('H4',[0,0,1,0],14400,20,720)])
def test_orbit_matches_independent_parabolic_indices_and_reflection_closure(
        family,rings,group_order,stabilizer_order,expected):
    orbit=reflection_orbit(family,rings,max_vertices=expected)
    assert len(orbit['vertices'])==orbit['expectedOrbitSize']==expected
    assert orbit['coxeterGroupOrder']==group_order
    assert orbit['inactiveStabilizerOrder']==stabilizer_order
    points=np.asarray(orbit['vertices'])/orbit['seedScale']
    gram=np.eye(len(rings))
    for i,m in enumerate(FAMILIES[family]):
        gram[i,i+1]=gram[i+1,i]=-math.cos(math.pi/m)
    tree=cKDTree(points)
    for root in np.linalg.cholesky(gram):
        distances,matches=tree.query(points-2*(points@root)[:,None]*root)
        assert max(distances)<=orbit['orbitTolerance']
        # Each mirror must permute the complete vertex set, not collapse it.
        assert len(set(matches))==expected
    assert orbit['orbitClosureResidual']<=orbit['orbitTolerance']
    assert orbit['orbitPredicateScale']=='unit-seed-circumradius'


@pytest.mark.parametrize('scale',[1e-200,1e-12,1e12,1e200])
def test_orbit_is_scale_covariant_and_preserves_weight_units(scale):
    weights=[1,2,0,3]
    baseline=reflection_orbit('B4',[1,1,0,1],weights)
    orbit=reflection_orbit('B4',[1,1,0,1],[w*scale for w in weights])
    assert len(orbit['vertices'])==len(baseline['vertices'])==192
    assert np.asarray(orbit['vertices'])/scale==pytest.approx(np.asarray(baseline['vertices']),abs=1e-13)
    assert orbit['weights']==[w*scale for w in weights]
    assert orbit['seedScale']/scale==pytest.approx(baseline['seedScale'])


def test_spatial_matching_checks_distance_across_bucket_boundaries():
    index=_OrbitIndex(tolerance=1e-6)
    existing=np.array([index.width-0.2e-6,0.0,0.0,0.0])
    index.add(existing)
    assert index.find(existing+np.array([0.4e-6,0,0,0])) is existing
    assert index.find(existing-np.array([2e-6,0,0,0])) is None
    # A nearby bucket is not sufficient: Euclidean distance is authoritative.
    assert index.find(existing+np.array([0.8e-6,0.8e-6,0,0])) is None


def test_tiny_relative_positive_weights_are_rejected_instead_of_partial_orbit():
    with pytest.raises(GeometryError,match='expected vertices.*numerically indistinguishable'):
        reflection_orbit('B3',[1,1,0],weights=[1,1e-15,0])


def test_subnormal_scale_that_distorts_the_orbit_is_rejected():
    with pytest.raises(GeometryError,match='cannot be resolved.*float64 model units'):
        reflection_orbit('B3',[1,0,0],weights=[float.fromhex('0x0.0000000000001p-1022'),0,0])


def test_expected_orbit_limit_is_checked_before_solving(monkeypatch):
    def forbidden_solve(*args,**kwargs):
        raise AssertionError('Resource overflow should be rejected before solving.')
    monkeypatch.setattr(np.linalg,'solve',forbidden_solve)
    with pytest.raises(GeometryError,match='requires 14400 vertices.*4096-vertex'):
        reflection_orbit('H4',[1,1,1,1])


def test_closure_check_rejects_missing_reflected_vertex():
    point=np.array([1.0,0,0]);index=_OrbitIndex();index.add(point)
    with pytest.raises(GeometryError,match='closure is numerically unresolved'):
        _verify_orbit_closure([point],np.eye(3),index)


def test_wythoff_retains_checked_orbit_evidence_and_weight_conventions():
    model=wythoff('B3',[1,1,0],weights=[2,3,0])
    evidence=model['provenance']
    assert evidence['orbitSize']==evidence['expectedOrbitSize']==24
    assert evidence['orbitClosureResidual']<=evidence['orbitTolerance']
    assert evidence['parameters']['weights']==model['metadata']['weights']==[2,3,0]
    assert not model['metadata']['uniformCandidate']


def test_full_h4_omnitruncation_retains_large_polygon_and_cell_incidence():
    # Independent H4 parabolic indices: rank-two orders 10/6/4 and
    # rank-three orders 120/24/20/12, in a group of order 14,400.
    m=wythoff('H4',[1,1,1,1],max_vertices=20000)
    assert [len(m[k]) for k in ('vertices','edges','faces','cells')]==[14400,28800,17040,2640]
    assert Counter(map(len,m['faces']))=={4:10800,6:4800,10:1440}
    cell_vertices=[set(v for face in cell for v in m['faces'][face]) for cell in m['cells']]
    assert Counter(map(len,cell_vertices))=={120:120,24:600,20:720,12:1200}
    assert Counter(face for cell in m['cells'] for face in cell)==Counter({i:2 for i in range(len(m['faces']))})
    assert m['validation']['passed']

def test_manual_faceting_retains_vertices_and_cycles():
    m=regular('cube');faces=[[0,1,3],[0,3,2]];f=facet(m,faces)
    assert f['vertices']==m['vertices'] and f['faces']==faces
    assert f['interpretation']=='generalized-complex' and f['validation']['passed']
    with pytest.raises(GeometryError): dual(f)
    with pytest.raises(GeometryError): facet(m,[[0,1,2,4]])
    with pytest.raises(GeometryError): generate('prism',n=5.5)
