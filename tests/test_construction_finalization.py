"""Independent boundary/measure references and native atomic gate regressions."""
from copy import deepcopy
import json
import math

import numpy as np
import pytest

import engine.construction_finalization as finalization
import engine.convex_classification as classifier
from engine.construction_finalization import finalize_construction
from engine.antiprisms import rational_antiprism
from engine.antiprism_components import attach_construction_components
from engine.compounds import extract_component, remove_component, retrieve_source
from engine.formats import validate_project
from engine.geometry import GeometryError, identity, validate
from engine.history import canonical_model
from engine.products import polygon_prism, polygon_product
from engine.prisms import polyhedron_prism
from engine.server import dispatch
from engine.star_polygons import regular_star_polygon
from engine.step_prisms import step_prism


KINDS=('vertices','edges','faces','cells')
RGBA={'encoding':'unit','values':[.2,.4,.8,.25]}


def literal(vertices,faces,dimension):
    edges=sorted({tuple(sorted((a,b))) for face in faces for a,b in zip(face,face[1:]+face[:1])})
    return {'id':'literal-independent-fixture','name':'Literal boundary','dimension':dimension,
            'embeddingDimension':dimension,'vertices':vertices,'edges':[list(edge) for edge in edges],
            'faces':faces,'cells':[],'interpretation':'generalized-complex',
            'metadata':{'sourceAttribute':{'exact':['retain','all','fields']}},
            'numeric':{'mode':'float64-approximate','certified':False}}


def square():return literal([[-1,-1],[1,-1],[1,1],[-1,1]],[[0,1,2,3]],2)


def cube():return literal([[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],
                          [-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]],
                         [[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]],3)


def report(model):return model['metadata']['constructionFinalization']
def counts(model):return tuple(len(model[kind]) for kind in KINDS)


def assert_source_preserved(source,result):
    assert source['id']==result['id'] and identity(source)==identity(result)==result['fingerprint']
    assert source['provenance']==result['provenance']
    assert source['numeric']==result['numeric']
    for kind in KINDS:assert source[kind]==result[kind]
    if 'offColors' in source['metadata']:assert source['metadata']['offColors']==result['metadata']['offColors']
    schema=report(result)['constructionSchema']
    for key,value in source['metadata'][schema].items():
        if key not in ('recoverableCompoundComponents','componentDefinition'):
            assert result['metadata'][schema][key]==value
    proof=report(result)
    assert proof['originalModelId']==source['id']==proof['currentModelId']==result['id']
    assert proof['originalFingerprint']==identity(source)==proof['currentFingerprint']==identity(result)
    assert proof['originalInterpretation']==source['interpretation']
    assert proof['finalInterpretation']==result['interpretation']
    assert proof['classification']['sourceModelId']==result['id']
    assert proof['classification']['sourceFingerprint']==identity(result)
    assert proof['numeric']['certified'] is False and result['numeric']['certified'] is False
    assert proof['nativeProjectGate']['status']=='passed' and validate(result)['passed']
    assert proof['currentCanonicalFingerprint']==finalization._canonical_fingerprint(result)
    assert proof['originalCanonicalFingerprint']==finalization._canonical_fingerprint(source)


@pytest.mark.parametrize('factory,expected,content,boundary',[
    (lambda:polygon_prism(square(),2),(8,12,6,0),8,24),
    (lambda:polygon_product(square(),square()),(16,32,24,8),16,64),
    (lambda:polyhedron_prism(cube(),2),(16,32,24,8),16,64),
    (lambda:rational_antiprism(3),(6,12,8,0),math.sqrt(6),6*math.sqrt(3)),
    (lambda:rational_antiprism(3,-1),(6,12,8,0),math.sqrt(6),6*math.sqrt(3)),
    (lambda:polyhedron_prism(rational_antiprism(3),2),(12,30,28,10),2*math.sqrt(6),2*math.sqrt(6)+12*math.sqrt(3)),
    (lambda:polygon_product(regular_star_polygon(3),regular_star_polygon(3)),(9,18,15,6),27/16,27/2)])
def test_ordinary_sources_are_promoted_only_with_independent_complete_incidence_and_measure_references(factory,expected,content,boundary):
    source=factory();before=deepcopy(source);result=finalize_construction(source)
    assert source==before;assert_source_preserved(source,result)
    assert counts(result)==expected and result['interpretation']=='convex-polytope'
    assert result['measure']['content']==pytest.approx(content)
    assert result['measure']['boundaryMeasure']==pytest.approx(boundary)
    assert report(result)['outcome']=='promoted-convex' and report(result)['analysisState']=='passed'
    assert report(result)['originalCanonicalFingerprint']!=report(result)['currentCanonicalFingerprint']
    assert len(result['components'])==1 and report(result)['ownership']['status']=='attached'


