from collections import Counter
from copy import deepcopy
from unittest.mock import patch
import numpy as np
import pytest
from engine.formats import validate_project
from engine.catalog import load_catalog_model
from engine.geometry import GeometryError, identity, validate
from engine.generators import regular
from engine.library_navigation import navigation_metadata
from engine.polychoron_relationships import classification_metadata, relationships
from engine.scaliform4 import scaliform4_catalog, load_scaliform4
from engine.server import dispatch
from engine.symmetry import geometric_symmetry


@pytest.mark.parametrize('entry,order',[(scaliform4_catalog()[0],48),(scaliform4_catalog()[1],16)],ids=['tuta','koho'])
def test_source_counts_closed_incidence_regular_faces_and_transitivity(entry,order):
    model=dispatch({'op':'generate','params':{'kind':'regular','key':entry['key']}})
    assert [len(model[k]) for k in ('vertices','edges','faces','cells')]==entry['counts']
    assert model['interpretation']==('convex-polytope' if entry['convex'] else 'generalized-complex')
    assert validate(model)['passed'] and model['metadata']['uniform'] is False
    assert model['metadata']['scaliform'] and not model['numeric']['certified']
    p=np.asarray(model['vertices']);lengths=[np.linalg.norm(p[a]-p[b]) for a,b in model['edges']]
    assert max(lengths)-min(lengths)<1e-12 and abs(lengths[0]-1)<1e-12
    for f in model['faces']:
        q=p[f];radii=np.linalg.norm(q-q.mean(axis=0),axis=1)
        assert np.ptp(radii)<1e-12
        chords=np.linalg.norm(q-np.roll(q,1,axis=0),axis=1)
        assert np.ptp(chords)<1e-12
    ridges=Counter(f for c in model['cells'] for f in c)
    assert len(ridges)==len(model['faces']) and set(ridges.values())=={2}
    for c in model['cells']:
        edges=Counter(tuple(sorted((a,b))) for f in c for a,b in zip(model['faces'][f],model['faces'][f][1:]+model['faces'][f][:1]))
        assert set(edges.values())=={2}
    symmetry=geometric_symmetry(model)
    assert symmetry['complete'] and symmetry['closureVerified'] and symmetry['order']==order
    assert len(symmetry['entityOrbits']['vertex'])==1
    e=model['metadata']['scaliform4Evidence']
    assert e['resultFingerprint']==identity(model) and e['maxElementCircumsphereRelativeSpread']<1e-12
    project={'format':'polytope-laboratory','version':1,'active':0,'documents':[{'id':'scaliform','cursor':0,'states':[{'model':model,'view':{}}]}]}
    restored=validate_project(project)['documents'][0]['states'][0]['model']
    assert restored['faces']==model['faces'] and restored['cells']==model['cells']
    assert relationships(restored)['classification']['fissary'] is False


def test_koho_keeps_published_skew_octagon_and_bowtie_bipyramids():
    m=load_scaliform4('scaliform4-koho')
    assert {tuple(sorted({v for f in c for v in m['faces'][f]})) for c in m['cells'][:8]}=={
        tuple(sorted((i+j)%8 for j in range(4))) for i in range(8)}
    assert Counter(map(len,m['faces']))=={3:24,4:4}
    assert all(Counter(len(m['faces'][f]) for f in c)=={3:4,4:2} for c in m['cells'][8:])


def test_published_fissary_crosswalk_does_not_guess_regiment_members():
    for acronym in ['affic','affidhi','dupti','sitpodady','gitphi']:
        record={'key':'source-'+acronym,'dimension':4,'name':acronym}
        assert classification_metadata(record)['fissary'] is True
        assert navigation_metadata(record)['fissary'] is True
        assert 'regiments.html' in navigation_metadata(record)['classificationReference']
    for name in ['affic regiment','not affic','sishi','tuta','compound of dupti']:
        assert classification_metadata({'dimension':4,'name':name})=={}
    assert classification_metadata({'dimension':3,'name':'affic'})=={}


def test_attributed_load_and_library_properties_share_the_same_source_crosswalk():
    source={'name':'Affic','dimension':4,'metadata':{'aliases':['affic']}}
    with patch('engine.miratope_expanded_catalog.load_expanded_model',return_value=source):
        loaded=load_catalog_model('source-classification-fixture')
    assert loaded['metadata']['fissary'] is True
    assert loaded['metadata']['classificationReference'].endswith('regiments.html')


def test_literal_disconnected_link_is_evidence_not_a_guessed_source_classification():
    a=regular('cross4');m=deepcopy(a);m['interpretation']='generalized-complex';m['metadata']={}
    # Two complete boundaries share exactly one source vertex. All other IDs
    # remain separate, even where coordinates coincide.
    mapping=[0]+list(range(8,15));offset=len(m['faces'])
    m['vertices']+=deepcopy(a['vertices'][1:])
    m['edges'] += [[mapping[v] for v in e] for e in a['edges']]
    m['faces'] += [[mapping[v] for v in f] for f in a['faces']]
    m['cells'] += [[offset+f for f in c] for c in a['cells']]
    report=relationships(m)
    assert report['disconnectedVertexIds']==[0]
    assert report['vertexLinks'][0]['componentCount']==2
    assert report['classification']=={}
    assert 'not welded' in report['scope']


def test_relationships_reject_unsupported_bounds_parameters_and_stale_evidence():
    with pytest.raises(GeometryError,match='4D'):relationships(regular('cube'))
    with pytest.raises(GeometryError):relationships(None)
    # Translation preserves valid incidence but invalidates the stored receipt.
    model=load_scaliform4('scaliform4-tuta');model['vertices']=(np.asarray(model['vertices'])+[1,2,3,4]).tolist()
    model.pop('facetEquations',None)
    assert relationships(model)['evidence']=={}
    with pytest.raises(GeometryError,match='no parameters'):
        dispatch({'op':'polychoron-relationships','params':{'weld':True},'model':model})
    malformed=deepcopy(model);malformed['faces']=[3]
    with pytest.raises(GeometryError,match='arrays'):relationships(malformed)
    malformed=deepcopy(model);malformed['vertices']*=100
    with pytest.raises(GeometryError,match='2048'):relationships(malformed)
    with pytest.raises(GeometryError,match='Unknown'):load_scaliform4('scaliform4-unverified')
