"""Native boundaries for newly integrated source/view workflows."""
from copy import deepcopy
import json
import pytest

from engine.formats import validate_project
from engine.generators import regular
from engine.geometry import GeometryError
from engine.server import dispatch


def document():
    return {'id':'source','cursor':0,'states':[{'model':regular('cube'),'view':{}}]}


def test_subdivision_recipe_replays_and_branches_from_original_incidence():
    original=document();before=deepcopy(original)
    result=dispatch({'op':'recipe-run','params':{'document':original,
                     'operation':'subdivide-edges','parameters':{'divisions':2}}})
    assert original==before
    model=result['states'][result['cursor']]['model']
    assert [len(model[k]) for k in ('vertices','edges','faces')]==[20,24,6]
    reopened=validate_project(json.loads(json.dumps({'format':'polytope-laboratory',
             'version':1,'active':0,'documents':[result]})))['documents'][0]
    replay=dispatch({'op':'recipe-replay','params':{'document':reopened}})
    assert replay['states'][0]['model']['faces']==model['faces']
    assert replay['states'][0]['model']['vertices']==model['vertices']
    branch=dispatch({'op':'recipe-branch','params':{'document':reopened,
                    'parameters':{'divisions':3,'edge_ids':[0]}}})
    selected=branch['states'][branch['cursor']]['model']
    assert [len(selected[k]) for k in ('vertices','edges','faces')]==[10,14,6]
    assert selected['vertices'][:8]==original['states'][0]['model']['vertices']


@pytest.mark.parametrize('fields',[{'perspectiveDistance4D':0},
    {'perspectiveDistance4D':True},{'perspectiveDistance4D':101},
    {'perspectiveNear4D':0},{'perspectiveDistance4D':.5,'perspectiveNear4D':.5},
    {'explosionAmount':-.01},{'explosionAmount':10.01},{'explosionAmount':True},
    {'foldFraction':-.01},{'foldFraction':1.01},{'foldFraction':False},
    {'animation':{'version':99,'duration':1,'fps':24,'keyframes':[]}}])
def test_invalid_saved_display_cannot_be_adopted(fields):
    doc=document();doc['states'][0]['view'].update(fields)
    with pytest.raises(GeometryError):
        validate_project({'format':'polytope-laboratory','version':1,
                          'active':0,'documents':[doc]})


def test_valid_unrendered_animation_track_is_retained_through_project_boundary():
    doc=document();sequence={'version':2,'duration':1,'fps':24,
        'tracks':{'explosion':{'direction':'normal'}},'keyframes':[
            {'time':0,'angles':[0]*6,'sectionOffset':0,'explosionAmount':0},
            {'time':1,'angles':[0]*6,'sectionOffset':0,'explosionAmount':1}]}
    doc['states'][0]['view'].update(animation=sequence,
        perspectiveDistance4D=.6,perspectiveNear4D=.05)
    validated=validate_project({'format':'polytope-laboratory','version':1,
                    'active':0,'documents':[doc]})
    saved=validated['documents'][0]['states'][0]['view']
    assert saved['animation']['tracks']==sequence['tracks']
    assert saved['animation']['keyframes']==sequence['keyframes']
    assert saved['perspectiveDistance4D']==.6


@pytest.mark.parametrize('amount,fraction',[(0,0),(10,1),(.375,.625)])
def test_saved_presentation_pose_retains_boundaries_and_fraction(amount,fraction):
    doc=document();doc['states'][0]['view'].update(explosionAmount=amount,foldFraction=fraction)
    restored=validate_project(json.loads(json.dumps({'format':'polytope-laboratory',
        'version':1,'active':0,'documents':[doc]})))['documents'][0]['states'][0]['view']
    assert restored['explosionAmount']==amount
    assert restored['foldFraction']==fraction


@pytest.mark.parametrize('n,height',[(3,None),(4,None),(5,None),(6,1)])
def test_generated_cupola_survives_authoritative_project_validation(n,height):
    model=dispatch({'op':'generate','params':{'kind':'cupola','n':n,
                    'edge_length':1,'height':height}})
    doc={'id':'cupola','cursor':0,'states':[{'model':model,'view':{}}]}
    restored=validate_project(json.loads(json.dumps({'format':'polytope-laboratory',
        'version':1,'active':0,'documents':[doc]})))['documents'][0]['states'][0]['model']
    assert restored['vertices']==model['vertices']
    assert restored['faces']==model['faces']
    assert [len(restored[k]) for k in ('vertices','edges','faces')]==[3*n,5*n,2*n+2]
    assert restored['provenance']['parameters']=={'n':n,'edge_length':1,'height':height}
    assert restored['metadata']['cupola']['regularFacesWithinFloatTolerance']==(n<6)
