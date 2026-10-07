"""Independent unequal-ring metrics, literal signed incidence and refusal tests."""
from collections import Counter
from copy import deepcopy
from itertools import product
import json
import math

import numpy as np
import pytest

from engine.antiprisms import rational_antiprism
from engine.antiprisms import _snapshot_hash
from engine.compounds import extract_component, remove_component
from engine.formats import validate_project
from engine.geometry import GeometryError, canonical_cycle, identity, validate
from engine.podia import rational_podium, rational_antipodium
from engine.products import polygon_prism
from engine.star_polygons import regular_star_polygon


CONSTRUCTORS = (rational_podium, rational_antipodium)
KINDS = ('vertices','edges','faces','cells')


def evidence(model):
    return model['metadata']['rationalAntipodium' if 'rationalAntipodium' in model['metadata'] else 'rationalPodium']


def assert_boundaries(model, n, d, anti):
    g = math.gcd(n,abs(d))
    assert [len(model[k]) for k in KINDS]==[2*n,(4 if anti else 3)*n,(2 if anti else 1)*n+2*g,0]
    info = evidence(model)
    assert model['interpretation']=='generalized-complex' and model['numeric']['certified'] is False
    assert all(k not in model for k in ('measure','facetEquations','facetVertices','components'))
    assert validate(model)['passed'] and identity(model)==model['fingerprint']==info['resultSourceFingerprint']
    assert info['resultSourceModelId']==model['id'] and info['recoverableCompoundComponents'] is False
    assert len(info['componentPartitions'])==g
    for k in KINDS:
        assert sorted(i for part in info['componentPartitions'] for i in part['maps'][k])==list(range(len(model[k])))
        assert len(info['maps'][k])==len(model[k])
    for part in info['componentPartitions']:
        vids=set(part['maps']['vertices'])
        assert all(set(model[k][i])<=vids for k in ('edges','faces') for i in part['maps'][k])
        assert len(vids)-len(part['maps']['edges'])+len(part['maps']['faces'])==2
        # Every local vertex link independently forms one circle.
        for v in vids:
            link=[]
            for f in part['maps']['faces']:
                face=model['faces'][f]
                if v in face:
                    j=face.index(v);link.append((face[j-1],face[(j+1)%len(face)]))
            degree=Counter(x for edge in link for x in edge)
            assert set(degree.values())=={2}
            seen={next(iter(degree))}
            while True:
                expanded=seen|{b for a,b in link if a in seen}|{a for a,b in link if b in seen}
                if expanded==seen:break
                seen=expanded
            assert seen==set(degree)
    boundary=Counter(tuple(sorted((a,b))) for f in model['faces'] for a,b in zip(f,f[1:]+f[:1]))
    assert boundary==Counter({tuple(sorted(e)):2 for e in model['edges']})


def test_equal_square_podium_independent_full_cube_gram_edges_and_faces():
    model=rational_podium(symbol='4',base_radius=math.sqrt(2),top_radius=math.sqrt(2),height=2)
    p=np.asarray(model['vertices']);gram=p@p.T
    assert sorted(gram.flatten())==pytest.approx([-3]*8+[-1]*24+[1]*24+[3]*8,abs=3e-15)
    expected_edges={tuple(sorted((i,j))) for i in range(8) for j in range(i+1,8) if abs(gram[i,j]-1)<1e-12}
    assert {tuple(sorted(e)) for e in model['edges']}==expected_edges
    assert {frozenset(f) for f in model['faces']}=={frozenset((0,1,2,3)),frozenset((4,5,6,7)),*{frozenset((i,(i+1)%4,4+(i+1)%4,4+i)) for i in range(4)}}
    assert all(math.dist(p[a],p[b])==pytest.approx(2) for a,b in model['edges'])
    assert_boundaries(model,4,1,False)


