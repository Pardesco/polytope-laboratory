"""Genuine 3D podium leaves, preserving literal global incidence and factors."""
from copy import deepcopy
import uuid

from .antiprisms import _snapshot_hash
from .antiprism_components import _numeric_schema
from .compounds import (KINDS, MAX_COMPONENTS, MAX_PAYLOAD_BYTES, _check_source,
                        _colors, _component_records, _payload_size, add_models,
                        extract_component)
from .geometry import GeometryError, identity, validate
from .history import _json_bytes, canonical_model
from .podia import rational_podium, rational_antipodium, VERSION as PODIA_VERSION
from .product_components import _same_schema

VERSION = '0.1.0'
MAX_PODIA_VERTICES = 4000
MAX_LEAF_SNAPSHOT_BYTES = 16*1024*1024
MAX_TREE_WORK_BYTES = 128*1024*1024
NAMESPACE = uuid.UUID('db6c9e49-51a8-46af-acb7-35cb94d8cc86')


def _fail(message):
    raise GeometryError('Podia components: '+message)


def _uuid(fingerprint, role):
    return str(uuid.uuid5(NAMESPACE, fingerprint+':'+role))


def _without_random_uuids(value):
    """Regenerated complete polygon histories have fresh, legitimate UUIDs.

    All references and geometric hashes are checked independently; replace UUID
    strings only for comparing the full expected generated factor attributes.
    """
    if type(value) is dict:
        return {k:_without_random_uuids(v) for k,v in value.items()}
    if type(value) is list:
        return [_without_random_uuids(v) for v in value]
    if type(value) is str:
        try:
            uuid.UUID(value)
            return '<generated-uuid>'
        except ValueError:
            pass
    return value


def _generated_schema(actual,expected):
    """Continuous generated floats admit JSON integers; discrete IDs do not."""
    if type(expected) is float:
        return type(actual) in (int,float) and actual==expected
    if type(expected) is dict:
        return type(actual) is dict and actual.keys()==expected.keys() and all(
            _generated_schema(actual[key],value) for key,value in expected.items())
    if type(expected) is list:
        return type(actual) is list and len(actual)==len(expected) and all(
            _generated_schema(left,right) for left,right in zip(actual,expected))
    return type(actual) is type(expected) and actual==expected


def _factor_history(source):
    """Check actual UUID references before UUID-insensitive regeneration."""
    pending=[source]
    while pending:
        node=pending.pop()
        _check_source(node)
        uuid.UUID(node['id'])
        if node.get('fingerprint')!=identity(node):
            _fail('historical factor geometry fingerprint is stale.')
        polygon=node['metadata'].get('regularStarPolygon')
        if polygon is not None and (polygon.get('sourceModelId')!=node['id'] or polygon.get('sourceFingerprint')!=identity(node)):
            _fail('historical polygon source binding is stale.')
        compound=node['metadata'].get('compound')
        if compound is not None:
            children=compound.get('sourceModels');inputs=compound.get('inputs')
            if type(children) is not list or len(children)!=2 or type(inputs) is not list or len(inputs)!=2:
                _fail('historical factor binary snapshots are malformed.')
            pending.extend(children)
            for child,record in zip(children,inputs):
                if record.get('sourceModelId')!=child.get('id') or record.get('sourceFingerprint')!=identity(child):
                    _fail('historical factor input references are stale.')
                maps=record['maps']
                if not _numeric_schema([node['vertices'][i] for i in maps['vertices']],child['vertices']):
                    _fail('historical factor input coordinates do not match their maps.')
                for kind in ('edges','faces','cells'):
                    lower='faces' if kind=='cells' else 'vertices'
                    if not _same_schema([node[kind][i] for i in maps[kind]],[[maps[lower][v] for v in row] for row in child[kind]]):
                        _fail('historical factor input incidence does not match its maps.')
        for record in node.get('components',[]):
            uuid.UUID(record['id'])
            leaf=node
            for index in record['sourcePath']:
                leaf=leaf['metadata']['compound']['sourceModels'][index]
            if record['sourceModelId']!=leaf.get('id') or record['sourceFingerprint']!=identity(leaf):
                _fail('historical factor leaf references are stale.')
            if record['sourcePath']:
                child=node['metadata']['compound']['sourceModels'][record['sourcePath'][0]]
                child_record=next((c for c in child.get('components',[]) if c['sourcePath']==record['sourcePath'][1:]),None)
                if record.get('sourceComponentId')!=(child_record['id'] if child_record else None):
                    _fail('historical factor component references are stale.')


