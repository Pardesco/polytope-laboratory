"""Independent literal placement/compound/history; no registry mutation."""
from copy import deepcopy
import json
import math
import os
import subprocess
import sys
from pathlib import Path

import pytest

import engine.history as history
import engine.recipes as recipes
from engine.face_placement_workflow import (OPERATION, VERSION, KERNEL_VERSION,
    dispatch_placement, verify_placement_evidence, run_placement,
    replay_placement_document, replay_placement_history, branch_placement)
from engine.augmentation_workflow import equivalent_json
from engine.compounds import extract_component
from engine.formats import load_file, save_project
from engine.generators import regular
from engine.geometry import GeometryError, identity, intrinsic_measures
from engine.server import dispatch as native


def cube(source_id='base'):
    return {'id': source_id, 'name': 'Literal cube', 'dimension': 3, 'embeddingDimension': 3,
        'interpretation': 'generalized-complex',
        'vertices': [[x, y, z] for x, y, z in
            ((0,0,0),(1,0,0),(1,1,0),(0,1,0),(0,0,1),(1,0,1),(1,1,1),(0,1,1))],
        'edges': [[0,1],[1,2],[2,3],[0,3],[4,5],[5,6],[6,7],[4,7],[0,4],[1,5],[2,6],[3,7]],
        'faces': [[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]], 'cells': [],
        'metadata': {'coordinateUnits': 'mm', 'literalAttributes': [1., -0., .125],
            'offlineAsset': {'relativePath': 'textures/local.png', 'hash': 'literal-source'},
            'offColors': {'faces': [{'encoding': 'byte', 'values': [i, 20+i, 40+i, 100+i]} for i in range(6)], 'cells': []}},
        'numeric': {'mode': 'float64-approximate', 'certified': False}}


def document(model=None):
    return {'id': 'literal-document', 'cursor': 0, 'states': [{'model': cube() if model is None else model,
        'view': {'coordinateUnit': 'mm', 'angles': [0]*6, 'camera': {'projection': 'orthographic'}},
        'label': 'Original', 'notes': 'Preserve source notes'}]}


def params(**extra):
    return {'addition': cube('addition'), 'face_ids': [1], 'addition_face_id': 0, **extra}


def request(**extra):
    return {'op': OPERATION, 'model': cube(), 'params': params(), **extra}


def model(doc): return doc['states'][doc['cursor']]['model']
def evidence(value): return value['metadata']['facePlacement']
def counts(value): return tuple(len(value[kind]) for kind in ('vertices', 'edges', 'faces', 'cells'))
def project(doc): return {'format': 'polytope-laboratory', 'version': 1, 'active': 0, 'documents': [doc]}


def javascript(value):
    code = "let t='';process.stdin.on('data',c=>t+=c).on('end',()=>process.stdout.write(JSON.stringify(JSON.parse(t))));"
    result = subprocess.run(['node', '-e', code], input=history._json_bytes(value).decode(),
        encoding='utf-8', capture_output=True, timeout=20,
        creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout)


def native_run(doc, operation, parameters):
    return native({'op': 'recipe-run', 'params': {'document': doc, 'operation': operation, 'parameters': parameters}})


def test_strict_dispatch_literal_cube_ownership_and_independent_unwelded_coordinates():
    value = request(); before = deepcopy(value)
    result = dispatch_placement(value)
    assert counts(result) == (16,24,12,0)
    assert result['vertices'][:8] == value['model']['vertices']
    assert set(map(tuple, result['vertices'][8:])) == {(x,y,z) for x in (0,1) for y in (0,1) for z in (1,2)}
    assert result['edges'][12:] == [[v+8 for v in edge] for edge in value['params']['addition']['edges']]
    assert result['faces'][6:] == [[v+8 for v in face] for face in value['params']['addition']['faces']]
    assert result['metadata']['offColors']['faces'] == cube()['metadata']['offColors']['faces']*2
    assert evidence(result)['sourceModels'] == equivalent_json([value['model'], value['params']['addition']])
    assert result['provenance']['operation'] == OPERATION and result['provenance']['algorithmVersion'] == VERSION
    assert result['provenance']['kernelVersion'] == KERNEL_VERSION == '0.1.0'
    assert result['interpretation'] == 'generalized-complex' and intrinsic_measures(result) is None and 'measure' not in result
    assert result['numeric']['certified'] is False and verify_placement_evidence(result)['passed']
    assert value == before


