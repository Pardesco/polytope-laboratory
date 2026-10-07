"""Independent hypercube incidence and closed-shell source preservation checks."""
from collections import Counter
from copy import deepcopy
from itertools import combinations, product
import json
import math

import numpy as np
import pytest

from engine.antiprisms import rational_antiprism
from engine.compounds import add_models, extract_component, remove_component
from engine.formats import validate_project
from engine.edge_subdivision import subdivide_edges
from engine.generators import generate
from engine.geometry import GeometryError, canonical_cycle, identity, validate
from engine.prisms import polyhedron_prism


KINDS=('vertices','edges','faces','cells')


def model(vertices,faces):
    return {'id':'literal-polyhedron','name':'Literal closed boundary','dimension':3,'embeddingDimension':3,
            'interpretation':'generalized-complex','vertices':deepcopy(vertices),'faces':deepcopy(faces),
            'edges':[list(edge) for edge in sorted({tuple(sorted((a,b))) for face in faces for a,b in zip(face,face[1:]+face[:1])})],
            'cells':[],'metadata':{},'numeric':{'mode':'float64-approximate','certified':False}}


def cube():
    return model([[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]],
                 [[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]])


def tetrahedron():
    return model([[1,1,1],[1,-1,-1],[-1,1,-1],[-1,-1,1]],[[0,2,1],[0,1,3],[0,3,2],[1,2,3]])


def counts(value):return [len(value[kind]) for kind in KINDS]
def evidence(value):return value['metadata']['polyhedronPrism']


def assert_generalized(value):
    assert value['interpretation']=='generalized-complex' and not value['numeric']['certified']
    assert all(key not in value for key in ('measure','facetEquations','facetVertices','rationalFacetEquations'))
    assert validate(value)['passed'] and value['fingerprint']==identity(value)
    assert evidence(value)['resultSourceFingerprint']==identity(value)


def assert_partition(value,g):
    parts=evidence(value)['componentPartitions'];assert len(parts)==g
    assert 'components' not in value and evidence(value)['recoverableCompoundComponents'] is False
    for kind in KINDS:
        assert sorted(i for part in parts for i in part['maps'][kind])==list(range(len(value[kind])))
    for part in parts:
        vertices,faces=set(part['maps']['vertices']),set(part['maps']['faces'])
        for kind in ('edges','faces','cells'):
            assert all(set(value[kind][i]) <= (faces if kind=='cells' else vertices) for i in part['maps'][kind])
        for operation in (extract_component,remove_component):
            with pytest.raises(GeometryError,match='component ID'):operation(value,part['id'])


def test_literal_cube_prism_is_full_tesseract_by_independent_axis_incidence_not_a_hull():
    source=cube();original=deepcopy(source);result=polyhedron_prism(source,2)
    assert counts(result)==[16,32,24,8] and source==original
    assert result['vertices']==[point+[z] for z in (-1,1) for point in source['vertices']]
    lookup={tuple(point):i for i,point in enumerate(result['vertices'])}
    assert set(lookup)==set(product((-1,1),repeat=4))
    expected_edges={tuple(sorted((i,j))) for i,a in enumerate(result['vertices']) for j,b in enumerate(result['vertices'])
                    if i<j and sum(x!=y for x,y in zip(a,b))==1}
    assert {tuple(sorted(edge)) for edge in result['edges']}==expected_edges
    expected_faces=set()
    for varying in combinations(range(4),2):
        fixed=[i for i in range(4) if i not in varying]
        for constants in product((-1,1),repeat=2):
            face=[]
            for signs in [(-1,-1),(1,-1),(1,1),(-1,1)]:
                point=[0]*4
                for axis,x in zip(fixed,constants):point[axis]=x
                for axis,x in zip(varying,signs):point[axis]=x
                face.append(lookup[tuple(point)])
            expected_faces.add(canonical_cycle(face))
    assert {canonical_cycle(face) for face in result['faces']}==expected_faces
    expected_cells={frozenset(canonical_cycle(face) for face in result['faces'] if all(result['vertices'][i][axis]==sign for i in face))
                    for axis in range(4) for sign in (-1,1)}
    assert {frozenset(canonical_cycle(result['faces'][i]) for i in cell) for cell in result['cells']}==expected_cells
    assert all(math.dist(result['vertices'][a],result['vertices'][b])==2 for a,b in result['edges'])
    assert_generalized(result);assert_partition(result,1)


