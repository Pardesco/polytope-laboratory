"""Literal disjoint incidence addition. No welding, blending or solid inference."""
from copy import deepcopy
import json
import math
import uuid

from .geometry import GeometryError, MAX_VERTICES, TOLERANCE, identity, validate

VERSION = '0.1.0'
KINDS = ('vertices', 'edges', 'faces', 'cells')
MAX_ELEMENTS = 100_000
MAX_INCIDENCES = 1_000_000
MAX_FACE_VERTICES = 2048
MAX_COMPONENTS = 1024
MAX_PAYLOAD_BYTES = 64 * 1024 * 1024
MAX_COORDINATE = 1e100


def _payload_size(value):
    try:
        return len(json.dumps(value, allow_nan=False, separators=(',', ':')).encode('utf-8'))
    except (TypeError, ValueError, OverflowError, RecursionError, UnicodeEncodeError) as exc:
        raise GeometryError('Compound source must be finite, bounded JSON model data.') from exc


def _colors(model, kind):
    metadata = model.get('metadata', {})
    if not isinstance(metadata, dict):
        raise GeometryError('Compound source metadata must be an object.')
    table = metadata.get('offColors', {})
    if not isinstance(table, dict):
        raise GeometryError('Compound OFF colors must be an object.')
    colors = table.get(kind)
    if colors is None:
        return [None] * len(model.get(kind, []))
    if not isinstance(colors, list) or len(colors) != len(model.get(kind, [])):
        raise GeometryError(f'Compound {kind} color count does not match source incidence.')
    for color in colors:
        if color is None:
            continue
        if not isinstance(color, dict) or color.get('encoding') not in ('byte', 'unit'):
            raise GeometryError('Compound source color encoding must be byte or unit.')
        channels = color.get('values')
        if not isinstance(channels, list) or len(channels) not in (3, 4):
            raise GeometryError('Compound source colors require RGB or RGBA channels.')
        maximum = 255 if color['encoding'] == 'byte' else 1
        if any(type(x) not in (int, float) or (color['encoding'] == 'byte' and type(x) is not int)
               or not 0 <= x <= maximum or not math.isfinite(x) for x in channels):
            raise GeometryError('Compound source color channels are outside their numeric domain.')
    return colors


def _component_records(model):
    records = model.get('components')
    if records is None:
        return [{'id': None, 'name': model.get('name', 'Source'),
                 'sourceModelId': model.get('id'), 'sourceFingerprint': identity(model),
                 'sourcePath': [], 'maps': {kind: list(range(len(model.get(kind, [])))) for kind in KINDS}}]
    if not isinstance(records, list) or not 1 <= len(records) <= MAX_COMPONENTS:
        raise GeometryError('Compound components must be a nonempty bounded list.')
    owners = {kind: {} for kind in KINDS}
    identifiers = set()
    for index, component in enumerate(records):
        if not isinstance(component, dict) or not isinstance(component.get('id'), str) or not component['id']:
            raise GeometryError('Compound component IDs must be nonempty strings.')
        if component['id'] in identifiers:
            raise GeometryError('Compound component IDs must be distinct.')
        identifiers.add(component['id'])
        maps = component.get('maps')
        if not isinstance(maps, dict):
            raise GeometryError('Compound component incidence maps are required.')
        for kind in KINDS:
            ids = maps.get(kind)
            if not isinstance(ids, list):
                raise GeometryError('Compound component maps must be ordered lists.')
            for element in ids:
                if type(element) is not int or not 0 <= element < len(model.get(kind, [])) or element in owners[kind]:
                    raise GeometryError('Compound component maps contain invalid, overlapping or repeated IDs.')
                owners[kind][element] = index
        if not maps['vertices']:
            raise GeometryError('Each compound component requires source vertices.')
        path = component.get('sourcePath')
        if not isinstance(path, list) or any(type(x) is not int or x not in (0, 1) for x in path):
            raise GeometryError('Compound component source path is malformed.')
    for kind in KINDS:
        if len(owners[kind]) != len(model.get(kind, [])):
            raise GeometryError('Compound component maps must partition all source incidence.')
    for kind in ('edges', 'faces', 'cells'):
        lower = 'faces' if kind == 'cells' else 'vertices'
        for index, boundary in enumerate(model.get(kind, [])):
            if any(owners[lower].get(v) != owners[kind][index] for v in boundary):
                raise GeometryError('Compound incidence crosses declared component boundaries.')
    return records