def test_generated_ids_are_repeatable_original_identity_attributes_and_component_paths_are_untouched():
    value = request(params=params(face_ids=[3,1,0])); before = deepcopy(value)
    first, second = dispatch_placement(value), dispatch_placement(value)
    assert first == second and counts(first) == (32,48,24,0)
    assert [row['targetFaceId'] for row in evidence(first)['placements']] == [3,1,0]
    assert len({row['id'] for row in first['components']}) == 4
    for row in evidence(first)['placements']:
        assert len(row['componentIds']) == 1
        leaf = extract_component(first, row['componentIds'][0])
        assert leaf['vertices'] == [first['vertices'][i] for i in row['maps']['vertices']]
        assert leaf['edges'] == cube()['edges'] and leaf['faces'] == cube()['faces']
        assert leaf['metadata']['facePlacementInstance']['sourceModel'] == equivalent_json(cube('addition'))
        assert leaf['metadata']['offColors'] == cube()['metadata']['offColors']
    assert evidence(first)['sourceModels'] == equivalent_json([value['model'], value['params']['addition']])
    assert value == before and verify_placement_evidence(first)['passed']


def test_source_metadata_strings_that_resemble_binding_roles_remain_literal():
    value = request()
    value['params']['addition']['metadata']['literalReference'] = {
        'sourceModelId': 'not-a-generated-id', 'resultModelId': 'literal-result', 'componentIds': ['literal-component']}
    result = dispatch_placement(value)
    row = evidence(result)['placements'][0]
    leaf = extract_component(result, row['componentIds'][0])
    assert leaf['metadata']['literalReference'] == value['params']['addition']['metadata']['literalReference']
    assert evidence(result)['sourceModels'][1]['metadata'] == equivalent_json(value['params']['addition']['metadata'])


def test_same_original_model_id_does_not_alias_distinct_full_attribute_sources():
    value=request();value['params']['addition']['id']=value['model']['id']
    value['params']['addition']['metadata']['offlineAsset']['hash']='addition-only-asset'
    value['params']['addition']['metadata']['offColors']['faces'][0]['values'][3]=127
    result=dispatch_placement(value);sources=evidence(result)['sourceModels']
    assert sources[0]['id']==sources[1]['id']=='base' and sources[0]['metadata']!=sources[1]['metadata']
    assert evidence(result)['inputs'][0]['sourceSnapshotSha256']!=evidence(result)['inputs'][1]['sourceSnapshotSha256']
    extracted=extract_component(result,evidence(result)['placements'][0]['componentIds'][0])
    assert extracted['metadata']['offlineAsset']['hash']=='addition-only-asset'
    assert extracted['metadata']['offColors']['faces'][0]['values'][3]==127
    assert verify_placement_evidence(result)['passed']


@pytest.mark.parametrize('height', [-1, -.25, 0, .5, 2])
def test_signed_height_keeps_gaps_overlaps_and_coincidences_without_union(height):
    result = dispatch_placement(request(params=params(height=height)))
    assert counts(result) == (16,24,12,0)
    assert set(map(tuple, result['vertices'][8:])) == {(x,y,z+height) for x in (0,1) for y in (0,1) for z in (1,2)}
    assert evidence(result)['outputPolicy']['weld'] is False
    assert evidence(result)['outputPolicy']['hullReplacement'] is False
    assert 'measure' not in result


