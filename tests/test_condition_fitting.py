"""Independent geometry, refusal, and persisted condition-fit evidence."""
from copy import deepcopy
import math

import numpy as np
import pytest

from engine.condition_fitting import near_miss_deviation
from engine.geometric_fitting import fit_geometry, dispatch_geometry_fit
from engine.generators import regular
from engine.geometry import GeometryError, hull, identity
from engine.formats import save_project, load_file
from engine.recipes import run_recipe, replay_document
from engine import server


def perturbed(key):
    source=regular(key);p=np.asarray(source['vertices'])
    source['vertices']=(p+np.random.default_rng(123).normal(0,.015,p.shape)).tolist()
    return source


def mean_edge(model):
    p=np.asarray(model['vertices']);e=np.asarray(model['edges'])
    return float(np.linalg.norm(p[e[:,0]]-p[e[:,1]],axis=1).mean())


def johnson():
    return hull([[-.5,-.5,0],[.5,-.5,0],[.5,.5,0],[-.5,.5,0],[0,0,math.sqrt(.5)]],'J1 square pyramid')


@pytest.mark.parametrize('key',['cube','icosahedron'])
def test_perturbed_regular_faces_restore_independent_edges_angles_planes(key):
    source=perturbed(key);before=deepcopy(source)
    packet=fit_geometry(source,{'objectives':['regular-faces'],'max_evaluations':80})
    result=packet['model'];e=packet['evidence'];p=np.asarray(result['vertices'])
    assert e['converged'] and e['toleranceMet'] and result['validation']['passed']
    for face in source['faces']:
        q=p[face];sides=np.linalg.norm(q-np.roll(q,-1,axis=0),axis=1)
        assert np.ptp(sides)<1e-7
        a=np.roll(q,1,axis=0)-q;b=np.roll(q,-1,axis=0)-q
        angles=np.arccos(np.sum(a*b,axis=1)/(np.linalg.norm(a,axis=1)*np.linalg.norm(b,axis=1)))
        assert max(abs(angles-(len(face)-2)*math.pi/len(face)))<1e-7
        if len(face)>3:assert np.linalg.svd(q-q.mean(axis=0),compute_uv=False)[2]<1e-7
    assert mean_edge(result)==pytest.approx(mean_edge(source),rel=1e-12)
    assert source==before and result['faces']==source['faces'] and result['edges']==source['edges']
    for key in ('regular-faces','face-angles','face-edges','planar-faces','equal-edges','equal-areas'):
        assert set(e['conditions'][key])=={'before','after'}
        assert set(e['conditions'][key]['before'])=={'maximum','rms'}
    assert not e['certified'] and not e['uniformityEstablished']


def test_johnson_with_different_face_areas_stays_regular():
    source=johnson();result=fit_geometry(source,{'objectives':['regular-faces']})
    assert result['evidence']['converged']
    assert np.max(np.abs(np.asarray(result['model']['vertices'])-source['vertices']))<1e-10
    deviation=near_miss_deviation(result['model'])
    assert deviation['nearlyRegularFaces'] and deviation['maximumFaceAngleDeviationDegrees']<1e-6
    assert deviation['conditions']['equal-areas']['maximum']>.1


def test_existing_mode_api_also_repairs_warped_sources():
    packet=fit_geometry(perturbed('cube'),{'mode':'regular-faces'})
    assert packet['evidence']['converged'] and packet['model']['validation']['passed']


