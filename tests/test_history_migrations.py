"""Pinned legacy semantics, safe snapshots and fail-before-dispatch policy."""

from copy import deepcopy
import json
from pathlib import Path

import pytest

from engine.formats import load_file, save_project, validate_project
from engine.geometry import GeometryError
from engine.generators import regular
from engine.history import canonical_model, create_history, record_source, record_operation, replay_history
from engine.history_migrations import replay_support, supported_versions
from engine.server import dispatch

FIXTURE = Path(__file__).parent / 'fixtures/history/polygon-prism-0.1.polyproj'


def legacy():
    return load_file(FIXTURE)['project']


def recipe(op, doc, **params):
    return dispatch({'op': 'recipe-' + op, 'params': {'document': doc, **params}})


def test_legacy_fixture_roundtrip_preserves_graph_versions_and_analytic_prism(tmp_path):
    original_bytes = FIXTURE.read_bytes()
    project = legacy()
    doc = project['documents'][0]
    graph = deepcopy(doc['operationHistory'])
    model = doc['states'][1]['model']
    assert model['interpretation'] == 'generalized-complex'
    assert (len(model['vertices']), len(model['edges']), len(model['faces'])) == (8, 12, 6)
    assert sorted(map(tuple, model['vertices'])) == sorted((x, y, z) for x in (-1, 1) for y in (-1, 1) for z in (-1, 1))
    assert supported_versions('polygon-prism') == ('0.2.0', '0.1.0')
    path = tmp_path / 'saved.polyproj'
    save_project(path, project)
    reopened = load_file(path)['project']['documents'][0]
    assert reopened['operationHistory'] == graph
    calls = []

    def tracked(request):
        calls.append(deepcopy(request))
        return dispatch(request)

    replayed = replay_history(graph, tracked, 'legacy-prism')['legacy-prism']
    assert calls[0]['algorithmVersion'] == '0.1.0'
    assert canonical_model(replayed['model']) == canonical_model(model)
    assert replayed['model']['metadata']['offColors'] == model['metadata']['offColors']
    assert (
        model['metadata']['offColors']['faces']
        == [{'encoding': 'unit', 'values': [0.2, 0.5, 1, 0.25]}] * 2 + [None] * 4
    )
    assert replayed['notes'] == doc['states'][doc['cursor']]['notes']
    assert FIXTURE.read_bytes() == original_bytes


def test_legacy_parameter_branch_retains_version_and_old_branch(tmp_path):
    doc = legacy()['documents'][0]
    before = deepcopy(doc)
    branched = recipe('branch', doc, parameters={'height': 4})
    assert doc == before and branched['id'] != doc['id']
    assert branched['operationHistory']['nodes'][:2] == before['operationHistory']['nodes']
    node = branched['operationHistory']['nodes'][-1]
    assert node['algorithmVersion'] == '0.1.0' and node['params'] == {'height': 4}
    model = branched['states'][-1]['model']
    assert model['interpretation'] == 'generalized-complex'
    assert sorted(set(p[2] for p in model['vertices'])) == [-2, 2]
    project = {'format': 'polytope-laboratory', 'version': 1, 'active': 0, 'documents': [branched]}
    path = tmp_path / 'branch.polyproj'
    save_project(path, project)
    reopened = load_file(path)['project']['documents'][0]
    for target, height in [('legacy-prism', 1), (node['id'], 2)]:
        replayed = recipe('replay', reopened, target=target)['states'][0]
        assert sorted(set(p[2] for p in replayed['model']['vertices'])) == [-height, height]


def test_supported_report_is_availability_never_verification():
    doc = legacy()['documents'][0]
    report = dispatch(
        {'op': 'history-support', 'params': {'history': doc['operationHistory'], 'target': 'legacy-prism'}}
    )
    assert report['status'] == 'retained-version'
    assert report['canReplay'] and report['canBranch'] and report['verified'] is False
    assert report['retainedAlgorithms'] == [{'id': 'legacy-prism', 'op': 'polygon-prism', 'algorithmVersion': '0.1.0'}]
    source = replay_support(doc['operationHistory'], 'square')
    assert source['canReplay'] and not source['canBranch']
    assert source['retainedAlgorithms'] == []


@pytest.mark.parametrize(
    'field,value',
    [('algorithmVersion', 'future-kernel'), ('numericPolicy', {'mode': 'future-exact'}), ('op', 'future-operation')],
)
def test_unknown_semantics_roundtrip_snapshot_only_and_refuse_replay_branch(field, value, tmp_path):
    project = legacy()
    doc = project['documents'][0]
    doc['operationHistory']['nodes'][1][field] = value
    retained = deepcopy(doc['operationHistory'])
    path = tmp_path / 'unknown.polyproj'
    save_project(path, project)
    reopened = load_file(path)['project']['documents'][0]
    assert reopened['operationHistory'] == retained
    report = replay_support(retained, 'legacy-prism')
    assert report['status'] == 'snapshot-only' and not report['canReplay'] and not report['canBranch']
    assert report['verified'] is False and 'snapshot remains readable' in report['message']
    calls = []

    def forbidden(request):
        calls.append(request)
        raise AssertionError('Must fail before dispatch')

    from engine.recipes import branch_recipe, replay_document

    with pytest.raises(GeometryError):
        replay_document(reopened, forbidden)
    with pytest.raises(GeometryError):
        branch_recipe(reopened, {'height': 3}, forbidden)
    assert calls == []
    assert replay_support(retained, 'square')['canReplay']
    assert set(replay_history(retained, forbidden, 'square')) == {'square'}


