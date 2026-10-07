import copy
import math
from dataclasses import FrozenInstanceError

import pytest

from engine.geometry import GeometryError, identity
from engine.history import (create_history, record_source, record_operation,
    validate_history, replay_history, canonical_model, append_operation,
    validate_document_history, MAX_NODES, MAX_NODE_BYTES)
from engine.server import dispatch


def cube():
    return {'model': {'id': 'hand-cube', 'name': 'Hand Cartesian cube',
        'dimension': 3, 'embeddingDimension': 3, 'interpretation': 'convex-polytope',
        'vertices': [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],
                     [-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]],
        'edges': [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],
                  [0,4],[1,5],[2,6],[3,7]],
        'faces': [[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],
                  [2,3,7,6],[3,0,4,7]], 'cells': [],
        'facetVertices': [[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],
                          [2,3,7,6],[3,0,4,7]],
        'numeric': {'mode': 'float64-approximate', 'certified': False},
        'metadata': {}}, 'view': {'angles': [0,0,0,0,0,0]}, 'notes': 'source'}


def chain():
    source = cube()
    graph = record_source(create_history(), 'source', source)
    scaled = {**source, 'model': dispatch({'op': 'transform', 'model': source['model'], 'params': {'scale': 2}})}
    graph = record_operation(graph, 'scale', 'source', 'transform', {'scale': 2}, scaled)
    matrix = [[-1,0,0],[0,1,0],[0,0,1]]
    reflected = {**source, 'model': dispatch({'op': 'transform', 'model': scaled['model'], 'params': {'matrix': matrix}})}
    graph = record_operation(graph, 'reflect', 'scale', 'transform', {'matrix': matrix}, reflected)
    cut = dispatch({'op': 'section', 'model': reflected['model'], 'params': {'normal': [0,0,1], 'offset': 0}})
    graph = record_operation(graph, 'section', 'reflect', 'section', {'normal': [0,0,1], 'offset': 0}, {**source, 'model': cut['model']})
    return graph


def test_cartesian_scale_reflect_section_replay_has_independent_analytic_geometry():
    graph = chain()
    states = replay_history(graph, dispatch)
    assert states['scale']['model']['vertices'] == [[2*x for x in point] for point in cube()['model']['vertices']]
    assert states['scale']['model']['edges'] == cube()['model']['edges']
    assert states['reflect']['model']['vertices'] == [[-2*x,2*y,2*z] for x,y,z in cube()['model']['vertices']]
    assert states['reflect']['model']['faces'] == [list(reversed(face)) for face in cube()['model']['faces']]
    section = states['section']['model']
    assert section['dimension'] == 2
    assert (len(section['vertices']),len(section['edges']),len(section['faces'])) == (4,4,1)
    assert sorted(map(tuple,section['vertices'])) == [(-2,-2),(-2,2),(2,-2),(2,2)]
    for a,b in section['edges']:
        p,q = section['vertices'][a], section['vertices'][b]
        assert sum(abs(x-y) for x,y in zip(p,q)) == 4


def test_snapshots_parameters_and_readback_are_detached_and_history_is_immutable():
    source = cube(); params = {'scale': 2}
    first = record_source(create_history(), 'root', source)
    result = {**cube(), 'model': dispatch({'op':'transform','model':source['model'],'params':params})}
    second = record_operation(first, 'scaled', 'root', 'transform', params, result)
    source['model']['vertices'][0][0] = 99; params['scale'] = 7; result['view']['angles'][0] = 80
    readback = second.to_dict(); readback['nodes'][0]['snapshot']['model']['vertices'][0][0] = 88
    assert first.to_dict()['nodes'][0]['snapshot']['model']['vertices'][0][0] == -1
    assert second.to_dict()['nodes'][1]['params'] == {'scale':2}
    assert second.to_dict()['nodes'][1]['snapshot']['view']['angles'][0] == 0
    with pytest.raises(FrozenInstanceError):
        second._data = b'{}'


