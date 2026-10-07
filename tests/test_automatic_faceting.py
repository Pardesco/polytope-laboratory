"""Independent literal incidence witnesses; never a release/parity test suite."""
from copy import deepcopy
from itertools import combinations, product, permutations
import json

import pytest

from engine.automatic_faceting import (VERSION, LIMITS, candidate_facets,
    enumerate_facetings, realize_faceting, verify_source_symmetry)
from engine.geometry import GeometryError, canonical_cycle, identity, validate
from engine.formats import load_file, save_project
from engine.products import polygon_prism
from engine.star_polygons import regular_star_polygon


def model(vertices,faces):
    edges=sorted({tuple(sorted((a,b))) for face in faces for a,b in zip(face,face[1:]+face[:1])})
    return {'id':'literal-'+str(len(vertices)),'name':'Literal witness','dimension':3,'embeddingDimension':3,
        'interpretation':'generalized-complex','vertices':vertices,'edges':[list(edge) for edge in edges],
        'faces':faces,'cells':[],'numeric':{'mode':'float64-approximate','certified':False},
        'metadata':{'coordinateUnits':'mm','owner':{'note':'retain all original attributes'},
                    'offColors':{'faces':[{'encoding':'unit','values':[.2,.4,.6,.8]} for face in faces],'cells':[]}}}


def tetra():
    return model([[0,0,0],[1,0,0],[0,1,0],[0,0,1]],[[0,2,1],[0,1,3],[1,2,3],[2,0,3]])


def cube():
    vertices=[list(point) for point in product((-1,1),repeat=3)]
    # Six literal square cycles in coordinate-index order, independent of Hull.
    return model(vertices,[[0,1,3,2],[4,6,7,5],[0,4,5,1],[2,3,7,6],[0,2,6,4],[1,5,7,3]])


def selected(source,cycles,**kwargs):
    desired={canonical_cycle(face) for face in cycles};catalogue=candidate_facets(source,**kwargs)
    ids=[row['id'] for row in catalogue['candidates'] if canonical_cycle(row['cycle']) in desired]
    assert len(ids)==len(desired)
    return ids


def cube_tetra_cycles(source):
    # Alternating cube vertices give two vertex-disjoint regular tetrahedra.
    groups=[[i for i,p in enumerate(source['vertices']) if sum(x==1 for x in p)%2==parity] for parity in (0,1)]
    return [list(face) for group in groups for face in combinations(group,3)]


def test_tetrahedral_candidates_and_exhausted_unrestricted_search_are_independent():
    source=tetra();before=deepcopy(source);catalogue=candidate_facets(source)
    assert catalogue['status']=='complete'
    assert len(catalogue['planes'])==len(catalogue['candidates'])==4
    assert {canonical_cycle(c['cycle']) for c in catalogue['candidates']}=={canonical_cycle(f) for f in source['faces']}
    search=enumerate_facetings(source)
    assert search['status']=='complete' and search['countMeaning']=='exhausted recorded domain'
    assert search['nodesVisited']==31 and len(search['results'])==1
    result=realize_faceting(source,search,search['results'][0]['id'])
    assert len(result['edges'])==6 and len(result['faces'])==4
    assert result['vertices']==source['vertices'] and result['validation']['passed']
    assert result['interpretation']=='generalized-complex' and 'measure' not in result
    assert result['numeric']['certified'] is False and result['provenance']['convexified'] is False
    assert source==before


def test_cube_candidate_count_includes_diagonal_planes_and_crossed_square_cycles():
    source=cube();catalogue=candidate_facets(source)
    # Choose any 3 of 8 cube vertices: 56 distinct planar triangle cycles.
    # Twelve planes have four vertices, each giving 3 Hamiltonian quadrilateral
    # cycles (one ordinary rectangle and two crossed traversals), total 92.
    assert len(catalogue['planes'])==20 and len(catalogue['candidates'])==56+12*3==92
    assert sum(len(row['cycle'])==3 for row in catalogue['candidates'])==56
    assert sum(len(row['cycle'])==4 for row in catalogue['candidates'])==36
    assert len(selected(source,[[0,3,1,2]]))==1  # Bow-tie retained, no convexification.
    assert catalogue['domain']['cycleEquivalence']=='source-ID cycle rotation or reversal'


def test_selected_cube_domain_independently_contains_cube_and_two_tetrahedra_and_partial_choices():
    source=cube();cycles=source['faces']+cube_tetra_cycles(source);ids=selected(source,cycles)
    full=enumerate_facetings(source,ids)
    assert full['status']=='complete' and full['nodesVisited']==2**15-1
    assert len(full['results'])==2
    assert sorted((len(r['cycles']),len(r['incidence']['faceComponents'])) for r in full['results'])==[(6,1),(8,2)]
    partial=enumerate_facetings(source,ids,criteria={'accept_partial':True})
    assert partial['status']=='complete' and len(partial['results'])==4
    assert sorted(len(r['incidence']['activeVertexIds']) for r in partial['results'])==[4,4,8,8]
    for row in partial['results']:
        result=realize_faceting(source,partial,row['id'])
        assert len(result['vertices'])==8 and result['vertices']==source['vertices']
        assert result['metadata']['unusedSourceVertexIds']==row['incidence']['unusedSourceVertexIds']
        assert result['metadata']['coordinateUnits']=='mm'
        assert result['provenance']['sourceSnapshot']==source
        if len(row['cycles'])==8:
            assert len(result['edges'])==12 and result['metadata']['newFaceIdsWithoutSourceColor']==list(range(8))
            assert result['metadata']['offColors']['faces']==[None]*8


