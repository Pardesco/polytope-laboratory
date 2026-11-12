"""Seeded byte/structure mutations; each corpus runs in a killable child process."""

import copy
import json
import math
import multiprocessing as mp
import os
import random
import time
import tracemalloc
import io
import subprocess
import sys

import pytest

from engine.formats import export_off, load_file, parse_off, validate_project
from engine.geometry import GeometryError, validate


def sample(d=3):
    # Hand-authored tetrahedron / 4-simplex, independent of the hull generator.
    vertices = [[0] * d] + [[int(i == j) for i in range(d)] for j in range(d)]
    from itertools import combinations

    return {
        'dimension': d,
        'embeddingDimension': d,
        'vertices': vertices,
        'edges': list(map(list, combinations(range(d + 1), 2))),
        'faces': list(map(list, combinations(range(d + 1), 3))),
        'cells': [
            list(ids)
            for ids in combinations(range(10), 4)
            if len({v for f in ids for v in list(combinations(range(5), 3))[f]}) == 4
        ]
        if d == 4
        else [],
        'interpretation': 'generalized-complex',
        'metadata': {},
        'numeric': {},
    }


def project():
    return {
        'format': 'polytope-laboratory',
        'version': 1,
        'active': 0,
        'documents': [{'cursor': 0, 'states': [{'model': sample(), 'view': {}}]}],
    }


DXF = b'0\nSECTION\n2\nENTITIES\n0\n3DFACE\n10\n0\n20\n0\n11\n1\n21\n0\n12\n0\n22\n1\n0\nENDSEC\n0\nEOF\n'


def mutations(source, rng, count):
    yield source
    yield b'\xef\xbb\xbf' + source.replace(b'\n', b'\r\n')
    for _ in range(count):
        data = bytearray(source)
        action = rng.randrange(5)
        start = rng.randrange(len(data) + 1)
        if action == 0:
            del data[start:]
        elif action == 1 and start < len(data):
            data[start] ^= 1 << rng.randrange(8)
        elif action == 2:
            data[start:start] = rng.choice(
                [
                    b'NaN',
                    b'Infinity',
                    b'-1',
                    b'1e999',
                    b'999999999999',
                    b'\x00',
                    b'\xff',
                    b'\r\n',
                    '\u2603'.encode(),
                    b'"\\ud800"',
                ]
            )
        elif action == 3:
            end = min(len(data), start + rng.randrange(1, 20))
            data[start:end] = data[max(0, start - 10) : start]
        else:
            data.extend(rng.choice([b'[]', b'{}', b'\r\n', b'\xef\xbb\xbf']))
        yield bytes(data)


def structure_mutations(kind, rng, count):
    if kind not in ('json', 'polyproj'):
        return
    for _ in range(count):
        data = project() if kind == 'polyproj' else sample()
        model = data['documents'][0]['states'][0]['model'] if kind == 'polyproj' else data
        action = rng.randrange(6)
        if action == 0:
            model[rng.choice(['vertices', 'edges', 'faces', 'cells', 'numeric', 'metadata', 'provenance'])] = (
                rng.choice([None, True, 42, [], {}, '雪', [None], [[0, 1, 0]]])
            )
        elif action == 1:
            model['vertices'][0][rng.randrange(3)] = rng.choice(
                [-10, -1e308, 1e308, float('nan'), float('inf'), '\ud800', {}, True, 10**500]
            )
        elif action == 2:
            model['faces'][0] = rng.choice([[0, 0, 1], [0, 1, -1], [0, 1, 9999999999], [0, 1, 2] * 500, [[], 1, 2]])
        elif action == 3:
            model['vertices'][1] = model['vertices'][0][:]
        elif action == 4:
            model['faces'] += [model['faces'][0][:]] * 3
        elif kind == 'polyproj':
            state = data['documents'][0]['states'][0]
            state['view'][
                rng.choice(['angles', 'dualMorph', 'multiViews', 'animation', 'elementAnnotations', 'orientationFrame'])
            ] = rng.choice([None, True, '雪', [], {}, [1e308]])
        else:
            model['cells'] = [[0, 0, 0]]
        yield json.dumps(data, ensure_ascii=True).encode()


