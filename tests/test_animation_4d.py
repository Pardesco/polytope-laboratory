from copy import deepcopy
from collections import Counter
from functools import lru_cache
import json
import numpy as np
import pytest
from scipy.spatial import cKDTree
from engine.generators import regular
from engine.geometry import validate, identity, GeometryError
from engine.operations import dual
from engine.server import dispatch
from engine.dual_morph_4d import ConvexMorph4D
from engine.dual_morph_colors import mix_rgba
from engine.formats import save_project, load_file
from engine.tours import validate_tour

KINDS=('vertices','edges','faces','cells')
CONTEXT={'unit':'mm','notes':'Retained notes'}
RED={'encoding':'byte','values':[255,0,0,128]}
BLUE={'encoding':'float','values':[0,0,1,.25]}


@lru_cache(None)
def source(key):return regular(key)


def settings(method='sizing',**options):
    return dict(version=1,enabled=True,method=method,center=None,radius=2**.5,ratio=0,duration=2,loop=False,**options)


def prepare(p,s):return dispatch({'op':'prepare-dual-morph','model':p,'params':{'settings':s,'sourceContext':CONTEXT}})
def evaluate(p,prepared,t):return dispatch({'op':'evaluate-dual-morph','model':p,'params':{'prepared':prepared,'ratio':t,'sourceContext':CONTEXT}})


@pytest.mark.parametrize('key,expected',[('tesseract',(8,24,32,16)),('cross4',(16,32,24,8)),('cell24',(24,96,96,24)),
                                      ('cell120',(120,720,1200,600)),('cell600',(600,1200,720,120))])
@pytest.mark.parametrize('method',['sizing','truncation'])
def test_convex_4d_endpoints_incidence_and_monotone_parameters(key,expected,method):
    p=source(key);before=deepcopy(p);prepared=prepare(p,settings(method))
    first=evaluate(p,prepared,0);last=evaluate(p,prepared,1)
    assert first['model']==p
    assert last['model']==prepared['descriptor']['dual']
    assert tuple(len(last['model'][k]) for k in KINDS)==expected
    assert last['maximumPolarityResidual']<1e-10
    independent=dual(p,radius=2**.5)
    distance,mapping=cKDTree(independent['vertices']).query(last['model']['vertices'])
    assert max(distance)<1e-9 and len(set(mapping))==len(mapping)
    scales=[]
    for t in [.125,.25,.5,.75,.875]:
        f=evaluate(p,prepared,t);m=f['model']
        assert f['ratio']==t and not f['certified'] and validate(m)['passed']
        assert all(len(f['sourceMaps'][k])==len(m[k]) for k in KINDS)
        assert len(m['vertices'])-len(m['edges'])+len(m['faces'])-len(m['cells'])==0
        assert set(Counter(f for C in m['cells'] for f in C).values())=={2}
        if method=='truncation':
            scales.append((f['statistics']['sourceScale'],f['statistics']['reciprocalScale']))
            assert f['statistics']['maximumHalfspaceViolation']<1e-9
            assert len(f['statistics']['activePlaneVertexSets'])==len(m['vertices'])
        else:
            assert [layer['scale'] for layer in f['layers']]==[1-t,t]
            n=len(p['vertices']);center=np.array(prepared['settings']['center'])
            assert np.allclose(m['vertices'][:n],center+(np.array(p['vertices'])-center)*(1-t))
    assert all(a[0]<=b[0] and a[1]>=b[1] for a,b in zip(scales,scales[1:]))
    assert evaluate(p,prepared,.25)==evaluate(p,prepared,.25)
    assert p==before


def test_4d_domains_center_and_transition_residual_guards():
    p=deepcopy(source('tesseract'))
    with pytest.raises(GeometryError,match='support|center|outside'):prepare(p,{**settings(), 'center':[10,0,0,0]})
    p['interpretation']='generalized-complex'
    with pytest.raises(GeometryError,match='convex'):prepare(p,settings())
    plan=ConvexMorph4D({'model':source('tesseract')},radius=2**.5,method='truncation')
    with pytest.raises(GeometryError,match='transition'):plan.evaluate(.5+1e-9)
    with pytest.raises(GeometryError,match='ratios'):plan.evaluate(1.1,clamp=False)