@pytest.mark.parametrize('dimension',[3,4])
def test_cube_and_tesseract_support_equations_preserve_literal_axes_and_full_current_face_cell_ids(dimension):
    source=polygon_prism(square(),2) if dimension==3 else polyhedron_prism(cube(),2)
    result=finalize_construction(source)
    expected={tuple(sign if axis==i else 0 for i in range(dimension))+(-1,)
              for axis in range(dimension) for sign in (-1,1)}
    assert {tuple(round(x,12) for x in plane) for plane in result['facetEquations']}==expected
    assert result['vertices']==source['vertices']
    kind='faces' if dimension==3 else 'cells'
    for support in report(result)['classification']['facetSupports']:
        boundary=result[kind][support['sourceFacetId']]
        expected_vertices=set(boundary) if dimension==3 else {v for face in boundary for v in result['faces'][face]}
        assert set(support['vertexIds'])==expected_vertices


@pytest.mark.parametrize('dimension',[3,4])
@pytest.mark.parametrize('symbol',['5/2','5/3','5/-2','5/-3','6/2','6/-2'])
def test_signed_star_and_disconnected_sources_keep_literal_owned_generalized_incidence_without_content(dimension,symbol):
    anti=rational_antiprism(symbol=symbol)
    source=anti if dimension==3 else polyhedron_prism(anti,2)
    before=deepcopy(source);result=finalize_construction(source)
    assert source==before;assert_source_preserved(source,result)
    assert result['interpretation']=='generalized-complex' and 'measure' not in result
    assert report(result)['outcome']=='retained-generalized'
    assert report(result)['classification']['convex'] is False
    assert not report(result)['classification']['facetSupports']
    assert len(result['components'])==(2 if symbol.startswith('6') else 1)
    assert 'facetVertices' not in result and 'facetEquations' not in result


@pytest.mark.parametrize('factory',[
    lambda:polygon_prism(regular_star_polygon(5,2),2),
    lambda:polygon_product(regular_star_polygon(5,-3),regular_star_polygon(3)),
    lambda:polygon_product(regular_star_polygon(6,2),regular_star_polygon(3))])
def test_ordered_star_products_are_not_substituted_or_filled_by_convex_reference(factory):
    source=factory();result=finalize_construction(source);assert_source_preserved(source,result)
    assert result['interpretation']=='generalized-complex' and 'measure' not in result
    assert report(result)['outcome']=='retained-generalized'


@pytest.mark.parametrize('scale',[1e99,1e-100])
@pytest.mark.parametrize('kind',['closed-prism','polygon-product'])
def test_classifier_pass_at_unsafe_four_volume_scale_retains_full_owned_generalized_source_with_explicit_measure_diagnostic(scale,kind):
    if kind=='closed-prism':source=polyhedron_prism(rational_antiprism(3,radius=scale),2*scale)
    else:source=polygon_product(regular_star_polygon(3,radius=scale),regular_star_polygon(3,radius=scale))
    before=deepcopy(source);result=finalize_construction(source)
    assert source==before;assert_source_preserved(source,result)
    assert report(result)['classification']['status']=='passed' and report(result)['analysisState']=='passed'
    assert report(result)['outcome']=='retained-generalized' and result['interpretation']=='generalized-complex'
    assert 'measure' not in result and len(result['components'])==1
    assert report(result)['diagnostics'][0]['code']=='unsupported-measure'
    assert report(result)['originalCanonicalFingerprint']==report(result)['currentCanonicalFingerprint']
    project=validate_project(json.loads(json.dumps({'format':'polytope-laboratory','version':1,'active':0,
        'documents':[{'cursor':0,'states':[{'model':result,'view':{}}]}]})))
    assert canonical_model(project['documents'][0]['states'][0]['model'])==canonical_model(result)


@pytest.mark.parametrize('factory',[
    lambda:rational_antiprism(3,radius=1e-70),
    lambda:rational_antiprism(3,radius=1e-100),
    lambda:polyhedron_prism(rational_antiprism(3,radius=1e-70),2e-70),
    lambda:polyhedron_prism(rational_antiprism(3,radius=1e70),2e70)])
