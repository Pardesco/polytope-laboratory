from copy import deepcopy
import hashlib, json, runpy, tempfile
from pathlib import Path
import numpy as np
from engine import server, element_annotations as content
from engine.element_content_workflow import describe_content
from engine.generators import regular
from engine.ordinary_cell_sections import ordinary_cell_section
from engine.formats import save_project, load_file
from engine.recipes import run_recipe, replay_document

ROOT = Path(__file__).resolve().parents[1]
helpers = runpy.run_path(str(ROOT/'tests/test_ordinary_cell_sections.py'))


def test_literal_rank_loss_all_source_owners_and_whole_coplanar_png_sheets():
    source = regular('tesseract'); before = deepcopy(source)
    for offset in (0, -1):
        packet = ordinary_cell_section(source, [0,0,0,1], offset)
        result = packet['model']; record = result['metadata']['sectionSourceContent']
        assert record['sourceSha256'] == hashlib.sha256(content._source(source)).hexdigest()
        for occurrence in record['occurrences']:
            kind = occurrence['sourceKind']; index = occurrence['sourceIndex']
            if kind == 'cell':
                assert all(index in packet['faceSourceReferences'][f]['cells'] for f in occurrence['targetIds'])
            elif kind == 'face':
                assert all(any(r.get('face') == index for r in packet['edgeSourceReferences'][e]) for e in occurrence['targetIds'])
            else:
                assert all(any(r.get(kind) == index for r in packet['sourceReferences'][v]) for v in occurrence['targetIds'])
        if offset == 0:
            assert {o['sourceKind'] for o in record['occurrences']} == {'edge','face','cell'}
            assert record['wholeFaceSheets'] == []
        else:
            assert any(o['sourceKind'] == 'vertex' for o in record['occurrences'])
            assert record['wholeFaceSheets']
            world = np.asarray(packet['origin']) + np.asarray(result['vertices']) @ np.asarray(packet['basis']).T
            for sheet in record['wholeFaceSheets']:
                assert np.allclose(world[result['faces'][sheet['outputFace']]], np.asarray(source['vertices'])[sheet['sourceVertexIds']])
    assert source == before


def test_complete_split_and_holed_regions_preserve_repeated_owner_without_tessellation_labels():
    for source, normal, offset in ((helpers['disjoint_source'](),[0,1,0,0],2), (helpers['hole_source'](),[0,0,1,0],0)):
        result = ordinary_cell_section(source,normal,offset)
        occurrences = [o for o in result['model']['metadata']['sectionSourceContent']['occurrences'] if o['sourceKind']=='cell']
        assert len(occurrences) == len(result['cellSectionRegions'])
        caps = [o for o in occurrences if o['sourceIndex']==0]
        if normal[1]:
            assert len(caps)==2 and len({o['component'] for o in caps})==2
        else:
            assert len(caps)==1 and caps[0]['hasHoles'] and len(caps[0]['targetIds'])==8


def test_native_annotated_source_save_open_replay_and_promotion_archive():
    source = regular('tesseract'); source['metadata']['coordinateUnits']='mm'
    annotations = content.new_document(source)
    for kind in ('vertex','edge','face','cell'):
        annotations = content.set_text(annotations,source,kind,0,'<b>Original</b> '+kind+'<sub>0</sub>')
    state={'model':source,'view':{'derivedMode':'cell-section','sectionNormal':[0,0,0,1],'sectionOffset':0,'coordinateUnit':'mm','elementAnnotations':annotations},'notes':'Literal source notes'}
    document={'id':'source','cursor':0,'states':[state]};before=deepcopy(document)
    promoted=run_recipe(document,'section',{'normal':[0,0,0,1],'offset':0,'section_domain':'ordinary-cells'},server.dispatch,'Promote source-owned section')
    assert document==before
    final=promoted['states'][-1]
    assert final['view']['elementAnnotations']['entries']==[]
    assert final['view']['elementContentDetached'][-1]['document']==annotations
    assert final['notes']==state['notes'] and final['view']['coordinateUnit']=='mm'
    assert replay_document(promoted,server.dispatch)['states'][0]['model']==final['model']
    with tempfile.TemporaryDirectory() as folder:
        file=Path(folder)/'section.polyproj'
        save_project(file,{'format':'polytope-laboratory','version':1,'active':0,'documents':[promoted]})
        opened=load_file(file)['project']['documents'][0]
    assert opened['states'][0]['model']==source
    assert opened['states'][0]['view']['elementAnnotations']==annotations
    assert opened['states'][-1]['model']['metadata']['sectionSourceContent']==final['model']['metadata']['sectionSourceContent']