@pytest.mark.parametrize('source,expected,g', [
    (tetrahedron(),[8,16,14,6],1),(rational_antiprism(3),[12,30,28,10],1),
    (rational_antiprism(6,2),[24,60,56,20],2),
    (rational_antiprism(5,2),[20,50,44,14],1),(rational_antiprism(5,3),[20,50,44,14],1)])
def test_independent_antiduoprism_counts_every_ridge_two_cells_and_every_cell_edge_two_faces(source,expected,g):
    before=deepcopy(source);result=polyhedron_prism(source,3)
    assert counts(result)==expected and source==before
    incidence=Counter(i for cell in result['cells'] for i in cell)
    assert len(incidence)==len(result['faces']) and set(incidence.values())=={2}
    for cell in result['cells']:
        links=Counter(tuple(sorted((a,b))) for i in cell for a,b in zip(result['faces'][i],result['faces'][i][1:]+result['faces'][i][:1]))
        assert set(links.values())=={2}
    assert_generalized(result);assert_partition(result,g)


@pytest.mark.parametrize('d', [2,3,-2,-3])
def test_raw_star_antiprism_source_phase_cycles_and_literal_face_walls_survive_four_dimensional_lift(d):
    source=rational_antiprism(5,d);result=polyhedron_prism(source,4)
    v,e,f=(len(source[k]) for k in ('vertices','edges','faces'))
    assert result['vertices']==[point+[z] for z in (-2,2) for point in source['vertices']]
    assert result['faces'][:f]==[list(reversed(face)) for face in source['faces']]
    assert result['faces'][f:2*f]==[[i+v for i in face] for face in source['faces']]
    assert result['faces'][2*f:]==[[a,b,b+v,a+v] for a,b in source['edges']]
    assert result['cells'][:2]==[list(range(f)),list(range(f,2*f))]
    assert evidence(result)['sourceModel']['metadata']['rationalAntiprism']['d']==d
    assert evidence(result)['sourceModel']['metadata']['rationalAntiprism']['upperRotationRadians']==math.pi*d/5
    assert len(evidence(result)['maps']['faces'])==2*f+e


@pytest.mark.parametrize('coincident', [False,True])
def test_compound_shells_retain_input_leaf_ids_literal_coordinates_and_no_weld(coincident):
    a,b=cube(),cube()
    if not coincident:b['vertices']=[[x+10,y-7,z+3] for x,y,z in b['vertices']]
    source=add_models(a,b);before=deepcopy(source);result=polyhedron_prism(source,2)
    assert counts(result)==[32,64,48,16] and source==before
    assert result['vertices']==[point+[z] for z in (-1,1) for point in source['vertices']]
    assert [part['sourceComponentId'] for part in evidence(result)['componentPartitions']]==[item['id'] for item in source['components']]
    if coincident:assert len(set(map(tuple,result['vertices'])))==16
    assert_partition(result,2)


def test_every_source_map_cap_cell_and_side_cell_is_complete_despite_reversed_stored_edge_orientation():
    source=cube();source['edges']=[list(reversed(edge)) for edge in reversed(source['edges'])]
    result=polyhedron_prism(source,2);info=evidence(result);v,e,f=8,12,6
    assert info['sourceMaps']['vertices']==[[i,i+v] for i in range(v)]
    assert info['sourceMaps']['edges']==[[i,i+e] for i in range(e)]
    assert info['sourceMaps']['faces']==[[i,i+f] for i in range(f)]
    for face_id,face in enumerate(source['faces']):
        source_edges=[next(i for i,edge in enumerate(source['edges']) if set(edge)=={a,b}) for a,b in zip(face,face[1:]+face[:1])]
        assert result['cells'][2+face_id]==[face_id,face_id+f]+[2*f+i for i in source_edges]
        assert info['sourceFaceSideCells'][face_id]==[2+face_id]
    assert result['cells'][0]==list(range(6)) and result['cells'][1]==list(range(6,12))


