from collections import Counter, defaultdict
from copy import deepcopy
from itertools import permutations, product
import math
import numpy as np
import pytest
from scipy.spatial import cKDTree
from engine.generators import CATALOG, CATALAN_SOURCES, regular
from engine.chiral import snub
from engine.incidence_dual import incidence_dual
from engine.geometry import canonical_cycle, GeometryError, hull, identity
from engine.symmetry import geometric_symmetry
from engine.operations import dual, section, transform
from engine.nets import unfold, extract_entity
from engine.formats import parse_off, export_off, save_project, load_file
from engine.faceting import facet


def distance_spectrum(points):
    points=np.asarray(points)
    return np.sort(np.linalg.norm(points[:,None]-points[None,:],axis=2).ravel())


def winding(points):
    points=np.asarray(points);points=points-points.mean(axis=0)
    _,_,vt=np.linalg.svd(points,full_matrices=False);p=points@vt[:2].T
    return abs(sum(math.atan2(np.cross(a,b),a@b) for a,b in zip(p,np.roll(p,-1,axis=0)))/(2*math.pi))


def test_library_manifest_has_unique_entries_and_every_archimedean_catalan_type():
    keys=[e['key'] for e in CATALOG];assert len(keys)==len(set(keys))==45
    counts=Counter(e['family'] for e in CATALOG)
    assert counts=={'Platonic':5,'Regular convex':6,'Archimedean':15,'Catalan':15,'Kepler-Poinsot':4}
    assert len({e['key'].removesuffix('-mirror') for e in CATALOG if e['family']=='Archimedean'})==13
    assert len({e['key'].removesuffix('-mirror') for e in CATALOG if e['family']=='Catalan'})==13


def test_snub_cube_matches_independent_tribonacci_coordinate_spectrum():
    # Classic coordinates, constructed independently of the chamber solver.
    t=max(r.real for r in np.roots([1,-1,-1,-1]) if abs(r.imag)<1e-10)
    points=[]
    for perm in permutations(range(3)):
        parity=(-1)**sum(perm[i]>perm[j] for i in range(3) for j in range(i+1,3))
        for signs in product((-1,1),repeat=3):
            if parity*np.prod(signs)==1:points.append(np.asarray([t,1,1/t])[list(perm)]*signs)
    reference=hull(points);p=np.asarray(reference['vertices']);length=np.linalg.norm(p[reference['edges'][0][0]]-p[reference['edges'][0][1]])
    assert distance_spectrum(regular('snub-cube')['vertices'])==pytest.approx(distance_spectrum(p/length),abs=1e-9)


