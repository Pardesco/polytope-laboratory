"""Source-bound element edits and literal-content operation history."""
from copy import deepcopy
import base64
import json
import uuid

from .geometry import GeometryError, identity
from . import element_annotations as content

OPERATION = 'element-content'
VERSION = '0.1.0'


def semantic(value):
    def normalize(item):
        if type(item) is dict:
            return {key: normalize(child) for key, child in item.items()}
        if type(item) is list:
            return [normalize(child) for child in item]
        if isinstance(item, float) and item.is_integer():
            return int(item)
        return item
    return content._json(normalize(value), content.MAX_DOCUMENT)


def active_content(model, view):
    document = view.get('elementAnnotations')
    if document is None:
        return content.new_document(model)
    content.validate_document(document, model)
    return deepcopy(document)


def remove_content(document, model, kind, index, parts):
    content.validate_document(document, model)
    content._anchor(model, kind, index)
    if type(parts) is not list or not parts or any(type(part) is not str or part not in ('text', 'texture') for part in parts) or len(parts) != len(set(parts)):
        raise GeometryError('Choose distinct text/texture content parts to remove.')
    result = deepcopy(document)
    for entry in result['entries']:
        if entry['kind'] == kind and entry['index'] == index:
            for part in parts:
                entry[part] = None
    result['entries'] = [entry for entry in result['entries'] if entry['text'] is not None or entry['texture'] is not None]
    used = {entry['texture']['asset'] for entry in result['entries'] if entry['texture'] is not None}
    result['assets'] = {key: asset for key, asset in result['assets'].items() if key in used}
    content.validate_document(result, model)
    return result


def edit_content(document, model, parameters):
    if type(parameters) is not dict or type(parameters.get('action')) is not str:
        raise GeometryError('Element content requires an explicit action object.')
    args = deepcopy(parameters)
    action = args.pop('action')
    if action == 'text':
        if set(args) - {'kind', 'index', 'markup', 'placement'} or not {'kind', 'index', 'markup'} <= set(args):
            raise GeometryError('Text requires source kind/index, markup and optional placement.')
        return content.set_text(document, model, **args)
    if action == 'texture':
        if set(args) != {'index', 'pngBase64'} or type(args['pngBase64']) is not str or len(args['pngBase64']) > (content.MAX_ASSET + 2) // 3 * 4:
            raise GeometryError('Texture requires a bounded PNG encoding and source face index.')
        try:
            raw = base64.b64decode(args['pngBase64'], validate=True)
        except (ValueError, TypeError) as exc:
            raise GeometryError('Invalid PNG encoding.') from exc
        return content.set_texture(document, model, args['index'], raw)
    if action == 'remove':
        if set(args) != {'kind', 'index', 'parts'}:
            raise GeometryError('Removal requires source kind/index and content parts.')
        return remove_content(document, model, **args)
    if action == 'list':
        if set(args) - {'kind', 'lines', 'targetIds'} or not {'kind', 'lines'} <= set(args):
            raise GeometryError('Text list requires a source kind and ordered lines.')
        names = {'vertex': 'vertices', 'edge': 'edges', 'face': 'faces', 'cell': 'cells'}
        kind, lines = args['kind'], args['lines']
        if type(kind) is not str or kind not in names or type(lines) is not list or len(lines) > content.MAX_ENTRIES or sum(len(x) if type(x) is str else content.MAX_CHARS + 1 for x in lines) > 128 * 1024:
            raise GeometryError('Text list exceeds its supported kind/count/character domain.')
        ids = args.get('targetIds', list(range(len(model[names[kind]]))))
        if type(ids) is not list or any(type(i) is not int or not 0 <= i < len(model[names[kind]]) for i in ids) or len(ids) != len(set(ids)) or len(lines) > len(ids):
            raise GeometryError('Text-list target IDs must be distinct existing elements, with a target for each line.')
        # Validate every entry before making the detached update.
        for line in lines:
            content.compile_text(line)
        result = deepcopy(document)
        for index, markup in zip(ids, lines):
            result = content.set_text(result, model, kind, index, markup)
        return result
    raise GeometryError('Unsupported element content action.')


