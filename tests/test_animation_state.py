import copy
import json
from pathlib import Path
import subprocess
import pytest
from engine.animation_state import validate_animation_sequence,animation_render_support
from engine import animation_state
from engine.geometry import GeometryError


def sequence(version=1,tracks=None):
    value={'version':version,'duration':2,'fps':24,'loop':False,'keyframes':[
        {'time':0,'angles':[10,20,30,40,50,60],'sectionOffset':-2},
        {'time':2,'angles':[370,20,30,40,50,60],'sectionOffset':2}]}
    if version==2:
        value['tracks']=tracks if tracks is not None else {'explosion':{'direction':'normal'},'fold':{'kind':'face-net'}}
        for index,frame in enumerate(value['keyframes']):
            if 'explosion' in value['tracks']:frame['explosionAmount']=index
            if 'fold' in value['tracks']:frame['foldFraction']=index
    return value


def test_legacy_v1_retains_full_turn_angles_depth_and_default_loop_without_aliases():
    value=sequence();del value['loop'];before=copy.deepcopy(value)
    checked=validate_animation_sequence(value)
    assert checked['loop'] is False
    assert checked['keyframes'][1]['angles']==[370,20,30,40,50,60]
    assert checked['keyframes'][0]['sectionOffset']==-2
    assert 'tracks' not in checked
    checked['keyframes'][0]['angles'][0]=999
    assert value==before


@pytest.mark.parametrize('tracks',[{'explosion':{'direction':'normal'}},
    {'explosion':{'direction':'radial'}},{'fold':{'kind':'face-net'}},
    {'explosion':{'direction':'normal'},'fold':{'kind':'face-net'}}])
def test_v2_known_track_records_and_keyframes_are_detached(tracks):
    value=sequence(2,tracks);checked=validate_animation_sequence(value)
    assert checked==value
    value['tracks'][next(iter(tracks))]['callerChanged']=True
    assert 'callerChanged' not in checked['tracks'][next(iter(tracks))]
    value['keyframes'][0]['angles'][0]=700
    assert checked['keyframes'][0]['angles'][0]==10


def test_valid_v2_can_be_retained_while_actual_renderer_support_is_explicit():
    value=sequence(2)
    assert animation_render_support(sequence())=={'supported':True,'diagnostic':None}
    assert animation_render_support(value)['supported'] is False
    assert 'explosion, fold' in animation_render_support(value)['diagnostic']
    assert 'fold tracks' in animation_render_support(value,('explosion',))['diagnostic']
    assert animation_render_support(value,('explosion','fold'))=={'supported':True,'diagnostic':None}
    with pytest.raises(GeometryError,match='capability'):animation_render_support(value,('morph',))
    for malformed in ['explosion',[['fold']],None]:
        with pytest.raises(GeometryError,match='capabilities'):animation_render_support(value,malformed)


@pytest.mark.parametrize('bad',[None,False,[],{}, {'version':99,'duration':2,'fps':24,'keyframes':[]},
    {'version':True,'duration':2,'fps':24,'keyframes':[]}, {'version':2,'duration':2,'fps':24,'keyframes':[]}])
def test_unknown_versions_and_malformed_envelopes_reject_without_mutation(bad):
    before=copy.deepcopy(bad)
    with pytest.raises(GeometryError):validate_animation_sequence(bad)
    assert bad==before


@pytest.mark.parametrize('field,values',[
    ('duration',[0,-1,301,True,'2',float('inf'),10**400]),
    ('fps',[0,61,1.2,False,'24',float('nan')]),('loop',[None,1,'yes'])])
def test_scalar_and_boolean_policy_matches_renderer(field,values):
    for bad in values:
        value=sequence();value[field]=bad
        with pytest.raises(GeometryError):validate_animation_sequence(value)


@pytest.mark.parametrize('tracks',[{}, {'morph':{}},{'explosion':None},
    {'explosion':{'direction':'guess'}},{'explosion':{'direction':['normal']}},
    {'explosion':{'direction':'normal','units':'mm'}},
    {'fold':{'kind':'cell-net'}},{'fold':{'kind':'face-net','vertexInterpolation':True}}])