def test_run_save_json_open_replay_is_immutable_and_resets_only_incidence_dependent_views(tmp_path):
    original = document(); original['states'][0]['view'].update(
        entitySelection={'faces':[1]}, net={'root':1}, foldFraction=.5, explosionAmount=.3)
    before = deepcopy(original)
    result = run_placement(original, params(face_ids=[1,3]))
    assert original == before and result['cursor'] == 1 and len(result['states']) == 2
    state = result['states'][-1]
    assert state['notes'] == 'Preserve source notes' and state['view']['camera'] == before['states'][0]['view']['camera']
    for key in ('entitySelection','net','foldFraction','explosionAmount'): assert key not in state['view']
    node = result['operationHistory']['nodes'][-1]
    assert node['op'] == OPERATION and node['algorithmVersion'] == VERSION and node['params']['addition'] == equivalent_json(cube('addition'))
    path = tmp_path/'development-placement.polylab'
    save_project(path, javascript(project(result)))
    opened = load_file(path)['project']['documents'][0]
    assert model(replay_placement_document(opened)) == model(opened)
    assert verify_placement_evidence(model(opened))['passed']


def test_branch_reconstructs_original_base_not_compound_selected_result_and_retains_old_graph():
    result = run_placement(document(), params(face_ids=[1])); before = deepcopy(result)
    branch = branch_placement(result, params(face_ids=[3,1], height=.25))
    assert counts(model(branch)) == (24,36,18,0)
    assert model(branch)['vertices'][:8] == cube()['vertices']
    nodes = branch['operationHistory']['nodes']
    assert len(nodes) == 3 and nodes[-1]['parent'] == nodes[0]['id'] and nodes[1] == before['operationHistory']['nodes'][1]
    assert model(replay_placement_document(branch)) == model(branch) and result == before


def test_undo_new_branch_preserves_abandoned_graph_and_refusal_never_mutates_input():
    result = run_placement(document(), params()); result['cursor'] = 0; before = deepcopy(result)
    with pytest.raises(GeometryError): run_placement(result, params(face_ids=[1,1]))
    assert result == before
    branch = run_placement(result, params(face_ids=[3]))
    assert len(branch['states']) == 2 and len(branch['operationHistory']['nodes']) == 3
    assert branch['operationHistory']['nodes'][-1]['parent'] == branch['operationHistory']['nodes'][0]['id']
    assert result == before


@pytest.mark.parametrize('field', ['color','unit','asset'])
def test_geometry_equal_attribute_edits_seed_new_source_root_but_view_pose_does_not(field):
    current = native_run(document(), 'transform', {'scale':1})
    old = current['states'][-1]['operationNode']
    addition = cube('addition')
    if field == 'color': model(current)['metadata']['offColors']['faces'][0]['values'][3] = 127
    if field == 'unit': model(current)['metadata']['coordinateUnits'] = addition['metadata']['coordinateUnits'] = 'cm'
    if field == 'asset': model(current)['metadata']['offlineAsset']['hash'] = 'edited-source'
    before = deepcopy(current)
    result = run_placement(current, params(addition=addition))
    source = result['operationHistory']['nodes'][-2]
    assert source['op'] == 'source' and source['parent'] == old and source['inputs'] == []
    assert model(replay_placement_document(result)) == model(result) and current == before
    unchanged = native_run(document(), 'transform', {'scale':1})
    unchanged['states'][-1]['view']['angles'][0] = 27
    unchanged['states'][-1]['notes'] = 'Edited notes'
    result = run_placement(unchanged, params())
    assert len(result['operationHistory']['nodes']) == 3
    assert result['operationHistory']['nodes'][-1]['parent'] == unchanged['states'][-1]['operationNode']
    assert result['states'][-1]['notes'] == 'Edited notes' and result['states'][-1]['view']['angles'][0] == 27