def test_star_prism_selected_search_keeps_literal_step_cycles_and_new_boundary_edges():
    source=polygon_prism(regular_star_polygon(5,2),height=2)
    source['metadata']['coordinateUnits']='in';before=deepcopy(source)
    ids=selected(source,source['faces'])
    search=enumerate_facetings(source,ids)
    assert search['status']=='complete' and len(search['results'])==1
    result=realize_faceting(source,search,search['results'][0]['id'])
    assert result['vertices']==source['vertices'] and len(result['edges'])==15 and len(result['faces'])==7
    assert {canonical_cycle(f) for f in result['faces']}=={canonical_cycle(f) for f in source['faces']}
    caps=[f for f in result['faces'] if len(f)==5]
    assert all(all((b-a)%5 in (2,3) for a,b in zip(f,f[1:]+f[:1])) for f in caps)
    assert result['metadata']['coordinateUnits']=='in'
    assert result['provenance']['sourceSnapshot']==before and source==before
    assert 'measure' not in result and 'facetEquations' not in result


def test_open_edge_links_and_pinched_vertex_links_are_not_mislabeled_valid():
    source=tetra();search=enumerate_facetings(source,selected(source,source['faces'][:-1]))
    assert search['status']=='complete' and search['results']==[]
    cycles=[[0,1,2],[0,1,3],[0,2,3],[1,2,3],[0,4,5],[0,4,6],[0,5,6],[4,5,6]]
    pinched=model([[0,0,0],[1,0,0],[0,1,0],[0,0,1],[-1,0,0],[0,-1,0],[0,0,-1]],cycles)
    assert validate(pinched)['passed']  # Native generalized pass alone is weaker.
    ids=selected(pinched,cycles)
    assert enumerate_facetings(pinched,ids)['results']==[]
    partial=enumerate_facetings(pinched,ids,criteria={'accept_partial':True})
    assert len(partial['results'])==2
    assert all(len(r['cycles'])==4 for r in partial['results'])


@pytest.mark.parametrize('kwargs,reason',[
    ({'max_candidates':2},'global candidate cap'),
    ({'max_cycles_per_plane':1},'per-plane candidate cap'),
    ({'node_limit':1},'subset node cap'),
    ({'result_limit':1},'result storage cap')])
def test_resource_frontiers_never_claim_exhaustion(kwargs,reason):
    source=cube() if 'max_' in next(iter(kwargs)) else tetra()
    result=enumerate_facetings(source,**kwargs)
    assert result['status']=='resource-limited' and reason in result['limitReasons']
    assert result['countMeaning']=='found lower bound; search not exhausted'


def test_user_cancellation_and_explicit_restricted_domains_are_recorded():
    canceled=enumerate_facetings(tetra(),cancelled=lambda:True)
    assert canceled['status']=='user-cancelled' and canceled['results']==[]
    source=cube();empty=enumerate_facetings(source,[])
    assert empty['status']=='complete' and empty['results']==[] and empty['explicitCandidateSelection']
    restricted=candidate_facets(source,max_face_vertices=3)
    assert restricted['status']=='complete' and restricted['restrictedFaceSize']
    assert len(restricted['candidates'])==56 and restricted['domain']['maximumFaceVertices']==3


def test_json_project_roundtrip_preserves_all_source_attributes_maps_units_and_current_colors(tmp_path):
    source=cube();search=enumerate_facetings(source,selected(source,source['faces']))
    result=realize_faceting(source,search,search['results'][0]['id'])
    assert all(c=={'encoding':'unit','values':[.2,.4,.6,.8]} for c in result['metadata']['offColors']['faces'])
    project={'format':'polytope-laboratory','version':1,'active':0,
        'documents':[{'id':'doc','cursor':0,'states':[{'model':result,'view':{'coordinateUnit':'mm'},'notes':'retained note'}]}]}
    path=tmp_path/'faceting.polyproj';save_project(path,project)
    loaded=load_file(path)['project']['documents'][0]['states'][0]
    assert identity(loaded['model'])==identity(result)
    assert loaded['model']['provenance']['sourceSnapshot']==source
    assert loaded['model']['metadata']==result['metadata'] and loaded['notes']=='retained note'
    reloaded_search=json.loads(json.dumps(search))
    assert realize_faceting(source,reloaded_search,reloaded_search['results'][0]['id'])==result


@pytest.mark.parametrize('change',[
    lambda m:m['vertices'][1].__setitem__(0,2),
    lambda m:m['metadata'].__setitem__('coordinateUnits','cm'),
    lambda m:m['metadata']['offColors']['faces'][0]['values'].__setitem__(3,.5),
    lambda m:m['metadata']['owner'].__setitem__('note','changed'),
    lambda m:m.__setitem__('id','another source')])
def test_full_snapshot_binding_rejects_source_attribute_tampering(change):
    source=tetra();search=enumerate_facetings(source);rid=search['results'][0]['id'];changed=deepcopy(source);change(changed)
    with pytest.raises(GeometryError,match='different source'):realize_faceting(changed,search,rid)


@pytest.mark.parametrize('change',[
    lambda r:r['results'][0]['cycles'][0].reverse(),
    lambda r:r['results'][0]['incidence']['edgeFaceCounts'].__setitem__(0,1),
    lambda r:r['results'][0]['candidateIds'].__setitem__(0,{}),
    lambda r:r['criteria'].__setitem__('twoDistinctFacesPerEdge',False),
    lambda r:r['selectedCandidateIds'].pop(),
    lambda r:r['domain'].__setitem__('repeatedVertices',True)])
def test_result_cycles_incidence_domain_and_criteria_must_reconstruct(change):
    source=tetra();search=enumerate_facetings(source);rid=search['results'][0]['id'];change(search)
    with pytest.raises(GeometryError):realize_faceting(source,search,rid)


def test_duplicate_source_cycle_colors_are_not_arbitrarily_assigned():
    source=tetra();source['faces'].append(source['faces'][0].copy())
    source['metadata']['offColors']['faces'].append({'encoding':'unit','values':[1,0,0,1]})
    search=enumerate_facetings(source)
    with pytest.raises(GeometryError,match='ambiguous'):realize_faceting(source,search,search['results'][0]['id'])