def _checked(model):
    _json_bytes(model,MAX_PAYLOAD_BYTES)
    _check_source(model)
    if model.get('dimension')!=3 or model.get('embeddingDimension')!=3 or model.get('interpretation')!='generalized-complex':
        _fail('requires an intrinsic generated generalized 3D podium boundary.')
    if len(model['vertices'])>MAX_PODIA_VERTICES:
        _fail('generated vertex resource limit exceeded.')
    if 'components' in model or 'compound' in model.get('metadata',{}) or 'podiaComponents' in model.get('metadata',{}):
        _fail('generated model already has compound ownership.')
    provenance=model.get('provenance')
    if type(provenance) is not dict or provenance.get('algorithmVersion')!=PODIA_VERSION:
        _fail('original generator provenance/version is unavailable.')
    operation=provenance.get('operation')
    if operation=='rational-podium':
        constructor,schema=rational_podium,'rationalPodium'
    elif operation=='rational-antipodium':
        constructor,schema=rational_antipodium,'rationalAntipodium'
    else:
        _fail('only the literal podium/antipodium kernels are supported.')
    if ('rationalAntipodium' if schema=='rationalPodium' else 'rationalPodium') in model['metadata']:
        _fail('conflicting construction schemas are unsupported.')
    info=model['metadata'].get(schema)
    if type(info) is not dict or type(info.get('schemaVersion')) is not int or info['schemaVersion']!=1 or info.get('algorithmVersion')!=PODIA_VERSION:
        _fail('construction schema/version is unavailable.')
    fingerprint=identity(model)
    if model.get('fingerprint')!=fingerprint or info.get('resultSourceFingerprint')!=fingerprint or info.get('resultSourceModelId')!=model.get('id'):
        _fail('generated source ID or geometry fingerprint is stale.')
    if type(model.get('id')) is not str:
        _fail('generated source ID must be a UUID.')
    uuid.UUID(model['id'])
    parameters=provenance.get('parameters')
    if type(parameters) is not dict:
        _fail('original sizing parameters are unavailable.')
    expected=constructor(**parameters)
    wanted=expected['metadata'][schema]
    if not _generated_schema(model.get('numeric'),expected['numeric']) or any(
            key in model for key in ('measure','facetEquations','facetVertices','rationalFacetEquations','certificate','convexPieces')):
        _fail('raw numeric evidence or unsupported mathematical caches are malformed.')
    if any(not _same_schema(model[kind],expected[kind]) for kind in ('edges','faces','cells')) or not _numeric_schema(model['vertices'],expected['vertices']):
        _fail('current ordered geometry differs from the literal sizing construction.')
    native_provenance=dict(provenance)
    if 'generator' in native_provenance:
        generator=native_provenance.pop('generator')
        if type(generator) is not dict or set(generator)!={'kind','parameters'} or generator['kind']!=operation or type(generator['parameters']) is not dict:
            _fail('optional generator record must retain the matching kind and original parameter object only.')
        regenerated=constructor(**generator['parameters'])
        if (not _numeric_schema(regenerated['provenance']['parameters'],expected['provenance']['parameters'])
                or canonical_model(regenerated)!=canonical_model(expected)
                or not _generated_schema(regenerated['numeric'],expected['numeric'])):
            _fail('original generator parameters differ from the retained raw sizing construction.')
    if not _numeric_schema(native_provenance,expected['provenance']):
        _fail('original sizing provenance is malformed or stale.')
    sources=info.get('sourceModels')
    if type(sources) is not list or len(sources)!=2:
        _fail('two complete original polygon snapshots are required.')
    bindings=[]
    for layer,(source,reference) in enumerate(zip(sources,wanted['sourceModels'])):
        _json_bytes(source,MAX_PAYLOAD_BYTES);_check_source(source)
        _factor_history(source)
        if type(source.get('id')) is not str:
            _fail('factor source IDs must be UUIDs.')
        uuid.UUID(source['id'])
        polygon=source.get('metadata',{}).get('regularStarPolygon')
        if type(polygon) is not dict or polygon.get('sourceModelId')!=source['id'] or polygon.get('sourceFingerprint')!=identity(source):
            _fail('historical polygon source binding is stale.')
        if not _numeric_schema(_colors(source,'faces'),_colors(reference,'faces')):
            _fail('historical cap attributes differ from the original sizing parameters.')
        for kind in ('edges','faces','cells'):
            if not _same_schema(source[kind],reference[kind]):
                _fail('factor ordered incidence differs from the original signed polygon.')
        if not _generated_schema(_without_random_uuids(source),_without_random_uuids(reference)):
            _fail('full polygon attributes or sizing evidence differ from the original factors.')
        bindings.append({'sourceModelId':source['id'],'sourceFingerprint':identity(source),'sourceSnapshotSha256':_snapshot_hash(source)})
        # Retain actual historical UUIDs, not the fresh regeneration's UUIDs.
        wanted['sourceModels'][layer]=source
        for i,part in enumerate(wanted['componentPartitions']):
            part['sourceComponentIds'][layer]=source.get('components',[{}]*len(source['faces']))[i].get('id')
    wanted['inputs']=bindings
    wanted['resultSourceModelId']=model['id']
    for key in ('maps','sourceMaps','componentPartitions','orderedSourceCycles','n','d'):
        if not _same_schema(info.get(key),wanted[key]):
            _fail('ordered source/partition maps or literal IDs are malformed or stale.')
    if not _numeric_schema(info,wanted):
        _fail('sizing, source binding or complete construction evidence is malformed or stale.')
    partitions=info['componentPartitions']
    if not 1<=len(partitions)<=MAX_COMPONENTS:
        _fail('partition resource limit exceeded.')
    return schema,info,fingerprint,partitions


