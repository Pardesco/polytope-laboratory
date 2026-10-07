"""Actual native history/file/transform/JSON qualification, no GUI."""
from copy import deepcopy
from math import nextafter, sqrt
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

import engine.history as history
import engine.recipes as recipes
from engine.formats import load_file, save_project
from engine.geometry import GeometryError, identity, intrinsic_measures
from engine.generators import regular
from engine.server import dispatch as native_dispatch
from engine.augmentation_workflow import equivalent_json
from engine.triangular_geodesic_workflow import (
    OPERATION, VERSION, JSON_BINDING, branch_geodesic, dispatch_geodesic,
    replay_geodesic_document, replay_geodesic_history, run_geodesic,
    verify_geodesic_evidence)


def document():
    source = regular('icosahedron')
    source['id'] = 'workflow-source-icosahedron'
    source['metadata'].update(coordinateUnits='mm', arbitraryNumbers=[2.0, -0.0, .125],
                              offlineAsset={'relativePath': 'textures/local.png', 'contentHash': 'original-asset'})
    source['metadata']['offColors'] = {'faces': [{'encoding': 'unit', 'values': [.1, .2, .3, 1.0]} for _ in range(20)], 'cells': []}
    return {'id': 'legacy-document', 'cursor': 0, 'states': [{'model': source,
             'view': {'coordinateUnit': 'mm', 'angles': [0, 0, 0, 0, 0, 0]}, 'label': 'Original', 'notes': 'Retain source notes'}]}


def model(doc):
    return doc['states'][doc['cursor']]['model']


def project(doc):
    return {'format': 'polytope-laboratory', 'version': 1, 'active': 0, 'documents': [doc]}


def request(source, frequency=2, **extras):
    return {'op': OPERATION, 'model': source, 'params': {'frequency': frequency}, **extras}


