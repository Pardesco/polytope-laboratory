"""Project-local reuse keeps full source authority and all per-state checks."""

from copy import deepcopy
import json

import pytest

from engine import formats, geometry, analysis_cache, display_state, history, rational
from engine.generators import regular


def model():
    return json.loads(json.dumps(regular('cube')))


def project(models):
    return {
        'format': 'polytope-laboratory',
        'version': 1,
        'active': 0,
        'documents': [
            {
                'id': 'source',
                'cursor': len(models) - 1,
                'states': [
                    {'model': deepcopy(source), 'view': {'angles': [0, 0, index * 3, 0, 0, 0]}, 'notes': str(index)}
                    for index, source in enumerate(models)
                ],
            }
        ],
    }


def counted(monkeypatch):
    calls = {'validate': 0, 'measures': 0}
    validate, measures = formats.validate, formats.intrinsic_measures

    def check(source):
        calls['validate'] += 1
        return validate(source)

    def measure(source):
        calls['measures'] += 1
        return measures(source)

    monkeypatch.setattr(formats, 'validate', check)
    monkeypatch.setattr(formats, 'intrinsic_measures', measure)
    return calls


def scaled(source):
    source['vertices'] = [[2 * x for x in point] for point in source['vertices']]
    source['facetEquations'] = [plane[:-1] + [2 * plane[-1]] for plane in source['facetEquations']]


def test_repeated_literal_models_reuse_native_work_but_keep_views_notes_and_detached_measures(monkeypatch):
    source = model()
    expected = geometry.intrinsic_measures(source)
    value = project([source] * 6)
    views = [deepcopy(state['view']) for state in value['documents'][0]['states']]
    calls = counted(monkeypatch)
    result = formats.validate_project(value)
    assert calls == {'validate': 1, 'measures': 1}
    states = result['documents'][0]['states']
    assert [state['view'] for state in states] == views
    assert [state['notes'] for state in states] == list(map(str, range(6)))
    assert all(state['model']['measure'] == expected for state in states)
    states[0]['model']['measure']['content'] = -999
    assert all(state['model']['measure'] == expected for state in states[1:])


@pytest.mark.parametrize(
    'edit',
    [
        lambda m: m.update(name='Different literal name'),
        lambda m: m['metadata'].update(coordinateUnits='cm'),
        lambda m: m['metadata'].update(offColors={'faces': [{'encoding': 'byte', 'values': [1, 2, 3, 4]}]}),
        lambda m: m['metadata'].update(custom=True),
        lambda m: m['numeric'].update(certified=True),
        lambda m: m.update(validation={'passed': True}),
        scaled,
    ],
)
def test_complete_source_changes_with_the_same_claimed_identity_do_not_share_results(monkeypatch, edit):
    first = model()
    second = deepcopy(first)
    edit(second)
    assert second['id'] == first['id'] and second['fingerprint'] == first['fingerprint']
    expected = geometry.intrinsic_measures(second)
    calls = counted(monkeypatch)
    result = formats.validate_project(project([first, second]))
    assert calls == {'validate': 2, 'measures': 2}
    assert result['documents'][0]['states'][1]['model']['measure'] == expected


def test_numeric_metadata_types_cannot_alias_native_cache_entries(monkeypatch):
    originals = []
    for value in (True, 1, 1.0, '1'):
        source = model()
        # Use one literal identity; metadata values are the only distinction.
        if originals:
            source = deepcopy(originals[0])
        source['metadata']['typedValue'] = value
        originals.append(source)
    calls = counted(monkeypatch)
    formats.validate_project(project(originals))
    assert calls == {'validate': 4, 'measures': 4}


def test_forged_reports_fingerprints_and_measure_scalars_never_replace_independent_computation(monkeypatch):
    source = model()
    expected = geometry.intrinsic_measures(source)
    source.update(fingerprint='f' * 64, validation={'passed': True}, measure={'content': 1e30, 'boundaryMeasure': -1})
    calls = counted(monkeypatch)
    result = formats.validate_project(project([source] * 3))
    assert calls == {'validate': 1, 'measures': 1}
    for state in result['documents'][0]['states']:
        assert state['model']['fingerprint'] == geometry.identity(source)
        assert state['model']['measure'] == expected


def test_invalid_later_incidence_cannot_borrow_a_prior_valid_report(monkeypatch):
    source = model()
    broken = deepcopy(source)
    broken['faces'][0][0] = True
    broken['validation'] = {'passed': True}
    broken['measure'] = {'content': 123}
    calls = counted(monkeypatch)
    with pytest.raises(geometry.GeometryError, match='invalid geometry'):
        formats.validate_project(project([source, broken]))
    assert calls == {'validate': 2, 'measures': 1}


def test_view_validation_still_runs_for_each_state_with_reused_geometry(monkeypatch):
    source = model()
    value = project([source] * 3)
    value['documents'][0]['states'][1]['view']['angles'] = [0]
    calls = counted(monkeypatch)
    with pytest.raises(geometry.GeometryError, match='six finite'):
        formats.validate_project(value)
    assert calls == {'validate': 1, 'measures': 1}


def test_each_request_recomputes_independently_and_never_reuses_a_previous_project(monkeypatch):
    source = model()
    calls = counted(monkeypatch)
    for _ in range(2):
        formats.validate_project(project([source] * 3))
    assert calls == {'validate': 2, 'measures': 2}


