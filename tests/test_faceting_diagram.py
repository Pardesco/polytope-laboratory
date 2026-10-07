"""Independent projective FAC-04 diagram witnesses; never a release gate."""
from copy import deepcopy
from fractions import Fraction as F
from itertools import product
import importlib.util
import json
import math
from pathlib import Path
import subprocess
import xml.etree.ElementTree as ET

import pytest

from engine import faceting_diagram as d
from engine.automatic_faceting import candidate_facets, enumerate_facetings
from engine.geometry import GeometryError, canonical_cycle, identity
from engine.formats import load_file, save_project
from engine.server import dispatch
from engine.products import polygon_prism
from engine.star_polygons import regular_star_polygon


def model(points,faces):
    edges=sorted({tuple(sorted((a,b))) for face in faces for a,b in zip(face,face[1:]+face[:1])})
    return {'id':'literal-diagram-source','name':'Literal diagram witness','dimension':3,'embeddingDimension':3,
        'interpretation':'generalized-complex','vertices':points,'edges':[list(e) for e in edges],
        'faces':faces,'cells':[],'numeric':{'mode':'float64-approximate','certified':False},
        'metadata':{'coordinateUnits':'mm','notes':{'owner':'unchanged'},
            'offColors':{'faces':[{'encoding':'unit','values':[.2,.4,.6,.8]} for _ in faces],'cells':[]}}}


def cube():
    return model([list(p) for p in product((-1,1),repeat=3)],
        [[0,1,3,2],[4,6,7,5],[0,4,5,1],[2,3,7,6],[0,2,6,4],[1,5,7,3]])


def tetra():
    return model([[0,0,0],[1,0,0],[0,1,0],[0,0,1]],[[0,2,1],[0,1,3],[1,2,3],[2,0,3]])


def ids(pool,cycles):
    wanted={canonical_cycle(f) for f in cycles}
    result=[r['id'] for r in pool['candidates'] if canonical_cycle(r['cycle']) in wanted]
    assert len(result)==len(wanted)
    return result


def plane(pool,vertices):
    return next(row['id'] for row in pool['planes'] if row['sourceVertexIds']==sorted(vertices))


def make(source=None,kind='vertex',**params):
    source=source or cube();pool=candidate_facets(source)
    if kind=='vertex':params.setdefault('vertex_id',0)
    else:params.setdefault('plane_id',plane(pool,source['faces'][0]))
    result=d.build_diagram(source,pool,{'kind':kind,**params})
    assert result['status']=='complete'
    assert d.verify_diagram(source,result)==result
    return source,pool,result


def test_literal_cube_vertex_projective_points_and_facial_lines_independent_equations():
    source,pool,r=make();assert r['center']==['0','0','0'] and r['sourceGeometryChanged'] is False
    assert len(r['vertices'])==7 and r['mainVertexId']==0
    origin=[F(x) for x in r['frame']['origin']];u,v=[[F(x) for x in b] for b in r['frame']['rationalBasis']]
    main=[F(x) for x in source['vertices'][0]];n=[main[i]-origin[i] for i in range(3)];n2=sum(x*x for x in n)
    for point in r['vertices']:
        target=source['vertices'][point['sourceVertexId']];delta=[F(target[i])-main[i] for i in range(3)]
        t=-n2/sum(n[i]*delta[i] for i in range(3));q=[main[i]+t*delta[i] for i in range(3)]
        assert point['projectionParameter']==str(t)
        assert sum(n[i]*(q[i]-origin[i]) for i in range(3))==0
        assert [F(x) for x in point['exactCoordinates']]==[
            sum((q[i]-origin[i])*b[i] for i in range(3))/sum(x*x for x in b) for b in (u,v)]
    assert len(r['lines'])==len([p for p in pool['planes'] if 0 in p['sourceVertexIds']])
    for line in r['lines']:
        coefficients=[F(x) for x in line['exactLine']]
        for point in r['vertices']:
            if point['sourceVertexId'] in line['sourceVertexIds']:
                assert sum(a*b for a,b in zip(coefficients,[F(x) for x in point['homogeneous']]))==0
        p=next(p for p in pool['planes'] if p['id']==line['planeId']);coeffs=[F(x) for x in p['exactPlane']]
        expected=abs(float(coeffs[3]))/math.sqrt(sum(float(x)**2 for x in coeffs[:3]))
        assert line['sourcePlaneDistanceFromCenter']==pytest.approx(expected)
        a,b,c=line['metricLine'];assert line['distanceFromCenter']==pytest.approx(abs(c)/math.hypot(a,b))
    assert r['vertexOrbit']['sourceVertexIds']==[0] and not r['vertexOrbit']['maximalSymmetryClaim']
    assert not r['enumerationComplete'] and not r['numeric']['certifiedModel']


