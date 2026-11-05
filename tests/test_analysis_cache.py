"""Analysis reuse must preserve complete results and literal source ownership."""
from copy import deepcopy
import json
from pathlib import Path
import subprocess
import sys
from unittest.mock import patch

import pytest

from engine.analysis_cache import AnalysisCache
from engine.generators import regular
from engine.geometry import analyze,GeometryError
from engine import server


def source(key='cube'):
    return json.loads(json.dumps(regular(key)))


@pytest.mark.parametrize('key',['cube','tesseract','cell24','small-stellated-dodecahedron'])
def test_complete_analysis_matches_original_and_cached_records_are_detached(key):
    model=source(key);before=deepcopy(model);expected=deepcopy(analyze(model));cache=AnalysisCache()
    with patch('engine.server.analyze',wraps=analyze) as original,patch.object(server,'analysis_cache',cache):
        first=server.dispatch(dict(op='analyze',model=model,params={}))
        assert first==expected
        first['validation']['passed']=False
        first['counts']['vertices']=-1
        first['numeric']['mode']='forged returned value'
        warm=server.dispatch(dict(op='analyze',model=deepcopy(before),params={}))
        assert warm==expected
        warm['numeric']['mode']='forged warm reply'
        warm['validation']['errors'].append('forged warm error')
        assert server.dispatch(dict(op='analyze',model=deepcopy(before),params={}))==expected
        assert original.call_count==1
    # Original analyze exposes the numeric record on its first result. Use the
    # pre-call source for the second request; cache storage must not alias either.
    assert before['numeric']['mode']!='forged returned value'


@pytest.mark.parametrize('change',[
    lambda m:m['vertices'][0].__setitem__(0,m['vertices'][0][0]+.1),
    lambda m:m['edges'][0].reverse(),
    lambda m:m['faces'][0].reverse(),
    lambda m:m['cells'][0].reverse(),
    lambda m:m.update(id='same geometry, different source'),
    lambda m:m['metadata'].update(coordinateUnits='cm'),
    lambda m:m['metadata'].update(embeddedAsset={'base64':'different bytes'}),
    lambda m:m.update(validation={'passed':True}),
    lambda m:m['numeric'].update(certified=True),
    lambda m:m.update(measure={'content':-123,'boundaryMeasure':-456}),
])
def test_literal_changes_recompute_without_trusting_fingerprints_reports_or_measure_caches(change):
    model=source('tesseract');cache=AnalysisCache()
    with patch('engine.server.analyze',wraps=analyze) as original,patch.object(server,'analysis_cache',cache):
        server.dispatch(dict(op='analyze',model=model,params={}))
        changed=deepcopy(model);change(changed)
        try:expected=analyze(changed)
        except GeometryError:
            with pytest.raises(GeometryError):server.dispatch(dict(op='analyze',model=changed,params={}))
        else:
            assert server.dispatch(dict(op='analyze',model=changed,params={}))==expected
            if 'measure' in changed:assert expected['measure']['content']>0
        assert original.call_count==2


def test_failed_analysis_does_not_enter_the_cache_and_valid_source_recovers():
    model=source();broken=deepcopy(model);broken['faces'][0][0]=999;broken['validation']={'passed':True}
    cache=AnalysisCache()
    with patch('engine.server.analyze',wraps=analyze) as original,patch.object(server,'analysis_cache',cache):
        for _ in range(2):
            with pytest.raises(GeometryError):server.dispatch(dict(op='analyze',model=broken,params={}))
        expected=server.dispatch(dict(op='analyze',model=model,params={}))
        assert server.dispatch(dict(op='analyze',model=model,params={}))==expected
        assert original.call_count==3


def test_entry_and_total_serialized_byte_bounds_use_lru_and_bypass_oversized_records():
    calls=[]
    def compute(value):calls.append(value);return {'result':value}
    cache=AnalysisCache(max_entries=2,max_key_bytes=80,max_result_bytes=80,max_total_bytes=100)
    for n in (1,2,1,3):assert cache.resolve({'n':n},compute)=={'result':{'n':n}}
    assert len(calls)==3 and len(cache.entries)==2
    cache.resolve({'n':2},compute);assert len(calls)==4
    for _ in range(2):cache.resolve({'large':'x'*100},compute)
    assert len(calls)==6 and cache.bytes<=100
    for options in ({'max_entries':0},{'max_key_bytes':1},{'max_result_bytes':1},{'max_total_bytes':1}):
        small=AnalysisCache(**options);before=len(calls)
        for _ in range(2):small.resolve({'n':1},compute)
        assert len(calls)==before+2 and not small.entries and small.bytes==0
    cache.clear();assert not cache.entries and cache.bytes==0


def test_total_bytes_evict_before_entry_count_and_oversized_results_never_displace_valid_work():
    calls=[]
    def compute(value):calls.append(value);return {'result':value}
    cache=AnalysisCache(max_entries=8,max_key_bytes=100,max_result_bytes=100,max_total_bytes=45)
    for n in (1,2,1,2):cache.resolve({'n':n},compute)
    assert len(calls)==4 and len(cache.entries)==1 and cache.bytes<=45
    def large_result(value):calls.append(value);return {'large':'x'*50}
    for _ in range(2):cache.resolve({'n':3},large_result)
    assert len(calls)==6 and len(cache.entries)==1 and cache.bytes<=45
    cache.resolve({'n':2},compute);assert len(calls)==6


def test_input_value_types_and_analyzer_identity_cannot_alias_cached_work():
    calls=[]
    def compute(value):calls.append(1);return {'type':str(type(value.get('value')))}
    cache=AnalysisCache()
    for value in ([1,2],(1,2),[1,2],(1,2),False,0,True,1,1.,'1'):
        assert cache.resolve({'value':value},compute)=={'type':str(type(value))}
    assert len(calls)==9  # Only the repeated list is eligible for the same entry.
    assert cache.resolve({'value':[1,2]},lambda value:{'different analyzer':True})=={'different analyzer':True}


def test_unsupported_direct_python_values_keep_the_original_uncached_behavior():
    calls=[]
    def compute(value):calls.append(1);return {'unchanged':True}
    cache=AnalysisCache();cycle={};cycle['self']=cycle
    for model in ({1:'numeric key'},{'object':object()},{'value':float('nan')},cycle):
        for _ in range(2):assert cache.resolve(model,compute)=={'unchanged':True}
    assert len(calls)==8 and not cache.entries
    def unsupported_result(value):calls.append(1);return {'value':float('nan')}
    for _ in range(2):assert cache.resolve({'valid':1},unsupported_result)['value']!=0
    assert len(calls)==10 and not cache.entries


def test_actual_jsonlines_worker_checks_an_edited_source_and_recovers_a_cached_valid_report():
    model=source('tesseract');broken=deepcopy(model);broken['faces'][0][0]=999
    requests=[dict(id=str(i),op='analyze',params={},model=m) for i,m in enumerate((model,model,broken,model))]
    proc=subprocess.run([sys.executable,'-B','-m','engine.server'],cwd=Path(__file__).resolve().parents[1],
                        input=''.join(json.dumps(r)+'\n' for r in requests),text=True,capture_output=True,timeout=30)
    assert proc.returncode==0,proc.stderr
    a,b,c,d=map(json.loads,proc.stdout.splitlines())
    assert a['ok'] and b['ok'] and not c['ok'] and d['ok']
    assert a['result']==b['result']==d['result']
