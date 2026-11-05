from copy import deepcopy
from collections import Counter
from itertools import combinations
import xml.etree.ElementTree as ET
import json
import numpy as np
import pytest
from engine.generators import regular
from engine.star_polyhedra import kepler_poinsot
from engine.visible_surface import visible_surface
from engine.generalized_nets import unfold_source, reconstruct_source_net, edit_source_net
from engine.nets import net_svg, fold_net
from engine.net_paper_ux import piece_bounds, edge_labels, label_size
from engine.net_printing import pack_net
from engine.server import dispatch
from engine.formats import validate_project
from test_generalized_nets import l_prism

SVG='{http://www.w3.org/2000/svg}'


@pytest.fixture(scope='module')
def gsd():
    model=visible_surface(kepler_poinsot('great-stellated-dodecahedron'))
    return model,unfold_source(model)


def test_twenty_piece_default_is_compact_tab_inclusive_and_reconstructible(gsd):
    model,net=gsd;bounds=piece_bounds(net)
    assert len(bounds)==20
    for (_,a,b),(_,c,d) in combinations(bounds,2):
        assert np.any(b+4.999<=c) or np.any(d+4.999<=a)
    extent=np.max([b for _,a,b in bounds],axis=0)-np.min([a for _,a,b in bounds],axis=0)
    assert max(extent)/min(extent)<1.5
    assert not net['hasOverlap'] and not net['hasTabOverlap']
    rebuilt=reconstruct_source_net(model,net)
    assert np.allclose([f['points'] for f in rebuilt['faces']],[f['points'] for f in net['faces']])
    assert fold_net(rebuilt,1)['validation']['endpointReconstructed']


def test_single_cube_is_unchanged_and_all_folds_are_printed_side_valleys():
    model=regular('cube');net=unfold_source(model)
    assert len(net['components'])==1 and net['placements']==[]
    assert net['foldTypes']=={str(i):'valley' for i in range(len(model['edges']))}
    assert edit_source_net(model,net,'arrange-pieces')==net
    assert net['faces']==unfold_source(model,placements=[])['faces']
    small=unfold_source(model,edge_length_mm=1)
    assert small['labelDiagnostics']['belowReadableSize']>0
    assert small['labelDiagnostics']['minimumFontMm']<net['labelDiagnostics']['minimumFontMm']


def test_manual_moves_override_default_and_rearrange_preserves_rotation(gsd):
    model,net=gsd;before=deepcopy(net);root=net['components'][0]['root']
    moved=edit_source_net(model,net,'move-component',component=root,translation=[17,-29],angle=31)
    restored=reconstruct_source_net(model,moved)
    assert moved['faces']==restored['faces']
    arranged=dispatch({'op':'net-edit','model':model,'params':{'net':moved,'action':'arrange-pieces'}})
    f=next(f for f in moved['faces'] if f['id']==root);g=next(f for f in arranged['faces'] if f['id']==root)
    assert np.allclose(np.diff(f['points'],axis=0),np.diff(g['points'],axis=0))
    assert fold_net(arranged,1)['validation']['endpointReconstructed']
    assert net==before


def test_nonconvex_reentrant_fold_and_reversed_cycles_have_both_signs():
    model=l_prism();net=unfold_source(model,hinges=[])
    edge=model['edges'].index([3,9])
    assert net['foldTypes'][str(edge)]=='mountain'
    assert set(net['foldTypes'].values())=={'mountain','valley'}
    model['faces']=[f[::-1] for f in model['faces']]
    assert unfold_source(model,hinges=[])['foldTypes']==net['foldTypes']


def test_labels_scale_fit_inside_faces_and_pairs_and_numbers_survive_pages(gsd):
    model,net=gsd
    assert label_size(5,'E88')<label_size(10,'E88')<label_size(25,'E88')
    labels=edge_labels([[0,0],[10,0],[0,10]],[{'id':i,'hinge':False} for i in range(3)])
    for label in labels.values():
        x,y=label['center'];assert x>0 and y>0 and x+y<10
    root=ET.fromstring(net_svg(net))
    assert {int(t.attrib['data-piece-number']) for t in root.iter(SVG+'text') if 'data-piece-number' in t.attrib}==set(range(1,21))
    expected=Counter({f'E{i}':2 for i in range(len(model['edges'])) if i not in net['hinges']})
    assert Counter(t.text for t in root.iter(SVG+'text') if 'data-edge-label' in t.attrib)==expected
    packed=pack_net(net);parts=[p for page in packed['pages'] for p in page['parts']]
    assert {p['pieceNumber'] for p in parts}==set(range(1,21))
    assert Counter(t.text for page in packed['pages'] for t in ET.fromstring(page['svg']).iter(SVG+'text') if 'data-edge-label' in t.attrib)==expected


def test_svg_has_distinct_fold_styles_and_tab_crease(gsd):
    _,net=gsd
    # All edges hinged individually would close cycles; use the real spike forest.
    root=ET.fromstring(net_svg(net));paths=[p for p in root.iter(SVG+'path') if 'data-fold-type' in p.attrib]
    assert any(p.attrib['data-fold-type']=='tab-valley' for p in paths)
    model=l_prism();net=unfold_source(model,hinges=[model['edges'].index([3,9]),model['edges'].index([0,1])])
    root=ET.fromstring(net_svg(net));styles={p.attrib.get('data-fold-type'):p.attrib.get('stroke-dasharray') for p in root.iter(SVG+'path')}
    assert styles['valley']=='1.5 1' and styles['mountain']=='3 .8 .5 .8'
    assert root.find(SVG+'g[@data-fold-legend="printed-side"]') is not None


def test_separate_color_batches_keep_global_piece_numbers():
    model=regular('cube');model['metadata']['offColors']={'faces':[{'encoding':'byte','values':[255,0,0] if i%2 else [0,0,255]} for i in range(6)]}
    packed=pack_net(unfold_source(model),color_mode='separate')
    parts=[p for page in packed['pages'] for p in page['parts']]
    numbers=[p['pieceNumber'] for p in parts]
    assert len(numbers)==len(set(numbers))
    for page in packed['pages']:
        labels={int(t.attrib['data-piece-number']) for t in ET.fromstring(page['svg']).iter(SVG+'text') if 'data-piece-number' in t.attrib}
        assert labels=={p['pieceNumber'] for p in page['parts']}


def test_project_retains_arrangement_history_and_assembly_settings():
    model=regular('cube');net=unfold_source(model,hinges=[])
    moved=edit_source_net(model,net,'move-component',component=net['components'][0]['root'],translation=[8,9],angle=17)
    state={'model':model,'notes':'Paper assembly','view':{'net':{'root':0,'length':25,'tabs':True},'netAssembly':{'include':True,'color':'piece'}},
           'netLayout':moved,'netPages':pack_net(moved),'netHistory':{'sourceFingerprint':moved['sourceFingerprint'],'cursor':1,'states':[
               {'root':n['root'],'edge_length_mm':25,'tabs':True,'hinges':n['hinges'],'placements':n['placements']} for n in (net,moved)]}}
    project={'format':'polytope-laboratory','version':1,'active':0,'documents':[{'id':'paper-project','cursor':0,'states':[state]}]}
    saved=validate_project(json.loads(json.dumps(project)))['documents'][0]['states'][0]
    assert saved['netLayout']['faces']==moved['faces']
    assert saved['netHistory']==state['netHistory'] and saved['view']['netAssembly']==state['view']['netAssembly']
    assert saved['netLayout']['foldTypes']==moved['foldTypes']