def test_changed_parameters_and_source_append_distinct_branches():
    first = chain(); previous = first.to_dict()
    alternative = {**cube(), 'model': dispatch({'op':'transform','model':cube()['model'],'params':{'scale':3}})}
    branched = record_operation(first,'scale-three','source','transform',{'scale':3},alternative)
    changed = cube(); changed['notes'] = 'edited source snapshot'
    branched = record_source(branched,'edited-source',changed,parent='source')
    assert first.to_dict() == previous
    nodes = branched.to_dict()['nodes']
    assert nodes[-2]['parent'] == 'source'
    assert nodes[-1]['sourceSnapshotHash'] != nodes[0]['sourceSnapshotHash']
    assert set(replay_history(branched,dispatch,target='scale-three')) == {'source','scale-three'}


@pytest.mark.parametrize('field,value,match',[
    ('algorithmVersion','future-kernel','algorithm version'),
    ('numericPolicy',{'mode':'future-exact'},'numeric policy'),
    ('op','future-operation','unsupported replay operation')])
def test_unknown_semantics_keep_readable_snapshot_but_replay_fails(field,value,match):
    data = chain().to_dict(); data['nodes'][1][field] = value
    graph = validate_history(data)
    assert graph.to_dict()['nodes'][1]['snapshot']['model']['vertices'][0] == [-2,-2,-2]
    with pytest.raises(GeometryError,match=match):
        replay_history(graph,dispatch)
    assert set(replay_history(graph,dispatch,target='source')) == {'source'}


def test_forged_hashes_and_intermediate_valid_geometry_are_rejected_before_descendants():
    data = chain().to_dict(); data['nodes'][1]['resultFingerprint'] = '0'*64
    with pytest.raises(GeometryError,match='forged result fingerprint'):
        validate_history(data)
    data = chain().to_dict(); data['nodes'][1]['sourceSnapshotHash'] = '0'*64
    with pytest.raises(GeometryError,match='forged source snapshot hash'):
        validate_history(data)
    data = chain().to_dict(); model = data['nodes'][1]['snapshot']['model']
    model['vertices'] = [[x*1.1 for x in point] for point in model['vertices']]
    model.pop('facetEquations',None)
    data['nodes'][1]['resultFingerprint'] = identity(model)
    calls = []
    def tracked(request):
        calls.append(request['op']); return dispatch(request)
    with pytest.raises(GeometryError,match='full coordinate/incidence'):
        replay_history(validate_history(data),tracked)
    assert calls == ['transform']


def test_full_incidence_check_survives_an_identity_hash_collision(monkeypatch):
    monkeypatch.setattr('engine.history.identity',lambda model:'fixed-collision')
    graph = chain()
    def wrong(request):
        result = dispatch(request)
        return dispatch({'op':'transform','model':result,'params':{'scale':1.01}})
    with pytest.raises(GeometryError,match='full coordinate/incidence'):
        replay_history(graph,wrong)


@pytest.mark.parametrize('change',[
    lambda data: data['nodes'][1].update(id='source'),
    lambda data: data['nodes'][0].update(parent='section'),
    lambda data: data['nodes'][1].update(inputs=['section']),
    lambda data: data['nodes'][1].update(inputs=['source','source']),
    lambda data: data['nodes'].reverse(),
])
def test_repeated_ids_cycles_and_dependency_order_are_rejected(change):
    data = chain().to_dict(); change(data)
    with pytest.raises(GeometryError):
        validate_history(data)


def test_canonical_representation_preserves_every_ordered_incidence_and_numeric_spelling():
    original = cube()['model']; equivalent = copy.deepcopy(original)
    equivalent['vertices'] = [[float(x) for x in point] for point in equivalent['vertices']]
    assert canonical_model(original) == canonical_model(equivalent)
    equivalent['faces'][0] = equivalent['faces'][0][1:] + equivalent['faces'][0][:1]
    assert canonical_model(original) != canonical_model(equivalent)


def test_source_hash_survives_native_javascript_integer_and_negative_zero_spellings():
    state = cube();state['view']['testNumbers'] = [2.0,-0.0,.25]
    graph = record_source(create_history(),'root',state).to_dict()
    graph['nodes'][0]['snapshot']['view']['testNumbers'] = [2,0,.25]
    graph['nodes'][0]['snapshot']['model']['vertices'] = [[float(x) for x in point] for point in state['model']['vertices']]
    assert validate_history(graph).to_dict()['nodes'][0]['sourceSnapshotHash'] == graph['nodes'][0]['sourceSnapshotHash']


