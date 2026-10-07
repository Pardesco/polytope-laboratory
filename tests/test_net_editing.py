from copy import deepcopy
import json
import subprocess
from pathlib import Path
from collections import Counter
import xml.etree.ElementTree as ET
import numpy as np
import pytest
from engine.nets import unfold,edit_net,fold_net,net_svg
from engine.generators import regular,generate
from engine.operations import transform
from engine.geometry import GeometryError
from engine.formats import save_project,load_file


@pytest.mark.parametrize('key',['tetrahedron','cube','octahedron','dodecahedron','icosahedron','truncated-icosidodecahedron'])
def test_rigid_motion_has_joined_hinges_and_reconstructs_every_source_vertex(key):
    model=regular(key);net=unfold(model,root=len(model['faces'])//2)
    for fraction in (0,.125,.5,.875,1):
        pose=fold_net(net,fraction);assert pose['validation']['rigidityPreserved'] and pose['validation']['hingesJoined']
        # Check every pair in every face, independently of the reported checks.
        for face in pose['faces']:
            cloud=np.asarray(face['points']);source=np.asarray(model['vertices'])[face['sourceVertices']]*net['scale']
            assert np.linalg.norm(cloud[:,None]-cloud[None,:],axis=2)==pytest.approx(np.linalg.norm(source[:,None]-source[None,:],axis=2),abs=1e-6)
            if fraction==1:
                target=(np.asarray(model['vertices'])-np.mean(model['vertices'],axis=0))*net['scale']
                assert cloud==pytest.approx(target[face['sourceVertices']],abs=1e-6)


def test_cut_and_move_preserve_layout_identity_then_rejoin_at_source_edge():
    model=regular('cube');before=deepcopy(model);net=unfold(model);edge=net['hinges'][0]
    cut=edit_net(model,net,'toggle-edge',edge=edge)
    assert len(cut['components'])==2 and len(cut['hinges'])==len(net['hinges'])-1
    for original,edited in zip(net['faces'],cut['faces']):assert original['points']==pytest.approx(np.asarray(edited['points']))
    root=cut['components'][1]['root'];ids=cut['components'][1]['faces'];moved=edit_net(model,cut,'move-component',component=root,translation=[40,-20],angle=37)
    for i in range(len(model['faces'])):
        a,b=np.asarray(cut['faces'][i]['points']),np.asarray(moved['faces'][i]['points'])
        assert np.linalg.norm(a[:,None]-a[None,:],axis=2)==pytest.approx(np.linalg.norm(b[:,None]-b[None,:],axis=2))
        if i not in ids:assert a==pytest.approx(b)
    assert fold_net(moved,1)['validation']['endpointReconstructed']
    joined=edit_net(model,moved,'toggle-edge',edge=edge)
    assert len(joined['components'])==1 and fold_net(joined,1)['validation']['endpointReconstructed']
    assert model==before and net['hinges'][0]==edge


def test_cycles_wrong_source_and_bad_parameters_fail_without_mutation():
    model=regular('cube');net=unfold(model);before=deepcopy(net)
    edge=next(i for i in range(len(model['edges'])) if i not in net['hinges'])
    with pytest.raises(GeometryError,match='cycle'):edit_net(model,net,'toggle-edge',edge=edge)
    with pytest.raises(GeometryError,match='source changed'):edit_net(transform(model,scale=2),net,'set-tabs')
    for hinges in ([0,0],[-1],[True],[[0]],list(range(len(model['edges'])))):
        with pytest.raises(GeometryError):unfold(model,hinges=hinges)
    for t in (-.1,1.1,float('nan')):
        with pytest.raises(GeometryError):fold_net(net,t)
    assert net==before


def test_independent_faces_forest_and_extreme_coordinate_scales():
    original=regular('dodecahedron')
    for scale in (1e-9,1e9):
        model=transform(original,scale=scale);net=unfold(model,hinges=[],edge_length_mm=40)
        assert len(net['components'])==12 and net['foldValidation']['endpointReconstructed']
        for face in net['faces']:assert np.linalg.norm(np.asarray(face['points'][1])-face['points'][0])==pytest.approx(40)
    model=generate('block',sizes=[1,2,3]);model['faces']=[list(reversed(f)) if i%2 else f for i,f in enumerate(model['faces'])]
    net=unfold(model)
    assert net['foldValidation']['endpointReconstructed']


def test_svg_connections_tabs_overlap_reporting_and_component_groups():
    model=regular('cube');net=unfold(model);net=edit_net(model,net,'toggle-edge',edge=net['hinges'][0])
    xml=ET.fromstring(net_svg(net));namespace={'s':'http://www.w3.org/2000/svg'}
    labels=Counter(text.text for text in xml.findall('.//s:text',namespace) if text.text.startswith('E'))
    assert all(n==2 for n in labels.values())
    assert set(labels)=={'E'+str(i) for i in range(len(model['edges'])) if i not in net['hinges']}
    groups=[g for g in xml.findall('./s:g',namespace) if 'data-net-component' in g.attrib]
    assert len(groups)==2
    assert sum(len(g.findall('./s:g',namespace)) for g in groups)==len(model['faces'])
    no_tabs=edit_net(model,net,'set-tabs',tabs=False)
    assert not no_tabs['hasTabOverlap'] and not no_tabs['tabOverlapPairs']
    # Force two previously cut faces into overlapping positions.
    isolated=unfold(model,hinges=[])
    a=np.asarray(isolated['faces'][0]['points']).mean(axis=0);b=np.asarray(isolated['faces'][1]['points']).mean(axis=0)
    overlapping=edit_net(model,isolated,'move-component',component=1,translation=(a-b).tolist())
    assert overlapping['hasOverlap'] and (0,1) in overlapping['overlapPairs']


def test_project_rebuilds_cached_motion_from_layout_parameters(tmp_path):
    model=regular('cube');net=unfold(model);net=edit_net(model,net,'toggle-edge',edge=net['hinges'][0]);net=edit_net(model,net,'move-component',component=net['components'][1]['root'],translation=[20,10])
    original=deepcopy(net);net['faces'][0]['points'][0]=[900,800];net['targetVertices'][0]=[999,999,999]
    project={'format':'polytope-laboratory','version':1,'active':0,'documents':[{'cursor':0,'states':[{'model':model,'netLayout':net}]}]}
    path=tmp_path/'net.polyproj';save_project(path,project);restored=load_file(path)['project']['documents'][0]['states'][0]['netLayout']
    assert restored['faces']==original['faces'] and restored['targetVertices']==original['targetVertices']
    assert restored['foldValidation']['endpointReconstructed']


def test_renderer_motion_matches_kernel_at_intermediate_and_endpoint_states(tmp_path):
    model=regular('dodecahedron');net=unfold(model)
    net=edit_net(model,net,'toggle-edge',edge=net['hinges'][0]);net=edit_net(model,net,'move-component',component=net['components'][1]['root'],translation=[-73,14],angle=137)
    values=[0,.17,.5,.81,1];input_path=tmp_path/'motion.json';input_path.write_text(json.dumps({'net':net,'values':values}),encoding='utf-8')
    module=(Path(__file__).resolve().parents[1]/'ui/net-motion.mjs').as_uri()
    code='import fs from "node:fs";import {foldPositions} from '+json.dumps(module)+';const input=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));process.stdout.write(JSON.stringify(input.values.map(t=>foldPositions(input.net,t))));'
    result=subprocess.run(['node','--input-type=module','-e',code,str(input_path)],capture_output=True,text=True,check=True)
    poses=json.loads(result.stdout)
    for value,pose in zip(values,poses):
        for expected,actual in zip(fold_net(net,value)['faces'],pose):assert np.asarray(actual['points'])==pytest.approx(np.asarray(expected['points']),abs=1e-8)


def test_coordinate_identity_survives_javascript_number_spelling():
    from engine.geometry import identity
    source=regular('cube');decoded=deepcopy(source)
    decoded['vertices']=[[int(x) for x in row] for row in decoded['vertices']]
    assert identity(decoded)==source['fingerprint']
    assert unfold(decoded)['sourceFingerprint']==source['fingerprint']
    decoded['vertices'][0][0]+=.01
    assert identity(decoded)!=source['fingerprint']
    source=regular('octahedron');decoded=deepcopy(source)
    decoded['vertices']=[[0 if x==0 else x for x in row] for row in decoded['vertices']]
    assert identity(source)==identity(decoded)
