import copy
import math
import pytest
from engine.animation_state import validate_animation_sequence,animation_render_support
from engine.generators import regular
from engine.formats import save_project,load_file
from engine import server,element_annotations as content
from engine.geometry import GeometryError

def sequence():
    return {'version':3,'duration':1,'fps':2,'loop':False,'tracks':{'morphRatio':{'kind':'dual-morph','version':1}},'keyframes':[
        {'time':0,'angles':[0]*6,'sectionOffset':0,'morphRatio':0},
        {'time':1,'angles':[360,0,0,0,0,0],'sectionOffset':0,'morphRatio':1}]}

def test_native_v3_retention_and_strict_compatibility():
    seq=sequence();assert validate_animation_sequence(seq)==seq
    assert animation_render_support(seq,('morphRatio',))['supported']
    assert not animation_render_support(seq)['supported']
    for bad in (-1,2,False,float('nan')):
        altered=copy.deepcopy(seq);altered['keyframes'][0]['morphRatio']=bad
        with pytest.raises(GeometryError):validate_animation_sequence(altered)
    seq['version']=2
    with pytest.raises(GeometryError):validate_animation_sequence(seq)

def test_eight_methods_and_four_dimensional_eligibility_use_actual_different_packets():
    methods=['sizing','truncation','augmentation','expansion','tilting-quads','tilting-triangles','tilting-to-compound','tilting-to-rectify']
    for name,inventory in [('cube',methods),('tesseract',['expansion','tilting-quads'])]:
        source=regular(name);before=copy.deepcopy(source);context={'notes':'source','unit':'mm'}
        for method in inventory:
            settings={'version':1,'enabled':True,'method':method,'center':None,'radius':math.sqrt(2),'ratio':.25,'duration':1,'loop':False}
            prepared=server.dispatch({'op':'prepare-dual-morph','model':source,'params':{'settings':settings,'sourceContext':context}})
            frames=[server.dispatch({'op':'evaluate-dual-morph','model':source,'params':{'prepared':prepared,'ratio':r,'sourceContext':context}}) for r in (.25,.75)]
            assert frames[0]['model']['vertices']!=frames[1]['model']['vertices'],method
            assert frames[0]['binding']==frames[1]['binding']
            assert all(f['certified'] is False for f in frames)
        assert source==before

def test_project_and_animated_tour_save_open_keep_ratio_track_source_and_content(tmp_path):
    p=regular('cube');p['metadata']['coordinateUnits']='mm'
    doc=content.set_text(content.new_document(p),p,'vertex',0,'<b>Source label</b>')
    state={'model':p,'notes':'source','view':{'angles':[0]*6,'coordinateUnit':'mm','elementAnnotations':doc,'animation':sequence(),'dualMorph':{'version':1,'enabled':True,'method':'expansion','center':None,'radius':math.sqrt(2),'ratio':.25,'duration':1,'loop':False}}}
    project={'format':'polytope-laboratory','version':1,'active':0,'documents':[{'id':'source','cursor':0,'states':[state]}],'tour':{'version':2,'cursor':0,'events':[{'id':'morph','state':copy.deepcopy(state),'duration':1,'transition':{'method':'instant'}}]}}
    path=tmp_path/'animation.polyproj';save_project(path,project);opened=load_file(path)['project']
    for s in [opened['documents'][0]['states'][0],opened['tour']['events'][0]['state']]:
        assert s['view']['animation']==sequence()
        assert s['view']['elementAnnotations']==doc
        assert s['model']['vertices']==p['vertices'] and s['model']['faces']==p['faces']
        assert s['notes']=='source'
