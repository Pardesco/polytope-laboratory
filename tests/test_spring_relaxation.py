"""Independent analytic/ownership checks for the versioned spring core."""
from copy import deepcopy
import math
import json

import numpy as np
import pytest

from engine.geometry import GeometryError,identity
from engine import spring_relaxation as spring


def tetra():
    return {'id':'literal-tetra','name':'Literal tetrahedron','dimension':3,'embeddingDimension':3,
            'vertices':[[1,1,1],[1,-1,-1],[-1,1,-1],[-1,-1,1]],
            'edges':[[2,3],[0,2],[1,3],[0,1],[0,3],[1,2]],
            'faces':[[2,1,0],[3,0,1],[2,3,0],[3,2,1]],'cells':[],
            'metadata':{'coordinateUnits':'mm','offColors':{
                'vertices':[None,{'encoding':'byte','values':[3,17,255,90]},None,None],
                'faces':[{'encoding':'unit','values':[.1,.2,.7,.35]},None,
                         {'encoding':'byte','values':[55,180,11,128]},None],'cells':[]},
                'arbitraryHistoricalAttribute':{'literal':[2,None,'saved']}},
            'numeric':{'mode':'float64-approximate'},'unusedCache':{'old':True}}


def cube():
    p=[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]]
    faces=[[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]]
    return {'id':'literal-cube','dimension':3,'embeddingDimension':3,'vertices':p,
            'edges':[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]],
            'faces':faces,'cells':[]}


def pins(source):return [{'vertex':i,'position':p} for i,p in enumerate(source['vertices'])]
def distances(p,edges):return np.array([np.linalg.norm(p[a]-p[b]) for a,b in edges])
def result_points(result):return np.array(result['model']['vertices'])
def valid_binding(result,source):assert spring.verify_spring_candidate(result,source)['passed']


def test_perturbed_tetra_all_six_metric_constraints_and_literal_attributes():
    source=tetra();source['vertices'][0]=[1.13,.87,1.04];before=deepcopy(source)
    result=spring.relax_spring_network(source,{'regular_faces':True})
    assert result['status']=='constraints-satisfied';assert source==before
    p=result_points(result);np.testing.assert_allclose(distances(p,source['edges']),1,atol=1e-8)
    volume=abs(np.linalg.det(np.array([p[i]-p[0] for i in [1,2,3]])))/6
    assert volume==pytest.approx(math.sqrt(2)/12,abs=1e-8)
    for face in source['faces']:
        area=np.linalg.norm(np.cross(p[face[1]]-p[face[0]],p[face[2]]-p[face[0]]))/2
        assert area==pytest.approx(math.sqrt(3)/4,abs=1e-8)
    np.testing.assert_allclose(p.mean(axis=0),np.array(source['vertices']).mean(axis=0),atol=1e-12)
    model=result['model'];receipt=result['evidence']
    assert model['edges']==source['edges'] and model['faces']==source['faces'] and model['cells']==[]
    assert model['metadata']['offColors']==source['metadata']['offColors']
    assert model['metadata']['coordinateUnits']=='mm' and receipt['sourceModel']==source
    assert 'unusedCache' not in model and 'components' not in model and not result['uniform']
    assert receipt['maps']=={'vertices':list(range(4)),'edges':list(range(6)),'faces':list(range(4))}
    valid_binding(result,source)


def test_regular_face_pair_constraints_repair_nonplanar_cube_without_hull():
    source=cube();source['vertices'][0]=[-.94,-1.09,-.87]
    result=spring.relax_spring_network(source,{'regular_faces':True})
    assert result['status']=='constraints-satisfied'
    p=result_points(result);np.testing.assert_allclose(distances(p,source['edges']),1,atol=1e-8)
    for face in source['faces']:
        assert np.linalg.norm(p[face[0]]-p[face[2]])==pytest.approx(math.sqrt(2),abs=1e-8)
        assert abs(np.dot(np.cross(p[face[1]]-p[face[0]],p[face[2]]-p[face[0]]),p[face[3]]-p[face[0]]))<1e-8
    assert abs(np.linalg.det(np.array([p[i]-p[0] for i in [1,3,4]])))==pytest.approx(1,abs=1e-8)
    assert result['model']['faces']==source['faces'];valid_binding(result,source)


