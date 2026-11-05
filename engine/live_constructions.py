"""Read-only previews use the same computations as committed recipes."""
from copy import deepcopy
from .geometry import GeometryError
from .construction_names import construction_name

OPERATIONS = {'truncate', 'incidence-truncate', 'expand-runcinate', 'add-dual', 'conway', 'transform'}


def preview_construction(request, dispatcher):
    params = request.get('params', {})
    if type(params) is not dict or set(params) != {'operation', 'parameters'} or type(params['operation']) is not str or params['operation'] not in OPERATIONS:
        raise GeometryError('Choose a supported live construction and its parameters.')
    operation, controls = params['operation'], params['parameters']
    if type(controls) is not dict:
        raise GeometryError('Live construction parameters require an object.')
    if operation == 'transform' and set(controls) != {'scale'}:
        raise GeometryError('Live transform supports uniform scale only.')
    if operation == 'conway' and controls.get('notation') != 'k':
        raise GeometryError('Live Conway preview supports kis height only.')
    result = dispatcher({'op': operation, 'params': deepcopy(controls), 'model': deepcopy(request.get('model'))})
    name = construction_name(result, result.get('name', 'Construction'))
    return {'model': result, 'name': name, 'approximate': True}
