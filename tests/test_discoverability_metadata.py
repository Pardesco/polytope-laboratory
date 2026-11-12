"""Document information survives projects and both supported geometry carriers."""

from copy import deepcopy
import json
import pytest
from engine.generators import regular
from engine.geometry import GeometryError
from engine.formats import validate_project, save_project, load_file, export_model, parse_off
from engine.export_context import prepare_export
from engine.document_metadata import validate_metadata, OFF_DOCUMENT_PREFIX
from engine.server import dispatch


def metadata():
    return {
        'title': 'Study #1 — cube',
        'author': 'Ada',
        'description': 'First line\nSecond line',
        'reference': 'https://example.test/#reference\nA book',
        'tags': ['regular', '3D'],
        'license': 'CC BY 4.0',
        'source': 'Local archive',
        'custom': {'page': 12},
        'futureField': {'retained': True},
    }


def test_native_project_save_load_preserves_document_view_information(tmp_path):
    source = regular('cube')
    project = {
        'format': 'polytope-laboratory',
        'version': 1,
        'active': 0,
        'documents': [
            {
                'cursor': 0,
                'states': [{'model': source, 'view': {'documentMetadata': metadata()}, 'notes': 'Document note'}],
            }
        ],
    }
    path = tmp_path / 'metadata.polyproj'
    save_project(path, project)
    restored = load_file(path)['project']['documents'][0]['states'][0]
    assert restored['view']['documentMetadata'] == metadata()
    assert restored['notes'] == 'Document note'
    assert restored['model']['vertices'] == source['vertices']


@pytest.mark.parametrize('format', ['json', 'off'])
def test_native_export_preparation_and_import_round_trip_all_fields(tmp_path, format):
    source = regular('cube')
    original = deepcopy(source)
    prepared = dispatch(
        {
            'op': 'prepare-export',
            'model': source,
            'params': {
                'format': format,
                'document_metadata': metadata(),
                'notes': 'Notes\n# OFF comment injection? No.',
                'include_text': True,
            },
        }
    )
    path = tmp_path / ('metadata.' + format)
    path.write_text(prepared['text'], encoding='utf-8')
    restored = load_file(path)['model']
    assert restored['metadata']['documentMetadata'] == metadata()
    assert restored['metadata']['documentNotes'] == 'Notes\n# OFF comment injection? No.'
    assert restored['vertices'] == source['vertices']
    assert restored['faces'] == source['faces']
    assert source == original


def test_off_4d_comment_is_plain_bounded_data_and_preserves_geometry():
    source = regular('tesseract')
    prepared = prepare_export(source, 'off', document_metadata=metadata(), notes='Unicode π; # marker')
    text = export_model(prepared['model'], 'off')
    assert text.startswith('4OFF\n')
    assert sum(line.startswith(OFF_DOCUMENT_PREFIX) for line in text.splitlines()) == 1
    restored = parse_off(text)
    assert restored['metadata']['documentMetadata'] == metadata()
    assert restored['metadata']['documentNotes'] == 'Unicode π; # marker'
    assert restored['cells'] == source['cells']
    assert any('other readers may discard' in loss for loss in prepared['report']['losses'])


@pytest.mark.parametrize(
    'invalid',
    [
        {'tags': 'regular'},
        {'tags': [4]},
        {'tags': ['a' * 129]},
        {'tags': ['x'] * 129},
        {'license': []},
        {'source': {}},
        {'custom': []},
        {'custom': {'n': float('inf')}},
        {'large': 'x' * 131073},
    ],
)
def test_project_and_export_refuse_invalid_extended_metadata(invalid):
    source = regular('cube')
    with pytest.raises(GeometryError):
        validate_metadata(invalid)
    with pytest.raises(GeometryError):
        prepare_export(source, 'off', document_metadata=invalid)
    with pytest.raises(GeometryError):
        validate_project(
            {
                'format': 'polytope-laboratory',
                'version': 1,
                'active': 0,
                'documents': [{'cursor': 0, 'states': [{'model': source, 'view': {'documentMetadata': invalid}}]}],
            }
        )


@pytest.mark.parametrize('comment', ['{', '[]', '{"metadata":{},"notes":4}', '{"metadata":{"tags":[4]},"notes":""}'])
def test_malformed_owned_off_comment_is_diagnosed(comment):
    text = export_model(regular('cube'), 'off')
    with pytest.raises(GeometryError, match='document|information|notes'):
        parse_off(text + OFF_DOCUMENT_PREFIX + comment + '\n')


def test_ordinary_off_comments_remain_ignored_and_duplicate_owned_comments_are_refused():
    text = export_model(regular('cube'), 'off')
    assert 'documentMetadata' not in parse_off('# A generic author comment\n' + text)['metadata']
    comment = OFF_DOCUMENT_PREFIX + json.dumps({'metadata': {}, 'notes': ''}) + '\n'
    with pytest.raises(GeometryError, match='duplicate'):
        parse_off(text + comment + comment)


def test_explicit_cleared_document_fields_override_imported_hints_in_off():
    source = regular('cube')
    source['metadata'].update(documentMetadata=metadata(), documentNotes='Old notes')
    prepared = prepare_export(source, 'off', document_metadata={}, notes='')
    restored = parse_off(export_model(prepared['model'], 'off'))
    assert restored['metadata']['documentMetadata'] == {}
    assert restored['metadata']['documentNotes'] == ''