def test_equal_triangular_antipodium_is_octahedron_by_full_independent_gram_and_incidence():
    model=rational_antipodium(base_radius=1,top_radius=1,height=math.sqrt(2))
    opposite={(0,4),(1,5),(2,3)}
    gram=np.zeros((6,6));np.fill_diagonal(gram,1.5)
    for a,b in opposite:gram[a,b]=gram[b,a]=-1.5
    assert np.asarray(model['vertices'])@np.asarray(model['vertices']).T==pytest.approx(gram,abs=2e-15)
    assert {tuple(sorted(e)) for e in model['edges']}=={(a,b) for a in range(6) for b in range(a+1,6)}-opposite
    assert {frozenset(f) for f in model['faces']}=={frozenset(v) for v in product((0,4),(1,5),(2,3))}
    assert_boundaries(model,3,1,True)


@pytest.mark.parametrize('constructor',CONSTRUCTORS)
@pytest.mark.parametrize('ring_mode',['radius','edge'])
@pytest.mark.parametrize('side_mode',['height','side_edge'])
def test_four_unequal_radius_modes_have_independent_coordinates_and_edge_metrics(constructor,ring_mode,side_mode):
    # Square: Rb=2, Rt=1, h=3; the antipodium horizontal chord squared
    # equals 5-2*sqrt(2), while the aligned podium has q squared=1.
    anti=constructor is rational_antipodium
    side=math.sqrt(14-2*math.sqrt(2)) if anti else math.sqrt(10)
    params={'base_radius':2,'top_radius':1} if ring_mode=='radius' else {'base_edge':2*math.sqrt(2),'top_edge':math.sqrt(2)}
    params[side_mode]=3 if side_mode=='height' else side
    result=constructor(4,**params);info=evidence(result)
    phase=math.pi/4 if anti else 0
    expected=[[2*math.cos(math.pi*i/2),2*math.sin(math.pi*i/2),-1.5] for i in range(4)]+[[math.cos(math.pi*i/2+phase),math.sin(math.pi*i/2+phase),1.5] for i in range(4)]
    assert result['vertices']==pytest.approx(np.asarray(expected),abs=2e-15)
    assert info['height']==pytest.approx(3) and info['sideEdgeLength']==pytest.approx(side)
    assert info['ringSizing']==('radii' if ring_mode=='radius' else 'edge-lengths') and info['sideSizing']==side_mode.replace('_','-')
    for i,(a,b) in enumerate(result['edges']):
        assert math.dist(result['vertices'][a],result['vertices'][b])==pytest.approx(2*math.sqrt(2) if i<4 else math.sqrt(2) if i<8 else side)
    assert_boundaries(result,4,1,anti)


@pytest.mark.parametrize('n,d',[(3,1),(5,2),(5,3),(5,-3),(6,2),(9,-3)])
def test_unequal_aligned_walls_are_planar_trapezoids_with_independent_area(n,d):
    model=rational_podium(n,d,base_radius=3,top_radius=1,height=2)
    info=evidence(model);g=math.gcd(n,abs(d))
    expected=(3+1)*abs(math.sin(math.pi*d/n))*math.hypot(2,2*math.cos(math.pi*d/n))
    p=np.asarray(model['vertices'])
    for face in model['faces'][2*g:]:
        q=p[face];vectors=q[1:]-q[0]
        assert np.linalg.det(vectors)==pytest.approx(0,abs=1e-13)
        area=np.linalg.norm(sum((np.cross(a,b) for a,b in zip(q,np.roll(q,-1,axis=0))),start=np.zeros(3)))/2
        assert area==pytest.approx(expected)
    assert_boundaries(model,n,d,False)


