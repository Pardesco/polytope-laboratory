"""Recover genuine product leaves without changing generated geometry IDs.

Attachment is a new capability on an unedited ordered product, not a union or
convexification. Binary source snapshots use their own local incidence; only
the root compound's outward maps are permuted back to the original product.
"""
from copy import deepcopy
import uuid

from .compounds import (KINDS, MAX_COMPONENTS, MAX_PAYLOAD_BYTES, _check_source,
                        _colors, _component_records, _payload_size, add_models,
                        extract_component)
from .geometry import GeometryError, identity, validate
from .history import _json_bytes
from .products import (MAX_PRODUCT_VERTICES, VERSION as PRODUCT_VERSION,
                       _snapshot, polygon_prism, polygon_product)

VERSION = '0.1.0'
MAX_LEAF_SNAPSHOT_BYTES = 16 * 1024 * 1024
MAX_TREE_WORK_BYTES = 128 * 1024 * 1024
NAMESPACE = uuid.UUID('87b114c9-81c7-47b8-8997-08b1e7c72239')


def _fail(message):
    raise GeometryError('Product components: ' + message)


def _uuid(fingerprint, role):
    # Geometry-bound IDs survive reattachment/replay when generated UUIDs vary.
    return str(uuid.uuid5(NAMESPACE, fingerprint + ':' + role))


def _same_schema(actual, expected):
    """Compare provenance IDs strictly: bools/floats are not integer IDs."""
    if type(actual) is not type(expected):
        return False
    if type(expected) is dict:
        return actual.keys() == expected.keys() and all(
            _same_schema(actual[key], value) for key, value in expected.items())
    if type(expected) is list:
        return len(actual) == len(expected) and all(
            _same_schema(left, right) for left, right in zip(actual, expected))
    return actual == expected


def _checked_product(model):
    # Apply the existing native project traversal bounds before serialization
    # or deep-copying arbitrary retained provenance (64 levels, bounded values).
    try:
        _json_bytes(model, MAX_PAYLOAD_BYTES)
    except GeometryError as exc:
        raise GeometryError('Product components: source JSON resource limit or malformed retained provenance.') from exc
    _check_source(model)
    if (model.get('dimension') not in (3, 4)
            or model.get('embeddingDimension') != model['dimension']
            or model.get('interpretation') != 'generalized-complex'):
        _fail('requires an intrinsic generated 3D prism or 4D polygon product.')
    if len(model['vertices']) > MAX_PRODUCT_VERTICES:
        _fail('generated vertex resource limit exceeded.')
    if 'components' in model or 'compound' in model.get('metadata', {}):
        _fail('the generated model already has compound ownership.')
    info = model.get('metadata', {}).get('orderedProduct')
    if (type(info) is not dict or type(info.get('schemaVersion')) is not int
            or info['schemaVersion'] != 1 or info.get('algorithmVersion') != PRODUCT_VERSION):
        _fail('ordered product provenance schema/version is unavailable.')
    fingerprint = identity(model)
    if (not isinstance(model.get('id'), str) or not model['id']
            or model.get('fingerprint') != fingerprint
            or info.get('resultSourceFingerprint') != fingerprint
            or info.get('resultSourceModelId') != model['id']):
        _fail('the generated model ID or geometry fingerprint is stale.')
    try:
        uuid.UUID(model['id'])
    except (ValueError, AttributeError) as exc:
        raise GeometryError('Product components: generated source ID must be a UUID.') from exc
    sources = info.get('sourceModels')
    count = 1 if model['dimension'] == 3 else 2
    if type(sources) is not list or len(sources) != count:
        _fail('full ordered factor snapshots are required.')
    inputs = info.get('inputs')
    if type(inputs) is not list or len(inputs) != count or inputs != [_snapshot(source) for source in sources]:
        _fail('factor snapshot identity or complete snapshot hash is stale.')
    # Reconstruct with the base product functions. Integration must attach in
    # generator/server wrappers, not recursively inside products._finish.
    if model['dimension'] == 3:
        interval = info.get('interval')
        if type(interval) is not dict:
            _fail('the original prism interval is unavailable.')
        expected = polygon_prism(sources[0], interval.get('height'))
        if interval != expected['metadata']['orderedProduct']['interval']:
            _fail('prism interval evidence is malformed.')
    else:
        expected = polygon_product(*sources)
    expected_info = expected['metadata']['orderedProduct']
    if any(model[kind] != expected[kind] for kind in KINDS):
        _fail('current ordered geometry differs from the preserved factor construction.')
    for key in ('operation', 'maps', 'sourceMaps', 'componentPartitions'):
        if not _same_schema(info.get(key), expected_info[key]):
            _fail('ordered factor or partition maps are malformed or stale.')
    partitions = info['componentPartitions']
    if not 1 <= len(partitions) <= MAX_COMPONENTS:
        _fail('component partition resource limit exceeded.')
    return info, fingerprint, partitions


