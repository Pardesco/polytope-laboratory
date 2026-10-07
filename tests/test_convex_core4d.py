"""Literal4D cellular halfspace fixtures; no source vertex-Hull oracle."""
from copy import deepcopy
from fractions import Fraction
from itertools import combinations, product
import hashlib
import json
import math
import os
import subprocess
from types import SimpleNamespace

import numpy as np
import pytest

import engine.convex_core4d as kernel
from engine.convex_core4d import convex_core4d,verify_convex_core4d_evidence
from engine.augmentation_workflow import equivalent_json
from engine.formats import load_file,save_project,validate_project
from engine.geometry import GeometryError,identity,validate
from engine.history import _json_bytes
from engine.compounds import add_models,extract_component
from engine.operations import transform
from engine.products import polygon_product
from engine.star_polygons import regular_star_polygon


def colors(n):return [{'encoding':'byte','values':[20+i,50,100,120+i]} for i in range(n)]


def model(vertices,faces,cells,name):
    edges=sorted({tuple(sorted((a,b))) for f in faces for a,b in zip(f,f[1:]+f[:1])})
    return {'id':name,'name':name,'dimension':4,'embeddingDimension':4,'interpretation':'generalized-complex',
        'vertices':vertices,'edges':[list(e) for e in edges],'faces':faces,'cells':cells,'numeric':{'certified':False},
        'metadata':{'coordinateUnits':'mm','retainedAttributes':{'literal':1.0,'negativeZero':-0.0},
            'offColors':{'faces':colors(len(faces)),'cells':colors(len(cells))}}}


def tesseract(size=1.):
    vertices=[list(p) for p in product((-size,size),repeat=4)];lookup={tuple(p):i for i,p in enumerate(vertices)};faces=[]
    for free in combinations(range(4),2):
        fixed=[a for a in range(4) if a not in free]
        for signs in product((-size,size),repeat=2):
            f=[]
            for a,b in [(-size,-size),(size,-size),(size,size),(-size,size)]:
                p=[0]*4
                for axis,value in zip(fixed,signs):p[axis]=value
                p[free[0]]=a;p[free[1]]=b;f.append(lookup[tuple(p)])
            faces.append(f)
    cells=[[fi for fi,f in enumerate(faces) if all(vertices[v][axis]==sign for v in f)]
        for axis in range(4) for sign in (-size,size)]
    return model(vertices,faces,cells,'literal-tesseract')


def simplex():
    vertices=[[0]*4]+[[int(i==j) for j in range(4)] for i in range(4)]
    faces=[list(f) for f in combinations(range(5),3)]
    cells=[[fi for fi,f in enumerate(faces) if set(f)<=set(c)] for c in combinations(range(5),4)]
    return model(vertices,faces,cells,'literal-right-5cell')


def core(source=None,**kwargs):return convex_core4d(tesseract() if source is None else source,center=kwargs.pop('center',[0]*4),**kwargs)
def evidence(m):return m['metadata']['convexCore4d']
def counts(m):return tuple(len(m[k]) for k in ('vertices','edges','faces','cells'))
def project(m):return {'format':'polytope-laboratory','version':1,'active':0,'documents':[{'id':'core4d-doc','cursor':0,'states':[{'model':m,'view':{}}]}]}
def point(p):return tuple(round(v,9) for v in p)
def cycle(f):return min(tuple(row[i:]+row[:i]) for row in [f,f[::-1]] for i in range(len(f)))