@pytest.mark.parametrize('n,d',[(3,1),(5,2),(5,3),(5,-3),(6,2)])
def test_unequal_antipodium_triangle_areas_from_independent_isosceles_altitudes(n,d):
    model=rational_antipodium(n,d,base_radius=3,top_radius=1,height=2)
    p=np.asarray(model['vertices']);theta=math.pi*d/n;g=math.gcd(n,abs(d))
    areas=[3*abs(math.sin(theta))*math.hypot(2,3*math.cos(theta)-1),
           abs(math.sin(theta))*math.hypot(2,math.cos(theta)-3)]
    for j,face in enumerate(model['faces'][2*g:]):
        a,b,c=p[face]
        assert np.linalg.norm(np.cross(b-a,c-a))/2==pytest.approx(areas[j%2])


@pytest.mark.parametrize('constructor',CONSTRUCTORS)
@pytest.mark.parametrize('d',[2,3,-2,-3])
def test_raw_pentagram_cycles_and_top_phase_preserved(constructor,d):
    model=constructor(symbol=f'5/{d}',base_radius=2,top_radius=1,height=1)
    cycle=[(i*d)%5 for i in range(5)]
    phase=math.pi*d/5 if constructor is rational_antipodium else 0
    assert evidence(model)['orderedSourceCycles']==[cycle]
    assert model['faces'][:2]==[cycle[::-1],[i+5 for i in cycle]]
    assert model['vertices'][5]==pytest.approx([math.cos(phase),math.sin(phase),.5])
    assert evidence(model)['upperRotationRadians']==phase
    assert_boundaries(model,5,d,constructor is rational_antipodium)


@pytest.mark.parametrize('constructor',CONSTRUCTORS)
@pytest.mark.parametrize('n,d',[(3,1),(5,3),(6,2),(9,3)])
def test_negative_step_full_geometry_reflection_and_full_cycle_incidence(constructor,n,d):
    positive=constructor(n,d,base_radius=2,top_radius=1,height=2)
    negative=constructor(n,-d,base_radius=2,top_radius=1,height=2)
    perm=[(-i)%n for i in range(n)]+[n+(-i)%n for i in range(n)]
    for i,(x,y,z) in enumerate(positive['vertices']):assert negative['vertices'][perm[i]]==pytest.approx([x,-y,z],abs=5e-15)
    assert {tuple(sorted(perm[v] for v in e)) for e in positive['edges']}=={tuple(sorted(e)) for e in negative['edges']}
    assert {canonical_cycle([perm[v] for v in f]) for f in positive['faces']}=={canonical_cycle(f) for f in negative['faces']}


@pytest.mark.parametrize('constructor',CONSTRUCTORS)
def test_interleaved_hexagram_partition_color_and_two_full_factor_snapshots(constructor):
    colors=[{'encoding':'unit','values':[.1,.2,.3,.4]},{'encoding':'byte','values':[20,40,60,80]}]
    original=deepcopy(colors)
    model=constructor(symbol='6/2',base_radius=2,top_radius=1,height=2,cap_colors=colors)
    info=evidence(model)
    assert colors==original
    assert [p['maps']['vertices'] for p in info['componentPartitions']]==[[0,2,4,6,8,10],[1,3,5,7,9,11]]
    assert model['metadata']['offColors']['faces']==colors+colors+[None]*(12 if constructor is rational_antipodium else 6)
    assert len(info['sourceModels'])==2 and info['sourceModels'][0]['vertices']!=info['sourceModels'][1]['vertices']
    for layer,source in enumerate(info['sourceModels']):
        assert source['metadata']['regularStarPolygon']['symbol']=='6/2'
        assert source['metadata']['offColors']['faces']==colors
        assert info['inputs'][layer]['sourceModelId']==source['id']
        assert info['inputs'][layer]['sourceFingerprint']==identity(source)
        assert info['inputs'][layer]['sourceSnapshotSha256']==_snapshot_hash(source)
        assert len(source['components'])==2
        assert info['sourceMaps'][layer]['vertices']==[[i+6*layer] for i in range(6)]
    for part in info['componentPartitions']:
        for operation in (extract_component,remove_component):
            with pytest.raises(GeometryError,match='component ID'):operation(model,part['id'])
    info['sourceModels'][0]['metadata']['offColors']['faces'][0]['values'][0]=.9
    assert info['sourceModels'][1]['metadata']['offColors']['faces']==colors
    assert model['metadata']['offColors']['faces'][:2]==colors and colors==original
    assert_boundaries(model,6,2,constructor is rational_antipodium)


