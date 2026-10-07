from copy import deepcopy
from collections import Counter
import numpy as np
import pytest
from engine.cell_nets import cell_net,edit_cell_net
from engine.generators import regular
from engine.geometry import GeometryError
from engine.operations import transform
from engine.formats import save_project,load_file


@pytest.mark.parametrize('key',['simplex4','tesseract','cross4','cell24','cell120','cell600'])
def test_every_complete_source_cell_is_preserved_with_matching_face_joins(key):
    model=regular(key);before=deepcopy(model);net=cell_net(model)
    assert len(net['cells'])==len(model['cells']) and len(net['connections'])==len(model['cells'])-1
    copies=Counter(face['id'] for cell in net['cells'] for face in cell['faces'])
    assert copies==Counter({i:2 for i in range(len(model['faces']))})
    scale=max(np.ptp(np.asarray(model['vertices']),axis=0));tolerance=scale*1e-7
    for cell in net['cells']:
        p=np.asarray(cell['points']);source=np.asarray(model['vertices'])[cell['sourceVertices']]
        assert np.linalg.norm(p[:,None]-p[None,:],axis=2)==pytest.approx(np.linalg.norm(source[:,None]-source[None,:],axis=2),abs=tolerance)
        assert [f['id'] for f in cell['faces']]==model['cells'][cell['id']]
        for face in cell['faces']:assert [cell['sourceVertices'][i] for i in face['vertices']]==model['faces'][face['id']]
        if cell['parent'] is not None:
            parent=net['cells'][cell['parent']]
            for v in model['faces'][cell['parentFace']]:assert p[cell['sourceVertices'].index(v)]==pytest.approx(np.asarray(parent['points'])[parent['sourceVertices'].index(v)],abs=tolerance)
    assert net['validation']['rigidityPreserved'] and not net['validation']['cellIntersectionsChecked']
    assert model==before


def test_cell_cut_retains_placement_and_rigid_component_move_rejoins():
    source=regular('tesseract');net=cell_net(source);face=net['connections'][0];cut=edit_cell_net(source,net,'toggle-face',face=face)
    assert len(cut['components'])==2
    for a,b in zip(net['cells'],cut['cells']):assert np.asarray(a['points'])==pytest.approx(np.asarray(b['points']),abs=1e-9)
    root=cut['components'][1]['root'];moved=edit_cell_net(source,cut,'move-component',component=root,translation=[3,-4,5],angles=[23,37,-81])
    selected=set(cut['components'][1]['cells'])
    for a,b in zip(cut['cells'],moved['cells']):
        p,q=np.asarray(a['points']),np.asarray(b['points'])
        assert np.linalg.norm(p[:,None]-p[None,:],axis=2)==pytest.approx(np.linalg.norm(q[:,None]-q[None,:],axis=2))
        if a['id'] not in selected:assert p==pytest.approx(q,abs=1e-9)
    joined=edit_cell_net(source,moved,'toggle-face',face=face)
    assert len(joined['components'])==1 and joined['validation']['connectedFacesJoined']


def test_reattachment_moves_the_existing_descendant_subtree():
    source=regular('tesseract');net=cell_net(source);moving=next(c for c in net['cells'] if c['parent'] is not None and any(d['parent']==c['id'] for d in net['cells']))
    descendants={moving['id']}
    while True:
        expanded=descendants|{c['id'] for c in net['cells'] if c['parent'] in descendants}
        if expanded==descendants:break
        descendants=expanded
    face=next(f['id'] for f in moving['faces'] if not f['connected'] and f['neighbor'] not in descendants)
    edited=edit_cell_net(source,net,'reattach-cell',face=face,moving_cell=moving['id'])
    assert face in edited['connections'] and moving['parentFace'] not in edited['connections']
    assert edited['cells'][moving['id']]['parentFace']==face
    before=np.concatenate([net['cells'][i]['points'] for i in sorted(descendants)]);after=np.concatenate([edited['cells'][i]['points'] for i in sorted(descendants)])
    assert np.linalg.norm(before[:,None]-before[None,:],axis=2)==pytest.approx(np.linalg.norm(after[:,None]-after[None,:],axis=2),abs=1e-8)


def test_separate_cells_scale_covariance_and_invalid_connections():
    source=regular('simplex4');net=cell_net(source,connections=[])
    assert len(net['components'])==5
    for scale in (1e-9,1e9):assert cell_net(transform(source,scale=scale))['validation']['connectedFacesJoined']
    net=cell_net(source);before=deepcopy(net);face=next(i for i in range(len(source['faces'])) if i not in net['connections'])
    with pytest.raises(GeometryError,match='cycle'):edit_cell_net(source,net,'toggle-face',face=face)
    with pytest.raises(GeometryError):cell_net(regular('cube'))
    with pytest.raises(GeometryError):cell_net(source,connections=[True])
    with pytest.raises(GeometryError):cell_net(source,placements=[{'root':0,'quaternion':[0,0,0,0]}])
    with pytest.raises(GeometryError,match='source changed'):edit_cell_net(transform(source,scale=2),net,'toggle-face',face=0)
    assert net==before


def test_native_project_rebuilds_cell_geometry_from_persisted_parameters(tmp_path):
    source=regular('tesseract');net=cell_net(source,connections=[]);net=edit_cell_net(source,net,'move-component',component=1,translation=[3,4,5],angles=[11,23,45]);before=deepcopy(net)
    net['cells'][0]['points'][0]=[1000,2000,3000]
    project={'format':'polytope-laboratory','version':1,'active':0,'documents':[{'cursor':0,'states':[{'model':source,'cellNetLayout':net}]}]}
    path=tmp_path/'cell-net.polyproj';save_project(path,project);restored=load_file(path)['project']['documents'][0]['states'][0]['cellNetLayout']
    assert restored['cells']==before['cells'] and restored['placements']==before['placements']