def assert_literal_tesseract(m,size=1.):
    assert counts(m)==(16,32,24,8)
    assert {tuple(p) for p in m['vertices']}==set(product((-size,size),repeat=4))
    expected_edges={tuple(sorted((a,b))) for a,b in combinations(range(16),2)
        if sum(x!=y for x,y in zip(m['vertices'][a],m['vertices'][b]))==1}
    assert {tuple(sorted(e)) for e in m['edges']}==expected_edges
    expected_faces=set()
    for fixed in combinations(range(4),2):
        for signs in product((-size,size),repeat=2):
            expected_faces.add(frozenset(i for i,p in enumerate(m['vertices']) if all(p[a]==s for a,s in zip(fixed,signs))))
    assert {frozenset(f) for f in m['faces']}==expected_faces
    for f in m['faces']:
        assert len(f)==4 and all(tuple(sorted((a,b))) in expected_edges for a,b in zip(f,f[1:]+f[:1]))
    expected_cells={frozenset(i for i,p in enumerate(m['vertices']) if p[axis]==sign) for axis in range(4) for sign in (-size,size)}
    assert {frozenset(v for fi in c for v in m['faces'][fi]) for c in m['cells']}==expected_cells
    assert all(sum(fi in c for c in m['cells'])==2 for fi in range(len(m['faces'])))


def test_literal_tesseract_has_full_boundary_independent_cell_supports_and_native_measures():
    source=tesseract();before=deepcopy(source);m=core(source);assert_literal_tesseract(m)
    assert source==before and m['numeric']['certified'] is False and m['interpretation']=='convex-polytope'
    assert m['measure']['content']==pytest.approx(16) and m['measure']['boundaryMeasure']==pytest.approx(64)
    e=evidence(m);assert e['sourceModel']==equivalent_json(source)
    assert len(e['sourceCellHyperplaneRecords'])==8 and len(e['hyperplaneGroups'])==8
    assert len(e['boundedness']['objectives'])==8 and e['boundedness']['clippingBoxUsed'] is False
    assert e['enumeration']['testedHyperplaneQuadruples']==70 and e['enumeration']['retainedUniqueAnchorIntersections']==16
    assert e['classification']['sourceModelId']==m['id'] and e['classification']['sourceFingerprint']==identity(m)
    assert m['metadata']['coordinateUnits']=='mm' and m['metadata']['offColors']['faces']==[None]*24
    for row in e['cellSupportOwners']:
        assert len(row['sourceCellIds'])==1;ci=row['sourceCellIds'][0]
        assert m['metadata']['offColors']['cells'][row['resultCellId']]==source['metadata']['offColors']['cells'][ci]
        original={tuple(source['vertices'][v]) for fi in source['cells'][ci] for v in source['faces'][fi]}
        current={tuple(m['vertices'][v]) for fi in m['cells'][row['resultCellId']] for v in m['faces'][fi]}
        assert original==current


def test_right_5cell_supporting_inequalities_exact_vertices_and_four_volume():
    source=simplex();m=core(source,center=[.2]*4);assert counts(m)==(5,10,10,5)
    assert {tuple(p) for p in m['vertices']}=={tuple(p) for p in source['vertices']}
    assert all(all(x>=0 for x in p) and sum(p)<=1 for p in m['vertices'])
    assert m['measure']['content']==pytest.approx(1/24)
    assert m['measure']['boundaryMeasure']==pytest.approx(1)
    expected={frozenset(c) for c in combinations(range(5),4)}
    assert {frozenset(v for fi in c for v in m['faces'][fi]) for c in m['cells']}==expected
    assert verify_convex_core4d_evidence(m)['passed']


@pytest.mark.parametrize('step',[2,3,-2,-3])
def test_actual_literal_crossed_polygon_product_core_uses_cell_hyperplanes_not_vertex_hull(step):
    left=regular_star_polygon(5,step);right=regular_star_polygon(4,radius=math.sqrt(2))
    source=polygon_product(left,right);source['metadata'].update(coordinateUnits='mm',rawSymbol=f'5/{step}')
    source['metadata']['offColors']={'faces':colors(len(source['faces'])),'cells':colors(len(source['cells']))}
    before=deepcopy(source);m=core(source);assert counts(m)==(20,40,29,9) and source==before
    radius=(3-math.sqrt(5))/2
    for p in m['vertices']:
        assert math.hypot(*p[:2])==pytest.approx(radius)
        assert math.hypot(*p[2:])==pytest.approx(math.sqrt(2))
    assert len({point(p[:2]) for p in m['vertices']})==5 and len({point(p[2:]) for p in m['vertices']})==4
    area=2.5*radius**2*math.sin(2*math.pi/5);perimeter=10*radius*math.sin(math.pi/5)
    assert m['measure']['content']==pytest.approx(area*4)
    assert m['measure']['boundaryMeasure']==pytest.approx(perimeter*4+area*8)
    assert evidence(m)['sourceModel']['metadata']['rawSymbol']==f'5/{step}'
    assert evidence(m)['sourceModel']['metadata']['orderedProduct']==equivalent_json(source['metadata']['orderedProduct'])
    assert m['metadata']['offColors']['faces']==[None]*29
    assert all(len(row['sourceCellIds'])==1 for row in evidence(m)['cellSupportOwners'])


