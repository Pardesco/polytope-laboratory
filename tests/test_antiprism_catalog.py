"""Validate shipped source assets without requiring Antiprism executables."""
from collections import Counter
import hashlib
import importlib.util
import itertools
import json
import math
from pathlib import Path

import numpy as np
import pytest

from engine.formats import parse_off,export_off
from engine.geometry import GeometryError

ROOT=Path(__file__).resolve().parents[1]
ASSETS=ROOT/'engine/catalog_data/antiprism'
MANIFEST=json.loads((ASSETS/'manifest.json').read_text(encoding='utf-8'))
ENTRIES={entry['id']:entry for entry in MANIFEST['entries']}
spec=importlib.util.spec_from_file_location('build_antiprism_catalog',ROOT/'scripts/build-antiprism-catalog.py')
adapter=importlib.util.module_from_spec(spec);spec.loader.exec_module(adapter)


def raw_data(text):
    lines=[line.split('#',1)[0].strip() for line in text.splitlines()]
    lines=[line for line in lines if line]
    vertices,rows,_=map(int,lines[1].split())
    points=[[float(value) for value in line.split()] for line in lines[2:2+vertices]]
    records=[]
    for line in lines[2+vertices:]:
        parts=line.split();size=int(parts[0]);records.append((list(map(int,parts[1:1+size])),parts[1+size:]))
    assert len(records)==rows
    return points,records


def load(model_id):
    entry=ENTRIES[model_id]
    return parse_off((ASSETS/entry['file']).read_text(encoding='utf-8'),entry['name'])


def test_required_complete_coverage_pinned_source_and_attribution():
    assert set(ENTRIES)=={f'J{i}' for i in range(1,93)}|{f'U{i}' for i in range(1,76)}
    assert len(MANIFEST['entries'])==167
    assert MANIFEST['installerSha256']=='a5318868fa6032923bd9acca945609d5bad0e88cbc8bc1ffec83df35a7d266cc'
    assert MANIFEST['toolSha256']=='ecf4f858fcfcd5210a0211e97a2a9ac6c198328752d7e7b5f753dc4bf837f1b4'
    for file,key in [('COPYING','copyingSha256'),('RESOURCE_NOTICE.html','resourceNoticeSha256')]:
        assert hashlib.sha256((ASSETS/file).read_bytes()).hexdigest()==MANIFEST[key]
    copying=(ASSETS/'COPYING').read_text(encoding='utf-8')
    assert 'Adrian Rossiter' in copying and 'Roger Kaufman' in copying and 'MIT-and-similar' in copying
    assert 'above copyright notice and this permission notice' in copying
    assert 'check the begining of each resource file' in (ASSETS/'RESOURCE_NOTICE.html').read_text(encoding='utf-8')
    assert MANIFEST['strictImportFailures']==[]


@pytest.mark.parametrize('model_id',list(ENTRIES))
def test_every_asset_preserves_source_cycles_colors_and_strict_import(model_id):
    entry=ENTRIES[model_id];raw=(ASSETS/entry['sourceFile']).read_bytes();adapted=(ASSETS/entry['file']).read_bytes()
    assert hashlib.sha256(raw).hexdigest()==entry['sourceSha256']
    assert hashlib.sha256(adapted).hexdigest()==entry['sha256']
    assert entry['command']==['off_util.exe','-d','17',model_id.lower()]
    assert entry['strictImportPassed'] and entry['quality']['regularFacesAndEqualEdgesPassed']
    model=parse_off(adapted.decode('utf-8'),entry['name']);points,records=raw_data(raw.decode('utf-8'))
    polygons=[record for record in records if len(record[0])>=3]
    assert model['vertices']==points
    assert model['faces']==[record[0] for record in polygons]
    assert {key:len(model[key]) for key in ('vertices','edges','faces','cells')}==entry['counts']
    assert model['fingerprint']==entry['fingerprint']
    assert model['interpretation']==entry['quality']['interpretation']
    colors=model['metadata']['offColors']['faces']
    for index,(_,color) in enumerate(polygons):
        assert len(color) in (3,4)
        assert colors[index]['values']==list(map(float,color))
        assert entry['adapter']['polygonColors'][index]['tokens']==color
    assert len(entry['adapter']['decorations'])==sum(len(row[0])<3 for row in records)
    for decoration in entry['adapter']['decorations']:
        assert decoration['indices']==records[decoration['sourceRow']][0]
    reparsed=parse_off(export_off(model),entry['name'])
    assert reparsed['vertices']==model['vertices'] and reparsed['faces']==model['faces']
    assert reparsed['metadata']['offColors']==model['metadata']['offColors']