@pytest.mark.parametrize('kwargs',[
    {'max_face_vertices':True},{'max_face_vertices':9},{'max_candidates':0},
    {'max_cycles_per_plane':10**500},{'node_limit':0},{'node_limit':True},
    {'result_limit':129},{'cancelled':True},{'criteria':{'accept_partial':1}},
    {'criteria':{'criterion':'isohedral'}},{'criteria':{'spiky':True}}])
def test_invalid_options_and_unimplemented_baseline_filters_fail_explicitly(kwargs):
    with pytest.raises(GeometryError):enumerate_facetings(tetra(),**kwargs)


@pytest.mark.parametrize('change',[
    lambda m:m.__setitem__('dimension',4),
    lambda m:m['vertices'].__setitem__(1,m['vertices'][0].copy()),
    lambda m:m['vertices'][1].__setitem__(0,10**500),
    lambda m:m['vertices'][1].__setitem__(0,float('inf')),
    lambda m:m.__setitem__('id','\ud800'),
    lambda m:m['metadata'].__setitem__('invalid','\ud800'),
    lambda m:m['metadata'].__setitem__('cycle',m)])
def test_malformed_source_is_structured_and_never_mutates_caller(change):
    source=tetra();change(source)
    with pytest.raises(GeometryError):candidate_facets(source)


def test_unknown_duplicate_candidate_selection_and_result_ids_are_explicit():
    source=tetra();ids=selected(source,source['faces'])
    for choices in [[ids[0],ids[0]],['unknown'],[True],{}]:
        with pytest.raises(GeometryError):enumerate_facetings(source,choices)
    search=enumerate_facetings(source)
    with pytest.raises(GeometryError):realize_faceting(source,search,'unknown')


def test_deterministic_ids_do_not_depend_on_equivalent_json_numeric_spelling_or_input_selection_order():
    source=tetra();first=enumerate_facetings(source)
    numeric=deepcopy(source);numeric['vertices']=[[float(value) if value else -0.0 for value in point] for point in source['vertices']]
    second=enumerate_facetings(numeric)
    assert first==second
    ids=first['selectedCandidateIds']
    assert enumerate_facetings(source,ids)==enumerate_facetings(source,list(reversed(ids)))


def test_exact_plane_predicate_does_not_merge_a_nearly_coplanar_quad():
    source=cube();source['vertices'][0][0]=-1+1e-12
    source['interpretation']='generalized-complex'
    catalogue=candidate_facets(source)
    assert not any(canonical_cycle(c['cycle'])==canonical_cycle(source['faces'][0]) for c in catalogue['candidates'])
    assert any(len(c['cycle'])==3 for c in catalogue['candidates'])


def test_coplanar_vertex_sharing_is_an_actual_incidence_option_not_a_name_only_flag():
    source=cube();cycles=source['faces'][1:]+[[0,1,3],[0,3,2]];ids=selected(source,cycles)
    assert enumerate_facetings(source,ids)['results']==[]
    allowed=enumerate_facetings(source,ids,criteria={'coplanar_vertices':'allow'})
    assert allowed['status']=='complete' and len(allowed['results'])==1
    result=realize_faceting(source,allowed,allowed['results'][0]['id'])
    assert [len(result[k]) for k in ('vertices','edges','faces')]==[8,13,7]
    assert result['validation']['passed']


def test_large_supported_candidate_table_stops_before_subset_recursion_or_false_completeness():
    source=model([[i,i*i,0] for i in range(11)]+[[0,0,1]],[[0,1,11],[1,2,11]])
    search=enumerate_facetings(source)
    assert search['searchVariables']>LIMITS['searchVariables']
    assert search['status']=='resource-limited' and search['results']==[] and search['nodesVisited']==0
    assert any('variable-domain frontier' in reason for reason in search['limitReasons'])


def test_cancellation_during_subset_search_retains_a_precise_found_lower_bound():
    source=tetra();checks=0
    def cancel():
        nonlocal checks
        checks+=1
        # Four plane triples + four cycles + then subset traversal.
        return checks>20
    result=enumerate_facetings(source,cancelled=cancel)
    assert result['candidateGenerationStatus']=='complete'
    assert result['status']=='user-cancelled' and result['nodesVisited']>0
    assert 'subset search canceled' in result['limitReasons']
    assert result['countMeaning']=='found lower bound; search not exhausted'


def test_planar_source_and_deep_metadata_fail_before_unbounded_copy_or_search():
    source=tetra();source['vertices'][3]=[1,1,0]
    # Replace the old triangles to keep native index/face validation valid.
    source['faces']=[[0,1,2],[1,3,2]];source['edges']=[[0,1],[0,2],[1,2],[1,3],[2,3]]
    source['metadata']['offColors']['faces']=source['metadata']['offColors']['faces'][:2]
    with pytest.raises(GeometryError,match='rank three'):candidate_facets(source)
    source=tetra();nested={};source['metadata']['deep']=nested
    for _ in range(100):child={};nested['next']=child;nested=child
    with pytest.raises(GeometryError,match='resource|bounded'):candidate_facets(source)


def cube_group(source):
    lookup={tuple(point):i for i,point in enumerate(source['vertices'])}
    return [[lookup[tuple(signs[j]*point[axes[j]] for j in range(3))] for point in source['vertices']]
            for axes in permutations(range(3)) for signs in product((-1,1),repeat=3)]


def right_tetra_group():
    return [[0,*[i+1 for i in axes]] for axes in permutations(range(3))]


def test_cube_actions_have_exact_source_isometry_incidence_closure_and_proper_improper_witnesses():
    source=cube();before=deepcopy(source);actions=cube_group(source)
    group=verify_source_symmetry(source,actions)
    assert group['order']==48 and group['orientationSigns'].count(1)==group['orientationSigns'].count(-1)==24
    assert group['originalIncidencePreserved'] and group['identityInverseCompositionVerified']
    assert not group['maximalSourceSymmetryClaim'] and not group['attributeInvarianceRequired']
    assert group['distancePredicate']=='exact supplied integer/binary64-ratio squared distances'
    assert verify_source_symmetry(source,list(reversed(actions)))==group
    assert source==before