def test_unknown_or_unimplemented_tracks_reject(tracks):
    value=sequence(2,tracks)
    with pytest.raises(GeometryError):validate_animation_sequence(value)


@pytest.mark.parametrize('change',[
    lambda s:s.update(extra=True),lambda s:s.update(tracks={}),
    lambda s:s['keyframes'][0].update(explosionAmount=1),
    lambda s:s['keyframes'][0].update(angles=[0]*5),
    lambda s:s['keyframes'][0].update(angles=[0]*5+[True]),
    lambda s:s['keyframes'][0].update(angles=[0]*5+[1e6+1]),
    lambda s:s['keyframes'][0].update(sectionOffset=float('nan')),
    lambda s:s['keyframes'][0].pop('sectionOffset'),
    lambda s:s['keyframes'][0].update(time=.1),
    lambda s:s['keyframes'][1].update(time=1.99),
    lambda s:s.update(keyframes=[s['keyframes'][0]]),
    lambda s:s.update(keyframes=list(reversed(s['keyframes'])))])
def test_exact_frame_shape_sorted_times_and_endpoints_are_required(change):
    value=sequence();change(value)
    with pytest.raises(GeometryError):validate_animation_sequence(value)


def test_every_active_track_requires_bounded_finite_values_and_no_inactive_fields():
    for name,bad_values in [('explosionAmount',[-1,11,float('inf'),True,'1']),('foldFraction',[-.1,1.1,float('nan'),False])]:
        for bad in bad_values:
            value=sequence(2);value['keyframes'][0][name]=bad
            with pytest.raises(GeometryError):validate_animation_sequence(value)
        value=sequence(2);del value['keyframes'][0][name]
        with pytest.raises(GeometryError):validate_animation_sequence(value)
    value=sequence(2,{'fold':{'kind':'face-net'}});value['keyframes'][0]['explosionAmount']=1
    with pytest.raises(GeometryError):validate_animation_sequence(value)


def test_bounds_allow_all_maximum_timestamps_and_reject_structural_expansion(monkeypatch):
    value=sequence(2);value.update(duration=300,fps=60)
    value['keyframes']=[{**value['keyframes'][i%2],'time':300*i/255,'angles':[0]*6} for i in range(256)]
    assert len(validate_animation_sequence(value)['keyframes'])==256
    value['keyframes'].append(value['keyframes'][-1])
    with pytest.raises(GeometryError,match='256 keyframes'):validate_animation_sequence(value)
    value=sequence();value['keyframes'].insert(1,{**copy.deepcopy(value['keyframes'][0]),'time':0})
    with pytest.raises(GeometryError,match='increase strictly'):validate_animation_sequence(value)
    monkeypatch.setattr(animation_state,'MAX_SEQUENCE_BYTES',30)
    with pytest.raises(GeometryError,match='resource policy'):validate_animation_sequence(sequence())


def test_float64_depth_extremes_and_native_tuple_arrays_remain_readable():
    value=sequence();value['keyframes'][0]['sectionOffset']=-1e308;value['keyframes'][1]['sectionOffset']=1e308
    value['version']=1.0;value['fps']=24.0;value['keyframes']=tuple(value['keyframes']);value['keyframes'][0]['angles']=tuple(value['keyframes'][0]['angles'])
    checked=validate_animation_sequence(value)
    assert checked['keyframes'][0]['sectionOffset']==-1e308
    assert checked['keyframes'][1]['sectionOffset']==1e308
    assert type(checked['keyframes']) is list and type(checked['keyframes'][0]['angles']) is list


def test_independent_hand_fixtures_have_identical_native_and_javascript_normalization():
    fixtures=[sequence(),sequence(2),sequence(2,{'explosion':{'direction':'radial'}}),sequence(2,{'fold':{'kind':'face-net'}})]
    program="import {normalizeSequence} from './ui/animation.mjs';let data='';for await(const part of process.stdin)data+=part;process.stdout.write(JSON.stringify(JSON.parse(data).map(normalizeSequence)));"
    result=subprocess.run(['node','--input-type=module','-e',program],cwd=Path(__file__).resolve().parents[1],input=json.dumps(fixtures),text=True,capture_output=True,check=True)
    assert json.loads(result.stdout)==[validate_animation_sequence(value) for value in fixtures]
