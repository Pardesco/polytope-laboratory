from copy import deepcopy
import pytest
from engine.generators import regular
from engine.geometry import GeometryError
from engine.formats import validate_project
from engine.multi_view_state import validate_multi_views


def settings():
    return {'version': 1, 'count': 6, 'cameras': [None, {
        'projection': 'perspective', 'position': [3, 2, 4], 'target': [0, 0, 0],
        'up': [0, 1, 0], 'zoom': 1, 'orthographicHalfHeight': 1.5}],
        'presentations': [{'projection': 'stereographic', 'angles': [0, 0, 90, 0, 0, 0]}], 'maximized': 5}


def test_multi_views_project_roundtrip():
    model = regular('tesseract')
    view = {'multiViews': settings(), 'projection': 'perspective', 'rotationPlane': 2, 'rotationSpeed': 4}
    project = {'format': 'polytope-laboratory', 'version': 1, 'active': 0, 'documents': [
        {'cursor': 0, 'states': [{'model': model, 'view': deepcopy(view)}]}]}
    result = validate_project(project)['documents'][0]['states'][0]
    assert result['view'] == view
    assert result['model']['vertices'] == model['vertices']


@pytest.mark.parametrize('count', range(1, 7))
def test_legacy_camera_layouts(count):
    validate_multi_views({'version': 1, 'count': count, 'cameras': []})


@pytest.mark.parametrize('field,value', [
    ('count', 0), ('count', 7), ('count', True), ('version', 2), ('version', True), ('cameras', {}),
    ('cameras', [None] * 7), ('cameras', [{'projection': 'bad'}]),
    ('presentations', [{}]), ('presentations', [None] * 7),
    ('presentations', [{'projection': 'perspective', 'angles': [0] * 5}]),
    ('presentations', [{'projection': 'perspective', 'angles': [0] * 5 + [float('nan')]}]),
    ('maximized', -1), ('maximized', 6), ('maximized', True)])
def test_invalid_saved_layout(field, value):
    data = settings(); data[field] = value
    with pytest.raises(GeometryError, match='[Mm]ultiple|[Mm]aximized'):
        validate_multi_views(data)


@pytest.mark.parametrize('field,value', [('zoom', 0), ('orthographicHalfHeight', float('inf')),
                                        ('position', [0, 0, float('nan')]), ('up', [0, 1])])
def test_invalid_saved_camera(field, value):
    data = settings(); data['cameras'][1][field] = value
    with pytest.raises(GeometryError):
        validate_multi_views(data)