def test_full_ordered_cube_candidate_orbits_separate_rectangles_bowties_and_triangle_types():
    source=cube();catalogue=candidate_facets(source,symmetry_permutations=cube_group(source))
    assert catalogue['status']=='complete' and catalogue['symmetry']['status']=='complete'
    orbits=catalogue['symmetry']['orbits'];assert sorted(row['size'] for row in orbits)==[6,6,6,6,8,12,24,24]
    lookup={row['id']:row for row in catalogue['candidates']}
    # Exact edge-squared-length signatures supply an independent separation:
    # ordinary squares and crossed squares have identical point sets but differ
    # in edge lengths/adjacency and cannot share an actual isometry orbit.
    ordinary=next(c for c in catalogue['candidates'] if canonical_cycle(c['cycle'])==canonical_cycle([0,1,3,2]))
    crossed=next(c for c in catalogue['candidates'] if canonical_cycle(c['cycle'])==canonical_cycle([0,3,1,2]))
    assert ordinary['planeId']==crossed['planeId']
    assert ordinary['subgroupOrbitId']!=crossed['subgroupOrbitId']
    for orbit in orbits:
        signatures=set()
        for candidate_id in orbit['candidateIds']:
            row=lookup[candidate_id]
            signatures.add(tuple(sorted(sum((x-y)**2 for x,y in zip(source['vertices'][a],source['vertices'][b])) for a,b in row['edges'])))
        assert len(signatures)==1
    assert sum(row['size'] for row in orbits)==92
    actions=catalogue['symmetry']['candidateActionIndices']
    for permutation,action in zip(catalogue['symmetry']['group']['permutations'],actions):
        assert sorted(action)==list(range(92))
        for i,target in enumerate(action):
            assert canonical_cycle([permutation[v] for v in catalogue['candidates'][i]['cycle']])==tuple(catalogue['candidates'][target]['cycle'])


def test_selected_subgroup_equivalence_deduplicates_tetrahedral_choices_without_losing_labeled_domain():
    source=cube();actions=cube_group(source);ids=selected(source,source['faces']+cube_tetra_cycles(source))
    kwargs={'criteria':{'accept_partial':True},'symmetry_permutations':actions}
    labeled=enumerate_facetings(source,ids,**kwargs)
    grouped=enumerate_facetings(source,ids,equivalence='subgroup',**kwargs)
    assert labeled['status']==grouped['status']=='complete'
    assert len(labeled['results'])==labeled['labeledSelectionsAccepted']==4
    assert len(grouped['results'])==3 and grouped['labeledSelectionsAccepted']==4
    assert grouped['nodesVisited']==labeled['nodesVisited']==32767
    partial=next(row for row in grouped['results'] if len(row['cycles'])==4)
    evidence=partial['symmetryEvidence']
    assert evidence['selectionOrbitSize']==2 and evidence['stabilizerOrder']==24
    assert evidence['faceTypeCount']==1 and evidence['isohedralWithinSelectedSubgroup']
    assert not evidence['fullResultSymmetryClaim'] and not evidence['attributeEquivalence']
    assert partial['candidateIds']==evidence['canonicalCandidateIds']
    result=realize_faceting(source,grouped,partial['id'])
    assert len(result['vertices'])==8 and len(result['edges'])==6 and len(result['faces'])==4
    assert result['provenance']['sourceSnapshot']==source and result['metadata']['coordinateUnits']=='mm'


def test_symmetry_constraint_searches_whole_orbit_unions_then_applies_actual_closed_incidence():
    source=cube();actions=cube_group(source);ids=selected(source,source['faces']+cube_tetra_cycles(source))
    result=enumerate_facetings(source,ids,symmetry_permutations=actions,invariant_under_subgroup=True,
        equivalence='subgroup',criteria={'accept_partial':True})
    assert result['status']=='complete' and result['searchVariables']==2 and result['nodesVisited']==7
    assert len(result['results'])==2  # Neither single tetrahedron maintains all48 actions.
    assert sorted(len(row['cycles']) for row in result['results'])==[6,8]
    for row in result['results']:
        assert row['symmetryEvidence']['stabilizerOrder']==48 and row['symmetryEvidence']['faceTypeCount']==1
        output=realize_faceting(source,result,row['id']);assert output['validation']['passed']
    # The unrestricted cube candidate domain has only eight group orbit choices;
    # actual incidence rejection is still mandatory, not orbit-size guessing.
    full=enumerate_facetings(source,symmetry_permutations=actions,invariant_under_subgroup=True)
    assert full['status']=='complete' and full['searchVariables']==8
    assert len(full['results'])>=2 and full['nodesVisited']<=511
    for row in full['results']:
        assert set(row['incidence']['edgeFaceCounts'])=={2}
        assert row['symmetryEvidence']['stabilizerOrder']==48


def test_face_types_use_the_result_stabilizer_and_are_not_just_equal_polygon_lengths():
    source=tetra();search=enumerate_facetings(source,symmetry_permutations=right_tetra_group(),invariant_under_subgroup=True)
    assert search['status']=='complete' and len(search['results'])==1
    types=search['results'][0]['symmetryEvidence']
    assert types['stabilizerOrder']==6 and types['faceTypeCount']==2
    assert sorted(row['size'] for row in types['faceTypes'])==[1,3]
    assert all(len(face)==3 for face in search['results'][0]['cycles'])
    assert not types['isohedralWithinSelectedSubgroup']
    # A proper tetrahedral subgroup on the regular alternating cube tetrahedron
    # independently gives one face type; group signs certify its proper policy.
    source=model([[1,1,1],[1,-1,-1],[-1,1,-1],[-1,-1,1]],[[0,1,2],[0,1,3],[0,2,3],[1,2,3]])
    all_actions=[list(row) for row in permutations(range(4))]
    receipt=verify_source_symmetry(source,all_actions)
    proper=[row for row,sign in zip(receipt['permutations'],receipt['orientationSigns']) if sign==1]
    assert len(proper)==12
    search=enumerate_facetings(source,symmetry_permutations=proper,invariant_under_subgroup=True)
    assert search['results'][0]['symmetryEvidence']['faceTypeCount']==1


