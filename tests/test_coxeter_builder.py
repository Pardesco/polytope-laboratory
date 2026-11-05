"""All nonempty diagrams, checked against independent uniform-library counts."""
import copy
import itertools
import numpy as np
import pytest
from engine.coxeter_builder import build_coxeter, D4_EQUIVALENTS, B4_EQUIVALENTS
from engine.geometry import GeometryError
from engine.uniform4 import manifest
from engine.wythoff import reflection_orbit, mirror_gram

KINDS=('vertices','edges','faces','cells')
COUNTS3={
    'A3':[(4,6,4,0),(6,12,8,0),(12,18,8,0),(4,6,4,0),(12,24,14,0),(12,18,8,0),(24,36,14,0)],
    'B3':[(6,12,8,0),(12,24,14,0),(24,36,14,0),(8,12,6,0),(24,48,26,0),(24,36,14,0),(48,72,26,0)],
    'H3':[(12,30,20,0),(30,60,32,0),(60,90,32,0),(20,30,12,0),(60,120,62,0),(60,90,32,0),(120,180,62,0)],
}
EXPECTED={(family,format(n,'03b')):counts for family,rows in COUNTS3.items() for n,counts in enumerate(rows,1)}
for entry in manifest()['entries']:
    if not entry.get('rings'):continue
    family=entry['coxeterFamily'];mask=''.join(map(str,entry['rings']))
    EXPECTED[family,mask]=tuple(entry['counts'])
    if family in ('A4','F4'):EXPECTED[family,mask[::-1]]=tuple(entry['counts'])
EXPECTED.update({('B4','0010'):(24,96,96,24),('B4','0101'):(96,288,240,48),('B4','0111'):(192,384,240,48)})
# D4 triality: three outer nodes may be permuted. Counts follow the
# cross-polytope/24-cell Wythoff forms (central ring, number of outer rings).
D4_COUNTS={(0,1):(8,24,32,16),(0,2):(32,96,88,24),(0,3):(96,288,240,48),
           (1,0):(24,96,96,24),(1,1):(48,120,96,24),(1,2):(96,192,120,24),(1,3):(192,384,240,48)}
for mask in itertools.product((0,1),repeat=4):
    if any(mask):EXPECTED['D4',''.join(map(str,mask))]=D4_COUNTS[mask[1],sum(mask[i] for i in (0,2,3))]


def test_fixture_covers_every_ring_pattern():
    for family in ('A3','B3','H3','A4','B4','D4','F4','H4'):
        rank=int(family[-1])
        assert {mask for f,mask in EXPECTED if f==family}=={format(n,'0'+str(rank)+'b') for n in range(1,2**rank)}


@pytest.mark.parametrize('family,mask',list(EXPECTED))
def test_every_ring_pattern_has_known_uniform_counts_and_residuals(family,mask):
    result=build_coxeter(family,list(map(int,mask)))
    assert tuple(len(result[k]) for k in KINDS)==EXPECTED[family,mask]
    assert result['validation']['passed']
    assert result['metadata']['shapeBuilder']['edgeRelativeSpread']<1e-7
    assert result['metadata']['shapeBuilder']['exact'] is False
    assert result['provenance']['orbitClosureResidual']<=1e-9
    if result['dimension']==4:assert len(result['vertices'])-len(result['edges'])+len(result['faces'])-len(result['cells'])==0


def test_d4_has_branched_mirrors_and_triality_orbit():
    orbit=reflection_orbit('D4',[1,1,1,1]);gram=mirror_gram('D4')
    assert orbit['diagramEdges']==[(0,1,3),(1,2,3),(1,3,3)]
    assert gram[2,3]==0 and gram[1,3]==pytest.approx(-.5)
    assert orbit['coxeterGroupOrder']==len(orbit['vertices'])==192
    points=np.asarray(orbit['vertices'])
    for root in np.linalg.cholesky(gram):
        reflected=points-2*np.outer(points@root,root)
        assert max(min(np.linalg.norm(points-p,axis=1)) for p in reflected)<1e-8