def test_unknown_source_algorithm_and_dispatch_failure_have_explicit_context():
    data = chain().to_dict();data['nodes'][0]['algorithmVersion'] = 'future-source'
    readable = validate_history(data)
    with pytest.raises(GeometryError,match='unsupported algorithm version'):
        replay_history(readable,dispatch,target='source')
    def unavailable(request):
        raise RuntimeError('Dispatcher unavailable')
    with pytest.raises(GeometryError,match='node scale replay operation failed: Dispatcher unavailable'):
        replay_history(chain(),unavailable)


def test_resource_limits_nonfinite_cycles_and_missing_target_are_explicit(monkeypatch):
    import engine.history as history
    data = chain().to_dict()
    with pytest.raises(GeometryError,match='at most 1024'):
        validate_history({'version':1,'nodes':[{}]*(MAX_NODES+1)})
    monkeypatch.setattr(history,'MAX_NODE_BYTES',512)
    with pytest.raises(GeometryError,match='serialized resource'):
        record_source(create_history(),'too-large',cube())
    monkeypatch.setattr(history,'MAX_NODE_BYTES',MAX_NODE_BYTES)
    deep = data['nodes'][0]['snapshot']['view']
    for _ in range(65):
        deep['child'] = {}; deep = deep['child']
    with pytest.raises(GeometryError,match='structural resource'):
        validate_history(data)
    data = chain().to_dict(); data['nodes'][0]['snapshot']['view']['bad'] = float('nan')
    with pytest.raises(GeometryError,match='finite JSON'):
        validate_history(data)
    data = chain().to_dict(); data['cycle'] = data
    with pytest.raises(GeometryError,match='cyclic JSON'):
        validate_history(data)
    with pytest.raises(GeometryError,match='target is unavailable'):
        replay_history(chain(),dispatch,target='absent')


def single_operation(op,params,source=None):
    source = cube() if source is None else source
    response = dispatch({'op':op,'model':source['model'],'params':params})
    state = {**source,'model':response}
    graph = append_operation(None,'root',source,op,params,state,'result')
    return graph,replay_history(graph,dispatch)['result']['model']


def test_cube_polar_dual_is_analytic_octahedron():
    graph,model = single_operation('dual',{'center':[0,0,0],'radius':1})
    assert (len(model['vertices']),len(model['edges']),len(model['faces'])) == (6,12,8)
    assert sorted(map(tuple,model['vertices'])) == [(-1,0,0),(0,-1,0),(0,0,-1),(0,0,1),(0,1,0),(1,0,0)]
    assert all(len(face)==3 for face in model['faces'])


def test_cube_rectification_and_parameter_branch_have_independent_counts_coordinates():
    graph,model = single_operation('truncate',{'amount':.5})
    assert (len(model['vertices']),len(model['edges']),len(model['faces'])) == (12,24,14)
    assert sorted(len(face) for face in model['faces']) == [3]*8+[4]*6
    assert sorted(map(tuple,model['vertices'])) == sorted([(0,a,b) for a in (-1,1) for b in (-1,1)]+[(a,0,b) for a in (-1,1) for b in (-1,1)]+[(a,b,0) for a in (-1,1) for b in (-1,1)])
    other = dispatch({'op':'truncate','model':cube()['model'],'params':{'amount':.25}})
    branch = record_operation(graph,'quarter-cut','root','truncate',{'amount':.25},{**cube(),'model':other})
    replayed = replay_history(branch,dispatch,target='quarter-cut')['quarter-cut']['model']
    assert (len(replayed['vertices']),len(replayed['edges']),len(replayed['faces'])) == (24,36,14)
    assert canonical_model(replayed) != canonical_model(model)
    assert graph.to_dict()['nodes'][-1]['params'] == {'amount':.5}