def test_infinite_points_and_plane_have_homogeneous_owners_without_source_insertion():
    source,pool,r=make(center=[-2,-1,-1])
    infinity=[p for p in r['vertices'] if p['status']=='at-infinity']
    assert {p['sourceVertexId'] for p in infinity}=={1,2,3}
    assert all(F(p['homogeneous'][2])==0 and p['metricCoordinates'] is None for p in infinity)
    infinite_line=next(row for row in r['lines'] if row['planeId']==plane(pool,[0,1,2,3]))
    assert infinite_line['status']=='at-infinity' and infinite_line['exactLine']==['0','0','1']
    assert len(r['sourceSnapshot']['vertices'])==8 and not r['intersectionVerticesInsertedIntoSource']
    svg=d.to_svg(r);assert 'At infinity: 1,2,3' in svg and 'nan' not in svg.lower()


def test_square_chart_contains_exact_crossing_not_a_fifth_native_vertex():
    source,pool,r=make(kind='plane')
    assert len(r['vertices'])==4 and len(r['candidates'])==7 # four triangles, three ordered quadrilaterals
    cross=[p for p in r['intersections'] if p['kind']=='proper-crossing']
    assert len(cross)==1 and cross[0]['point']==['0','0']
    assert cross[0]['sourceVertexIds']==[] and cross[0]['paintOnly']
    pick=d.resolve_pick(source,r,'intersection',cross[0]['id'])
    assert pick['virtualSourceVertexId'] is None and not pick['geometryInserted']
    assert all(len(edge['nativeSourceEdgeIds'])==1 for edge in r['segments'] if edge['sourceVertexIds'] in source['edges'])
    assert 'data-paint-intersection-id' in d.to_svg(r)


def test_crossed_square_path_keeps_cycle_zero_algebraic_area_and_RGBA_in_svg():
    source=cube();pool=candidate_facets(source);cycle=[0,3,1,2];seed=ids(pool,[cycle])[0]
    r=d.build_diagram(source,pool,{'kind':'plane','plane_id':plane(pool,[0,1,2,3]),'seed_ids':[seed]})
    selected=next(p for p in r['candidates'] if p['selected'])
    assert canonical_cycle(selected['cycle'])==canonical_cycle(cycle)
    assert selected['winding']['algebraicAreaChart']=='0' and selected['winding']['originOnBoundary']
    assert r['selection']['facets'][0]['sourceFaceIds']==[] and r['selection']['facets'][0]['sourceColor'] is None
    assert not r['selection']['nativeAdoptionValidated']
    ordinary=ids(pool,[source['faces'][0]])[0]
    colored=d.build_diagram(source,pool,{'kind':'plane','plane_id':plane(pool,source['faces'][0]),'seed_ids':[ordinary]})
    svg=d.to_svg(colored);assert 'rgb(51,102,153)' in svg and 'fill-opacity="0.8"' in svg
    with pytest.raises(GeometryError):d.adoption_parameters(source,r)


