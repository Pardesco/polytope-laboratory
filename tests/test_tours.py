import copy
import json
from pathlib import Path
import subprocess
from itertools import combinations,product
import pytest

from engine.geometry import GeometryError, identity
from engine.formats import validate_project, save_project, load_file
from engine.tours import tour_documents, validate_tour, validate_tour_transition
from engine import tours


def cube():
    # Explicit Cartesian incidence, independent of kernel construction.
    return {'model': {'id': 'hand-cube', 'name': 'Cube', 'dimension': 3,
        'embeddingDimension': 3, 'interpretation': 'convex-polytope',
        'vertices': [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]],
        'edges': [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]],
        'faces': [[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]], 'cells': [],
        'facetVertices': [[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]],
        'numeric': {'mode': 'float64-approximate', 'certified': False},
        'metadata': {'sourceAsset': {'key': 'hand-cube', 'sha256': 'retained-offline'}}},
        'view': {'angles': [0,0,0,0,0,0]}, 'notes': 'source'}


def tour():
    section=cube();section['model']['name']='Central tesseract section'
    section['model']['metadata'].update(sourceDimension=4,sourceNormal=[0,0,0,1],sourceDepth=0)
    return {'version': 1, 'events': [
        {'id': 'cube', 'state': cube(), 'duration': 2, 'transition': 'instant'},
        {'id': 'section', 'state': section, 'duration': 3, 'transition': 'instant'}], 'cursor': 0}


def project():
    return {'format': 'polytope-laboratory', 'version': 1, 'active': 0,
            'documents': [{'cursor': 0, 'states': [cube()]}], 'tour': tour()}


def test_empty_tours_and_legacy_projects():
    empty={'version':1,'events':[],'cursor':0}
    assert tour_documents(None)==[]
    assert tour_documents(empty)==[]
    assert validate_tour(empty)==empty
    saved=project();saved['tour']=empty
    assert validate_project(saved)['tour']==empty
    del saved['tour'];assert 'tour' not in validate_project(saved)
    with pytest.raises(GeometryError):validate_tour(None)


def test_native_import_detaches_and_rebuilds_all_event_geometry_caches():
    original=tour();original['events'][0]['state']['model'].update(measure={'content':999},fingerprint='forged')
    before=copy.deepcopy(original);checked=validate_tour(original)
    assert original==before
    assert checked['events'][0]['state']['model']['measure']['content']==pytest.approx(8)
    assert checked['events'][0]['state']['model']['fingerprint']==identity(cube()['model'])
    assert checked['events'][1]['state']['model']['metadata']['sourceNormal']==[0,0,0,1]
    checked['events'][0]['state']['model']['vertices'][0][0]=77
    assert original['events'][0]['state']['model']['vertices'][0][0]==-1
    assert checked['events'][1]['state']['model']['vertices'][0][0]==-1


def test_project_save_reopen_keeps_tour_snapshots_and_offline_source_metadata(tmp_path):
    saved=project();saved['tour']['events'][1]['state']['model']['measure']={'content':999}
    filename=tmp_path/'tour.polyproj';save_project(filename,saved)
    checked=load_file(filename)['project']
    assert checked['tour']['events'][1]['state']['model']['measure']['content']==pytest.approx(8)
    assert checked['tour']['events'][0]['state']['model']['metadata']['sourceAsset']['key']=='hand-cube'
    checked['documents'][0]['states'][0]['model']['vertices'][0][0]=99
    assert checked['tour']['events'][0]['state']['model']['vertices'][0][0]==-1


def test_unused_invalid_event_cannot_be_imported_or_saved(tmp_path):
    saved=project();saved['tour']['events'][1]['state']['model']['faces'][0][0]=999
    with pytest.raises(GeometryError,match='invalid geometry'):validate_tour(saved['tour'])
    filename=tmp_path/'invalid.polyproj'
    with pytest.raises(GeometryError,match='invalid geometry'):save_project(filename,saved)
    assert not filename.exists()


@pytest.mark.parametrize('value',[False,{}, {'version':True,'events':[],'cursor':0},
    {'version':3,'events':[],'cursor':0},{'version':1,'events':[],'cursor':1},
    {'version':1,'events':[],'cursor':False},{'version':1,'events':[],'cursor':0,'extra':1}])
def test_invalid_tour_envelopes_reject(value):
    with pytest.raises(GeometryError):tour_documents(value)