def test_finite_positive_native_measures_at_large_and_small_supported_scales_can_promote(factory):
    source=factory();result=finalize_construction(source);assert_source_preserved(source,result)
    assert result['interpretation']=='convex-polytope'
    assert all(math.isfinite(result['measure'][key]) and result['measure'][key]>0 for key in ('content','boundaryMeasure'))


def test_three_volume_underflow_also_requires_owned_generalized_fallback():
    source=rational_antiprism(3,radius=1e-108);result=finalize_construction(source)
    assert_source_preserved(source,result)
    assert report(result)['classification']['status']=='passed'
    assert report(result)['outcome']=='retained-generalized' and 'measure' not in result
    assert report(result)['diagnostics'][0]['code']=='unsupported-measure'


@pytest.mark.parametrize('kind',['prism','antiprism','closed-prism'])
def test_full_current_leaf_extraction_drop_native_save_undo_redo_and_recipe_replay_preserve_rgba_and_source_snapshots(kind):
    polygon=regular_star_polygon(6,2);polygon['metadata']['offColors']={'faces':[deepcopy(RGBA),None],'cells':[]}
    if kind=='prism':source=polygon_prism(polygon,2)
    else:
        anti=rational_antiprism(6,2,cap_colors=[deepcopy(RGBA),None])
        source=anti if kind=='antiprism' else polyhedron_prism(anti,2)
    result=finalize_construction(source);before=deepcopy(result)
    expected={'prism':(6,9,5,0),'antiprism':(6,12,8,0),'closed-prism':(12,30,28,10)}[kind]
    assert len(result['components'])==2
    for component in result['components']:
        leaf=extract_component(result,component['id']);assert counts(leaf)==expected
        historical=result
        for index in component['sourcePath']:historical=retrieve_source(historical,index)
        assert historical['dimension']==result['dimension'] and identity(leaf)==identity(historical)
        for channel_kind in ('faces','cells'):
            source_colors=result['metadata'].get('offColors',{}).get(channel_kind,[None]*len(result[channel_kind]))
            leaf_colors=leaf['metadata'].get('offColors',{}).get(channel_kind,[None]*len(leaf[channel_kind]))
            assert leaf_colors==[source_colors[i] for i in component['maps'][channel_kind]]
    document={'id':'native-finalization-fixture','cursor':0,'states':[{'model':result,'view':{}}]}
    dropped=dispatch({'op':'recipe-run','params':{'document':document,'operation':'compound-drop',
                      'parameters':{'component_id':result['components'][0]['id']}}})
    reopened=validate_project(json.loads(json.dumps({'format':'polytope-laboratory','version':1,'active':0,
                          'documents':[dropped]})))['documents'][0]
    replay=dispatch({'op':'recipe-replay','params':{'document':reopened}})['states'][0]['model']
    assert counts(replay)==expected and replay['components']==reopened['states'][1]['model']['components']
    assert canonical_model(replay)==canonical_model(reopened['states'][1]['model'])
    assert replay['metadata'].get('offColors')==reopened['states'][1]['model']['metadata'].get('offColors')
    reopened['cursor']=0;assert reopened['states'][0]['model']['vertices']==before['vertices']
    reopened['cursor']=1;assert counts(reopened['states'][1]['model'])==expected
    assert report(replay)['currentFingerprint']!=identity(replay)  # Report remains historical after explicit deletion.
    assert result==before


def test_promoted_single_component_still_extracts_and_native_recipe_replay_reads_original_source_declaration():
    result=finalize_construction(polyhedron_prism(cube(),2));original=deepcopy(result)
    component=result['components'][0]
    leaf=extract_component(result,component['id'])
    assert counts(leaf)==(16,32,24,8) and leaf['vertices']==result['vertices']
    assert leaf['interpretation']=='generalized-complex'
    assert report(leaf)['currentModelId']!=leaf['id']  # Historical report is not rebound to extraction.
    with pytest.raises(GeometryError,match='last'):remove_component(result,component['id'])
    document={'id':'promotion-fixture','cursor':0,'states':[{'model':result,'view':{}}]}
    operation=dispatch({'op':'recipe-run','params':{'document':document,'operation':'compound-component',
                        'parameters':{'component_id':component['id']}}})
    replay=dispatch({'op':'recipe-replay','params':{'document':operation}})['states'][0]['model']
    assert canonical_model(replay)==canonical_model(leaf) and result==original