@pytest.mark.parametrize('choice',['duplicate','no identity','not bijective','boolean ID','missing inverse','missing composition','forged isometry','too many'])
def test_forged_or_incomplete_subgroup_actions_are_refused_atomically(choice):
    source=cube();identity_action=list(range(8));lookup={tuple(point):i for i,point in enumerate(source['vertices'])}
    quarter=[lookup[(-p[1],p[0],p[2])] for p in source['vertices']]
    inverse=[quarter.index(i) for i in range(8)]
    swap=identity_action.copy();swap[0],swap[1]=swap[1],swap[0]
    bad={'duplicate':[identity_action,identity_action],'no identity':[quarter],
         'not bijective':[[0]*8],'boolean ID':[[False,*range(1,8)]],
         'missing inverse':[identity_action,quarter],'missing composition':[identity_action,quarter,inverse],
         'forged isometry':[identity_action,swap],'too many':[identity_action]*129}[choice]
    before=deepcopy(source)
    with pytest.raises(GeometryError):candidate_facets(source,symmetry_permutations=bad)
    assert source==before


def test_vertex_set_isometry_without_original_ordered_source_incidence_is_not_a_source_action():
    source=cube();source['faces'][0]=[0,3,1,2]
    source['edges']=[list(edge) for edge in combinations(range(8),2)]
    assert validate(source)['passed']
    with pytest.raises(GeometryError,match='original edges and ordered face'):
        verify_source_symmetry(source,cube_group(source))


def test_nonclosed_seed_selection_is_not_silently_replication_or_complete_subgroup_domain():
    source=cube();seed=selected(source,cube_tetra_cycles(source)[:4])
    with pytest.raises(GeometryError,match='candidate domain is not closed'):
        enumerate_facetings(source,seed,symmetry_permutations=cube_group(source),equivalence='subgroup')


def test_geometric_equivalence_excludes_colors_but_native_output_preserves_every_source_attribute(tmp_path):
    source=cube()
    for i,color in enumerate(source['metadata']['offColors']['faces']):color['values'][3]=(i+1)/10
    ids=selected(source,source['faces']);search=enumerate_facetings(source,ids,symmetry_permutations=cube_group(source),equivalence='subgroup')
    row=search['results'][0];output=realize_faceting(source,search,row['id'])
    assert output['provenance']['sourceSnapshot']==source
    for owners,color in zip(output['metadata']['sourceFaceIds'],output['metadata']['offColors']['faces']):
        assert color==source['metadata']['offColors']['faces'][owners[0]]
    project={'format':'polytope-laboratory','version':1,'active':0,
        'documents':[{'id':'doc','cursor':0,'states':[{'model':output,'view':{'coordinateUnit':'mm'},'notes':'owned note'}]}]}
    path=tmp_path/'symmetry-faceting.polyproj';save_project(path,project)
    loaded=load_file(path)['project']['documents'][0]['states'][0]
    assert loaded['model']['provenance']['symmetry']==output['provenance']['symmetry']
    assert loaded['model']['metadata']==output['metadata'] and loaded['notes']=='owned note'
    assert realize_faceting(source,json.loads(json.dumps(search)),row['id'])==output


@pytest.mark.parametrize('change',[
    lambda r:r['symmetry']['group']['orientationSigns'].__setitem__(0,0),
    lambda r:r['symmetry']['candidateActionIndices'][0].reverse(),
    lambda r:r['symmetry']['orbits'][0].__setitem__('size',999),
    lambda r:r['results'][0]['symmetryEvidence'].__setitem__('faceTypeCount',1),
    lambda r:r['results'][0]['symmetryEvidence'].__setitem__('selectionOrbitSize',10)])
def test_forged_action_orbit_or_type_receipts_do_not_adopt(change):
    source=tetra();search=enumerate_facetings(source,symmetry_permutations=right_tetra_group());rid=search['results'][0]['id'];change(search)
    with pytest.raises(GeometryError):realize_faceting(source,search,rid)


def test_action_and_candidate_caps_cancel_and_lower_bounds_remain_explicit(monkeypatch):
    source=cube();actions=cube_group(source)
    incomplete=enumerate_facetings(source,symmetry_permutations=actions,max_cycles_per_plane=1)
    assert incomplete['status']=='resource-limited' and incomplete['nodesVisited']==0 and incomplete['results']==[]
    assert incomplete['symmetry']['status']=='resource-limited'
    assert any('not closed' in reason for reason in incomplete['limitReasons'])
    monkeypatch.setitem(LIMITS,'actionReferences',1)
    capped=enumerate_facetings(source,symmetry_permutations=actions)
    assert capped['status']=='resource-limited' and capped['nodesVisited']==0
    assert 'source candidate action-reference cap' in capped['limitReasons']


def test_subgroup_equivalence_has_precise_termination_bounds_and_cancellation():
    source=cube();actions=cube_group(source);ids=selected(source,source['faces']+cube_tetra_cycles(source))
    limited=enumerate_facetings(source,ids,symmetry_permutations=actions,invariant_under_subgroup=True,node_limit=1)
    assert limited['status']=='resource-limited' and limited['nodesVisited']==1
    assert limited['countMeaning']=='found lower bound; search not exhausted'
    canceled=enumerate_facetings(source,symmetry_permutations=actions,cancelled=lambda:True)
    assert canceled['status']=='user-cancelled' and not canceled['results']


def test_trigonometric_near_symmetry_is_not_promoted_to_an_exact_source_action():
    source=tetra();source['vertices'][1][0]+=1e-12
    with pytest.raises(GeometryError,match='exact source squared distance'):
        verify_source_symmetry(source,right_tetra_group())