@pytest.mark.parametrize('n,d',[(4,1),(5,2),(5,-3),(6,2)])
def test_equal_radius_limits_keep_existing_prism_antiprism_order_and_coordinates(n,d):
    aligned=rational_podium(n,d,base_radius=1,top_radius=1,height=2)
    prism=polygon_prism(regular_star_polygon(n,d),2)
    anti=rational_antipodium(n,d,base_radius=1,top_radius=1,height=2)
    old=rational_antiprism(n,d,radius=1,height=2)
    for new,ref in ((aligned,prism),(anti,old)):
        for kind in KINDS:assert new[kind]==ref[kind]


@pytest.mark.parametrize('constructor',CONSTRUCTORS)
@pytest.mark.parametrize('scale',[1e-100,1e99])
def test_scale_extremes_keep_normalized_unequal_geometry_and_project_roundtrip(constructor,scale):
    model=constructor(5,2,base_radius=2*scale,top_radius=scale,height=3*scale)
    reference=constructor(5,2,base_radius=2,top_radius=1,height=3)
    assert np.asarray(model['vertices'])/scale==pytest.approx(np.asarray(reference['vertices']),abs=2e-15)
    project={'format':'polytope-laboratory','version':1,'active':0,'documents':[{'id':'podium-doc','name':'Podium','states':[{'id':'podium-state','label':'Podium','model':model,'view':{}}],'cursor':0}]}
    reopened=validate_project(json.loads(json.dumps(project)))
    restored=reopened['documents'][0]['states'][0]['model']
    assert identity(restored)==identity(model)
    assert restored['metadata']==model['metadata'] and restored['provenance']==model['provenance']
    assert evidence(model)['sourceEmbedding']==[{'rotationRadians':0.0,'axialCoordinate':-1.5*scale},
        {'rotationRadians':2*math.pi/5 if constructor is rational_antipodium else 0.0,'axialCoordinate':1.5*scale}]
    assert_boundaries(model,5,2,constructor is rational_antipodium)


@pytest.mark.parametrize('constructor',CONSTRUCTORS)
@pytest.mark.parametrize('params',[
    {},{'base_radius':1},{'base_edge':1},
    {'base_radius':1,'top_radius':1,'base_edge':1,'top_edge':1},
    {'base_radius':1,'top_edge':1},
    {'base_radius':1,'top_radius':1,'height':1,'side_edge':2},
    {'base_radius':1,'top_radius':1,'height':0},
    {'base_radius':0,'top_radius':1,'height':1},
    {'base_radius':True,'top_radius':1,'height':1},
    {'base_radius':'1','top_radius':1,'height':1},
    {'base_radius':10**1000,'top_radius':1,'height':1},
    {'base_radius':math.inf,'top_radius':1,'height':1},
    {'base_radius':math.nan,'top_radius':1,'height':1},
    {'base_radius':1,'top_radius':1,'height':math.nan},
    {'base_radius':1,'top_radius':1,'height':1e-20},
    {'base_radius':1,'top_radius':1,'height':1e100},
    {'base_radius':1,'top_radius':1e-20,'height':1},
    {'base_radius':5e-324,'top_radius':5e-324,'height':5e-324},
    {'base_radius':1,'top_radius':1,'height':1,'cap_colors':[{'encoding':'unit','values':[0,0,0,2]}]},
])
def test_invalid_or_unresolved_geometry_atomic_refusal(constructor,params):
    original=deepcopy(params)
    with pytest.raises(GeometryError):constructor(**params)
    # NaN is not reflexively equal; unchanged JSON spellings still show no edits.
    assert json.dumps(params,sort_keys=True)==json.dumps(original,sort_keys=True)


