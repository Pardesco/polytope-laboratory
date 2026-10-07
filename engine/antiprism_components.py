"""Attach genuine current leaves to unedited antiprism/prism constructions.

This ownership adapter preserves all literal coordinates and incidence IDs.
No coordinate welding, hull, convex classification or filled interior is used.
Historical source component IDs remain evidence about the retained source;
current full-dimensional component IDs are deterministic geometry-bound UUIDs.
"""
from copy import deepcopy
import uuid

from .antiprisms import rational_antiprism, _snapshot_hash, VERSION as ANTIPRISM_VERSION
from .prisms import polyhedron_prism, _hash, VERSION as PRISM_VERSION
from .compounds import (KINDS, MAX_COMPONENTS, MAX_PAYLOAD_BYTES, _check_source,
                        _colors, _component_records, _payload_size, add_models,
                        extract_component)
from .geometry import GeometryError, identity, validate
from .history import _json_bytes, canonical_model
from .product_components import _same_schema

VERSION = '0.1.0'
MAX_CONSTRUCTION_VERTICES = 4000
MAX_LEAF_SNAPSHOT_BYTES = 16 * 1024 * 1024
MAX_TREE_WORK_BYTES = 128 * 1024 * 1024
NAMESPACE = uuid.UUID('ddde4f95-b01d-4b6f-ae29-1c39528a1818')


def _fail(message):
    raise GeometryError('Construction components: '+message)


def _uuid(fingerprint,role):
    return str(uuid.uuid5(NAMESPACE,fingerprint+':'+role))


def _numeric_schema(actual,expected):
    """Allow JSON 1/1.0 equivalence for numeric evidence, never bool IDs."""
    if type(expected) in (int,float):
        return type(actual) in (int,float) and actual==expected
    if type(expected) is dict:
        return type(actual) is dict and actual.keys()==expected.keys() and all(
            _numeric_schema(actual[key],value) for key,value in expected.items())
    if type(expected) is list:
        return type(actual) is list and len(actual)==len(expected) and all(
            _numeric_schema(left,right) for left,right in zip(actual,expected))
    return type(actual) is type(expected) and actual==expected


def _binding(model,info):
    fingerprint=identity(model)
    if (not isinstance(model.get('id'),str) or not model['id']
            or model.get('fingerprint')!=fingerprint
            or info.get('resultSourceFingerprint')!=fingerprint
            or info.get('resultSourceModelId')!=model['id']):
        _fail('current model ID or geometry fingerprint is stale.')
    try:uuid.UUID(model['id'])
    except (ValueError,AttributeError) as error:
        raise GeometryError('Construction components: generated source ID must be a UUID.') from error
    return fingerprint


