"""Independent analytic internal panels, construction-scale and protocol oracles."""
from copy import deepcopy
import csv
import io
import json
import math
from pathlib import Path
import subprocess
import sys
import xml.etree.ElementTree as ET

import numpy as np
import pytest

ROOT=Path(__file__).resolve().parents[1]
from engine.net_reinforcement import build_reinforcements,restore_reinforcements,measurements,print_pages
from engine.net_reinforcement_workflow import dispatch_reinforcement as dispatch
from engine.generators import regular
from engine.geometry import GeometryError
from engine.operations import transform
from engine.formats import save_project,load_file,validate_project

NET={'edge_length_mm':20,'tabs':True}
RECTANGLE=[0,1,7,6]
TRIANGLE=[0,3,5]


def source():
    model=regular('cube');model['metadata']['coordinateUnits']='cm'
    model['metadata']['offColors']={'faces':[{'encoding':'unit','values':[.1,.3,.7,.35]} for _ in model['faces']],'cells':[]}
    return model


def test_diagonal_rectangle_is_source_vertex_internal_panel_at_physical_scale():
    model=source();before=deepcopy(model);receipt=build_reinforcements(model,NET,[RECTANGLE]);panel=receipt['panels'][0]
    assert model==before and receipt['source']==before
    assert panel['sourceVertexIds']==RECTANGLE
    assert panel['areaMm2']==pytest.approx(400*math.sqrt(2))
    assert [e['lengthMm'] for e in panel['edges']]==pytest.approx([20,20*math.sqrt(2),20,20*math.sqrt(2)])
    assert [e['sourceEdgeId'] is not None for e in panel['edges']]==[True,False,True,False]
    assert [c['angleDegrees'] for c in panel['corners']]==pytest.approx([90]*4)
    flat=np.array(panel['pointsMm']);p=np.array(panel['sourcePointsMm'])
    for i in range(4):
        for j in range(4):assert np.linalg.norm(flat[i]-flat[j])==pytest.approx(np.linalg.norm(p[i]-p[j]))
    reconstructed=np.array(panel['frame']['originMm'])+flat[:,0,None]*panel['frame']['x']+flat[:,1,None]*panel['frame']['y']
    assert reconstructed==pytest.approx(p)
    svg=ET.fromstring(receipt['panelSvg']);assert svg.attrib['width'].endswith('mm')
    polygon=svg.find('{http://www.w3.org/2000/svg}polygon');paint=np.array([[float(n) for n in pair.split(',')] for pair in polygon.attrib['points'].split()])
    assert np.linalg.norm(paint[1]-paint[0])==pytest.approx(20,abs=1e-9)
    assert polygon.attrib['data-source-vertex-ids']=='0 1 7 6'
    assert receipt['validation']['structuralRigidityProved'] is False


def test_internal_equilateral_triangle_has_analytic_corner_and_area_oracles():
    panel=build_reinforcements(source(),NET,[TRIANGLE])['panels'][0]
    assert [c['angleDegrees'] for c in panel['corners']]==pytest.approx([60]*3)
    assert [e['lengthMm'] for e in panel['edges']]==pytest.approx([20*math.sqrt(2)]*3)
    assert panel['areaMm2']==pytest.approx(200*math.sqrt(3))


@pytest.mark.parametrize('cycle',[[0,1,3,2],[0,1,2,7],[0,7,1,6],[0,0,1],[0,1],[-1,1,7],[False,1,7],[0,1,99]])
def test_exterior_nonplanar_crossed_repeated_and_invalid_cycles_are_refused(cycle):
    with pytest.raises(GeometryError):build_reinforcements(source(),NET,[cycle])


@pytest.mark.parametrize('cycles',[[],[RECTANGLE,RECTANGLE],[RECTANGLE,RECTANGLE[::-1]],[[0,1,7,6]]*33])
def test_count_and_cycle_rotation_duplicate_bounds(cycles):
    with pytest.raises(GeometryError):build_reinforcements(source(),NET,cycles)


