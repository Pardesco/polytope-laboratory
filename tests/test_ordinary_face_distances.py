from copy import deepcopy
from pathlib import Path
import math,tempfile
from unittest.mock import patch
import numpy as np
import pytest
from engine import server,element_annotations as content
from engine.measurements import entity_measure
from engine.geometry import identity,validate,GeometryError
from engine.formats import save_project,load_file


def fixture(other=None, face=False, edge=False):
    vertices=[[0,0,0],[3,0,0],[3,1,0],[1,1,0],[1,3,0],[0,3,0]]
    faces=[[0,1,2,3,4,5]];edges=[[a,b] for a,b in zip(faces[0],faces[0][1:]+faces[0][:1])]
    start=len(vertices);vertices.extend(other or [[2,2,1]])
    if face:
        cycle=list(range(start,len(vertices)));faces.append(cycle);edges.extend([a,b] for a,b in zip(cycle,cycle[1:]+cycle[:1]))
    if edge:edges.append([start,start+1])
    source={'id':'literal-L-distance','name':'Literal concave notch','dimension':3,'embeddingDimension':3,'interpretation':'generalized-complex','vertices':vertices,'edges':edges,'faces':faces,'cells':[],
            'metadata':{'coordinateUnits':'mm','offColors':{'faces':[{'encoding':'byte','values':[20,80,140,127]} for _ in faces]}}}
    source['fingerprint']=identity(source);source['validation']=validate(source);assert source['validation']['passed'];return source


def measure(model,A,B,expected):
    before=deepcopy(model)
    with patch('engine.geometry.hull',side_effect=AssertionError('No hull')):
        result=entity_measure(model,entities=[A,B],bounded=True)
    assert result['value']==pytest.approx(expected,abs=1e-8)
    lo,hi=result['boundedDistanceEvidence']['distanceBounds'];assert lo<=expected+1e-8 and hi>=expected-1e-8
    assert model==before and result['boundedDistanceEvidence']['convexified'] is False
    for owner,witness in zip(result['witnessOwners'],result['witnessPoints']):
        P=np.asarray(model['vertices'])[owner['sourceVertexIds']];w=np.asarray(owner['barycentricWeights'])
        assert min(w)>=0 and sum(w)==pytest.approx(1);assert np.allclose(P.T@w,witness)
        if owner['sourceKind']=='face':
            assert set(owner['sourceVertexIds'])<=set(model['faces'][owner['sourceIndex']])
            if owner['sourceIndex']==0:assert witness[0]<=1+1e-8 or witness[1]<=1+1e-8,'Witness must not occupy the notch/hull interior.'
    return result


def test_notch_vertex_segment_and_face_face_analytic_witnesses():
    F={'kind':'face','index':0}
    source=fixture();measure(source,{'kind':'vertex','index':6},F,math.sqrt(2))
    assert entity_measure(source,entities=[{'kind':'vertex','index':6},F])['value']==pytest.approx(1),'Supporting flat remains a different explicit option.'
    source=fixture([[1.5,1.5,1],[2.5,2.5,1]],edge=True);measure(source,{'kind':'edge','index':6},F,math.sqrt(1.25))
    source=fixture([[1.75,1.75,1],[2.25,1.75,1],[2.25,2.25,1],[1.75,2.25,1]],face=True)
    measure(source,{'kind':'face','index':1},F,1.25);measure(source,F,{'kind':'face','index':1},1.25)
    source=fixture([[2,1.5,-1],[2,2.5,-1],[2,2.5,1],[2,1.5,1]],face=True)
    measure(source,F,{'kind':'face','index':1},.5)


def test_intersections_reverse_cycles_and_literal_similarity_metrics():
    source=fixture([[-1,2,1],[2,2,-1]],edge=True)
    measure(source,{'kind':'edge','index':6},{'kind':'face','index':0},0)
    source=fixture();source['faces'][0].reverse();source['fingerprint']=identity(source)
    source['vertices']=[[3*x+10,3*y-20,3*z+7] for x,y,z in source['vertices']];source['fingerprint']=identity(source)
    result=entity_measure(source,entities=[{'kind':'vertex','index':6},{'kind':'face','index':0}],bounded=True)
    assert result['value']==pytest.approx(3*math.sqrt(2),abs=1e-8)
    bad=fixture();bad['faces'][0]=[0,2,1,3,4,5];bad['edges']=sorted({tuple(sorted((a,b))) for a,b in zip(bad['faces'][0],bad['faces'][0][1:]+bad['faces'][0][:1])});bad['edges']=[list(E) for E in bad['edges']]
    with pytest.raises(GeometryError,match='crossing|touching|retraces'):entity_measure(bad,entities=[{'kind':'vertex','index':6},{'kind':'face','index':0}],bounded=True)


def test_native_save_open_preserves_source_content_units_and_selected_workflow():
    source=fixture();annotations=content.set_text(content.new_document(source),source,'face',0,'<b>Literal notch face</b>')
    settings={'aKind':'vertex','aIds':'6','bKind':'face','bIds':'0','bounded':True,'ridge':0,'offset':'0','direction':''}
    state={'model':source,'view':{'coordinateUnit':'mm','measurements':settings,'elementAnnotations':annotations},'notes':'Literal distance source notes'}
    document={'id':'source','cursor':0,'states':[state]};project={'format':'polytope-laboratory','version':1,'active':0,'documents':[document]};before=deepcopy(project)
    result=server.dispatch({'op':'entity-measure','model':source,'params':{'kind':'flat-distance','bounded':True,'entities':[{'kind':'vertex','index':6},{'kind':'face','index':0}]}})
    assert result['value']==pytest.approx(math.sqrt(2)) and project==before
    with tempfile.TemporaryDirectory() as folder:
        path=Path(folder)/'notch.polyproj';save_project(path,project);opened=load_file(path)['project']['documents'][0]['states'][0]
    assert opened['model']==source and opened['notes']==state['notes'] and opened['view']['elementAnnotations']==annotations
    assert opened['view']['measurements']==settings and opened['view']['coordinateUnit']=='mm'
