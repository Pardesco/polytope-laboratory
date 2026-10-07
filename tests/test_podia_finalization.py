"""Independent measures and real ownership at the podium finalization gate."""
from copy import deepcopy
import math
import pytest

from engine.construction_finalization import finalize_construction
from engine.compounds import extract_component, remove_component
from engine.geometry import GeometryError, identity
from engine.history import canonical_model
from engine.podia import rational_podium, rational_antipodium


def test_square_frustum_matches_independent_volume_and_slant_surface():
    raw = rational_podium(n=4, base_radius=math.sqrt(2), top_radius=math.sqrt(.5), height=3)
    before = deepcopy(raw)
    result = finalize_construction(raw)
    assert result['interpretation'] == 'convex-polytope'
    assert result['numeric']['certified'] is False
    assert result['metadata']['constructionFinalization']['classification']['status'] == 'passed'
    assert result['metadata']['constructionFinalization']['ownership']['adapter'] == 'podia-components'
    assert result['measure']['content'] == pytest.approx(7)
    assert result['measure']['boundaryMeasure'] == pytest.approx(5+6*math.sqrt(9.25))
    assert identity(result) == identity(raw) and result['id'] == raw['id']
    assert result['metadata']['rationalPodium']['sourceModels'] == raw['metadata']['rationalPodium']['sourceModels']
    assert len(result['components']) == 1 and result['components'][0]['sourcePath'] == []
    assert raw == before


def test_equal_triangular_antipodium_is_independently_measured_octahedron():
    raw = rational_antipodium(n=3, base_radius=1, top_radius=1, height=math.sqrt(2))
    result = finalize_construction(raw)
    assert result['interpretation'] == 'convex-polytope'
    assert result['measure']['content'] == pytest.approx(math.sqrt(6))
    assert result['measure']['boundaryMeasure'] == pytest.approx(6*math.sqrt(3))
    assert [len(result[k]) for k in ('vertices','edges','faces','cells')] == [6,12,8,0]
    assert identity(result) == identity(raw)


@pytest.mark.parametrize('constructor', [rational_podium, rational_antipodium])
def test_signed_disconnected_sources_keep_generalized_genuine_leaves_and_attributes(constructor):
    colors = [{'encoding':'byte','values':[12,80,255,128]}, {'encoding':'unit','values':[.1,.3,.8,.5]}]
    raw = constructor(symbol='6/-2', base_radius=2, top_radius=1, height=3, cap_colors=colors)
    before = deepcopy(raw)
    result = finalize_construction(raw)
    key = 'rationalPodium' if constructor is rational_podium else 'rationalAntipodium'
    assert result['interpretation'] == 'generalized-complex' and 'measure' not in result
    assert len(result['components']) == 2 and result['metadata'][key]['recoverableCompoundComponents'] is True
    assert result['metadata'][key]['sourceModels'] == raw['metadata'][key]['sourceModels']
    assert result['metadata']['offColors'] == raw['metadata']['offColors']
    assert [c['maps']['vertices'] for c in result['components']] == [[0,2,4,6,8,10],[1,3,5,7,9,11]]
    for component in result['components']:
        leaf = extract_component(result, component['id'])
        assert len(leaf['vertices']) == 6 and leaf['dimension'] == 3
        assert leaf['metadata']['podiaLeaf']['sourceFactorModels'] == raw['metadata'][key]['sourceModels']
    assert len(remove_component(result,result['components'][0]['id'])['vertices']) == 6
    assert raw == before and identity(result) == identity(raw)


@pytest.mark.parametrize('constructor', [rational_podium, rational_antipodium])
def test_tiny_subnormal_content_cannot_gain_a_convex_measure_claim(constructor):
    raw = constructor(n=3, base_radius=1e-108, top_radius=1e-108, height=1e-108)
    before = deepcopy(raw)
    result = finalize_construction(raw)
    assert result['interpretation'] == 'generalized-complex' and 'measure' not in result
    assert any(d['code']=='unsupported-measure' for d in result['metadata']['constructionFinalization']['diagnostics'])
    assert result['components'] and identity(result) == identity(raw) and raw == before


def test_repeated_finalization_and_edited_geometry_refuse_without_source_mutation():
    raw = rational_podium(n=4, base_radius=2, top_radius=1, height=3)
    finalized = finalize_construction(raw)
    with pytest.raises(GeometryError):
        finalize_construction(finalized)
    edited = deepcopy(raw);edited['vertices'][0][0] += .1
    before = deepcopy(edited)
    with pytest.raises(GeometryError):
        finalize_construction(edited)
    assert edited == before