@pytest.mark.parametrize('duration',[0,-1,3601,10**400,True,'2',float('nan'),float('inf')])
def test_invalid_event_duration_rejects(duration):
    saved=tour();saved['events'][0]['duration']=duration
    with pytest.raises(GeometryError):tour_documents(saved)


@pytest.mark.parametrize('change',[
    lambda e:e.update(id=''),lambda e:e.update(id='x'*129),lambda e:e.update(id=2),
    lambda e:e.update(transition='fade'),lambda e:e.update(extra=True),
    lambda e:e['state'].pop('view'),lambda e:e['state'].update(model=False)])
def test_invalid_event_records_reject(change):
    saved=tour();change(saved['events'][0])
    with pytest.raises(GeometryError):tour_documents(saved)


def test_duplicate_ids_count_cycles_depth_and_finite_metadata_reject():
    saved=tour();saved['events'][1]['id']='cube'
    with pytest.raises(GeometryError,match='unique'):tour_documents(saved)
    saved=tour();saved['events']=saved['events']*51
    with pytest.raises(GeometryError,match='100 events'):tour_documents(saved)
    saved=tour();saved['events'][0]['state']['notes']=float('nan')
    with pytest.raises(GeometryError,match='finite JSON'):tour_documents(saved)
    saved=tour();saved['events'][0]['state']['view']['loop']=saved
    with pytest.raises(GeometryError,match='cyclic'):tour_documents(saved)
    saved=tour();nested=saved['events'][0]['state']['view']
    for _ in range(65):nested['child']={};nested=nested['child']
    with pytest.raises(GeometryError,match='structural resource'):tour_documents(saved)


def test_event_and_total_utf8_limits_are_independent(monkeypatch):
    saved=tour();saved['events'][0]['state']['notes']='\u20ac'*1000
    monkeypatch.setattr(tours,'MAX_EVENT_BYTES',2000)
    with pytest.raises(GeometryError,match='serialized resource'):tour_documents(saved)
    monkeypatch.setattr(tours,'MAX_EVENT_BYTES',10000);monkeypatch.setattr(tours,'MAX_BYTES',3000)
    with pytest.raises(GeometryError,match='serialized resource'):tour_documents(saved)


def test_captured_operation_lineage_is_inert_but_real_document_associations_remain_strict():
    saved=project();saved['tour']['events'][0]['state']['operationNode']='original-recipe-node'
    checked=validate_project(saved)
    assert checked['tour']['events'][0]['state']['operationNode']=='original-recipe-node'
    saved['documents'][0]['states'][0]['operationNode']='forged-current-node'
    with pytest.raises(GeometryError,match='association requires'):validate_project(saved)


@pytest.mark.parametrize('prior',[{}, {'sourceOperationNode':None}, {'sourceOperationNode':'older-source'}])
def test_standalone_import_preserves_original_operation_lineage_and_source_field_presence(prior):
    saved=tour();state=saved['events'][0]['state'];state.update(operationNode='captured-node',**prior)
    before=copy.deepcopy(saved);checked=validate_tour(saved)['events'][0]['state']
    assert saved==before
    assert checked['operationNode']=='captured-node'
    assert ('sourceOperationNode' in checked)==('sourceOperationNode' in prior)
    if prior:assert checked['sourceOperationNode']==prior['sourceOperationNode']
    assert checked['model']['measure']['content']==pytest.approx(8)


def animated_tour():
    saved=tour();saved['version']=2
    saved['events'][0]['transition']={'version':1,'method':'combination','duration':.75,
        'easing':'linear','angle':-35,'distance':4,'tilt':25,'orbits':2,
        'spin':1.5,'explosionSize':5,'direction':-1,'components':['sideways','explode-grow']}
    saved['events'][1]['transition']={'method':'orbit','duration':.5}
    for index,event in enumerate(saved['events']):
        state=event['state'];state['operationNode']='captured-'+event['id']
        state['sourceOperationNode']='historical-source'
        state['model']['metadata'].update(coordinateUnits='mm',offColors={
            'faces':[{'encoding':'byte','values':[25,80,210,127]},None,None,None,None,
                {'encoding':'unit','values':[.1,.4,.7,.25]}], 'cells':[]})
        state['view'].update(coordinateUnit='mm',camera={'position':[3,4,5],
            'target':[0,0,0],'projection':'orthographic'},unitSettings={'unit':'mm'},
            animation={'version':2,'duration':2,'fps':24,'loop':bool(index),
                'tracks':{'explosion':{'direction':'radial'},'fold':{'kind':'face-net'}},
                'keyframes':[{'time':0,'angles':[0]*6,'sectionOffset':-2,
                    'explosionAmount':0,'foldFraction':0},
                    {'time':2,'angles':[360,0,0,0,0,0],'sectionOffset':2,
                    'explosionAmount':.5,'foldFraction':1}]})
    return saved


