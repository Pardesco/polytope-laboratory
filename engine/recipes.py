"""Atomic document recipes and replay, with no filesystem dispatch."""
import copy
import uuid

from .geometry import GeometryError
from .history import (REPLAY_OPERATIONS, create_history, record_source,
                      append_operation, validate_document_history, replay_history)
from .formats import validate_project
from .augmentation_workflow import run_attachment, replay_attachment_document, branch_attachment
from .triangular_geodesic_workflow import run_geodesic, replay_geodesic_document, branch_geodesic
from .convex_core_workflow import run_convex_core, replay_convex_core_document, branch_convex_core
from .face_placement_workflow import run_placement, replay_placement_document, branch_placement
from .convex_core4d_workflow import run_convex_core4d, replay_convex_core4d_document, branch_convex_core4d

from .source_zonohedron_workflow import run_source_zonohedron, replay_source_zonohedron_document, branch_source_zonohedron
from .cell_attributes import run_cell, replay_cell_document, branch_cell
from .spring_workflow import run_spring, replay_spring_document, branch_spring
from .automatic_faceting_workflow import run_faceting, replay_faceting_document, branch_faceting

RECORD_OPERATIONS = REPLAY_OPERATIONS | {'rational-dual'}


def checked_document(document):
    detached = copy.deepcopy(document)
    validate_project({'format':'polytope-laboratory', 'version':1,
                      'active':0, 'documents':[detached]})
    return detached


def run_recipe(document, operation, parameters, dispatcher, label=None):
    if operation not in RECORD_OPERATIONS:
        raise GeometryError('Operation is unavailable for document recipes.')
    if type(parameters) is not dict:
        raise GeometryError('Recipe parameters require a JSON object.')
    if operation == 'projective-incidence-dual':
        from .projective_dual_workflow import run_projective
        return run_projective(document, parameters, label or 'Projective reciprocal view')
    if operation == 'element-content':
        from .element_content_workflow import run_content
        return run_content(document, parameters, label or 'Edit element content')
    if operation == 'facet-adopt':
        return run_faceting(document, parameters, label or 'Adopt faceting')
    if operation == 'source-zonohedron':
        return run_source_zonohedron(document, parameters, label or 'Source zonohedron')
    if operation == 'spring-relaxation':
        return run_spring(document, parameters, label or 'Spring relaxation')
    if operation == 'cell':
        return run_cell(document, parameters, label or 'Extract entity')
    if operation == 'place-at-faces':
        return run_placement(document, parameters, label or 'Place at faces (3D)')
    if operation == 'convex-core-4d':
        return run_convex_core4d(document, parameters, label or '4D convex core')
    if operation == 'attach-at-faces':
        return run_attachment(document, parameters, label or 'Attach faces (3D)')
    if operation == 'triangular-geodesic':
        return run_geodesic(document, parameters, label or 'Triangular geodesic')
    if operation == 'convex-core':
        return run_convex_core(document, parameters, label or 'Convex core')
    result = checked_document(document)
    graph = validate_document_history(result)
    if graph is None:
        graph = create_history()
        for state in result['states']:
            node_id = str(uuid.uuid4())
            graph = record_source(graph, node_id, state)
            state['operationNode'] = node_id
    source = result['states'][result['cursor']]
    if operation in ('coincidic-record','coincidic-compound'):
        from .coincidic_regiments import clean_state
        from .history import _source_hash
        parent_node=next(n for n in graph.to_dict()['nodes'] if n['id']==source['operationNode'])
        if _source_hash(clean_state(source))!=_source_hash(clean_state(parent_node['snapshot'])):
            source_id=str(uuid.uuid4())
            graph=record_source(graph,source_id,source,parent=source['operationNode'])
            source['operationNode']=source_id
    response = dispatcher({'op':operation, 'params':copy.deepcopy(parameters),
                           'model':copy.deepcopy(source['model'])})
    model = response.get('model') if operation == 'section' else response
    if type(model) is not dict:
        raise GeometryError('This operation produced no model to commit.')
    view = copy.deepcopy(source['view'])
    for field in ('entitySelection','sectionAlignment','orientationFrame','cellFacingCache'):
        view.pop(field, None)
    view.pop('coincidicComparison', None)
    view.update(cellFacing='all', hiddenCells=[], isolatedCell=None)
    if (model['dimension'], model.get('embeddingDimension', model['dimension'])) != (source['model']['dimension'], source['model'].get('embeddingDimension', source['model']['dimension'])):
        dimension = model['dimension']
        view.update(sectionNormal=[int(i == dimension-1) for i in range(dimension)],
                    sectionOffset=0, entity=0,
                    derivedMode='dual' if dimension < 3 else 'section')
        # These presentations reference the old dimensional source and layouts.
        for field in ('net', 'cellNet', 'foldFraction', 'explosionAmount', 'animation',
                      'camera', 'derivedCamera'):
            view.pop(field, None)
    if view.get('symmetry'): view['symmetry']['generatorIds'] = ''
    if view.get('stellation'): view['stellation']['searchGeneratorIds'] = ''
    if operation == 'section' and parameters.get('section_domain')=='ordinary-cells':
        view.update(derivedMode='face' if model['faces'] else 'section')
        view.pop('dualMorph', None)
    if operation == 'exact-surface-section':
        view.update(derivedMode='face' if model['faces'] else 'section-evidence', sectionNormal=[0,0,1])
        view.pop('dualMorph', None)
    if operation in ('incidence-truncate','sphere-project','incidence-dual','reflect-source'): view.pop('dualMorph', None)
    if operation == 'incidence-dual': view['derivedMode'] = 'incidence-dual'
    node_id = str(uuid.uuid4())
    state = {'model':model, 'view':view, 'label':label or operation,
             'notes':source.get('notes',''), 'operationNode':node_id}
    if operation in ('coincidic-record','coincidic-compound'):
        from .coincidic_regiments import compose_state
        state = {**compose_state(source, parameters, model, operation=='coincidic-compound'), 'label':label or operation, 'operationNode':node_id}
    elif 'elementAnnotations' in source['view'] or 'elementContentDetached' in source['view']:
        from .element_content_ownership import transfer_content_state
        state = transfer_content_state(source, state, operation)
    graph = append_operation(graph, source['operationNode'], source,
                             operation, parameters, state, node_id)
    # Retain graph branches even when the linear undo cursor starts a new branch.
    result['states'] = (result['states'][:result['cursor']+1] + [state])[-200:]
    result['cursor'] = len(result['states'])-1
    result['operationHistory'] = graph.to_dict()
    return checked_document(result)