@pytest.mark.parametrize('kwargs',[{'equivalence':'point-set'},{'equivalence':True},{'invariant_under_subgroup':1}])
def test_unsupported_equivalence_and_symmetry_flags_are_structured(kwargs):
    with pytest.raises(GeometryError):enumerate_facetings(tetra(),**kwargs)


def test_isometries_may_fix_a_translated_source_centroid_instead_of_the_world_origin():
    original=cube();actions=cube_group(original);source=deepcopy(original)
    source['vertices']=[[.5*x+offset for x,offset in zip(point,[1.5,-2,3])] for point in source['vertices']]
    group=verify_source_symmetry(source,actions)
    assert group['order']==48 and group['orientationSigns'].count(1)==24
    ids=selected(source,source['faces']);search=enumerate_facetings(source,ids,symmetry_permutations=actions,invariant_under_subgroup=True)
    output=realize_faceting(source,search,search['results'][0]['id'])
    assert output['vertices']==source['vertices'] and output['provenance']['sourceSnapshot']==source


def test_source_incidence_verification_work_budget_refuses_without_a_false_group_claim(monkeypatch):
    source=cube();before=deepcopy(source);monkeypatch.setitem(LIMITS,'sourceActionReferences',1)
    with pytest.raises(GeometryError,match='reference work bound'):verify_source_symmetry(source,cube_group(source))
    assert source==before


def test_source_face_id_action_is_explicit_and_source_cell_memberships_are_not_pointset_only():
    source=tetra();source['cells']=[list(range(4))]
    source['metadata']['offColors']['cells']=[None]
    group=verify_source_symmetry(source,right_tetra_group())
    for permutation,mapped in zip(group['permutations'],group['sourceFaceActionIndices']):
        assert sorted(mapped)==list(range(4))
        for face_id,target in enumerate(mapped):
            assert canonical_cycle([permutation[v] for v in source['faces'][face_id]])==canonical_cycle(source['faces'][target])
    # Duplicate geometric faces have distinct IDs. A cell that owns one duplicate
    # but a different rank in another plane is not preserved by the canonical
    # face-ID lift, despite identical cell point sets and plane geometry.
    source['faces']+=deepcopy(source['faces']);source['metadata']['offColors']['faces']*=2
    source['cells']=[[4,1,2,3]]
    assert validate(source)['passed']
    with pytest.raises(GeometryError,match='original cell face IDs'):
        verify_source_symmetry(source,right_tetra_group())


def test_callback_source_mutation_cannot_publish_a_mixed_snapshot_receipt():
    source=tetra();changed=False
    def mutate():
        nonlocal changed
        if not changed:source['metadata']['coordinateUnits']='cm';changed=True
        return False
    with pytest.raises(GeometryError,match='source snapshot changed'):candidate_facets(source,cancelled=mutate)
    assert source['metadata']['coordinateUnits']=='cm'  # Never undo a caller's edit.


def plane_id(source,cycle):
    key=canonical_cycle(cycle)
    return next(row['planeId'] for row in candidate_facets(source)['candidates'] if tuple(row['cycle'])==key)


def test_isohedral_and_type_ranges_filter_actual_result_stabilizers_not_triangle_counts():
    source=tetra();before=deepcopy(source);actions=right_tetra_group()
    accepted=enumerate_facetings(source,symmetry_permutations=actions,
        criteria={'min_face_types':2,'max_face_types':2})
    assert accepted['status']=='complete' and len(accepted['results'])==1
    witness=accepted['results'][0]
    assert witness['symmetryEvidence']['faceTypeCount']==2
    assert sorted(row['size'] for row in witness['symmetryEvidence']['faceTypes'])==[1,3]
    assert witness['criteriaEvidence']['accepted']
    for criteria in ({'isohedral':True},{'max_face_types':1},{'min_face_types':3}):
        rejected=enumerate_facetings(source,symmetry_permutations=actions,criteria=criteria)
        assert rejected['status']=='complete' and rejected['results']==[]
        assert rejected['incidenceSelectionsExamined']==rejected['criteriaRejectedAtLeaves']==1
        assert rejected['labeledSelectionsAccepted']==0
    # Identity alone has four singleton result-face orbits, not one type simply
    # because the four source faces all have three corners.
    identity_only=enumerate_facetings(source,criteria={'min_face_types':4,'max_face_types':4})
    assert len(identity_only['results'])==1 and identity_only['results'][0]['symmetryEvidence']['faceTypeCount']==4
    assert source==before


def test_cube_isohedral_filters_and_zero_maximum_keep_partial_subgroup_equivalence_honest():
    source=cube();actions=cube_group(source);ids=selected(source,source['faces']+cube_tetra_cycles(source))
    search=enumerate_facetings(source,ids,symmetry_permutations=actions,equivalence='subgroup',
        criteria={'accept_partial':True,'isohedral':True,'min_face_types':1,'max_face_types':0})
    assert search['status']=='complete' and len(search['results'])==3
    assert search['labeledSelectionsAccepted']==4 and search['criteriaRejectedAtLeaves']==0
    assert all(row['symmetryEvidence']['faceTypeCount']==1 and row['criteriaEvidence']['accepted'] for row in search['results'])
    excluded=enumerate_facetings(source,ids,symmetry_permutations=actions,
        criteria={'accept_partial':True,'min_face_types':2})
    assert excluded['status']=='complete' and excluded['results']==[]
    assert excluded['incidenceSelectionsExamined']==excluded['criteriaRejectedAtLeaves']==4