def test_v2_empty_tours_and_exact_transition_records_are_detached_not_downgraded():
    empty={'version':2,'events':[],'cursor':0}
    assert validate_tour(empty)==empty
    original=animated_tour();before=copy.deepcopy(original);checked=validate_tour(original)
    assert original==before and checked['version']==2
    for actual,expected in zip(checked['events'],before['events']):
        assert actual['transition']==expected['transition']
        assert actual['duration']==expected['duration']
        assert actual['state']['view']==expected['state']['view']
        assert actual['state']['operationNode']==expected['state']['operationNode']
        assert actual['state']['sourceOperationNode']=='historical-source'
        for field in ('id','vertices','edges','faces','cells','metadata','numeric'):
            assert actual['state']['model'][field]==expected['state']['model'][field]
        assert actual['state']['model']['measure']['content']==pytest.approx(8)
    checked['events'][0]['transition']['components'].append('orbit')
    checked['events'][0]['state']['view']['animation']['keyframes'][0]['angles'][0]=99
    assert original==before


@pytest.mark.parametrize('method',tours.TRANSITION_METHODS)
def test_v2_transition_methods_match_frontend_defaults_without_replacing_record(method):
    transition={'method':method}
    if method=='combination':transition['components']=['orbit','shrink-grow']
    assert validate_tour_transition(transition)==transition
    saved=animated_tour();saved['events'][0]['transition']=transition
    assert validate_tour(saved)['events'][0]['transition']==transition


@pytest.mark.parametrize('value',[{}, {'method':None}, {'duration':None},
    {'method':'orbit','duration':None}, {'version':1.0,'direction':-1.0},
    {'method':'combination','components':['sideways','orbit','shrink-grow','shrink-implode'],
        'duration':60,'easing':'smootherstep','angle':360,'distance':100,
        'tilt':-180,'orbits':100,'spin':100,'explosionSize':100}])
def test_v2_partial_and_boundary_transition_options_follow_js_nullish_defaults(value):
    assert validate_tour_transition(value)==value


@pytest.mark.parametrize('value',[None,False,'instant',[],{'unknown':1},
    {'version':True},{'version':2},{'version':None},{'method':'morph'},
    {'method':[]},{'method':'instant','duration':.1},{'method':'orbit','duration':0},
    {'method':'orbit','duration':61},{'duration':True},{'distance':10**500},
    {'distance':-1},{'angle':361},{'tilt':181},{'orbits':101},{'spin':-1},
    {'explosionSize':.9},{'direction':True},{'direction':0},{'easing':'bounce'},
    {'components':['sideways']},{'components':None},{'method':'combination'},
    {'method':'combination','components':[['orbit']]},
    {'method':'combination','components':['instant']},
    {'method':'combination','components':['orbit','orbit']},
    {'method':'combination','components':['explode-grow','shrink-implode']},
    {'method':'combination','components':['sideways','orbit','shrink-grow','shrink-implode','explode-grow']}])
def test_v2_malformed_or_unsupported_transition_records_are_structured_refusals(value):
    before=copy.deepcopy(value)
    with pytest.raises(GeometryError):validate_tour_transition(value)
    assert value==before
    saved=animated_tour();saved['events'][1]['transition']=value
    with pytest.raises(GeometryError):tour_documents(saved)


@pytest.mark.parametrize('change',[
    lambda a:a['tracks'].update(morph={}),lambda a:a['tracks']['fold'].update(kind='cell-net'),
    lambda a:a['keyframes'][1].update(foldFraction=2),
    lambda a:a['keyframes'][1].update(explosionAmount=11),
    lambda a:a['keyframes'][1].update(angles=[0]*5+[True]),
    lambda a:a['keyframes'][1].update(time=1.9),lambda a:a.update(duration=10**500)])