def test_source_snapshot_hash_and_exact_quadruple_side_witnesses_recompute_independently():
    m=core();e=evidence(m)
    assert e['sourceBinding']['sourceSnapshotSha256']==hashlib.sha256(_json_bytes(e['sourceModel'])).hexdigest()
    planes=[[Fraction(x) for x in g['exactOrientedAnchorHyperplane']] for g in e['hyperplaneGroups']]
    for row in e['vertexHyperplaneLineage']:
        p=[Fraction(x) for x in row['exactAnchorIntersection']]
        values=[sum(a*b for a,b in zip(plane[:4],p))+plane[4] for plane in planes]
        assert all(value<=0 for value in values)
        assert row['hyperplaneGroupIds']==[i for i,value in enumerate(values) if value==0]
        for group in row['hyperplaneQuadruples']:assert len(group)==4 and all(values[i]==0 for i in group)


def test_real_sixteen_hyperplane_sixtyfour_vertex_frontier_is_complete_rational_octagon_product():
    vertices=[[1,2],[-1,2],[-2,1],[-2,-1],[-1,-2],[1,-2],[2,-1],[2,1]]
    def polygon(name):
        return {'id':name,'name':name,'dimension':2,'embeddingDimension':2,'interpretation':'generalized-complex',
            'vertices':deepcopy(vertices),'edges':[[i,(i+1)%8] for i in range(8)],'faces':[list(range(8))],
            'cells':[],'numeric':{'certified':False},'metadata':{}}
    source=polygon_product(polygon('integer-octagon-left'),polygon('integer-octagon-right'))
    m=core(source);assert counts(m)==(64,128,80,16)
    assert {tuple(p) for p in m['vertices']}=={tuple(p) for p in source['vertices']}
    assert len(evidence(m)['hyperplaneGroups'])==16
    assert evidence(m)['enumeration']['testedHyperplaneQuadruples']==1820
    assert evidence(m)['enumeration']['termination'].startswith('exhausted')
    assert m['measure']['content']==pytest.approx(196)
    assert m['measure']['boundaryMeasure']==pytest.approx(224+112*math.sqrt(2))


def test_translated_affine_5cell_uses_literal_cell_inequalities_and_keeps_full_source_attributes():
    source=simplex();source['vertices']=[[x*scale+offset for x,scale,offset in zip(p,[2,3,4,5],[7,-8,9,-10])] for p in source['vertices']]
    m=core(source,center=[7.4,-7.4,9.8,-9])
    assert counts(m)==(5,10,10,5) and {tuple(p) for p in m['vertices']}=={tuple(p) for p in source['vertices']}
    assert m['measure']['content']==pytest.approx(5)
    assert evidence(m)['sourceModel']==equivalent_json(source)


def test_literal_cell_face_order_and_cycle_reversal_do_not_change_hyperplane_chamber():
    source=tesseract();source['faces']=[face[::-1] for face in source['faces']]
    source['cells']=[cell[::-1] for cell in source['cells']]
    m=core(source);assert_literal_tesseract(m)
    assert evidence(m)['sourceModel']['faces']==source['faces'] and evidence(m)['sourceModel']['cells']==source['cells']
    assert verify_convex_core4d_evidence(m)['passed']