def replay_document(document, dispatcher, target=None):
    if target is not None and (type(target) is not str or not 1 <= len(target) <= 128):
        raise GeometryError('History replay target must be a nonempty node ID of at most128 characters.')
    source = checked_document(document)
    graph = validate_document_history(source)
    if graph is None:
        raise GeometryError('Legacy snapshots have no recorded operations to replay.')
    if any(node['op'] == 'facet-adopt' for node in graph.to_dict()['nodes']):
        return replay_faceting_document(source, target=target, dispatcher=dispatcher)
    if any(node['op'] == 'source-zonohedron' for node in graph.to_dict()['nodes']):
        return replay_source_zonohedron_document(source, target=target, dispatcher=dispatcher)
    if any(node['op'] == 'spring-relaxation' for node in graph.to_dict()['nodes']):
        return replay_spring_document(source, target=target, dispatcher=dispatcher)
    if any(node['op'] == 'cell' and node['algorithmVersion'] == '0.2.0' for node in graph.to_dict()['nodes']):
        return replay_cell_document(source, target=target, dispatcher=dispatcher)
    if any(node['op'] == 'place-at-faces' for node in graph.to_dict()['nodes']):
        return replay_placement_document(source, target=target, dispatcher=dispatcher)
    if any(node['op'] == 'convex-core-4d' for node in graph.to_dict()['nodes']):
        return replay_convex_core4d_document(source, target=target, dispatcher=dispatcher)
    if any(node['op'] == 'triangular-geodesic' for node in graph.to_dict()['nodes']):
        return replay_geodesic_document(source, target=target, dispatcher=dispatcher)
    if any(node['op'] == 'convex-core' for node in graph.to_dict()['nodes']):
        return replay_convex_core_document(source, target=target, dispatcher=dispatcher)
    if any(node['op'] == 'attach-at-faces' for node in graph.to_dict()['nodes']):
        return replay_attachment_document(source, target=target, dispatcher=dispatcher)
    target = target or source['states'][source['cursor']]['operationNode']
    states = replay_history(graph, dispatcher, target=target)
    # Project validation regenerates measures, certificates and layout caches.
    state = states[target]
    state['operationNode'] = target
    result = {'id':str(uuid.uuid4()), 'cursor':0, 'states':[state],
              'operationHistory':graph.to_dict()}
    return checked_document(result)


def branch_recipe(document, parameters, dispatcher, target=None):
    if target is not None and (type(target) is not str or not 1 <= len(target) <= 128):
        raise GeometryError('History branch target must be a nonempty node ID of at most128 characters.')
    source = checked_document(document)
    graph = validate_document_history(source)
    if graph is None:
        raise GeometryError('Legacy snapshots have no recorded parameters to branch.')
    target = target or source['states'][source['cursor']]['operationNode']
    node = next((n for n in graph.to_dict()['nodes'] if n['id']==target), None)
    if node is None or node['op'] not in REPLAY_OPERATIONS:
        raise GeometryError('Select a replayable operation to branch its parameters.')
    if node['op'] == 'facet-adopt':
        return branch_faceting(source, parameters, target=target, dispatcher=dispatcher)
    if node['op'] == 'source-zonohedron':
        return branch_source_zonohedron(source, parameters, target=target, dispatcher=dispatcher)
    if node['op'] == 'spring-relaxation':
        return branch_spring(source, parameters, target=target, dispatcher=dispatcher)
    if node['op'] == 'cell':
        return branch_cell(source, parameters, target=target, dispatcher=dispatcher)
    if node['op'] == 'place-at-faces':
        return branch_placement(source, parameters, target=target, dispatcher=dispatcher)
    if node['op'] == 'convex-core-4d':
        return branch_convex_core4d(source, parameters, target=target, dispatcher=dispatcher)
    if node['op'] == 'attach-at-faces':
        return branch_attachment(source, parameters, target=target, dispatcher=dispatcher)
    if node['op'] == 'triangular-geodesic':
        return branch_geodesic(source, parameters, target=target, dispatcher=dispatcher)
    if node['op'] == 'convex-core':
        return branch_convex_core(source, parameters, target=target, dispatcher=dispatcher)
    parent = replay_document(source, dispatcher, node['parent'])
    return run_recipe(parent, node['op'], parameters, dispatcher,
                      'Parameter branch: '+node['op'])
