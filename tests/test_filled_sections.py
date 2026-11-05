from collections import Counter
from copy import deepcopy
from pathlib import Path
import json
import math
import subprocess
import sys
import numpy as np
import pytest
from engine import server
from engine.geometry import GeometryError, hull, identity, validate
from engine.generators import regular
from engine.star_polyhedra import kepler_poinsot
from engine.generalized_density import density_info
from engine.filled_sections import filled_section, LIMITS
from engine.operations import convex_section
from engine.history import canonical_model
from engine.recipes import run_recipe, replay_document
from engine.formats import parse_off, save_project, load_file


def compound(parts):
    d=parts[0]['dimension']
    result=dict(id='literal-compound',name='Literal compound',dimension=d,embeddingDimension=d,
                interpretation='generalized-complex',vertices=[],edges=[],faces=[],cells=[],metadata={'coordinateUnits':'cm'})
    for part in parts:
        v=len(result['vertices']);f=len(result['faces'])
        result['vertices']+=deepcopy(part['vertices'])
        result['edges'] += [[a+v,b+v] for a,b in part['edges']]
        result['faces'] += [[i+v for i in F] for F in part['faces']]
        result['cells'] += [[i+f for i in C] for C in part['cells']]
    return result


def octangula():
    p=np.array([[1,1,1],[1,-1,-1],[-1,1,-1],[-1,-1,1]])
    return compound([hull(p),hull(-p)])


def area(model):
    p=np.asarray(model['vertices'])
    return sum(abs(float(np.sum(p[F,0]*np.roll(p[F,1],-1)-p[F,1]*np.roll(p[F,0],-1))))/2 for F in model['faces'])


def closed(model):
    owners=Counter(tuple(sorted((a,b))) for F in model['faces'] for a,b in zip(F,F[1:]+F[:1]))
    assert owners and set(owners.values())=={2}
    signed=Counter()
    for F in model['faces']:
        for a,b in zip(F,F[1:]+F[:1]):signed[tuple(sorted((a,b)))]+=1 if a<b else -1
    assert set(signed.values())=={0}


@pytest.mark.parametrize('depth',[.125,.25,.6])
@pytest.mark.parametrize('rule',['nonzero','even-odd','threshold'])
def test_stella_octangula_independent_analytic_density_areas(depth,rule):
    source=octangula();before=deepcopy(source)
    result=filled_section(source,[0,0,1],depth,rule,2)
    values={r['density']:r['content'] for r in result['densityLegend']}
    # |x+y| <= 1±z and |x-y| <= 1∓z for the two tetrahedra.
    assert values[2]==pytest.approx(2*(1-depth)**2,abs=1e-9)
    assert values[1]==pytest.approx(8*depth*(1-depth),abs=1e-9)
    expected=values[1]+values[2] if rule=='nonzero' else values[1] if rule=='even-odd' else values[2]
    assert area(result['model'])==pytest.approx(expected,abs=1e-9)
    loops=result['model']['metadata']['densitySection']['boundaryLoops']
    edges=Counter(tuple(sorted(e)) for L in loops for e in zip(L,L[1:]+L[:1]))
    assert edges and set(edges.values())=={1}
    assert source==before and validate(result['model'])['passed']


def ray_degree3(source,query,signs):
    """Independent ray/triangle intersections, with signed fan multiplicity."""
    ray=np.array([1.,math.sqrt(2),math.sqrt(7)]);p=np.asarray(source['vertices']);total=0
    for face,sign in zip(source['faces'],signs):
        for i in range(1,len(face)-1):
            a,b,c=p[[face[0],face[i],face[i+1]]];u=b-a;v=c-a;normal=np.cross(u,v);den=float(normal@ray)
            if abs(den)<1e-12:continue
            t=float(normal@(a-query))/den
            if t<=0:continue
            weights=np.linalg.lstsq(np.column_stack([u,v]),query+t*ray-a,rcond=None)[0]
            if min(weights)>1e-9 and sum(weights)<1-1e-9:total+=sign*(1 if den>0 else -1)
    return total


