from copy import deepcopy
import pytest
import numpy as np
from engine.export_context import prepare_export, scale_reference
from engine.generators import regular
from engine.formats import export_model
from engine.dxf import parse_dxf
from engine.geometry import GeometryError
from engine.server import dispatch


def test_millimeters_to_inches_literal_25_point_4_cube():
    from engine.geometry import hull
    source=hull([[12.7*x for x in p] for p in regular('cube')['vertices']])
    before=deepcopy(source)
    prepared=prepare_export(source,'off','mm','in')
    assert np.asarray(prepared['model']['vertices'])==pytest.approx(np.asarray(before['vertices'])/25.4)
    assert prepared['model']['faces']==before['faces']
    assert prepared['report']['exactFactor']=='5/127'
    assert source==before


@pytest.mark.parametrize('source,target,factor',[('in','mm',25.4),('ft','in',12),('cm','m',.01),('model','model',1)])
def test_exact_units_and_dxf_header(source,target,factor):
    model=regular('cube');result=prepare_export(model,'dxf',source,target)
    assert result['report']['scaleFactor']==pytest.approx(factor)
    read=parse_dxf(export_model(result['model'],'dxf'))
    assert np.max(np.abs(read['vertices']))==pytest.approx(factor)
    assert read['metadata']['dxf']['insunits']=={'mm':4,'in':1,'m':6,'model':0}[target]
    assert result['report']['losses']==['DXF output contains source edges; faces and cells are omitted.']


@pytest.mark.parametrize('source,target',[('model','mm'),('in','model'),('inch','mm'),('mm','yard')])
def test_undeclared_or_unsupported_units_fail(source,target):
    with pytest.raises(GeometryError):prepare_export(regular('cube'),'off',source,target)


def test_physical_vrml_requires_meters_and_source_colors_loss_report():
    with pytest.raises(GeometryError,match='meters'):prepare_export(regular('cube'),'vrml','mm','mm')
    source=regular('antiprism-j1')
    assert prepare_export(source,'obj')['report']['losses']
    assert prepare_export(source,'off')['report']['losses']==[]


def test_reference_scale_selected_edge_and_replay():
    source=regular('cube');before=deepcopy(source);result=scale_reference(source,0,5)
    a,b=result['edges'][0]
    assert np.linalg.norm(np.asarray(result['vertices'][a])-result['vertices'][b])==pytest.approx(5)
    assert source==before
    doc={'cursor':0,'states':[{'model':source,'view':{}}]}
    traced=dispatch({'op':'recipe-run','params':{'document':doc,'operation':'scale-reference','parameters':{'index':0,'desired_length':5}}})
    replay=dispatch({'op':'recipe-replay','params':{'document':traced}})
    assert replay['states'][0]['model']['vertices']==traced['states'][1]['model']['vertices']


@pytest.mark.parametrize('index,length',[(-1,5),(0,0),(0,float('nan')),(True,5),(0,True)])
def test_invalid_reference_scale(index,length):
    with pytest.raises(GeometryError):scale_reference(regular('cube'),index,length)