def _check_source(model):
    if not isinstance(model, dict):
        raise GeometryError('Compound addition requires two source Model objects.')
    if not isinstance(model.get('numeric', {}), dict) or not isinstance(model.get('metadata', {}), dict):
        raise GeometryError('Compound source numeric settings and metadata must be objects.')
    dimension = model.get('dimension')
    embedding = model.get('embeddingDimension', dimension)
    if type(dimension) is not int or dimension not in (2, 3, 4) or type(embedding) is not int or not dimension <= embedding <= 4:
        raise GeometryError('Compound sources require dimensions 2, 3 or 4 and a compatible embedding.')
    incidences = 0
    for kind in KINDS:
        elements = model.get(kind, [] if kind == 'cells' else None)
        cap = MAX_VERTICES if kind == 'vertices' else MAX_ELEMENTS
        if not isinstance(elements, list) or len(elements) > cap:
            raise GeometryError(f'Compound {kind} resource limit exceeded or array malformed.')
        for row in elements:
            if not isinstance(row, list):
                raise GeometryError('Compound coordinates and incidence must be lists.')
            if kind == 'faces' and len(row) > MAX_FACE_VERTICES:
                raise GeometryError('Compound face-boundary resource limit exceeded.')
            incidences += len(row)
            if incidences > MAX_INCIDENCES:
                raise GeometryError('Compound source incidence resource limit exceeded.')
            if kind == 'vertices' and (len(row) != embedding or any(type(x) not in (int, float) or abs(x) > MAX_COORDINATE or not math.isfinite(x) for x in row)):
                raise GeometryError('Compound coordinates must be finite numeric values bounded to 1e100.')
    if _payload_size(model) > MAX_PAYLOAD_BYTES:
        raise GeometryError('Compound source payload resource limit exceeded.')
    try:
        report = validate(model)
    except (AttributeError, ArithmeticError, RecursionError) as exc:
        raise GeometryError('Compound source validation could not resolve malformed numeric/certificate data.') from exc
    if not report['passed']:
        raise GeometryError('Invalid compound source incidence: ' + '; '.join(report['errors']))
    for kind in ('faces', 'cells'):
        _colors(model, kind)
    components = _component_records(model)
    return dimension, embedding, incidences, components


def add_models(base, other):
    """Add models as disjoint incidence, preserving literal source coordinates."""
    a, b = _check_source(base), _check_source(other)
    if a[:2] != b[:2]:
        raise GeometryError('Compound sources must have matching intrinsic and embedding dimensions.')
    if a[2] + b[2] > MAX_INCIDENCES or len(a[3]) + len(b[3]) > MAX_COMPONENTS:
        raise GeometryError('Compound aggregate incidence/component resource limit exceeded.')
    offsets = {kind: len(base.get(kind, [])) for kind in KINDS}
    for kind in KINDS:
        cap = MAX_VERTICES if kind == 'vertices' else MAX_ELEMENTS
        if offsets[kind] + len(other.get(kind, [])) > cap:
            raise GeometryError(f'Compound aggregate {kind} resource limit exceeded.')
    model = {'id': str(uuid.uuid4()), 'name': f"{base.get('name', 'Base')} + {other.get('name', 'Added')}",
             'dimension': a[0], 'embeddingDimension': a[1], 'interpretation': 'generalized-complex',
             'vertices': deepcopy(base['vertices']) + deepcopy(other['vertices']),
             'edges': deepcopy(base['edges']) + [[v + offsets['vertices'] for v in e] for e in other['edges']],
             'faces': deepcopy(base['faces']) + [[v + offsets['vertices'] for v in f] for f in other['faces']],
             'cells': deepcopy(base.get('cells', [])) + [[f + offsets['faces'] for f in c] for c in other.get('cells', [])],
             'components': [], 'metadata': {'compound': {'schemaVersion': 1, 'inputs': [],
                                                       'sourceModels': [deepcopy(base), deepcopy(other)]}},
             'numeric': {'mode': 'float64-approximate', 'tolerance': TOLERANCE, 'certified': False,
                         'inputInterpretation': 'Literal supplied coordinates and incidence; no union interior inferred'},
             'provenance': {'operation': 'add-models', 'algorithmVersion': VERSION,
                            'parameters': {'weld': False, 'rescale': False, 'rotate': False,
                                           'removeCoincidentFaces': False, 'blendCoplanarFaces': False}, 'inputs': []}}
    for source_index, (source, checked) in enumerate(((base, a), (other, b))):
        shift = {kind: offsets[kind] if source_index else 0 for kind in KINDS}
        fingerprint = identity(source)
        info = {'sourceIndex': source_index, 'sourceModelId': source.get('id'), 'sourceFingerprint': fingerprint,
                'maps': {kind: [i + shift[kind] for i in range(len(source.get(kind, [])))] for kind in KINDS}}
        model['metadata']['compound']['inputs'].append(info)
        model['provenance']['inputs'].append({'sourceModelId': source.get('id'), 'sourceFingerprint': fingerprint})
        for leaf in checked[3]:
            model['components'].append({'id': str(uuid.uuid4()), 'name': leaf.get('name', source.get('name', 'Source')),
                                        'sourceModelId': leaf.get('sourceModelId'), 'sourceFingerprint': leaf.get('sourceFingerprint'),
                                        'sourceComponentId': leaf.get('id'), 'sourcePath': [source_index] + leaf['sourcePath'],
                                        'maps': {kind: [i + shift[kind] for i in leaf['maps'][kind]] for kind in KINDS}})
    colors = {kind: deepcopy(_colors(base, kind)) + deepcopy(_colors(other, kind)) for kind in ('faces', 'cells')}
    if any(color is not None for values in colors.values() for color in values):
        model['metadata']['offColors'] = colors
    model['validation'] = validate(model)
    if not model['validation']['passed']:
        raise GeometryError('Compound result fails incidence validation: ' + '; '.join(model['validation']['errors']))
    _component_records(model)
    model['fingerprint'] = identity(model)
    if _payload_size(model) > MAX_PAYLOAD_BYTES:
        raise GeometryError('Compound result payload resource limit exceeded, including preserved sources.')
    return model