@pytest.mark.parametrize('change', [
    {'params':None}, {'params':3}, {'params':[]}, {'op':'load'}, {'path':'outside.json'}, {'id':True}, {'id':2**53},
    {'algorithmVersion':'future'}, {'params':params(face_ids=[1.,2])}, {'params':params(face_ids=[True])},
    {'params':params(face_ids=[1,1])}, {'params':params(face_ids=[])}, {'params':params(face_ids=list(range(17)))},
    {'params':params(addition_face_id=0.)}, {'params':params(height=True)}, {'params':params(scale=0)},
    {'params':params(angle_degrees=361)}, {'params':params(color_policy='blend')}, {'params':params(weld=True)},
])
def test_strict_envelope_refusal_and_next_valid_recovery(change):
    value = {**request(), **change}; before = deepcopy(value)
    with pytest.raises(GeometryError): dispatch_placement(value)
    assert value == before and counts(dispatch_placement(request())) == (16,24,12,0)


@pytest.mark.parametrize('source', ['base','addition'])
@pytest.mark.parametrize('bad_id', [0.,True])
def test_source_incidence_is_never_repaired_by_numeric_normalization(source,bad_id):
    value = request(); target = value['model'] if source == 'base' else value['params']['addition']
    target['edges'][0][0] = bad_id; before = deepcopy(value)
    with pytest.raises(GeometryError): dispatch_placement(value)
    assert value == before


@pytest.mark.parametrize('mutate', [
    lambda m:m['metadata']['offColors']['faces'][6]['values'].__setitem__(3,1),
    lambda m:m['metadata'].__setitem__('coordinateUnits','cm'),
    lambda m:evidence(m)['placements'][0]['maps']['vertices'].__setitem__(0,0),
    lambda m:m['components'][1].__setitem__('sourcePath',[0]),
    lambda m:evidence(m)['sourceModels'][1]['metadata']['offlineAsset'].__setitem__('hash','forged'),
    lambda m:evidence(m)['generatedIdentityBinding'].__setitem__('seedSha256','0'*64),
    lambda m:evidence(m)['placements'][0]['transform'].__setitem__('height',99),
    lambda m:m['metadata']['compound']['sourceModels'][1]['metadata']['facePlacementInstance']['sourceModel']['metadata'].__setitem__('extra','forged'),
])
def test_fresh_evidence_recomputes_full_source_geometry_maps_components_attributes_and_identity(mutate):
    result = dispatch_placement(request()); mutate(result)
    with pytest.raises(GeometryError): verify_placement_evidence(result)


def test_replay_refuses_attribute_only_snapshot_forgery_that_geometry_association_accepts():
    result = run_placement(document(), params())
    result['operationHistory']['nodes'][-1]['snapshot']['model']['metadata']['offColors']['faces'][0]['values'][3] = 127
    assert history.validate_document_history(result)
    before = deepcopy(result)
    with pytest.raises(GeometryError,match='attribute verification'): replay_placement_document(result)
    assert result == before


def test_native_ancestor_attribute_corruption_is_rejected_even_when_full_geometry_matches():
    ancestor=native_run(document(),'transform',{'scale':2})
    placed=run_placement(ancestor,params());before=deepcopy(placed)
    def corrupted(value):
        response=native(value);response['metadata']['offlineAsset']['hash']='forged-native-ancestor';return response
    with pytest.raises(GeometryError,match='attribute verification'):
        replay_placement_document(placed,dispatcher=corrupted)
    assert placed==before


def test_numeric_policy_and_forged_source_snapshot_hash_are_explicitly_refused():
    result=run_placement(document(),params())
    changed=deepcopy(result);changed['operationHistory']['nodes'][-1]['numericPolicy']['tolerance']=.5
    before=deepcopy(changed)
    with pytest.raises(GeometryError,match='numeric policy.*readable'):replay_placement_document(changed)
    assert changed==before
    changed=deepcopy(result);changed['operationHistory']['nodes'][0]['sourceSnapshotHash']='0'*64
    with pytest.raises(GeometryError,match='forged source snapshot hash'):replay_placement_document(changed)