@pytest.mark.parametrize('unit,factor',[('mm',1),('cm',10),('m',1000),('in',25.4),('ft',304.8)])
@pytest.mark.parametrize('angle_unit',['degrees','radians'])
def test_measurement_csv_json_source_indices_and_units_are_independently_checked(unit,factor,angle_unit):
    export=measurements(source(),NET,cycles=[RECTANGLE],unit=unit,angle_unit=angle_unit);report=export['report']
    assert json.loads(export['json'])==report
    assert len(report['rows'])==12*2+6*4+4*2+1
    assert report['sourceUnits']=='cm' and report['referenceEdgeLengthMm']==20
    for row in report['rows']:
        if row['kind']=='edge-length':assert row['value']==pytest.approx(20/factor)
        elif row['kind'] in ('interior-dihedral','face-corner','panel-corner'):assert row['value']==pytest.approx(90 if angle_unit=='degrees' else math.pi/2)
        elif row['kind']=='panel-area':assert row['value']==pytest.approx(400*math.sqrt(2)/factor**2)
    rows=list(csv.DictReader(io.StringIO(export['csv'])))
    assert len(rows)==len(report['rows']) and len({r['source_hash'] for r in rows})==1
    for csv_row,native_row in zip(rows,report['rows']):
        assert csv_row['kind']==native_row['kind'];assert float(csv_row['value'])==native_row['value']
        assert csv_row['source_vertex_ids']==' '.join(map(str,native_row['sourceVertexIds']))


def test_regular_tetrahedron_has_analytic_interior_dihedral_and_corner_angles():
    report=measurements(regular('tetrahedron'),NET)['report']
    for row in report['rows']:
        if row['kind']=='interior-dihedral':assert row['value']==pytest.approx(math.degrees(math.acos(1/3)))
        elif row['kind']=='face-corner':assert row['value']==pytest.approx(60)


@pytest.mark.parametrize('scale',[1e-30,1,1e30])
def test_source_coordinate_scale_translation_and_net_placements_do_not_change_panel_physical_geometry(scale):
    model=transform(source(),scale=scale,translation=(np.array([3,-2,7])*scale).tolist())
    panel=build_reinforcements(model,{**NET,'root':3,'hinges':[],'placements':[{'root':0,'translation':[200,50],'angle':70}]},[RECTANGLE])['panels'][0]
    assert panel['areaMm2']==pytest.approx(400*math.sqrt(2))


def test_saved_project_roundtrip_and_derived_tampering_reconstruction(tmp_path):
    p=validate_project({'format':'polytope-laboratory','version':1,'active':0,'documents':[{'id':'reinforcement','cursor':0,'states':[{'model':source(),'view':{},'notes':'retained notes'}]}]})
    state=p['documents'][0]['states'][0];receipt=build_reinforcements(state['model'],NET,[RECTANGLE]);state['view']['netReinforcement']=receipt
    file=tmp_path/'reinforcement.polyproj';save_project(file,p);loaded=load_file(file)['project']['documents'][0]['states'][0]
    saved=loaded['view']['netReinforcement'];saved['panels'][0]['areaMm2']=999;saved['panelSvg']='<script/>'
    assert restore_reinforcements(loaded['model'],saved)==receipt
    assert loaded['notes']=='retained notes' and loaded['model']['metadata']['offColors']==state['model']['metadata']['offColors']


@pytest.mark.parametrize('field',['RGBA','units','sourceId','vertices'])
def test_restoration_binds_full_source_attributes(field):
    model=source();receipt=build_reinforcements(model,NET,[RECTANGLE])
    if field=='RGBA':model['metadata']['offColors']['faces'][0]['values'][3]=.99
    elif field=='units':model['metadata']['coordinateUnits']='mm'
    elif field=='sourceId':model['id']='different'
    else:model['vertices'][0][0]-=.1
    with pytest.raises(GeometryError,match='changed'):restore_reinforcements(model,receipt)


