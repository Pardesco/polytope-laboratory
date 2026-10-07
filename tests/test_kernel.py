import json
import math
import numpy as np
import pytest
from engine.generators import CATALOG, regular, generate
from engine.geometry import hull, analyze, validate, GeometryError, identity
from engine.operations import dual, section, truncate, vertex_figure, transform, signed_symmetry, measure
from engine.formats import export_off, parse_off, save_project, load_file, export_model
from engine.expressions import evaluate, exact_orientation


@pytest.mark.parametrize('entry',CATALOG,ids=lambda x:x['key'])
def test_catalog_counts_and_regular_edges(entry):
    m = regular(entry['key'])
    assert [len(m[k]) for k in ('vertices','edges','faces','cells')] == entry['counts']
    a = analyze(m)
    assert m['validation']['passed']
    if entry.get('edgeUniform',True):
        assert a['edgeLength']['min'] == pytest.approx(a['edgeLength']['max'],rel=1e-7)


def test_analytic_contents():
    assert regular('cube')['measure']['content'] == pytest.approx(8)
    assert regular('cube')['measure']['boundaryMeasure'] == pytest.approx(24)
    assert regular('tesseract')['measure']['content'] == pytest.approx(16)
    assert regular('tesseract')['measure']['boundaryMeasure'] == pytest.approx(64)
    assert regular('cross4')['measure']['content'] == pytest.approx(2/3)


@pytest.mark.parametrize('key',['tesseract','cell24','cell600'])
def test_hull_cell_incidence_matches_independent_face_containment(key):
    m=regular(key)
    face_sets=[set(face) for face in m['faces']]
    for cell in m['cells']:
        vertices=set().union(*(face_sets[i] for i in cell))
        assert cell==[i for i,face in enumerate(face_sets) if face<=vertices]


@pytest.mark.parametrize('key',['tetrahedron','cube','icosahedron','simplex4','tesseract','cell24','cell600'])
def test_dual_dual_recovers_geometry(key):
    m = regular(key)
    result = dual(dual(m))
    distances = np.linalg.norm(np.asarray(m['vertices'])[:,None,:]-np.asarray(result['vertices'])[None,:,:],axis=2)
    assert max(distances.min(axis=1)) < 1e-7
    assert [len(result[k]) for k in ('vertices','edges','faces','cells')] == [len(m[k]) for k in ('vertices','edges','faces','cells')]


def test_section_events():
    t = regular('tesseract')
    for depth in (-1,-0.5,0,0.5,1):
        s = section(t,offset=depth)
        assert s['status'] == 'full-dimensional'
        assert [len(s['model'][k]) for k in ('vertices','edges','faces')] == [8,12,6]
        assert s['model']['measure']['content'] == pytest.approx(8)
    assert section(t,offset=1.1)['status'] == 'empty'
    s = section(t,normal=[1,1,1,1],offset=2)
    assert s['status'] == 'degenerate' and s['affineDimension'] == 0
    assert section(t,normal=[1,1,1,1],offset=0)['model']['measure']['content'] > 0
    c = section(regular('cube'),offset=0)['model']
    assert len(c['vertices']) == 4 and c['measure']['content'] == pytest.approx(4)


def test_vertex_figures():
    assert len(vertex_figure(regular('cube'))['model']['vertices']) == 3
    assert [len(vertex_figure(regular('tesseract'))['model'][k]) for k in ('vertices','edges','faces')] == [4,6,4]
    assert len(vertex_figure(regular('cell600'))['model']['vertices']) == 12


def test_product_counts_and_measure():
    n,m = 5,7
    p = generate('duoprism',n=n,m=m)
    assert [len(p[k]) for k in ('vertices','edges','faces','cells')] == [n*m,2*n*m,n*m+n+m,n+m]
    assert p['measure']['content'] == pytest.approx(n*m/4*math.sin(2*math.pi/n)*math.sin(2*math.pi/m))
    for kind,counts in [('prism',[10,15,7]),('antiprism',[10,20,12]),('pyramid',[6,10,6])]:
        p = generate(kind,n=5)
        assert [len(p[k]) for k in ('vertices','edges','faces')] == counts
    assert generate('waterman',radiusSquared=2)['metadata']['lattice'] == 'FCC integer-even-sum'


def test_small_and_large_scales_are_covariant():
    m = regular('tesseract')
    for s in (1e-9, 7, 1e9):
        t = transform(m,scale=s)
        assert t['measure']['content'] == pytest.approx(16*s**4)
        assert len(section(t)['model']['vertices']) == 8


def test_symmetry_preserves_full_incidence():
    group = signed_symmetry(regular('tesseract'))
    assert group['complete'] and group['order'] == 384 and group['properOrder'] == 192
    assert signed_symmetry(regular('cube'))['order'] == 48
    assert not signed_symmetry(regular('cell24'))['complete']


@pytest.mark.parametrize('key',['cube','tesseract','cell24','cell600'])
def test_off_roundtrip_preserves_topology(key):
    m = regular(key)
    imported = parse_off(export_off(m))
    assert identity(m) == identity(imported)
    assert imported['interpretation'] == 'convex-polytope'
    assert imported['validation']['passed']


def test_malformed_imports_and_degeneracy():
    for text in ('OFF\n3 1 0\n0 0 0\n1 0 0\n0 1 0\n3 0 1 99', '4OFF\n5 10 10 5\n', 'OFF\n-1 0 0', 'OFF\n1 0 0\nnan 0 0'):
        with pytest.raises(GeometryError): parse_off(text)
    with pytest.raises(GeometryError): hull([[0,0,0],[1,0,0],[0,1,0],[1,1,0]])
    with pytest.raises(GeometryError): dual(regular('cube'),center=[1,0,0])
    with pytest.raises(GeometryError): truncate(regular('cube'),0.6)
    with pytest.raises(GeometryError): export_model(regular('tesseract'),'obj')


def test_project_roundtrip_and_invalid_save_is_atomic(tmp_path):
    path = tmp_path/'sample.polyproj'
    m = regular('cube')
    project = {'format':'polytope-laboratory','version':1,'active':0,'documents':[{'states':[{'model':m,'view':{'rotation':[1,2,3,4,5,6]}}],'cursor':0}]}
    save_project(path,project)
    assert load_file(path)['project'] == project
    bad = json.loads(json.dumps(project)); bad['documents'][0]['states'][0]['model']['edges'][0] = [0,999]
    with pytest.raises(GeometryError): save_project(path,bad)
    assert load_file(path)['project'] == project


def test_safe_expression_and_exact_predicate():
    assert evaluate('1/3 + 1/6')['exactRational'] == '1/2'
    assert evaluate('sqrt(2)^2')['value'] == pytest.approx(2)
    assert evaluate('cos(deg(60))')['value'] == pytest.approx(0.5)
    for expression in ('__import__("os")','(1).__class__','2^10000','1/0','sqrt(-1)','[1]'):
        with pytest.raises(GeometryError): evaluate(expression)
    result = exact_orientation([['0','0'],['0.1','0'],['0','0.2']])
    assert result['determinant'] == '1/50' and result['sign'] == 1
    assert measure(regular('cube'),'distance',[0,1])['value'] == pytest.approx(2)
