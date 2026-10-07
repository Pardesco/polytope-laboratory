"""Production dispatch, storage and complete native package integration."""
import unittest
from copy import deepcopy
import json
from pathlib import Path
import subprocess
import sys
import tempfile

STAGE=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(STAGE))
from engine import server, display_state
from engine.generators import regular
from engine.geometry import GeometryError, identity, validate
from engine.formats import save_project,load_file
from engine.dual_morph import normalize_settings

def settings(method='expansion',**changes):
    return dict(version=1,enabled=True,method=method,center=None,radius=2**.5,ratio=0.,duration=2.,loop=False,**changes)

def source(key='cube'):
    m=regular(key)
    m['metadata']['coordinateUnits']='mm'
    m['metadata']['offlineAsset']={'relativePath':'literal.png','sha256':'f'*64}
    m['metadata']['historical']={'literal':[1,2,3]}
    m['metadata']['offColors']={'faces':[{'encoding':'byte','values':[50,100,150,127]}]+[None]*(len(m['faces'])-1)}
    return m

CONTEXT={'notes':'Original notes, not a geometry command.','unit':'mm'}
def prepare(m,s):return server.dispatch({'op':'prepare-dual-morph','model':m,'params':{'settings':s,'sourceContext':CONTEXT}})
def evaluate(m,p,t,context=CONTEXT):return server.dispatch({'op':'evaluate-dual-morph','model':m,'params':{'prepared':p,'ratio':t,'sourceContext':context}})
def counts(frame):return tuple(len(frame['model'][k]) for k in ('vertices','edges','faces','cells'))

