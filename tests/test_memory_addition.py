from copy import deepcopy

import numpy as np
import pytest

from engine.formats import save_project, load_file
from engine.generators import regular
from engine.geometry import GeometryError
from engine.history import canonical_model
from engine.operations import transform
from engine.server import dispatch


def state(kind='cube', unit='model'):
    return {'model': regular(kind), 'view': {'coordinateUnit': unit}, 'notes': 'Current notes'}


def document(source=None):
    return {'id': 'memory-result', 'cursor': 0, 'states': [source or state()]}


def add(doc, other=None, scale=0.5, source_unit='model', target_unit='model'):
    return recipe(
        doc,
        'compound-add',
        {
            'other': other or regular('octahedron'),
            'relative_scale': scale,
            'source_unit': source_unit,
            'target_unit': target_unit,
        },
    )


def recipe(doc, operation, parameters):
    return dispatch({'op': 'recipe-run', 'params': {'document': doc, 'operation': operation, 'parameters': parameters}})


def model(doc):
    return doc['states'][doc['cursor']]['model']


def test_relative_scale_retains_literal_coordinates_colors_ids_and_sources():
    base, other = regular('cube'), regular('octahedron')
    colors = [{'encoding': 'unit', 'values': [0.2, 0.4, 0.6, 1]}] * len(other['faces'])
    other['metadata']['offColors'] = {'faces': colors, 'cells': []}
    before = deepcopy([base, other])
    result = add(document({'model': base, 'view': {}, 'notes': 'Keep'}), other)
    output = model(result)
    assert output['vertices'][:8] == base['vertices']
    assert np.asarray(output['vertices'][8:]) == pytest.approx(np.asarray(other['vertices']) * 0.5)
    assert output['metadata']['offColors']['faces'][6:] == colors
    assert len({c['id'] for c in output['components']}) == 2
    assert output['components'][1]['sourcePath'] == [1]
    assert output['components'][1]['maps']['vertices'] == list(range(8, 14))
    assert output['numeric']['certified'] is False
    assert result['states'][1]['notes'] == 'Keep'
    assert [base, other] == before


def test_physical_units_convert_before_relative_scale_about_origin():
    other = transform(regular('cube'), translation=[3, 0, 0])
    result = add(document(state(unit='mm')), other, scale=2, source_unit='cm', target_unit='mm')
    output = model(result)
    assert np.asarray(output['vertices'][8:]) == pytest.approx(np.asarray(other['vertices']) * 20)
    receipt = output['metadata']['memoryAddition']
    assert receipt['relativeScale'] == 2 and receipt['exactUnitFactor'] == '10'
    assert receipt['appliedScale'] == 20 and receipt['scaleOrigin'] == [0, 0, 0]
    assert output['metadata']['coordinateUnits'] == 'mm'


@pytest.mark.parametrize('scale', [0, -1, True, float('inf'), float('nan'), 1e-10, 1e10, '2'])
def test_invalid_relative_scale_refuses_without_mutation(scale):
    original = document()
    before = deepcopy(original)
    with pytest.raises(GeometryError, match='relative scale'):
        add(original, scale=scale)
    assert original == before


@pytest.mark.parametrize('source_unit,target_unit', [('model', 'mm'), ('cm', 'model'), ('bad', 'mm')])
def test_unitless_physical_mix_and_unknown_units_are_refused(source_unit, target_unit):
    with pytest.raises(GeometryError, match='units'):
        add(document(), source_unit=source_unit, target_unit=target_unit)


def test_scaled_add_reopen_undo_redo_replay_and_component_extraction(tmp_path):
    result = add(document(), scale=0.25)
    stored = state('octahedron')
    stored['notes'] = 'Stored notes stay in slot'
    project = {
        'format': 'polytope-laboratory',
        'version': 1,
        'active': 0,
        'documents': [result],
        'memories': {'version': 1, 'slots': [{'state': stored, 'source': {}}] + [None] * 8},
    }
    path = tmp_path / 'memory.polyproj'
    save_project(path, project)
    reopened = load_file(path)['project']
    doc = reopened['documents'][0]
    assert reopened['memories']['slots'][0]['state']['notes'] == stored['notes']
    assert reopened['memories']['slots'][0]['state']['model']['vertices'] == stored['model']['vertices']
    doc['cursor'] = 0
    assert model(doc)['vertices'] == regular('cube')['vertices']
    doc['cursor'] = 1
    assert max(abs(x) for p in model(doc)['vertices'][8:] for x in p) == 0.25
    replayed = dispatch({'op': 'recipe-replay', 'params': {'document': doc}})
    assert canonical_model(model(replayed)) == canonical_model(model(doc))
    assert [c['id'] for c in model(replayed)['components']] == [c['id'] for c in model(doc)['components']]
    leaf = model(doc)['components'][1]['id']
    extracted = recipe(doc, 'compound-component', {'component_id': leaf})
    again = dispatch({'op': 'recipe-replay', 'params': {'document': extracted}})
    assert canonical_model(model(again)) == canonical_model(model(extracted))