@pytest.mark.parametrize('key',['small-stellated-dodecahedron','great-dodecahedron','great-stellated-dodecahedron','great-icosahedron'])
@pytest.mark.parametrize('depth',[.137,.251,.531])
def test_kepler_poinsot_multiple_depths_match_independent_ray_degree(key,depth):
    source=kepler_poinsot(key);before=deepcopy(source)
    result=filled_section(source,[.17,.23,1],depth)
    proof=density_info(source,point=[10,11,12]);signs=[f['orientationSign'] for f in proof['faces']]
    embedding=result['model']['metadata']['sectionEmbedding'];basis=np.asarray(embedding['basis']);origin=np.asarray(embedding['origin'])
    assert result['densityDiagnostics']['maxIntegerResidual']<1e-10
    for record in result['model']['metadata']['densitySection']['regions']:
        query=origin+basis@record['witness']
        assert ray_degree3(source,query,signs)==record['density']
    if key=='great-dodecahedron' and depth<.3:assert {1,2,3}<={x['density'] for x in result['densityLegend']}
    assert source==before


@pytest.mark.parametrize('key',['tetrahedron','cube','octahedron','dodecahedron','icosahedron','simplex4','tesseract','cross4','cell24','cell120','cell600'])
def test_convex_path_matches_established_kernel_coordinates_and_incidence(key):
    source=regular(key);d=source['dimension'];n=[.17,.23,1] if d==3 else [.17,.23,.31,1]
    old=convex_section(source,n,.137);new=filled_section(source,n,.137)
    assert canonical_model(old['model'])==canonical_model(new['model'])
    assert old['intersection']==new['intersection'] and old['basis']==new['basis']
    assert new['densityLegend'][0]['density']==1
    assert filled_section(source,n,.137,'threshold',2)['model'] is None


@pytest.mark.parametrize('key',['cube','dodecahedron','simplex4','tesseract','cross4','cell24'])
def test_generalized_convex_boundary_matches_convex_section_measure_and_vertices(key):
    convex=regular(key);source=deepcopy(convex);source['interpretation']='generalized-complex'
    d=source['dimension'];n=[.17,.23,1] if d==3 else [.17,.23,.31,1]
    expected=convex_section(convex,n,.137)['model'];result=filled_section(source,n,.137)
    assert [x['density'] for x in result['densityLegend']]==[1]
    assert result['densityLegend'][0]['content']==pytest.approx(expected['measure']['content'],rel=1e-8)
    a=np.array(expected['vertices']);b=np.array(result['model']['vertices'])
    assert len(a)==len(b)
    assert max(min(np.linalg.norm(x-y) for y in b) for x in a)<1e-8
    if d==4:closed(result['model'])


@pytest.mark.parametrize('rule',['nonzero','even-odd','threshold'])
def test_4d_compound_tesseracts_density_two_overlap_and_selected_closed_boundary(rule):
    a=regular('tesseract');b=deepcopy(a);b['vertices']=(np.asarray(b['vertices'])+[.5,0,0,0]).tolist();source=compound([a,b])
    result=filled_section(source,[0,0,0,1],.2,rule,2);closed(result['model'])
    values={r['density']:r['content'] for r in result['densityLegend']}
    assert values==pytest.approx({1:4.,2:6.},abs=1e-8)
    degree=density_info(result['model'],point=[0,0,0])
    assert degree['status']=='qualified'
    assert degree['measures']['orientedAlgebraicVolume']==pytest.approx(10 if rule=='nonzero' else 4 if rule=='even-odd' else 6,abs=1e-8)


DATA=Path(__file__).resolve().parents[1]/'engine/catalog_data/miratope'
STARS=[e for e in json.loads((DATA/'manifest.json').read_text())['entries'] if e['registration']=='regular-star']


@pytest.mark.parametrize('entry',STARS,ids=[e['name'] for e in STARS])
def test_all_ten_registered_star_polychora_shallow_closed_density_sections(entry):
    source=parse_off((DATA/entry['file']).read_text(),entry['name']);before=deepcopy(source)
    p=np.asarray(source['vertices']);n=np.array([.173,.239,.317,1]);n/=np.linalg.norm(n);levels=sorted(p@n)
    depth=float(.99*levels[-1]+.01*levels[-2]);result=filled_section(source,n.tolist(),depth)
    assert result['status']=='filled-density-section';closed(result['model'])
    assert result['densityDiagnostics']['maxIntegerResidual']<1e-6
    assert result['densityLegend'] and all(x['density']>=1 for x in result['densityLegend'])
    assert source==before
    if entry['name']=='Grand hexacosichoron':assert {1,2,3}<={x['density'] for x in result['densityLegend']}