@pytest.mark.parametrize('step',[2,3,-2,-3])
def test_signed_literal_pentagram_caps_keep_source_winding_and_proper_crossings(step):
    source=polygon_prism(regular_star_polygon(5,step),height=2)
    pool=candidate_facets(source,max_face_vertices=5)
    cap=source['faces'][0];assert len(cap)==5
    cap_ids=ids(pool,[cap]);r=d.build_diagram(source,pool,{'kind':'plane','plane_id':plane(pool,cap),'seed_ids':cap_ids})
    assert r['status']=='complete';selected=next(c for c in r['candidates'] if c['selected'])
    assert selected['sourceOrderedWinding'][0]['cycle']==cap
    assert abs(selected['sourceOrderedWinding'][0]['winding']['originWinding'])==2
    assert len({tuple(p['point']) for p in r['intersections'] if p['kind']=='proper-crossing'})>=5
    assert r['sourceSnapshot']==source and r['sourceSnapshot']['provenance']==source['provenance']
    assert d.verify_diagram(source,r)==r


def test_retrograde_winding_sign_reverses_literal_owner_without_changing_candidate_equivalence():
    receipts=[]
    for step in (2,-2):
        source=polygon_prism(regular_star_polygon(5,step),height=2);pool=candidate_facets(source,max_face_vertices=5)
        r=d.build_diagram(source,pool,{'kind':'plane','plane_id':plane(pool,source['faces'][0]),'seed_ids':ids(pool,[source['faces'][0]])})
        receipts.append(next(c for c in r['candidates'] if c['selected'])['sourceOrderedWinding'][0]['winding']['originWinding'])
    assert receipts[0]==-receipts[1]


def test_verified_reflection_switch_replicates_actual_cycles_not_whole_plane_or_guessed_symmetry():
    source=cube();lookup={tuple(p):i for i,p in enumerate(source['vertices'])}
    mirror=[lookup[(p[1],p[0],p[2])] for p in source['vertices']]
    pool=candidate_facets(source,symmetry_permutations=[list(range(8)),mirror]);seed=ids(pool,[source['faces'][0]])
    a=d.build_diagram(source,pool,{'vertex_id':0,'seed_ids':seed,'reflections':True})
    b=d.build_diagram(source,pool,{'vertex_id':0,'seed_ids':seed,'reflections':False})
    expected={canonical_cycle(source['faces'][0]),canonical_cycle([mirror[i] for i in source['faces'][0]])}
    assert {canonical_cycle(f) for f in a['selection']['expandedCycles']}==expected
    assert len(b['selection']['expandedCycles'])==1
    assert len(a['selection']['actionIndices'])==2 and len(b['selection']['actionIndices'])==1
    assert a['selection']['sourceAttributeSymmetryRequired'] is False


@pytest.mark.parametrize('count,highlight',[(1,'green'),(2,'purple'),(3,'orange'),(4,'red')])
def test_manual_edge_highlights_count_candidate_face_owners_without_imposing_closed_links(count,highlight):
    source=cube();pool=candidate_facets(source)
    # All cycles share edge 0--1; first two are coplanar, later ones are in other planes.
    cycles=[[0,1,2],[0,1,3],[0,1,4],[0,1,5]]
    r=d.build_diagram(source,pool,{'vertex_id':0,'seed_ids':ids(pool,cycles[:count])})
    edge=next(e for e in r['selection']['edgeDiagnostics'] if e['sourceVertexIds']==[0,1])
    assert edge['incidentFacetCount']==count and edge['highlight']==highlight
    assert r['status']=='complete' and not r['selection']['nativeAdoptionValidated']


def test_two_noncoplanar_face_owners_have_no_error_highlight():
    source=cube();pool=candidate_facets(source)
    r=d.build_diagram(source,pool,{'vertex_id':0,'seed_ids':ids(pool,[[0,1,2],[0,1,4]])})
    edge=next(e for e in r['selection']['edgeDiagnostics'] if e['sourceVertexIds']==[0,1])
    assert edge['kind']=='ordinary' and edge['highlight'] is None