def test_genuine_compound_leaf_snapshots_and_current_source_maps_are_historical_without_false_output_components():
    source=add_models(tesseract(),tesseract());source['metadata']['coordinateUnits']='mm'
    before=deepcopy(source);m=core(source);assert_literal_tesseract(m)
    historical=evidence(m)['sourceModel'];assert historical==equivalent_json(source)
    assert 'components' not in m and 'compound' not in m['metadata']
    assert len(historical['components'])==2
    for row in historical['components']:
        leaf=extract_component(historical,row['id']);assert counts(leaf)==(16,32,24,8)
        assert {tuple(p) for p in leaf['vertices']}==set(product((-1,1),repeat=4))
    assert all(len(row['sourceCellIds'])==2 for row in evidence(m)['cellSupportOwners'])
    assert source==before and verify_convex_core4d_evidence(m)['passed']


def test_actual_native_transform_uses_genuine_derived_facet_vertices_and_marks_core_evidence_historical():
    m=core();changed=transform(m,scale=2)
    assert_literal_tesseract(changed,2)
    assert changed['measure']['content']==pytest.approx(256)
    assert changed['metadata']['offColors']==m['metadata']['offColors']
    assert validate(changed)['passed']
    with pytest.raises(GeometryError,match='stale'):verify_convex_core4d_evidence(changed)


def append_cube_cell(source,coords):
    # A literal3D cube mapped into a requested4D hyperplane; all IDs explicit.
    cube_vertices=list(product((-1,1),repeat=3));vertex_offset=len(source['vertices']);source['vertices'].extend([coords(p) for p in cube_vertices])
    faces=[]
    for axis in range(3):
        for sign in (-1,1):
            free=[i for i in range(3) if i!=axis];lookup={tuple(p):i for i,p in enumerate(cube_vertices)};f=[]
            for a,b in [(-1,-1),(1,-1),(1,1),(-1,1)]:
                p=[0]*3;p[axis]=sign;p[free[0]]=a;p[free[1]]=b;f.append(vertex_offset+lookup[tuple(p)])
            faces.append(f)
    face_offset=len(source['faces']);source['faces'].extend(faces);source['cells'].append(list(range(face_offset,face_offset+6)))
    source['edges'].extend([list(e) for e in sorted({tuple(sorted((a,b))) for f in faces for a,b in zip(f,f[1:]+f[:1])})])
    source['metadata']['offColors']['faces'].extend([None]*6);source['metadata']['offColors']['cells'].append(None)


def test_exact_through_center_cell_is_ignored_but_source_faces_and_coords_retained():
    source=tesseract();append_cube_cell(source,lambda p:[p[0],-p[0],p[1],p[2]])
    m=core(source);assert_literal_tesseract(m)
    assert evidence(m)['ignoredSourceCellIds']==[8]
    record=evidence(m)['sourceCellHyperplaneRecords'][8]
    assert record['status']=='ignored-through-center' and record['centerDistanceNormalized']==0
    assert evidence(m)['sourceModel']==equivalent_json(source)


@pytest.mark.parametrize('center',[[1,0,0,0],[2,0,0,0]])
def test_center_boundary_or_outside_leads_to_genuine_unbounded_refusal(center):
    with pytest.raises(GeometryError,match='unbounded'):core(center=center)


@pytest.mark.parametrize('delta',[1e-13,-1e-13,1e-10])
def test_nonzero_near_center_cell_is_never_ignored(delta):
    with pytest.raises(GeometryError,match='near-center'):core(center=[1-delta,0,0,0])


def test_missing_source_cell_halfspace_is_unbounded_without_fake_clipping_box():
    source=tesseract();source['cells'].pop();source['metadata']['offColors']['cells'].pop()
    with pytest.raises(GeometryError,match='unbounded'):core(source)