class MountedMorph(unittest.TestCase):
    def test_production_server_and_validator_are_the_actual_targets(self):
        self.assertEqual(Path(server.__file__).resolve(),STAGE/'engine/server.py')
        self.assertEqual(Path(display_state.__file__).resolve(),STAGE/'engine/display_state.py')

    def test_four_native_methods_literal_endpoints_and_source_unchanged(self):
        m=source();before=deepcopy(m)
        for method in ('sizing','truncation','expansion','tilting-quads'):
            with self.subTest(method=method):
                p=prepare(m,settings(method));a=evaluate(m,p,0);b=evaluate(m,p,1)
                self.assertEqual(a['model']['vertices'],m['vertices'])
                for kind in ('vertices','edges','faces','cells'):self.assertEqual(a['model'][kind],m[kind])
                self.assertEqual(counts(a),(8,12,6,0));self.assertEqual(counts(b),(6,12,8,0))
                self.assertEqual(a['binding'],{k:p[k] for k in ('sourceModelId','sourceFingerprint','sourceAttributesSha256','sourceContextSha256','descriptorSha256')})
                self.assertFalse(a['certified']);self.assertFalse(b['certified'])
                self.assertEqual(b['sourceMaps']['vertices'][0]['sourceRank'],2)
                self.assertTrue(validate(b['model'])['passed'])
        self.assertEqual(m,before)

    def test_distinct_cube_intermediaries_and_absolute_reproducibility(self):
        m=source();expected={'sizing':(14,24,14,0),'truncation':(12,24,14,0),'expansion':(24,48,26,0),'tilting-quads':(26,48,24,0)}
        for method,n in expected.items():
            p=prepare(m,settings(method));middle=evaluate(m,p,.5)
            self.assertEqual(counts(middle),n)
            evaluate(m,p,.75);self.assertEqual(middle,evaluate(m,p,.5))
        p=prepare(m,settings('truncation'));self.assertEqual(counts(evaluate(m,p,.25)),(24,36,14,0))
        self.assertEqual(counts(evaluate(m,p,.75)),(24,36,14,0))
        with self.assertRaisesRegex(GeometryError,'unresolved'):evaluate(m,p,.5+1e-8)

    def test_sizing_point_and_radius_independent_witness(self):
        m=source();p=prepare(m,settings('sizing'));frame=evaluate(m,p,.25)
        self.assertEqual(frame['model']['vertices'][:8],[[.75*x for x in v] for v in m['vertices']])
        dual=evaluate(m,p,1)['model']['vertices']
        self.assertEqual(frame['model']['vertices'][8:],[[.25*x for x in v] for v in dual])
        self.assertTrue(all(abs(sum(x*x for x in v)-4)<1e-10 for v in dual))

    def test_4d_literal_and_intermediate_rank_counts(self):
        m=source('tesseract');before=deepcopy(m)
        for method,n in [('expansion',(64,192,208,80)),('tilting-quads',(80,208,192,64))]:
            p=prepare(m,settings(method));self.assertEqual(counts(evaluate(m,p,.5)),n)
            self.assertEqual(counts(evaluate(m,p,1)),(8,24,32,16))
        for method in ('sizing','truncation'):
            with self.assertRaises(GeometryError):prepare(m,settings(method))
        self.assertEqual(m,before)

    def test_strict_full_source_attribute_and_context_binding(self):
        m=source();p=prepare(m,settings())
        changes=[lambda x:x.update(id='other'),lambda x:x['vertices'][0].__setitem__(0,-2),
            lambda x:x['faces'][0].reverse(),lambda x:x['metadata']['offColors']['faces'][0]['values'].__setitem__(3,126),
            lambda x:x['metadata'].update(coordinateUnits='cm'),lambda x:x['metadata']['historical']['literal'].append(4)]
        for change in changes:
            modified=deepcopy(m);change(modified)
            with self.subTest(change=repr(change)),self.assertRaises(GeometryError):evaluate(modified,p,.25)
        for c in [dict(CONTEXT,unit='cm'),dict(CONTEXT,notes='changed')]:
            with self.assertRaisesRegex(GeometryError,'changed|forged'):evaluate(m,p,.25,c)
        for key in ('sourceAttributesSha256','sourceContextSha256','descriptorSha256'):
            forged=deepcopy(p);forged[key]='0'*64
            with self.assertRaisesRegex(GeometryError,'changed|forged'):evaluate(m,forged,.25)
        forged=deepcopy(p);forged['descriptor']['radius']=100
        with self.assertRaises(GeometryError):evaluate(m,forged,.25)

    def test_invalid_settings_and_strict_envelopes_refuse(self):
        m=source()
        mutations=[{'version':2},{'enabled':1},{'method':'imaginary'},{'center':[0,0]}, {'radius':0},{'radius':1e200},
                   {'ratio':-.1},{'ratio':1.1},{'duration':0},{'duration':3601},{'loop':0},{'unexpected':1}]
        for change in mutations:
            s=settings();s.update(change)
            with self.subTest(change=change),self.assertRaises(GeometryError):prepare(m,s)
        for params in ([],None,1,{'settings':settings(),'sourceContext':CONTEXT,'extra':1}):
            with self.assertRaises(GeometryError):server.dispatch({'op':'prepare-dual-morph','model':m,'params':params})
        p=prepare(m,settings())
        for ratio in (False,None,-1,2,'1'):
            with self.assertRaises(GeometryError):evaluate(m,p,ratio)

    def test_known_unimplemented_modes_readable_but_preflight_diagnosed(self):
        m=source()
        for method in ('via-snub',):
            self.assertEqual(normalize_settings(m,settings(method))['method'],method)
            with self.assertRaisesRegex(GeometryError,'not implemented'):prepare(m,settings(method))

    def test_legacy_missing_id_preserved_and_missing_fingerprint_reconstructed_natively(self):
        m=source();m.pop('id',None);m.pop('fingerprint',None);before=deepcopy(m)
        p=prepare(m,settings());self.assertIsNone(p['sourceModelId']);self.assertEqual(p['sourceFingerprint'],identity(m))
        frame=evaluate(m,p,.5);self.assertIsNone(frame['sourceModelId']);self.assertEqual(m,before)

    def test_native_save_reopen_only_stores_settings_not_display_geometry(self):
        for method in ('sizing','truncation','expansion','tilting-quads','augmentation'):
            m=source();s=settings(method);s['ratio']=.25
            state={'model':m,'notes':CONTEXT['notes'],'view':{'coordinateUnit':'mm','dualMorph':s,'angles':[17,0,0,0,0,0]}}
            project={'format':'polytope-laboratory','version':1,'active':0,'documents':[{'id':'document-original','cursor':0,'states':[state]}]}
            with tempfile.TemporaryDirectory() as folder:
                path=Path(folder)/'morph.polylab';save_project(path,project);reopened=load_file(path)['project']
            restored=reopened['documents'][0]['states'][0]
            self.assertEqual(restored['model']['vertices'],m['vertices']);self.assertEqual(restored['notes'],CONTEXT['notes'])
            self.assertEqual(restored['view'],state['view']);self.assertEqual(restored['model']['metadata'],m['metadata'])
            p=prepare(restored['model'],restored['view']['dualMorph']);frame=evaluate(restored['model'],p,.25)
            self.assertEqual(frame['settings']['ratio'],.25)

    def test_actual_jsonlines_invalid_then_valid_continuation(self):
        requests=[{'id':'invalid','op':'prepare-dual-morph','model':source(),'params':[]},
                  {'id':'valid','op':'prepare-dual-morph','model':source(),'params':{'settings':settings(),'sourceContext':CONTEXT}}]
        proc=subprocess.run([sys.executable,'-B','-m','engine.server'],cwd=STAGE,input=''.join(json.dumps(r)+'\n' for r in requests),text=True,capture_output=True,timeout=30)
        self.assertEqual(proc.returncode,0,proc.stderr)
        a,b=map(json.loads,proc.stdout.splitlines());self.assertFalse(a['ok']);self.assertEqual(a['type'],'GeometryError')
        self.assertTrue(b['ok']);self.assertEqual(b['result']['sourceFingerprint'],identity(requests[1]['model']))

if __name__=='__main__':unittest.main()
