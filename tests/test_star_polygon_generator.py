"""Native generator dispatch retains symbols through actual JSON-line transport."""
from copy import deepcopy
import json
import math
from pathlib import Path
import subprocess
import sys

import pytest

from engine.generators import generate
from engine.geometry import GeometryError, identity
from engine.server import dispatch


@pytest.mark.parametrize('symbol,cycles,winding', [('5/2',[[0,2,4,1,3]],2),('5/3',[[0,3,1,4,2]],-2),
                                                ('5/-3',[[0,2,4,1,3]],2),('6/2',[[0,2,4],[1,3,5]],1)])
def test_dispatch_literal_symbol_and_numeric_pair_preserve_same_full_geometry(symbol,cycles,winding):
    n,d=map(int,symbol.split('/'))
    request={'op':'generate','params':{'kind':'regular-star-polygon','symbol':symbol,'radius':2}}
    original=deepcopy(request)
    result=dispatch(request)
    paired=generate('regular-star-polygon',n=n,d=d,radius=2)
    assert result['faces']==cycles and identity(result)==identity(paired)
    assert result['metadata']['regularStarPolygon']['symbol']==symbol
    assert result['metadata']['regularStarPolygon']['originWindingPerCycle']==winding
    assert result['provenance']['parameters']=={'n':n,'d':d,'radius':2}
    assert request==original


def test_default_generator_is_pentagram_and_radius_expression_remains_a_separate_native_operation():
    assert generate('regular-star-polygon')['faces']==[[0,2,4,1,3]]
    evaluated=dispatch({'op':'expression','params':{'expression':'sqrt(2)'}})['value']
    generated=dispatch({'op':'generate','params':{'kind':'regular-star-polygon','symbol':'6/2','radius':evaluated}})
    assert generated['metadata']['regularStarPolygon']['radius']==math.sqrt(2)
    assert [len(generated[k]) for k in ('vertices','edges','faces','cells')]==[6,6,2,0]


@pytest.mark.parametrize('params,message', [({'symbol':'5/2','n':5},'not both'),({'symbol':'5/2','d':2},'not both'),
                                         ({'symbol':'5/2','method':'hull'},'Unknown'),({'d':2},'requires n'),
                                         ({'symbol':2.5},'literal'),({'symbol':'5/(1+1)'},'literal'),
                                         ({'symbol':'6/3'},'digon'),({'n':5.0,'d':2},'numerator'),
                                         ({'symbol':'5/2','radius':'sqrt(2)'},'radius')])
def test_ambiguous_arithmetic_and_unsupported_parameters_fail_explicitly(params,message):
    with pytest.raises(GeometryError,match=message):
        dispatch({'op':'generate','params':{'kind':'regular-star-polygon',**params}})


def test_actual_native_json_lines_keep_unreduced_cycles_and_continue_after_invalid_symbol():
    requests=[{'id':symbol,'op':'generate','params':{'kind':'regular-star-polygon','symbol':symbol}} for symbol in ('5/2','6/3','6/2','5/-3')]
    run=subprocess.run([sys.executable,'-m','engine.server'],input=''.join(json.dumps(request)+'\n' for request in requests),
                       text=True,encoding='utf-8',capture_output=True,cwd=Path(__file__).resolve().parents[1],timeout=30,check=True)
    assert not run.stderr
    replies=[json.loads(line) for line in run.stdout.splitlines()]
    assert [reply['id'] for reply in replies]==['5/2','6/3','6/2','5/-3']
    assert replies[0]['ok'] and replies[0]['result']['faces']==[[0,2,4,1,3]]
    assert not replies[1]['ok'] and replies[1]['type']=='GeometryError' and 'digon' in replies[1]['error']
    assert replies[2]['ok'] and replies[2]['result']['faces']==[[0,2,4],[1,3,5]] and len(replies[2]['result']['components'])==2
    assert replies[3]['ok'] and replies[3]['result']['metadata']['regularStarPolygon']['originWindingPerCycle']==2


def test_native_generated_compound_can_extract_and_delete_actual_source_leaf_ids():
    compound=dispatch({'op':'generate','params':{'kind':'regular-star-polygon','symbol':'9/3'}})
    source=deepcopy(compound)
    component=compound['components'][1]
    leaf=dispatch({'op':'compound-component','model':compound,'params':{'component_id':component['id']}})
    assert leaf['vertices']==[compound['vertices'][v] for v in component['maps']['vertices']] and leaf['faces']==[[0,1,2]]
    retained=dispatch({'op':'compound-drop','model':compound,'params':{'component_id':component['id']}})
    assert len(retained['vertices'])==6 and len(retained['faces'])==2
    assert [c['id'] for c in retained['components']]==[compound['components'][0]['id'],compound['components'][2]['id']]
    assert compound==source
