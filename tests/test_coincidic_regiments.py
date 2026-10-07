from copy import deepcopy
from itertools import product,combinations,permutations
from pathlib import Path
import json,os,sys,tempfile,unittest,base64
from unittest.mock import patch
import numpy as np
ROOT=Path(os.environ.get('POLYTOPE_TEST_ROOT',Path(__file__).resolve().parents[1]));sys.path.insert(0,str(ROOT))
import engine
if os.environ.get('POLYTOPE_STAGE_ENGINE'):engine.__path__.insert(0,os.environ['POLYTOPE_STAGE_ENGINE'])
from engine import server
from engine.geometry import GeometryError,identity,validate
from engine.coincidic_regiments import compare_models,compose_state,validate_record
from engine.formats import validate_project,save_project,load_file
from engine.recipes import run_recipe,replay_document
from engine import element_annotations as content

def literal_examples():
    # Independently supplied incidence: Boolean-coordinate cube faces and the
    # six monotone tetrahedra in each cube (compatible global Freudenthal order).
    points=[list(v) for v in product((-1,1),repeat=4)];lookup={tuple(p):i for i,p in enumerate(points)}
    faces=[];cell_table={}
    for varying in combinations(range(4),2):
        fixed=[i for i in range(4) if i not in varying]
        for values in product((-1,1),repeat=2):
            row=[]
            for a,b in ((-1,-1),(1,-1),(1,1),(-1,1)):
                p=[0]*4
                for i,v in zip(fixed,values):p[i]=v
                p[varying[0]]=a;p[varying[1]]=b;row.append(lookup[tuple(p)])
            faces.append(row)
    cubes=[]
    for axis in range(4):
        for side in (-1,1):cubes.append([i for i,f in enumerate(faces) if all(points[v][axis]==side for v in f)])
    edges=sorted({tuple(sorted((a,b))) for f in faces for a,b in zip(f,f[1:]+f[:1])})
    a={'id':'literal-boolean-tesseract','name':'Boolean tesseract / cubical cells','dimension':4,'embeddingDimension':4,'interpretation':'generalized-complex','vertices':points,'edges':[list(e) for e in edges],'faces':faces,'cells':cubes,'metadata':{'coordinateUnits':'mm','independentConstruction':'Literal Boolean coordinates, no hull.'}}
    triangles=[];triangle_ids={};tetra=[]
    for axis in range(4):
        free=[i for i in range(4) if i!=axis]
        for side in (-1,1):
            for order in permutations(free):
                p=[-1]*4;p[axis]=side;vertices=[lookup[tuple(p)]]
                for change in order:p[change]=1;vertices.append(lookup[tuple(p)])
                row=[]
                for f in combinations(vertices,3):
                    key=tuple(sorted(f))
                    if key not in triangle_ids:triangle_ids[key]=len(triangles);triangles.append(list(f))
                    row.append(triangle_ids[key])
                tetra.append(row)
    b=deepcopy(a);b.update(id='literal-freudenthal-boundary',name='Same Boolean vertices / tetrahedral cells',faces=triangles,cells=tetra,
        edges=[list(e) for e in sorted({tuple(sorted((x,y))) for f in triangles for x,y in zip(f,f[1:]+f[:1])})])
    b['metadata']['independentConstruction']='Each cubical boundary cell is six monotone coordinate tetrahedra; complete source triangles retained.'
    for model in (a,b):
        model['metadata']['offColors']={k:[{'encoding':'byte','values':[31,70,113,127]} for _ in model[k]] for k in ('vertices','edges','faces','cells')}
        model['numeric']={'mode':'float64-approximate','certified':False};model['provenance']={'operation':'independent-literal-example','convexified':False}
        model['fingerprint']=identity(model);model['validation']=validate(model)
    return a,b

def supplied_project():
    a,b=literal_examples();project={'format':'polytope-laboratory','version':1,'active':0,'documents':[]}
    for i,model in enumerate((a,b)):
        project['documents'].append({'id':'source-'+str(i),'name':model['name'],'cursor':0,'states':[{'model':model,'view':{'coordinateUnit':'mm','derivedMode':'face','fillRule':'nonzero','angles':[0]*6,'faces':True,'edges':True},'notes':'Independent source '+str(i)+' notes and original units.'}]})
    validate_project(project)
    asset=next(iter(json.loads((ROOT/'tests/fixtures/element-content-native-fixture.json').read_text(encoding='utf-8'))['descriptor']['assets'].values()))
    for i,d in enumerate(project['documents']):
        state=d['states'][0];m=state['model'];document=content.new_document(m)
        for kind in ('vertex','edge','face','cell'):document=content.set_text(document,m,kind,0,'Source '+str(i)+' '+kind)
        state['view']['elementAnnotations']=content.set_texture(document,m,0,base64.b64decode(asset['base64']))
    return project