def test_exact_duplicate_cell_hyperplane_retains_all_support_owners_and_color_conflict_refuses():
    source=tesseract();source['cells'].append(deepcopy(source['cells'][0]))
    source['metadata']['offColors']['cells'].append(deepcopy(source['metadata']['offColors']['cells'][0]))
    m=core(source);assert_literal_tesseract(m)
    assert any(row['sourceCellIds']==[0,8] for row in evidence(m)['cellSupportOwners'])
    source['metadata']['offColors']['cells'][-1]['values'][3]=55
    with pytest.raises(GeometryError,match='ambiguous RGBA'):core(source)
    cleared=core(source,color_policy='none');assert 'offColors' not in cleared['metadata']
    assert evidence(cleared)['sourceModel']==equivalent_json(source)


@pytest.mark.parametrize('epsilon,accepted',[(1e-12,False),(1e-5,True)])
def test_distinct_near_coincident_cell_hyperplanes_refuse_without_rounding_or_welding(epsilon,accepted):
    source=tesseract();append_cube_cell(source,lambda p:[1-epsilon,*p])
    if not accepted:
        with pytest.raises(GeometryError,match='near-coincident'):core(source)
    else:
        m=core(source);assert counts(m)==(16,32,24,8)
        assert max(p[0] for p in m['vertices'])==1-epsilon
        assert m['measure']['content']==pytest.approx(16-8*epsilon)
        assert any(g['sourceCellIds']==[1] and g['role']=='redundant' for g in evidence(m)['hyperplaneGroups'])


@pytest.mark.parametrize('size,convex',[(1e50,True),(1e99,False),(1e-50,True),(1e-100,False)])
def test_actual4d_overflow_underflow_keeps_native_valid_generalized_chamber_without_measure(size,convex):
    m=core(tesseract(size));assert_literal_tesseract(m,size)
    assert m['interpretation']==('convex-polytope' if convex else 'generalized-complex')
    assert ('measure' in m)==convex and evidence(m)['nativeMeasureGate']['status']==('passed' if convex else 'unsupported')
    detached=json.loads(_json_bytes(project(m)));validate_project(detached)
    assert equivalent_json(detached['documents'][0]['states'][0]['model'])==equivalent_json(m)


