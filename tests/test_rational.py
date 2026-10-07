from itertools import product
import json
import pytest
from engine.rational import rational_hull,rational_dual
from engine.geometry import GeometryError,analyze
from engine.operations import transform
from engine.formats import save_project,load_file

def test_exhaustive_tesseract_certificate():
    model=rational_hull([list(v) for v in product((-1,1),repeat=4)])
    assert [len(model[k]) for k in ('vertices','edges','faces','cells')]==[16,32,24,8]
    assert model['certificate']['candidatePlaneCount']==1820
    assert model['certificate']['exactFacetCount']==8 and model['certificate']['exhausted']
    assert model['numeric']['certified'] and model['numeric']['measurementMode']=='float64-approximate'
    dual=rational_dual(model)
    assert [len(dual[k]) for k in ('vertices','edges','faces','cells')]==[8,24,32,16]
    twice=rational_dual(dual)
    assert {tuple(v) for v in twice['rationalCoordinates']}=={tuple(v) for v in model['rationalCoordinates']}

def test_decimal_input_means_supplied_values_not_intended_radicals(tmp_path):
    model=rational_hull([['0','0','0'],['0.1','0','0'],['0','0.2','0'],['0','0','1/3']])
    assert model['rationalCoordinates'][1][0]=='1/10'
    assert analyze(model)['measure']['content']==pytest.approx(1/900)
    project={'format':'polytope-laboratory','version':1,'active':0,'documents':[{'states':[{'model':model}],'cursor':0}]}
    path=tmp_path/'exact.polyproj';save_project(path,project)
    assert load_file(path)['project']['documents'][0]['states'][0]['model']['certificate']==model['certificate']
    t=transform(model,scale=2)
    assert t['numeric']['certified'] is False and 'rationalCoordinates' not in t

def test_exact_domain_limits_and_singular_center():
    with pytest.raises(GeometryError):rational_hull([[i,0,0] for i in range(33)])
    with pytest.raises(GeometryError):rational_hull([['bad',0,0],[1,0,0],[0,1,0],[0,0,1]])
    cube=rational_hull([list(v) for v in product((-1,1),repeat=3)])
    with pytest.raises(GeometryError):rational_dual(cube,center=[1,0,0])