@pytest.mark.parametrize('constructor',CONSTRUCTORS)
@pytest.mark.parametrize('pair',[(True,1),(10**500,1),(3,True),(4,2),(6,-3),(5,0),(5,5)])
def test_invalid_literal_pairs_rejected_before_conversion(constructor,pair):
    with pytest.raises(GeometryError):constructor(*pair,base_radius=1,top_radius=1,height=1)


@pytest.mark.parametrize('constructor',CONSTRUCTORS)
def test_flat_side_and_ulp_uncertainty_refuse_but_resolved_side_succeeds(constructor):
    # Aligned Rb=2,Rt=1 has q=1; triangle half-step gives q=sqrt(3).
    q=math.sqrt(3) if constructor is rational_antipodium else 1
    for side in (q/2,q,math.nextafter(q,math.inf)):
        with pytest.raises(GeometryError,match='resolvably'):constructor(3,base_radius=2,top_radius=1,side_edge=side)
    model=constructor(3,base_radius=2,top_radius=1,side_edge=math.hypot(q,2))
    assert evidence(model)['height']==pytest.approx(2)


@pytest.mark.parametrize('constructor',CONSTRUCTORS)
def test_actual_maximum_ring_and_many_disconnected_sources(constructor):
    for n,d in ((1024,1),(1023,341)):
        model=constructor(n,d,base_radius=2,top_radius=1,height=2)
        assert_boundaries(model,n,d,constructor is rational_antipodium)


@pytest.mark.parametrize('constructor',CONSTRUCTORS)
def test_resource_cap_refuses_before_generating_source(monkeypatch,constructor):
    monkeypatch.setattr('engine.podia.MAX_PODIA_VERTICES',5)
    monkeypatch.setattr('engine.podia.regular_star_polygon',lambda *a:pytest.fail('allocated source despite known cap'))
    with pytest.raises(GeometryError,match='resource limit'):constructor(base_radius=1,top_radius=1,height=1)


@pytest.mark.parametrize('constructor',CONSTRUCTORS)
def test_symbol_expression_and_mixed_symbol_pair_are_not_evaluated(constructor):
    for params in ({'symbol':'5/(1+1)'},{'symbol':'5/2','n':5},{'symbol':'3','d':1}):
        with pytest.raises(GeometryError):constructor(**params,base_radius=1,top_radius=1,height=1)


@pytest.mark.parametrize('constructor',CONSTRUCTORS)
def test_cyclic_deep_nonjson_and_unicode_cap_attributes_are_atomic_structured_refusals(constructor):
    cyclic={'encoding':'unit','values':[0,0,0]};cyclic['extra']=cyclic
    deep={};current=deep
    for _ in range(70):current['child']={};current=current['child']
    for extra in (deep,object(),'\ud800',10**5000,(1.0,)):
        color={'encoding':'unit','values':[0,0,0],'extra':extra}
        with pytest.raises(GeometryError):constructor(base_radius=1,top_radius=1,height=1,cap_colors=[color])
    with pytest.raises(GeometryError,match='cyclic'):constructor(base_radius=1,top_radius=1,height=1,cap_colors=[cyclic])


@pytest.mark.parametrize('constructor',CONSTRUCTORS)
@pytest.mark.parametrize('bound,value', [('MAX_COMPONENTS',1),('MAX_FACE_VERTICES',2),('MAX_INCIDENCES',1),('MAX_ELEMENTS',2),('MAX_PAYLOAD_BYTES',100)])
def test_all_declared_resource_guards_reject_structurally(constructor,monkeypatch,bound,value):
    monkeypatch.setattr('engine.podia.'+bound,value)
    with pytest.raises(GeometryError,match='resource limit'):constructor(6,2,base_radius=2,top_radius=1,height=2)