def retrieve_source(model, source_index):
    """Return an independent full copy of an immediate source at add time."""
    _check_source(model)
    if type(source_index) is not int or source_index not in (0, 1):
        raise GeometryError('Compound source index must be 0 or 1.')
    sources = model.get('metadata', {}).get('compound', {}).get('sourceModels')
    if not isinstance(sources, list) or len(sources) != 2:
        raise GeometryError('Compound source snapshots are unavailable.')
    source = sources[source_index]
    _check_source(source)
    return deepcopy(source)


def extract_component(model, component_id):
    """Extract current leaf geometry; preserve its historical source metadata."""
    _check_source(model)
    component = next((c for c in model.get('components', []) if c['id'] == component_id), None)
    if component is None:
        raise GeometryError('Choose an existing compound component ID.')
    source = model
    for index in component['sourcePath']:
        source = retrieve_source(source, index)
    maps = component['maps']
    reverse_vertices = {v: i for i, v in enumerate(maps['vertices'])}
    reverse_faces = {f: i for i, f in enumerate(maps['faces'])}
    result = {'id': str(uuid.uuid4()), 'name': component.get('name', 'Compound component'),
              'dimension': model['dimension'], 'embeddingDimension': model.get('embeddingDimension', model['dimension']),
              'interpretation': 'generalized-complex', 'vertices': deepcopy([model['vertices'][v] for v in maps['vertices']]),
              'edges': [[reverse_vertices[v] for v in model['edges'][e]] for e in maps['edges']],
              'faces': [[reverse_vertices[v] for v in model['faces'][f]] for f in maps['faces']],
              'cells': [[reverse_faces[f] for f in model.get('cells', [])[c]] for c in maps['cells']],
              'metadata': deepcopy(source.get('metadata', {})), 'numeric': deepcopy(model.get('numeric', {})),
              'provenance': {'operation': 'extract-component', 'algorithmVersion': VERSION,
                             'sourceModelId': model.get('id'), 'sourceFingerprint': identity(model),
                             'componentId': component_id, 'originalSourceModelId': component.get('sourceModelId'),
                             'sourceMaps': deepcopy(maps)}}
    colors = {}
    for kind in ('faces', 'cells'):
        table = _colors(model, kind)
        colors[kind] = deepcopy([table[i] for i in maps[kind]])
    result['metadata'].pop('offColors', None)
    if any(color is not None for values in colors.values() for color in values):
        result['metadata']['offColors'] = colors
    result['validation'] = validate(result)
    if not result['validation']['passed']:
        raise GeometryError('Extracted component fails incidence validation: ' + '; '.join(result['validation']['errors']))
    result['fingerprint'] = identity(result)
    return result