def assert_valid(result):
    models = (
        [result['model']]
        if 'model' in result
        else [s['model'] for d in result['project']['documents'] for s in d['states']]
    )
    for model in models:
        assert validate(model)['passed']
        assert all(math.isfinite(x) for row in model['vertices'] for x in row)
    json.dumps(result, allow_nan=False)


def _fuzz_worker(root, kind, count, queue):
    try:
        source = {
            'off': export_off(sample()).encode(),
            '4off': export_off(sample(4)).encode(),
            'dxf': DXF,
            'json': json.dumps(sample()).encode(),
            'polyproj': json.dumps(project()).encode(),
        }[kind]
        from pathlib import Path

        path = Path(root) / ('mutated.' + ('off' if kind == '4off' else kind))
        rng = random.Random(4700 + ['off', '4off', 'dxf', 'json', 'polyproj'].index(kind))
        tracemalloc.start()
        started = time.monotonic()
        from itertools import chain

        corpus = chain(mutations(source, rng, count), structure_mutations(kind, rng, count))
        for index, raw in enumerate(corpus):
            path.write_bytes(raw)
            tick = time.monotonic()
            try:
                assert_valid(load_file(path))
            except GeometryError as exc:
                assert str(exc).strip(), (kind, index)
            except Exception as exc:
                raise AssertionError(f'{kind} mutation {index}: {raw!r}') from exc
            assert time.monotonic() - tick < 2, (kind, index, 'per-input time budget')
            assert tracemalloc.get_traced_memory()[1] < 64 * 1024 * 1024, (kind, index, tracemalloc.get_traced_memory())
        queue.put(('ok', time.monotonic() - started))
    except BaseException:
        import traceback

        queue.put(('error', traceback.format_exc()))


@pytest.mark.parametrize('kind', ['off', '4off', 'dxf', 'json', 'polyproj'])
def test_seeded_import_mutations(tmp_path, kind):
    count = 2000 if os.environ.get('POLYTOPE_FUZZ_LONG') == '1' else 80
    ctx = mp.get_context('spawn')
    queue = ctx.Queue()
    child = ctx.Process(target=_fuzz_worker, args=(str(tmp_path), kind, count, queue))
    child.start()
    try:
        child.join(180 if count > 80 else 9)
        assert not child.is_alive(), f'{kind} corpus exceeded its wall-clock budget'
        assert child.exitcode == 0
        status, detail = queue.get(timeout=2)
        assert status == 'ok', detail
    finally:
        if child.is_alive():
            child.terminate()
            child.join(3)
        queue.close()


@pytest.mark.parametrize(
    'payload',
    [
        b'{',
        b'[]',
        b'{"format":"polytope-laboratory","version":999}',
        b'[' * 1500 + b'0' + b']' * 1500,
        b'{"vertices":NaN}',
        b'"\\ud800"',
        b'\xff',
    ],
)
def test_corrupt_json_is_a_diagnostic(tmp_path, payload):
    path = tmp_path / 'broken.polyproj'
    path.write_bytes(payload)
    with pytest.raises(GeometryError, match='.+'):
        load_file(path)


@pytest.mark.parametrize(
    'field,value', [('model', []), ('model', None), ('view', []), ('netLayout', 3), ('netPages', 3)]
)
def test_malformed_project_records_are_diagnostics(field, value):
    data = project()
    state = data['documents'][0]['states'][0]
    state[field] = value
    if field == 'netPages':
        state['netLayout'] = {'invalid': True}
    with pytest.raises(GeometryError, match='.+'):
        validate_project(data)