@pytest.mark.parametrize('seed',[0,19,4294967295])
def test_seeded_random_starts_are_repeatable_with_reported_pcg64_seed(seed):
    source=tetra();options={'initialization':'random','seed':seed,'regular_faces':True}
    a=spring.relax_spring_network(source,options);b=spring.relax_spring_network(source,options)
    assert a['model']['vertices']==b['model']['vertices'] and a['model']['id']==b['model']['id']
    assert a['evidence']['initialNormalizedVertices']==b['evidence']['initialNormalizedVertices']
    assert a['evidence']['implementation']['randomGenerator']=='numpy.PCG64/default_rng'
    assert a['status']=='constraints-satisfied';np.testing.assert_allclose(distances(result_points(a),source['edges']),1,atol=1e-8)
    valid_binding(a,source)


def test_source_vs_random_start_and_different_seeds_do_not_claim_same_isomer():
    source=tetra()
    a=spring.relax_spring_network(source,{'initialization':'random','seed':1,'max_evaluations':1})
    b=spring.relax_spring_network(source,{'initialization':'random','seed':2,'max_evaluations':1})
    c=spring.relax_spring_network(source,{'max_evaluations':1})
    assert a['evidence']['initialNormalizedVertices']!=b['evidence']['initialNormalizedVertices']!=c['evidence']['initialNormalizedVertices']
    assert a['status']=='evaluation-limit' and not a['evidence']['requestedConstraintsSatisfied']
    assert a['evidence']['geometricValidity']['isomerClassificationPerformed'] is False


def test_conflicting_duplicate_springs_report_independent_weighted_compromise():
    source=tetra();options={'extra_springs':[{'vertices':[2,3],'length':5/3,'weight':3}]}
    result=spring.relax_spring_network(source,options)
    assert result['status']=='stationary-residual' and not result['uniform']
    # E=(d-1)^2/2+3(d-5/3)^2/2 minimized at d=3/2; the other five unit edges are feasible.
    d=np.linalg.norm(result_points(result)[2]-result_points(result)[3])
    assert d==pytest.approx(1.5,abs=2e-6)
    residual=result['evidence']['residuals']
    assert residual['maximumAbsoluteNormalizedResidual']==pytest.approx(.5,abs=2e-6)
    assert residual['weightedSpringEnergy']==pytest.approx(1/6,abs=2e-6)
    assert [r['owner']['kind'] for r in residual['perConstraint']]==['edge']*6+['extra']
    valid_binding(result,source)


def test_all_pinned_residual_is_not_convergence_or_uniformity():
    source=tetra();result=spring.relax_spring_network(source,{'pins':pins(source),'edge_weights':[1e-12]*6})
    assert result['status']=='stationary-residual'
    assert result['model']['vertices']==source['vertices']
    assert result['evidence']['solverTermination']['evaluations']==1
    assert result['evidence']['residuals']['maximumAbsoluteNormalizedResidual']==pytest.approx(math.sqrt(8)-1)
    assert not result['evidence']['requestedConstraintsSatisfied']
    valid_binding(result,source)


def test_exact_pins_and_component_center_are_not_optimizer_variables():
    source=tetra();options={'pins':[{'vertex':0,'position':[.1,.2,.3]}]}
    result=spring.relax_spring_network(source,options)
    assert result['model']['vertices'][0]==[.1,.2,.3]
    np.testing.assert_allclose(distances(result_points(result),source['edges']),1,atol=1e-8)
    valid_binding(result,source)


@pytest.mark.parametrize('scale,translation',[(1e-50,[0,0,0]),(1e50,[0,0,0]),(2,[7,-9,11])])
def test_source_unit_scale_and_rigid_frame_equivariance(scale,translation):
    source=tetra();rotation=np.array([[0,-1,0],[1,0,0],[0,0,-1]])
    source['vertices']=(np.array(source['vertices'])@rotation.T*scale+translation).tolist()
    result=spring.relax_spring_network(source,{'edge_length':scale})
    assert result['status']=='constraints-satisfied'
    np.testing.assert_allclose(distances(result_points(result),source['edges'])/scale,1,atol=1e-8)
    valid_binding(result,source)