def _leaf(model,schema,info,partition,ordinal,fingerprint):
    maps=partition['maps']
    reverse={old:new for new,old in enumerate(maps['vertices'])}
    leaf={'id':_uuid(fingerprint,'leaf:'+str(ordinal)),
          'name':model.get('name','Podium')+' · partition '+str(ordinal+1),
          'dimension':3,'embeddingDimension':3,'interpretation':'generalized-complex',
          'vertices':deepcopy([model['vertices'][i] for i in maps['vertices']]),
          'edges':[[reverse[v] for v in model['edges'][i]] for i in maps['edges']],
          'faces':[[reverse[v] for v in model['faces'][i]] for i in maps['faces']],'cells':[],
          'numeric':deepcopy(model['numeric']),
          'metadata':{'family':model['metadata'].get('family'),'podiaLeaf':{
              'schemaVersion':1,'algorithmVersion':VERSION,'constructionSchema':schema,
              'generatedSourceModelId':model['id'],'generatedSourceFingerprint':fingerprint,
              'partitionId':partition['id'],'sourcePartition':deepcopy(partition),
              'sourceFactorModels':deepcopy(info['sourceModels']),'sourceFactorInputs':deepcopy(info['inputs']),
              'sourceEmbedding':deepcopy(info['sourceEmbedding']),
              'generatedSourceMaps':deepcopy(maps),
              'constructionMaps':{kind:deepcopy([info['maps'][kind][i] for i in maps[kind]]) for kind in KINDS},
              'constructionProvenance':deepcopy(model['provenance']),
              'generatedSourceAttributes':{key:deepcopy(value) for key,value in model['metadata'].items() if key not in (schema,'offColors')},
              'definition':'Complete current 3D leaf; the two original 2D factors are provenance only.'}},
          'provenance':{'operation':'podia-partition-snapshot','algorithmVersion':VERSION,
                        'sourceModelId':model['id'],'sourceFingerprint':fingerprint,
                        'partitionId':partition['id'],'sourceMaps':deepcopy(maps)}}
    if 'offColors' in model['metadata']:
        leaf['metadata']['offColors']={kind:deepcopy([_colors(model,kind)[i] for i in maps[kind]]) for kind in ('faces','cells')}
    leaf['fingerprint']=identity(leaf);leaf['validation']=validate(leaf)
    if not leaf['validation']['passed']:
        _fail('complete dimensional leaf fails numeric/incidence validation.')
    _check_source(leaf)
    return leaf