def test_valid_source_edge_subdivisions_preserve_valence_two_points_and_full_refined_boundary():
    source=subdivide_edges(cube(),2)
    before=deepcopy(source);result=polyhedron_prism(source,2)
    assert counts(source)==[20,24,6,0] and counts(result)==[40,68,36,8]
    assert result['vertices']==[point+[z] for z in (-1,1) for point in source['vertices']]
    assert len(result['cells'][0])==6 and len(result['cells'][1])==6
    assert source==before;assert_generalized(result)


def test_colors_notes_caches_and_full_snapshot_are_preserved_only_at_their_documented_scope():
    source=cube();rgba={'encoding':'unit','values':[.2,.4,.6,.8]};colors=[rgba]+[None]*5
    source['metadata']={'offColors':{'faces':colors,'cells':[]},'notes':'source α'}
    source['measure']={'content':999};source['interpretation']='convex-polytope';source['numeric']['certified']=True
    before=deepcopy(source);result=polyhedron_prism(source,2)
    assert source==before and evidence(result)['sourceModel']==before
    assert result['metadata']['offColors']=={'faces':colors+colors+[None]*12,'cells':[None]*8}
    result['metadata']['offColors']['faces'][0]['values'][0]=.9
    assert evidence(result)['sourceModel']==before and source==before
    assert_generalized(result)


def test_native_project_roundtrip_keeps_disconnected_sources_cycles_colors_partitions_and_evidence():
    source=rational_antiprism(6,-2,cap_colors=[None,{'encoding':'unit','values':[.1,.2,.3,.4]}])
    result=polyhedron_prism(source,2);before=deepcopy(result)
    project={'format':'polytope-laboratory','version':1,'active':0,'documents':[{
        'id':'direct-prism','cursor':0,'states':[{'model':result,'view':{},'notes':'lifted source'}]}]}
    restored=validate_project(json.loads(json.dumps(project,allow_nan=False)))['documents'][0]['states'][0]['model']
    assert identity(restored)==identity(result) and restored['metadata']==before['metadata'] and result==before


def test_snapshot_hash_normalizes_equivalent_json_numbers_but_binds_source_attributes():
    source=cube();floating=deepcopy(source);floating['vertices']=[[float(x) for x in point] for point in source['vertices']]
    a,b=polyhedron_prism(source),polyhedron_prism(floating)
    assert evidence(a)['sourceSnapshotSha256']==evidence(b)['sourceSnapshotSha256']
    source['metadata']['notes']='changed';changed=polyhedron_prism(source)
    assert evidence(changed)['sourceFingerprint']==evidence(a)['sourceFingerprint']
    assert evidence(changed)['sourceSnapshotSha256']!=evidence(a)['sourceSnapshotSha256']


def test_closed_torus_boundary_keeps_complete_formal_cap_cells_with_explicit_nonball_euler_warnings():
    points=[[(3+math.cos(v*math.pi/2))*math.cos(u*math.pi/2),
             (3+math.cos(v*math.pi/2))*math.sin(u*math.pi/2),math.sin(v*math.pi/2)] for u in range(4) for v in range(4)]
    index=lambda u,v:(u%4)*4+(v%4)
    faces=[[index(u,v),index(u+1,v),index(u+1,v+1),index(u,v+1)] for u in range(4) for v in range(4)]
    source=model(points,faces);result=polyhedron_prism(source,2)
    assert counts(result)==[32,80,64,18]
    assert evidence(result)['componentPartitions'][0]['sourceEulerCharacteristic']==0
    assert result['cells'][:2]==[list(range(16)),list(range(16,32))]
    assert any('Euler characteristic differs' in warning for warning in result['validation']['warnings'])
    assert_generalized(result)


def test_closed_kepler_poinsot_star_shell_keeps_crossing_faces_and_nonball_cap_boundary():
    source=generate('regular',key='small-stellated-dodecahedron')
    original=deepcopy(source);result=polyhedron_prism(source,2)
    assert counts(source)==[12,30,12,0] and counts(result)==[24,72,54,14]
    assert evidence(result)['componentPartitions'][0]['sourceEulerCharacteristic']==-6
    assert result['cells'][0]==list(range(12)) and result['cells'][1]==list(range(12,24))
    assert result['faces'][:12]==[list(reversed(face)) for face in source['faces']]
    assert source==original and any('Euler characteristic differs' in warning for warning in result['validation']['warnings'])
    assert_generalized(result)