def test_coincident_disconnected_components_are_not_welded():
    a=tetra();source=deepcopy(a);source['id']='two-coincident-tetra';source.pop('metadata')
    source['vertices']+=deepcopy(a['vertices']);source['edges'] += [[v+4 for v in e] for e in a['edges']]
    source['faces'] += [[v+4 for v in f] for f in a['faces']]
    result=spring.relax_spring_network(source)
    assert result['status']=='constraints-satisfied' and len(result['model']['vertices'])==8
    assert result['evidence']['componentVertexIds']==[[0,1,2,3],[4,5,6,7]]
    assert result['model']['faces']==source['faces'];valid_binding(result,source)


@pytest.mark.parametrize('step',[2,-2,3])
def test_literal_closed_star_prism_face_ratios_signed_winding_and_heterogeneous_edges(step):
    n=5;angles=[2*math.pi*(step*i % n)/n for i in range(n)];radius=1/(2*abs(math.sin(math.pi*step/n)))
    points=[[radius*math.cos(t),radius*math.sin(t),z] for z in [-.5,.5] for t in angles]
    edges=[[i,(i+1)%n] for i in range(n)]+[[n+i,n+(i+1)%n] for i in range(n)]+[[i,n+i] for i in range(n)]
    faces=[list(reversed(range(n))),list(range(n,2*n))]+[[i,(i+1)%n,n+(i+1)%n,n+i] for i in range(n)]
    source={'id':'literal-star-'+str(step),'dimension':3,'embeddingDimension':3,'vertices':points,'edges':edges,'faces':faces,'cells':[]}
    result=spring.relax_spring_network(source,{'regular_faces':True,'face_steps':[step,step]+[1]*n,'pins':pins(source)})
    assert result['status']=='constraints-satisfied';assert result['model']['faces']==faces
    rows=result['evidence']['springs'];cap=[r for r in rows if r['owner'].get('id')==1 and r['owner']['kind']=='face']
    expected=abs(math.sin(2*math.pi*step/n)/math.sin(math.pi*step/n))
    assert next(r for r in cap if r['owner']['corners']==[0,2])['length']==pytest.approx(expected)
    assert result['model']['interpretation']=='generalized-complex';valid_binding(result,source)


@pytest.mark.parametrize('how',['before','progress','final'])
def test_cancellation_never_publishes_even_an_initially_satisfied_candidate(how):
    source=tetra();before=deepcopy(source);state={'cancel':how=='before','calls':0}
    def cancel():
        state['calls']+=1
        return state['cancel'] or (how=='final' and state['calls']>=12)
    def progress(_):
        if how=='progress':state['cancel']=True
    with pytest.raises(GeometryError,match='canceled'):spring.relax_spring_network(source,cancel=cancel,progress=progress)
    assert source==before


@pytest.mark.parametrize('field',['vertices','faceColor','unit','history'])
def test_source_edits_during_numeric_await_equivalent_progress_refuse_publication(field):
    source=tetra()
    def progress(_):
        if field=='vertices':source['vertices'][0][0]=2
        elif field=='faceColor':source['metadata']['offColors']['faces'][0]['values'][3]=.9
        elif field=='unit':source['metadata']['coordinateUnits']='cm'
        else:source['metadata']['arbitraryHistoricalAttribute']['literal'][0]=3
    with pytest.raises(GeometryError,match='source.*changed'):spring.relax_spring_network(source,progress=progress)


def test_recorded_solver_rejects_clock_budget_as_a_saved_control():
    with pytest.raises(GeometryError,match='Unsupported spring controls'):
        spring.relax_spring_network(tetra(),{'max_seconds':1})


def test_visit_cap_is_explicit_and_no_silent_constraints_prefix(monkeypatch):
    source=tetra();monkeypatch.setitem(spring.LIMITS,'springVisits',6)
    result=spring.relax_spring_network(source)
    assert result['status']=='resource-limited'
    assert result['evidence']['solverTermination']['message']=='spring-visit-limit'
    assert len(result['evidence']['springs'])==6 and result['evidence']['work']['springVisits']==6