def test_scale_translation_reflection_and_normal_rescaling():
    source=octangula();original=filled_section(source,[.17,.23,1],.137)
    changed=deepcopy(source);p=np.asarray(source['vertices']);translation=np.array([7,-3,2]);n=np.array([.17,.23,1]);n/=np.linalg.norm(n)
    changed['vertices']=(p*3+translation).tolist();scaled=filled_section(changed,(n*7).tolist(),.137*3+float(n@translation))
    assert {r['density']:r['content'] for r in scaled['densityLegend']}==pytest.approx({r['density']:r['content']*9 for r in original['densityLegend']},rel=1e-8)
    changed['vertices']=(-p).tolist();reflected=filled_section(changed,[.17,.23,1],-.137)
    assert {r['density']:r['content'] for r in reflected['densityLegend']}==pytest.approx({r['density']:r['content'] for r in original['densityLegend']},rel=1e-8)


def test_empty_contact_open_cellless_and_resource_diagnostics(monkeypatch):
    source=octangula();assert filled_section(source,[0,0,1],3)['status']=='empty'
    with pytest.raises(GeometryError,match='vertex/edge/coplanar'):filled_section(source,[0,0,1],1)
    cube=regular('cube');cube['interpretation']='generalized-complex'
    with pytest.raises(GeometryError,match='vertex/edge/coplanar'):filled_section(cube,[0,0,1],1)
    opened=deepcopy(source);opened['faces'].pop()
    with pytest.raises(GeometryError,match='two distinct incident faces'):filled_section(opened,[0,0,1],.2)
    four=regular('tesseract');four['interpretation']='generalized-complex';four['cells']=[]
    with pytest.raises(GeometryError,match='explicit closed source cells'):filled_section(four,[0,0,0,1],.2)
    monkeypatch.setitem(LIMITS,'planes',1)
    with pytest.raises(GeometryError,match='supporting planes'):filled_section(source,[0,0,1],.25)
    monkeypatch.setitem(LIMITS,'planes',64);monkeypatch.setitem(LIMITS,'regions',2)
    with pytest.raises(GeometryError,match='no partial fill'):filled_section(source,[0,0,1],.25)


def test_native_dispatch_recipe_undo_redo_save_open_and_replay(tmp_path):
    source=kepler_poinsot('great-dodecahedron');source['metadata']['coordinateUnits']='cm'
    view=dict(derivedMode='section',sectionNormal=[.17,.23,1],sectionOffset=.137,coordinateUnit='cm',densitySection=dict(enabled=True,rule='threshold',threshold=2),documentMetadata={'title':'Density notes'})
    document=dict(id='source',states=[dict(model=source,view=view,notes='Retain original notes')],cursor=0)
    params=dict(normal=view['sectionNormal'],offset=.137,fill_rule='threshold',density_threshold=2,section_domain='density')
    preview=server.dispatch(dict(op='section',model=source,params=params));before=deepcopy(document)
    built=run_recipe(document,'section',params,server.dispatch,'Promote density ≥ 2');assert document==before
    assert built['states'][1]['model']==preview['model'];assert built['states'][1]['notes']=='Retain original notes'
    assert built['states'][1]['view']['coordinateUnit']=='cm' and 'densitySection' not in built['states'][1]['view']
    path=tmp_path/'filled.polyproj';save_project(path,dict(format='polytope-laboratory',version=1,active=0,documents=[built]))
    opened=load_file(path)['project']['documents'][0]
    assert opened['states'][0]['model']==source and opened['states'][1]['model']==preview['model']
    assert replay_document(opened,server.dispatch)['states'][0]['model']==preview['model']
    opened['cursor']=0;assert opened['states'][opened['cursor']]['model']==source
    opened['cursor']=1;assert opened['states'][opened['cursor']]['model']==preview['model']


def test_json_lines_dispatch_refusal_does_not_break_reusable_section_worker():
    source=octangula();valid=dict(op='section',model=source,params=dict(normal=[0,0,1],offset=.25,section_domain='density'))
    requests=[{**valid,'params':{**valid['params'],'density_threshold':False}},valid]
    child=subprocess.run([sys.executable,'-B','engine/server.py'],input=''.join(json.dumps(r)+'\n' for r in requests),text=True,capture_output=True,timeout=30)
    assert child.returncode==0,child.stderr
    responses=[json.loads(line) for line in child.stdout.splitlines()]
    assert len(responses)==2 and not responses[0]['ok'] and responses[1]['ok']
    assert responses[1]['result']['status']=='filled-density-section'