@pytest.mark.parametrize('operation,arguments', [
    ('transform', {'scale':2}),
    ('convex-core', {'center':[.5,.5,.5]}),
])
def test_actual_native_ordinary_attachment_and_core_ancestors_replay_without_registry_patch(operation,arguments):
    parent = native_run(document(), operation, arguments)
    placed = run_placement(parent, params(face_ids=[1,3], scale=.25))
    descendant = native_run(placed, 'transform', {'scale':2})
    assert model(replay_placement_document(javascript(descendant))) == equivalent_json(model(descendant))
    for state in descendant['states']:
        assert model(replay_placement_document(descendant,target=state['operationNode'])) == equivalent_json(state['model'])
    with pytest.raises(GeometryError,match='stale'): verify_placement_evidence(model(descendant))


def test_actual_geodesic_ancestor_and_genuine_component_extract_descendant_are_full_attribute_verified():
    source = regular('tetrahedron');source['metadata']['coordinateUnits']='mm'
    parent = native_run(document(source),'triangular-geodesic',{'frequency':2})
    placed = run_placement(parent,params(face_ids=[0,1]))
    assert counts(model(placed)) == (26,48,28,0)
    component = evidence(model(placed))['placements'][1]['componentIds'][0]
    extracted = native_run(placed,'compound-component',{'component_id':component})
    assert counts(model(extracted)) == (8,12,6,0)
    assert model(replay_placement_document(javascript(extracted))) == equivalent_json(model(extracted))
    assert model(extracted)['metadata']['facePlacementInstance']['sourceModel'] == equivalent_json(cube('addition'))


def test_all_four_native_ancestry_families_delegate_from_verified_sources_then_full_placement_replay():
    v=[[1,0,0],[-.5,math.sqrt(3)/2,0],[-.5,-math.sqrt(3)/2,0],[0,0,1]]
    faces=[[0,2,1],[0,1,3],[1,2,3],[2,0,3]]
    edges=sorted({tuple(sorted((a,b))) for face in faces for a,b in zip(face,face[1:]+face[:1])})
    source={'id':'literal-north-pole','name':'Literal tetra','dimension':3,'embeddingDimension':3,
        'vertices':v,'edges':[list(e) for e in edges],'faces':faces,'cells':[],
        'interpretation':'generalized-complex','metadata':{'coordinateUnits':'mm'}}
    addition=deepcopy(source);addition['id']='literal-other-north-pole'
    current=native_run(document(source),'attach-at-faces',{'addition':addition,'base_face_id':0,'addition_face_id':0})
    current=native_run(current,'convex-core',{'center':[0,0,0]})
    current=native_run(current,'triangular-geodesic',{'frequency':1})
    current=native_run(current,'transform',{'scale':2})
    placed=run_placement(current,params(face_ids=[0],height=.25,scale=.2))
    assert counts(model(placed)) == (13,21,12,0)
    assert model(replay_placement_document(javascript(placed))) == equivalent_json(model(placed))
    assert model(placed)['vertices'][:5] == model(current)['vertices']


def test_unknown_version_is_saved_readable_but_replay_refuses_and_unrelated_source_target_still_works(tmp_path):
    result=run_placement(document(),params());result['operationHistory']['nodes'][-1]['algorithmVersion']='future'
    path=tmp_path/'unknown-placement.polylab';save_project(path,project(result))
    opened=load_file(path)['project']['documents'][0];before=deepcopy(opened)
    assert counts(model(opened)) == (16,24,12,0)
    with pytest.raises(GeometryError,match='unsupported.*readable'): replay_placement_document(opened)
    source=opened['operationHistory']['nodes'][0]['id']
    assert model(replay_placement_document(opened,target=source)) == opened['states'][0]['model']
    assert opened == before


