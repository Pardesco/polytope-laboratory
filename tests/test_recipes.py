import copy
import pytest

from engine.generators import regular
from engine.server import dispatch
from engine.formats import validate_project
from engine.geometry import GeometryError
from engine.history import canonical_model


def document():
    return {'id':'test', 'cursor':0, 'states':[{'model':regular('cube'),
            'view':{}, 'label':'Cube', 'notes':'preserved'}]}


def run(doc, operation='transform', parameters=None):
    return dispatch({'op':'recipe-run', 'params':{'document':doc,
                    'operation':operation, 'parameters':parameters or {'scale':2}}})


def test_atomic_seed_replay_and_no_source_mutation():
    original = document(); before = copy.deepcopy(original)
    result = run(original)
    assert original == before
    assert len(result['operationHistory']['nodes']) == 2
    assert result['states'][1]['notes'] == 'preserved'
    replayed = dispatch({'op':'recipe-replay','params':{'document':result}})
    assert canonical_model(replayed['states'][0]['model']) == canonical_model(result['states'][1]['model'])
    assert sorted(abs(x) for p in replayed['states'][0]['model']['vertices'] for x in p) == [2]*24


def test_branch_preserves_old_graph_and_exact_parameters():
    first = run(document())
    first['cursor'] = 0
    branch = run(first, parameters={'scale':3})
    assert len(branch['states']) == 2
    assert len(branch['operationHistory']['nodes']) == 3
    assert [n['params'] for n in branch['operationHistory']['nodes'][1:]] == [{'scale':2},{'scale':3}]
    old = dispatch({'op':'recipe-replay','params':{'document':branch,
                   'target':branch['operationHistory']['nodes'][1]['id']}})
    assert max(abs(x) for p in old['states'][0]['model']['vertices'] for x in p) == 2


@pytest.mark.parametrize('operation',['load','save','export','library','recipe-run','__import__'])
def test_recipe_cannot_dispatch_filesystem_or_recursive_commands(operation):
    with pytest.raises(GeometryError, match='unavailable'):
        run(document(), operation)


def test_persisted_geometry_association_and_cache_validation():
    result = run(document())
    result['states'][1]['model']['measure'] = {'volume':1000000}
    project = {'format':'polytope-laboratory','version':1,'active':0,'documents':[result]}
    validate_project(project)
    assert result['states'][1]['model']['measure']['content'] == pytest.approx(64)
    result['states'][1]['operationNode'] = result['states'][0]['operationNode']
    with pytest.raises(GeometryError,match='disagrees'):
        validate_project(project)


def test_legacy_replay_is_explicit_and_operation_error_atomic():
    source = document(); before = copy.deepcopy(source)
    with pytest.raises(GeometryError, match='Legacy'):
        dispatch({'op':'recipe-replay','params':{'document':source}})
    with pytest.raises(GeometryError):
        run(source, parameters={'scale':0})
    assert source == before


def test_parameter_branch_replays_original_parent_not_current_result():
    original = run(document())
    before = copy.deepcopy(original)
    branch = dispatch({'op':'recipe-branch','params':{'document':original,'parameters':{'scale':4}}})
    assert max(abs(x) for p in branch['states'][-1]['model']['vertices'] for x in p) == 4
    assert original == before
    assert branch['id'] != original['id']
    assert len(branch['operationHistory']['nodes']) == 3


def test_branch_cannot_replay_unknown_record_or_forged_state():
    original = run(document())
    original['operationHistory']['nodes'][-1]['op'] = 'save'
    with pytest.raises(GeometryError,match='replayable'):
        dispatch({'op':'recipe-branch','params':{'document':original,'parameters':{'path':'out'}}})
    with pytest.raises(GeometryError,match='unsupported replay'):
        dispatch({'op':'recipe-replay','params':{'document':original}})


@pytest.mark.parametrize('operation',['remove-coincident-pairs','compound-drop','compound-component'])
def test_literal_compound_editing_records_and_replays_preserved_source(operation):
    from engine.compounds import add_models
    source=add_models(regular('cube'),regular('cube'))
    doc={'cursor':0,'states':[{'model':source,'view':{}}]}
    parameters={'tolerance':0} if operation=='remove-coincident-pairs' else {'component_id':source['components'][1]['id']}
    result=run(doc,operation,parameters)
    replay=dispatch({'op':'recipe-replay','params':{'document':result}})
    assert canonical_model(replay['states'][0]['model'])==canonical_model(result['states'][1]['model'])
    assert len(source['faces'])==12
    assert len(result['states'][1]['model']['faces'])==(0 if operation=='remove-coincident-pairs' else 6)


def test_adjacent_square_blending_replays_literal_concavity_without_hull():
    source={'name':'Two squares','dimension':2,'embeddingDimension':2,
      'interpretation':'generalized-complex','numeric':{},'metadata':{},
      'vertices':[[0,0],[1,0],[1,1],[0,1],[2,0],[2,1]],
      'edges':[[0,1],[1,2],[2,3],[3,0],[1,4],[4,5],[5,2]],
      'faces':[[0,1,2,3],[1,4,5,2]],'cells':[]}
    doc={'cursor':0,'states':[{'model':source,'view':{}}]}
    result=run(doc,'blend-faces',{'face_ids':[0,1]})
    replay=dispatch({'op':'recipe-replay','params':{'document':result}})
    assert replay['states'][0]['model']['faces']==[[0,1,4,5,2,3]]
    assert replay['states'][0]['model']['vertices']==source['vertices']
