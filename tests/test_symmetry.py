from copy import deepcopy
import numpy as np
import pytest
from engine.geometry import hull, identity, canonical_cycle, GeometryError
from engine.generators import regular, generate
from engine.operations import transform
from engine.operations import signed_symmetry
from engine.symmetry import geometric_symmetry, generating_closure, cycle_rows


@pytest.mark.parametrize('key,order',[
    ('tetrahedron',24),('cube',48),('octahedron',48),
    ('dodecahedron',120),('icosahedron',120),
    ('truncated-tetrahedron',24),('truncated-icosidodecahedron',120)])
def test_full_groups_have_independent_known_orders_and_close(key,order):
    m=regular(key);original=deepcopy(m);g=geometric_symmetry(m)
    assert g['complete'] and g['closureVerified'] and g['order']==order
    assert g['properOrder']==order//2 and m==original
    actions={tuple(a['permutation']) for a in g['actions']}
    for a in actions:
        for b in actions:
            assert tuple(a[b[i]] for i in range(len(a))) in actions


def test_group_conjugacy_survives_arbitrary_rotation_translation_and_scale():
    q,_=np.linalg.qr(np.array([[1,2,4],[3,-2,1],[-1,3,2]],dtype=float))
    source=regular('icosahedron')
    original=geometric_symmetry(source)
    m=transform(source,matrix=q,scale=1e-9,translation=[2e-8,-4e-8,3e-8])
    changed=geometric_symmetry(m)
    assert changed['order']==120 and changed['complete']
    assert {tuple(a['permutation']) for a in changed['actions']}=={tuple(a['permutation']) for a in original['actions']}
    for a in changed['actions']:
        p=np.asarray(m['vertices']);center=np.asarray(changed['center'])
        assert np.max(abs((p-center)@np.asarray(a['matrix']).T+center-p[a['permutation']]))<1e-15


def test_metric_and_source_incidence_both_constrain_the_group():
    m=generate('block',sizes=[2,3,4])
    assert geometric_symmetry(m)['order']==8
    asymmetric=hull([[0,0,0],[1,0,0],[0,2,0],[0,0,3]])
    assert geometric_symmetry(asymmetric)['order']==1
    m=regular('icosahedron');m['interpretation']='generalized-complex'
    # Delete one face: only the six symmetries stabilizing that triangle remain.
    m['faces']=m['faces'][1:];m['fingerprint']=identity(m)
    assert geometric_symmetry(m)['order']==6


def test_finite_polygon_group_and_resource_limit_are_explicit():
    assert geometric_symmetry(generate('polygon',n=7))['order']==14
    g=geometric_symmetry(regular('cube'),max_frames=1)
    assert not g['complete'] and g['termination']=='frame-limit' and g['closureVerified'] is None


def test_signed_subgroup_uses_cell_face_incidence_and_metric_completeness():
    source=regular('cell24');source['metadata']['key']='tesseract'
    assert not signed_symmetry(source)['complete']
    source=regular('tesseract');source['metadata']={}
    assert signed_symmetry(source)['complete']
    source['interpretation']='generalized-complex'
    # An additional open generalized 3-cell uses the same eight vertices as
    # an existing cube cell, but only five of its faces. Vertex unions alone
    # see the unchanged eight cell vertex sets and miss this distinction.
    source['cells'].append(source['cells'][0][:-1])
    group=signed_symmetry(source)
    assert group['order']==8 and not group['complete']


@pytest.mark.parametrize('key,order',[
    ('simplex4',120),('tesseract',384),('cross4',384),('cell24',1152),('cell600',14400),('cell120',14400)])
