"""Complete canonical keys and bounded allocation on both encoding paths."""
import json
import random
from unittest.mock import patch

import pytest

from engine.section_validation import SectionValidationCache


def canonical(value):
    return json.dumps(value, ensure_ascii=True, allow_nan=False,
                      sort_keys=True, separators=(',', ':'))


@pytest.mark.parametrize('value', [
    None, True, False, 0, -1, 2**1024, -(2**1024),
    0.0, -0.0, 5e-324, -1.7976931348623157e308,
    '', '\x00\t\n"\\', '\ud800\udfff', '漢字😀',
    {'z': [1, 1.0, True, None], 'a': {'😀': '\x00'}},
])
def test_fast_path_has_the_complete_canonical_wire_key(value):
    expected = canonical(value)
    with patch('engine.section_validation.json.dumps', wraps=json.dumps) as encode:
        assert SectionValidationCache().key(value) == expected
        encode.assert_called_once()


@pytest.mark.parametrize('value', [
    'a' * 1000, '😀' * 200 + 'a', {'a': ['漢字', '\x00', '\ud800', 1e308]},
    [0] * 50,
])
def test_conservative_overestimate_preserves_exact_streaming_byte_limits(value):
    expected = canonical(value)
    for entry_limit, total_limit in [(len(expected), len(expected)),
                                     (len(expected)-1, 10**6),
                                     (10**6, len(expected)-1)]:
        cache = SectionValidationCache(max_entry_bytes=entry_limit,
                                       max_total_bytes=total_limit)
        with patch('engine.section_validation.json.dumps', side_effect=AssertionError('Unbounded fast encoding')):
            assert cache.key(value) == (expected if len(expected) <= min(entry_limit, total_limit) else None)


def test_deterministic_mixed_json_inputs_match_canonical_keys_and_byte_boundaries():
    rng = random.Random(20261025)
    atoms = [None, True, False, 0, -0.0, 1.0, 1e-300, 1e300,
             2**128, '', '\x00"\\', '漢😀', '\ud800']
    def value(depth=0):
        if depth == 4 or rng.randrange(3) == 0:
            return rng.choice(atoms)
        children = [value(depth+1) for _ in range(rng.randrange(5))]
        return children if rng.randrange(2) else {str(i)+rng.choice(['', '😀']): x for i, x in enumerate(children)}
    for _ in range(300):
        source = value()
        expected = canonical(source)
        assert SectionValidationCache().key(source) == expected
        assert SectionValidationCache(max_entry_bytes=len(expected)).key(source) == expected
        assert SectionValidationCache(max_entry_bytes=len(expected)-1).key(source) is None
        assert SectionValidationCache(max_total_bytes=len(expected)-1).key(source) is None


def test_preflight_still_refuses_non_plain_types_oversize_values_and_cycles():
    class CustomInt(int):
        pass
    class CustomList(list):
        pass
    class CustomDict(dict):
        pass
    class CustomString(str):
        pass
    cycle = {}; cycle['self'] = cycle
    inputs = [CustomInt(1), CustomString('x'), CustomList([1]), CustomDict(a=1),
              {CustomString('x'): 1}, {1: 'x'}, (1, 2), object(),
              'a' * 101, {'a' * 101: 0}, [None] * 65536, cycle]
    with patch('engine.section_validation.json.dumps', side_effect=AssertionError('Preflight bypassed')):
        for source in inputs:
            assert SectionValidationCache(max_entry_bytes=100).key(source) is None


@pytest.mark.parametrize('value', [float('nan'), float('inf'), float('-inf')])
def test_nonfinite_numbers_cannot_form_keys_on_either_path(value):
    assert SectionValidationCache().key([value]) is None
    assert SectionValidationCache(max_entry_bytes=10).key([value]) is None


def test_mutated_and_differently_typed_models_never_share_keys():
    cache = SectionValidationCache()
    source = {'metadata': {'fingerprint': 'same'}, 'vertices': [[1, 0.0, True]]}
    first = cache.key(source)
    source['vertices'][0][0] = 1.0
    assert cache.key(source) != first
    second = cache.key(source)
    source['vertices'][0][2] = 1
    assert cache.key(source) not in (first, second)
    assert cache.key({'b': 2, 'a': 1}) == cache.key({'a': 1, 'b': 2})


def test_excessive_nesting_remains_an_uncached_input():
    source = 0
    for _ in range(2000):
        source = [source]
    assert SectionValidationCache().key(source) is None