def test_single_state_project_does_not_construct_or_key_a_reuse_cache(monkeypatch):
    source = model()

    def unnecessary_cache(**options):
        raise AssertionError('Single-state projects must use the direct path')

    monkeypatch.setattr(analysis_cache, 'AnalysisCache', unnecessary_cache)
    calls = counted(monkeypatch)
    formats.validate_project(project([source]))
    assert calls == {'validate': 1, 'measures': 1}


def test_oversized_keys_and_disabled_reuse_keep_original_computation(monkeypatch):
    source = model()
    value = project([source] * 3)
    original = analysis_cache.AnalysisCache
    expected = formats.validate_project(deepcopy(value))
    calls = counted(monkeypatch)
    monkeypatch.setattr(analysis_cache, 'AnalysisCache', lambda **options: original(max_key_bytes=1))
    assert formats.validate_project(deepcopy(value)) == expected
    assert calls == {'validate': 3, 'measures': 3}


def test_project_cache_storage_is_bounded_and_evicted_models_are_recomputed(monkeypatch):
    original = analysis_cache.AnalysisCache
    caches = []

    class Tracked(original):
        def __init__(self, **options):
            super().__init__(**options)
            caches.append(self)

        def resolve(self, *args):
            result = super().resolve(*args)
            assert len(self.entries) <= 8 and self.bytes <= 8 * 1024**2
            return result

    monkeypatch.setattr(analysis_cache, 'AnalysisCache', Tracked)
    sources = []
    first = model()
    for i in range(10):
        source = deepcopy(first)
        source['name'] = 'Literal model ' + str(i)
        sources.append(source)
    calls = counted(monkeypatch)
    formats.validate_project(project(sources + [sources[0]]))
    assert calls == {'validate': 11, 'measures': 11}
    assert len(caches) == 1 and caches[0].max_entries == 8


def test_document_history_and_view_checks_are_not_skipped_across_documents(monkeypatch):
    value = project([model()])
    value['documents'] = [deepcopy(value['documents'][0]) for _ in range(3)]
    calls = {'view': 0, 'history': 0}
    view, document = display_state.validate_view, history.validate_document_history

    def checked_view(*args):
        calls['view'] += 1
        return view(*args)

    def checked_document(*args):
        calls['history'] += 1
        return document(*args)

    monkeypatch.setattr(display_state, 'validate_view', checked_view)
    monkeypatch.setattr(history, 'validate_document_history', checked_document)
    formats.validate_project(value)
    assert calls == {'view': 3, 'history': 3}


def test_exact_certificates_are_independently_reconstructed_for_every_state(monkeypatch):
    source = rational.rational_hull([[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]])
    original = rational.rational_hull
    calls = []

    def checked(points):
        calls.append(deepcopy(points))
        return original(points)

    monkeypatch.setattr(rational, 'rational_hull', checked)
    formats.validate_project(project([source] * 3))
    assert len(calls) == 3


def test_cached_geometry_never_skips_face_net_or_paper_reconstruction(monkeypatch):
    from engine import nets, net_printing

    source = model()
    net = nets.unfold(source)
    pages = net_printing.pack_net(net)
    value = project([source] * 3)
    for state in value['documents'][0]['states']:
        state['netLayout'] = deepcopy(net)
        state['netLayout']['faces'][0]['points'][0] = [1000, 2000]
        state['netPages'] = deepcopy(pages)
        state['netPages']['pages'][0]['svg'] = 'forged cached paper'
    value = json.loads(json.dumps(value))
    rebuild, pack = nets.reconstruct_net, net_printing.pack_net
    calls = {'net': 0, 'paper': 0}

    def rebuilt(*args, **options):
        calls['net'] += 1
        return rebuild(*args, **options)

    def packed(*args, **options):
        calls['paper'] += 1
        return pack(*args, **options)

    monkeypatch.setattr(nets, 'reconstruct_net', rebuilt)
    monkeypatch.setattr(net_printing, 'pack_net', packed)
    result = formats.validate_project(value)
    assert calls == {'net': 3, 'paper': 3}
    for state in result['documents'][0]['states']:
        assert state['netLayout']['faces'] == net['faces']
        assert state['netPages']['pages'] == pages['pages']


def test_cached_geometry_never_skips_complete_cell_net_reconstruction(monkeypatch):
    from engine import cell_nets

    source = json.loads(json.dumps(regular('tesseract')))
    net = cell_nets.cell_net(source, connections=[])
    value = project([source] * 3)
    for state in value['documents'][0]['states']:
        state['cellNetLayout'] = deepcopy(net)
        state['cellNetLayout']['cells'][0]['points'][0] = [1000, 2000, 3000]
    value = json.loads(json.dumps(value))
    rebuild = cell_nets.reconstruct_cell_net
    calls = []

    def rebuilt(*args):
        calls.append(1)
        return rebuild(*args)

    monkeypatch.setattr(cell_nets, 'reconstruct_cell_net', rebuilt)
    result = formats.validate_project(value)
    assert len(calls) == 3
    assert all(state['cellNetLayout']['cells'] == net['cells'] for state in result['documents'][0]['states'])


def test_project_roundtrip_preserves_each_state_and_a_bad_later_state_cannot_replace_the_file(tmp_path):
    source = model()
    value = project([source] * 3)
    target = tmp_path / 'history.polyproj'
    formats.save_project(target, value)
    assert formats.load_file(target)['project'] == value
    before = target.read_bytes()
    invalid = project([source] * 3)
    invalid['documents'][0]['states'][2]['model']['faces'][0][0] = 9999
    with pytest.raises(geometry.GeometryError):
        formats.save_project(target, invalid)
    assert target.read_bytes() == before