@pytest.mark.parametrize('n,step,expected',[(5,2,(5,10,10,5)),(8,3,(8,24,32,16)),(7,-2,(7,21,28,14))])
def test_existing_hull_defined_step_prism_retains_supports_params_and_declaration(n,step,expected):
    source=step_prism(n,step);before=deepcopy(source);result=finalize_construction(source)
    assert source==before;assert_source_preserved(source,result)
    assert counts(result)==expected and result['interpretation']=='convex-polytope'
    assert result['facetVertices']==source['facetVertices'] and result['facetEquations']==source['facetEquations']
    assert report(result)['outcome']=='retained-existing-convex' and report(result)['analysisState']=='passed'
    assert report(result)['ownership']['status']=='not-applicable' and 'components' not in result


def test_budget_refusal_is_not_analyzed_and_never_erases_existing_step_hull_declaration(monkeypatch):
    source=step_prism(8,3);before=deepcopy(source)
    monkeypatch.setattr(classifier,'MAX_REFERENCE_VERTICES',{2:2048,3:2048,4:4})
    result=finalize_construction(source);assert_source_preserved(source,result)
    assert source==before and report(result)['analysisState']=='not-analyzed'
    assert report(result)['classification']['status']=='unsupported'
    assert report(result)['classification']['convex'] is False
    assert report(result)['outcome']=='retained-existing-convex' and result['interpretation']=='convex-polytope'
    assert not report(result)['classification']['facetSupports'] and result['facetVertices']==source['facetVertices']


@pytest.mark.parametrize('status,state',[('unresolved','unresolved'),('non-convex','failed')])
def test_additional_step_classification_failure_cannot_create_stronger_claim_or_erase_established_valid_hull(monkeypatch,status,state):
    actual=finalization.analyze_convex_boundary
    def failed(model):
        result=actual(model);result.update(status=status,convex=False,facetSupports=[])
        result['diagnostics']=[{'message':'injected independent float predicate failure'}]
        return result
    monkeypatch.setattr(finalization,'analyze_convex_boundary',failed)
    source=step_prism(5,2);result=finalize_construction(source)
    assert result['interpretation']=='convex-polytope' and report(result)['outcome']=='retained-existing-convex'
    assert report(result)['analysisState']==state and report(result)['classification']['convex'] is False
    assert report(result)['diagnostics'][0]['code']=='additional-classification-unavailable'
    assert result['facetEquations']==source['facetEquations'] and not result['numeric']['certified']


def test_large_ordered_product_outside_classifier_budget_stays_owned_generalized_without_convex_guess():
    source=polygon_product(regular_star_polygon(3),regular_star_polygon(23))
    result=finalize_construction(source)
    assert len(result['vertices'])==69 and len(result['components'])==1
    assert report(result)['analysisState']=='not-analyzed' and result['interpretation']=='generalized-complex'
    assert 'measure' not in result and report(result)['classification']['diagnostics'][0]['limit']==64


@pytest.mark.parametrize('change',['geometry','ownership','source-attribute','rgba'])
def test_convex_native_gate_mutation_or_failure_discards_candidate_without_losing_genuine_source_components(monkeypatch,change):
    actual=finalization.validate_project
    def broken(project):
        model=project['documents'][0]['states'][0]['model']
        checked=actual(project)
        if model['interpretation']=='convex-polytope':
            if change=='geometry':model['vertices'][0][0]+=.1
            elif change=='ownership':model['components']=[]
            elif change=='source-attribute':model['metadata']['orderedProduct']['sourceModels'][0]['metadata']['sourceAttribute']['flag']=True
            elif change=='rgba':model['metadata']['offColors']['faces'][0]['values'][3]=.5
        return checked
    source_polygon=square();source_polygon['metadata']['sourceAttribute']['flag']=1
    source_polygon['metadata']['offColors']={'faces':[deepcopy(RGBA)],'cells':[]}
    source=polygon_prism(source_polygon,2);before=deepcopy(source)
    monkeypatch.setattr(finalization,'validate_project',broken)
    result=finalize_construction(source)
    assert source==before and result['interpretation']=='generalized-complex'
    assert len(result['components'])==1 and report(result)['diagnostics'][0]['code']=='unsupported-measure'
    assert result['metadata']['orderedProduct']['sourceModels'][0]==source_polygon
    assert result['metadata']['offColors']==before['metadata']['offColors']


