from copy import deepcopy
import pytest
from engine.generators import regular
from engine.formats import validate_project
from engine.geometry import GeometryError
from engine.view_orientation import orient_entity


def project():
    model=regular('tesseract')
    return {'format':'polytope-laboratory','version':1,'active':0,'documents':[
        {'cursor':0,'states':[{'model':model,'view':{'orientationFrame':orient_entity(model,{'kind':'cell','index':0})}}]}]}


def test_saved_frame_roundtrip_preserves_source_geometry():
    data=project(); before=deepcopy(data)
    assert validate_project(data)['documents'][0]['states'][0]['view']==before['documents'][0]['states'][0]['view']
    assert data['documents'][0]['states'][0]['model']['vertices']==before['documents'][0]['states'][0]['model']['vertices']


@pytest.mark.parametrize('bad', ['hash','reflection','scale','nan','references','mode'])
def test_corrupted_frame_is_rejected_before_adoption(bad):
    data=project(); frame=data['documents'][0]['states'][0]['view']['orientationFrame']
    if bad=='hash':frame['sourceFingerprint']='forged'
    if bad=='reflection':frame['matrix'][0]=[-x for x in frame['matrix'][0]]
    if bad=='scale':frame['matrix'][0]=[2*x for x in frame['matrix'][0]]
    if bad=='nan':frame['matrix'][0][0]=float('nan')
    if bad=='references':frame['sourceVertexIds']=[100000]
    if bad=='mode':frame['mode']='symmetry-proof'
    with pytest.raises(GeometryError):validate_project(data)


def test_legacy_missing_view_migrates_without_changing_source_geometry():
    data=project(); original=deepcopy(data['documents'][0]['states'][0]['model'])
    data['documents'][0]['states'][0].pop('view')
    result=validate_project(data)['documents'][0]['states'][0]
    assert result['view']=={}
    assert result['model']['vertices']==original['vertices']
    assert result['model']['faces']==original['faces']


@pytest.mark.parametrize('bad',[None,[],42,'camera'])
def test_explicit_malformed_view_is_rejected(bad):
    data=project(); data['documents'][0]['states'][0]['view']=bad
    with pytest.raises(GeometryError,match='display-state'):validate_project(data)