def test_legacy_project_missing_view_opens_with_empty_presentation(tmp_path):
    # Original v1 snapshots could omit presentation entirely; opening migrates them (DOC-01).
    data = project()
    del data['documents'][0]['states'][0]['view']
    path = tmp_path / 'legacy.polyproj'
    path.write_text(json.dumps(data), encoding='utf-8')
    opened = load_file(path)['project']
    assert opened['documents'][0]['states'][0]['view'] == {}


def test_project_state_with_non_object_view_refuses(tmp_path):
    data = project()
    data['documents'][0]['states'][0]['view'] = 'broken'
    path = tmp_path / 'partial.polyproj'
    path.write_text(json.dumps(data), encoding='utf-8')
    with pytest.raises(GeometryError, match='display-state record'):
        load_file(path)


@pytest.mark.parametrize('value', [None, [], 42, '\ud800'])
def test_off_bad_text_is_a_diagnostic(value):
    with pytest.raises(GeometryError, match='.+'):
        parse_off(value)


@pytest.mark.parametrize('coordinate', [10**500, 1e308, float('nan'), float('inf')])
def test_unsafe_project_coordinates(coordinate):
    data = project()
    data['documents'][0]['states'][0]['model']['vertices'][0][0] = coordinate
    with pytest.raises(GeometryError, match='.+'):
        validate_project(data)


@pytest.mark.parametrize('field', ['rationalCoordinates', 'rationalFacetEquations'])
@pytest.mark.parametrize('literal', ['1e9999999999999999999', '1e٩٩٩٩٩٩٩٩٩٩٩٩٩٩٩٩٩٩٩'])
def test_rational_exponent_bomb_refuses_before_fraction_allocation(field, literal):
    data = project()
    data['documents'][0]['states'][0]['model'][field] = [[literal, '0', '1']]
    with pytest.raises(GeometryError, match='exponent magnitude'):
        validate_project(data)


@pytest.mark.parametrize('key', ['\ud800', 'normal'])
def test_history_invalid_unicode_is_a_geometry_error(key):
    from engine.history import _json_bytes

    with pytest.raises(GeometryError, match='UTF-8'):
        _json_bytes({key: '\ud800'})


@pytest.mark.parametrize('kind', ['off', '4off', 'json', 'polyproj'])
def test_explicit_hostile_geometry_structures(tmp_path, kind):
    original = sample(4 if kind == '4off' else 3)
    changes = [
        ('vertices', [[float('nan'), 0, 0]]),
        ('vertices', [[float('inf'), 0, 0]]),
        ('vertices', [[-1e308, 0, 0]]),
        ('faces', [[0, 0, 1]]),
        ('faces', [[-1, 0, 1]]),
        ('faces', [[0, 1, 999999999]]),
        ('faces', [[0, 1, 2] * 1000]),
        ('cells', [[0, 0, 0]]),
    ]
    path = tmp_path / ('hostile.' + ('off' if kind == '4off' else kind))
    for key, value in changes:
        model = copy.deepcopy(original)
        model[key] = value
        if kind in ('off', '4off'):
            raw = export_off(model).encode()
        elif kind == 'polyproj':
            data = project()
            data['documents'][0]['states'][0]['model'] = model
            raw = json.dumps(data).encode()
        else:
            raw = json.dumps(model).encode()
        path.write_bytes(raw)
        try:
            result = load_file(path)
        except GeometryError as exc:
            assert str(exc)
        else:
            # OFF has no 3D cell records, so that unused corruption is omitted.
            assert_valid(result)


def test_huge_counts_and_boundaries_refuse_before_geometry():
    for text in ['OFF\n999999999999 0 0\n', '4OFF\n5 0 0 999999999\n', 'OFF\n1 1 0\n0 0 0\n999999999999 0\n']:
        with pytest.raises(GeometryError, match='limits|limit'):
            parse_off(text)