def _checked(model):
    _json_bytes(model,MAX_PAYLOAD_BYTES)
    _check_source(model)
    dimension=model['dimension']
    if dimension not in (3,4) or model.get('embeddingDimension')!=dimension or model.get('interpretation')!='generalized-complex':
        _fail('requires an intrinsic generalized 3D antiprism or 4D closed-shell prism.')
    if len(model['vertices'])>MAX_CONSTRUCTION_VERTICES:
        _fail('construction vertex resource limit exceeded.')
    if 'components' in model or 'compound' in model.get('metadata',{}):
        _fail('generated model already has compound ownership.')
    schema='rationalAntiprism' if dimension==3 else 'polyhedronPrism'
    version=ANTIPRISM_VERSION if dimension==3 else PRISM_VERSION
    info=model['metadata'].get(schema)
    if type(info) is not dict or type(info.get('schemaVersion')) is not int or info['schemaVersion']!=1 or info.get('algorithmVersion')!=version:
        _fail('construction provenance schema/version is unavailable.')
    fingerprint=_binding(model,info)
    source=info.get('sourceModel')
    _json_bytes(source,MAX_PAYLOAD_BYTES);_check_source(source)
    expected_hash=(_snapshot_hash if dimension==3 else _hash)(source)
    if info.get('sourceModelId')!=source.get('id') or info.get('sourceFingerprint')!=identity(source) or info.get('sourceSnapshotSha256')!=expected_hash:
        _fail('full source snapshot identity or attributes hash is stale.')
    provenance=model.get('provenance')
    if type(provenance) is not dict or provenance.get('operation')!=('rational-antiprism' if dimension==3 else 'polyhedron-prism') or provenance.get('algorithmVersion')!=version:
        _fail('original construction provenance is unavailable.')
    parameters=provenance.get('parameters')
    if type(parameters) is not dict:
        _fail('original construction parameters are required.')
    if dimension==3:
        expected=rational_antiprism(**parameters)
        expected_info=expected['metadata'][schema]
        if canonical_model(source)!=canonical_model(expected_info['sourceModel']):
            _fail('preserved polygon geometry differs from the literal raw-step construction.')
        if not _same_schema(info.get('orderedSourceCycles'),source['faces']):
            _fail('historical ordered source cycles are stale.')
        polygon=source.get('metadata',{}).get('regularStarPolygon')
        expected_polygon=expected_info['sourceModel']['metadata']['regularStarPolygon']
        if (type(polygon) is not dict or type(polygon.get('schemaVersion')) is not int
                or polygon['schemaVersion']!=1 or polygon.get('sourceModelId')!=source['id']
                or polygon.get('sourceFingerprint')!=identity(source)):
            _fail('preserved literal polygon source evidence is malformed or stale.')
        for key in ('symbol','n','d','radius','orderedCycles'):
            if not _numeric_schema(polygon.get(key),expected_polygon[key]):
                _fail('preserved polygon symbol/sizing evidence differs from the raw construction.')
        if type(polygon.get('n')) is not int or type(polygon.get('d')) is not int or not _same_schema(polygon.get('orderedCycles'),source['faces']):
            _fail('preserved polygon literal counts/cycles must contain integer IDs.')
        if _colors(source,'faces')!=_colors(expected_info['sourceModel'],'faces'):
            _fail('historical polygon cap colors differ from the retained construction parameters.')
        if not _same_schema(info.get('sideTrianglesEquilateralWithinTolerance'),expected_info['sideTrianglesEquilateralWithinTolerance']):
            _fail('equilateral triangle metric evidence is malformed or stale.')
        # A fresh reconstruction creates fresh polygon UUIDs. Current ownership
        # must instead derive from the actual historical source snapshot.
        actual_components=source.get('components')
        historical_owner={face:component['id'] for component in actual_components or []
                          for face in component['maps']['faces']}
        for i,part in enumerate(expected_info['componentPartitions']):
            part['sourceComponentId']=historical_owner.get(i)
        for key in ('symbol','n','d','upperRotationRadians','radius','height','baseEdgeLength',
                    'sideEdgeLength','horizontalSideChord','baseSizing','sideSizing'):
            actual,wanted=info.get(key),expected_info[key]
            if isinstance(wanted,(int,float)):
                if type(actual) not in (int,float) or actual!=wanted:
                    _fail('raw-step sizing evidence is malformed or stale.')
                if key in ('n','d') and type(actual) is not int:
                    _fail('literal n/d IDs must be integers.')
            elif actual!=wanted:
                _fail('raw-step sizing evidence is malformed or stale.')
    else:
        expected=polyhedron_prism(source,**parameters)
        expected_info=expected['metadata'][schema]
        if not _numeric_schema(info.get('interval'),expected_info['interval']) or not _same_schema(info.get('sourceFaceSideCells'),expected_info['sourceFaceSideCells']):
            _fail('original interval or side-cell evidence is malformed or stale.')
    if any(model[kind]!=expected[kind] for kind in KINDS):
        _fail('current ordered geometry differs from the preserved construction.')
    for key in ('maps','sourceMaps','componentPartitions'):
        if not _same_schema(info.get(key),expected_info[key]):
            _fail('ordered construction/partition maps are malformed or stale.')
    partitions=info['componentPartitions']
    if not 1<=len(partitions)<=MAX_COMPONENTS:
        _fail('construction component resource limit exceeded.')
    return schema,info,source,fingerprint,partitions


def _leaf(model,schema,info,source,partition,ordinal,fingerprint):
    maps=partition['maps']
    vertex_ids={old:new for new,old in enumerate(maps['vertices'])}
    face_ids={old:new for new,old in enumerate(maps['faces'])}
    source_attributes={key:deepcopy(value) for key,value in model['metadata'].items()
                       if key not in (schema,'offColors')}
    leaf={'id':_uuid(fingerprint,'leaf:'+str(ordinal)),
          'name':model.get('name','Construction')+' · partition '+str(ordinal+1),
          'dimension':model['dimension'],'embeddingDimension':model['dimension'],
          'interpretation':'generalized-complex',
          'vertices':deepcopy([model['vertices'][i] for i in maps['vertices']]),
          'edges':[[vertex_ids[v] for v in model['edges'][i]] for i in maps['edges']],
          'faces':[[vertex_ids[v] for v in model['faces'][i]] for i in maps['faces']],
          'cells':[[face_ids[f] for f in model['cells'][i]] for i in maps['cells']],
          'numeric':deepcopy(model['numeric']),
          'metadata':{'constructionLeaf':{
              'schemaVersion':1,'algorithmVersion':VERSION,'constructionSchema':schema,
              'generatedSourceModelId':model['id'],'generatedSourceFingerprint':fingerprint,
              'partitionId':partition['id'],'sourceComponentId':partition.get('sourceComponentId'),
              'sourcePartition':deepcopy(partition),'sourceModel':deepcopy(source),
              'sourceModelId':info['sourceModelId'],'sourceFingerprint':info['sourceFingerprint'],
              'sourceSnapshotSha256':info['sourceSnapshotSha256'],
              'generatedSourceMaps':deepcopy(maps),
              'constructionMaps':{kind:deepcopy([info['maps'][kind][i] for i in maps[kind]]) for kind in KINDS},
              'constructionProvenance':deepcopy(model['provenance']),
              'generatedSourceAttributes':source_attributes,
              'definition':'Complete current dimensional leaf; historical source polygon/shell is provenance, not the extracted geometry.'}},
          'provenance':{'operation':'construction-partition-snapshot','algorithmVersion':VERSION,
                        'sourceModelId':model['id'],'sourceFingerprint':fingerprint,
                        'partitionId':partition['id'],'sourceMaps':deepcopy(maps)}}
    if 'offColors' in model['metadata']:
        leaf['metadata']['offColors']={kind:deepcopy([_colors(model,kind)[i] for i in maps[kind]]) for kind in ('faces','cells')}
    leaf['fingerprint']=identity(leaf);leaf['validation']=validate(leaf)
    if not leaf['validation']['passed']:
        _fail('complete dimensional construction leaf fails numeric/incidence validation.')
    _check_source(leaf)
    return leaf


