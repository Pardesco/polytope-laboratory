from copy import deepcopy
import csv
import io
import math
import xml.etree.ElementTree as ET
import numpy as np
import pytest
from engine.generators import regular
from engine.geometry import GeometryError
from engine.measurements import dihedrals
from engine.generalized_nets import _simple, unfold_source
from engine.net_fabrication import inset_polygon, reinforcement_parts, measurement_export
from engine.server import dispatch
from test_generalized_nets import l_prism

NET={'edge_length_mm':20,'tabs':False}
SVG='{http://www.w3.org/2000/svg}'


@pytest.mark.parametrize('reverse',[False,True])
@pytest.mark.parametrize('polygon,area',[
    ([[0,0],[20,0],[20,20],[0,20]],256),
    ([[0,0],[30,0],[30,10],[10,10],[10,30],[0,30]],276),
])
def test_miter_offsets_are_simple_with_true_boundary_clearance(polygon,area,reverse):
    if reverse:polygon=polygon[::-1]
    q,clearance=inset_polygon(polygon,2);_simple(q,'independent inset')
    measured=abs(sum(a[0]*b[1]-a[1]*b[0] for a,b in zip(q,np.roll(q,-1,axis=0))))/2
    assert measured==pytest.approx(area)
    assert clearance==pytest.approx(2)


@pytest.mark.parametrize('margin',[10,11,30])
def test_collapsed_offsets_are_refused_instead_of_returning_crossed_cutouts(margin):
    with pytest.raises(GeometryError):inset_polygon([[0,0],[20,0],[20,20],[0,20]],margin)


def test_concave_shell_braces_reflex_angles_and_reentrant_hinges():
    model=l_prism();result=reinforcement_parts(model,NET,{'hubs':False,'margin_mm':.5})
    assert len(result['braces'])==8
    for brace in result['braces']:
        _simple(np.array(brace['pointsMm']),'printed concave brace')
        assert brace['minimumClearanceMm']>=.5-1e-8
    table=measurement_export(model,NET)
    assert table['faces'][0]['anglesDegrees']==pytest.approx([90,90,90,270,90,90])
    assert any(e['dihedralDegrees']==pytest.approx(270) and e['fold']=='mountain' for e in table['edges'])
    for hinge in result['hinges']:assert min(p[1] for p in hinge['gaugePointsMm'])>=hinge['widthMm']+3-1e-8


@pytest.mark.parametrize('key',['cube','icosahedron'])
def test_hinge_angles_match_independent_source_dihedrals(key):
    model=regular(key);before=deepcopy(model)
    result=reinforcement_parts(model,NET,{'braces':False,'hubs':False,'strip_width_mm':8})
    expected={e['ridge']:e['value'] for e in dihedrals(model)['records']}
    assert len(result['hinges'])==len(model['edges'])
    for hinge in result['hinges']:
        assert hinge['dihedralDegrees']==pytest.approx(expected[hinge['edge']])
        assert hinge['widthMm']==8 and hinge['lengthMm']==pytest.approx(20)
        p=np.array(hinge['gaugePointsMm']);a=p[1]-p[0];b=p[2]-p[0]
        assert math.degrees(math.acos(np.clip(a@b/np.linalg.norm(a)/np.linalg.norm(b),-1,1)))==pytest.approx(expected[hinge['edge']])
    assert model==before


@pytest.mark.parametrize('key,valence,angles',[('cube',3,[90,90,90]),('icosahedron',5,[60]*5+[108]*5)])
def test_hub_spokes_reconstruct_source_directions_and_analytic_angles(key,valence,angles):
    model=regular(key);result=reinforcement_parts(model,NET,{'braces':False,'hinges':False})
    assert len(result['hubs'])==len(model['vertices'])
    assert {h['type'] for h in result['hubs']}=={1}
    source=np.array(model['vertices'])
    for hub in result['hubs']:
        assert len(hub['spokes'])==valence
        assert sorted(p['angleDegrees'] for p in hub['pairAngles'])==pytest.approx(angles)
        frame=hub['frame'];x,y,n=[np.array(frame[k]) for k in ('x','y','normal')]
        for spoke in hub['spokes']:
            az,el=map(math.radians,[spoke['azimuthDegrees'],spoke['elevationDegrees']])
            reconstructed=math.cos(el)*(math.cos(az)*x+math.sin(az)*y)+math.sin(el)*n
            assert reconstructed==pytest.approx(spoke['direction3D'])
            ei=int(spoke['edge'][1:]);a,b=model['edges'][ei];other=b if a==hub['vertex'] else a
            direction=source[other]-source[hub['vertex']];direction/=np.linalg.norm(direction)
            assert reconstructed==pytest.approx(direction)


