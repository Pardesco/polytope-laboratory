from copy import deepcopy
from collections import Counter
from pathlib import Path
import base64,hashlib,json,os,sys,tempfile,unittest
from unittest.mock import patch
import numpy as np
ROOT=Path(os.environ.get('POLYTOPE_TEST_ROOT',Path(__file__).resolve().parents[1]));sys.path.insert(0,str(ROOT))
from engine import server
from engine.catalog import get_catalog,load_catalog_model,_sources
from engine.uniform_snub_catalog import SNUB_INDICES,uniform_snub_metadata,_manifest
from engine.source_reflection import reflect_source
from engine.geometry import GeometryError,identity,validate
from engine.formats import parse_off,save_project,load_file,validate_project
from engine.recipes import run_recipe,replay_document
from engine.symmetry import geometric_symmetry
from engine import element_annotations as content

def attributed_source(index=40):
    return load_catalog_model('antiprism-u'+str(index))

def content_document(model=None):
    model=deepcopy(model if model is not None else attributed_source());model['metadata']['coordinateUnits']='cm'
    model['metadata']['offColors']={kind:[{'encoding':'byte','values':[41,83,127,127]} for _ in model[kind]] for kind in ('vertices','edges','faces')}
    # Native project validation refreshes derived measures before source binding.
    doc={'id':'snub','name':'Literal source snub','cursor':0,'states':[{'model':model,'view':{'coordinateUnit':'cm','faces':True,'edges':True,'vertices':True,'derivedMode':'face'},'notes':'Literal source notes, retained.'}]}
    validate_project({'format':'polytope-laboratory','version':1,'active':0,'documents':[doc]})
    model=doc['states'][0]['model'];annotations=content.new_document(model)
    for kind in ('vertex','edge','face'):annotations=content.set_text(annotations,model,kind,0,'<b>Original '+kind+'</b>')
    asset=next(iter(json.loads((ROOT/'tests/fixtures/element-content-native-fixture.json').read_text(encoding='utf-8'))['descriptor']['assets'].values()))
    annotations=content.set_texture(annotations,model,0,base64.b64decode(asset['base64']))
    doc['states'][0]['view']['elementAnnotations']=annotations
    return doc