def attach_construction_components(generated_model):
    """Return bounded, detached genuine leaves without changing geometry IDs.

    Only unedited construction geometry with verified full snapshots/maps is
    accepted. Root faces/cells can have independent valid RGB/RGBA attributes.
    Attach before convex classification; reattachment is an explicit refusal.
    """
    try:
        schema,info,source,fingerprint,partitions=_checked(generated_model)
        if _payload_size(source)*len(partitions)>MAX_LEAF_SNAPSHOT_BYTES:
            _fail('duplicated historical source snapshot resource limit exceeded.')
        leaves=[];leaf_bytes=0
        for ordinal,partition in enumerate(partitions):
            leaf=_leaf(generated_model,schema,info,source,partition,ordinal,fingerprint)
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
                      'sourceComponentId':None,'sourcePath':[],
                      'maps':deepcopy(partitions[0]['maps'])}]
        else:
            root=tree(0,len(leaves))
            permutation={kind:[old for part in partitions for old in part['maps'][kind]] for kind in KINDS}
            records=deepcopy(root['components'])
            for record in records:
                record['maps']={kind:[permutation[kind][old] for old in record['maps'][kind]] for kind in KINDS}
            compound=deepcopy(root['metadata']['compound'])
            for historical_input in compound['inputs']:
                historical_input['maps']={kind:[permutation[kind][old] for old in historical_input['maps'][kind]] for kind in KINDS}
            result['metadata']['compound']=compound
        result['components']=records
        result['metadata'][schema]['recoverableCompoundComponents']=True
        result['metadata'][schema]['componentDefinition']='Current IDs recover full dimensional construction leaves through historical binary source paths.'
        result['metadata']['constructionComponents']={
            'schemaVersion':1,'algorithmVersion':VERSION,'constructionSchema':schema,
            'generatedSourceModelId':result['id'],'generatedSourceFingerprint':fingerprint,
            'partitionComponents':[{'partitionId':part['id'],'componentId':record['id'],
                                    'sourceComponentId':part.get('sourceComponentId'),
                                    'leafSourceModelId':record['sourceModelId'],
                                    'leafSourceFingerprint':record['sourceFingerprint'],
                                    'sourcePath':list(record['sourcePath'])}
                                   for part,record in zip(partitions,records)],
            'definition':'Ownership attachment only; all literal coordinates, ordered incidence, current colors and IDs are unchanged.',
            'evidenceScope':'generated source only; verify generatedSourceFingerprint before interpreting current attachment maps.'}
        if len(leaves)==1:
            result['metadata']['constructionComponents']['directLeafSource']=deepcopy(leaves[0])
        _component_records(result);result['validation']=validate(result)
        if not result['validation']['passed'] or identity(result)!=fingerprint:
            _fail('attachment changed geometry identity or incidence validity.')
        for record,leaf in zip(records,leaves):
            if identity(extract_component(result,record['id']))!=leaf['fingerprint']:
                _fail('historical source paths do not recover complete dimensional leaves.')
        _json_bytes(result,MAX_PAYLOAD_BYTES)
        if _payload_size(result)>MAX_PAYLOAD_BYTES:
            _fail('attached model payload resource limit exceeded.')
        return result
    except GeometryError:
        raise
    except (KeyError,TypeError,ValueError,IndexError,ArithmeticError,AttributeError,RecursionError) as error:
        raise GeometryError('Construction components: malformed source provenance or ordered maps.') from error


def attach_antiprism_components(model):
    """Strict 3D convenience entry point; all attachment guarantees apply."""
    if type(model) is not dict or model.get('dimension')!=3:
        _fail('antiprism attachment requires dimension three.')
    return attach_construction_components(model)


def attach_polyhedron_prism_components(model):
    """Strict 4D convenience entry point; all attachment guarantees apply."""
    if type(model) is not dict or model.get('dimension')!=4:
        _fail('polyhedron-prism attachment requires dimension four.')
    return attach_construction_components(model)
