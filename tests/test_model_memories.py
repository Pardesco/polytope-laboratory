import copy
import pytest
from engine.formats import save_project, load_file, validate_project
from engine.generators import regular
from engine.geometry import GeometryError, identity


def project():
    state = {'model': regular('cube'), 'view': {}, 'notes': 'original'}
    bank = {'version': 1, 'slots': [None] * 9}
    bank['slots'][8] = {'state': copy.deepcopy(state), 'source': {'documentId': 'source'}}
    return {'format': 'polytope-laboratory', 'version': 1, 'active': 0,
            'documents': [{'cursor': 0, 'states': [state]}], 'memories': bank}


def test_memories_roundtrip_and_authoritative_measures(tmp_path):
    saved = project()
    remembered = saved['memories']['slots'][8]['state']['model']
    remembered['measure'] = {'content': 999}
    filename = tmp_path / 'memories.polyproj'
    save_project(filename, saved)
    restored = load_file(filename)['project']
    model = restored['memories']['slots'][8]['state']['model']
    assert model['measure']['content'] == pytest.approx(8)
    assert identity(model) == identity(regular('cube'))
    assert restored['memories']['slots'][:8] == [None] * 8
    assert restored['memories']['slots'][8]['source'] == {'documentId': 'source'}
    model['vertices'][0][0] = 77
    assert restored['documents'][0]['states'][0]['model']['vertices'][0][0] != 77


@pytest.mark.parametrize('bank', [False, {}, {'version': True, 'slots': [None]*9},
    {'version': 1, 'slots': [None]*8}, {'version': 2, 'slots': [None]*9}])
def test_malformed_memory_envelopes_rejected(bank):
    saved = project(); saved['memories'] = bank
    with pytest.raises(GeometryError):
        validate_project(saved)


def test_invalid_geometry_in_unused_slot_cannot_be_saved(tmp_path):
    saved = project()
    saved['memories']['slots'][8]['state']['model']['faces'][0][0] = 100000
    filename = tmp_path / 'invalid.polyproj'
    with pytest.raises(GeometryError):
        save_project(filename, saved)
    assert not filename.exists()


def test_nonfinite_memory_metadata_and_deep_data_rejected():
    saved = project()
    saved['memories']['slots'][8]['source']['bad'] = float('nan')
    with pytest.raises(GeometryError, match='finite JSON'):
        validate_project(saved)
    saved = project(); nested = saved['memories']['slots'][8]['source']
    for _ in range(65):
        nested['child'] = {}; nested = nested['child']
    with pytest.raises(GeometryError, match='structural resource'):
        validate_project(saved)


def test_legacy_project_does_not_require_memories():
    saved = project(); del saved['memories']
    assert validate_project(saved)['documents'][0]['states'][0]['model']['measure']['content'] == pytest.approx(8)


def test_captured_recipe_state_preserves_inert_lineage_in_memory():
    saved=project()
    saved['memories']['slots'][8]['state']['operationNode']='original-document-node'
    checked=validate_project(saved)
    assert checked['memories']['slots'][8]['state']['operationNode']=='original-document-node'
    saved['documents'][0]['states'][0]['operationNode']='forged-current-node'
    with pytest.raises(GeometryError,match='association requires'):
        validate_project(saved)