def test_impossible_symmetric_heptagonal_bipyramid_exposes_stationary_non_solution():
    n=7;source=hull([[math.cos(i*2*math.pi/n),math.sin(i*2*math.pi/n),0] for i in range(n)]+[[0,0,1],[0,0,-1]],'Heptagonal bipyramid')
    params={'objectives':['regular-faces'],'keep_symmetry':True,'max_evaluations':100}
    packet=dispatch_geometry_fit({'op':'geometry-fit-preview','model':source,'params':params});e=packet['evidence']
    assert not e['converged'] and not e['toleranceMet']
    assert e['solverTermination']['success'] and e['residuals']['maximum']>.01
    assert e['conditions']['regular-faces']['after']['rms']>.01
    assert e['symmetry']['order']==28 and e['symmetry']['complete']
    with pytest.raises(GeometryError,match='remain unresolved'):
        dispatch_geometry_fit({'op':'geometry-fit','model':source,'params':params})
    adopted=dispatch_geometry_fit({'op':'geometry-fit','model':source,'params':{**params,'adoption':'valid-near-miss'}})
    assert adopted['metadata']['geometryFitting']['adoption']=='valid-near-miss'


def test_degenerate_solver_solution_never_adopts_even_with_residual_acceptance():
    from unittest.mock import patch
    from types import SimpleNamespace
    source=regular('cube')
    def collapse(fun,x,**kwargs):
        # Return an optimizer-success flag without evaluating any valid candidate.
        y=x.reshape((-1,3)).copy();y[1]=y[0];fun(y.ravel())
        return SimpleNamespace(success=True,status=1,message='mock success',nfev=1)
    with patch('engine.condition_fitting.least_squares',collapse):
        packet=fit_geometry(source,{'objectives':['equal-edges']})
        assert packet['model'] is None and not packet['evidence']['converged']
        assert any('coincide' in d for d in packet['evidence']['geometricValidity']['diagnostics'])
        with pytest.raises(GeometryError,match='invalid'):
            dispatch_geometry_fit({'op':'geometry-fit','model':source,'params':{'objectives':['equal-edges'],'adoption':'valid-near-miss'}})


def test_4d_equal_edges_preserves_tesseract_cells_and_scale():
    source=perturbed('tesseract');packet=fit_geometry(source,{'objectives':['equal-edges'],'max_evaluations':100})
    result=packet['model'];p=np.asarray(result['vertices']);e=np.asarray(result['edges'])
    assert packet['evidence']['converged'] and result['cells']==source['cells']
    assert np.ptp(np.linalg.norm(p[e[:,0]]-p[e[:,1]],axis=1))<1e-7
    for cell in source['cells']:
        ids=sorted({v for f in cell for v in source['faces'][f]})
        assert np.linalg.svd(p[ids]-p[ids].mean(axis=0),compute_uv=False)[3]<1e-7
    assert mean_edge(result)==pytest.approx(mean_edge(source),rel=1e-12)


@pytest.mark.parametrize('key',['cube','tesseract'])
def test_orientation_flips_refuse_even_with_small_objective(key):
    from unittest.mock import patch
    from types import SimpleNamespace
    source=regular(key);d=source['dimension']
    def reflect(fun,x,**kwargs):
        y=x.reshape((-1,d)).copy();y[:,0]*=-1;fun(y.ravel())
        return SimpleNamespace(success=True,status=1,message='mock success',nfev=1)
    with patch('engine.condition_fitting.least_squares',reflect):
        packet=fit_geometry(source,{'objectives':['equal-edges']})
        assert packet['evidence']['residuals']['maximum']<1e-7
        assert packet['model'] is None and not packet['evidence']['converged']
        assert 'orientation flipped' in packet['evidence']['geometricValidity']['diagnostics'][0]


def test_deterministic_residual_budget_is_distinct_from_convergence(monkeypatch):
    from engine.condition_fitting import LIMITS
    monkeypatch.setitem(LIMITS,'residualCalls',2)
    source=johnson();packet=fit_geometry(source,{'objectives':['equal-areas']})
    assert packet['status']=='work-limit' and not packet['evidence']['converged']
    assert packet['evidence']['work']['residualCalls']==3
    assert packet['evidence']['solverTermination']['evaluations'] is None


@pytest.mark.parametrize('objective',['planar-faces','equal-areas'])
def test_planarity_repair_and_equal_areas(objective):
    packet=fit_geometry(perturbed('cube'),{'objectives':[objective]})
    assert packet['evidence']['converged'] and packet['model']['validation']['passed']
    assert packet['evidence']['conditions'][objective]['after']['maximum']<1e-7