def test_square_extrusion_has_analytic_source_layers_and_prism_incidence():
    square = {'model':{'id':'hand-square','name':'Hand square','dimension':2,'embeddingDimension':2,
        'interpretation':'convex-polytope','vertices':[[-1,-1],[1,-1],[1,1],[-1,1]],
        'edges':[[0,1],[1,2],[2,3],[3,0]],'faces':[[0,1,2,3]],'cells':[],
        'numeric':{'mode':'float64-approximate','certified':False},'metadata':{}},'view':{}}
    graph,model = single_operation('extrude',{'height':6},square)
    assert (len(model['vertices']),len(model['edges']),len(model['faces'])) == (8,12,6)
    assert sorted(map(tuple,model['vertices'])) == sorted((x,y,z) for x in (-1,1) for y in (-1,1) for z in (-3,3))
    assert all(len(face)==4 for face in model['faces'])


def test_three_dimensional_cube_extrusion_preserves_analytic_four_dimensional_layers():
    graph,model=single_operation('extrude',{'height':6})
    assert model['dimension']==4 and model['embeddingDimension']==4
    assert (len(model['vertices']),len(model['edges']),len(model['faces']),len(model['cells']))==(16,32,24,8)
    assert sorted(map(tuple,model['vertices']))==sorted(tuple(point+[layer]) for point in cube()['model']['vertices'] for layer in (-3,3))
    assert all(len(face)==4 for face in model['faces'])
    assert all(len(cell)==6 for cell in model['cells'])


def pentagram_source():
    # Listed planar pentagon coordinates, embedded in a 3D generalized complex.
    points = [[1,0,1],[.30901699437494745,.9510565162951535,1],
              [-.8090169943749473,.5877852522924732,1],
              [-.8090169943749476,-.587785252292473,1],
              [.30901699437494723,-.9510565162951536,1]]
    return {'model':{'id':'hand-star-face','name':'Hand pentagram face','dimension':3,'embeddingDimension':3,
        'interpretation':'generalized-complex','vertices':points,'edges':[[0,2],[2,4],[4,1],[1,3],[3,0]],
        'faces':[[0,2,4,1,3]],'cells':[],'numeric':{'mode':'float64-approximate','certified':False},'metadata':{}},'view':{'fillRule':'evenodd'}}


def test_manual_faceting_preserves_star_cycles_and_source_vertex_set():
    source = pentagram_source(); cycle = [0,2,4,1,3]
    graph,model = single_operation('facet',{'faces':[cycle],'name':'Replay pentagram'},source)
    assert model['vertices'] == source['model']['vertices']
    assert model['faces'] == [cycle]
    assert model['interpretation'] == 'generalized-complex'
    assert len(model['edges'])==5 and len(model['vertices'])==5


def test_selected_generalized_face_preserves_source_order_without_hull_substitution():
    source = pentagram_source();graph,model = single_operation('cell',{'kind':'face','index':0},source)
    assert model['dimension']==2 and model['interpretation']=='generalized-complex'
    assert model['metadata']['sourceEmbedding']['sourceVertexIds']==[0,2,4,1,3]
    assert model['faces']==[[0,1,2,3,4]]
    embed=model['metadata']['sourceEmbedding']
    reconstructed=[[embed['origin'][axis]+sum(point[j]*embed['basis'][axis][j] for j in range(2)) for axis in range(3)] for point in model['vertices']]
    for point,index in zip(reconstructed,[0,2,4,1,3]):
        assert point == pytest.approx(source['model']['vertices'][index],abs=1e-12)


def great_icosahedron():
    phi=(1+math.sqrt(5))/2
    vertices=[[0,-1,-phi],[0,-1,phi],[0,1,-phi],[0,1,phi],[-1,-phi,0],[-1,phi,0],
              [1,-phi,0],[1,phi,0],[-phi,0,-1],[-phi,0,1],[phi,0,-1],[phi,0,1]]
    # Literal long-edge triangles of {3,5/2}; no runtime generator/enumerator.
    faces=[[0,1,5],[0,1,7],[0,5,11],[0,7,9],[0,9,11],[1,5,10],[1,7,8],[1,8,10],
           [2,3,4],[2,3,6],[2,4,11],[2,6,9],[2,9,11],[3,4,10],[3,6,8],[3,8,10],
           [4,5,10],[4,5,11],[6,7,8],[6,7,9]]
    edges=sorted({tuple(sorted((a,b))) for face in faces for a,b in zip(face,face[1:]+face[:1])})
    return {'model':{'id':'hand-great-icosahedron','name':'Great icosahedron','dimension':3,'embeddingDimension':3,
        'interpretation':'generalized-complex','vertices':vertices,'edges':[list(edge) for edge in edges],
        'faces':faces,'cells':[],'numeric':{'mode':'float64-approximate','certified':False},
        'metadata':{'symbol':'{3,5/2}','key':'great-icosahedron'}},'view':{'fillRule':'evenodd'}}