def test_v2_saved_animation_in_unused_event_is_validated_without_discarding_tracks(change):
    saved=animated_tour();change(saved['events'][1]['state']['view']['animation'])
    before=copy.deepcopy(saved)
    with pytest.raises(GeometryError):tour_documents(saved)
    with pytest.raises(GeometryError):validate_tour(saved)
    assert saved==before


def test_v2_geometry_and_native_project_standalone_server_save_open_are_authoritative(tmp_path):
    from engine.server import dispatch
    saved=animated_tour();before=copy.deepcopy(saved)
    filename=tmp_path/'animated.polyproj'
    project_value=project();project_value['tour']=copy.deepcopy(saved)
    project_value['tour']['events'][1]['state']['model']['measure']={'content':999}
    save_project(filename,project_value);reopened=load_file(filename)['project']['tour']
    assert reopened['version']==2
    assert reopened['events'][1]['state']['model']['measure']['content']==pytest.approx(8)
    standalone=tmp_path/'animated.tour.json'
    dispatch({'op':'save-tour','params':{'tour':saved,'path':str(standalone)}})
    native=dispatch({'op':'load-tour','params':{'path':str(standalone)}})
    assert native==reopened and saved==before
    assert json.loads(standalone.read_text())==native
    invalid=copy.deepcopy(saved);invalid['events'][1]['state']['model']['faces'][0][0]=999
    with pytest.raises(GeometryError,match='invalid geometry'):validate_tour(invalid)
    with pytest.raises(GeometryError):dispatch({'op':'save-tour','params':{'tour':invalid,'path':str(standalone)}})
    assert json.loads(standalone.read_text())==native


def test_v2_actual_node_timeline_normalization_and_native_project_roundtrip(tmp_path):
    root=Path(__file__).resolve().parents[1]
    script="""import fs from 'node:fs';
import {normalizeAnimatedTour,prepareAnimatedTourTimeline,evaluateAnimatedTour} from './ui/animated-tour-timeline.mjs';
const original=JSON.parse(fs.readFileSync(0,'utf8'));
const tour=normalizeAnimatedTour(original),timeline=prepareAnimatedTourTimeline(tour,{loop:true});
const transition=evaluateAnimatedTour(timeline,2.375);
console.log(JSON.stringify({tour,duration:timeline.duration,phase:transition.phase,
 layers:transition.layers.map(layer=>({role:layer.role,modelId:layer.modelId,animation:layer.animation?.time}))}));"""
    original=validate_tour(animated_tour())
    result=subprocess.run(['node','--input-type=module','-e',script],input=json.dumps(original),
        text=True,capture_output=True,cwd=root,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0),check=True)
    node=json.loads(result.stdout)
    assert node['duration']==6.25 and node['phase']=='transition'
    assert [layer['role'] for layer in node['layers']]==['outgoing','incoming']
    assert [layer['animation'] for layer in node['layers']]==[2,0]
    for a,b in zip(node['tour']['events'],original['events']):
        assert a['state']==b['state'] and a['duration']==b['duration']
    # JS fills missing transition defaults. Those fields are checked and kept,
    # not collapsed to instant by either native project or standalone import.
    checked=validate_tour(node['tour']);assert checked==node['tour']
    project_value=project();project_value['tour']=checked
    filename=tmp_path/'node-animated.polyproj';save_project(filename,project_value)
    assert load_file(filename)['project']['tour']==checked


def test_v2_readable_renderer_domains_and_collapsed_float64_timeline_are_retained():
    saved=animated_tour()
    # Normal explosion plus an explosion transition is a renderer preflight
    # domain, not a reason to silently strip syntax-valid saved track data.
    saved['events'][0]['state']['view']['animation']['tracks']['explosion']['direction']='normal'
    saved['events'][1]['duration']=1e-100
    checked=validate_tour(saved)
    assert checked['events'][1]['duration']==1e-100
    assert checked['events'][0]['state']['view']['animation']['tracks']['explosion']['direction']=='normal'


@pytest.mark.parametrize('location',['id','metadata','transition'])
def test_v2_invalid_utf8_refuses_with_geometryerror_before_copy(location):
    saved=animated_tour()
    if location=='id':saved['events'][0]['id']='\ud800'
    elif location=='metadata':saved['events'][0]['state']['model']['metadata']['bad']='\udfff'
    else:saved['events'][0]['transition']['method']='\ud800'
    with pytest.raises(GeometryError,match='UTF-8'):tour_documents(saved)
    with pytest.raises(GeometryError,match='UTF-8'):validate_tour(saved)


