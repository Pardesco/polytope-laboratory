import json
import math

import pytest

from engine.export_context import prepare_export
from engine.formats import parse_off
from engine.generators import regular
from engine.operations import transform
from engine.rational import rational_hull


@pytest.mark.parametrize('format_name', ['off', 'json'])
def test_model_data_exports_round_trip_double_precision_coordinates(format_name):
    model = transform(regular('cube'), scale=math.nextafter(0.12345678901234567, 1))
    result = prepare_export(model, format_name, include_text=True)
    restored = json.loads(result['text']) if format_name == 'json' else parse_off(result['text'])
    assert restored['vertices'] == model['vertices']
    assert restored['edges'] == model['edges']
    assert restored['faces'] == model['faces']


def test_only_json_retains_rational_model_certificate_without_unit_conversion():
    model = rational_hull([['0', '0', '0'], ['1/3', '0', '0'], ['0', '1/2', '0'], ['0', '0', '1']])
    restored = json.loads(prepare_export(model, 'json', include_text=True)['text'])
    assert restored['certificate'] == model['certificate']
    assert restored['numeric']['certified'] is True
    off = parse_off(prepare_export(model, 'off', include_text=True)['text'])
    assert off['vertices'] == model['vertices']
    assert not off['numeric']['certified']
    converted = json.loads(prepare_export(model, 'json', 'm', 'mm', include_text=True)['text'])
    assert not converted['numeric']['certified']