@pytest.mark.parametrize('key,order,polygon,n_faces',[('snub-cube',24,4,6),('snub-dodecahedron',60,5,12)])
def test_snubs_are_vertex_transitive_regular_faced_chiral_enantiomorphs(key,order,polygon,n_faces):
    a=regular(key);b=regular(key+'-mirror');pa=np.asarray(a['vertices']);pb=np.asarray(b['vertices'])
    assert pb==pytest.approx(pa*np.array([-1,1,1]),abs=1e-12)
    assert identity(a)!=identity(b)
    assert Counter(map(len,a['faces']))=={3:order*4//3,polygon:n_faces}
    for face in a['faces']:
        cloud=pa[face];r=np.linalg.norm(cloud-cloud.mean(axis=0),axis=1)
        assert max(r)==pytest.approx(min(r),abs=1e-10)
        lengths=np.linalg.norm(cloud-np.roll(cloud,-1,axis=0),axis=1)
        assert lengths==pytest.approx(np.ones(len(face)),abs=1e-10)
        assert winding(cloud)==pytest.approx(1)
    for model in (a,b):
        group=geometric_symmetry(model);assert group['complete'] and group['order']==group['properOrder']==order
        assert {action['permutation'][0] for action in group['actions']}==set(range(order))
    assert max(abs(x) for x in a['provenance']['positiveChamberWeights'])>0
    for bad in (('A3','A'),('B3','left')):
        with pytest.raises(GeometryError):snub(*bad)


@pytest.mark.parametrize('key',list(CATALAN_SOURCES))
def test_catalan_reciprocity_and_congruent_faces(key):
    model=regular(key);primal=regular(CATALAN_SOURCES[key]);p=np.asarray(model['vertices'])
    restored=dual(model);dist,_=cKDTree(primal['vertices']).query(restored['vertices']);assert max(dist)<1e-8
    spectra=[distance_spectrum(p[f]) for f in model['faces']]
    assert all(np.allclose(s,spectra[0],atol=1e-8,rtol=1e-8) for s in spectra)
    assert model['metadata']['edgeUniform']==(key in ('rhombic-dodecahedron','rhombic-triacontahedron'))


@pytest.mark.parametrize('key,counts,step,degree,genus,edge_radius',[
    ('small-stellated-dodecahedron',[12,30,12],2,5,4,2*((1+math.sqrt(5))/2)/math.sqrt(1+((1+math.sqrt(5))/2)**2)),
    ('great-dodecahedron',[12,30,12],1,5,4,2/math.sqrt(1+((1+math.sqrt(5))/2)**2)),
    ('great-stellated-dodecahedron',[20,30,12],2,3,0,2*((1+math.sqrt(5))/2)/math.sqrt(3)),
    ('great-icosahedron',[12,30,20],1,5,0,2*((1+math.sqrt(5))/2)/math.sqrt(1+((1+math.sqrt(5))/2)**2))])
def test_regular_stars_preserve_winding_links_genus_metric_and_full_symmetry(key,counts,step,degree,genus,edge_radius):
    model=regular(key);p=np.asarray(model['vertices']);before=deepcopy(model)
    assert [len(model[k]) for k in ('vertices','edges','faces')]==counts
    assert model['interpretation']=='generalized-complex' and model['validation']['eulerCharacteristic']==2-2*genus
    assert Counter(v for e in model['edges'] for v in e)=={i:degree for i in range(counts[0])}
    edge_faces=defaultdict(list)
    for i,face in enumerate(model['faces']):
        assert winding(p[face])==pytest.approx(step,abs=1e-8)
        for a,b in zip(face,face[1:]+face[:1]):edge_faces[tuple(sorted((a,b)))].append((i,1 if a<b else -1))
    assert len(edge_faces)==counts[1] and all(len(fs)==2 for fs in edge_faces.values())
    # Prove orientability by propagating face orientation across every edge.
    adjacent=defaultdict(list)
    for (i,a),(j,b) in edge_faces.values():adjacent[i].append((j,-a*b));adjacent[j].append((i,-a*b))
    sign={0:1};queue=[0]
    while queue:
        i=queue.pop()
        for j,factor in adjacent[i]:
            if j in sign:assert sign[j]==sign[i]*factor
            else:sign[j]=sign[i]*factor;queue.append(j)
    assert len(sign)==counts[2]
    r=np.linalg.norm(p-p.mean(axis=0),axis=1).mean()
    lengths=[np.linalg.norm(p[a]-p[b])/r for a,b in model['edges']]
    assert lengths==pytest.approx([edge_radius]*counts[1],abs=1e-8)
    group=geometric_symmetry(model);assert group['complete'] and group['order']==120 and group['properOrder']==60
    for unsupported in (dual,unfold):
        with pytest.raises(GeometryError):unsupported(model)
    sliced=section(model)
    assert sliced['status']=='surface-intersection'
    assert sliced['model']['interpretation']=='surface-section'
    assert sliced['model']['metadata']['fillSemantics']=='source-face-intersection'
    imported=parse_off(export_off(model));assert imported['interpretation']=='generalized-complex' and identity(imported)==identity(model)
    assert model==before


@pytest.mark.parametrize('key',['small-stellated-dodecahedron','great-dodecahedron','great-stellated-dodecahedron','great-icosahedron','cube'])
def test_incidence_dual_twice_recovers_positions_full_cycles_and_polarity(key,tmp_path):
    model=regular(key);before=deepcopy(model);d=incidence_dual(model);twice=incidence_dual(d)
    distances,mapping=cKDTree(model['vertices']).query(twice['vertices']);assert max(distances)<1e-8
    assert Counter(canonical_cycle([int(mapping[v]) for v in f]) for f in twice['faces'])==Counter(canonical_cycle(f) for f in model['faces'])
    assert len(d['vertices'])==len(model['faces']) and len(d['faces'])==len(model['vertices']) and len(d['edges'])==len(model['edges'])
    assert d['validation']['eulerCharacteristic']==model['validation']['eulerCharacteristic']
    assert not d['provenance']['convexified'] and d['interpretation']=='generalized-complex'
    p=np.asarray(model['vertices']);q=np.asarray(d['vertices']);assert all(q[f]@p[v]==pytest.approx(1) for v,face in enumerate(d['faces']) for f in face)
    path=tmp_path/'star-dual.polyproj';project={'format':'polytope-laboratory','version':1,'active':0,'documents':[{'cursor':0,'states':[{'model':model},{'model':d}]}]}
    save_project(path,project);loaded=load_file(path)['project'];assert identity(loaded['documents'][0]['states'][1]['model'])==identity(d)
    assert model==before


def test_incidence_dual_domain_singularities_and_scale_covariance():
    cube=regular('cube');open_shell=facet(cube,cube['faces'][:-1])
    with pytest.raises(GeometryError,match='two distinct face'):incidence_dual(open_shell)
    with pytest.raises(GeometryError,match='singular'):incidence_dual(cube,center=[1,0,0])
    with pytest.raises(GeometryError):incidence_dual(regular('tesseract'))
    with pytest.raises(GeometryError):incidence_dual(cube,radius=0)
    duplicate=facet(cube,cube['faces']+[cube['faces'][0]])
    with pytest.raises(GeometryError,match='two distinct face'):incidence_dual(duplicate)
    star=regular('great-stellated-dodecahedron');original=incidence_dual(star)
    for scale in (1e-9,1e9):
        scaled=incidence_dual(transform(star,scale=scale),radius=scale)
        assert np.asarray(scaled['vertices'])/scale==pytest.approx(np.asarray(original['vertices']),abs=1e-8)


@pytest.mark.parametrize('key',['small-stellated-dodecahedron','great-stellated-dodecahedron'])
def test_star_face_extraction_keeps_all_crossings_and_source_embedding(key):
    model=regular(key);before=deepcopy(model)
    face=extract_entity(model,kind='face',index=0);embedding=face['metadata']['sourceEmbedding']
    assert face['interpretation']=='generalized-complex' and face['dimension']==2
    assert face['faces']==[list(range(5))] and winding(face['vertices'])==pytest.approx(2)
    reconstructed=np.asarray(face['vertices'])@np.asarray(embedding['basis']).T+embedding['origin']
    assert reconstructed==pytest.approx(np.asarray(model['vertices'])[embedding['sourceVertexIds']],abs=1e-10)
    assert model==before


def test_generalized_cell_extraction_preserves_open_boundary_and_face_ids():
    model=regular('cross4');model['interpretation']='generalized-complex';model['cells'][0]=model['cells'][0][:-1]
    result=extract_entity(model,kind='cell',index=0);embedding=result['metadata']['sourceEmbedding']
    assert result['interpretation']=='generalized-complex' and len(result['faces'])==3
    inverse=embedding['sourceVertexIds']
    assert [[inverse[i] for i in f] for f in result['faces']]==[model['faces'][f] for f in model['cells'][0]]
    with pytest.raises(GeometryError):extract_entity(model,index=True)


def test_pinched_vertex_link_is_rejected_even_when_all_edges_have_two_faces():
    p=[[0,0,0],[1,0,0],[0,1,0],[0,0,1],[-1,0,0],[0,-1,0],[0,0,-1]]
    cycles=[[0,1,2],[0,1,3],[0,2,3],[1,2,3],[0,4,5],[0,4,6],[0,5,6],[4,5,6]]
    source=regular('cube');source['vertices']=p;pinched=facet(source,cycles)
    with pytest.raises(GeometryError,match='disconnected'):incidence_dual(pinched)
