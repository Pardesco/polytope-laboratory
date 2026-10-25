from copy import deepcopy
import json
import pytest
from engine.generators import regular
from engine.geometry import GeometryError, validate
from engine.section_validation import SectionValidationCache
from engine import operations

def source_model():
    # Requests cross the JSON boundary; raw hull helpers may contain float64.
    return json.loads(json.dumps(regular('tesseract')))


def test_literal_identical_source_reuses_only_success_and_keeps_the_source_untouched():
    cache = SectionValidationCache(); calls = []
    def check(model): calls.append(deepcopy(model)); return validate(model)
    source = source_model(); before = deepcopy(source)
    assert cache.passed(source, check)
    assert cache.passed(deepcopy(source), check)
    assert len(calls) == 1
    assert source == before
    # Neither a claimed report nor an unchanged fingerprint owns validation.
    broken = deepcopy(source); broken['faces'][0][0] = True
    broken['validation'] = {'passed': True}; broken['fingerprint'] = source['fingerprint']
    assert not cache.passed(broken, check)
    assert not cache.passed(broken, check)
    assert len(calls) == 3
    assert cache.passed(source, check); assert len(calls) == 3


@pytest.mark.parametrize('change', [
    lambda m: m['vertices'][0].__setitem__(0, m['vertices'][0][0] + .1),
    lambda m: m['edges'][0].reverse(),
    lambda m: m['faces'][0].reverse(),
    lambda m: m['cells'][0].reverse(),
    lambda m: m['facetEquations'][0].__setitem__(0, .25),
    lambda m: m['metadata'].__setitem__('coordinateUnits', 'cm'),
    lambda m: m.__setitem__('validation', {'passed': True}),
    lambda m: m.__setitem__('numeric', {'certified': True}),
])
def test_every_source_field_change_revalidates_even_with_the_same_reported_identity(change):
    cache = SectionValidationCache(); calls = []
    def check(model): calls.append(1); return validate(model)
    source = source_model(); assert cache.passed(source, check)
    changed = deepcopy(source); change(changed)
    assert cache.passed(changed, check) == validate(changed)['passed']
    assert len(calls) == 2


def test_entry_count_byte_budgets_and_lru_eviction_bound_retained_keys():
    cache = SectionValidationCache(max_entries=2, max_entry_bytes=100, max_total_bytes=30); calls = []
    def check(model): calls.append(model); return {'passed': True}
    for source in [{'n': 1}, {'n': 2}, {'n': 1}, {'n': 3}]: assert cache.passed(source, check)
    assert len(calls) == 3; assert len(cache.entries) == 2
    assert cache.passed({'n': 2}, check); assert len(calls) == 4
    assert cache.passed({'large': 'x' * 1000}, check)
    assert cache.passed({'large': 'x' * 1000}, check); assert len(calls) == 6
    assert cache.bytes <= 30 and len(cache.entries) <= 2
    tiny = SectionValidationCache(max_entries=8, max_entry_bytes=100, max_total_bytes=15)
    for i in range(10): assert tiny.passed({'n': i}, check)
    assert tiny.bytes <= 15


def test_non_json_types_and_unserializable_values_bypass_reuse_without_changing_validation():
    cache = SectionValidationCache(); calls = []
    def check(model): calls.append(1); return {'passed': True}
    cyclic = {}; cyclic['self'] = cyclic
    cyclic_list = [None] * 512; cyclic_list[-1] = cyclic_list
    for source in [{'tuple': (1, 2)}, {1: 'numeric key'}, {'value': object()}, {'value': float('nan')}, cyclic, cyclic_list]:
        assert cache.passed(source, check); assert cache.passed(source, check)
    assert len(calls) == 12; assert len(cache.entries) == 0
    assert cache.key({'v': [1]}) != cache.key({'v': [1.0]})
    assert cache.key({'v': [True]}) != cache.key({'v': [1]})


def test_section_integration_revalidates_malformed_support_and_other_operations_still_validate(monkeypatch):
    source = source_model(); before = deepcopy(source); calls = []
    def check(model): calls.append(1); return validate(model)
    monkeypatch.setattr(operations, 'validate', check)
    monkeypatch.setattr(operations, 'section_validation', SectionValidationCache())
    operations.section(source); operations.section(source, offset=.25); assert len(calls) == 1
    changed = deepcopy(source); changed['facetEquations'][0][0] = 100
    with pytest.raises(GeometryError, match='Source incidence'): operations.section(changed)
    assert len(calls) == 2; assert source == before
    operations.require_convex(source); operations.require_convex(source); assert len(calls) == 4