def test_actual_adoption_native_recipe_history_Save_Open_and_diagram_state_agree(tmp_path):
    source=cube();pool=candidate_facets(source);chosen=ids(pool,source['faces'])
    search=dispatch({'op':'facet-search','model':source,'params':{'candidate_ids':chosen}})
    r=d.build_diagram(source,pool,{'vertex_id':0,'search':search,'result_id':search['results'][0]['id']})
    assert r['adoption']['diagramSelectionMatches'] and len(r['adoption']['model']['faces'])==6
    doc={'id':'diagram-doc','cursor':0,'states':[{'model':source,'view':{'coordinateUnit':'mm'},'notes':'retain notes'}]}
    adopted=dispatch({'op':'recipe-run','params':{'document':doc,'operation':'facet-adopt','parameters':d.adoption_parameters(source,r)}})
    assert adopted['states'][-1]['model']==r['adoption']['model']
    replay=dispatch({'op':'recipe-replay','params':{'document':adopted}})
    assert replay['states'][0]['model']==r['adoption']['model']
    adopted['states'][-1]['model']['metadata']['developmentDiagramState']=d.save_state(r)
    path=tmp_path/'diagram.json';save_project(path,{'format':'polytope-laboratory','version':1,'active':0,'documents':[adopted]})
    loaded=load_file(path)['project']['documents'][0]['states'][-1]['model']
    reread=d.restore_state(loaded['metadata']['developmentDiagramState']);assert reread==r
    assert reread['adoption']['model']['provenance']['sourceSnapshot']==source
    assert loaded['metadata']['offColors']['faces']==source['metadata']['offColors']['faces']
    assert loaded['metadata']['coordinateUnits']=='mm'


def test_adoption_binding_rejects_different_replicated_selection():
    source=tetra();pool=candidate_facets(source);search=enumerate_facetings(source)
    with pytest.raises(GeometryError,match='differs'):
        d.build_diagram(source,pool,{'vertex_id':0,'seed_ids':[pool['candidates'][0]['id']],
            'search':search,'result_id':search['results'][0]['id']})


def test_real_node_serialization_preserves_source_params_evidence_and_safe_SVG():
    source,pool,r=make(kind='plane',seed_ids=ids(candidate_facets(cube()),[cube()['faces'][0]]))
    serialized=subprocess.run(['node','-e','let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>process.stdout.write(JSON.stringify(JSON.parse(s))))'],
        input=json.dumps(d.save_state(r)),text=True,capture_output=True,check=True).stdout
    rebuilt=d.restore_state(json.loads(serialized));assert rebuilt==r
    root=ET.fromstring(d.to_svg(rebuilt));assert root.tag.endswith('svg')
    assert json.loads(root.find('{http://www.w3.org/2000/svg}metadata').text)['diagramId']==r['id']


def test_SVG_units_escape_and_hide_options_are_presentation_only():
    source=cube();source['metadata']['coordinateUnits']='<script>&"';pool=candidate_facets(source)
    seeds=ids(pool,[source['faces'][0]])
    r=d.build_diagram(source,pool,{'vertex_id':0,'seed_ids':seeds,'hide_diagram_when_selected':True,'hide_vertices_when_selected':True})
    svg=d.to_svg(r);assert '<script>' not in svg and '&lt;script&gt;' in svg
    assert 'data-source-vertex-id' not in svg and 'data-candidate-id' in svg
    assert r['sourceSnapshot']==source and len(r['vertices'])==7