def test_blend_uses_existing_merge_recipe_with_residual_and_replays(tmp_path):
    added = add(document(), regular('cube'), scale=0.5)
    blended = recipe(added, 'merge-compound', {'fill_rule': 'nonzero', 'color_policy': 'require-equal'})
    output = model(blended)
    assert (len(output['vertices']), len(output['edges']), len(output['faces'])) == (8, 12, 6)
    assert 'components' not in output
    evidence = output['metadata']['compoundMerge']
    assert evidence['certified'] is False and evidence['shells'] == 1
    assert evidence['visibleSurface']['maxWindingResidual'] < 1e-7
    assert [n['op'] for n in blended['operationHistory']['nodes']] == ['source', 'compound-add', 'merge-compound']
    path = tmp_path / 'blend.polyproj'
    save_project(path, {'format': 'polytope-laboratory', 'version': 1, 'active': 0, 'documents': [blended]})
    reopened = load_file(path)['project']['documents'][0]
    replayed = dispatch({'op': 'recipe-replay', 'params': {'document': reopened}})
    assert canonical_model(model(replayed)) == canonical_model(output)


def test_disconnected_blend_refuses_and_source_document_stays_unchanged():
    other = transform(regular('cube'), translation=[10, 0, 0])
    added = add(document(), other, scale=1)
    before = deepcopy(added)
    with pytest.raises(GeometryError, match='single connected'):
        recipe(added, 'merge-compound', {'fill_rule': 'nonzero'})
    assert added == before


def test_four_dimensional_add_preserves_cells_and_blend_refuses():
    source = state('tesseract')
    added = add(document(source), source['model'], scale=2)
    assert len(model(added)['cells']) == 16
    with pytest.raises(GeometryError, match='3D'):
        recipe(added, 'merge-compound', {})


def test_legacy_compound_add_keeps_its_literal_no_rescale_contract():
    base, other = regular('cube'), regular('octahedron')
    output = dispatch({'op': 'compound-add', 'model': base, 'params': {'other': other}})
    assert output['vertices'] == base['vertices'] + other['vertices']
    assert 'memoryAddition' not in output['metadata']


def test_source_content_is_explicitly_detached_and_retained_for_undo_and_replay():
    annotated = recipe(
        document(), 'element-content', {'action': 'text', 'kind': 'face', 'index': 0, 'markup': 'Source face'}
    )
    added = add(annotated)
    result = added['states'][-1]
    assert result['view']['elementAnnotations']['entries'] == []
    archive = result['view']['elementContentDetached'][0]
    assert archive['document']['entries'][0]['text']['markup'] == 'Source face'
    assert archive['sourceNotes'] == 'Current notes'
    assert result['view']['elementContentTransfer']['mapped'] == []
    assert added['states'][-2]['view']['elementAnnotations']['entries'][0]['text']['markup'] == 'Source face'
    replayed = dispatch({'op': 'recipe-replay', 'params': {'document': added}})
    assert replayed['states'][0]['view']['elementContentDetached'] == result['view']['elementContentDetached']


def test_scale_branch_recomputes_other_source_and_nested_component_ids_replay():
    added = add(document(), scale=0.5)
    params = deepcopy(added['operationHistory']['nodes'][-1]['params'])
    params['relative_scale'] = 0.75
    branch = dispatch({'op': 'recipe-branch', 'params': {'document': added, 'parameters': params}})
    assert np.asarray(model(branch)['vertices'][8:]) == pytest.approx(
        np.asarray(regular('octahedron')['vertices']) * 0.75
    )
    nested = add(added, regular('cube'), scale=0.25)
    leaf = model(nested)['components'][1]['id']
    dropped = recipe(nested, 'compound-drop', {'component_id': leaf})
    replayed = dispatch({'op': 'recipe-replay', 'params': {'document': dropped}})
    assert canonical_model(model(replayed)) == canonical_model(model(dropped))
    assert [c['id'] for c in model(replayed)['components']] == [c['id'] for c in model(dropped)['components']]
