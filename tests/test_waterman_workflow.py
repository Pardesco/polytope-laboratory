"""Actual strict JSON generators, native projects and hidden engine protocol."""
from copy import deepcopy
from fractions import Fraction
import json
from pathlib import Path
import subprocess
import sys

import pytest

from engine.geometry import GeometryError, identity
from engine.history import canonical_model
from engine.server import dispatch


KINDS=('vertices','edges','faces','cells')


def counts(model):return tuple(len(model[kind]) for kind in KINDS)
def info(model):return model['metadata']['watermanFcc']
def generate(kind,**params):return dispatch({'op':'generate','params':{'kind':kind,**params}})


def document(model):
    return {'id':'waterman-source','cursor':0,'states':[{'model':model,'view':{'coordinateUnit':'mm'},
        'notes':'Exact ball membership; approximate convex hull'}]}


def project(model):
    return {'format':'polytope-laboratory','version':1,'active':0,'documents':[document(model)]}


@pytest.mark.parametrize('kind,params,expected_counts,selected',[
    ('waterman-root',{'root':1},(12,24,14,0),13),
    ('waterman-root',{'root':2},(6,12,8,0),19),
    ('waterman-fcc',{'radius_squared':'3/4','center':['1/2','1/2','1/2']},(4,6,4,0),4),
    ('waterman-fcc',{'radius_squared':{'numerator':10,'denominator':8},'center':[0,0,{'numerator':1,'denominator':2}]},(5,8,5,0),5),
    ('waterman-fcc',{'radius_squared':3,'center':[1,0,0]},(8,12,6,0),14)])
def test_actual_json_generator_preserves_original_params_and_source_ids(kind,params,expected_counts,selected):
    request={'op':'generate','params':{'kind':kind,**params}};before=deepcopy(request)
    result=dispatch(request)
    assert counts(result)==expected_counts and info(result)['selectedPointCount']==selected
    assert result['provenance']['generator']=={'kind':kind,'parameters':params}
    assert result['numeric']['certified'] is False and info(result)['selectionCertificate']['certified'] is True
    assert result['interpretation']=='convex-polytope'
    assert info(result)['sourceModelId']==result['id'] and info(result)['sourceFingerprint']==identity(result)
    assert request==before
    restored=dispatch({'op':'validate-project','params':{'project':json.loads(json.dumps(project(result),allow_nan=False))}})['documents'][0]['states'][0]['model']
    assert canonical_model(restored)==canonical_model(result)
    assert restored['metadata']==result['metadata'] and restored['provenance']==result['provenance']


def test_default_new_apis_and_legacy_squared_radius_have_same_geometry_but_separate_semantics():
    root=generate('waterman-root');fcc=generate('waterman-fcc');legacy=generate('waterman',radiusSquared=10)
    assert canonical_model(root)==canonical_model(fcc)==canonical_model(legacy)
    assert info(root)['authorRoot']==5 and info(root)['sourceSnapshot']['radiusSquared']=='10'
    assert 'authorRoot' not in info(fcc)
    assert legacy['metadata']['radiusSquared']==10 and 'watermanFcc' not in legacy['metadata']
    assert root['provenance']['generator']=={'kind':'waterman-root','parameters':{}}
    assert fcc['provenance']['generator']=={'kind':'waterman-fcc','parameters':{}}
    root_ten=generate('waterman-root',root=10)
    # Different roots can share a face-count/topology class; coordinates and
    # explicit thresholds distinguish the literal constructions.
    assert info(root_ten)['sourceSnapshot']['radiusSquared']=='20'
    assert root_ten['vertices']!=legacy['vertices'] and identity(root_ten)!=identity(legacy)


def test_actual_save_load_analyze_and_export_keep_exact_selection_scope(tmp_path):
    params={'radius_squared':{'numerator':6,'denominator':8},'center':['2/4','3/6','4/8']}
    model=generate('waterman-fcc',**params);before=deepcopy(model)
    analysis=dispatch({'op':'analyze','model':model})
    assert analysis['counts']==dict(zip(KINDS,(4,6,4,0))) and analysis['measure']['content']==pytest.approx(1/3)
    assert analysis['numeric']['certified'] is False
    path=tmp_path/'waterman-native.json'
    saved=dispatch({'op':'save','params':{'path':str(path),'project':project(deepcopy(model))}})
    assert saved['path']==str(path)
    restored=dispatch({'op':'load','params':{'path':str(path)}})['project']['documents'][0]['states'][0]['model']
    assert restored['metadata']==before['metadata'] and restored['provenance']==before['provenance']
    assert canonical_model(restored)==canonical_model(before) and model==before
    assert restored['provenance']['generator']['parameters']==params
    # JSON geometry export retains the complete candidate evidence; the legacy
    # OFF boundary format does not promise generator metadata persistence.
    exported=dispatch({'op':'export','model':model,'params':{'format':'json'}})['text']
    assert json.loads(exported)['metadata']==before['metadata']