def test_resource_limits_are_enforced_with_small_test_budgets(tmp_path, monkeypatch):
    from engine import formats, input_limits, dxf

    path = tmp_path / 'oversized.off'
    path.write_bytes(b'x' * 33)
    monkeypatch.setattr(formats, 'MAX_FILE_BYTES', 32)
    with pytest.raises(GeometryError, match='128 MiB'):
        load_file(path)
    monkeypatch.setattr(input_limits, 'MAX_JSON_ENTRIES', 3)
    with pytest.raises(GeometryError, match='3-entry'):
        input_limits.parse_json('[0,1,2,3]')
    monkeypatch.setattr(dxf, 'MAX_PAIRS', 2)
    with pytest.raises(GeometryError, match='2 pairs'):
        dxf.parse_dxf(DXF.decode())


def test_bounded_request_reader_drains_one_record_and_preserves_the_next():
    from engine.request_stream import bounded_lines, response_line

    assert list(bounded_lines(io.BytesIO(b'x' * 100 + b'\n{}\nlast'), limit=8)) == [None, b'{}\n', b'last']
    assert list(bounded_lines(io.BytesIO(b'x' * 100), limit=8)) == [None]
    assert list(bounded_lines(io.BytesIO(b''), limit=8)) == []
    for value in [float('inf'), '\ud800']:
        response = json.loads(response_line({'id': 'safe', 'ok': True, 'result': value}))
        assert response['id'] == 'safe' and response['ok'] is False


def test_native_protocol_survives_corrupt_records_then_completes_a_valid_request():
    records = [
        b'\xff\n',
        b'{\n',
        b'[]\n',
        b'[' * 1000 + b'0' + b']' * 1000 + b'\n',
        b'{"id":"\\ud800","op":"\\ud800"}\n',
        b'{"id":"valid","op":"expression","params":{"expression":"2+3"}}\n',
    ]
    child = subprocess.run(
        [sys.executable, '-m', 'engine.server'],
        input=b''.join(records),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=8,
    )
    assert child.returncode == 0, child.stderr
    replies = [json.loads(line) for line in child.stdout.splitlines()]
    assert len(replies) == len(records)
    assert all(reply['ok'] is False and reply['error'] for reply in replies[:-1])
    assert replies[-1]['ok'] is True and replies[-1]['id'] == 'valid'


def test_bom_repair_preserves_original_spelling():
    from engine.formats import repair_off_edge_count

    source = '\ufeff' + export_off(sample()).replace('4 4 6', '4 4 7')
    repaired = repair_off_edge_count(source)
    assert repaired['text'] == source.replace('4 4 7', '4 4 6')


def test_history_snapshot_rejects_malformed_model_shapes():
    from engine.history import _snapshot

    data = {'model': sample(), 'view': {}}
    data['model']['numeric'] = []
    with pytest.raises(GeometryError, match='numeric must be an object'):
        _snapshot(data)


def test_adversarial_4d_hull_is_bounded_before_full_incidence_reconstruction(monkeypatch):
    import numpy as np
    from engine import formats

    t = np.linspace(-1, 1, 100)
    points = np.column_stack([t**i for i in range(1, 5)]).tolist()
    text = '4OFF\n100 0 0 0\n' + '\n'.join(' '.join(map(str, row)) for row in points)

    def unexpected(*args):
        raise AssertionError('Unbounded hull reconstruction must not run')

    monkeypatch.setattr(formats, 'hull', unexpected)
    model = parse_off(text)
    assert model['interpretation'] == 'generalized-complex'
    assert 'limit' in model['metadata']['convexRecognition']
    assert validate(model)['passed']


@pytest.mark.parametrize('separator', ['\n', '\r\n', '\x85', '\u2028'])
def test_line_expansion_refuses_before_splitlines(monkeypatch, separator):
    from engine import formats

    monkeypatch.setattr(formats, 'MAX_OFF_LINES', 5)
    with pytest.raises(GeometryError, match='5 text lines'):
        parse_off(separator * 6)


def test_off_token_expansion_refuses_before_numeric_conversion():
    from engine.formats import repair_off_edge_count

    text = 'OFF\n' + '0 ' * 10000
    for parse in (parse_off, repair_off_edge_count):
        with pytest.raises(GeometryError, match='16,384-character'):
            parse(text)
