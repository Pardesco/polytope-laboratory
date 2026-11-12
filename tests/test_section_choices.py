"""Common section choices retain distinct native interpretations and history."""

from copy import deepcopy
from pathlib import Path
import json
import runpy
import numpy as np
import pytest
from engine import server
from engine.formats import parse_off, save_project, load_file
from engine.generators import regular
from engine.geometry import identity, validate, GeometryError
from engine.recipes import run_recipe, replay_document

ROOT = Path(__file__).resolve().parents[1]


def disconnected_source():
    cube = regular('cube')
    source = dict(
        id='section-two-cubes',
        name='Two separated cubes',
        dimension=3,
        embeddingDimension=3,
        interpretation='generalized-complex',
        vertices=[],
        edges=[],
        faces=[],
        cells=[],
        metadata={},
    )
    for x in (-2, 2):
        start = len(source['vertices'])
        source['vertices'] += [[p[0] + x, p[1], p[2]] for p in cube['vertices']]
        source['edges'] += [[v + start for v in e] for e in cube['edges']]
        source['faces'] += [[v + start for v in f] for f in cube['faces']]
    source['fingerprint'] = identity(source)
    source['validation'] = validate(source)
    return source


def open_boundary_source():
    source = disconnected_source()
    source['faces'].pop()
    source['fingerprint'] = identity(source)
    source['validation'] = validate(source)
    return source


def section_cases():
    ordinary = runpy.run_path(str(ROOT / 'tests/test_ordinary_cell_sections.py'))['literal']()
    data = ROOT / 'engine/catalog_data/miratope'
    star = parse_off((data / 'raw/Grand hexacosichoron.off').read_text(), 'Grand hexacosichoron')
    normal = np.asarray([0.173, 0.239, 0.317, 1])
    normal /= np.linalg.norm(normal)
    levels = sorted(np.asarray(star['vertices']) @ normal)
    return [
        dict(source=disconnected_source(), normal=[0, 0, 1], offset=0.137, choice='density'),
        dict(source=ordinary, normal=[0, 0, 0, 1], offset=0, choice='ordinary-cells'),
        dict(
            source=star, normal=normal.tolist(), offset=float(0.99 * levels[-1] + 0.01 * levels[-2]), choice='density'
        ),
    ]


@pytest.mark.parametrize('case', section_cases(), ids=['disconnected-3d', 'ordinary-4d', 'star-4d'])
def test_common_fill_preview_promote_reopen_replay(case, tmp_path):
    source = case['source']
    before = deepcopy(source)
    params = dict(normal=case['normal'], offset=case['offset'], section_domain=case['choice'], fill_rule='nonzero')
    surface = server.dispatch(dict(op='section', model=source, params={**params, 'section_domain': 'surface'}))
    assert surface['model']['interpretation'] == 'surface-section'
    assert surface['model']['faces'] == []
    filled = server.dispatch(dict(op='section', model=source, params=params))
    assert filled['model']['faces']
    assert filled['model']['numeric']['certified'] is False
    if source['dimension'] == 3:
        assert len(filled['model']['metadata']['densitySection']['regions']) == 2
        assert sum(r['content'] for r in filled['densityLegend']) == pytest.approx(8)
    elif case['choice'] == 'density':
        assert filled['densityDiagnostics']['maxIntegerResidual'] < 1e-6
    else:
        assert filled['status'] == 'ordinary-cell-section'
        assert filled['cellSectionRegions']
    view = dict(
        derivedMode='cell-section' if case['choice'] == 'ordinary-cells' else 'section',
        sectionNormal=case['normal'],
        sectionOffset=case['offset'],
        coordinateUnit='cm',
        densitySection=dict(enabled=case['choice'] == 'density', rule='nonzero', threshold=1),
    )
    document = dict(id='source', cursor=0, states=[dict(model=source, view=view, notes='Keep source notes')])
    promoted = run_recipe(document, 'section', params, server.dispatch, 'Promote chosen filled section')
    assert document['cursor'] == 0 and len(document['states']) == 1 and source == before
    assert promoted['states'][1]['model'] == filled['model']
    path = tmp_path / 'choice.polyproj'
    save_project(path, dict(format='polytope-laboratory', version=1, active=0, documents=[promoted]))
    reopened = load_file(path)['project']['documents'][0]
    assert reopened['states'][1]['notes'] == 'Keep source notes'
    assert reopened['states'][1]['view']['coordinateUnit'] == 'cm'
    assert replay_document(reopened, server.dispatch)['states'][0]['model'] == filled['model']
    for cursor, expected in [(0, source), (1, filled['model'])]:
        reopened['cursor'] = cursor
        assert reopened['states'][reopened['cursor']]['model'] == expected


def test_common_fill_refuses_open_boundary_and_missing_ordinary_cells():
    source = open_boundary_source()
    with pytest.raises(GeometryError, match='two distinct incident faces'):
        server.dispatch(
            dict(op='section', model=source, params=dict(normal=[0, 0, 1], offset=0.137, section_domain='density'))
        )
    source = regular('tesseract')
    source['interpretation'] = 'generalized-complex'
    source['cells'] = []
    source['fingerprint'] = identity(source)
    with pytest.raises(GeometryError, match='[Cc]ell'):
        server.dispatch(
            dict(
                op='section',
                model=source,
                params=dict(normal=[0, 0, 0, 1], offset=0.137, section_domain='ordinary-cells'),
            )
        )


if __name__ == '__main__':
    print(json.dumps(section_cases()))