def test_compiled_spring_cap_refuses_entire_request_before_solver(monkeypatch):
    source=cube();before=deepcopy(source);called=[]
    monkeypatch.setitem(spring.LIMITS,'springs',13)
    monkeypatch.setattr(spring,'least_squares',lambda *a,**k:called.append(True))
    with pytest.raises(GeometryError,match='compiled constraint cap'):spring.relax_spring_network(source,{'regular_faces':True})
    assert not called and source==before


@pytest.mark.parametrize('collapse',['plane','point','nonplanar'])
def test_invalid_realizations_are_only_nonpublishable_previews(collapse):
    source=tetra() if collapse!='nonplanar' else cube()
    for i,p in enumerate(source['vertices']):
        if collapse=='plane':p[2]=0
        elif collapse=='point':source['vertices'][i]=[0,0,0]
    if collapse=='nonplanar':source['vertices'][0][0]+=.3
    result=spring.relax_spring_network(source,{'pins':pins(source)})
    assert result['status']=='invalid-realization' and result['model'] is None
    assert result['preview']['publishable'] is False and result['preview']['faces']==source['faces']
    assert not result['evidence']['geometricValidity']['passed']
    with pytest.raises(GeometryError,match='invalid preview'):spring.verify_spring_candidate(result,source)


@pytest.mark.parametrize('change',[
    lambda s:s.__setitem__('dimension',4),lambda s:s.__setitem__('dimension',3.),
    lambda s:s.__setitem__('embeddingDimension',4),lambda s:s['faces'].pop(),
    lambda s:s['edges'].append([0,1]),lambda s:s['edges'][0].__setitem__(0,True),
    lambda s:s['faces'][0].__setitem__(0,2.),lambda s:s['vertices'][0].__setitem__(0,float('nan')),
    lambda s:s['vertices'][0].__setitem__(0,10**500),lambda s:s['metadata'].__setitem__('coordinateUnits','furlong'),
    lambda s:s['metadata']['offColors']['faces'][0]['values'].__setitem__(3,1.1),
    lambda s:s['metadata']['offColors']['vertices'].pop(),lambda s:s.__setitem__('id',''),
])
def test_malformed_source_refused_without_mutation(change):
    source=tetra();change(source);before=deepcopy(source)
    with pytest.raises(GeometryError):spring.relax_spring_network(source)
    assert json.dumps(source,sort_keys=True)==json.dumps(before,sort_keys=True)


@pytest.mark.parametrize('options',[
    {'unknown':1},{'seed':True},{'seed':2**32},{'random_scale':0},{'regular_faces':1},
    {'edge_length':10**500},{'edge_length':float('inf')},{'edge_length':0},
    {'edge_lengths':[1]*5},{'edge_weights':[0]*6},{'max_evaluations':2001},
    {'solver_tolerance':0},{'residual_tolerance':0},{'max_seconds':121},
    {'face_steps':[1,1,1,0]},{'face_steps':[1,1,1,3]},{'face_weights':[1]},
    {'extra_springs':[{'vertices':[0,0],'length':1,'weight':1}]},
    {'extra_springs':[{'vertices':[0,1],'length':1,'weight':1,'unknown':0}]},
    {'pins':[{'vertex':0,'position':[0,0,0]},{'vertex':0,'position':[1,0,0]}]},
    {'pins':[{'vertex':4,'position':[0,0,0]}]},
    {'edge_length':1e-100,'edge_lengths':[1]*6},
])
def test_malformed_controls_are_not_silently_ignored(options):
    with pytest.raises(GeometryError):spring.relax_spring_network(tetra(),options)


def test_cyclic_non_json_source_and_cancel_hook_return_refuse():
    source=tetra();source['metadata']['self']=source
    with pytest.raises(GeometryError):spring.relax_spring_network(source)
    with pytest.raises(GeometryError,match='boolean'):spring.relax_spring_network(tetra(),cancel=lambda:1)