@pytest.mark.parametrize('model_id',list(ENTRIES))
def test_independent_regular_polygon_and_unit_edge_checks(model_id):
    model=load(model_id);points=np.asarray(model['vertices'])
    # Each explicit edge is independently checked against unit length.
    for a,b in model['edges']:
        assert np.linalg.norm(points[a]-points[b])==pytest.approx(1,abs=1e-7)
    for face in model['faces']:
        polygon=points[face];center=polygon.mean(axis=0);relative=polygon-center
        # Gram eigenvalues test planarity independently of builder SVD normals.
        eigenvalues=np.linalg.eigvalsh(relative.T@relative)
        assert eigenvalues[0]<=1e-12*max(eigenvalues[-1],1)
        radius=np.linalg.norm(relative,axis=1)
        assert np.max(radius)-np.min(radius)<1e-7
        # A regular n-gon/star has equally spaced vertices around its circle.
        # Sorted angular gaps test the underlying regular set, independently
        # of the source's preserved star traversal and face winding metadata.
        normal=np.cross(relative[0],relative[1]);normal/=np.linalg.norm(normal)
        first=relative[0]/np.linalg.norm(relative[0]);second=np.cross(normal,first)
        angles=np.sort(np.arctan2(relative@second,relative@first))
        gaps=np.diff(np.r_[angles,angles[0]+2*math.pi])
        assert gaps==pytest.approx(np.full(len(face),2*math.pi/len(face)),abs=1e-7)


@pytest.mark.parametrize('model_id,counts,face_sizes',[
    ('J1',(5,8,5),{3:4,4:1}),('J2',(6,10,6),{3:5,5:1}),
    ('J3',(9,15,8),{3:4,4:3,6:1}),('J84',(8,18,12),{3:12}),
    ('U29',(60,150,92),{3:80,5:12}),
    ('U3',(12,24,12),{3:8,6:4}),('U34',(12,30,12),{5:12}),
    ('U52',(20,30,12),{5:12}),('U75',(60,240,124),{3:40,4:60,5:24})])
def test_independent_reference_counts_and_face_types(model_id,counts,face_sizes):
    model=load(model_id)
    assert tuple(len(model[key]) for key in ('vertices','edges','faces'))==counts
    assert Counter(map(len,model['faces']))==face_sizes
    if model_id.startswith('J') or model_id=='U29':assert model['interpretation']=='convex-polytope'
    else:assert model['interpretation']=='generalized-complex'


def test_johnson_manifold_incidence_and_nonconvex_uniform_are_distinguished():
    for model_id in (f'J{i}' for i in range(1,93)):
        model=load(model_id)
        use=Counter(tuple(sorted((a,b))) for face in model['faces'] for a,b in zip(face,face[1:]+face[:1]))
        assert set(use.values())=={2}
        assert len(model['vertices'])-len(model['edges'])+len(model['faces'])==2
    hemi=load('U3');great=load('U75')
    assert hemi['interpretation']=='generalized-complex' and great['interpretation']=='generalized-complex'
    use=Counter(tuple(sorted((a,b))) for face in great['faces'] for a,b in zip(face,face[1:]+face[:1]))
    assert Counter(use.values())=={2:240}
    assert len(great['vertices'])-len(great['edges'])+len(great['faces'])==-56
    assert ENTRIES['U75']['quality']['boundaryConnectedComponentCount']==1
    # Connectivity is reported; it does not license calling hemi/overlapping
    # surfaces a convex solid or labelling them a uniform compound by name.


@pytest.mark.parametrize('model_id',['U1','U6','U12','U34'])
def test_independent_signed_axis_subgroup_proves_sample_vertex_transitivity(model_id):
    model=load(model_id);points=np.asarray(model['vertices']);points-=points.mean(axis=0)
    source_faces=[tuple(face) for face in model['faces']]
    def cycle(face):
        sequence=tuple(face);reverse=sequence[::-1]
        return min([sequence[i:]+sequence[:i] for i in range(len(face))]+[reverse[i:]+reverse[:i] for i in range(len(face))])
    expected=Counter(cycle(face) for face in source_faces);orbit=set()
    for permutation in itertools.permutations(range(3)):
        for signs in itertools.product((-1,1),repeat=3):
            candidate=points[:,permutation]*signs
            distances=np.linalg.norm(candidate[:,None,:]-points[None,:,:],axis=2)
            mapping=distances.argmin(axis=1)
            if np.max(distances[np.arange(len(points)),mapping])>1e-7 or len(set(mapping))!=len(points):continue
            if Counter(cycle([int(mapping[v]) for v in face]) for face in source_faces)!=expected:continue
            orbit.add(int(mapping[0]))
    assert orbit==set(range(len(points)))
    evidence=ENTRIES[model_id]['vertexTransitivitySample']
    assert evidence['complete'] and evidence['closureVerified']
    assert len(evidence['entityOrbits']['vertex'])==1