def test_all_regular_4d_groups_exhaust_frames_and_preserve_complete_incidence(key,order):
    # Independent orders: Heckman, Coxeter Groups, section 1.3, examples 1.24-1.27.
    source=regular(key);before=deepcopy(source);group=geometric_symmetry(source)
    assert group['order']==order and group['properOrder']==order//2
    assert group['complete'] and group['closureVerified'] and group['termination']=='exhausted' and source==before
    assert group['sourceFingerprint']==identity(source)
    assert group['closureTransitionsChecked']<order*order
    for kind,field in [('vertex','vertices'),('edge','edges'),('face','faces'),('cell','cells')]:
        assert len(group['entityOrbits'][kind])==1
        orbit=group['entityOrbits'][kind][0]
        assert orbit['ids']==list(range(len(source[field]))) and orbit['stabilizerOrder']==order//len(source[field])
    # Independent scalar cycle/cell check, not the optimized integer-row verifier.
    edge_set={tuple(sorted(e)) for e in source['edges']}
    face_set={canonical_cycle(f) for f in source['faces']}
    cell_set={tuple(sorted(canonical_cycle(source['faces'][f]) for f in c)) for c in source['cells']}
    ids=set(group['generatorIndices']+[group['identityIndex'],0,len(group['actions'])//2,len(group['actions'])-1])
    points=np.asarray(source['vertices']);center=np.asarray(group['center'])
    for index in ids:
        action=group['actions'][index];permutation=action['permutation'];matrix=np.asarray(action['matrix'])
        assert np.max(abs((points-center)@matrix.T+center-points[permutation]))<1e-7
        assert {tuple(sorted(permutation[i] for i in e)) for e in source['edges']}==edge_set
        mapped_faces=[canonical_cycle([permutation[i] for i in f]) for f in source['faces']]
        assert set(mapped_faces)==face_set
        assert {tuple(sorted(mapped_faces[f] for f in c)) for c in source['cells']}==cell_set
    # Whole permutations of sampled products must occur, in addition to frame closure.
    action_set={tuple(a['permutation']) for a in group['actions']}
    for ia in ids:
        for ib in ids:
            a,b=group['actions'][ia]['permutation'],group['actions'][ib]['permutation']
            assert tuple(a[b[i]] for i in range(len(a))) in action_set


def test_rotated_4d_groups_do_not_depend_on_axes_or_catalog_labels():
    q,_=np.linalg.qr(np.array([[1,2,4,-1],[3,-2,1,2],[-1,3,2,4],[2,1,-3,2]],dtype=float))
    original=regular('cell24');original['metadata']={'key':'tesseract'}
    base=geometric_symmetry(original)
    for scale in (1e-9,1e9):
        source=transform(original,matrix=q,scale=scale,translation=np.array([2,-4,3,7])*scale)
        group=geometric_symmetry(source)
        assert group['complete'] and group['order']==1152 and group['properOrder']==576
        assert {tuple(a['permutation']) for a in group['actions']}=={tuple(a['permutation']) for a in base['actions']}
        assert signed_symmetry(source)['order']<group['order']


@pytest.mark.parametrize('kind,index,order',[('vertex',0,24),('edge',0,12),('face',0,16),('cell',0,48)])
def test_setwise_entity_stabilizers_and_proper_restrictions(kind,index,order):
    source=regular('tesseract');group=geometric_symmetry(source,stabilize={'kind':kind,'index':index})
    proper=geometric_symmetry(source,orientation='proper',stabilize={'kind':kind,'index':index})
    assert group['order']==order and group['unrestrictedVerifiedOrder']==384 and group['closureVerified']
    assert proper['order']==proper['properOrder']==order//2 and proper['complete']
    assert any(orbit['ids']==[index] and orbit['stabilizerOrder']==order for orbit in group['entityOrbits'][kind])
    assert proper['stabilizedEntity']=={'kind':kind,'index':index}


def test_4d_full_group_preserves_cell_face_topology_and_partial_status():
    source=regular('tesseract');source['interpretation']='generalized-complex'
    source['cells'].append(source['cells'][0][:-1])
    assert geometric_symmetry(source)['order']==8
    source=regular('cell24');partial=geometric_symmetry(source,max_frames=3)
    assert not partial['complete'] and partial['entityOrbits'] is None and partial['closureVerified'] is None
    assert not partial['generatorIndices'] and partial['order']<=3
    with pytest.raises(GeometryError):geometric_symmetry(source,stabilize={'kind':'cell','index':24})
    with pytest.raises(GeometryError):geometric_symmetry(source,orientation='improper')


def test_4d_group_uses_realized_metric_and_protocol_defaults_to_full_frames():
    from engine.server import dispatch
    orthotope=transform(regular('tesseract'),matrix=np.diag([2,3,4,5]))
    group=dispatch({'op':'symmetry','model':orthotope})
    assert group['order']==16 and group['complete'] and group['method'].startswith('exhaustive')
    source=regular('cell24');signed=dispatch({'op':'symmetry','model':source,'params':{'method':'signed-axis'}})
    assert signed['order']==384 and not signed['complete']
    with pytest.raises(GeometryError):dispatch({'op':'symmetry','model':source,'params':{'method':'signed-axis','orientation':'proper'}})
    asymmetric=hull([[0,0,0,0],[1,0,0,0],[0,2,0,0],[0,0,3,0],[0,0,0,4]])
    assert geometric_symmetry(asymmetric)['order']==1


def test_generator_closure_refuses_non_group_and_vector_cycles_preserve_winding():
    source=regular('cube');group=geometric_symmetry(source)
    # A finite nonclosed subset cannot acquire a closure claim from generators.
    unit=list(range(len(source['vertices'])))
    order_three=next(a for a in group['actions'] if a['permutation']!=unit and [a['permutation'][a['permutation'][a['permutation'][i]]] for i in unit]==unit)
    selected=[group['actions'][group['identityIndex']],order_three]
    with pytest.raises(GeometryError):generating_closure(selected,group['basisVertexIds'],len(source['vertices']))
    rows=[[0,3,1,4,2],[3,1,4,2,0],[0,2,4,1,3]]
    assert [tuple(row) for row in cycle_rows(rows)]==[canonical_cycle(row) for row in rows]
    assert tuple(cycle_rows([[0,1,2,3,4]])[0])!=tuple(cycle_rows([rows[0]])[0])
    duplicate=regular('icosahedron');duplicate['interpretation']='generalized-complex';duplicate['faces'].append(duplicate['faces'][0])
    with pytest.raises(GeometryError,match='ambiguous'):geometric_symmetry(duplicate)


def test_user_generators_exhaust_requested_subgroups_with_source_action_correspondence():
    source=regular('tesseract');full=geometric_symmetry(source)
    matrix=np.diag([-1,1,1,1]);reflection=next(i for i,a in enumerate(full['actions']) if np.max(abs(np.asarray(a['matrix'])-matrix))<1e-8)
    group=geometric_symmetry(source,generator_ids=[reflection])
    assert group['order']==2 and group['properOrder']==1 and group['closureVerified']
    assert group['requestedGeneratorIds']==[reflection] and group['unrestrictedVerifiedOrder']==384
    assert {a['sourceActionId'] for a in group['actions']}=={full['identityIndex'],reflection}
    assert all(o['size']==2 and o['stabilizerOrder']==1 for o in group['entityOrbits']['vertex'])
    identity_group=geometric_symmetry(source,generator_ids=[])
    assert identity_group['order']==1 and len(identity_group['entityOrbits']['vertex'])==16
    regenerated=geometric_symmetry(source,generator_ids=full['generatorIndices'])
    assert regenerated['order']==384 and {tuple(a['permutation']) for a in regenerated['actions']}=={tuple(a['permutation']) for a in full['actions']}
    with pytest.raises(GeometryError):geometric_symmetry(source,orientation='proper',generator_ids=[reflection])
    with pytest.raises(GeometryError):geometric_symmetry(source,max_frames=2,generator_ids=[])
    with pytest.raises(GeometryError):geometric_symmetry(source,generator_ids=[384])
    with pytest.raises(GeometryError):geometric_symmetry(source,generator_ids=[1,1])
