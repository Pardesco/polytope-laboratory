"""Warm sizing must remain equivalent to native reconstruction and reject edits."""
from copy import deepcopy
import json
from pathlib import Path
import subprocess
import sys
from unittest.mock import patch

import pytest

from engine import dual_morph as morph
from engine.dual_morph_cache import PreparedSizingCache
from engine.generators import regular
from engine.geometry import GeometryError


CONTEXT={'notes':'Literal sizing notes','unit':'mm'}


def settings(method='sizing'):
    return dict(version=1,enabled=True,method=method,center=None,radius=1,ratio=0,duration=4,loop=False)


def request(model,prepared,ratio=.4,context=None):
    return dict(op='evaluate-dual-morph',model=model,params=dict(prepared=prepared,ratio=ratio,sourceContext=CONTEXT if context is None else context))


@pytest.fixture(autouse=True)
def clear_cache():
    morph._SIZING_CACHE.clear()
    yield
    morph._SIZING_CACHE.clear()


@pytest.mark.parametrize('key',['cube','tetrahedron','truncated-tetrahedron','cuboctahedron'])
def test_warm_sizing_matches_reconstructed_frames_and_retains_no_output_alias(key):
    model=regular(key);before=deepcopy(model)
    _,prepared=morph.prepare(model,settings(),CONTEXT)
    with patch.object(morph,'_SIZING_CACHE',PreparedSizingCache(max_key_bytes=0)):
        expected={ratio:morph.dispatch_dual_morph(request(model,prepared,ratio)) for ratio in (0,.125,.5,.875,1)}
    morph._SIZING_CACHE.clear()
    with patch.object(morph,'prepare',wraps=morph.prepare) as build:
        for ratio in (0,.125,.5,.875,1,.5,0):
            actual=morph.dispatch_dual_morph(request(model,prepared,ratio))
            assert actual==expected[ratio]
            actual['model']['vertices'][0][0]+=100
            actual['settings']['radius']=100
            actual['binding']['descriptorSha256']='forged output'
        assert build.call_count==1
    assert model==before


@pytest.mark.parametrize('change',[
    lambda m:m.update(id='changed'),
    lambda m:m['vertices'][0].__setitem__(0,m['vertices'][0][0]+.1),
    lambda m:m['faces'][0].reverse(),
    lambda m:m['metadata'].update(coordinateUnits='cm'),
    lambda m:m['metadata'].update(embeddedAsset={'base64':'different literal bytes'}),
    lambda m:m['vertices'][0].__setitem__(0,True),
])
def test_every_literal_source_change_refuses_the_old_preparation_even_when_ids_and_counts_match(change):
    model=regular('truncated-tetrahedron');_,prepared=morph.prepare(model,settings(),CONTEXT)
    morph.dispatch_dual_morph(request(model,prepared));change(model)
    with pytest.raises(GeometryError):morph.dispatch_dual_morph(request(model,prepared))


@pytest.mark.parametrize('context',[dict(CONTEXT,notes='edited'),dict(CONTEXT,unit='cm')])
def test_context_changes_never_hit_a_prior_native_preparation(context):
    model=regular('cube');_,prepared=morph.prepare(model,settings(),CONTEXT)
    morph.dispatch_dual_morph(request(model,prepared))
    with pytest.raises(GeometryError,match='changed|forged'):morph.dispatch_dual_morph(request(model,prepared,context=context))


@pytest.mark.parametrize('field',['radius','center','descriptor','sourceAttributesSha256','sourceContextSha256','descriptorSha256','extra'])
def test_forged_or_changed_preparations_cannot_poison_a_warm_entry(field):
    model=regular('cube');_,prepared=morph.prepare(model,settings(),CONTEXT)
    expected=morph.dispatch_dual_morph(request(model,prepared));forged=deepcopy(prepared)
    if field=='descriptor':forged['descriptor']['dual']['vertices'][0][0]+=1
    elif field in ('radius','ratio','duration'):forged['settings'][field]+=.1
    elif field=='center':forged['settings'][field][0]+=.1
    elif field in ('loop','enabled'):forged['settings'][field]=not forged['settings'][field]
    else:forged[field]='forged'
    with pytest.raises(GeometryError):morph.dispatch_dual_morph(request(model,forged))
    assert morph.dispatch_dual_morph(request(model,prepared))==expected


@pytest.mark.parametrize('field',['ratio','duration','loop','enabled'])
def test_valid_playback_settings_changes_reconstruct_instead_of_reusing_old_settings(field):
    model=regular('cube');_,prepared=morph.prepare(model,settings(),CONTEXT)
    original=morph.dispatch_dual_morph(request(model,prepared));changed=deepcopy(prepared)
    if field in ('ratio','duration'):changed['settings'][field]+=.1
    else:changed['settings'][field]=not changed['settings'][field]
    # These fields do not alter the geometric descriptor. The existing native
    # contract permits them, while the UI retains its stricter session ownership.
    with patch.object(morph,'_SIZING_CACHE',PreparedSizingCache(max_key_bytes=0)):
        expected=morph.dispatch_dual_morph(request(model,changed))
    with patch.object(morph,'prepare',wraps=morph.prepare) as build:
        assert morph.dispatch_dual_morph(request(model,changed))==expected
        assert morph.dispatch_dual_morph(request(model,prepared))==original
        assert build.call_count==2


def test_other_methods_reconstruct_and_alternating_sources_evict_the_single_entry():
    model=regular('cube');_,prepared=morph.prepare(model,settings('expansion'),CONTEXT)
    with patch.object(morph,'prepare',wraps=morph.prepare) as build:
        for ratio in (.3,.4):morph.dispatch_dual_morph(request(model,prepared,ratio))
        assert build.call_count==2
    a=regular('tetrahedron');b=regular('cube')
    _,pa=morph.prepare(a,settings(),CONTEXT);_,pb=morph.prepare(b,settings(),CONTEXT)
    with patch.object(morph,'prepare',wraps=morph.prepare) as build:
        for m,p in ((a,pa),(a,pa),(b,pb),(a,pa)):morph.dispatch_dual_morph(request(m,p))
        assert build.call_count==3


@pytest.mark.parametrize('limit',['max_key_bytes','max_prepared_bytes'])
def test_oversized_cache_inputs_compute_normally_without_retaining_an_entry(limit):
    model=regular('cube');_,prepared=morph.prepare(model,settings(),CONTEXT)
    cache=PreparedSizingCache(**{limit:1})
    with patch.object(morph,'_SIZING_CACHE',cache),patch.object(morph,'prepare',wraps=morph.prepare) as build:
        first=morph.dispatch_dual_morph(request(model,prepared));second=morph.dispatch_dual_morph(request(model,prepared))
        assert first==second;assert build.call_count==2;assert cache._entry is None


def test_actual_jsonlines_worker_survives_a_forged_warm_request_then_returns_the_exact_valid_frame():
    model=regular('truncated-tetrahedron');_,prepared=morph.prepare(model,settings(),CONTEXT)
    forged=deepcopy(prepared);forged['descriptor']['radius']=99
    requests=[request(model,p) for p in (prepared,forged,prepared)]
    for i,r in enumerate(requests):r['id']=str(i)
    proc=subprocess.run([sys.executable,'-B','-m','engine.server'],cwd=Path(__file__).resolve().parents[1],
                        input=''.join(json.dumps(r)+'\n' for r in requests),text=True,capture_output=True,timeout=30)
    assert proc.returncode==0,proc.stderr
    a,b,c=map(json.loads,proc.stdout.splitlines())
    assert a['ok'] is True and b['ok'] is False and c['ok'] is True
    assert a['result']==c['result']