def test_exact_plane_counts_and_result_plane_maximum_are_not_candidate_generation_limits():
    source=cube();before=deepcopy(source)
    square=source['faces'][0];triangles=[[0,1,3],[0,3,2]]
    ids=selected(source,source['faces']+triangles);key=plane_id(source,square)
    base={'coplanar_vertices':'allow'}
    both=enumerate_facetings(source,ids,criteria=base)
    assert both['status']=='complete' and sorted(len(row['cycles']) for row in both['results'])==[6,7]
    for criteria,faces,count in (({'max_faces_per_plane':1},6,1),
                                 ({'plane_face_counts':{key:1}},6,1),
                                 ({'plane_face_counts':{key:2}},7,2)):
        search=enumerate_facetings(source,ids,criteria={**base,**criteria})
        assert search['status']=='complete' and len(search['results'])==1
        row=search['results'][0];assert len(row['cycles'])==faces
        plane=next(record for record in row['criteriaEvidence']['planeFaceCounts'] if record['planeId']==key)
        assert plane['faceCount']==count and len(plane['candidateIds'])==count
        assert plane['exactPlane']==['1','0','0','1']  # x=-1, exact normalized source plane.
        result=realize_faceting(source,search,row['id'])
        assert result['metadata']['facetingCriteria']==row['criteriaEvidence']
        assert result['vertices']==source['vertices'] and result['provenance']['sourceSnapshot']==source
    impossible=enumerate_facetings(source,ids,criteria={**base,'plane_face_counts':{key:0}})
    assert impossible['status']=='complete' and impossible['results']==[]
    assert source==before


def test_zero_count_filter_can_exclude_a_plane_and_has_explicit_zero_owner_evidence():
    source=cube();ids=selected(source,cube_tetra_cycles(source));key=plane_id(source,source['faces'][0])
    search=enumerate_facetings(source,ids,criteria={'plane_face_counts':{key:0}})
    assert search['status']=='complete' and len(search['results'])==1
    zero=next(row for row in search['results'][0]['criteriaEvidence']['planeFaceCounts'] if row['planeId']==key)
    assert zero['faceCount']==0 and zero['candidateIds']==[]
    assert len(search['results'][0]['cycles'])==8
    assert realize_faceting(source,search,search['results'][0]['id'])['validation']['passed']


def test_fixed_plane_constraints_must_be_invariant_only_for_subgroup_quotient_policy():
    source=cube();actions=cube_group(source);ids=selected(source,source['faces']);key=plane_id(source,source['faces'][0])
    fixed={'plane_face_counts':{key:1}}
    labeled=enumerate_facetings(source,ids,symmetry_permutations=actions,criteria=fixed)
    assert len(labeled['results'])==1 and labeled['status']=='complete'
    with pytest.raises(GeometryError,match='not invariant'):
        enumerate_facetings(source,ids,symmetry_permutations=actions,equivalence='subgroup',criteria=fixed)
    all_six={plane_id(source,face):1 for face in source['faces']}
    quotient=enumerate_facetings(source,ids,symmetry_permutations=actions,equivalence='subgroup',
        criteria={'plane_face_counts':all_six,'isohedral':True})
    assert len(quotient['results'])==1 and quotient['results'][0]['criteriaEvidence']['accepted']


def test_partial_crossed_faceting_has_three_result_types_and_retains_its_literal_source_ids():
    source=cube();source['vertices'].append([0,0,0]);source['id']='cube-with-unused-center'
    cycles=[[0,3,1,2],[4,7,5,6],[0,3,7,4],[3,1,5,7],[1,2,6,5],[2,0,4,6]]
    desired={canonical_cycle(face) for face in cycles}
    actions=[p+[8] for p in cube_group(cube())
             if {canonical_cycle([p[v] for v in face]) for face in cycles}==desired]
    assert len(actions)==8
    ids=selected(source,cycles);key=plane_id(source,cycles[0])
    criteria={'accept_partial':True,'min_face_types':3,'max_face_types':3,'plane_face_counts':{key:1}}
    search=enumerate_facetings(source,ids,symmetry_permutations=actions,criteria=criteria)
    assert search['status']=='complete' and len(search['results'])==1
    row=search['results'][0];assert row['incidence']['unusedSourceVertexIds']==[8]
    assert sorted(t['size'] for t in row['symmetryEvidence']['faceTypes'])==[2,2,2]
    assert row['criteriaEvidence']['accepted']
    result=realize_faceting(source,search,row['id'])
    assert result['vertices']==source['vertices'] and len(result['edges'])==12 and len(result['faces'])==6
    assert {canonical_cycle(face) for face in result['faces']}==desired
    assert result['provenance']['sourceSnapshot']==source and 'measure' not in result
    for options in ({'isohedral':True},{'min_face_types':1,'max_face_types':2},{'accept_partial':False}):
        refused=enumerate_facetings(source,ids,symmetry_permutations=actions,criteria={**criteria,**options})
        assert refused['status']=='complete' and refused['results']==[]


@pytest.mark.parametrize('criteria',[
    {'isohedral':1},{'min_face_types':0},{'min_face_types':True},{'min_face_types':10**500},
    {'max_face_types':-1},{'min_face_types':3,'max_face_types':2},
    {'max_faces_per_plane':False},{'max_faces_per_plane':10**500},
    {'plane_face_counts':[]},{'plane_face_counts':{'unknown':1}},
    {'plane_face_counts':{'unknown':True}},{'plane_face_counts':{'unknown':-1}},
    {'plane_face_counts':{'\ud800':1}}, {'tidy_dual':True},{'spiky':True}])
def test_invalid_type_plane_and_still_unsupported_dual_spiky_filters_refuse_atomically(criteria):
    source=tetra();before=deepcopy(source)
    with pytest.raises(GeometryError):enumerate_facetings(source,criteria=criteria)
    assert source==before


@pytest.mark.parametrize('change',[
    lambda report:report['criteria'].__setitem__('isohedral',True),
    lambda report:report['criteria'].__setitem__('min_face_types',2),
    lambda report:report['criteria'].__setitem__('max_faces_per_plane',1),
    lambda report:report['results'][0]['criteriaEvidence'].__setitem__('accepted',False),
    lambda report:report['results'][0]['criteriaEvidence']['checks'].__setitem__('minimumFaceTypes',False),
    lambda report:report['results'][0]['criteriaEvidence']['planeFaceCounts'][0].__setitem__('faceCount',99),
    lambda report:report['results'][0]['criteriaEvidence']['planeFaceCounts'][0]['exactPlane'].__setitem__(0,'99'),
    lambda report:report['results'][0]['criteriaEvidence']['planeFaceCounts'][0]['candidateIds'].clear()])