def apply_content_state(source, parameters, *, recorded=False):
    if type(parameters) is not dict:
        raise GeometryError('Element content parameters require a JSON object.')
    params = deepcopy(parameters)
    supplied_base = params.pop('baseContent', None)
    base = active_content(source['model'], source['view'])
    if recorded and supplied_base is None:
        raise GeometryError('Recorded content edits require their complete original content input.')
    if supplied_base is not None:
        content.validate_document(supplied_base, source['model'])
        if semantic(supplied_base) != semantic(base):
            raise GeometryError('Recorded content input differs from the actual parent content.')
    updated = edit_content(base, source['model'], params)
    state = deepcopy(source)
    state['view']['elementAnnotations'] = updated
    state['view'].pop('elementContentTransfer', None)
    for key in ('netLayout', 'netPages'):
        state.pop(key, None)
    params['baseContent'] = base
    return state, params


def run_content(document, parameters, label='Edit element content'):
    from .recipes import checked_document
    from .history import create_history, record_source, append_operation, validate_document_history
    result = checked_document(document)
    graph = validate_document_history(result)
    if graph is None:
        graph = create_history()
        for state in result['states']:
            node_id = str(uuid.uuid4())
            graph = record_source(graph, node_id, state)
            state['operationNode'] = node_id
    source = result['states'][result['cursor']]
    retained = next(n for n in graph.to_dict()['nodes'] if n['id'] == source['operationNode'])
    def owner(state):
        return {'model': state['model'], 'notes': state.get('notes', ''),
                'coordinateUnit': state['view'].get('coordinateUnit'),
                'elementAnnotations': state['view'].get('elementAnnotations'),
                'elementContentDetached': state['view'].get('elementContentDetached')}
    if semantic(owner(source)) != semantic(owner(retained['snapshot'])):
        source_id = str(uuid.uuid4())
        graph = record_source(graph, source_id, source, parent=source['operationNode'])
        source['operationNode'] = source_id
    state, recorded_params = apply_content_state(source, parameters)
    node_id = str(uuid.uuid4())
    state.update(label=label, operationNode=node_id)
    graph = append_operation(graph, source['operationNode'], source,
                             OPERATION, recorded_params, state, node_id)
    result['states'] = (result['states'][:result['cursor'] + 1] + [state])[-200:]
    result['cursor'] = len(result['states']) - 1
    result['operationHistory'] = graph.to_dict()
    return checked_document(result)


def replay_content_state(parent, node):
    if node['algorithmVersion'] != VERSION:
        raise GeometryError('Unsupported recorded element content version.')
    computed, _ = apply_content_state(parent, node['params'], recorded=True)
    expected = node['snapshot']
    if semantic(computed['view']['elementAnnotations']) != semantic(expected['view'].get('elementAnnotations')):
        raise GeometryError('Recorded formatted content does not reconstruct from its source and edit parameters.')
    # Other display/observer edits remain the historical presentation snapshot.
    state = deepcopy(expected)
    state['model'] = deepcopy(parent['model'])
    state['view']['elementAnnotations'] = computed['view']['elementAnnotations']
    return state


def describe_content(model, document, reference_edge_mm=25):
    content.validate_document(document, model)
    content._number(reference_edge_mm, 1, 1000, 'Reference edge')
    entries = []
    names = {'vertex': 'vertices', 'edge': 'edges', 'face': 'faces', 'cell': 'cells'}
    for item in document['entries']:
        kind, index = item['kind'], item['index']
        ids = [index] if kind == 'vertex' else (sorted({v for f in model['cells'][index] for v in model['faces'][f]}) if kind == 'cell' else model[names[kind]][index])
        coordinates = [model['vertices'][i] for i in ids]
        record = {'kind': kind, 'index': index, 'sourceVertexIds': list(ids),
                  'anchor': [sum(p[axis] for p in coordinates) / len(coordinates) for axis in range(len(coordinates[0]))],
                  'text': deepcopy(item['text']), 'runs': content.compile_text(item['text']['markup']) if item['text'] is not None else [],
                  'texture': deepcopy(item['texture'])}
        if kind == 'face':
            record['faceFrame'] = content.face_frame(model, index)
        entries.append(record)
    return {'version': 1, 'sourceId': model['id'], 'sourceFingerprint': identity(model),
            'sourceSha256': document['sourceSha256'], 'referenceEdgeLengthMm': reference_edge_mm,
            'entries': entries, 'assets': deepcopy(document['assets'])}
