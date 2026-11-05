from collections import Counter
import numpy as np
import pytest
from scipy.spatial import cKDTree
from engine.catalog import get_catalog
from engine.compound4 import compound4_catalog, frame_group, load_compound4
from engine.formats import load_file, save_project
from engine.generators import vertices600
from engine.geometry import GeometryError, canonical_cycle, hull, identity, validate
from engine.history import canonical_model
from engine.server import dispatch

KINDS=('vertices','edges','faces','cells')


@pytest.mark.parametrize('entry',compound4_catalog(),ids=lambda e:e['key'])
def test_native_counts_ownership_and_frame_relationship(entry):
    model=dispatch({'op':'generate','params':{'kind':'regular','key':entry['key']}})
    assert [len(model[k]) for k in KINDS]==entry['counts']
    assert len(model['components'])==entry['componentCount']
    assert len({c['id'] for c in model['components']})==entry['componentCount']
    for kind in KINDS:
        owned=[i for c in model['components'] for i in c['maps'][kind]]
        assert sorted(owned)==list(range(len(model[kind])))
    evidence=model['metadata']['compound4Evidence']
    assert evidence['resultFingerprint']==identity(model)
    assert evidence['closureVerified'] and evidence['closureResidual']<1e-8
    if entry.get('vertexTransitive'):assert evidence['verifiedVertexOccurrenceOrbitSize']==entry['counts'][0]
    else:assert evidence['verifiedVertexOccurrenceOrbitSize']<entry['counts'][0]
    frame=vertices600() if entry['frameKey']=='cell600' else vertices600()[:24] if entry['frameKey']=='cell24' else np.array(model['vertices'])
    distances,ids=cKDTree(frame).query(model['vertices'])
    assert max(distances)<1e-8
    assert len(set(ids))==evidence['distinctVertexCount']
    assert set(Counter(ids).values())=={evidence['vertexMultiplicity']}
    assert validate(model)['passed'] and model['numeric']['certified'] is False
    report=dispatch({'op':'polychoron-relationships','params':{},'model':model})
    assert report['componentCount']==entry['componentCount'] and not report['disconnectedVertexIds']
    # Rebuild selected constituent hulls independently, including cyclic faces.
    for component in [model['components'][0],model['components'][-1]]:
        vs=component['maps']['vertices'];reverse={v:i for i,v in enumerate(vs)}
        reference=hull(np.asarray(model['vertices'])[vs])
        faces=[canonical_cycle([reverse[v] for v in model['faces'][f]]) for f in component['maps']['faces']]
        assert set(faces)=={canonical_cycle(f) for f in reference['faces']}


@pytest.mark.parametrize('name,order',[('B4',384),('F4',1152),('2I-left',120),('H4',14400)])
def test_generating_group_closure_and_component_action(name,order):
    frame,group,actions,evidence=frame_group(name)
    assert len(group)==order and len({tuple(a) for a in actions})==order
    assert np.max(abs(group@group.transpose(0,2,1)-np.eye(4)))<1e-8
    lookup={tuple(a) for a in actions}
    for generator in evidence['generatorMatrices']:
        distance,p=cKDTree(frame).query(frame@np.asarray(generator).T)
        assert max(distance)<1e-8
        assert all(tuple(p[a]) in lookup for a in actions)
        for entry in compound4_catalog():
            if name not in entry['symmetryGroups']:continue
            model=load_compound4(entry['key'])
            _,ids=cKDTree(frame).query(model['vertices'])
            components={tuple(sorted(ids[c['maps']['vertices']])) for c in model['components']}
            assert {tuple(sorted(p[list(c)])) for c in components}==components


def test_big_compound_project_save_open_history_and_extraction(tmp_path):
    model=load_compound4('compound4-seventy-five-tesseracts')
    doc={'id':'compound','cursor':0,'states':[{'model':model,'view':{},'notes':'Retain the frame relationship.'}]}
    edited=dispatch({'op':'recipe-run','params':{'document':doc,'operation':'compound-component',
        'parameters':{'component_id':model['components'][-1]['id']}}})
    assert doc['cursor']==0 and len(doc['states'])==1
    assert edited['cursor']==1 and len(edited['states'])==2
    assert len(edited['states'][1]['model']['vertices'])==16
    project={'format':'polytope-laboratory','version':1,'active':0,'documents':[edited]}
    path=tmp_path/'compound.polytope';save_project(path,project)
    restored=load_file(path)['project']['documents'][0]
    assert restored['states'][0]['model']['components']==model['components']
    assert restored['states'][0]['model']['metadata']['compound4Evidence']==model['metadata']['compound4Evidence']
    replay=dispatch({'op':'recipe-replay','params':{'document':restored}})
    assert canonical_model(replay['states'][0]['model'])==canonical_model(restored['states'][1]['model'])
    restored['cursor']=0;assert len(restored['states'][restored['cursor']]['model']['components'])==75
    restored['cursor']=1;assert len(restored['states'][restored['cursor']]['model']['vertices'])==16


def test_catalog_keys_and_cache_are_independent():
    entries=get_catalog();assert len({r['key'] for r in entries})==len(entries)
    by_key={r['key']:r for r in entries}
    for entry in compound4_catalog():assert by_key[entry['key']]['family']=='4D compounds'
    for key in ['compound-five-24-cells','compound-two-24-cells','compound-tesseract-16-cell']:
        assert by_key[key]['family']=='4D compounds'
    a=load_compound4('compound4-two-16-cells');b=load_compound4('compound4-two-16-cells')
    a['vertices'][0][0]=999
    assert b['vertices'][0][0]!=999
    with pytest.raises(GeometryError,match='Unknown'):load_compound4('compound4-no-such-compound')