def test_source_only_root_does_not_execute_unavailable_historical_parent():
    base=document();graph=history.record_source(history.create_history(),'source',base['states'][0])
    state={**deepcopy(base['states'][0]),'operationNode':'unavailable'}
    graph=history.record_operation(graph,'unavailable','source','missing-operation',{},state,algorithm_version='future')
    current={'id':'historical','cursor':0,'states':[state],'operationHistory':graph.to_dict()}
    model(current)['metadata']['offlineAsset']['hash']='edited-source'
    placed=run_placement(current,params())
    def forbidden(value):raise AssertionError('Historical parent must not execute')
    assert model(replay_placement_document(placed,dispatcher=forbidden)) == model(placed)
    assert placed['operationHistory']['nodes'][-2]['parent']=='unavailable'
    assert placed['operationHistory']['nodes'][-2]['inputs']==[]


def test_collinear_attachment_refinements_are_diagnosed_without_silent_source_hull_repair():
    # Welding two cubes at a face retains seam vertices on the edges of a
    # larger rectangular box. Frozen independent convex-source verification
    # excludes these nonextreme refinements instead of replacing incidence.
    parent=native_run(document(),'attach-at-faces',{
        'addition':cube('attached'),'base_face_id':1,'addition_face_id':0})
    before=deepcopy(parent)
    with pytest.raises(GeometryError,match='nonextreme/collinear refinements'):
        run_placement(parent,params())
    assert parent==before
    assert counts(model(run_placement(document(),params())))==(16,24,12,0)


@pytest.mark.parametrize('value',[1e21,-1e21,1e100])
def test_scientific_float_source_attributes_are_node_portable_while_unsafe_decimal_tokens_refuse(value):
    value_request=request();value_request['params']['addition']['metadata']['scientific']=value
    result=javascript(dispatch_placement(value_request))
    assert evidence(result)['sourceModels'][1]['metadata']['scientific']==value
    assert verify_placement_evidence(result)['passed']
    value_request['params']['addition']['metadata']['scientific']=1e20
    with pytest.raises(GeometryError,match='portable safe-integer'):dispatch_placement(value_request)


def test_mounted_registry_membership_is_stable_and_full_attribute_native_replay_is_qualified():
    versions,operations,recorded=history.ALGORITHM_VERSIONS,history.REPLAY_OPERATIONS,recipes.RECORD_OPERATIONS
    placed=run_placement(document(),params())
    assert versions[OPERATION]==VERSION and OPERATION in operations and OPERATION in recorded
    assert history.ALGORITHM_VERSIONS is versions and history.REPLAY_OPERATIONS is operations and recipes.RECORD_OPERATIONS is recorded
    target=placed['states'][-1]['operationNode']
    assert history.replay_history(placed['operationHistory'],native,target)[target]['model']==model(placed)
    assert model(replay_placement_document(placed))==model(placed)


def native_replay(doc,target=None):
    return native({'op':'recipe-replay','params':{'document':doc,**({} if target is None else {'target':target})}})


def native_branch(doc,parameters,target=None):
    return native({'op':'recipe-branch','params':{'document':doc,'parameters':parameters,
        **({} if target is None else {'target':target})}})


def test_mounted_native_strict_dispatch_retains_literal_sources_and_current_kernel_version():
    value=request(id='native-placement',algorithmVersion=VERSION);before=deepcopy(value)
    result=native(value)
    assert counts(result)==(16,24,12,0) and result['fingerprint']==identity(result)
    assert result['provenance']['kernelVersion']=='0.1.0'
    assert result['validation']['passed'] and result['numeric']['certified'] is False
    assert evidence(result)['sourceModels']==equivalent_json([value['model'],value['params']['addition']])
    assert verify_placement_evidence(result)['passed'] and value==before


@pytest.mark.parametrize('change',[
    {'params':3},{'params':None},{'params':[]},{'params':[['addition',cube('addition')]]},
    {'path':'not-authorized.json'},{'algorithmVersion':'future'},{'id':True},{'id':2**53},
    {'params':params(face_ids=[True])},{'params':params(addition_face_id=0.)},
])
def test_mounted_native_envelope_refusals_are_diagnosed_atomic_and_recoverable(change):
    value={**request(),**change};before=deepcopy(value)
    with pytest.raises(GeometryError):native(value)
    assert value==before and counts(native(request()))==(16,24,12,0)