@pytest.mark.parametrize('change',[
    lambda r:r['model']['faces'][0].reverse(),
    lambda r:r['model']['metadata'].__setitem__('coordinateUnits','cm'),
    lambda r:r['model']['metadata']['offColors']['faces'][0]['values'].__setitem__(3,.9),
    lambda r:r['evidence']['residuals'].__setitem__('weightedSpringEnergy',42),
    lambda r:r['evidence']['springs'][0].__setitem__('length',2),
    lambda r:r['evidence']['sourceModel']['metadata']['arbitraryHistoricalAttribute'].__setitem__('literal',[2]),
    lambda r:r['evidence']['maps']['faces'].reverse(),
    lambda r:r.__setitem__('uniform',True),
    lambda r:r['model'].__setitem__('fingerprint','bad'),
])
def test_publication_verifier_rejects_forged_geometry_attributes_maps_and_metrics(change):
    source=tetra();result=spring.relax_spring_network(source);change(result)
    with pytest.raises(GeometryError):spring.verify_spring_candidate(result,source)


def test_independent_expected_source_binding_rejects_same_geometry_changed_attributes():
    source=tetra();result=spring.relax_spring_network(source);other=deepcopy(source)
    other['metadata']['coordinateUnits']='cm'
    assert identity(source)==identity(other)
    with pytest.raises(GeometryError,match='source binding'):spring.verify_spring_candidate(result,other)


def test_requested_controls_edits_during_progress_refuse_inconsistent_provenance():
    source=tetra();options={'edge_length':1}
    def progress(_):options['edge_length']=2
    with pytest.raises(GeometryError,match='requested controls changed'):
        spring.relax_spring_network(source,options,progress=progress)


@pytest.mark.parametrize('n,m',[(4,4),(12,12)])
def test_closed_toroidal_source_keeps_literal_genus_and_distinct_face_targets(n,m):
    points=[]
    for i in range(n):
        theta=2*math.pi*i/n
        for j in range(m):
            phi=2*math.pi*j/m;r=3+math.cos(phi)
            points.append([r*math.cos(theta),r*math.sin(theta),math.sin(phi)])
    index=lambda i,j:(i%n)*m+j%m
    faces=[[index(i,j),index(i+1,j),index(i+1,j+1),index(i,j+1)] for i in range(n) for j in range(m)]
    edges=[[index(i,j),index(i+1,j)] for i in range(n) for j in range(m)]+[[index(i,j),index(i,j+1)] for i in range(n) for j in range(m)]
    source={'id':'literal-torus-'+str(n),'dimension':3,'embeddingDimension':3,'vertices':points,'edges':edges,'faces':faces,'cells':[]}
    assert len(points)-len(edges)+len(faces)==0
    lengths=distances(np.array(points),edges).tolist()
    result=spring.relax_spring_network(source,{'pins':pins(source),'edge_lengths':lengths})
    assert result['status']=='constraints-satisfied';assert result['model']['faces']==faces and result['model']['edges']==edges
    assert len(result['evidence']['componentVertexIds'])==1
    assert result['evidence']['geometricValidity']['selfIntersectionChecked'] is False
    valid_binding(result,source)


def test_spatial_cage_supplemental_diagonal_springs_are_literal_source_pairs():
    source=cube();options={'edge_length':2,'extra_springs':[
        {'vertices':[0,6],'length':2*math.sqrt(3),'weight':1},
        {'vertices':[1,7],'length':2*math.sqrt(3),'weight':1}],
        'regular_faces':True,'pins':pins(source)}
    result=spring.relax_spring_network(source,options)
    assert result['status']=='constraints-satisfied'
    assert [r['vertices'] for r in result['evidence']['springs'][-2:]]==[[0,6],[1,7]]
    assert [r['normalizedDistance'] for r in result['evidence']['residuals']['perConstraint'][-2:]]==pytest.approx([math.sqrt(3)]*2)
    valid_binding(result,source)


def test_pin_positions_are_preserved_exactly_under_nonzero_origin_and_scale():
    source=tetra();source['vertices']=(np.array(source['vertices'])*3+[11,-7,5]).tolist()
    position=[.17,-.23,.37]
    result=spring.relax_spring_network(source,{'edge_length':2,'pins':[{'vertex':0,'position':position}]})
    assert result['model']['vertices'][0]==position;valid_binding(result,source)


