"""Description coverage against the actual catalog IDs and native inventories."""
import json
from pathlib import Path
import runpy

import pytest
from engine.generators import CATALOG
from engine.regular4d_validation import CATALOG_IDENTITIES
from engine.uniform4 import manifest

ROOT = Path(__file__).resolve().parents[1]
DESCRIPTIONS = json.loads((ROOT/'ui/model-descriptions.json').read_text(encoding='utf-8'))


@pytest.mark.parametrize('family,count', [('Platonic',5),('Archimedean',15),('Catalan',15),('Kepler-Poinsot',4),('Regular convex',6)])
def test_named_references_have_descriptions(family, count):
    keys = [row['key'] for row in CATALOG if row['family'] == family]
    assert len(keys) == count  # Snub and pentagonal Catalan mirror forms retain separate keys.
    assert all(DESCRIPTIONS[key] for key in keys)


def test_all_92_johnson_descriptions_match_retained_regular_face_counts():
    rows = json.loads((ROOT/'engine/catalog_data/antiprism/manifest.json').read_text(encoding='utf-8'))['entries']
    rows = [row for row in rows if row['family'] == 'Johnson']
    assert len(rows) == 92
    for row in rows:
        text = DESCRIPTIONS[row['key']]
        assert row['name'] in text
        assert f"(J{int(row['id'][1:])})" in text
        assert text.count('.') == 1
        assert row['quality']['regularFacesAndEqualEdgesPassed']
        assert sum(row['quality']['facePolygonWindingCounts'].values()) == row['counts']['faces']


def test_regular_stars_and_47_nonprismatic_uniform_polychora_are_covered():
    assert len(CATALOG_IDENTITIES) == 16
    assert all(key in DESCRIPTIONS for key in CATALOG_IDENTITIES)
    rows = [row for row in manifest()['entries'] if not row.get('baseKey')]
    assert len(rows) == 47
    assert all(key in DESCRIPTIONS for key in [row['key'] for row in rows])
    assert all(sum(cell['count'] for cell in row['cellTypes']) == row['counts'][3] for row in rows)


def test_descriptions_are_reproducible_from_pinned_inventories_and_curated_prose():
    assert runpy.run_path(str(ROOT/'scripts/build-model-descriptions.py'))['build']() == DESCRIPTIONS
    assert all(isinstance(text,str) and 30 < len(text) < 600 for text in DESCRIPTIONS.values())


def test_compounds_and_polygon_families_are_covered():
    assert 'two tetrahedra' in DESCRIPTIONS['compound-stella-octangula'].lower()
    assert '5 cubes' in DESCRIPTIONS['compound-five-cubes']
    for kind in ('prism','antiprism'):
        assert all(f'uniform-{kind}-{n}' in DESCRIPTIONS for n in range(3,13))