def test_generalized_native_fallback_failure_rejects_atomically_not_a_partial_result(monkeypatch):
    def failed(*args):raise GeometryError('native persistence refuses both paths')
    monkeypatch.setattr(finalization,'validate_project',failed)
    source=rational_antiprism(3);before=deepcopy(source)
    with pytest.raises(GeometryError,match='native persistence'):finalize_construction(source)
    assert source==before and 'components' not in source


def test_step_own_native_gate_failure_is_rejected_instead_of_silent_generalized_conversion(monkeypatch):
    monkeypatch.setattr(finalization,'validate_project',lambda *args:(_ for _ in ()).throw(GeometryError('own Hull validation refused')))
    source=step_prism(5,2);before=deepcopy(source)
    with pytest.raises(GeometryError,match='own Hull'):finalize_construction(source)
    assert source==before and source['interpretation']=='convex-polytope'


def test_classifier_support_evidence_for_unrelated_source_is_not_published(monkeypatch):
    actual=finalization.analyze_convex_boundary
    def unrelated(model):
        result=actual(model);result['sourceFingerprint']='unrelated';return result
    monkeypatch.setattr(finalization,'analyze_convex_boundary',unrelated)
    source=rational_antiprism(3);before=deepcopy(source)
    with pytest.raises(GeometryError,match='does not bind'):finalize_construction(source)
    assert source==before


@pytest.mark.parametrize('input_kind',['imported','ambiguous','already-owned','already-finalized','stale-ownership','exact-claim','malformed','huge-coordinate'])
def test_only_supported_fresh_uncertified_generated_sources_enter_finalization(input_kind):
    source=rational_antiprism(3)
    if input_kind=='imported':source=cube()
    elif input_kind=='ambiguous':source['metadata']['orderedProduct']={}
    elif input_kind=='already-owned':source=attach_construction_components(source)
    elif input_kind=='already-finalized':source=finalize_construction(source)
    elif input_kind=='stale-ownership':source['metadata']['constructionComponents']={}
    elif input_kind=='exact-claim':source['numeric']['certified']=True
    elif input_kind=='malformed':source={}
    elif input_kind=='huge-coordinate':source['vertices'][0][0]=10**1000
    before=deepcopy(source)
    with pytest.raises(GeometryError):finalize_construction(source)
    assert source==before


@pytest.mark.parametrize('mutation',['fingerprint','binding-id','schema-bool','selected-bool','result-bool',
                                    'source-point-bool','geometry','parameter','declaration','certificate'])
def test_stale_or_malformed_step_source_cannot_hide_behind_existing_convex_declaration(mutation):
    source=step_prism(5,2);info=source['metadata']['stepPrism']
    if mutation=='fingerprint':source['fingerprint']='stale'
    elif mutation=='binding-id':info['generatedSourceModelId']='stale'
    elif mutation=='schema-bool':info['schemaVersion']=True
    elif mutation=='selected-bool':info['selectedFactorVertexIds'][0][0]=False
    elif mutation=='result-bool':info['resultVertexIds'][0]=False
    elif mutation=='source-point-bool':info['sourceVertices'][0][1]=False
    elif mutation=='geometry':source['vertices'][0][0]+=.1
    elif mutation=='parameter':info['parameters']['radius']=10**1000
    elif mutation=='declaration':source['interpretation']='generalized-complex'
    elif mutation=='certificate':info['certified']=True
    before=deepcopy(source)
    with pytest.raises(GeometryError):finalize_construction(source)
    assert source==before


def test_complete_report_is_native_string_keyed_json_and_detached_from_caller():
    source=rational_antiprism(3);before=deepcopy(source);result=finalize_construction(source)
    assert set(report(result)['classification']['resourceBounds']['referenceVerticesByDimension'])=={'2','3','4'}
    finalization._json_bytes(result,finalization.MAX_PAYLOAD_BYTES)
    result['vertices'][0][0]=999
    result['metadata']['rationalAntiprism']['sourceModel']['vertices'][0][0]=888
    result['metadata']['constructionFinalization']['classification']['facetSupports'][0]['vertexIds'].clear()
    assert source==before


def test_final_report_growth_cannot_bypass_payload_budget(monkeypatch):
    source=rational_antiprism(3);before=deepcopy(source)
    monkeypatch.setattr(finalization,'MAX_PAYLOAD_BYTES',len(finalization._json_bytes(source))+1)
    with pytest.raises(GeometryError,match='resource'):finalize_construction(source)
    assert source==before