def test_mounted_recipe_run_branch_save_open_and_complete_model_replay(tmp_path):
    original=document();before=deepcopy(original)
    constructed=native_run(original,OPERATION,params(face_ids=[1]))
    assert counts(model(constructed))==(16,24,12,0)
    assert model(native_replay(constructed))==model(constructed)
    branch=native_branch(constructed,params(face_ids=[3,1],scale=.5,height=.25,angle_degrees=90))
    assert counts(model(branch))==(24,36,18,0)
    assert model(branch)['vertices'][:8]==cube()['vertices']
    assert branch['operationHistory']['nodes'][-1]['parent']==constructed['operationHistory']['nodes'][0]['id']
    assert branch['operationHistory']['nodes'][1]==constructed['operationHistory']['nodes'][1]
    path=tmp_path/'mounted-placement.polylab';save_project(path,javascript(project(branch)))
    opened=load_file(path)['project']['documents'][0]
    assert model(native_replay(opened))==model(opened)
    assert verify_placement_evidence(model(opened))['passed'] and original==before


def test_mounted_ordinary_descendants_and_parameter_branch_replay_placement_original_parent():
    ancestor=native_run(document(),'transform',{'scale':2})
    placed=native_run(ancestor,OPERATION,params(face_ids=[1,3],scale=.25))
    transformed=native_run(placed,'transform',{'scale':3});before=deepcopy(transformed)
    for state in transformed['states']:
        assert model(native_replay(transformed,state['operationNode']))==state['model']
    branched=native_branch(transformed,{'scale':4})
    assert model(branched)['vertices']==[[4*x for x in point] for point in model(placed)['vertices']]
    assert model(native_replay(branched))==model(branched)
    # Select the older placement, not the currently selected transform.
    placed_id=placed['states'][-1]['operationNode']
    changed=native_branch(transformed,params(face_ids=[3],scale=.5),placed_id)
    assert counts(model(changed))==(16,24,12,0)
    assert model(changed)['vertices'][:8]==model(ancestor)['vertices']
    assert model(native_replay(changed))==model(changed) and transformed==before


@pytest.mark.parametrize('next_operation',['attach-at-faces','convex-core','triangular-geodesic'])
def test_mounted_placement_component_extraction_then_specialized_operation_routes_replay_full_attributes(next_operation):
    addition=cube('addition') if next_operation!='triangular-geodesic' else regular('tetrahedron')
    addition['metadata']['coordinateUnits']='mm'
    placed=native_run(document(),OPERATION,params(addition=addition,face_ids=[1]))
    component=evidence(model(placed))['placements'][0]['componentIds'][0]
    extracted=native_run(placed,'compound-component',{'component_id':component})
    assert model(extracted)['vertices']==[model(placed)['vertices'][i] for i in evidence(model(placed))['placements'][0]['maps']['vertices']]
    if next_operation=='attach-at-faces':
        arguments={'addition':cube('next-addition'),'base_face_id':1,'addition_face_id':0};expected=(12,20,10,0)
    elif next_operation=='convex-core':
        arguments={'center':[.5,.5,1.5]};expected=(8,12,6,0)
    else:
        arguments={'frequency':2};expected=(10,24,16,0)
    descendant=native_run(extracted,next_operation,arguments)
    assert counts(model(descendant))==expected
    assert model(native_replay(javascript(descendant)))==equivalent_json(model(descendant))
    assert model(native_replay(descendant,placed['states'][-1]['operationNode']))==model(placed)