def test_normalized_rgba_interpolates_alpha_and_refuses_indexed_palettes():
    assert mix_rgba(RED,BLUE,.25)['values']==pytest.approx([.75,0,.25,.75*128/255+.25*.25])
    assert mix_rgba(RED,BLUE,0)['values']==pytest.approx([1,0,0,128/255])
    assert mix_rgba(RED,BLUE,1)==BLUE
    with pytest.raises(GeometryError,match='indexed'):mix_rgba({'encoding':'index','values':[2]},BLUE,.5)


@pytest.mark.parametrize('key,method',[('cube','sizing'),('cube','truncation'),('cube','expansion'),('tesseract','sizing'),('tesseract','truncation'),('tesseract','expansion')])
def test_authored_face_to_reciprocal_face_colors_and_literal_endpoints(key,method):
    p=deepcopy(source(key));p['metadata']['offColors']={'faces':[RED]*len(p['faces']),KINDS[p['dimension']-3]:[BLUE]*len(p[KINDS[p['dimension']-3]])}
    prepared=prepare(p,settings(method,interpolateColors=True));frame=evaluate(p,prepared,.25)
    assert prepared['settings']['interpolateColors'] is True
    assert evaluate(p,prepared,0)['model']==p
    assert evaluate(p,prepared,1)['model']==prepared['descriptor']['dual']
    target=RED if method=='expansion' else BLUE
    expected=mix_rgba(RED,target,.25)['values']
    for k in KINDS:
        assert len(frame['model']['metadata']['offColors'][k])==len(frame['model'][k])
        for color in frame['model']['metadata']['offColors'][k]:
            assert color['values']==pytest.approx(expected)


def test_colors_persist_in_project_and_native_binding(tmp_path):
    p=source('tesseract');prepared=prepare(p,settings(interpolateColors=True))
    project={'format':'polytope-laboratory','version':1,'active':0,'documents':[{'cursor':0,'states':[{'model':deepcopy(p),'notes':CONTEXT['notes'],'view':{'dualMorph':prepared['settings']}}]}]}
    path=tmp_path/'colors.polyproj';save_project(path,project);loaded=load_file(path)
    assert loaded['project']['documents'][0]['states'][0]['view']['dualMorph']['interpolateColors'] is True
    forged=deepcopy(prepared);forged['settings']['interpolateColors']=False
    with pytest.raises(GeometryError,match='forged'):evaluate(p,forged,.5)
    with pytest.raises(GeometryError,match='boolean'):prepare(p,settings(interpolateColors=1))


@pytest.mark.parametrize('key',['cube','tesseract','cell120'])
def test_native_dual_tour_validates_coordinates_full_incidence_and_saved_roundtrip(key):
    p=source(key);q=dual(p,radius=1.25)
    request={'op':'verify-dual-tour','model':p,'params':{'target':q}}
    result=dispatch(request);assert result['verified'] and result['maximumCoordinateResidual']<1e-10
    bank={'version':2,'cursor':0,'events':[{'id':'p','duration':1,'state':{'model':deepcopy(p),'view':{}},'transition':{'method':'morph-to-dual'}},
          {'id':'q','duration':1,'state':{'model':q,'view':{}},'transition':{'method':'instant'}}]}
    assert validate_tour(json.loads(json.dumps(bank)))['events'][0]['transition']['method']=='morph-to-dual'
    wrong=deepcopy(q);wrong['vertices'][0][0]+=.01;wrong['fingerprint']=identity(wrong)
    with pytest.raises(GeometryError):dispatch({**request,'params':{'target':wrong}})
    wrong=deepcopy(q);wrong['faces'][0]=wrong['faces'][0][::2]+wrong['faces'][0][1::2]
    if len(q['faces'][0])>3:
        with pytest.raises(GeometryError):dispatch({**request,'params':{'target':wrong}})
    wrong=deepcopy(q);wrong['provenance']['sourceFingerprint']='0'*64
    with pytest.raises(GeometryError,match='native dual'):dispatch({**request,'params':{'target':wrong}})