def test_source_snub_chirality_and_star_winding_have_numerical_evidence():
    entry=ENTRIES['U12'];assert entry['chirality']['status']=='numerically chiral'
    assert entry['vertexTransitivitySample']['order']==entry['vertexTransitivitySample']['properOrder']==24
    assert ENTRIES['U34']['quality']['facePolygonWindingCounts']=={'5/2':12}
    assert ENTRIES['U52']['quality']['facePolygonWindingCounts']=={'5/2':12}
    assert ENTRIES['U34']['chirality']['status']=='numerically achiral'
    assert ENTRIES['U29']['chirality']['status']=='numerically chiral'
    assert ENTRIES['U29']['vertexTransitivitySample']['order']==ENTRIES['U29']['vertexTransitivitySample']['properOrder']==60
    assert ENTRIES['J84']['chirality']['status']=='numerically achiral'


def test_attributed_adapter_separates_decorations_and_preserves_indexed_color_identity():
    raw=b'OFF\n3 5 0\n0 0 0\n1 0 0\n0 1 0\n3 2 0 1 7\n2 0 1 0.1 0.2 0.3\n1 2 4\n1 0\n1 1 10 20 30 128\n'
    with pytest.raises(GeometryError):parse_off(raw.decode())
    adapted,metadata=adapter.adapt_off(raw)
    assert adapted.decode().splitlines()[1]=='3 1 3'
    assert metadata['polygonColors']==[{'encoding':'index','index':7}]
    assert [row['kind'] for row in metadata['decorations']]==['edge','vertex','vertex','vertex']
    assert metadata['decorations'][1]['color']=={'encoding':'index','index':4}
    assert metadata['decorations'][3]['color']['values']==[10,20,30,128]
    assert adapted.decode().splitlines()[-1].startswith('3 2 0 1 ')
    # A supplied planar surface in 3D is valid generalized incidence; importer
    # acceptance does not assert a filled solid or replace it with a hull.
    model=parse_off(adapted.decode());assert model['faces']==[[2,0,1]]
    assert model['interpretation']=='generalized-complex'


@pytest.mark.parametrize('suffix',['1 2','red','-2','1.1 0.2 0.3','NaN 0.1 0.2'])
def test_adapter_rejects_unknown_or_invalid_color_attributes(suffix):
    raw=('OFF\n3 1 0\n0 0 0\n1 0 0\n0 1 0\n3 0 1 2 '+suffix+'\n').encode()
    with pytest.raises(GeometryError):adapter.adapt_off(raw)


def test_help_names_and_symbols_match_retained_official_lists():
    johnson=adapter.names_from_help((ASSETS/'johnson-help.txt').read_text(encoding='utf-8'),'J')
    uniform=adapter.names_from_help((ASSETS/'uniform-help.txt').read_text(encoding='utf-8'),'U')
    for number,metadata in johnson.items():assert ENTRIES[f'J{number}']['name']==metadata['name']
    for number,metadata in uniform.items():assert ENTRIES[f'U{number}']['name']==metadata['name'] and ENTRIES[f'U{number}']['wythoffSymbol']==metadata['wythoffSymbol']
    assert ENTRIES['J84']['name']=='snub disphenoid' and ENTRIES['U34']['wythoffSymbol']=='5|2 5/2'


@pytest.mark.parametrize('raw',[
    'OFF\n20001 0 0\n',
    'OFF\n3 100001 0\n',
    'OFF\n3 1 1000001\n',
    'OFF\n3 1 4\n0 0 0\n1 0 0\n0 1 0\n3 0 1 2\n',
    'OFF\n3 1 0\n0 0 0 1\n1 0 0\n0 1 0\n3 0 1 2\n',
    'OFF\n3 1 0\nNaN 0 0\n1 0 0\n0 1 0\n3 0 1 2\n',
    'OFF\n3 1 0\n0 0 0\n1 0 0\n0 1 0\n3 0 1 3\n',
    'OFF\n3 1 0\n0 0 0\n1 0 0\n0 1 0\n3 0 1 1\n',
])
def test_adapter_preserves_rejection_for_other_resource_coordinate_and_incidence_bounds(raw):
    with pytest.raises(GeometryError):adapter.adapt_off(raw.encode())
