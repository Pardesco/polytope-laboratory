"""Atomic bounded native expression evaluation, including exact rational inputs.

A point-cloud edit uses one isolated desktop job rather than thousands of cold
processes. Validation of the complete input precedes evaluation; no partial
values leave this operation after a later syntax/domain/resource refusal.
"""
import json

from .expressions import evaluate
from .geometry import GeometryError

MAX_VALUES = 80000
MAX_EXPRESSION_CHARS = 512
MAX_BATCH_BYTES = 128 * 1024 * 1024


def expression_batch(parameters):
    if type(parameters) is not dict or set(parameters) - {'expressions', 'mode'}:
        raise GeometryError('Expression batch requires an object with expressions and optional mode.')
    mode = parameters.get('mode', 'real')
    if type(mode) is not str or mode not in ('real', 'rational'):
        raise GeometryError('Expression batch mode must be real or rational.')
    expressions = parameters.get('expressions')
    if type(expressions) is not list or not 1 <= len(expressions) <= MAX_VALUES:
        raise GeometryError('Expression batch requires 1..80000 expressions.')
    # JSON string escaping can expand ASCII control characters by six. Measure
    # actual UTF-8 JSON bytes, before invoking any parser or evaluating any item.
    input_bytes = 64
    for index, expression in enumerate(expressions):
        if type(expression) is not str or not expression.strip() or len(expression) > MAX_EXPRESSION_CHARS:
            raise GeometryError(f'Expression {index + 1} must contain 1..512 characters.')
        try:
            input_bytes += len(json.dumps(expression, ensure_ascii=False).encode('utf-8')) + 1
        except UnicodeError as error:
            raise GeometryError(f'Expression {index + 1} contains invalid Unicode.') from error
        if input_bytes > MAX_BATCH_BYTES:
            raise GeometryError('Expression batch input exceeds the 128 MiB limit.')
    values, output_bytes = [], 64
    for index, expression in enumerate(expressions):
        try:
            result = evaluate(expression)
            if mode == 'rational':
                value = result['exactRational']
                if value is None:
                    raise GeometryError('An exact rational result is required; irrational/approximate results are not accepted.')
            else:
                value = result['value']
            output_bytes += len(json.dumps(value, ensure_ascii=False, allow_nan=False).encode('utf-8')) + 1
            if output_bytes > MAX_BATCH_BYTES:
                raise GeometryError('Expression batch output exceeds the 128 MiB limit.')
            values.append(value)
        except GeometryError as error:
            raise GeometryError(f'Expression {index + 1}: {error}') from error
    return {'mode': mode, 'values': values}


def dispatch_expression_batch(request):
    if type(request) is not dict or set(request) - {'op', 'params', 'id', 'model'} or request.get('model') is not None:
        raise GeometryError('Expression batch accepts only its parameters, without source geometry.')
    return expression_batch(request.get('params'))