def _leaf(model, info, partition, ordinal, fingerprint):
    maps = partition['maps']
    reverse_vertices = {old: new for new, old in enumerate(maps['vertices'])}
    reverse_faces = {old: new for new, old in enumerate(maps['faces'])}
    leaf = {
        'id': _uuid(fingerprint, 'leaf:' + str(ordinal)),
        'name': model.get('name', 'Ordered product') + ' · partition ' + str(ordinal + 1),
        'dimension': model['dimension'], 'embeddingDimension': model['dimension'],
        'interpretation': 'generalized-complex',
        'vertices': deepcopy([model['vertices'][i] for i in maps['vertices']]),
        'edges': [[reverse_vertices[v] for v in model['edges'][i]] for i in maps['edges']],
        'faces': [[reverse_vertices[v] for v in model['faces'][i]] for i in maps['faces']],
        'cells': [[reverse_faces[f] for f in model['cells'][i]] for i in maps['cells']],
        'numeric': deepcopy(model['numeric']),
        'metadata': {'orderedProductLeaf': {
            'schemaVersion': 1, 'algorithmVersion': VERSION,
            'generatedSourceModelId': model['id'], 'generatedSourceFingerprint': fingerprint,
            'partitionId': partition['id'], 'sourceFaceIds': deepcopy(partition['sourceFaceIds']),
            'sourceComponentIds': deepcopy(partition['sourceComponentIds']),
            'sourceFactorInputs': deepcopy(info['inputs']), 'sourceFactorModels': deepcopy(info['sourceModels']),
            'generatedSourceMaps': deepcopy(maps),
            'factorMaps': {kind: deepcopy([info['maps'][kind][i] for i in maps[kind]]) for kind in KINDS},
            'definition': 'Complete generated product leaf; source factors are historical provenance, not the leaf geometry.'}},
        'provenance': {'operation': 'product-partition-snapshot', 'algorithmVersion': VERSION,
                       'sourceModelId': model['id'], 'sourceFingerprint': fingerprint,
                       'partitionId': partition['id'], 'sourceMaps': deepcopy(maps)}}
    if 'offColors' in model.get('metadata', {}):
        leaf['metadata']['offColors'] = {
            kind: deepcopy([_colors(model, kind)[i] for i in maps[kind]])
            for kind in ('faces', 'cells')}
    leaf['fingerprint'] = identity(leaf)
    leaf['validation'] = validate(leaf)
    if not leaf['validation']['passed']:
        _fail('a complete product leaf fails numeric/incidence validation.')
    _check_source(leaf)
    return leaf