@pytest.mark.parametrize('field',['angles','surfaceOpacity','perspectiveDistance4D','foldFraction'])
def test_v2_huge_view_integer_is_structured_in_standalone_and_project_paths(field,tmp_path):
    saved=animated_tour();view=saved['events'][1]['state']['view']
    view[field]=[0]*5+[10**500] if field=='angles' else 10**500
    with pytest.raises(GeometryError,match='finite'):validate_tour(saved)
    value=project();value['tour']=saved
    filename=tmp_path/'bad-view.polyproj'
    with pytest.raises(GeometryError,match='finite'):save_project(filename,value)
    assert not filename.exists()


def test_v2_literal_star_and_full_4d_cell_incidence_survive_native_save_and_node_json(tmp_path):
    vertices=[list(p) for p in product((-1,1),repeat=4)]
    index={tuple(p):i for i,p in enumerate(vertices)}
    faces=[]
    for axes in combinations(range(4),2):
        fixed=[i for i in range(4) if i not in axes]
        for signs in product((-1,1),repeat=2):
            face=[]
            for pair in ((-1,-1),(1,-1),(1,1),(-1,1)):
                p=[0]*4
                for a,b in zip(fixed,signs):p[a]=b
                for a,b in zip(axes,pair):p[a]=b
                face.append(index[tuple(p)])
            faces.append(face)
    cells=[[i for i,face in enumerate(faces) if all(vertices[v][axis]==sign for v in face)]
        for axis in range(4) for sign in (-1,1)]
    four={'id':'literal-tesseract','name':'Hand tesseract','dimension':4,'embeddingDimension':4,
        'interpretation':'generalized-complex','vertices':vertices,
        'edges':[[a,b] for a in range(16) for b in range(a+1,16)
            if sum(x!=y for x,y in zip(vertices[a],vertices[b]))==1],
        'faces':faces,'cells':cells,'numeric':{'mode':'float64-approximate','certified':False},
        'metadata':{'coordinateUnits':'mm','offColors':{'faces':[
            {'encoding':'byte','values':[i,80,210,127]} for i in range(24)],
            'cells':[{'encoding':'unit','values':[.1,.2,.3,(i+1)/9]} for i in range(8)]}}}
    import math
    star={'id':'literal-pentagram','name':'5/2','dimension':2,'embeddingDimension':2,
        'interpretation':'generalized-complex',
        'vertices':[[math.cos(2*math.pi*i/5),math.sin(2*math.pi*i/5)] for i in range(5)],
        'edges':[[0,2],[2,4],[4,1],[1,3],[3,0]],'faces':[[0,2,4,1,3]],'cells':[],
        'numeric':{'mode':'float64-approximate','certified':False},
        'metadata':{'rawSymbol':'5/2','coordinateUnits':'in',
            'offColors':{'faces':[{'encoding':'byte','values':[10,20,30,128]}],'cells':[]}}}
    saved={'version':2,'cursor':0,'events':[
        {'id':'four','duration':1,'transition':{'method':'shrink-grow','duration':.25},
            'state':{'model':four,'view':{'angles':[0]*6,'projection':'stereographic','coordinateUnit':'mm'},'notes':'four'}},
        {'id':'star','duration':1,'transition':{'method':'instant'},
            'state':{'model':star,'view':{'angles':[0]*6,'faceFillRule':'even-odd','coordinateUnit':'in'},'notes':'star'}}]}
    before=copy.deepcopy(saved);checked=validate_tour(saved);assert saved==before
    for event,expected in zip(checked['events'],before['events']):
        assert event['state']['model']['id']==expected['state']['model']['id']
        for field in ('vertices','edges','faces','cells','metadata'):
            assert event['state']['model'][field]==expected['state']['model'][field]
        assert 'measure' not in event['state']['model']
    node=subprocess.run(['node','-e',"const fs=require('fs');console.log(JSON.stringify(JSON.parse(fs.readFileSync(0,'utf8'))))"],
        input=json.dumps(checked),text=True,capture_output=True,check=True,
        creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    restored=validate_tour(json.loads(node.stdout));assert restored==checked
    value=project();value['tour']=restored;filename=tmp_path/'source-incidence.polyproj'
    save_project(filename,value);assert load_file(filename)['project']['tour']==restored
