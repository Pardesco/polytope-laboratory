from copy import deepcopy
import pytest
from engine.server import dispatch
from engine.generators import regular
from engine.geometry import GeometryError, identity

CASES = [
    ('truncate', {'amount': 0.5}),
    ('incidence-truncate', {'amount': 0.7, 'preset': 'manual'}),
    ('expand-runcinate', {'ratio': 0.4, 'radius': 1}),
    ('add-dual', {'sizing': 'reciprocal', 'radius': 1.2}),
    ('conway', {'notation': 'k', 'height': 0.4}),
    ('transform', {'scale': 1.7}),
]


@pytest.mark.parametrize('operation,parameters', CASES)
def test_preview_matches_recipe_computation_without_source_mutation(operation, parameters):
    source = regular('cube')
    before = deepcopy(source)
    packet = dispatch(
        {
            'op': 'live-construction-preview',
            'model': source,
            'params': {'operation': operation, 'parameters': parameters},
        }
    )
    direct = dispatch({'op': operation, 'model': source, 'params': parameters})
    assert identity(packet['model']) == identity(direct)
    assert packet['approximate'] is True
    assert source == before


def test_named_rectification_and_original_stop():
    source = regular('cube')

    def preview(amount):
        return dispatch(
            {
                'op': 'live-construction-preview',
                'model': source,
                'params': {'operation': 'truncate', 'parameters': {'amount': amount}},
            }
        )

    assert preview(0.5)['name'] == 'Cuboctahedron'
    assert len(preview(0)['model']['vertices']) == 8


@pytest.mark.parametrize(
    'operation,parameters',
    [
        ('save', {}),
        ('live-construction-preview', {}),
        ('transform', {'matrix': []}),
        ('conway', {'notation': 'tI'}),
        ('truncate', {'amount': 0.6}),
        ('incidence-truncate', {'preset': 'manual', 'amount': 1}),
        ('transform', {'scale': 0}),
    ],
)
def test_preview_retains_domain_and_operation_refusals(operation, parameters):
    with pytest.raises(GeometryError):
        dispatch(
            {
                'op': 'live-construction-preview',
                'model': regular('cube'),
                'params': {'operation': operation, 'parameters': parameters},
            }
        )


@pytest.mark.parametrize('operation,parameters', CASES)
def test_preview_operation_commits_once_and_replays(operation, parameters):
    source = regular('cube')
    doc = {'id': 'live-doc', 'cursor': 0, 'states': [{'model': source, 'view': {}, 'notes': 'Keep'}]}
    preview = dispatch(
        {
            'op': 'live-construction-preview',
            'model': source,
            'params': {'operation': operation, 'parameters': parameters},
        }
    )
    result = dispatch(
        {'op': 'recipe-run', 'params': {'document': doc, 'operation': operation, 'parameters': parameters}}
    )
    assert len(doc['states']) == 1
    assert len(result['states']) == 2
    assert identity(result['states'][1]['model']) == identity(preview['model'])
    replay = dispatch({'op': 'recipe-replay', 'params': {'document': result}})
    assert identity(replay['states'][replay['cursor']]['model']) == identity(preview['model'])