def test_combined_conditions_and_keep_source_symmetry():
    source=regular('cube');source['vertices']=(np.asarray(source['vertices'])*[1.1,.9,1.03]).tolist()
    for field in ('facetEquations','facetVertices','fingerprint','measure'):source.pop(field,None)
    result=fit_geometry(source,{'objectives':['regular-faces','equal-edges','equal-areas','planar-faces'],'keep_symmetry':True})
    assert result['evidence']['converged'] and result['evidence']['symmetry']['order']==8
    from engine.symmetry import geometric_symmetry
    p=np.asarray(result['model']['vertices']);p-=p.mean(axis=0)
    for action in geometric_symmetry(source)['actions']:
        assert np.max(np.abs(p[action['permutation']]-p@np.asarray(action['matrix']).T))<1e-7


def test_shared_near_miss_deviations_are_scale_invariant_and_read_only():
    source=perturbed('cube');before=deepcopy(source)
    first=server.dispatch({'op':'geometry-fit-deviation','model':source,'params':{}})
    assert first==near_miss_deviation(source) and source==before
    assert first['nearlyRegularFaces'] is False and first['maximumPlanarity']>1e-4
    source['vertices']=(np.asarray(source['vertices'])*13).tolist()
    second=near_miss_deviation(source)
    for key in ('maximumEdgeDeviationPercent','maximumFaceEdgeDeviationPercent','maximumFaceAngleDeviationDegrees','maximumPlanarity'):
        assert first[key]==pytest.approx(second[key],abs=1e-10)
    assert not second['classificationEstablished'] and not second['certified']


def test_new_controls_save_load_replay_preserve_original_history(tmp_path):
    source=johnson();source['metadata']['coordinateUnits']='mm'
    doc={'id':'condition-doc','cursor':0,'states':[{'model':source,'view':{'coordinateUnit':'mm'},'notes':'keep notes'}]};before=deepcopy(doc)
    built=run_recipe(doc,'geometry-fit',{'objectives':['regular-faces'],'fix_scale':True,'keep_symmetry':True},server.dispatch)
    assert doc==before and built['cursor']==1 and built['states'][0]['model']==source
    assert built['states'][1]['notes']=='keep notes'
    path=tmp_path/'condition.polyproj';save_project(path,{'format':'polytope-laboratory','version':1,'active':0,'documents':[built]})
    opened=load_file(path)['project']['documents'][0]
    replayed=replay_document(opened,server.dispatch)['states'][0]['model']
    assert identity(replayed)==identity(opened['states'][1]['model'])
    assert replayed['metadata']==opened['states'][1]['model']['metadata']


@pytest.mark.parametrize('options',[{'objectives':[]},{'objectives':['bogus']},{'objectives':['equal-edges','equal-edges']},
    {'objectives':['equal-edges'],'fix_scale':'yes'},{'objectives':['regular-faces'],'keep_symmetry':1},
    {'objectives':['equal-edges'],'target':2},{'objectives':['equal-areas'],'max_evaluations':401}])
def test_invalid_controls_refuse(options):
    with pytest.raises(GeometryError):fit_geometry(regular('cube'),options)


def test_explicit_target_and_cancellation_and_source_change():
    source=regular('tetrahedron')
    packet=fit_geometry(source,{'objectives':['equal-edges'],'fix_scale':False,'target':3})
    assert packet['evidence']['converged'] and mean_edge(packet['model'])==pytest.approx(3,abs=1e-7)
    with pytest.raises(GeometryError,match='canceled'):fit_geometry(source,{'objectives':['regular-faces']},cancel=lambda:True)
    def change():source['metadata']['notes']='changed';return False
    with pytest.raises(GeometryError,match='changed'):fit_geometry(source,{'objectives':['regular-faces']},cancel=change)
    with pytest.raises(GeometryError,match='Keep symmetry'):
        fit_geometry(perturbed('cube'),{'objectives':['regular-faces'],'keep_symmetry':True})
