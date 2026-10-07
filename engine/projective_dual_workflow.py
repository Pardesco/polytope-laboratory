"""Persist source-owned reciprocal view recipes without changing model geometry."""
from copy import deepcopy
import uuid,math,re
from .geometry import GeometryError
from .projective_incidence_dual import VERSION,OPERATION,projective_dual,settings,context,source_binding,digest

def source_context(state):
    return {'notes':state.get('notes',''),'unit':state['view'].get('coordinateUnit',state['model'].get('metadata',{}).get('coordinateUnits','model')),'documentMetadata':state['view'].get('documentMetadata')}

def validate_saved_projective(model,view):
    config=view.get('projectiveDual')
    if config is None:return
    if type(config) is not dict or set(config)!={'version','settings','binding','sourceContext'} or type(config['version']) is not int or config['version']!=1:
        raise GeometryError('Saved projective reciprocal requires its versioned source-bound settings.')
    if settings(config['settings'])!=config['settings']:raise GeometryError('Saved projective settings are not normalized.')
    ctx=context(config['sourceContext'])
    binding=config['binding']
    if type(binding) is not dict or set(binding)!={'sourceModelId','sourceFingerprint','sourceSnapshotSha256','sourceContextSha256'} or type(binding['sourceModelId']) is not str or len(binding['sourceModelId'])>512 or any(type(binding[k]) is not str or not re.fullmatch('[0-9a-f]{64}',binding[k]) for k in ('sourceFingerprint','sourceSnapshotSha256','sourceContextSha256')) or binding['sourceContextSha256']!=digest(ctx):
        raise GeometryError('Saved projective reciprocal has malformed source ownership.')
    # Bound records remain readable after source edits. Publication recomputes
    # the complete current binding and refuses stale ownership, never retargets.
    camera=view.get('projectiveDualCamera')
    if camera is not None:
        if type(camera) is not dict or set(camera)!={'position','target','up','zoom'} or any(type(camera[k]) is not list or len(camera[k])!=3 or any(type(x) not in (int,float) or not math.isfinite(x) or abs(x)>1e12 for x in camera[k]) for k in ('position','target','up')) or type(camera['zoom']) not in (int,float) or not 1e-6<=camera['zoom']<=1e6 or sum(x*x for x in camera['up'])<=1e-20:
            raise GeometryError('Saved projective reciprocal camera is invalid.')

def apply_projective_state(source,parameters):
    params=deepcopy(parameters)
    if type(params) is not dict or set(params)-{'version','center','radius','clipBound','sourceContext'}:
        raise GeometryError('Projective view recipe accepts only reciprocal settings and bound source context.')
    supplied=params.pop('sourceContext',None);ctx=context(source_context(source))
    if supplied is not None and context(supplied)!=ctx:raise GeometryError('Projective recipe source notes, units or metadata changed.')
    descriptor=projective_dual(source['model'],params,ctx);state=deepcopy(source)
    state['view']['projectiveDual']={'version':1,'settings':descriptor['settings'],'binding':descriptor['binding'],'sourceContext':ctx}
    return state,{**descriptor['settings'],'sourceContext':ctx}

def run_projective(document,parameters,label='Projective reciprocal view'):
    from .recipes import checked_document
    from .history import create_history,record_source,append_operation,validate_document_history
    result=checked_document(document);graph=validate_document_history(result)
    if graph is None:
        graph=create_history()
        for state in result['states']:
            node=str(uuid.uuid4());graph=record_source(graph,node,state);state['operationNode']=node
    source=result['states'][result['cursor']]
    retained=next(n for n in graph.to_dict()['nodes'] if n['id']==source['operationNode'])['snapshot']
    def owner(s):return [s['model'],source_context(s),s['view'].get('elementAnnotations'),s['view'].get('elementContentDetached')]
    if digest(owner(source))!=digest(owner(retained)):
        node=str(uuid.uuid4());graph=record_source(graph,node,source,parent=source['operationNode']);source['operationNode']=node
    state,params=apply_projective_state(source,parameters);node=str(uuid.uuid4());state.update(label=label,operationNode=node)
    graph=append_operation(graph,source['operationNode'],source,OPERATION,params,state,node)
    result['states']=(result['states'][:result['cursor']+1]+[state])[-200:];result['cursor']=len(result['states'])-1;result['operationHistory']=graph.to_dict()
    return checked_document(result)

def replay_projective_state(parent,node):
    if node['algorithmVersion']!=VERSION:raise GeometryError('Unsupported projective reciprocal recipe version.')
    computed,_=apply_projective_state(parent,node['params']);expected=node['snapshot']
    def owner(state):return [state['model'],source_context(state),state['view'].get('elementAnnotations'),state['view'].get('elementContentDetached')]
    if digest(owner(expected))!=digest(owner(parent)):raise GeometryError('Projective reciprocal replay changed its finite source, attributes, notes, units or content.')
    if digest(computed['view']['projectiveDual'])!=digest(expected['view'].get('projectiveDual')):
        raise GeometryError('Recorded projective reciprocal settings do not reconstruct from their bound source.')
    state=deepcopy(expected);state['model']=deepcopy(parent['model']);state['view']['projectiveDual']=computed['view']['projectiveDual'];return state