def test_actual_vertex_resource_boundary_and_oversized_native_sources():
    result=polyhedron_prism(rational_antiprism(1000),1)
    assert counts(result)==[4000,10000,8004,2004]
    assert_generalized(result)
    with pytest.raises(GeometryError,match='resource'):
        polyhedron_prism(rational_antiprism(1024))


@pytest.mark.parametrize('height',[0,-1,True,False,float('nan'),float('inf'),10**1000,'1',None])
def test_height_domain_is_strict_and_atomic(height):
    source=cube();before=deepcopy(source)
    with pytest.raises(GeometryError,match='height'):polyhedron_prism(source,height)
    assert source==before


@pytest.mark.parametrize('change',['dimension','embedding','existing-cells','open','wire','isolated','nonplanar','nonmanifold','double-sheet','vertex-fans','huge-coordinate','zero-edge'])
def test_invalid_or_unsupported_source_shells_are_diagnosed_without_mutation(change):
    source=cube()
    if change=='dimension':source['dimension']=2
    elif change=='embedding':source['embeddingDimension']=4;source['vertices']=[p+[0] for p in source['vertices']]
    elif change=='existing-cells':source['cells']=[list(range(6))]
    elif change=='open':source['faces'].pop()
    elif change=='wire':source['vertices'] += [[3,3,3],[4,3,3]];source['edges'].append([8,9])
    elif change=='isolated':source['vertices'].append([0,0,0])
    elif change=='nonplanar':source['vertices'][0][0]+=.25
    elif change=='nonmanifold':source['faces'].append(source['faces'][0][:])
    elif change=='double-sheet':source=model([[0,0,0],[1,0,0],[1,1,0],[0,1,0]],[[0,1,2,3],[3,2,1,0]])
    elif change=='vertex-fans':
        first=tetrahedron();second=[[1,1,1],[4,1,1],[1,4,1],[1,1,4]]
        vertices=first['vertices']+second[1:]
        remap=[0,4,5,6];faces=first['faces']+[[remap[i] for i in face] for face in first['faces']]
        source=model(vertices,faces)
    elif change=='huge-coordinate':source['vertices'][0][0]=10**1000
    elif change=='zero-edge':
        source=subdivide_edges(source,2);source['vertices'][8]=source['vertices'][source['edges'][0][0]][:]
    before=deepcopy(source)
    with pytest.raises(GeometryError):polyhedron_prism(source)
    assert source==before


@pytest.mark.parametrize('height',[1e-20,1e100,5e-324])
def test_unresolved_relative_four_dimensional_geometry_is_explicitly_rejected(height):
    with pytest.raises(GeometryError,match='numeric|planar|affine'):polyhedron_prism(cube(),height)


@pytest.mark.parametrize('scale',[1e-100,1e99])
def test_proportionate_scale_is_not_rejected_by_absolute_rank_threshold(scale):
    source=cube();source['vertices']=[[scale*x for x in p] for p in source['vertices']]
    result=polyhedron_prism(source,2*scale)
    assert np.allclose(np.asarray(result['vertices'])/scale,polyhedron_prism(cube(),2)['vertices'])
    assert_generalized(result)


@pytest.mark.parametrize('bound,value',[('MAX_PRISM_VERTICES',15),('MAX_ELEMENTS',20),('MAX_INCIDENCES',10),
                                        ('MAX_FACE_VERTICES',3),('MAX_COMPONENTS',1),('MAX_PAYLOAD_BYTES',1)])
def test_resource_limits_cover_incidence_components_faces_and_full_source_payload(monkeypatch,bound,value):
    monkeypatch.setattr('engine.prisms.'+bound,value)
    source=add_models(cube(),cube()) if bound=='MAX_COMPONENTS' else cube()
    with pytest.raises(GeometryError,match='resource'):polyhedron_prism(source)