@pytest.mark.parametrize('change',[
    lambda r:r.update(id='forged'),lambda r:r['vertices'][0].update(sourceVertexId=7),
    lambda r:r['frame'].update(normal=['1','0','0']),lambda r:r.update(workUsed=0),
    lambda r:r['sourceSnapshot']['metadata'].update(coordinateUnits='cm'),
    lambda r:r['sourceSnapshot']['metadata']['notes'].update(owner='changed'),
    lambda r:r['sourceSnapshot']['metadata']['offColors']['faces'][0]['values'].__setitem__(3,.1),
    lambda r:r['catalogue']['symmetry']['group']['permutations'][0].reverse(),
    lambda r:r['vertices'][0].update(exactCoordinates=['42','42']),
    lambda r:r['parameters'].update(reflections=False),
    lambda r:r.update(enumerationComplete=True),
])
def test_full_receipt_tamper_rejected(change):
    source,pool,r=make();edited=deepcopy(r);change(edited)
    with pytest.raises(GeometryError):d.verify_diagram(source,edited)


def test_cancel_and_work_limits_are_explicit_nonadoptable_and_nonpaintable():
    source=cube();pool=candidate_facets(source)
    limited=d.build_diagram(source,pool,{'vertex_id':0,'max_work':1})
    assert limited['status']=='resource-limited' and not limited['presentationComplete'] and limited['adoption'] is None
    assert d.verify_diagram(source,limited)==limited
    canceled=d.build_diagram(source,pool,{'vertex_id':0},cancelled=lambda:True)
    assert canceled['status']=='user-cancelled' and canceled['workUsed']==0
    for receipt in (limited,canceled):
        with pytest.raises(GeometryError):d.to_svg(receipt)
        with pytest.raises(GeometryError):d.adoption_parameters(source,receipt)


def test_source_change_during_callback_refuses_atomic_publication():
    source=cube();pool=candidate_facets(source)
    def mutate():source['metadata']['coordinateUnits']='cm';return False
    with pytest.raises(GeometryError,match='ownership changed'):
        d.build_diagram(source,pool,{'vertex_id':0},cancelled=mutate)


def test_center_at_main_vertex_is_explicit_unsupported_not_normalized_or_perturbed():
    source=cube();pool=candidate_facets(source)
    r=d.build_diagram(source,pool,{'vertex_id':0,'center':source['vertices'][0]})
    assert r['status']=='unsupported' and not r['presentationComplete']
    assert d.verify_diagram(source,r)==r and r['sourceSnapshot']==source


@pytest.mark.parametrize('params',[
    {'vertex_id':True},{'vertex_id':8},{'vertex_id':0,'typo':1},{'vertex_id':0,'center':[0,0]},
    {'vertex_id':0,'center':[0,0,'1/0']},{'vertex_id':0,'center':[0,0,True]},
    {'vertex_id':0,'center':[0,0,10**1500]}, {'vertex_id':0,'seed_ids':['fake']},
    {'vertex_id':0,'reflections':1},{'vertex_id':0,'max_work':True},
    {'kind':'plane','plane_id':'fake'},{'kind':'plane','plane_id':'fake','vertex_id':0},
    {'vertex_id':0,'fill_rule':'unsupported'},{'vertex_id':0,'center':[0,0,float('nan')]},
])
def test_malformed_parameters_are_structured(params):
    source=cube();pool=candidate_facets(source)
    with pytest.raises(GeometryError):d.build_diagram(source,pool,params)


@pytest.mark.parametrize('value',[None,True,[],{}, {'format':'faceting-diagram-development','version':True},'\ud800'])
def test_malformed_receipts_and_state_are_structured(value):
    with pytest.raises(GeometryError):d.verify_diagram(cube(),value)
    with pytest.raises(GeometryError):d.save_state(value)
    with pytest.raises(GeometryError):d.restore_state(value)
    with pytest.raises(GeometryError):d.to_svg(value)


def test_wrong_plane_or_nonincident_candidate_pick_does_not_forge_source_identity():
    source,pool,r=make(kind='plane')
    wrong=next(c['id'] for c in pool['candidates'] if c['planeId']!=r['planeId'])
    with pytest.raises(GeometryError):d.resolve_pick(source,r,'candidate',wrong)
    with pytest.raises(GeometryError):d.resolve_pick(source,r,'source-vertex',7)
    with pytest.raises(GeometryError):d.resolve_pick(source,r,'plane','not-retained')
    picked=d.resolve_pick(source,r,'plane',r['planeId'])
    assert picked['requiresCandidateDisambiguation'] and len(picked['candidateIds'])==7