def attach_product_components(generated_model):
    """Return an independent attachment preserving all original incidence.

    Only generated geometry with verified ordered-product snapshots/maps is
    accepted. IDs and paths are deterministic for the same geometry. Resource
    refusal happens before publication; caller dictionaries remain untouched.
    """
    try:
        info, fingerprint, partitions = _checked_product(generated_model)
        # Bound duplicated full-factor provenance before allocating leaf trees.
        factor_bytes = _payload_size(info['sourceModels'])
        if factor_bytes * len(partitions) > MAX_LEAF_SNAPSHOT_BYTES:
            _fail('duplicated factor snapshot resource limit exceeded.')
        leaves = []
        leaf_bytes = 0
        for ordinal, partition in enumerate(partitions):
            leaf = _leaf(generated_model, info, partition, ordinal, fingerprint)
            leaf_bytes += _payload_size(leaf)
            if leaf_bytes > MAX_LEAF_SNAPSHOT_BYTES:
                _fail('aggregate full leaf snapshot resource limit exceeded.')
            leaves.append(leaf)
        result = deepcopy(generated_model)
        result_info = result['metadata']['orderedProduct']
        records = []
        work_bytes = leaf_bytes

        def tree(start, end):
            nonlocal work_bytes
            if end - start == 1:
                return leaves[start]
            middle = (start + end) // 2
            left, right = tree(start, middle), tree(middle, end)
            if _payload_size(left) + _payload_size(right) + work_bytes > MAX_TREE_WORK_BYTES:
                _fail('binary historical source tree resource limit exceeded.')
            node = add_models(left, right)
            node['id'] = _uuid(fingerprint, f'tree:{start}:{end}')
            for ordinal, component in zip(range(start, end), node['components']):
                component['id'] = _uuid(fingerprint, 'component:' + str(ordinal))
            work_bytes += _payload_size(node)
            if work_bytes > MAX_TREE_WORK_BYTES:
                _fail('binary historical source tree resource limit exceeded.')
            return node

        if len(leaves) == 1:
            # A single complete product is already a genuine dimensional leaf.
            # Empty sourcePath intentionally resolves the current root, as in
            # the existing compound leaf schema; no empty fake sibling exists.
            leaves[0]['id'] = result['id']
            records = [{'id': _uuid(fingerprint, 'component:0'), 'name': leaves[0]['name'],
                        'sourceModelId': result['id'], 'sourceFingerprint': fingerprint,
                        'sourceComponentId': None, 'sourcePath': [],
                        'maps': deepcopy(partitions[0]['maps'])}]
        else:
            root = tree(0, len(leaves))
            # Tree concatenation order is unrelated to the original interleaved
            # product IDs. Remap root ownership and historical input maps using
            # incidence IDs, never coordinate equality (coincident leaves stay
            # distinct). Nested snapshots keep their local ID spaces unchanged.
            permutation = {kind: [old for part in partitions for old in part['maps'][kind]] for kind in KINDS}
            records = deepcopy(root['components'])
            for record in records:
                record['maps'] = {kind: [permutation[kind][old] for old in record['maps'][kind]] for kind in KINDS}
            compound = deepcopy(root['metadata']['compound'])
            for historical_input in compound['inputs']:
                historical_input['maps'] = {kind: [permutation[kind][old] for old in historical_input['maps'][kind]] for kind in KINDS}
            result['metadata']['compound'] = compound
        result['components'] = records
        result_info['recoverableCompoundComponents'] = True
        result_info['componentDefinition'] = 'Current component IDs recover full dimensional product leaves through historical binary source paths.'
        result['metadata']['productComponents'] = {
            'schemaVersion': 1, 'algorithmVersion': VERSION,
            'generatedSourceModelId': result['id'], 'generatedSourceFingerprint': fingerprint,
            'partitionComponents': [{'partitionId': part['id'], 'componentId': record['id'],
                                     'leafSourceModelId': record['sourceModelId'],
                                     'leafSourceFingerprint': record['sourceFingerprint'],
                                     'sourcePath': list(record['sourcePath'])}
                                    for part, record in zip(partitions, records)],
            'definition': 'Ownership attachment only; all supplied current coordinates, incidence, colors and IDs are unchanged.',
            'evidenceScope': 'generated source only; partition attachment evidence applies while the source fingerprint matches.'}
        if len(leaves) == 1:
            result['metadata']['productComponents']['directLeafSource'] = deepcopy(leaves[0])
        _component_records(result)
        result['validation'] = validate(result)
        if not result['validation']['passed'] or identity(result) != fingerprint:
            _fail('attachment changed geometry identity or incidence validity.')
        for record, leaf in zip(records, leaves):
            if identity(extract_component(result, record['id'])) != leaf['fingerprint']:
                _fail('historical source paths do not recover the full dimensional leaves.')
        if _payload_size(result) > MAX_PAYLOAD_BYTES:
            _fail('attached model payload resource limit exceeded.')
        return result
    except GeometryError:
        raise
    except (KeyError, TypeError, ValueError, IndexError, ArithmeticError, RecursionError) as exc:
        raise GeometryError('Product components: malformed generated provenance or source maps.') from exc
