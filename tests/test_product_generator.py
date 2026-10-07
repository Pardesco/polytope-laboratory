"""Native literal product dispatch and actual JSON-line continuation."""
from copy import deepcopy
import json
import math
from pathlib import Path
import subprocess
import sys

import pytest

from engine.formats import validate_project
from engine.generators import generate
from engine.geometry import GeometryError, identity
from engine.products import polygon_product
from engine.server import dispatch


@pytest.mark.parametrize('left,right,expected,parts', [
    ('4','4',[16,32,24,8],1),('5/2','3',[15,30,23,8],1),
    ('5/3','5/-3',[25,50,35,10],1),('6/2','3',[18,36,30,12],2),
    ('6/-2','6/2',[36,72,60,24],4)])
def test_actual_native_generate_retains_literal_factors_source_geometry_and_partition_counts(left,right,expected,parts):
    params={'kind':'polygon-product','left':{'symbol':left,'radius':2},'right':{'symbol':right,'radius':3}}
    request={'op':'generate','params':params};original=deepcopy(request)
    result=dispatch(request)
    a=generate('regular-star-polygon',symbol=left,radius=2)
    b=generate('regular-star-polygon',symbol=right,radius=3)
    assert identity(result)==identity(polygon_product(a,b))
    assert [len(result[k]) for k in ('vertices','edges','faces','cells')]==expected
    info=result['metadata']['orderedProduct']
    assert len(info['componentPartitions'])==parts and info['recoverableCompoundComponents'] is True
    assert len(result['components'])==parts
    assert info['sourceModels'][0]['faces']==a['faces'] and info['sourceModels'][1]['faces']==b['faces']
    assert info['sourceModels'][0]['metadata']['regularStarPolygon']['symbol']==a['metadata']['regularStarPolygon']['symbol']
    assert info['sourceModels'][1]['metadata']['regularStarPolygon']['symbol']==b['metadata']['regularStarPolygon']['symbol']
    assert result['provenance']['generator']=={'kind':'polygon-product','parameters':{k:v for k,v in params.items() if k!='kind'}}
    assert request==original and not result['numeric']['certified']
    if (left,right)==('4','4'):
        assert result['interpretation']=='convex-polytope'
        # Independent product content/boundary references for radii 2 and 3.
        assert result['measure']['content']==pytest.approx(8*18)
        assert result['measure']['boundaryMeasure']==pytest.approx(240*math.sqrt(2))
        assert result['metadata']['constructionFinalization']['classification']['status']=='passed'
    else:
        assert result['interpretation']=='generalized-complex' and 'measure' not in result


def test_explicit_numeric_pairs_equal_symbols_without_reducing_common_factors():
    paired=generate('polygon-product',left={'n':6,'d':2,'radius':2},right={'n':5,'d':-3,'radius':1})
    symbol=generate('polygon-product',left={'symbol':'6/2','radius':2},right={'symbol':'5/-3','radius':1})
    assert identity(paired)==identity(symbol)
    assert [s['metadata']['regularStarPolygon']['symbol'] for s in paired['metadata']['orderedProduct']['sourceModels']]==['6/2','5/-3']


@pytest.mark.parametrize('params,message', [
    ({},'left factor'),({'left':{'symbol':'4'}},'right factor'),
    ({'left':'5/2','right':{'symbol':'3'}},'left factor'),
    ({'left':{'symbol':'5/2'},'right':None},'right factor'),
    ({'left':{},'right':{'symbol':'3'}},'requires a literal'),
    ({'left':{'d':2},'right':{'symbol':'3'}},'requires a literal'),
    ({'left':{'symbol':'5/2','n':5},'right':{'symbol':'3'}},'not both'),
    ({'left':{'symbol':'5/2','d':2},'right':{'symbol':'3'}},'not both'),
    ({'left':{'symbol':'5/2'},'right':{'symbol':'3','height':1}},'Unknown'),
    ({'left':{'symbol':'5/2','hull':True},'right':{'symbol':'3'}},'Unknown'),
    ({'left':{'symbol':'5/(1+1)'},'right':{'symbol':'3'}},'literal'),
    ({'left':{'symbol':'6/3'},'right':{'symbol':'3'}},'digon'),
    ({'left':{'n':5.0,'d':2},'right':{'symbol':'3'}},'numerator'),
    ({'left':{'symbol':'5/2','radius':'sqrt(2)'},'right':{'symbol':'3'}},'radius'),
    ({'left':{'symbol':'5/2','radius':True},'right':{'symbol':'3'}},'radius'),
    ({'left':{'symbol':'64'},'right':{'symbol':'64'}},'4000'),
    ({'left':{'symbol':'4'},'right':{'symbol':'4'},'n':4},'Unknown'),
    ({'left':{'symbol':'4',9:'invalid'},'right':{'symbol':'4'}},'names must be strings')])
def test_malformed_unknown_ambiguous_or_unbounded_generator_requests_fail_atomically(params,message):
    original=deepcopy(params)
    with pytest.raises(GeometryError,match=message):
        generate('polygon-product',**params)
    assert params==original


def test_expression_radius_is_evaluated_separately_and_product_model_survives_native_project_validation():
    radius=dispatch({'op':'expression','params':{'expression':'sqrt(4)'}})['value']
    result=dispatch({'op':'generate','params':{'kind':'polygon-product','left':{'symbol':'6/2','radius':radius},'right':{'symbol':'3','radius':1}}})
    assert result['metadata']['orderedProduct']['sourceModels'][0]['vertices'][0]==[2,0]
    original=deepcopy(result)
    project={'format':'polytope-laboratory','version':1,'active':0,'documents':[{
        'id':'literal-product-document','cursor':0,'states':[{'model':result,'view':{},'notes':'Product source'}]}]}
    restored=validate_project(json.loads(json.dumps(project,allow_nan=False)))['documents'][0]['states'][0]['model']
    assert identity(restored)==identity(result) and restored['metadata']['orderedProduct']==result['metadata']['orderedProduct']
    assert restored['provenance']['generator']==result['provenance']['generator'] and result==original


def test_actual_json_line_transport_continues_after_rejected_product_without_partial_model():
    requests=[{'id':symbol,'op':'generate','params':{'kind':'polygon-product','left':{'symbol':symbol,'radius':1},'right':{'symbol':'3','radius':2}}}
              for symbol in ('5/2','6/3','6/2','5/-3')]
    run=subprocess.run([sys.executable,'-m','engine.server'],input=''.join(json.dumps(request)+'\n' for request in requests),
                       text=True,encoding='utf-8',capture_output=True,cwd=Path(__file__).resolve().parents[1],timeout=30,check=True)
    assert not run.stderr
    replies=[json.loads(line) for line in run.stdout.splitlines()]
    assert [reply['id'] for reply in replies]==['5/2','6/3','6/2','5/-3']
    assert replies[0]['ok'] and replies[2]['ok'] and replies[3]['ok']
    assert not replies[1]['ok'] and replies[1]['type']=='GeometryError' and 'digon' in replies[1]['error'] and 'result' not in replies[1]
    assert len(replies[2]['result']['metadata']['orderedProduct']['componentPartitions'])==2
    assert replies[3]['result']['metadata']['orderedProduct']['sourceModels'][0]['faces']==[[0,2,4,1,3]]
