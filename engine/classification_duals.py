"""Finite generated U-dual identities, rechecked against retained source receipts."""

from copy import deepcopy
import uuid
from .geometry import GeometryError, identity, validate
from .classification_qualification import manifest, source_pins_current, binding, qualify_dual


def generated_dual_catalog():
    return [
        {
            'key': r['generatedKey'],
            'name': r['name'] + ' (generated)',
            'dimension': 3,
            'family': 'Generated uniform duals',
            'counts': r['receipt']['generated']['counts'],
            'aliases': [r['id'], 'dual of U' + r['id'].split('U')[-1]],
            'source': 'Generated incidence dual; not a supplied source',
            'numericContract': 'Float64 plane reciprocation; no exact certificate',
            'dualOf': r['sourceKey'],
            'classificationReceipt': r['id'],
        }
        for r in manifest('3d')['entries']
        if r['kind'] == 'dual' and r['receipt']['status'] == 'numerical-pass'
    ]


def load_generated_dual(key):
    value = manifest('3d')
    row = next((r for r in value['entries'] if r.get('generatedKey') == key), None)
    if row is None or row['receipt']['status'] != 'numerical-pass':
        raise GeometryError('No qualified finite generated dual for that identity.')
    if not source_pins_current(value):
        raise GeometryError('Generated dual provider pins changed; regenerate qualification receipts.')
    from .generators import regular
    from .incidence_dual import incidence_dual

    source = regular(row['sourceKey'])
    if binding(source) != row['receipt']['source']:
        raise GeometryError('Generated dual source no longer matches the retained qualification receipt.')
    result = incidence_dual(source)
    evidence = qualify_dual(source, result)
    if binding(result) != row['receipt']['generated']:
        raise GeometryError('Generated dual changed since qualification; no identity substituted.')
    result['name'] = row['name'] + ' (generated)'
    result['metadata'].update(
        {
            'key': key,
            'family': 'Generated uniform duals',
            'dualOf': row['sourceKey'],
            'generatedIdentity': {
                'id': row['id'],
                'source': binding(source),
                'relationship': evidence,
                'origin': 'generated',
                'suppliedSource': False,
                'releaseQualified': False,
                'certified': False,
                'sourceChirality': deepcopy(row['receipt']['sourceSymmetry']),
            },
        }
    )
    result['fingerprint'] = identity(result)
    result['id'] = str(uuid.uuid5(uuid.NAMESPACE_URL, 'polytope:generated-dual:' + result['fingerprint']))
    result['validation'] = validate(result)
    return result