def remove_component(model, component_id):
    """Drop one current leaf; preserve remaining component identity and geometry."""
    _check_source(model)
    components = model.get('components', [])
    component = next((c for c in components if c['id'] == component_id), None)
    if type(component_id) is not str or component is None:
        raise GeometryError('Choose an existing compound component ID to remove.')
    if len(components) == 1:
        raise GeometryError('Cannot remove the last compound component: an empty Model is unsupported.')
    removed = {kind: set(component['maps'][kind]) for kind in KINDS}
    kept = {kind: [i for i in range(len(model.get(kind, []))) if i not in removed[kind]] for kind in KINDS}
    reverse = {kind: {old: new for new, old in enumerate(kept[kind])} for kind in KINDS}
    maps = {kind: [reverse[kind].get(i) for i in range(len(model.get(kind, [])))] for kind in KINDS}
    metadata = deepcopy(model.get('metadata', {}))
    colors = {}
    for kind in ('faces', 'cells'):
        table = _colors(model, kind)
        colors[kind] = deepcopy([table[i] for i in kept[kind]])
    metadata.pop('offColors', None)
    if any(color is not None for values in colors.values() for color in values):
        metadata['offColors'] = colors
    # Historical input snapshots and source paths remain unchanged. Their maps
    # now explicitly show deleted incidence instead of retaining stale IDs.
    compound = metadata.get('compound')
    if isinstance(compound, dict):
        historical_inputs = compound.get('inputs', [])
        if not isinstance(historical_inputs, list):
            raise GeometryError('Compound historical input maps must be a list.')
        for original_input in historical_inputs:
            if not isinstance(original_input, dict) or not isinstance(original_input.get('maps'), dict):
                raise GeometryError('Compound historical input maps are malformed.')
            for kind in KINDS:
                original_map = original_input['maps'].get(kind)
                if not isinstance(original_map, list) or any(old is not None and (type(old) is not int or not 0 <= old < len(maps[kind])) for old in original_map):
                    raise GeometryError('Compound historical source maps have stale or malformed IDs.')
                original_input['maps'][kind] = [maps[kind][old] if old is not None else None for old in original_map]
    metadata['compoundComponentEditing'] = {'schemaVersion': 1, 'sourceModel': deepcopy(model),
                                           'removedComponentId': component_id, 'sourceMaps': maps,
                                           'removedSourceModelId': component.get('sourceModelId'),
                                           'policy': 'remove one explicitly selected current leaf; no weld or geometry inference'}
    result = {'id': str(uuid.uuid4()), 'name': f"{model.get('name', 'Compound')} · remove {component.get('name', 'component')}",
              'dimension': model['dimension'], 'embeddingDimension': model.get('embeddingDimension', model['dimension']),
              'interpretation': 'generalized-complex',
              'vertices': deepcopy([model['vertices'][i] for i in kept['vertices']]),
              'edges': [[reverse['vertices'][v] for v in model['edges'][i]] for i in kept['edges']],
              'faces': [[reverse['vertices'][v] for v in model['faces'][i]] for i in kept['faces']],
              'cells': [[reverse['faces'][f] for f in model.get('cells', [])[i]] for i in kept['cells']],
              'components': [], 'metadata': metadata,
              'numeric': {'mode': 'float64-approximate', 'tolerance': TOLERANCE, 'certified': False,
                          'inputInterpretation': 'Remaining supplied component geometry; no union volume inferred'},
              'provenance': {'operation': 'remove-component', 'algorithmVersion': VERSION,
                             'sourceModelId': model.get('id'), 'sourceFingerprint': identity(model),
                             'parameters': {'componentId': component_id, 'weld': False},
                             'sourceMaps': deepcopy(maps)}}
    for current in components:
        if current['id'] == component_id:
            continue
        retained = deepcopy(current)
        retained['maps'] = {kind: [reverse[kind][old] for old in current['maps'][kind]] for kind in KINDS}
        result['components'].append(retained)
    result['validation'] = validate(result)
    if not result['validation']['passed']:
        raise GeometryError('Remaining compound fails incidence validation: ' + '; '.join(result['validation']['errors']))
    _component_records(result)
    result['fingerprint'] = identity(result)
    if _payload_size(result) > MAX_PAYLOAD_BYTES:
        raise GeometryError('Component removal result payload resource limit exceeded, including historical sources.')
    return result