def test_large_translation_rounding_never_claims_a_feasible_collapsed_physical_result():
    source=tetra();source['vertices']=(np.array(source['vertices'])*1e-20+[1,1,1]).tolist()
    result=spring.relax_spring_network(source,{'edge_length':1e-20,'pins':pins(source)})
    assert result['status']=='invalid-realization'
    assert result['evidence']['residuals']['maximumAbsoluteNormalizedResidual']==1
    assert result['preview']['publishable'] is False


def test_cancel_is_polled_during_report_face_validation(monkeypatch):
    source=cube();state={'validating':False}
    original=spring._validity
    def validity(*args,**kwargs):
        state['validating']=True;return original(*args,**kwargs)
    monkeypatch.setattr(spring,'_validity',validity)
    with pytest.raises(GeometryError,match='canceled'):
        spring.relax_spring_network(source,{'pins':pins(source)},cancel=lambda:state['validating'])


def test_output_and_source_resource_bounds_refuse_atomic_payloads(monkeypatch):
    source=tetra();before=deepcopy(source)
    monkeypatch.setitem(spring.LIMITS,'outputBytes',1024)
    with pytest.raises(GeometryError):spring.relax_spring_network(source)
    assert source==before


def test_maximum_source_vertex_bound_refuses_before_any_solver():
    source=tetra();source['vertices'] += [[2,3,4]]*253
    with pytest.raises(GeometryError,match='vertices resource bound'):spring.relax_spring_network(source)


@pytest.mark.parametrize('change',[
    lambda r:r['model']['metadata']['offColors']['faces'][2]['values'].__setitem__(0,55.),
    lambda r:r['evidence']['sourceModel']['metadata']['arbitraryHistoricalAttribute']['literal'].__setitem__(0,True),
    lambda r:r['model']['edges'][0].__setitem__(0,2.),
    lambda r:r['evidence']['residuals']['perConstraint'][0].__setitem__('weight',True),
    lambda r:r['evidence']['initialNormalizedVertices'][0].__setitem__(0,5),
    lambda r:r.__setitem__('status','stationary-residual'),
])
def test_verifier_preserves_json_numeric_types_initialization_and_truthful_status(change):
    source=tetra();result=spring.relax_spring_network(source);change(result)
    with pytest.raises(GeometryError):spring.verify_spring_candidate(result,source)


def test_verifier_cannot_relabel_unresolved_targets_as_converged():
    source=tetra();result=spring.relax_spring_network(source,{'pins':pins(source)})
    result['status']='constraints-satisfied'
    with pytest.raises(GeometryError,match='falsely reports'):spring.verify_spring_candidate(result,source)


def test_supplemental_bridge_preserves_one_constraint_gauge_not_two_source_centroids():
    a=tetra();source=deepcopy(a);source.pop('metadata');source['id']='two-linked-tetras'
    p=np.array(a['vertices'])/math.sqrt(8)
    source['vertices']=np.vstack([p+[-5,0,0],p+[5,0,0]]).tolist()
    source['edges'] += [[v+4 for v in e] for e in a['edges']]
    source['faces'] += [[v+4 for v in f] for f in a['faces']]
    result=spring.relax_spring_network(source,{'extra_springs':[{'vertices':[0,4],'length':2,'weight':1}]})
    assert result['status']=='constraints-satisfied'
    solved=result_points(result);np.testing.assert_allclose(distances(solved,source['edges']),1,atol=1e-8)
    assert np.linalg.norm(solved[0]-solved[4])==pytest.approx(2,abs=1e-8)
    np.testing.assert_allclose(solved.mean(axis=0),np.array(source['vertices']).mean(axis=0),atol=1e-12)
    assert np.linalg.norm(solved[:4].mean(axis=0)-np.array([-5,0,0]))>1
    assert result['evidence']['componentVertexIds']==[[0,1,2,3],[4,5,6,7]]
    assert result['evidence']['constraintComponentVertexIds']==[list(range(8))]
    assert result['model']['faces']==source['faces'];valid_binding(result,source)
