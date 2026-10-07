import copy,math
import numpy as np
import pytest
from engine.generators import regular
from engine.projective_incidence_dual import projective_dual,segment_clip,source_binding
from engine.projective_dual_workflow import run_projective,source_context
from engine.incidence_dual import incidence_dual
from engine.recipes import replay_document,branch_recipe
from engine.formats import save_project,load_file
from engine import server,element_annotations as content
from engine.geometry import GeometryError

def test_finite_polarity_matches_existing_reciprocal_without_replacing_source():
    p=regular('cube');before=copy.deepcopy(p);record=projective_dual(p,{'radius':2,'clipBound':8})
    finite=incidence_dual(p,radius=2)
    assert np.allclose([v['finitePoint'] for v in record['vertices']],finite['vertices'])
    assert [f['dualVertices'] for f in record['faces']]==finite['faces']
    assert p==before and record['display']['geometryModel'] is False
    # Independent exact cube-box segment intersections, not endpoint clamping.
    clipped=segment_clip(np.array([4.,0,0,1]),np.array([0.,4,0,1]),3)
    assert np.allclose(clipped,[[3,1,0],[1,3,0]])
    tetra=regular('tetrahedron');ideal=projective_dual(tetra,{'center':tetra['vertices'][0]})
    assert sum(e['kind']=='ideal-line' for e in ideal['edges'])==3
    assert all(not e['clipPoints'] and e['status']=='outside-affine-chart' for e in ideal['edges'] if e['kind']=='ideal-line')

def test_actual_u3_ideal_links_clip_true_projective_lines_and_preserve_source_planes():
    p=regular('antiprism-u3');before=copy.deepcopy(p);a=projective_dual(p,{'clipBound':4});b=projective_dual(p,{'clipBound':8})
    with pytest.raises(GeometryError,match='singular'):incidence_dual(p)
    assert (len(a['vertices']),len(a['edges']),len(a['faces']))==(12,24,12)
    assert sum(v['kind']=='ideal-numerical' for v in a['vertices'])==4
    assert [v['homogeneous'] for v in a['vertices']]==[v['homogeneous'] for v in b['vertices']]
    center=np.array(a['resolvedCenter']);points=np.array(p['vertices'])-center
    for face in a['faces']:assert np.allclose(center+np.array(face['homogeneousPlane'][:3]),p['vertices'][face['sourceVertex']])
    for edge in a['edges']:
        assert edge['sourceVertices']==p['edges'][edge['id']]
        assert len(edge['clipPoints'])==2
        for point in np.array(edge['clipPoints'])-center:
            assert max(abs(point))<=4+1e-9
            for vi in edge['sourceVertices']:assert points[vi]@point==pytest.approx(1,abs=1e-8)
    ideal_edges=[e['id'] for e in a['edges'] if e['kind']=='projective-full-line'];assert ideal_edges
    assert any(a['edges'][i]['clipPoints']!=b['edges'][i]['clipPoints'] for i in ideal_edges)
    assert p==before and a['display']['faceFill'].startswith('unassigned')

def test_actual_u75_retains_coincident_plane_identities_and_all_literal_links():
    p=regular('antiprism-u75');record=projective_dual(p)
    assert (len(record['vertices']),len(record['edges']),len(record['faces']))==(124,240,60)
    assert sum(v['kind']=='ideal-numerical' for v in record['vertices'])==60
    assert len(record['coincidentPlaneIdentityGroups'])==62
    assert all(len(group)==2 for group in record['coincidentPlaneIdentityGroups'])
    assert [e['sourceEdge'] for e in record['edges']]==list(range(240))
    assert record['maximumPolarityResidual']<1e-10
    assert all(len(f['dualVertices'])==8 and len(set(f['dualVertices']))==8 for f in record['faces'])

def test_native_recipe_replay_branch_and_save_open_preserve_source_rgba_content_units_notes(tmp_path):
    p=regular('antiprism-u3');p['metadata'].update(coordinateUnits='mm',offColors={'faces':[{'encoding':'byte','values':[20,80,140,127]} for f in p['faces']]})
    doc=content.set_text(content.new_document(p),p,'face',0,'Literal hemi face')
    state={'model':p,'view':{'coordinateUnit':'mm','elementAnnotations':doc},'notes':'Source notes'};document={'id':'hemi','states':[state],'cursor':0}
    made=run_projective(document,{'clipBound':4});assert document['states'][0]==state
    result=made['states'][-1];assert result['model']==p and result['view']['elementAnnotations']==doc
    replayed=replay_document(made,server.dispatch);assert replayed['states'][-1]['view']['projectiveDual']==result['view']['projectiveDual']
    branch=branch_recipe(made,{'clipBound':8},server.dispatch);assert branch['states'][-1]['model']==p
    assert branch['states'][-1]['view']['projectiveDual']['settings']['clipBound']==8
    path=tmp_path/'hemi.polyproj';save_project(path,{'format':'polytope-laboratory','version':1,'active':0,'documents':[made]});opened=load_file(path)['project']['documents'][0]['states'][-1]
    assert opened['model']==p and opened['notes']=='Source notes' and opened['view']['elementAnnotations']==doc
    assert opened['view']['projectiveDual']['binding']==source_binding(opened['model'],source_context(opened))
    record=server.dispatch({'op':'projective-incidence-dual','model':opened['model'],'params':{**opened['view']['projectiveDual']['settings'],'sourceContext':source_context(opened)}})
    assert record['vertices'][0]['rawFaceColor']=={'encoding':'byte','values':[20,80,140,127]}
    tampered=copy.deepcopy(made);tampered['operationHistory']['nodes'][-1]['params']['clipBound']=9
    with pytest.raises(GeometryError):replay_document(tampered,server.dispatch)

def test_nonordinary_incidence_and_malformed_settings_refuse_without_hull_repair():
    p=regular('cube');before=copy.deepcopy(p)
    for value in [{'clipBound':0},{'radius':True},{'center':[0,0]},{'invented':1}]:
        with pytest.raises(GeometryError):projective_dual(p,value)
    p['faces'].append(p['faces'][0])
    with pytest.raises(GeometryError):projective_dual(p)
    assert before['faces']!=p['faces']