@pytest.mark.parametrize('family,mask,target',[
    *[('B4',mask,target) for mask,target in B4_EQUIVALENTS.items()],
    *[('D4',next(''.join(map(str,m)) for m in itertools.product((0,1),repeat=4)
        if m[1]==central and sum(m[i] for i in (0,2,3))==outer),target)
        for (central,outer),target in D4_EQUIVALENTS.items()]])
def test_alternate_catalog_diagrams_match_counts_and_vertex_distance_spectra(family,mask,target):
    source=build_coxeter(family,list(map(int,mask)));reference=build_coxeter(target[0],list(map(int,target[1])))
    assert source['name']==reference['name']
    assert [len(source[k]) for k in KINDS]==[len(reference[k]) for k in KINDS]
    def spectrum(model):
        points=np.asarray(model['vertices']);points/=np.linalg.norm(points[0])
        return np.sort(np.linalg.norm(points-points[0],axis=1))
    assert spectrum(source)==pytest.approx(spectrum(reference),abs=1e-8)


@pytest.mark.parametrize('family,counts',[('B3',(24,60,38,0)),('H3',(60,150,92,0))])
def test_supported_snubs_and_both_mirrors(family,counts):
    for hand in ('A','B'):
        result=build_coxeter(family,[1,1,1],snub=True,hand=hand)
        assert tuple(len(result[k]) for k in KINDS)==counts
        assert result['metadata']['shapeBuilder']['edgeRelativeSpread']<1e-7


@pytest.mark.parametrize('params',[{'family':'E8'},{'family':'B3','rings':[0,0,0]},
    {'family':'D4','rings':[1,0,0]},{'family':'A3','rings':[True,0,0]},
    {'family':'A4','snub':True},{'family':'B3','snub':True},{'hand':'C'},{'snub':1}])
def test_unsupported_or_invalid_requests_fail_clearly(params):
    with pytest.raises(GeometryError):build_coxeter(**params)


def test_dispatch_history_replay_save_and_no_preview_mutation():
    from engine.server import dispatch
    from engine.generators import regular
    from engine.formats import validate_project
    from engine.history import canonical_model
    source={'id':'source','cursor':0,'states':[{'model':regular('cube'),'view':{},'notes':'Keep me','label':'Cube'}]}
    before=copy.deepcopy(source)
    params={'family':'D4','rings':[0,1,0,0],'snub':False,'hand':'A'}
    preview=dispatch({'op':'coxeter-build','params':params,'model':source['states'][0]['model']})
    assert source==before
    result=dispatch({'op':'recipe-run','params':{'document':source,'operation':'coxeter-build','parameters':params,'label':preview['name']}})
    assert source==before and result['cursor']==1 and len(result['states'])==2
    assert result['states'][1]['notes']=='Keep me'
    assert canonical_model(result['states'][1]['model'])==canonical_model(preview)
    replay=dispatch({'op':'recipe-replay','params':{'document':result}})
    assert canonical_model(replay['states'][0]['model'])==canonical_model(preview)
    project={'format':'polytope-laboratory','version':1,'active':0,'documents':[result]}
    saved=validate_project(project)
    assert saved['documents'][0]['cursor']==1
    generated=dispatch({'op':'generate','params':{'kind':'coxeter-builder',**params}})
    assert canonical_model(generated)==canonical_model(preview)


@pytest.mark.parametrize('mask,counts',[
    ('1001',(2400,7200,7440,2640)),('1101',(7200,18000,13440,2640)),
    ('1111',(14400,28800,17040,2640))])