def test_mounted_all_four_native_ancestor_families_then_placement_replay_and_branch():
    faces=[[0,2,1],[0,1,3],[1,2,3],[2,0,3]]
    edges=sorted({tuple(sorted((a,b))) for face in faces for a,b in zip(face,face[1:]+face[:1])})
    source={'id':'literal-mounted-north','name':'Literal tetra','dimension':3,'embeddingDimension':3,
        'vertices':[[1,0,0],[-.5,math.sqrt(3)/2,0],[-.5,-math.sqrt(3)/2,0],[0,0,1]],
        'edges':[list(row) for row in edges],'faces':faces,'cells':[],'interpretation':'generalized-complex',
        'metadata':{'coordinateUnits':'mm','offlineAsset':{'hash':'literal-ancestor'}}}
    addition=deepcopy(source);addition['id']='literal-mounted-other-north'
    current=native_run(document(source),'attach-at-faces',{'addition':addition,'base_face_id':0,'addition_face_id':0})
    current=native_run(current,'convex-core',{'center':[0,0,0]})
    current=native_run(current,'triangular-geodesic',{'frequency':1})
    current=native_run(current,'transform',{'scale':2})
    placed=native_run(current,OPERATION,params(face_ids=[0],scale=.2,height=.25))
    assert counts(model(placed))==(13,21,12,0)
    assert model(native_replay(javascript(placed)))==equivalent_json(model(placed))
    branched=native_branch(placed,params(face_ids=[0,1],scale=.3))
    assert counts(model(branched))==(21,33,18,0)
    assert model(branched)['vertices'][:5]==model(current)['vertices']
    assert model(native_replay(branched))==model(branched)


@pytest.mark.parametrize('field',['color','unit','component','source'])
def test_mounted_native_full_attribute_fence_rejects_geometry_equal_retained_snapshot_forgery(field):
    placed=native_run(document(),OPERATION,params())
    descendant=native_run(placed,'transform',{'scale':2})
    snapshot=descendant['operationHistory']['nodes'][-2]['snapshot']['model']
    if field=='color':snapshot['metadata']['offColors']['faces'][0]['values'][3]=0
    elif field=='unit':snapshot['metadata']['coordinateUnits']='cm'
    elif field=='component':snapshot['components'][1]['sourcePath']=[0]
    else:evidence(snapshot)['sourceModels'][1]['metadata']['offlineAsset']['hash']='forged'
    assert history.validate_document_history(descendant)
    before=deepcopy(descendant)
    with pytest.raises(GeometryError,match='attribute verification'):native_replay(descendant)
    assert descendant==before


def test_mounted_unknown_version_remains_readable_and_source_only_targets_do_not_execute_it(tmp_path):
    ancestor=native_run(document(),'transform',{'scale':2})
    placed=native_run(ancestor,OPERATION,params());placed['operationHistory']['nodes'][-1]['algorithmVersion']='999.future'
    path=tmp_path/'mounted-future-placement.polylab';save_project(path,project(placed))
    opened=load_file(path)['project']['documents'][0];before=deepcopy(opened)
    assert counts(model(opened))==(16,24,12,0)
    with pytest.raises(GeometryError,match='unsupported.*readable'):native_replay(opened)
    assert model(native_replay(opened,ancestor['states'][-1]['operationNode']))==model(ancestor)
    assert opened==before


def test_actual_cold_jsonlines_server_strict_failure_then_valid_placement_recovers_with_correlated_response():
    values=[request(id='bad-params',params=3),request(id='good-placement',algorithmVersion=VERSION)]
    result=subprocess.run([sys.executable,'-B','-m','engine.server'],cwd=Path(__file__).resolve().parents[1],
        input=''.join(history._json_bytes(value).decode()+'\n' for value in values),
        encoding='utf-8',capture_output=True,timeout=30,
        creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
    assert result.returncode==0,result.stderr
    responses=[json.loads(line) for line in result.stdout.splitlines()]
    assert len(responses)==2 and responses[0]['id']=='bad-params'
    assert responses[0]['ok'] is False and responses[0]['type']=='GeometryError'
    assert responses[1]['id']=='good-placement' and responses[1]['ok'] is True
    assert counts(responses[1]['result'])==(16,24,12,0)
    assert verify_placement_evidence(responses[1]['result'])['passed']