def test_cut_list_csv_complete_labels_units_sides_angles_and_dxf_line_geometry():
    model=regular('cube');model['metadata']['coordinateUnits']='in';before=deepcopy(model)
    table=measurement_export(model,{**NET,'hinges':[]});rows=list(csv.DictReader(io.StringIO(table['csv'])))
    edges=[r for r in rows if r['entity']=='edge'];faces=[r for r in rows if r['entity']=='face']
    assert len(edges)==12 and len(faces)==6 and table['units']=='mm'
    assert all(float(e['length_mm'])==pytest.approx(20) and e['dihedral_deg']=='90' and e['fold']=='valley' for e in edges)
    assert {f['label'].split('/')[0] for f in faces}=={f'P{i}' for i in range(1,7)}
    assert all(f['polygon']=='4-gon' and list(map(float,f['side_lengths_mm'].split(';')))==pytest.approx([20]*4) for f in faces)
    assert all(list(map(float,f['corner_angles_deg'].split(';')))==pytest.approx([90]*4) for f in faces)
    lines=table['dxf'].splitlines();pairs=list(zip(map(int,lines[::2]),lines[1::2]));assert ((9,'$INSUNITS') in pairs)
    i=pairs.index((9,'$INSUNITS'));assert pairs[i+1]==(70,'4')
    records=[]
    for code,value in pairs:
        if code==0:records.append({'kind':value})
        elif records:records[-1][code]=value
    cuts=[r for r in records if r['kind']=='LINE'];labels=[r for r in records if r['kind']=='TEXT']
    assert len(cuts)==24 and len(labels)==30
    for cut in cuts:
        assert cut[8]=='CUT' and float(cut[30])==0 and float(cut[31])==0
        assert math.hypot(float(cut[10])-float(cut[11]),float(cut[20])-float(cut[21]))==pytest.approx(20)
    assert {r[1] for r in labels if '/' in r[1]}=={f['label'] for f in table['faces']}
    assert model==before


def test_extra_pages_and_standalone_svg_represent_all_parts_with_mm_viewports():
    result=reinforcement_parts(regular('cube'),NET,paper={'width_mm':210,'height_mm':297,'margin_mm':10},include_net=True)
    assert result['pages'][0]['kind']=='net' and any(p['kind']=='reinforcement' for p in result['pages'])
    labels=[]
    for page in result['pages']:
        root=ET.fromstring(page['svg']);assert root.attrib['width']=='210mm' and root.attrib['height']=='297mm'
        labels += [t.text or '' for t in root.iter(SVG+'text')]
        if page['kind']=='reinforcement':
            for polygon in root.iter(SVG+'polygon'):
                p=np.array([[float(v) for v in q.split(',')] for q in polygon.attrib['points'].split()])
                _simple(p,'SVG cutout');assert p.min()>=10 and p[:,0].max()<=200 and p[:,1].max()<=287
    for part in result['braces']+result['hinges']+result['hubs']:assert part['label'] in labels
    stack=ET.fromstring(result['svg']);nested=stack.findall(SVG+'svg');assert len(nested)==len(result['pages'])
    assert [float(p.attrib['y']) for p in nested]==[297*i for i in range(len(nested))]
    assert all(p.attrib['width']=='210' and p.attrib['height']=='297' for p in nested)
    assert result['contentScale']==1


def test_measurement_pdf_pages_have_complete_corner_rows_and_physical_page_size():
    model=regular('icosahedron');table=measurement_export(model,NET,paper={'width_mm':100,'height_mm':100,'margin_mm':5});text='';corners=0
    assert len(table['pages'])>1
    for page in table['pages']:
        root=ET.fromstring(page['svg']);assert root.attrib['width']=='100mm' and root.attrib['height']=='100mm'
        text+=''.join(root.itertext())
        corners+=sum((node.text or '').startswith('  side ') for node in root.iter(SVG+'text'))
    for edge in table['edges']:assert edge['label']+' |' in text
    for face in table['faces']:assert face['label']+' | 3-gon' in text
    assert corners==60


@pytest.mark.parametrize('params',[
    {'options':{'braces':1}}, {'options':{'margin_mm':float('nan')}}, {'options':{'extra':1}},
    {'options':{'braces':False,'hinges':False,'hubs':False}}, {'include_net':'yes'}, {'paper':{'width_mm':20}},
])
def test_dispatch_refuses_invalid_options(params):
    with pytest.raises(GeometryError):dispatch({'op':'net-reinforcement-parts','model':regular('cube'),'params':{'netParameters':NET,**params}})


def test_native_dispatch_ownership_cancellation_and_no_silent_scaling():
    request={'op':'net-measurement-export','model':regular('cube'),'params':{'netParameters':NET}}
    assert len(dispatch(request)['edges'])==12
    from engine.net_fabrication import dispatch_fabrication
    with pytest.raises(GeometryError,match='canceled'):dispatch_fabrication(request,cancelled=lambda:True)
    with pytest.raises(GeometryError,match='does not fit'):
        reinforcement_parts(regular('cube'),{'edge_length_mm':500}, {'hinges':False,'hubs':False})