@pytest.mark.parametrize(
    'operation',
    [
        'facet-adopt',
        'source-zonohedron',
        'spring-relaxation',
        'cell',
        'place-at-faces',
        'convex-core-4d',
        'triangular-geodesic',
        'convex-core',
        'attach-at-faces',
    ],
)
def test_specialized_replay_and_branch_cannot_bypass_unknown_version_preflight(operation):
    from engine.recipes import branch_recipe, replay_document

    state = {'model': regular('cube'), 'view': {}}
    graph = record_source(create_history(), 'root', state)
    graph = record_operation(graph, 'future', 'root', operation, {}, state, algorithm_version='future')
    doc = {'cursor': 0, 'states': [{**state, 'operationNode': 'future'}], 'operationHistory': graph.to_dict()}

    def forbidden(request):
        raise AssertionError('Unsupported versions must fail before dispatch')

    for invoke in [
        lambda: replay_history(graph, forbidden, 'future'),
        lambda: replay_document(doc, forbidden),
        lambda: branch_recipe(doc, {}, forbidden),
    ]:
        with pytest.raises(GeometryError, match='algorithm version.*future'):
            invoke()


@pytest.mark.parametrize('version', [0, 3, '1', True, None])
def test_unknown_project_schema_rejected_without_touching_original_or_destination(version, tmp_path):
    project = legacy()
    project['version'] = version
    original = tmp_path / 'original.polyproj'
    raw = json.dumps(project).encode()
    original.write_bytes(raw)
    with pytest.raises(GeometryError, match='Unsupported project format/version'):
        load_file(original)
    destination = tmp_path / 'keep.polyproj'
    destination.write_bytes(b'previous destination')
    with pytest.raises(GeometryError, match='Unsupported project format/version'):
        save_project(destination, project)
    assert original.read_bytes() == raw and destination.read_bytes() == b'previous destination'


def test_pre_graph_legacy_snapshots_open_without_inventing_a_recipe(tmp_path):
    project = legacy()
    doc = project['documents'][0]
    del doc['operationHistory']
    for state in doc['states']:
        del state['operationNode']
    path = tmp_path / 'snapshots.polyproj'
    save_project(path, project)
    reopened = load_file(path)['project']['documents'][0]
    assert 'operationHistory' not in reopened
    with pytest.raises(GeometryError, match='Legacy snapshots'):
        recipe('replay', reopened)
    with pytest.raises(GeometryError, match='Legacy snapshots'):
        recipe('branch', reopened, parameters={'height': 4})
    edited = recipe('run', reopened, operation='transform', parameters={'scale': 2})
    assert edited['operationHistory']['nodes'][-1]['op'] == 'transform'
    assert all(node['op'] == 'source' for node in edited['operationHistory']['nodes'][:-1])


def test_annotation_ownership_survives_reload_replay_branch_and_rejects_wrong_owner(tmp_path):
    doc = {
        'id': 'content',
        'cursor': 0,
        'states': [{'model': regular('cube'), 'view': {'coordinateUnit': 'cm'}, 'notes': 'Original notes'}],
    }
    doc = recipe(
        'run',
        doc,
        operation='element-content',
        parameters={'action': 'text', 'kind': 'face', 'index': 0, 'markup': '<b>Owned face</b>'},
    )
    doc = recipe('run', doc, operation='transform', parameters={'scale': 2})
    path = tmp_path / 'content.polyproj'
    save_project(path, {'format': 'polytope-laboratory', 'version': 1, 'active': 0, 'documents': [doc]})
    doc = load_file(path)['project']['documents'][0]
    before = deepcopy(doc)
    for result in [recipe('replay', doc), recipe('branch', doc, parameters={'scale': 3})]:
        state = result['states'][result['cursor']]
        content = state['view']['elementAnnotations']
        assert content['source'] == state['model']
        assert content['entries'][0]['text']['markup'] == '<b>Owned face</b>'
        assert state['notes'] == 'Original notes' and state['view']['coordinateUnit'] == 'cm'
        assert state['view']['elementContentTransfer']['mapped'] == [
            {'kind': 'face', 'sourceIndex': 0, 'resultIndex': 0}
        ]
    assert doc == before
    doc['states'][-1]['view']['elementAnnotations']['source']['id'] = 'different-owner'
    with pytest.raises(GeometryError):
        validate_project({'format': 'polytope-laboratory', 'version': 1, 'active': 0, 'documents': [doc]})


@pytest.mark.parametrize(
    'params', [{}, {'history': {}, 'extra': 1}, {'history': []}, {'history': {'version': 2, 'nodes': []}}]
)
def test_support_dispatch_rejects_malformed_or_unknown_graph_schemas(params):
    with pytest.raises(GeometryError):
        dispatch({'op': 'history-support', 'params': params})
