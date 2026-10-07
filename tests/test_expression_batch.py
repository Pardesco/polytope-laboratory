"""Real parser, exact thresholds, full hull budget and atomic IPC refusals."""
import json
import subprocess
import sys
from fractions import Fraction
from pathlib import Path

import pytest

from engine import expression_batch as batch
from engine.geometry import GeometryError
from engine.server import dispatch


def test_real_batch_keeps_order_and_native_equation_semantics():
    result = dispatch({'op': 'expression-batch', 'params': {'expressions': ['min(8, 2+3)', 'sind(30)', '2phi', 'faceAngle(5/2)']}})
    assert result['mode'] == 'real'
    assert result['values'] == pytest.approx([5, .5, 1 + 5 ** .5, 36])


def test_exact_threshold_survives_float_collision_and_native_canonicalization():
    result = batch.expression_batch({'expressions': ['4 - 1/10^40', '4', '2/6', '-0', 'faceAngle(5/2)'], 'mode': 'rational'})
    assert result['values'][0] == str(Fraction(4) - Fraction(1, 10 ** 40))
    assert result['values'][0] != result['values'][1]
    assert float(Fraction(result['values'][0])) == float(Fraction(result['values'][1]))
    assert result['values'][1:] == ['4', '1/3', '0', '36']


@pytest.mark.parametrize('expression', ['phi', 'sqrt(2)', 'sin(0)', 'pi'])
def test_exact_input_never_downgrades_approximate_result(expression):
    with pytest.raises(GeometryError, match='Expression 2:.*exact rational'):
        batch.expression_batch({'expressions': ['1/3', expression], 'mode': 'rational'})


@pytest.mark.parametrize('params', [None, [], [['expressions', ['1']]], {'expressions': ['1'], 'other': 0},
    {'expressions': []}, {'expressions': ('1',)}, {'expressions': '1'}, {'expressions': [True]},
    {'expressions': [1]}, {'expressions': ['']}, {'expressions': [' '*512]}, {'expressions': ['1'*513]},
    {'expressions': ['1'], 'mode': True}, {'expressions': ['1'], 'mode': 'exact'}])
def test_complete_shape_is_checked_before_evaluation(params, monkeypatch):
    def forbidden(*args):
        raise AssertionError('invalid batch reached evaluation')
    monkeypatch.setattr(batch, 'evaluate', forbidden)
    with pytest.raises(GeometryError):
        batch.expression_batch(params)


def test_late_shape_error_and_value_count_refuse_before_any_evaluation(monkeypatch):
    monkeypatch.setattr(batch, 'evaluate', lambda *args: pytest.fail('preflight must finish before evaluation'))
    for expressions in (['1']*79999+[None], ['1']*80001, ['1', '\ud800']):
        with pytest.raises(GeometryError):
            batch.expression_batch({'expressions': expressions})


def test_actual_utf8_json_input_and_output_resources(monkeypatch):
    # Exercise byte limits rather than allocating hundreds of MiB in a fixture.
    monkeypatch.setattr(batch, 'MAX_BATCH_BYTES', 80)
    monkeypatch.setattr(batch, 'evaluate', lambda *args: pytest.fail('oversized input must precede evaluation'))
    with pytest.raises(GeometryError, match='input exceeds'):
        batch.expression_batch({'expressions': ['1'+'\t'*12]})
    monkeypatch.setattr(batch, 'evaluate', lambda *args: {'value': 1., 'exactRational': '1'*100})
    with pytest.raises(GeometryError, match='output exceeds'):
        batch.expression_batch({'expressions': ['1'], 'mode': 'rational'})


@pytest.mark.parametrize('bad', ['1/0', '__import__(1)', 'sqrt(-1)', '1e101', '1 +'])
def test_late_parse_failure_returns_no_prefix(bad):
    with pytest.raises(GeometryError, match='Expression 3:'):
        batch.expression_batch({'expressions': ['2+3', '7/9', bad]})


def test_full_twenty_thousand_four_coordinate_budget_uses_real_parser():
    expressions = ['2+3', '7/9', '-2', 'sind(30)']*20000
    result = batch.expression_batch({'expressions': expressions})
    assert len(result['values']) == 80000
    for start in (0, 4, 39996, 79996):
        assert result['values'][start:start+4] == pytest.approx([5, 7/9, -2, .5])


@pytest.mark.parametrize('native_request', [
    {'op': 'expression-batch', 'params': [['expressions', ['1']]]},
    {'op': 'expression-batch', 'params': {'expressions': ['1']}, 'other': 0},
    {'op': 'expression-batch', 'params': {'expressions': ['1']}, 'model': {}},
])
def test_route_rejects_coercible_or_extraneous_requests(native_request):
    with pytest.raises(GeometryError):
        dispatch(native_request)


def test_cold_json_lines_has_one_atomic_result_and_recovers_after_refusal():
    root = Path(__file__).resolve().parents[1]
    requests = [
        {'op': 'expression-batch', 'id': 'good', 'params': {'expressions': ['4 - 1/10^40', '4'], 'mode': 'rational'}},
        {'op': 'expression-batch', 'id': 'bad', 'params': {'expressions': ['1', '1/0']}},
        {'op': 'expression-batch', 'id': 'next', 'params': {'expressions': ['2+3']}},
    ]
    proc = subprocess.run([sys.executable, '-u', str(root/'engine/server.py')],
        input=''.join(json.dumps(r)+'\n' for r in requests), capture_output=True, text=True,
        encoding='utf-8', cwd=root, timeout=30)
    assert proc.returncode == 0, proc.stderr
    results = [json.loads(line) for line in proc.stdout.splitlines()]
    assert len(results) == 3
    assert results[0]['ok'] and results[0]['result']['values'][0] != '4'
    assert not results[1]['ok'] and 'result' not in results[1]
    assert results[2]['ok'] and results[2]['result']['values'] == [5]
