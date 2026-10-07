"""Production fifth-method routes: strict binding, Save/Open and source ownership."""
from copy import deepcopy
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from engine import server
from engine.generators import regular
from engine.geometry import GeometryError, identity, validate
from engine.formats import save_project, load_file
from engine.dual_morph import digest

CONTEXT={'notes':'Original augmentation notes, never a geometry command.','unit':'mm'}
def source(key='cube'):
    m=regular(key);m['metadata']['coordinateUnits']='mm';m['metadata']['literal']={'records':[1,.125,'preserve']}
    m['metadata']['offColors']={'faces':[{'encoding':'byte','values':[50,100,150,127]} for _ in m['faces']]}
    return m
def settings(**change):
    s=dict(version=1,enabled=True,method='augmentation',center=None,radius=2**.5,ratio=.25,duration=2.,loop=False);s.update(change);return s
def prepare(m,s=None):return server.dispatch({'op':'prepare-dual-morph','model':m,'params':{'settings':s or settings(),'sourceContext':CONTEXT}})
def evaluate(m,p,t=.25,c=CONTEXT):return server.dispatch({'op':'evaluate-dual-morph','model':m,'params':{'prepared':p,'ratio':t,'sourceContext':c}})

class ProductionAugmentation(unittest.TestCase):
    def test_route_full_source_context_descriptor_binding_and_literal_endpoints(self):
        m=source();before=deepcopy(m);p=prepare(m)
        self.assertEqual(p['sourceAttributesSha256'],digest(m));self.assertEqual(p['sourceContextSha256'],digest(CONTEXT));self.assertEqual(p['descriptorSha256'],digest(p['descriptor']))
        self.assertEqual(p['sourceFingerprint'],identity(m));self.assertEqual(p['settings']['method'],'augmentation')
        self.assertEqual(evaluate(m,p,0)['model'],m);self.assertEqual(evaluate(m,p,1)['model'],p['descriptor']['dual'])
        for t,n in ((.25,(14,36,24,0)),(.5,(14,24,12,0)),(.75,(14,36,24,0))):
            f=evaluate(m,p,t);self.assertEqual(tuple(len(f['model'][k]) for k in ('vertices','edges','faces','cells')),n)
            self.assertEqual(f['settings']['ratio'],t);self.assertEqual(f['binding']['sourceAttributesSha256'],p['sourceAttributesSha256']);self.assertFalse(f['certified']);self.assertTrue(validate(f['model'])['passed'])
        self.assertEqual(m,before)

    def test_source_attribute_rgba_notes_units_and_detached_coefficients_cannot_be_forged(self):
        m=source();p=prepare(m)
        for mutate in (lambda x:x['metadata']['offColors']['faces'][0]['values'].__setitem__(3,126),lambda x:x['metadata']['literal']['records'].append(9),lambda x:x.update(id='different-source'),lambda x:x['faces'][0].reverse()):
            modified=deepcopy(m);mutate(modified)
            with self.assertRaises(GeometryError):evaluate(modified,p)
        for c in (dict(CONTEXT,notes='changed'),dict(CONTEXT,unit='cm')):
            with self.assertRaises(GeometryError):evaluate(m,p,c=c)
        for field in ('sourceAttributesSha256','sourceContextSha256','descriptorSha256'):
            forged=deepcopy(p);forged[field]='0'*64
            with self.assertRaises(GeometryError):evaluate(m,forged)
        for mutate in (lambda x:x['descriptor']['reversedTruncation']['normals'][0].__setitem__(0,100),lambda x:x['descriptor']['original']['metadata']['literal']['records'].append(9)):
            forged=deepcopy(p);mutate(forged);forged['descriptorSha256']=digest(forged['descriptor'])
            with self.assertRaises(GeometryError):evaluate(m,forged)

    def test_native_save_open_stores_source_settings_and_reconstructs_exact_saved_ratio(self):
        m=source();p=prepare(m);expected=evaluate(m,p)
        state={'model':m,'notes':CONTEXT['notes'],'view':{'coordinateUnit':'mm','dualMorph':expected['settings'],'angles':[17,0,0,0,0,0]}}
        project={'format':'polytope-laboratory','version':1,'active':0,'documents':[{'id':'augmentation-document','cursor':0,'states':[state]}]}
        with tempfile.TemporaryDirectory() as folder:
            file=Path(folder)/'augmentation.polyproj';save_project(file,project);loaded=load_file(file)['project']
        restored=loaded['documents'][0]['states'][0];self.assertEqual(restored['model']['metadata'],m['metadata']);self.assertEqual(restored['model']['vertices'],m['vertices']);self.assertEqual(restored['notes'],CONTEXT['notes']);self.assertEqual(restored['view'],state['view'])
        self.assertNotIn('morphFrame',restored);rebuilt=prepare(restored['model'],restored['view']['dualMorph']);frame=evaluate(restored['model'],rebuilt,restored['view']['dualMorph']['ratio'])
        self.assertEqual(frame['model'],expected['model']);self.assertEqual(frame['sourceMaps'],expected['sourceMaps'])

    def test_dimension_and_strict_envelopes_refuse_before_prepare(self):
        with self.assertRaises(GeometryError):prepare(source('tesseract'))
        m=source();p=prepare(m)
        for request in ({'op':'prepare-dual-morph','model':m,'params':{'settings':settings(),'sourceContext':CONTEXT},'extra':1},{'op':'prepare-dual-morph','model':m,'params':[]},{'op':'evaluate-dual-morph','model':m,'params':{'prepared':p,'ratio':.25,'sourceContext':CONTEXT,'extra':1}}):
            with self.assertRaises(GeometryError):server.dispatch(request)
        for t in (False,None,-1,2,'1'):
            with self.assertRaises(GeometryError):evaluate(m,p,t)

    def test_actual_jsonlines_invalid_then_valid_augmentation_route(self):
        m=source();requests=[{'id':'bad','op':'prepare-dual-morph','model':m,'params':[]},{'id':'good','op':'prepare-dual-morph','model':m,'params':{'settings':settings(),'sourceContext':CONTEXT}}]
        process=subprocess.run([sys.executable,'-B','-m','engine.server'],cwd=ROOT,input=''.join(json.dumps(r)+'\n' for r in requests),text=True,capture_output=True,timeout=30)
        self.assertEqual(process.returncode,0,process.stderr);bad,good=map(json.loads,process.stdout.splitlines());self.assertFalse(bad['ok']);self.assertEqual(bad['type'],'GeometryError');self.assertTrue(good['ok']);self.assertEqual(good['result']['settings']['method'],'augmentation')

if __name__=='__main__':unittest.main()