def test_type_and_exact_plane_filter_witnesses_reconstruct_and_reject_forged_ownership(change):
    source=tetra();search=enumerate_facetings(source,symmetry_permutations=right_tetra_group())
    result_id=search['results'][0]['id'];change(search)
    with pytest.raises(GeometryError):realize_faceting(source,search,result_id)


def test_filtered_receipt_and_native_save_rebuild_preserve_notes_units_rgba_and_source_ownership(tmp_path):
    source=cube();before=deepcopy(source);ids=selected(source,source['faces'])
    counts={plane_id(source,face):1 for face in source['faces']}
    search=enumerate_facetings(source,ids,symmetry_permutations=cube_group(source),equivalence='subgroup',
        criteria={'isohedral':True,'max_face_types':1,'max_faces_per_plane':1,'plane_face_counts':counts})
    result=realize_faceting(source,json.loads(json.dumps(search)),search['results'][0]['id'])
    path=tmp_path/'filtered.polyproj';save_project(path,{'format':'polytope-laboratory','version':1,'active':0,
        'documents':[{'id':'doc','cursor':0,'states':[{'model':result,'view':{},'notes':'filtered retained note'}]}]})
    state=load_file(path)['project']['documents'][0]['states'][0]
    assert state['model']['metadata']==result['metadata'] and state['notes']=='filtered retained note'
    assert state['model']['provenance']['sourceSnapshot']==source and source==before
    assert state['model']['metadata']['coordinateUnits']=='mm'
    assert state['model']['metadata']['offColors']['faces']==source['metadata']['offColors']['faces']


def octagonal_bipyramid():
    # Exact signed-coordinate D4h action; no trigonometric approximate symmetry.
    ring=[[2,1,0],[1,2,0],[-1,2,0],[-2,1,0],[-2,-1,0],[-1,-2,0],[1,-2,0],[2,-1,0]]
    source=model(ring+[[0,0,3],[0,0,-3]],
        [[i,(i+1)%8,8] for i in range(8)]+[[i,9,(i+1)%8] for i in range(8)])
    lookup={tuple(point):i for i,point in enumerate(source['vertices'])};actions=[]
    for swap,sx,sy,sz in product((False,True),(-1,1),(-1,1),(-1,1)):
        actions.append([lookup[(sx*(p[1] if swap else p[0]),sy*(p[0] if swap else p[1]),sz*p[2])]
                        for p in source['vertices']])
    return source,actions


def test_large_candidate_set_can_use_bounded_orbit_variables_without_false_exhaustion():
    source,actions=octagonal_bipyramid();before=deepcopy(source)
    search=enumerate_facetings(source,max_face_vertices=4,symmetry_permutations=actions,
        invariant_under_subgroup=True,node_limit=1)
    assert search['candidateCount']>LIMITS['searchVariables']>search['searchVariables']
    assert search['nodesVisited']==1 and search['phaseStatus']=={
        'candidateGeneration':'complete','symmetryAction':'complete','subsetSearch':'resource-limited'}
    assert search['status']=='resource-limited' and search['countMeaning']=='found lower bound; search not exhausted'
    assert 'subset node cap' in search['limitReasons']
    assert not any('variable-domain frontier' in reason for reason in search['limitReasons'])
    assert source==before


def test_phase_accounting_separates_candidate_truncation_from_an_exhausted_available_table():
    source=cube();search=enumerate_facetings(source,max_candidates=2)
    assert search['phaseStatus']=={'candidateGeneration':'resource-limited','symmetryAction':'complete','subsetSearch':'complete'}
    assert search['status']=='resource-limited' and search['countMeaning']=='found lower bound; search not exhausted'
    canceled=enumerate_facetings(source,cancelled=lambda:True)
    assert canceled['phaseStatus']['candidateGeneration']=='user-cancelled'
    assert canceled['phaseStatus']['subsetSearch']=='not-started' and canceled['nodesVisited']==0


def test_exact_near_parallel_planes_are_never_merged_by_native_float_tolerance():
    first=tetra();shift=[2,2,1e-12]
    vertices=deepcopy(first['vertices'])+[[p[k]+shift[k] for k in range(3)] for p in first['vertices']]
    faces=deepcopy(first['faces'])+[[v+4 for v in face] for face in first['faces']]
    source=model(vertices,faces);assert validate(source)['passed']
    a=plane_id(source,faces[0]);b=plane_id(source,faces[4]);assert a!=b
    search=enumerate_facetings(source,selected(source,faces),criteria={
        'max_faces_per_plane':1,'plane_face_counts':{a:1,b:1}})
    assert search['status']=='complete' and len(search['results'])==1
    records={p['planeId']:p for p in search['results'][0]['criteriaEvidence']['planeFaceCounts']}
    assert records[a]['exactPlane']!=records[b]['exactPlane']
    assert records[a]['faceCount']==records[b]['faceCount']==1
    assert realize_faceting(source,search,search['results'][0]['id'])['vertices']==vertices


def test_cancellation_and_action_budget_report_the_phase_that_actually_stopped(monkeypatch):
    calls=0
    def cancel_search():
        nonlocal calls
        calls+=1
        return calls==12
    search=enumerate_facetings(tetra(),cancelled=cancel_search)
    assert search['phaseStatus']=={'candidateGeneration':'complete','symmetryAction':'complete','subsetSearch':'user-cancelled'}
    assert search['status']=='user-cancelled' and search['nodesVisited']==2
    monkeypatch.setitem(LIMITS,'actionReferences',1)
    limited=enumerate_facetings(tetra())
    assert limited['candidateGenerationStatus']=='complete' and limited['candidateCatalogueStatus']=='resource-limited'
    assert limited['phaseStatus']=={'candidateGeneration':'complete','symmetryAction':'resource-limited','subsetSearch':'not-started'}
    assert limited['nodesVisited']==0 and limited['results']==[]