class UniformSnubSanity(unittest.TestCase):
    def test_every_literal_snub_reflection_and_u_symbol_registration_preserve_incidence_metric_and_raw_colors(self):
        registry={r['key']:r for r in get_catalog()}
        for i in range(1,76):
            row=registry['antiprism-u'+str(i)];self.assertTrue(row['symbol']);self.assertIn('U'+str(i),row['aliases'])
        for number in SNUB_INDICES:
            source=attributed_source(number);before=deepcopy(source);mirror=load_catalog_model('antiprism-u'+str(number)+'-mirror')
            for kind in ('edges','faces','cells'):self.assertEqual(mirror[kind],source[kind])
            self.assertEqual(mirror['metadata']['offColors'],source['metadata']['offColors'])
            p=np.asarray(source['vertices']);q=np.asarray(mirror['vertices']);expected=p.copy();expected[:,0]*=-1
            np.testing.assert_array_equal(q,expected);np.testing.assert_allclose(q@q.T,p@p.T,atol=1e-14,rtol=1e-12)
            basis=mirror['provenance']['catalogConstruction']['sourceModel'];self.assertEqual({k:v for k,v in basis.items() if k!='id'},{k:v for k,v in source.items() if k!='id'})
            self.assertEqual(mirror['metadata']['sourceReflection']['maps']['faces'],list(range(len(source['faces']))))
            row=registry['antiprism-u'+str(number)+'-mirror'];self.assertEqual(row['enantiomorph'],'reflected');self.assertEqual(row['counts'],[len(mirror[k]) for k in ('vertices','edges','faces','cells')])
            self.assertTrue(row['chiralityEvidence']['complete']);self.assertEqual(row['chiral'],number not in (32,72,75))
            self.assertEqual(row['chiralityEvidence']['vertexOrbitSizes'],[len(p)])
            self.assertEqual(source,before)
        # Independent exhaustive checks distinguish actual achiral snubs from names.
        chiral=geometric_symmetry(attributed_source(40),max_frames=10000);achiral=geometric_symmetry(attributed_source(32),max_frames=10000)
        self.assertTrue(chiral['complete'] and achiral['complete']);self.assertEqual(chiral['properOrder'],chiral['order']);self.assertEqual(achiral['order']-achiral['properOrder'],60)
        with self.assertRaisesRegex(GeometryError,'stale'):uniform_snub_metadata('antiprism-u40',source_sha='forged')

    def test_skilling_is_separate_attributed_literal_nonordinary_figure_with_complete_polygon_geometry(self):
        model=load_catalog_model('antiprism-skilling');entry=_manifest()['skilling'];raw=(Path(__import__('engine.uniform_snub_catalog',fromlist=['DATA']).DATA)/entry['file']).read_bytes()
        literal=parse_off(raw.decode('utf-8-sig'),model['name'])
        for kind in ('vertices','edges','faces','cells'):self.assertEqual(model[kind],literal[kind])
        self.assertEqual(hashlib.sha256(raw).hexdigest(),entry['sha256']);self.assertIn(b'This file may be copied, modified and redistributed',raw)
        self.assertEqual([len(model[k]) for k in ('vertices','edges','faces','cells')],[60,240,204,0]);self.assertNotEqual(model['faces'],attributed_source(75)['faces'])
        self.assertEqual(Counter(map(len,model['faces'])),{3:120,4:60,5:24})
        uses=Counter(tuple(sorted((a,b))) for face in model['faces'] for a,b in zip(face,face[1:]+face[:1]));self.assertEqual(Counter(uses.values()),{2:120,4:120})
        self.assertTrue(entry['faceGeometry']['regularFacesAndEqualEdgesPassed']);self.assertEqual(entry['faceGeometry']['facePolygonWindingCounts'],{'3/1':120,'4/1':60,'5/2':24})
        self.assertTrue(model['metadata']['nonordinaryBoundary']);self.assertTrue(model['metadata']['abstractEdgeMultiplicityUnspecified'])
        with self.assertRaises(GeometryError):
            from engine.generalized_nets import unfold_source
            unfold_source(model)
        reflected=reflect_source(model,2);self.assertEqual(reflected['faces'],model['faces']);self.assertEqual(reflected['metadata'].get('offColors'),model['metadata'].get('offColors'))
        self.assertEqual(validate(reflected)['passed'],True)

    def test_native_recipe_save_open_history_text_png_full_receipts_and_source_guards(self):
        document=content_document();original=deepcopy(document);source=document['states'][0]['model']
        with patch('engine.operations.hull',side_effect=AssertionError('Reflection must not compute a hull.')):
            direct=server.dispatch({'op':'reflect-source','model':source,'params':{'axis':1}})
        self.assertEqual(document,original);again=reflect_source(direct,1)
        self.assertEqual(again['vertices'],source['vertices']);self.assertEqual(again['faces'],source['faces'])
        result=run_recipe(document,'reflect-source',{'axis':1},server.dispatch,'Reflected form')
        state=result['states'][result['cursor']];self.assertEqual(state['notes'],original['states'][0]['notes']);self.assertEqual(state['view']['coordinateUnit'],'cm')
        moved=state['view']['elementAnnotations'];self.assertEqual(moved['entries'],original['states'][0]['view']['elementAnnotations']['entries']);self.assertEqual(moved['assets'],original['states'][0]['view']['elementAnnotations']['assets'])
        self.assertEqual(moved['source'],state['model']);self.assertEqual(len(state['view']['elementContentTransfer']['mapped']),3);self.assertEqual(state['view']['elementContentTransfer']['unmapped'],[])
        replay=replay_document(result,server.dispatch);self.assertEqual(replay['states'][replay['cursor']]['model'],state['model'])
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'mirror.polyproj';project={'format':'polytope-laboratory','version':1,'active':0,'documents':[result]};save_project(path,project)
            opened=load_file(path)['project'];self.assertEqual(opened['documents'][0]['states'],result['states']);self.assertEqual(document,original)
        forged=deepcopy(result);node=forged['operationHistory']['nodes'][-1];node['snapshot']['model']['metadata']['sourceReflection']['determinant']=1
        forged['states'][forged['cursor']]['model']['metadata']['sourceReflection']['determinant']=1
        with self.assertRaisesRegex(GeometryError,'attributes|handedness|Annotation source changed'):replay_document(forged,server.dispatch)
        plain=deepcopy(document);plain['states'][0]['view'].pop('elementAnnotations')
        plain=run_recipe(plain,'reflect-source',{'axis':1},server.dispatch)
        plain['operationHistory']['nodes'][-1]['snapshot']['model']['metadata']['sourceReflection']['determinant']=1
        plain['states'][-1]['model']['metadata']['sourceReflection']['determinant']=1
        with self.assertRaisesRegex(GeometryError,'attributes|handedness'):replay_document(plain,server.dispatch)
        for axis in (True,-1,3,'0',None):
            with self.assertRaises(GeometryError):reflect_source(source,axis)
        for params in ({},{'axis':0,'other':1}):
            with self.assertRaises(GeometryError):server.dispatch({'op':'reflect-source','model':source,'params':params})
        bad=deepcopy(source);bad['vertices'][0][0]+=1
        with self.assertRaises(GeometryError):reflect_source(bad)
        self.assertEqual(document,original)

if __name__=='__main__':unittest.main()