def attach_podia_components(generated_model):
    """Return a detached verified attachment; preserve source geometry exactly.

    Current face RGB/RGBA and unrelated current metadata can be independently
    edited. Generated geometry, both factor histories and sizing/maps must still
    match the original versioned kernel. Existing ownership cannot be attached
    twice. Resource/provenance refusal is atomic and never mutates input.
    """
    try:
        schema,info,fingerprint,partitions=_checked(generated_model)
        if _payload_size(info['sourceModels'])*len(partitions)>MAX_LEAF_SNAPSHOT_BYTES:
            _fail('duplicated two-factor snapshot resource limit exceeded.')
        leaves=[];leaf_bytes=0
        for ordinal,partition in enumerate(partitions):
            leaf=_leaf(generated_model,schema,info,partition,ordinal,fingerprint)
            leaf_bytes+=_payload_size(leaf)
            if leaf_bytes>MAX_LEAF_SNAPSHOT_BYTES:
                _fail('aggregate leaf snapshot resource limit exceeded.')
            leaves.append(leaf)
        result=deepcopy(generated_model);work_bytes=leaf_bytes

        def tree(start,end):
            nonlocal work_bytes
            if end-start==1:return leaves[start]
            middle=(start+end)//2;left,right=tree(start,middle),tree(middle,end)
            if _payload_size(left)+_payload_size(right)+work_bytes>MAX_TREE_WORK_BYTES:
                _fail('binary historical source tree resource limit exceeded.')
            node=add_models(left,right);node['id']=_uuid(fingerprint,f'tree:{start}:{end}')
            for ordinal,component in zip(range(start,end),node['components']):
                component['id']=_uuid(fingerprint,'component:'+str(ordinal))
            work_bytes+=_payload_size(node)
            if work_bytes>MAX_TREE_WORK_BYTES:
                _fail('binary historical source tree resource limit exceeded.')
            return node

        if len(leaves)==1:
            leaves[0]['id']=result['id']
            records=[{'id':_uuid(fingerprint,'component:0'),'name':leaves[0]['name'],
                      'sourceModelId':result['id'],'sourceFingerprint':fingerprint,
                      'sourceComponentId':None,'sourcePath':[],'maps':deepcopy(partitions[0]['maps'])}]
        else:
            root=tree(0,len(leaves))
            permutation={kind:[old for part in partitions for old in part['maps'][kind]] for kind in KINDS}
            records=deepcopy(root['components'])
            for record in records:
                record['maps']={kind:[permutation[kind][old] for old in record['maps'][kind]] for kind in KINDS}
            compound=deepcopy(root['metadata']['compound'])
            for historical in compound['inputs']:
                historical['maps']={kind:[permutation[kind][old] for old in historical['maps'][kind]] for kind in KINDS}
            result['metadata']['compound']=compound
        result['components']=records
        result['metadata'][schema]['recoverableCompoundComponents']=True
        result['metadata'][schema]['componentDefinition']='Current IDs recover full 3D podium leaves through historical binary source paths.'
        result['metadata']['podiaComponents']={
            'schemaVersion':1,'algorithmVersion':VERSION,'constructionSchema':schema,
            'generatedSourceModelId':result['id'],'generatedSourceFingerprint':fingerprint,
            'partitionComponents':[{'partitionId':part['id'],'componentId':record['id'],
                'sourceComponentIds':deepcopy(part['sourceComponentIds']),
                'leafSourceModelId':record['sourceModelId'],'leafSourceFingerprint':record['sourceFingerprint'],
                'sourcePath':list(record['sourcePath'])} for part,record in zip(partitions,records)],
            'definition':'Ownership only; original coordinates, ordered incidence, global IDs, current colors and both factors are unchanged.',
            'evidenceScope':'generated source only; verify generatedSourceFingerprint before interpreting attachment maps.'}
        if len(leaves)==1:
            result['metadata']['podiaComponents']['directLeafSource']=deepcopy(leaves[0])
        _component_records(result);result['validation']=validate(result)
        if not result['validation']['passed'] or identity(result)!=fingerprint:
            _fail('attachment changed geometry identity or validity.')
        for record,leaf in zip(records,leaves):
            if identity(extract_component(result,record['id']))!=leaf['fingerprint']:
                _fail('historical source paths do not recover complete 3D leaves.')
        _json_bytes(result,MAX_PAYLOAD_BYTES)
        return result
    except GeometryError:
        raise
    except (KeyError,TypeError,ValueError,IndexError,ArithmeticError,AttributeError,RecursionError,UnicodeError) as exc:
        raise GeometryError('Podia components: malformed source provenance or ordered maps.') from exc


def attach_podium_components(model):
    if type(model) is not dict or type(model.get('provenance')) is not dict or model['provenance'].get('operation')!='rational-podium':
        _fail('podium attachment requires the rational-podium kernel.')
    return attach_podia_components(model)


def attach_antipodium_components(model):
    if type(model) is not dict or type(model.get('provenance')) is not dict or model['provenance'].get('operation')!='rational-antipodium':
        _fail('antipodium attachment requires the rational-antipodium kernel.')
    return attach_podia_components(model)