def test_exact_fraction_threshold_survives_real_json_dispatch_without_binary_rounding():
    denominator=10**40
    below=generate('waterman-fcc',radius_squared=f'{4*denominator-1}/{denominator}')
    shell=generate('waterman-fcc',radius_squared=4)
    assert float(Fraction(4*denominator-1,denominator))==4.0
    assert counts(below)==(12,24,14,0) and counts(shell)==(6,12,8,0)
    assert info(below)['selectedPointCount']==13 and info(shell)['selectedPointCount']==19
    assert below['provenance']['generator']['parameters']['radius_squared']==f'{4*denominator-1}/{denominator}'


@pytest.mark.parametrize('kind,params',[
    ('waterman-fcc',{'radius_squared':4.0}),('waterman-fcc',{'radius_squared':'1/0'}),
    ('waterman-fcc',{'radius_squared':{'numerator':2**300,'denominator':2**300}}),
    ('waterman-fcc',{'center':[0,0,.5]}),('waterman-fcc',{'center':[0,0]}),
    ('waterman-fcc',{'radius_squared':10**500}),('waterman-fcc',{'face_colors':[]}),
    ('waterman-fcc',{'radiusSquared':2}),('waterman-fcc',{'root':1}),
    ('waterman-fcc',{'dimension':4}),('waterman-fcc',{'lattice':'BCC'}),
    ('waterman-root',{'root':True}),('waterman-root',{'root':1.0}),
    ('waterman-root',{'root':'1'}),('waterman-root',{'root':10**500}),
    ('waterman-root',{'center':[0,0,0]}),('waterman-root',{'radius_squared':2})])
def test_actual_strict_refusal_is_atomic_and_next_good_generation_succeeds(kind,params):
    request={'op':'generate','params':{'kind':kind,**params}};before=deepcopy(request)
    with pytest.raises(GeometryError):dispatch(request)
    assert request==before
    assert counts(generate('waterman-root',root=1))==(12,24,14,0)


def test_json_generator_refuses_python_fraction_even_though_isolated_kernel_accepts_it():
    from engine.waterman import waterman_fcc
    assert counts(waterman_fcc(Fraction(2)))==(12,24,14,0)
    request={'op':'generate','params':{'kind':'waterman-fcc','radius_squared':Fraction(2)}}
    with pytest.raises(GeometryError):dispatch(request)


def test_hidden_real_json_lines_protocol_retains_exact_evidence_after_errors():
    source=generate('waterman-root',root=1)
    requests=[{'id':'root','op':'generate','params':{'kind':'waterman-root','root':2}},
              {'id':'bad','op':'generate','params':{'kind':'waterman-fcc','radius_squared':4.0}},
              {'id':'huge','op':'generate','params':{'kind':'waterman-root','root':10**500}},
              {'id':'native','op':'validate-project','params':{'project':project(source)}},
              {'id':'offset','op':'generate','params':{'kind':'waterman-fcc','radius_squared':'3/4','center':['1/2']*3}},
              {'id':'legacy','op':'generate','params':{'kind':'waterman','radiusSquared':10}}]
    process=subprocess.run([sys.executable,'-m','engine.server'],
        input=''.join(json.dumps(request,allow_nan=False)+'\n' for request in requests),text=True,encoding='utf-8',
        capture_output=True,cwd=Path(__file__).resolve().parents[1],timeout=30,check=True,
        creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    assert not process.stderr
    replies=[json.loads(line) for line in process.stdout.splitlines()]
    assert [reply['id'] for reply in replies]==['root','bad','huge','native','offset','legacy']
    assert [reply['ok'] for reply in replies]==[True,False,False,True,True,True]
    assert replies[1]['type']==replies[2]['type']=='GeometryError'
    assert counts(replies[0]['result'])==(6,12,8,0)
    restored=replies[3]['result']['documents'][0]['states'][0]['model']
    assert info(restored)==info(source) and canonical_model(restored)==canonical_model(source)
    assert counts(replies[4]['result'])==(4,6,4,0) and info(replies[4]['result'])['selectionCertificate']['certified'] is True
    assert replies[4]['result']['numeric']['certified'] is False
    assert replies[5]['result']['metadata']['radiusSquared']==10 and 'watermanFcc' not in replies[5]['result']['metadata']