@pytest.mark.parametrize('change',[
    lambda p:p['planes'][0]['exactPlane'].__setitem__(0,'42'),
    lambda p:p['candidates'][0]['cycle'].reverse(),
    lambda p:p['candidates'][0]['sourceFaceIds'].append(999),
    lambda p:p['symmetry']['candidateActionIndices'][0].pop(),
    lambda p:p.update(generationStatus='user-cancelled'),
    lambda p:p['symmetry']['group']['orientationSigns'].__setitem__(0,-1),
])
def test_forged_candidate_plane_cycle_ownership_or_action_receipt_is_refused(change):
    source=cube();pool=candidate_facets(source);change(pool)
    with pytest.raises(GeometryError):d.build_diagram(source,pool,{'vertex_id':0})


def test_limited_candidate_domain_does_not_become_global_exhaustion():
    source=cube();pool=candidate_facets(source,max_candidates=1)
    r=d.build_diagram(source,pool,{'vertex_id':0})
    assert r['status']=='complete' and r['candidateDomainStatus']=='resource-limited'
    assert not r['candidateDomainExhausted'] and not r['enumerationComplete']
    assert d.verify_diagram(source,r)==r


def test_incomplete_candidate_subgroup_action_cannot_replicate_selected_facet():
    source=cube();lookup={tuple(p):i for i,p in enumerate(source['vertices'])}
    mirror=[lookup[tuple(-x for x in p)] for p in source['vertices']]
    pool=candidate_facets(source,max_candidates=1,symmetry_permutations=[list(range(8)),mirror])
    assert pool['symmetry']['status']=='resource-limited'
    r=d.build_diagram(source,pool,{'vertex_id':0,'seed_ids':[pool['candidates'][0]['id']]})
    assert r['status']=='unsupported' and r['adoption'] is None
    assert not r['presentationComplete'] and d.verify_diagram(source,r)==r


def test_duplicate_native_face_cycle_with_conflicting_RGBA_is_not_arbitrarily_colored():
    source=cube();source['faces'].append(deepcopy(source['faces'][0]))
    source['metadata']['offColors']['faces'].append({'encoding':'byte','values':[255,0,0,127]})
    pool=candidate_facets(source)
    with pytest.raises(GeometryError,match='RGBA ownership is ambiguous'):
        d.build_diagram(source,pool,{'vertex_id':0,'seed_ids':ids(pool,[source['faces'][0]])})


def test_byte_RGBA_stays_literal_and_alpha_is_only_normalized_for_paint():
    source=cube();source['metadata']['offColors']['faces'][0]={'encoding':'byte','values':[10,20,30,128]}
    pool=candidate_facets(source)
    r=d.build_diagram(source,pool,{'kind':'plane','plane_id':plane(pool,source['faces'][0]),'seed_ids':ids(pool,[source['faces'][0]])})
    assert r['selection']['facets'][0]['sourceColor']==source['metadata']['offColors']['faces'][0]
    assert 'rgb(10,20,30)' in d.to_svg(r) and 'fill-opacity="0.501960784314"' in d.to_svg(r)