def test_actual_jsonl_refusal_then_valid_job_and_native_node_roundtrip():
    request={'op':'net-reinforcement','model':source(),'params':{'netParameters':NET,'cycles':[RECTANGLE]}}
    before=deepcopy(request);bad=deepcopy(request);bad['params']['cycles']=[[0,1,3,2]]
    run=subprocess.run([sys.executable,'-B',str(ROOT/'engine/server.py')],input=json.dumps(bad)+'\n'+json.dumps(request)+'\n',encoding='utf-8',capture_output=True,check=True)
    replies=[json.loads(line) for line in run.stdout.splitlines()];assert not replies[0]['ok'] and replies[1]['ok'];assert request==before
    state=replies[1]['result'];node=subprocess.run(['node','-e','let s="";process.stdin.on("data",v=>s+=v);process.stdin.on("end",()=>process.stdout.write(JSON.stringify(JSON.parse(s))));'],input=json.dumps(state),encoding='utf-8',capture_output=True,check=True)
    assert restore_reinforcements(request['model'],json.loads(node.stdout))==state


def test_cancel_and_inflight_source_mutation_never_return_receipt():
    model=source()
    with pytest.raises(GeometryError,match='canceled'):build_reinforcements(model,NET,[RECTANGLE],cancelled=lambda:True)
    def mutate():model['metadata']['coordinateUnits']='m';return False
    with pytest.raises(GeometryError,match='ownership'):build_reinforcements(model,NET,[RECTANGLE],cancelled=mutate)


@pytest.mark.parametrize('change',[lambda r:r.update(extra=1),lambda r:r.update(id=True),lambda r:r.update(algorithmVersion='other'),lambda r:r['params'].update(unknown=1)])
def test_strict_native_job_schema(change):
    request={'op':'net-reinforcement','model':source(),'params':{'netParameters':NET,'cycles':[RECTANGLE]}};change(request)
    with pytest.raises(GeometryError):dispatch(request)


def test_physical_pages_preserve_panel_geometry_and_refuse_oversize_without_rescaling():
    receipt=build_reinforcements(source(),NET,[RECTANGLE,TRIANGLE]);pages=print_pages(receipt)
    assert pages['allPanelsRepresented'] and pages['scale']==1 and len(pages['pages'])==2
    for page,panel in zip(pages['pages'],receipt['panels']):
        flat=np.array(page['pointsMm']);assert np.all(flat>=10) and np.all(flat<=[200,287])
        for j,edge in enumerate(panel['edges']):assert np.linalg.norm(flat[j]-flat[(j+1)%len(flat)])==pytest.approx(edge['lengthMm'])
        ET.fromstring(page['svg'])
    huge=build_reinforcements(source(),{'edge_length_mm':1000},[RECTANGLE])
    with pytest.raises(GeometryError,match='No scaling'):print_pages(huge)


def test_production_page_dispatch_checks_owned_source_paper_and_physical_dimensions():
    model=source();receipt=build_reinforcements(model,NET,[RECTANGLE])
    request={'op':'net-reinforcement-pages','model':model,'params':{'state':receipt,'paper':{'width_mm':210,'height_mm':297,'margin_mm':10}}}
    result=dispatch(request);assert result['scale']==1 and result['allPanelsRepresented'];assert len(result['pages'])==1
    before=deepcopy(request)
    def mutate():request['model']['metadata']['coordinateUnits']='m';return False
    with pytest.raises(GeometryError,match='ownership changed'):dispatch(request,cancelled=mutate)
    request=before;request['params']['paper']['width_mm']=20;request['params']['paper']['height_mm']=20;request['params']['paper']['margin_mm']=0
    with pytest.raises(GeometryError,match='No scaling'):dispatch(request)