class ArrangementWorkflow(unittest.TestCase):
    def test_independent_same_vertices_different_complete_boundary_and_rank_maps(self):
        a,b=literal_examples();before=deepcopy((a,b))
        self.assertTrue(validate(a)['passed'] and validate(b)['passed']);self.assertEqual(len(b['cells']),48)
        with patch('engine.operations.hull',side_effect=AssertionError('No hull comparison')):receipt=compare_models(a,b)
        self.assertTrue(receipt['sameVertexArrangement']);self.assertFalse(receipt['sameEdgeArrangement']);self.assertFalse(receipt['sameFaceArrangement']);self.assertFalse(receipt['sameCellArrangement'])
        self.assertEqual(receipt['rankCorrespondences']['vertices']['aToB'],list(range(16)))
        self.assertEqual(receipt['maximumVertexResidual'],0);self.assertFalse(receipt['coincidicEvidence']['sourceA']['verified']);self.assertFalse(receipt['coincidicEvidence']['sourceB']['verified'])
        # Shared cube/tetra realms span rank3; source-internal tetra intersections do not.
        cross=receipt['coincidicEvidence']['crossSourceWitnesses'];self.assertEqual(len(cross),48)
        for witness in cross:
            p=np.asarray(a['vertices'])[witness['sharedVertexIdsA']];self.assertEqual(np.linalg.matrix_rank(p-p[0]),3)
        # Literal reindexing and cyclic spelling preserve exact source correspondences.
        permutation=list(reversed(range(16)));c=deepcopy(a);c['vertices']=[a['vertices'][i] for i in permutation];inverse={v:i for i,v in enumerate(permutation)}
        c['edges']=[[inverse[v] for v in e] for e in reversed(a['edges'])];c['faces']=[[inverse[v] for v in f[1:]+f[:1]] for f in a['faces']];c['fingerprint']=identity(c)
        same=compare_models(a,c);self.assertTrue(same['regimentEvidence']['verified']);self.assertTrue(same['sameFaceArrangement'] and same['sameCellArrangement'])
        self.assertEqual(same['rankCorrespondences']['vertices']['aToB'],permutation)
        for i,row in enumerate(same['rankCorrespondences']['edges']['aToB']):self.assertEqual(row,[len(a['edges'])-1-i])
        self.assertEqual((a,b),before)
        # A real regular-star company/regiment: these provider cycles share the
        # exact vertex/edge/face arrangement after a declared signed XYZW action,
        # but their literal full cell incidence differs. No catalogue inference.
        from engine.catalog import load_catalog_model
        from engine.operations import transform
        star_a=load_catalog_model('miratope-grand-stellated-hecatonicosachoron')
        star_b=load_catalog_model('miratope-great-stellated-hecatonicosachoron')
        aligned=transform(star_b,matrix=[[-1,0,0,0],[0,-1,0,0],[0,0,0,-1],[0,0,-1,0]])
        stars=compare_models(star_a,aligned)
        self.assertTrue(stars['sameEdgeArrangement'] and stars['sameFaceArrangement']);self.assertFalse(stars['sameCellArrangement'])
        self.assertEqual(stars['maximumVertexResidual'],0);self.assertFalse(stars['coincidicEvidence']['sourceA']['verified']);self.assertFalse(stars['coincidicEvidence']['sourceB']['verified'])
        self.assertTrue(all(len(ids)==1 for ids in stars['rankCorrespondences']['faces']['aToB']))

    def test_actual_internal_coincidic_witness_and_ambiguous_incompatible_atomic_refusals(self):
        a,b=literal_examples();c=deepcopy(a)
        # A distinct fully closed triangulated cubical sheet in the same realm;
        # retains the original cubical source cell, not a welded replacement.
        extra=[]
        for face_id in a['cells'][0]:
            f=a['faces'][face_id]
            for row in (f[:3],[f[0],f[2],f[3]]):extra.append(len(c['faces']));c['faces'].append(row)
        c['cells'].append(extra);c['edges']=[list(e) for e in sorted({tuple(sorted((x,y))) for f in c['faces'] for x,y in zip(f,f[1:]+f[:1])})];c['metadata'].pop('offColors');c['fingerprint']=identity(c)
        r=compare_models(c,c);self.assertTrue(r['coincidicEvidence']['sourceA']['verified']);self.assertEqual(r['coincidicEvidence']['sourceA']['witnesses'][0]['sharedVertexIdsA'],sorted(set(v for f in a['cells'][0] for v in a['faces'][f])))
        shifted=deepcopy(a);shifted['vertices'][0][0]+=.01
        with self.assertRaises(GeometryError):compare_models(a,shifted)
        c=deepcopy(a);c['vertices'].append(deepcopy(c['vertices'][0]));c['metadata'].pop('offColors')
        with self.assertRaisesRegex(GeometryError,'ambiguous'):compare_models(c,c)
        explicit=compare_models(c,c,{'vertexBijection':list(range(17))});self.assertEqual(explicit['rankCorrespondences']['vertices']['aToB'],list(range(17)))
        with self.assertRaisesRegex(GeometryError,'permutation'):compare_models(a,a,{'vertexBijection':[0]*16})
        with self.assertRaisesRegex(GeometryError,'tolerance'):compare_models(a,a,{'relativeTolerance':True})
        # Duplicate rank occurrences are retained as multiple candidates, not collapsed.
        c=deepcopy(a);c['faces'].append(deepcopy(c['faces'][0]));c['metadata'].pop('offColors')
        rank=compare_models(c,c)['rankCorrespondences']['faces'];self.assertEqual(rank['aToB'][0],[0,24]);self.assertIn(0,rank['ambiguousA'])
        c=deepcopy(a);c['cells'].append(deepcopy(c['cells'][0]));c['metadata'].pop('offColors')
        duplicate=compare_models(c,c);witness=duplicate['coincidicEvidence']['sourceA']['witnesses'][0]
        self.assertEqual((witness['cellA'],witness['cellB']),(0,8));self.assertTrue(witness['sameCyclicBoundary'])

    def test_two_source_records_compound_rgba_content_units_notes_save_open_and_full_replay(self):
        project=supplied_project();a,b=[d['states'][0] for d in project['documents']];before=deepcopy(project)
        params={'otherState':deepcopy(b),'options':{}}
        recorded=run_recipe(project['documents'][0],'coincidic-record',params,server.dispatch)
        state=recorded['states'][recorded['cursor']];record=state['view']['coincidicComparison'];validate_record(state['model'],record)
        self.assertEqual(state['model'],a['model']);self.assertEqual(record['sourceStates'][1]['notes'],b['notes']);self.assertEqual(state['view']['elementAnnotations'],a['view']['elementAnnotations'])
        result=run_recipe(recorded,'coincidic-compound',params,server.dispatch)
        final=result['states'][result['cursor']];m=final['model'];self.assertEqual(m['vertices'],a['model']['vertices']+b['model']['vertices']);self.assertEqual(len(m['vertices']),32)
        offsets={k:len(a['model'][k]) for k in ('vertices','edges','faces','cells')}
        self.assertEqual(m['faces'],a['model']['faces']+[[v+16 for v in f] for f in b['model']['faces']]);self.assertEqual(m['cells'],a['model']['cells']+[[f+offsets['faces'] for f in cell] for cell in b['model']['cells']])
        for k in offsets:self.assertEqual(m['metadata']['offColors'][k],a['model']['metadata']['offColors'][k]+b['model']['metadata']['offColors'][k])
        entries=final['view']['elementAnnotations']['entries'];self.assertEqual(len(entries),8)
        for i in (0,1):
            maps=m['metadata']['compound']['inputs'][i]['maps']
            for entry in (a,b)[i]['view']['elementAnnotations']['entries']:
                moved={**entry,'index':maps[{'vertex':'vertices','edge':'edges','face':'faces','cell':'cells'}[entry['kind']]][entry['index']]};self.assertIn(moved,entries)
        self.assertEqual(final['notes'],a['notes']);self.assertEqual(final['view']['coordinateUnit'],'mm');self.assertEqual(m['metadata']['arrangementSourceStates'][1],record['sourceStates'][1])
        replayed=replay_document(result,server.dispatch);self.assertEqual(replayed['states'][0]['model'],m);self.assertEqual(replayed['states'][0]['view']['elementAnnotations'],final['view']['elementAnnotations'])
        with tempfile.TemporaryDirectory() as directory:
            path=str(Path(directory)/'arrangements.polyproj');saved={**project,'documents':[result,project['documents'][1]]};save_project(path,saved);loaded=load_file(path)['project']
            self.assertEqual(loaded['documents'][0]['states'][-1]['model'],m)
        changed=deepcopy(params);changed['otherState']['view']['coordinateUnit']='cm'
        with self.assertRaisesRegex(GeometryError,'units differ'):run_recipe(project['documents'][0],'coincidic-compound',changed,server.dispatch)
        tampered=deepcopy(record);tampered['receipt']['sameEdgeArrangement']=True
        with self.assertRaisesRegex(GeometryError,'altered'):validate_record(a['model'],tampered)
        # Editing notes after an earlier recipe starts a retained source node,
        # rather than replaying the newer compound from an obsolete owner.
        edited=deepcopy(recorded);edited['states'][-1]['notes']='Edited source notes before compound.'
        branched=run_recipe(edited,'coincidic-compound',params,server.dispatch)
        again=replay_document(branched,server.dispatch);self.assertEqual(again['states'][0]['notes'],'Edited source notes before compound.')
        self.assertEqual(project,before)

if __name__=='__main__':unittest.main()