def javascript_roundtrip(value):
    code = "let t='';process.stdin.on('data',c=>t+=c).on('end',()=>process.stdout.write(JSON.stringify(JSON.parse(t))));"
    child = subprocess.run(['node', '-e', code], input=history._json_bytes(value).decode('utf-8'),
                           encoding='utf-8', capture_output=True, timeout=20,
                           creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
    assert child.returncode == 0, child.stderr
    return json.loads(child.stdout)


def test_strict_dispatch_is_native_valid_generalized_and_retains_full_source():
    source = model(document())
    before = json.loads(json.dumps(source))
    result = dispatch_geodesic(request(source))
    assert [len(result[k]) for k in ('vertices', 'edges', 'faces', 'cells')] == [42, 120, 80, 0]
    assert result['validation']['passed'] and result['fingerprint'] == identity(result)
    assert result['interpretation'] == 'generalized-complex' and 'measure' not in result
    assert intrinsic_measures(result) is None and result['numeric']['certified'] is False
    assert result['metadata']['triangularGeodesic']['sourceModel'] == equivalent_json(before)
    assert result['metadata']['coordinateUnits'] == 'mm'
    assert len(result['metadata']['offColors']['faces']) == 80
    assert verify_geodesic_evidence(result)['passed']
    assert json.loads(json.dumps(source)) == before


def test_real_node_numeric_spellings_preserve_complete_source_hashes_colors_units_and_evidence():
    source = model(document())
    result = dispatch_geodesic(request(source))
    node = javascript_roundtrip(result)
    assert equivalent_json(node) == equivalent_json(result)
    assert verify_geodesic_evidence(node)['passed']
    assert node['metadata']['triangularGeodesic']['jsonBinding']['version'] == JSON_BINDING
    assert node['metadata']['triangularGeodesic']['sourceModel']['metadata']['arbitraryNumbers'] == [2, 0, .125]


def test_immutable_run_native_json_project_save_open_and_replay(tmp_path):
    original = document()
    before = json.loads(json.dumps(original))
    result = run_geodesic(original, {'frequency': 2})
    assert json.loads(json.dumps(original)) == before
    assert result['cursor'] == 1 and len(result['states']) == 2
    graph = history.validate_document_history(result).to_dict()
    assert graph['nodes'][-1]['op'] == OPERATION and graph['nodes'][-1]['algorithmVersion'] == VERSION
    assert result['states'][-1]['notes'] == 'Retain source notes'
    saved = javascript_roundtrip(project(result))
    validated = native_dispatch({'op': 'validate-project', 'params': {'project': saved}})
    path = tmp_path/'development-geodesic.polylab'
    save_project(path, validated)
    opened = load_file(path)['project']['documents'][0]
    replayed = replay_geodesic_document(opened)
    assert model(replayed) == model(opened)
    assert verify_geodesic_evidence(model(replayed))['passed']
    assert replayed['states'][0]['view']['coordinateUnit'] == 'mm'


def test_native_transform_ancestor_and_descendant_replay_actual_dispatch_and_literal_scale():
    original = document()
    ancestor = native_dispatch({'op': 'recipe-run', 'params': {'document': original, 'operation': 'transform', 'parameters': {'scale': 2}}})
    geodesic = run_geodesic(ancestor, {'frequency': 2})
    descendant = native_dispatch({'op': 'recipe-run', 'params': {'document': geodesic, 'operation': 'transform', 'parameters': {'scale': 2}}})
    calls = []
    def tracked(value):
        calls.append(value['op'])
        return native_dispatch(value)
    replayed = replay_geodesic_document(javascript_roundtrip(descendant), dispatcher=tracked)
    assert calls == ['transform', 'transform']
    assert model(replayed) == model(descendant)
    assert model(replayed)['vertices'] == [[2*x for x in p] for p in model(geodesic)['vertices']]
    assert model(geodesic)['vertices'][:12] == [[2*x for x in p] for p in model(original)['vertices']]
    assert model(replayed)['metadata']['offColors'] == model(geodesic)['metadata']['offColors']
    with pytest.raises(GeometryError, match='stale'):
        verify_geodesic_evidence(model(replayed))


def test_actual_native_attachment_after_geodesic_replays_without_recursive_registry_patch():
    geodesic = run_geodesic(document(), {'frequency': 1})
    addition = regular('icosahedron')
    addition['id'] = 'literal-addition'
    addition['metadata']['coordinateUnits'] = 'mm'
    attached = native_dispatch({'op': 'recipe-run', 'params': {'document': geodesic, 'operation': 'attach-at-faces',
                                'parameters': {'addition': addition, 'base_face_id': 0, 'addition_face_id': 0}}})
    assert [len(model(attached)[k]) for k in ('vertices', 'edges', 'faces')] == [21, 57, 38]
    calls = []
    def tracked(value):
        calls.append(value['op'])
        return native_dispatch(value)
    replayed = replay_geodesic_document(javascript_roundtrip(attached), dispatcher=tracked)
    assert model(replayed) == model(attached)
    # Specialized attachment replay uses its actual qualified kernel directly;
    # no temporary graph dispatches a geodesic ancestor recursively.
    assert OPERATION not in calls
    assert OPERATION in history.REPLAY_OPERATIONS
    assert history.ALGORITHM_VERSIONS[OPERATION] == VERSION


def test_geometry_equal_but_forged_native_ancestor_attributes_are_refused_by_full_replay():
    ancestor = native_dispatch({'op': 'recipe-run', 'params': {'document': document(), 'operation': 'transform', 'parameters': {'scale': 2}}})
    doc = run_geodesic(ancestor, {'frequency': 2})
    def corrupted(value):
        response = native_dispatch(value)
        response['metadata']['coordinateUnits'] = 'ft'
        return response
    with pytest.raises(GeometryError, match='attribute verification'):
        replay_geodesic_document(doc, dispatcher=corrupted)


def test_original_parent_branch_not_refinement_of_selected_result_and_old_graph_remains():
    original = run_geodesic(document(), {'frequency': 2})
    before = deepcopy(original)
    branch = branch_geodesic(original, {'frequency': 3})
    assert len(model(branch)['vertices']) == 92 and len(model(branch)['faces']) == 180
    nodes = branch['operationHistory']['nodes']
    assert nodes[-1]['parent'] == nodes[0]['id'] and nodes[-1]['parent'] != nodes[1]['id']
    assert len(nodes) == 3 and nodes[1] == original['operationHistory']['nodes'][1]
    assert model(replay_geodesic_document(branch)) == model(branch)
    assert original == before


def test_undo_new_branch_retains_abandoned_node_and_bad_params_are_atomic():
    doc = run_geodesic(document(), {'frequency': 2})
    doc['cursor'] = 0
    before = deepcopy(doc)
    with pytest.raises(GeometryError, match='counts exceed'):
        run_geodesic(doc, {'frequency': 20})
    assert doc == before
    result = run_geodesic(doc, {'frequency': 3})
    assert len(result['states']) == 2 and len(result['operationHistory']['nodes']) == 3
    assert result['operationHistory']['nodes'][-1]['parent'] == result['operationHistory']['nodes'][0]['id']
    assert doc == before


def test_geometry_equal_rgba_unit_asset_edits_get_new_full_attribute_source_root():
    current = native_dispatch({'op': 'recipe-run', 'params': {'document': document(), 'operation': 'transform', 'parameters': {'scale': 1}}})
    original_node = current['states'][-1]['operationNode']
    model(current)['metadata']['offColors']['faces'][0] = {'encoding': 'byte', 'values': [11, 22, 33, 127]}
    model(current)['metadata']['coordinateUnits'] = 'cm'
    model(current)['metadata']['offlineAsset']['contentHash'] = 'changed-asset'
    before = deepcopy(current)
    result = run_geodesic(current, {'frequency': 2})
    nodes = result['operationHistory']['nodes']
    assert nodes[-2]['op'] == 'source' and nodes[-2]['parent'] == original_node and nodes[-2]['inputs'] == []
    assert nodes[-1]['parent'] == nodes[-2]['id']
    assert model(result)['metadata']['coordinateUnits'] == 'cm'
    assert model(result)['metadata']['offColors']['faces'][0]['values'][-1] == 127
    assert model(replay_geodesic_document(result)) == model(result)
    assert current == before


def test_view_angles_notes_only_do_not_create_geometry_source_root():
    current = native_dispatch({'op': 'recipe-run', 'params': {'document': document(), 'operation': 'transform', 'parameters': {'scale': 1}}})
    current['states'][-1]['view']['angles'] = [17, 0, 0, 0, 0, 0]
    current['states'][-1]['notes'] = 'Edited notes'
    result = run_geodesic(current, {'frequency': 2})
    assert len(result['operationHistory']['nodes']) == 3
    assert result['operationHistory']['nodes'][-1]['parent'] == current['states'][-1]['operationNode']
    assert result['states'][-1]['view']['angles'][0] == 17 and result['states'][-1]['notes'] == 'Edited notes'


@pytest.mark.parametrize('mutate', [
    lambda m: m['metadata']['offColors']['faces'][0]['values'].__setitem__(3, .2),
    lambda m: m['metadata'].__setitem__('coordinateUnits', 'cm'),
    lambda m: m['metadata']['triangularGeodesic']['sourceMaps']['faces'][0].__setitem__(0, 1),
    lambda m: m['metadata']['triangularGeodesic']['vertexSources'][12].__setitem__('sourceEdgeId', 5),
    lambda m: m['metadata']['triangularGeodesic']['sourceModel']['metadata']['offlineAsset'].__setitem__('contentHash', 'forged'),
    lambda m: m['metadata']['triangularGeodesic'].__setitem__('sourceAttributesFingerprint', '0'*64),
    lambda m: m['metadata']['triangularGeodesic']['sphere'].__setitem__('radius', 99),
    lambda m: m['provenance']['parameters'].__setitem__('frequency', 3),
    lambda m: m['faces'][0].reverse(),
])
def test_fresh_full_evidence_refuses_forged_colors_units_maps_source_or_geometry(mutate):
    result = dispatch_geodesic(request(model(document())))
    mutate(result)
    with pytest.raises(GeometryError):
        verify_geodesic_evidence(result)


def test_geometry_only_history_acceptance_does_not_replace_full_attribute_replay():
    doc = run_geodesic(document(), {'frequency': 2})
    doc['operationHistory']['nodes'][-1]['snapshot']['model']['metadata']['offColors']['faces'][0]['values'][3] = .2
    assert history.validate_document_history(doc)
    with pytest.raises(GeometryError, match='attribute verification'):
        replay_geodesic_document(doc)


def test_unknown_version_and_operation_are_readable_native_projects_with_explicit_replay_refusal(tmp_path):
    doc = run_geodesic(document(), {'frequency': 2})
    doc['operationHistory']['nodes'][-1]['algorithmVersion'] = '999.future'
    path = tmp_path/'unknown-geodesic-version.json'
    save_project(path, project(doc))
    opened = load_file(path)['project']['documents'][0]
    assert len(model(opened)['vertices']) == 42
    with pytest.raises(GeometryError, match='unsupported.*readable'):
        replay_geodesic_document(opened)
    opened['operationHistory']['nodes'][-1]['op'] = 'unknown-construction'
    with pytest.raises(GeometryError, match='Unsupported.*readable'):
        replay_geodesic_document(opened)


def test_source_only_attribute_root_does_not_execute_unknown_historical_parent():
    base = document()
    graph = history.record_source(history.create_history(), 'source', base['states'][0])
    state = {**deepcopy(base['states'][0]), 'operationNode': 'unknown'}
    graph = history.record_operation(graph, 'unknown', 'source', 'unavailable-ancestor', {}, state, algorithm_version='future')
    doc = {'id': 'historical', 'cursor': 0, 'states': [state], 'operationHistory': graph.to_dict()}
    model(doc)['metadata']['coordinateUnits'] = 'cm'  # forces fresh source-only root
    constructed = run_geodesic(doc, {'frequency': 2})
    calls = []
    def forbidden(request):
        calls.append(request)
        raise AssertionError('Unknown historical ancestry must not be executed')
    result = replay_geodesic_document(constructed, dispatcher=forbidden)
    assert calls == [] and model(result) == model(constructed)
    source_id = constructed['operationHistory']['nodes'][-2]['id']
    assert constructed['operationHistory']['nodes'][-2]['parent'] == 'unknown'
    assert constructed['operationHistory']['nodes'][-2]['inputs'] == []
    assert source_id in replay_geodesic_history(constructed['operationHistory'], forbidden, target=source_id)


@pytest.mark.parametrize('change', [
    {'params': {'frequency': True}}, {'params': {'frequency': 2.0}}, {'params': {'frequency': 2, 'radius': 1}},
    {'algorithmVersion': 'future'}, {'path': 'external.json'}, {'op': 'load'}, {'id': True}, {'id': 2**53},
])
def test_invalid_dispatch_envelopes_refuse_and_next_valid_request_succeeds(change):
    source = model(document())
    before = json.loads(json.dumps(source))
    with pytest.raises(GeometryError):
        dispatch_geodesic({**request(source), **change})
    assert json.loads(json.dumps(source)) == before
    assert len(dispatch_geodesic(request(source, 1))['vertices']) == 12


def test_malformed_incidence_never_normalized_into_valid_ids_and_production_registries_unchanged():
    versions, ops, records = history.ALGORITHM_VERSIONS, history.REPLAY_OPERATIONS, recipes.RECORD_OPERATIONS
    source = model(document())
    source['edges'][0][0] = float(source['edges'][0][0])
    with pytest.raises(GeometryError, match='invalid endpoints'):
        dispatch_geodesic(request(source))
    source = model(document())
    source['edges'][0][0] = True
    with pytest.raises(GeometryError):
        dispatch_geodesic(request(source))
    result = run_geodesic(document(), {'frequency': 2})
    assert versions[OPERATION] == VERSION and OPERATION in ops and OPERATION in records
    assert history.ALGORITHM_VERSIONS is versions and history.REPLAY_OPERATIONS is ops and recipes.RECORD_OPERATIONS is records
    # The ordinary source-only target remains native replayable without patches.
    root = result['operationHistory']['nodes'][0]['id']
    native_source = native_dispatch({'op': 'recipe-replay', 'params': {'document': result, 'target': root}})
    assert len(model(native_source)['vertices']) == 12
    assert model(native_dispatch({'op': 'recipe-replay', 'params': {'document': result}})) == model(result)


@pytest.mark.parametrize('value', [1e20, nextafter(1e21, 0)])
def test_large_integral_float_json_portability_gap_is_refused_before_a_saved_operation_can_be_qualified(value):
    # Independent real-Node witness: Python float1e20 becomes a decimal integer
    # token on return, outside the native-equivalent helper's safe integer policy.
    transposed = javascript_roundtrip({'attribute': value})
    assert type(transposed['attribute']) is int and transposed['attribute'] > 2**53-1
    source = model(document())
    source['metadata']['largeAttribute'] = value
    before = deepcopy(source)
    with pytest.raises(GeometryError, match='portable safe-integer'):
        dispatch_geodesic(request(source))
    assert source == before
    source['metadata']['largeAttribute'] = '100000000000000000000'
    assert verify_geodesic_evidence(dispatch_geodesic(request(source)))['passed']


def test_unknown_numeric_policy_and_forged_source_hash_refuse_without_mutating_readable_document():
    original = run_geodesic(document(), {'frequency': 2})
    altered = deepcopy(original)
    altered['operationHistory']['nodes'][-1]['numericPolicy']['tolerance'] = .5
    before = deepcopy(altered)
    with pytest.raises(GeometryError, match='numeric policy.*readable'):
        replay_geodesic_document(altered)
    assert altered == before
    altered = deepcopy(original)
    altered['operationHistory']['nodes'][0]['sourceSnapshotHash'] = '0'*64
    with pytest.raises(GeometryError, match='forged source snapshot hash'):
        replay_geodesic_document(altered)


def native_run(doc, operation, parameters):
    return native_dispatch({'op': 'recipe-run', 'params': {
        'document': doc, 'operation': operation, 'parameters': parameters}})


def native_replay(doc, target=None):
    return native_dispatch({'op': 'recipe-replay', 'params': {
        'document': doc, **({} if target is None else {'target': target})}})


def native_branch(doc, parameters, target=None):
    return native_dispatch({'op': 'recipe-branch', 'params': {
        'document': doc, 'parameters': parameters,
        **({} if target is None else {'target': target})}})


def cospherical_attachment_document():
    # Unit equilateral equatorial triangle plus north pole. Attaching the
    # identical tetra at face0 adds the south pole; no generated hull fixture
    # supplies the eligibility/count oracle for the resulting bipyramid.
    faces = [[0, 2, 1], [0, 1, 3], [1, 2, 3], [2, 0, 3]]
    edges = sorted({tuple(sorted((a, b))) for face in faces
                    for a, b in zip(face, face[1:]+face[:1])})
    source = {'id': 'literal-cospherical-tetra', 'name': 'Literal spherical tetra',
              'dimension': 3, 'embeddingDimension': 3,
              'vertices': [[1., 0., 0.], [-.5, sqrt(3)/2, 0.],
                           [-.5, -sqrt(3)/2, 0.], [0., 0., 1.]],
              'edges': [list(edge) for edge in edges], 'faces': faces, 'cells': [],
              'interpretation': 'generalized-complex',
              'metadata': {'coordinateUnits': 'mm', 'offlineAsset': {'contentHash': 'literal-asset'},
                           'offColors': {'faces': [{'encoding': 'byte', 'values': [11, 22, 33, 127]}
                                                  for _ in faces], 'cells': []}}}
    return {'id': 'literal-spherical-document', 'cursor': 0,
            'states': [{'model': source, 'view': {'coordinateUnit': 'mm'}, 'label': 'Original'}]}


def test_mounted_native_dispatch_and_recipe_branch_use_original_parent_and_save_full_attributes(tmp_path):
    original = document()
    before = deepcopy(original)
    direct = native_dispatch(request(model(original), id='correlation-1', algorithmVersion=VERSION))
    assert verify_geodesic_evidence(direct)['passed']
    result = native_run(original, OPERATION, {'frequency': 2})
    assert model(result) == direct
    assert model(native_replay(result)) == model(result)
    branched = native_branch(result, {'frequency': 3})
    assert [len(model(branched)[key]) for key in ('vertices', 'edges', 'faces')] == [92, 270, 180]
    assert branched['operationHistory']['nodes'][-1]['parent'] == result['operationHistory']['nodes'][0]['id']
    assert result['operationHistory']['nodes'][1] == branched['operationHistory']['nodes'][1]
    path = tmp_path/'mounted-geodesic.polylab'
    save_project(path, javascript_roundtrip(project(branched)))
    opened = load_file(path)['project']['documents'][0]
    assert model(native_replay(opened)) == model(opened)
    assert verify_geodesic_evidence(model(opened))['passed']
    assert original == before


@pytest.mark.parametrize('change', [
    {'params': {'frequency': True}}, {'params': {'frequency': 2.0}},
    {'params': {'frequency': 2, 'radius': 1}}, {'params': None}, {'params': 3},
    {'params': [['frequency', 2]]}, {'algorithmVersion': 'future'},
    {'path': 'not-authorized.json'}, {'id': True}, {'id': 2**53},
])
def test_mounted_native_strict_envelope_refusals_are_atomic_and_recover(change):
    source = model(document())
    before = deepcopy(source)
    with pytest.raises(GeometryError):
        native_dispatch({**request(source), **change})
    assert source == before
    assert len(native_dispatch(request(source, 1))['vertices']) == 12


def test_mounted_native_literal_incidence_is_not_coerced_before_strict_dispatch():
    for malformed in (0.0, True):
        source = model(document())
        source['edges'][0][0] = malformed
        before = deepcopy(source)
        with pytest.raises(GeometryError):
            native_dispatch(request(source))
        assert source == before


def test_mounted_native_geodesic_then_attachment_mixed_targets_and_attachment_branch():
    original = document()
    scaled = native_run(original, 'transform', {'scale': 2})
    geodesic = native_run(scaled, OPERATION, {'frequency': 1})
    addition = regular('icosahedron')
    addition['id'] = 'mounted-icosa-addition'
    addition['metadata']['coordinateUnits'] = 'mm'
    attached = native_run(geodesic, 'attach-at-faces', {
        'addition': addition, 'base_face_id': 0, 'addition_face_id': 0, 'scale': 2})
    descendant = native_run(attached, 'transform', {'scale': .5})
    before = deepcopy(descendant)
    assert [len(model(attached)[key]) for key in ('vertices', 'edges', 'faces')] == [21, 57, 38]
    # Select every required closure, including ordinary ancestors/descendants
    # inside a graph that also contains geodesic and specialized attachment.
    for state in descendant['states']:
        target = state['operationNode']
        assert model(native_replay(descendant, target)) == state['model']
        raw = history.replay_history(descendant['operationHistory'], native_dispatch, target)[target]['model']
        # Ordinary history operations generate fresh IDs; mounted document
        # replay restores the retained ID, asserted separately above. Every
        # other source attribute and ordered incidence must remain identical.
        assert {k: v for k, v in raw.items() if k != 'id'} == {k: v for k, v in state['model'].items() if k != 'id'}
    attach_node = attached['states'][-1]['operationNode']
    branch = native_branch(descendant, {'addition': addition, 'base_face_id': 1,
                                       'addition_face_id': 0, 'scale': 2}, attach_node)
    assert [len(model(branch)[key]) for key in ('vertices', 'edges', 'faces')] == [21, 57, 38]
    assert branch['operationHistory']['nodes'][-1]['parent'] == geodesic['states'][-1]['operationNode']
    assert model(native_replay(branch)) == model(branch)
    # Ordinary selected operation uses its original attachment parent too.
    scaled_branch = native_branch(descendant, {'scale': 3})
    assert model(scaled_branch)['vertices'] == [[3*x for x in p] for p in model(attached)['vertices']]
    assert model(native_replay(scaled_branch)) == model(scaled_branch)
    assert descendant == before


def test_mounted_native_attachment_then_geodesic_uses_literal_cospherical_bipyramid_and_original_parent():
    source = cospherical_attachment_document()
    addition = deepcopy(model(source))
    addition['id'] = 'literal-north-pole-addition'
    attached = native_run(source, 'attach-at-faces', {
        'addition': addition, 'base_face_id': 0, 'addition_face_id': 0})
    assert [len(model(attached)[key]) for key in ('vertices', 'edges', 'faces')] == [5, 9, 6]
    assert all(sum(x*x for x in point) == pytest.approx(1) for point in model(attached)['vertices'])
    before = deepcopy(attached)
    refined = native_run(attached, OPERATION, {'frequency': 2})
    assert [len(model(refined)[key]) for key in ('vertices', 'edges', 'faces')] == [14, 36, 24]
    assert model(refined)['vertices'][:5] == model(attached)['vertices']
    assert model(native_replay(javascript_roundtrip(refined))) == model(refined)
    branched = native_branch(refined, {'frequency': 3})
    assert [len(model(branched)[key]) for key in ('vertices', 'edges', 'faces')] == [29, 81, 54]
    assert branched['operationHistory']['nodes'][-1]['parent'] == attached['states'][-1]['operationNode']
    assert verify_geodesic_evidence(model(branched))['passed']
    assert model(native_replay(branched)) == model(branched)
    assert attached == before


@pytest.mark.parametrize('field', ['color', 'unit', 'asset'])
def test_mounted_native_replay_rejects_geometry_equal_retained_full_attribute_tampering(field):
    result = native_run(document(), OPERATION, {'frequency': 2})
    snapshot = result['operationHistory']['nodes'][-1]['snapshot']['model']
    if field == 'color': snapshot['metadata']['offColors']['faces'][0]['values'][3] = .2
    elif field == 'unit': snapshot['metadata']['coordinateUnits'] = 'cm'
    else: snapshot['metadata']['triangularGeodesic']['sourceModel']['metadata']['offlineAsset']['contentHash'] = 'forged'
    assert history.validate_document_history(result)  # Geometry-only association is insufficient.
    before = deepcopy(result)
    with pytest.raises(GeometryError, match='attribute verification'):
        native_replay(result)
    assert result == before


def test_mounted_native_unknown_geodesic_version_retains_readable_snapshots_and_unrelated_targets(tmp_path):
    ancestor = native_run(document(), 'transform', {'scale': 2})
    result = native_run(ancestor, OPERATION, {'frequency': 2})
    result['operationHistory']['nodes'][-1]['algorithmVersion'] = '999.future'
    path = tmp_path/'mounted-unknown-geodesic.polylab'
    save_project(path, project(result))
    opened = load_file(path)['project']['documents'][0]
    before = deepcopy(opened)
    assert len(model(opened)['vertices']) == 42
    with pytest.raises(GeometryError, match='unsupported.*readable'):
        native_replay(opened)
    ordinary_id = ancestor['states'][-1]['operationNode']
    assert model(native_replay(opened, ordinary_id)) == model(ancestor)
    raw = history.replay_history(opened['operationHistory'], native_dispatch, ordinary_id)[ordinary_id]['model']
    assert {k: v for k, v in raw.items() if k != 'id'} == {k: v for k, v in model(ancestor).items() if k != 'id'}
    assert opened == before


def test_actual_cold_jsonlines_server_diagnoses_malformed_envelope_then_recovers_with_correlated_model():
    source = model(document())
    requests = [request(source, id='bad-envelope', params=3),
                request(source, id='valid-frequency-two', algorithmVersion=VERSION)]
    child = subprocess.run([sys.executable, '-B', '-m', 'engine.server'],
                           cwd=Path(__file__).resolve().parents[1],
                           input=''.join(history._json_bytes(value).decode('utf-8')+'\n' for value in requests),
                           encoding='utf-8', capture_output=True, timeout=30,
                           creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
    assert child.returncode == 0, child.stderr
    responses = [json.loads(line) for line in child.stdout.splitlines()]
    assert len(responses) == 2
    assert responses[0]['id'] == 'bad-envelope' and responses[0]['ok'] is False
    assert responses[0]['type'] == 'GeometryError'
    assert responses[1]['id'] == 'valid-frequency-two' and responses[1]['ok'] is True
    result = responses[1]['result']
    assert [len(result[key]) for key in ('vertices', 'edges', 'faces')] == [42, 120, 80]
    assert result['metadata']['coordinateUnits'] == 'mm'
    assert result['metadata']['triangularGeodesic']['sourceModel'] == equivalent_json(source)
    assert verify_geodesic_evidence(result)['passed']


@pytest.mark.parametrize('value', [1e21, -1e21, 1e99, 1e100])
def test_ecmascript_scientific_float_boundary_retains_attributes_and_evidence(value):
    # Number::toString uses scientific notation at abs>=1e21. Real Node is
    # the independent boundary witness, not an assumed Python spelling.
    returned = javascript_roundtrip({'attribute': value})
    assert type(returned['attribute']) is float and returned['attribute'] == value
    source = model(document())
    source['metadata']['largeScientificAttribute'] = value
    result = native_dispatch(request(source))
    reopened = javascript_roundtrip(result)
    assert reopened['metadata']['triangularGeodesic']['sourceModel']['metadata']['largeScientificAttribute'] == value
    assert verify_geodesic_evidence(reopened)['passed']


@pytest.mark.parametrize('core_first', [True, False])
def test_mounted_convex_core_and_geodesic_mixed_replay_preserves_scientific_bounds_rgba_units(core_first):
    source = document()
    model(source).update(regular('tetrahedron'))
    model(source)['metadata'].update(coordinateUnits='mm',
                                    arbitraryNumbers=[2., -0., .125],
                                    offlineAsset={'contentHash': 'core-geo-asset'})
    model(source)['metadata']['offColors'] = {
        'faces': [{'encoding': 'byte', 'values': [11, 22, 33, 127]} for _ in range(4)], 'cells': []}
    source = native_run(source, 'transform', {'scale': 2})
    operations = [('convex-core', {'center': [0, 0, 0]}), (OPERATION, {'frequency': 2})]
    if not core_first: operations.reverse()
    for operation, params in operations:
        source = native_run(source, operation, params)
    assert [len(model(source)[key]) for key in ('vertices', 'edges', 'faces')] == [10, 24, 16]
    # Native core evidence contains genuine float resource bounds1e100.
    core_state = next(state for state in source['states']
                      if state['model'].get('provenance', {}).get('operation') == 'convex-core')
    assert core_state['model']['metadata']['convexCore']['resourceBounds']['coordinateMagnitude'] == 1e100
    native = javascript_roundtrip(source)
    before = deepcopy(native)
    assert model(native_replay(native)) == equivalent_json(model(source))
    for state in native['states']:
        assert model(native_replay(native, state['operationNode'])) == state['model']
    assert model(source)['metadata']['coordinateUnits'] == 'mm'
    assert model(source)['metadata']['offColors']['faces'][0]['values'][3] == 127
    native['operationHistory']['nodes'][-1]['snapshot']['model']['metadata']['coordinateUnits'] = 'cm'
    with pytest.raises(GeometryError, match='attribute.*verification'):
        native_replay(native)
    assert source == javascript_roundtrip(before)