def test_native_file_and_actual_headless_node_json_preserve_full_cell_rgba_and_source_snapshots(tmp_path):
    m=core();p=project(m);code="let t='';process.stdin.on('data',c=>t+=c).on('end',()=>process.stdout.write(JSON.stringify(JSON.parse(t))));"
    child=subprocess.run(['node','-e',code],input=_json_bytes(p).decode('utf-8'),encoding='utf-8',capture_output=True,timeout=20,
        creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
    assert child.returncode==0,child.stderr
    transcoded=json.loads(child.stdout);validate_project(transcoded);target=tmp_path/'core4d.json';save_project(target,transcoded)
    restored=load_file(target)['project']['documents'][0]['states'][0]['model']
    assert equivalent_json(restored)==equivalent_json(m) and verify_convex_core4d_evidence(restored)['passed']


@pytest.mark.parametrize('change',[
    lambda s:s['vertices'][0].__setitem__(3,-.9),
    lambda s:s['edges'][0].__setitem__(0,0.),
    lambda s:s['cells'][0].__setitem__(0,999),
    lambda s:s['metadata']['offColors']['cells'][0]['values'].__setitem__(3,256),
    lambda s:s['metadata'].update(invalidUnicode='\ud800'),
    lambda s:s['metadata'].update(unsafeInteger=10**500),
    lambda s:s.update(embeddingDimension=3),
    lambda s:s.update(id='\ud800'),
])
def test_malformed_source_syntax_or_hyperplane_geometry_refuses_atomically(change):
    source=tesseract();change(source);before=deepcopy(source)
    with pytest.raises(GeometryError):core(source)
    assert source==before


@pytest.mark.parametrize('kwargs',[
    {'center':[True,0,0,0]},{'center':[10**500,0,0,0]},{'center':[0]*3},
    {'center':[float('nan'),0,0,0]},{'tolerance':0},{'tolerance':1e-4},
    {'color_policy':'invent'},{'unknown':True},
])
def test_malformed_parameters_are_structured_geometry_errors(kwargs):
    with pytest.raises(GeometryError):core(**kwargs)


@pytest.mark.parametrize('key,value',[
    ('sourceVertices',15),('sourceCells',7),('cellVertices',7),('sourceIncidenceReferences',20),
    ('distinctHyperplanes',7),('hyperplaneQuadruples',10),('outputVertices',15),('fractionBits',2),
    ('inputBytes',30),('outputBytes',30),
])
def test_resource_caps_refuse_complete_source_immutably(monkeypatch,key,value):
    source=tesseract();before=deepcopy(source);monkeypatch.setitem(kernel.LIMITS,key,value)
    with pytest.raises(GeometryError):core(source)
    assert source==before


def test_lp_unresolved_or_fake_infeasible_witness_cannot_pass_boundedness(monkeypatch):
    monkeypatch.setattr(kernel,'linprog',lambda *a,**k:SimpleNamespace(status=4,x=None,fun=0,message='unresolved'))
    with pytest.raises(GeometryError,match='unresolved'):core()
    monkeypatch.setattr(kernel,'linprog',lambda *a,**k:SimpleNamespace(status=0,x=np.array([999]*4),fun=0,message='fake'))
    with pytest.raises(GeometryError,match='witness'):core()


def test_all_eight_lp_objectives_have_unrestricted_variables_and_correct_axes(monkeypatch):
    original=kernel.linprog;calls=[]
    def tracked(objective,**kwargs):calls.append((objective.tolist(),kwargs['bounds']));return original(objective,**kwargs)
    monkeypatch.setattr(kernel,'linprog',tracked);core()
    assert len(calls)==8
    assert {tuple(row) for row,_ in calls}=={tuple(sign if j==axis else 0 for j in range(4)) for axis in range(4) for sign in (-1,1)}
    assert all(bounds==[(None,None)]*4 for _,bounds in calls)


@pytest.mark.parametrize('change',[
    lambda m:m['metadata'].__setitem__('coordinateUnits','cm'),
    lambda m:m['metadata']['offColors']['cells'][0]['values'].__setitem__(3,55),
    lambda m:evidence(m)['sourceBinding'].__setitem__('sourceSnapshotSha256','0'*64),
    lambda m:evidence(m)['cellSupportOwners'][0]['sourceCellIds'].__setitem__(0,99),
    lambda m:evidence(m)['vertexHyperplaneLineage'][0]['hyperplaneQuadruples'][0].__setitem__(0,99),
    lambda m:evidence(m)['boundedness']['objectives'][0].__setitem__('objectiveValue',99),
    lambda m:evidence(m)['sourceModel']['faces'][0].reverse(),
    lambda m:evidence(m)['sourceModel']['metadata']['offColors']['faces'][0]['values'].__setitem__(3,77),
    lambda m:evidence(m)['classification'].__setitem__('sourceModelId','wrong'),
    lambda m:m['facetVertices'][0].reverse(),
    lambda m:m['measure'].__setitem__('content',99),
])
def test_full_evidence_reconstruction_rejects_geometry_equivalent_attribute_and_lineage_tamper(change):
    m=core();change(m)
    assert validate(m)['passed']
    with pytest.raises(GeometryError):verify_convex_core4d_evidence(m)


def test_zero_cell_plane_domain_rank_and_cyclic_deep_json_refusals():
    source=tesseract();source['cells']=[];source['metadata']['offColors']['cells']=[]
    with pytest.raises(GeometryError,match='CELL'):core(source)
    source=tesseract();source['vertices']=[p[:3]+[0] for p in source['vertices']]
    with pytest.raises(GeometryError):core(source)
    source=tesseract();source['metadata']['cycle']=source
    with pytest.raises(GeometryError,match='cyclic'):core(source)
    source=tesseract();nested={};source['metadata']['deep']=nested
    for _ in range(80):nested['child']={};nested=nested['child']
    with pytest.raises(GeometryError,match='structural'):core(source)