def test_collinear_overlap_is_exact_interval_evidence_and_not_a_repaired_edge():
    # Literal square with midpoint source vertex 4 on edge 0--1 and an off-plane apex.
    source=model([[0,0,0],[2,0,0],[2,2,0],[0,2,0],[1,0,0],[0,0,2]],
        [[0,4,1,2,3],[0,1,5],[1,2,5],[2,3,5],[3,0,5]])
    pool=candidate_facets(source,max_face_vertices=5)
    r=d.build_diagram(source,pool,{'kind':'plane','plane_id':plane(pool,[0,1,2,3,4])})
    assert r['status']=='complete'
    overlaps=[p for p in r['intersections'] if p['kind']=='collinear-overlap']
    assert overlaps and all(F(p['interval'][0])<F(p['interval'][1]) for p in overlaps)
    assert all(p['paintOnly'] for p in overlaps)
    assert r['sourceSnapshot']['edges']==source['edges'] and len(r['sourceSnapshot']['vertices'])==6


def test_near_infinity_retains_exact_finite_projective_point_without_perturbation():
    source=cube();pool=candidate_facets(source)
    r=d.build_diagram(source,pool,{'vertex_id':0,'center':['-2','-1','-1000001/1000000']})
    vertex=next(p for p in r['vertices'] if p['sourceVertexId']==1)
    assert vertex['status']=='finite' and abs(F(vertex['projectionParameter']))>500000
    assert vertex['exactCoordinates'] is not None and r['sourceSnapshot']==source
    assert d.verify_diagram(source,r)==r


def test_exact_finite_projection_beyond_paint_bounds_is_not_mislabeled_infinite():
    source=cube();pool=candidate_facets(source)
    center=['-2','-1',str(F(-1)-F(1,10**110))]
    r=d.build_diagram(source,pool,{'vertex_id':0,'center':center})
    vertex=next(p for p in r['vertices'] if p['sourceVertexId']==1)
    assert r['status']=='complete' and not r['presentationComplete']
    assert vertex['status']=='finite-unrenderable' and vertex['metricCoordinates'] is None
    assert F(vertex['homogeneous'][2])!=0 and vertex['exactCoordinates'] is not None
    assert 'finite paint omissions' in d.to_svg(r)
    assert d.verify_diagram(source,r)==r


@pytest.mark.parametrize('change',[
    lambda s:s.update(id='\ud800'),
    lambda s:s['metadata'].update(notes={1:'non-JSON key'}),
    lambda s:s['metadata'].update(coordinateUnits=10),
    lambda s:s['metadata'].update(coordinateUnits='x'*65),
    lambda s:s['metadata'].update(owner=float('inf')),
    lambda s:s['vertices'][0].__setitem__(0,10**1500),
    lambda s:s.update(embeddingDimension=4),
])
def test_malformed_full_source_is_bounded_before_copy_or_publication(change):
    source=cube();pool=candidate_facets(source);change(source)
    with pytest.raises(GeometryError):d.build_diagram(source,pool,{'vertex_id':0})


def test_deep_or_cyclic_JSON_parameters_are_rejected_before_deepcopy():
    source=cube();pool=candidate_facets(source);deep={};tail=deep
    for _ in range(80):tail['next']={};tail=tail['next']
    cycle=[];cycle.append(cycle)
    for bad in (deep,cycle):
        with pytest.raises(GeometryError):d.build_diagram(source,pool,{'vertex_id':0,'center':bad})


def test_unpaired_surrogate_parameter_and_invalid_svg_size_are_structured():
    source,pool,r=make()
    with pytest.raises(GeometryError):d.build_diagram(source,pool,{'vertex_id':0,'seed_ids':['\ud800']})
    for dimensions in ({'width':True},{'height':79},{'width':4097}):
        with pytest.raises(GeometryError):d.to_svg(r,**dimensions)


def test_stop_during_projection_retains_accounting_without_adopting_partial_selection():
    source,pool,full=make(kind='plane')
    incomplete=d.build_diagram(source,pool,{'kind':'plane','plane_id':full['planeId'],'max_work':full['workUsed']-1})
    assert incomplete['status']=='resource-limited'
    assert incomplete['workUsed']==full['workUsed']-1 and incomplete['adoption'] is None
    assert not incomplete['presentationComplete'] and not incomplete['enumerationComplete']
    assert d.verify_diagram(source,incomplete)==incomplete