def test_dense_h4_ui_generate_recipe_commits_replays_and_saves(mask,counts,tmp_path):
    from engine.server import dispatch
    from engine.generators import regular
    from engine.formats import save_project,load_file,validate_project
    from engine.history import canonical_model
    from scipy.spatial import ConvexHull
    source={'id':'source','cursor':0,'states':[{'model':regular('cube'),'view':{},'notes':'Keep me','label':'Cube'}]}
    before=copy.deepcopy(source)
    params={'kind':'coxeter-builder','family':'H4','rings':list(map(int,mask)),'snub':False,'hand':'A'}
    # Exact operation/parameters used by the renderer commitOperation callback.
    result=dispatch({'op':'recipe-run','params':{'document':source,'operation':'generate','parameters':params,'label':'Open shape'}})
    assert source==before and result['cursor']==1 and len(result['states'])==2
    generated=result['states'][1]['model'];fingerprint=generated['fingerprint']
    assert tuple(len(generated[k]) for k in KINDS)==counts
    assert result['states'][1]['notes']=='Keep me'
    assert result['operationHistory']['nodes'][-1]['op']=='generate'
    assert result['operationHistory']['nodes'][-1]['params']==params
    independent=ConvexHull(np.asarray(generated['vertices']))
    assert generated['measure']['content']==pytest.approx(independent.volume,rel=1e-9)
    assert generated['measure']['boundaryMeasure']==pytest.approx(independent.area,rel=1e-9)
    replay=dispatch({'op':'recipe-replay','params':{'document':result}})
    assert canonical_model(replay['states'][0]['model'])==canonical_model(generated)
    project={'format':'polytope-laboratory','version':1,'active':0,'documents':[result]}
    path=tmp_path/'dense.polyproj';save_project(path,project)
    restored=load_file(path)['project'];document=restored['documents'][0]
    assert document['cursor']==1 and document['states'][1]['model']['fingerprint']==fingerprint
    document['cursor']=0;validate_project(restored)
    assert canonical_model(document['states'][0]['model'])==canonical_model(before['states'][0]['model'])
    document['cursor']=1;assert document['states'][document['cursor']]['model']['fingerprint']==fingerprint


def test_dense_native_validation_rejects_forged_evidence_and_preserves_import_bound():
    from engine.input_limits import model_limits
    from engine.geometry import intrinsic_measures
    from engine.native_uniform_validation import native_uniform_measure
    model=build_coxeter('H4',[1,0,0,1])
    valid=native_uniform_measure(model)
    for mutate in (
        lambda m:m['vertices'][0].__setitem__(0,m['vertices'][0][0]+.001),
        lambda m:m['edges'].pop(),lambda m:m['faces'][0].reverse(),
        lambda m:m['cells'][0].reverse(),lambda m:m['facetVertices'][0].pop(),
        lambda m:m['provenance']['parameters'].__setitem__('rings',[1,1,1,1]),
        lambda m:m['numeric'].__setitem__('certified',True),
        lambda m:m.__setitem__('embeddingDimension',3),
    ):
        changed=copy.deepcopy(model);mutate(changed)
        with pytest.raises(GeometryError,match='native uniform'):model_limits(changed)
    unrecognized=copy.deepcopy(model);unrecognized.pop('provenance')
    with pytest.raises(GeometryError,match='1,024'):model_limits(unrecognized)
    model['measure']={'content':-1,'boundaryMeasure':-1};model['fingerprint']='forged'
    assert intrinsic_measures(model)==valid
    # Independent catalog generation uses the same reconstruction checks.
    from engine.uniform4 import manifest,load_uniform4
    entry=next(e for e in manifest()['entries'] if e.get('coxeterFamily')=='H4' and e.get('rings')==[1,0,0,1])
    catalog_model=load_uniform4(entry['key']);model_limits(catalog_model)
    assert native_uniform_measure(catalog_model)==valid


def test_dense_f4_ui_generate_recipe_accepts_a_dense_source_and_legacy_recipe():
    from engine.server import dispatch
    from engine.generators import regular
    source={'id':'source','cursor':0,'states':[{'model':regular('tesseract'),'view':{},'notes':'Keep me'}]}
    params={'family':'F4','rings':[1,1,1,1],'snub':False,'hand':'A'}
    first=dispatch({'op':'recipe-run','params':{'document':source,'operation':'generate','parameters':{'kind':'coxeter-builder',**params}}})
    assert first['cursor']==1 and len(first['states'][1]['model']['vertices'])==1152
    second=dispatch({'op':'recipe-run','params':{'document':first,'operation':'coxeter-build','parameters':params}})
    assert second['cursor']==2 and len(second['states'][2]['model']['vertices'])==1152
    assert second['states'][2]['notes']=='Keep me'