def test_double_incidence_dual_of_literal_named_star_recovers_coordinates_and_cycles():
    source=great_icosahedron();graph,first=single_operation('incidence-dual',{'center':[0,0,0],'radius':1},source)
    assert graph.to_dict()['nodes'][1]['algorithmVersion']=='0.5.0'
    assert (len(first['vertices']),len(first['edges']),len(first['faces']))==(20,30,12)
    second=dispatch({'op':'incidence-dual','model':first,'params':{'center':[0,0,0],'radius':1}})
    graph=record_operation(graph,'twice','result','incidence-dual',{'center':[0,0,0],'radius':1},{**source,'model':second})
    model=replay_history(graph,dispatch,target='twice')['twice']['model']
    mapping=[]
    for point in model['vertices']:
        index=min(range(12),key=lambda i:sum((x-y)**2 for x,y in zip(point,source['model']['vertices'][i])))
        assert point==pytest.approx(source['model']['vertices'][index],abs=1e-12);mapping.append(index)
    def undirected_cycle(face):
        sequence=tuple(face); reverse=sequence[::-1]
        return min([sequence[i:]+sequence[:i] for i in range(len(sequence))]+[reverse[i:]+reverse[:i] for i in range(len(reverse))])
    assert sorted(undirected_cycle([mapping[v] for v in face]) for face in model['faces'])==sorted(undirected_cycle(face) for face in source['model']['faces'])
    assert model['interpretation']=='generalized-complex'


def test_atomic_append_seeds_or_reuses_source_and_rejects_silent_source_changes():
    graph,_=single_operation('dual',{})
    old=graph.to_dict();source=cube();source['view']['angles'][0]=40
    dual=dispatch({'op':'dual','model':source['model'],'params':{'radius':2}})
    appended=append_operation(graph,'root',source,'dual',{'radius':2},{**source,'model':dual},'radius-two')
    assert len(appended.to_dict()['nodes'])==3 and graph.to_dict()==old
    source['model']['vertices']=[[x*2 for x in point] for point in source['model']['vertices']]
    with pytest.raises(GeometryError,match='provide a new source node ID'):
        append_operation(graph,'root',source,'dual',{},cube(),'edited')


def test_document_associations_allow_display_changes_but_reject_forged_geometry_and_references():
    graph=chain();data=graph.to_dict()
    states=[]
    for node in data['nodes']:
        state=copy.deepcopy(node['snapshot']);state['operationNode']=node['id'];state['view']['angles']=[5,10,15,20,25,30];states.append(state)
    doc={'operationHistory':data,'states':states,'cursor':3};before=copy.deepcopy(doc)
    validated=validate_document_history(doc);assert validated.to_dict()==data and doc==before
    doc['states'][1]['operationNode']='source'
    with pytest.raises(GeometryError,match='geometry disagrees'):
        validate_document_history(doc)
    doc=copy.deepcopy(before);doc['states'][1]['operationNode']='missing'
    with pytest.raises(GeometryError,match='invalid operation node'):
        validate_document_history(doc)
    doc=copy.deepcopy(before);del doc['states'][0]['operationNode']
    with pytest.raises(GeometryError,match='invalid operation node'):
        validate_document_history(doc)
    with pytest.raises(GeometryError,match='requires an operation history'):
        validate_document_history({'states':[before['states'][0]]})
    assert validate_document_history({'states':[cube()]}) is None


def test_rational_dual_remains_explicitly_unsupported_with_readable_snapshot():
    graph=record_source(create_history(),'root',cube())
    graph=record_operation(graph,'unqualified','root','rational-dual',{},cube())
    assert graph.to_dict()['nodes'][1]['snapshot']==cube()
    with pytest.raises(GeometryError,match='unsupported replay operation rational-dual'):
        replay_history(graph,dispatch)
