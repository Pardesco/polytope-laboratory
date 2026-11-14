"""Independent incidence-page oracle for the UI's native preview operation."""

import json
from pathlib import Path

import pytest

from engine.server import dispatch


TABLE = json.loads((Path(__file__).parent / 'data/coxeter_ringings.json').read_text(encoding='utf-8'))
ROWS = TABLE['rows']
KINDS = ('vertices', 'edges', 'faces', 'cells')


def test_independent_table_covers_every_nonempty_ringing_once():
    assert len(ROWS) == 96
    assert len({(row['family'], row['rings']) for row in ROWS}) == 96
    for family in ('A3', 'B3', 'H3', 'A4', 'B4', 'D4', 'F4', 'H4'):
        rank = int(family[-1])
        assert {row['rings'] for row in ROWS if row['family'] == family} == {
            format(mask, f'0{rank}b') for mask in range(1, 2**rank)
        }
    for row in ROWS:
        assert row['sourceUrl'] == f'https://bendwavy.org/klitzing/incmats/{row["sourceFigure"]}.htm'
        assert len(row['counts']) == 4 and row['name']


@pytest.mark.parametrize('row', ROWS, ids=[f'{row["family"]}-{row["rings"]}' for row in ROWS])
def test_builder_dispatch_matches_independent_counts_and_display_name(row):
    result = dispatch(
        {
            'op': 'coxeter-build',
            'params': {'family': row['family'], 'rings': list(map(int, row['rings'])), 'snub': False, 'hand': 'A'},
        }
    )
    evidence = row['sourceUrl']
    assert [len(result[kind]) for kind in KINDS] == row['counts'], evidence
    assert result['name'] == row['name'], evidence
    assert result['validation']['passed'], evidence
    assert result['metadata']['shapeBuilder']['exact'] is False
    assert result['metadata']['shapeBuilder']['edgeRelativeSpread'] < 1e-7
    assert result['provenance']['orbitClosureResidual'] <= 1e-9
