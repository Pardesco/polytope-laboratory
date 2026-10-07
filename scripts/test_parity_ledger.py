"""Headless accounting tests: temporary repos only; no actual gate is applied."""
from copy import deepcopy
from collections import Counter
import importlib.util
import hashlib
import json
import marshal
from pathlib import Path
import tempfile
import struct
import sys
import types
import unittest
from unittest.mock import patch


ROOT=Path(__file__).resolve().parents[1]


def load(repository,name):
    filename={'ledger':'parity-ledger.py','apply':'apply-parity-gate.py','promote':'promote-parity-gate.py'}[name]
    spec=importlib.util.spec_from_file_location('test_'+name,repository/'scripts'/filename)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module


class AccountingTests(unittest.TestCase):
    def setUp(self):
        self.temporary=tempfile.TemporaryDirectory(prefix='parity-accounting-test-')
        self.addCleanup(self.temporary.cleanup)
        self.root=Path(self.temporary.name);(self.root/'docs').mkdir();(self.root/'scripts').mkdir();(self.root/'artifacts').mkdir()
        for name in ('parity-ledger.py','apply-parity-gate.py','qualify-lib04-gate.py','qualify-meas04-gate.py','promote-parity-gate.py','bind-validated-candidate.py','test_parity_ledger.py'):
            (self.root/'scripts'/name).write_bytes((ROOT/'scripts'/name).read_bytes())
        for name in ('STELLA4D_FEATURE_COMPLETE_BUILD_SPEC.md','package.json'):
            (self.root/name).write_bytes((ROOT/name).read_bytes())
        for name in ('parity-development-0.14.0.json','parity-development-0.15.0.json'):
            (self.root/'docs'/name).write_bytes((ROOT/'docs'/name).read_bytes())
        # Preserve current record content but construct an explicitly OPEN
        # accounting fixture. Later real LIB-04 closure must not make these
        # tests copy its candidate/evidence or attempt native execution.
        value=json.loads((ROOT/'docs/parity-ledger.json').read_text(encoding='utf-8'))
        for record in value['requirements']:
            if record.get('requirement_gate'):
                record.update(implementation_status='prototype',release_blocker=True)
                record.pop('requirement_gate');record.pop('gate_publications',None)
        (self.root/'docs/parity-ledger.json').write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding='utf-8')
        self.ledger=load(self.root,'ledger');self.apply=load(self.root,'apply');self.promote=load(self.root,'promote')
        self.path=self.root/'docs/parity-ledger.json';self.original=self.ledger.read_json(self.path)
        self.initial_bytes=self.path.read_bytes()
        self.expected=self.ledger.inventory(self.root)

    def write(self,value,path=None):
        (path or self.path).write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding='utf-8')

    def test_authoritative_73_records_and_baseline_policy_survive_all_historical_overlays(self):
        value=deepcopy(self.original)
        value['release_notes']={'literal':'user-owned 0.16-0.20 notes','extra':[1,{'doNotErase':True}]}
        for record in value['requirements']:
            record['source_notes']={'identity':record['requirement_id'],'rgba':[13,99,201,128],'unit':'mm'}
            record['validation_evidence']=(record['validation_evidence'] or '')+' EXACT CURRENT MANUAL EVIDENCE'
        self.write(value);before=self.path.read_bytes()
        result=self.ledger.build_ledger(self.root)
        self.assertEqual(result,value)
        self.assertEqual(result['baselinePolicy'],self.original['baselinePolicy'])
        self.assertEqual(Counter(r['implementation_status'] for r in result['requirements']),
                         Counter(r['implementation_status'] for r in self.original['requirements']))
        self.assertEqual(self.path.read_bytes(),before)

    def test_existing_literal_requirement_order_is_preserved(self):
        value=deepcopy(self.original);value['requirements'].reverse();self.write(value)
        self.assertEqual(self.ledger.build_ledger(self.root),value)

    def test_no_import_has_ledger_publication_side_effect(self):
        before=self.path.read_bytes();load(self.root,'ledger');load(self.root,'apply')
        self.assertEqual(self.path.read_bytes(),before)
        self.assertEqual(list((self.root/'docs').glob('*.tmp')),[])

    def test_original_spec_bytes_ids_titles_acceptances_cannot_drift(self):
        for edit in ('missing','duplicate','title','acceptance','manual','unknown'):
            value=deepcopy(self.original)
            if edit=='missing':value['requirements'].pop()
            elif edit=='duplicate':value['requirements'][1]=deepcopy(value['requirements'][0])
            elif edit=='title':value['requirements'][0]['competitor_workflow']+=' narrowed'
            elif edit=='acceptance':value['requirements'][0]['expected_result']='counts only'
            elif edit=='manual':value['requirements'][0]['manual_source']='rewritten-spec.md'
            else:value['requirements'][0]['requirement_id']='LIB-99'
            self.write(value)
            with self.subTest(edit=edit),self.assertRaises(self.ledger.LedgerError):self.ledger.build_ledger(self.root)
        self.write(self.original)
        spec=self.root/'STELLA4D_FEATURE_COMPLETE_BUILD_SPEC.md';spec.write_bytes(spec.read_bytes()+b'\n')
        with self.assertRaisesRegex(self.ledger.LedgerError,'unchanged'):self.ledger.build_ledger(self.root)

    def test_development_overlay_cannot_close_rename_or_alter_policy(self):
        overlay=self.root/'docs/overlay.json'
        for value in (
            {'requirements':{'LIB-04':{'implementation_status':'validated','release_blocker':False}}},
            {'requirements':{'LIB-04':{'implementation_status':'prototype','release_blocker':False}}},
            {'requirements':{'LIB-04':{'implementation_status':'prototype','release_blocker':True,'expected_result':'counts'}}},
            {'requirements':{'LIB-99':{'implementation_status':'prototype','release_blocker':True}}},
            {'baselineAuditComplete':True,'requirements':{}},
            {'baselinePolicy':{'purchaseOrUpgradeRequired':True},'requirements':{}},
        ):
            self.write(value,overlay)
            with self.subTest(value=value),self.assertRaises(self.ledger.LedgerError):
                self.ledger.build_ledger(self.root,[overlay])

    def test_bootstrap_is_bounded_open_progress_not_fake_gate_closure(self):
        self.path.unlink();result=self.ledger.build_ledger(self.root)
        self.assertEqual(len(result['requirements']),73)
        self.assertTrue(all(r['release_blocker'] is True for r in result['requirements']))
        self.assertFalse(result['baselineAuditComplete'])
        self.assertFalse(self.path.exists())

    def test_closed_status_without_actual_bound_receipt_is_refused(self):
        for status,blocker in (('validated',False),('released',False),('prototype',False),('validated',True)):
            value=deepcopy(self.original);record=next(r for r in value['requirements'] if r['requirement_id']=='LIB-04')
            record.update(implementation_status=status,release_blocker=blocker);self.write(value)
            with self.subTest(status=status,blocker=blocker),self.assertRaises(self.ledger.LedgerError):
                self.ledger.build_ledger(self.root)

    def test_no_other_requirement_can_use_lib04_closed_adapter(self):
        value=deepcopy(self.original);value['requirements'][0].update(implementation_status='validated',release_blocker=False)
        self.write(value)
        with self.assertRaisesRegex(self.ledger.LedgerError,'No reviewed'):self.ledger.build_ledger(self.root)

    def inert_gate(self):
        collector=self.apply.load_script(self.root,'qualify-lib04-gate.py','inert_fixture_schema')
        return {'format':'polytope-requirement-gate','schemaVersion':1,'requirementId':'LIB-04','passed':True,'status':'passed',
                'sourceUnchanged':True,'runtimeUnchanged':True,'version':json.loads((self.root/'package.json').read_text())['version'],
                'specification':collector.spec_inventory(),'acceptance':collector.ACCEPTANCE,
                'domain':{'sourceCount':16,'convexCount':6,'nonconvexCount':10,'keys':[r[0] for r in collector.DOMAIN],
                          'numericMode':'float64-approximate','normalizedTolerance':1e-8,'certified':False,'hullUsed':False,'baseline6Executed':False},
                'checks':{key:True for key in self.apply.CHECKS},
                'claims':{'LIB04AcceptanceFulfilled':True,'all73RequirementsFulfilled':False},
                'packagedEngineRevalidation':{'requestCount':16,'responseCount':16,'allFullReceiptsEqual':True,
                                             'jsonlOutputSha256':'0'*64,'stderrBytes':0},
                'actualAsarRevalidation':{'passed':True,'files':8},'evidence':{},'scripts':[]}

    def test_forged_pass_and_complete_summary_flags_cannot_publish_ledger(self):
        receipt=self.root/'artifacts/inert-invalid-gate.json';self.write(self.inert_gate(),receipt)
        before=self.path.read_bytes()
        with patch('subprocess.run',side_effect=AssertionError('No process permitted for invalid fixtures')):
            with self.assertRaisesRegex(self.apply.GateApplicationError,'evidence'):
                self.apply.apply_gate(receipt,self.root)
        self.assertEqual(self.path.read_bytes(),before)

    def test_regeneration_cannot_keep_a_closed_gate_with_only_fabricated_pass_flags(self):
        gate=self.inert_gate();receipt=self.root/'artifacts/inert-invalid-gate.json';self.write(gate,receipt)
        value=deepcopy(self.original);record=next(r for r in value['requirements'] if r['requirement_id']=='LIB-04')
        record.update(implementation_status='validated',release_blocker=False,
                      requirement_gate={'requirement_id':'LIB-04','status':'validated','version':gate['version'],
                                        'path':'artifacts/inert-invalid-gate.json','sha256':self.ledger.digest(receipt)})
        self.write(value);before=self.path.read_bytes()
        with patch('subprocess.run',side_effect=AssertionError('No process permitted')):
            with self.assertRaisesRegex(ValueError,'evidence'):self.ledger.build_ledger(self.root)
        self.assertEqual(self.path.read_bytes(),before)

    def test_wrong_version_scope_and_full_feature_claim_are_refused_before_execution(self):
        for change in ({'requirementId':'LIB-05'},{'version':'999.0.0'},{'acceptance':'counts sufficient'},
                       {'claims':{'LIB04AcceptanceFulfilled':True,'all73RequirementsFulfilled':True}},
                       {'checks':{'completeFlagOrbits':True}}, {'domain':{'sourceCount':16}}):
            gate=self.inert_gate();gate.update(change)
            with (self.subTest(change=change),patch('subprocess.run',side_effect=AssertionError('No process')),
                  self.assertRaises(self.apply.GateApplicationError)):
                self.apply.verify_receipt_references(gate,self.root)

    def test_evidence_hash_bytes_and_portable_containment_are_checked(self):
        path=self.root/'artifacts/source.json';path.write_bytes(b'{}')
        record={'path':'artifacts/source.json','sha256':self.ledger.digest(path),'bytes':2}
        self.assertEqual(self.apply.verify_reference(self.root,record,self.ledger),path)
        for changed in ({**record,'sha256':'0'*64},{**record,'bytes':1},{**record,'path':'../source.json'},
                        {**record,'path':'artifacts/../package.json'},{**record,'path':'C:/source.json'},
                        {**record,'path':'artifacts\\source.json'},{**record,'unexpected':True}):
            with self.subTest(record=changed),self.assertRaises(self.apply.GateApplicationError):
                self.apply.verify_reference(self.root,changed,self.ledger)

    def inert_meas_gate(self):
        collector=self.apply.load_script(self.root,'qualify-meas04-gate.py','INERT_meas_schema')
        fixtures=collector.cases()
        return {**self.inert_gate(),'requirementId':'MEAS-04','specification':collector.spec_inventory(),
                'acceptance':collector.ACCEPTANCE,'domain':deepcopy(collector.DOMAIN),
                'checks':{key:True for key in collector.GATE_CHECKS},
                'claims':{'MEAS04AcceptanceFulfilled':True,'all73RequirementsFulfilled':False},
                'packagedEngineRevalidation':{'requestCount':len(fixtures),'responseCount':len(fixtures),
                    'positiveCount':sum(not r.get('refusal') for r in fixtures),
                    'refusalCount':sum(bool(r.get('refusal')) for r in fixtures),
                    'fixtureSha256':hashlib.sha256(collector.canonical(fixtures)).hexdigest(),
                    'allIndependentCasesEqual':True,'validContinuationAfterRefusal':True,
                    'jsonlOutputSha256':'0'*64,'stderrBytes':0}}

    def historical_collector_fixture(self,gate):
        # Partial frozen loader fixture only; lacks evidence and cannot qualify.
        source=self.root/'artifacts/INERT-collector-frozen/source';(source/'scripts').mkdir(parents=True,exist_ok=True)
        hashes={}
        for name in ('qualify-lib04-gate.py','qualify-meas04-gate.py','promote-parity-gate.py'):
            file=source/'scripts'/name;file.write_bytes((self.root/'scripts'/name).read_bytes())
            hashes['scripts/'+name]=self.ledger.digest(file)
        spec=source/'STELLA4D_FEATURE_COMPLETE_BUILD_SPEC.md';spec.write_bytes((self.root/spec.name).read_bytes())
        filename=self.apply.REVIEWED[gate['requirementId']];file=source/'scripts'/filename
        gate['scripts']=[{'path':'scripts/'+filename,'sha256':self.ledger.digest(file),'bytes':file.stat().st_size}]
        return {'version':gate['version'],'sourceRoot':source,'sourceHashes':hashes}

    def test_meas_summary_flags_cannot_apply_or_regenerate_a_closed_gate(self):
        gate=self.inert_meas_gate();path=self.root/'artifacts/INERT-INVALID-MEAS.json';self.write(gate,path)
        with patch('subprocess.run',side_effect=AssertionError('No process for invalid fixtures')):
            with self.assertRaisesRegex(ValueError,'evidence'):self.apply.apply_gate(path,self.root)
            value=deepcopy(self.original);record=next(r for r in value['requirements'] if r['requirement_id']=='MEAS-04')
            record.update(implementation_status='validated',release_blocker=False,requirement_gate={
                'requirement_id':'MEAS-04','status':'validated','version':gate['version'],
                'path':path.relative_to(self.root).as_posix(),'sha256':self.ledger.digest(path)})
            self.write(value);before=self.path.read_bytes()
            with self.assertRaisesRegex(ValueError,'evidence'):self.ledger.build_ledger(self.root)
            self.assertEqual(self.path.read_bytes(),before)

    def test_meas_refuses_altered_scope_oracles_threshold_and_recovery_before_native_execution(self):
        original=self.inert_meas_gate()
        for change in ('spec','acceptance','domain','checks','all73','count','fixture','refusals','continuation','version'):
            gate=deepcopy(original)
            if change=='spec':gate['specification']['requirements'][0]['acceptance']='INERT rewrite'
            elif change=='acceptance':gate['acceptance']='Arithmetic only'
            elif change=='domain':gate['domain']['numericModes']=['float64-approximate']
            elif change=='checks':gate['checks'].pop('exactRationalThresholdAndAtomicBatch')
            elif change=='all73':gate['claims']['all73RequirementsFulfilled']=True
            elif change=='version':gate['version']='0.21.0'
            else:
                key={'count':'requestCount','fixture':'fixtureSha256','refusals':'refusalCount','continuation':'validContinuationAfterRefusal'}[change]
                gate['packagedEngineRevalidation'][key]={'count':16,'fixture':'1'*64,'refusals':0,'continuation':False}[change]
            with self.subTest(change=change),patch('subprocess.run',side_effect=AssertionError('No process')),self.assertRaises(ValueError):
                self.apply.verify_receipt_references(gate,self.root)
        self.assertEqual(self.path.read_bytes(),self.initial_bytes)

    def test_two_reviewed_pure_publications_preserve_all71_other_records_and_prior_evidence(self):
        # Pure updater only: no synthetic pass ever reaches the verifier or disk.
        result=deepcopy(self.original)
        for rid in ('LIB-04','MEAS-04'):
            association={'requirement_id':rid,'status':'validated','version':'INERT-UNIT',
                         'path':'artifacts/NEVER-QUALIFIED-'+rid+'.json','sha256':'0'*64}
            before=deepcopy(result)
            result=self.apply.publish_verified_gate(result,association,{'requirementId':rid,'version':'INERT-UNIT'})
            for a,b in zip(before['requirements'],result['requirements']):
                if a['requirement_id']!=rid:self.assertEqual(a,b)
                else:self.assertEqual(b['gate_publications'][-1]['previousRecord'],a)
        self.assertEqual(sum(not r['release_blocker'] for r in result['requirements']),2)
        for a,b in zip(self.original['requirements'],result['requirements']):
            if a['requirement_id'] not in ('LIB-04','MEAS-04'):self.assertEqual(a,b)
        self.assertEqual(self.path.read_bytes(),self.initial_bytes)

    def test_meas_release_updater_requires_its_own_validated_gate_and_cannot_downgrade(self):
        association={'requirement_id':'MEAS-04','status':'validated','version':'INERT-UNIT',
                     'path':'artifacts/NEVER-QUALIFIED.json','sha256':'0'*64}
        receipt={'requirementId':'MEAS-04','version':'INERT-UNIT'}
        with self.assertRaises(ValueError):self.promote.publish_released(self.original,association,{})
        validated=self.apply.publish_verified_gate(self.original,association,receipt)
        released=self.promote.publish_released(validated,association,{'format':'INERT pure helper fixture'})
        self.assertEqual(self.apply.publish_verified_gate(released,association,receipt),released)
        for a,b in zip(validated['requirements'],released['requirements']):
            if a['requirement_id']!='MEAS-04':self.assertEqual(a,b)
        with self.assertRaisesRegex(ValueError,'downgraded'):
            self.apply.publish_verified_gate(released,{**association,'sha256':'1'*64},receipt)
        self.assertEqual(self.path.read_bytes(),self.initial_bytes)

    def test_meas_historical_version_uses_retained_evidence_not_current_development_version(self):
        gate=self.inert_meas_gate();self.write({'version':'0.21.0'},self.root/'package.json')
        with self.assertRaisesRegex(ValueError,'current qualified candidate'):
            self.apply.verify_receipt_references(gate,self.root)
        with self.assertRaisesRegex(ValueError,'evidence'):
            self.apply.verify_receipt_references(gate,self.root,historical=self.historical_collector_fixture(gate))
        with self.assertRaisesRegex(ValueError,'Historical frozen version'):
            self.apply.verify_receipt_references(gate,self.root,historical={'version':'0.22.0'})

    def test_released_loader_uses_executed_frozen_collector_after_legitimate_current_code_changes(self):
        for rid in ('LIB-04','MEAS-04'):
            gate=self.inert_meas_gate() if rid=='MEAS-04' else self.inert_gate()
            historical=self.historical_collector_fixture(gate)
            collector=self.root/'scripts'/self.apply.REVIEWED[rid];before=collector.read_bytes()
            try:
                collector.write_text('raise AssertionError("Current collector must not execute for historical evidence")\n')
                with self.subTest(rid=rid),self.assertRaisesRegex(ValueError,'evidence'):
                    self.apply.verify_receipt_references(gate,self.root,historical=historical)
                file=historical['sourceRoot']/'scripts'/self.apply.REVIEWED[rid];file.write_bytes(file.read_bytes()+b'\n')
                with self.subTest(rid=rid),self.assertRaisesRegex(ValueError,'Historical collector bytes'):
                    self.apply.verify_receipt_references(gate,self.root,historical=historical)
            finally:collector.write_bytes(before)

    def test_meas_released_full42_requires_both_actual_finite_gate_outer_runs(self):
        path,proof,release,gate,unpacked,hashes=self.desktop_fixture()
        gate['requirementId']='MEAS-04'
        gate['evidence']={'workspace_desktop_proof':{'path':path.relative_to(self.root).as_posix()},
                          'layers_desktop_proof':{'path':path.relative_to(self.root).as_posix()}}
        self.promote.verify_desktop_proofs(self.root,release,gate,unpacked,self.apply,self.ledger,hashes)
        for kind in ('workspace_desktop_proof','layers_desktop_proof'):
            changed=deepcopy(gate);other=self.root/'artifacts/UNBOUND-OUTER';other.write_bytes(b'INERT')
            changed['evidence'][kind]['path']=other.relative_to(self.root).as_posix()
            with self.subTest(kind=kind),self.assertRaisesRegex(ValueError,'finite gate outer'):
                self.promote.verify_desktop_proofs(self.root,release,changed,unpacked,self.apply,self.ledger,hashes)

    def test_pure_verified_update_retains_every_other_record_and_prior_lib04_attributes(self):
        # Exercise only the pure updater. This inert data has not passed the
        # verifier and is NEVER written or accepted by apply_gate.
        value=deepcopy(self.original);record=next(r for r in value['requirements'] if r['requirement_id']=='LIB-04')
        record['research_notes']={'literal':'keep all user notes','rgba':[1,2,3,4]}
        before=deepcopy(value)
        association={'requirement_id':'LIB-04','path':'artifacts/NOT-A-QUALIFIED-GATE.json','sha256':'0'*64,
                     'version':'fixture-only','status':'validated'}
        updated=self.apply.publish_verified_gate(value,association,{'requirementId':'LIB-04','version':'fixture-only'})
        self.assertEqual(value,before)
        self.assertEqual({k:v for k,v in updated.items() if k!='requirements'},
                         {k:v for k,v in before.items() if k!='requirements'})
        for old,new in zip(before['requirements'],updated['requirements']):
            if old['requirement_id']!='LIB-04':self.assertEqual(new,old)
            else:
                self.assertEqual(new['gate_publications'][0]['previousRecord'],old)
                self.assertEqual(new['research_notes'],old['research_notes'])
                self.assertTrue(new['validation_evidence'].startswith(old['validation_evidence']))
                self.assertEqual(new['implementation_status'],'validated');self.assertFalse(new['release_blocker'])
        self.assertEqual(self.apply.publish_verified_gate(updated,association,{'requirementId':'LIB-04','version':'fixture-only'}),updated)
        self.assertEqual(self.path.read_bytes(),self.initial_bytes)

    def test_atomic_publication_denies_competing_edit_and_cleans_only_owned_temp(self):
        before=self.ledger.digest(self.path);value=self.ledger.build_ledger(self.root)
        self.path.write_bytes(b'{"concurrent":"edit"}');competing=self.path.read_bytes()
        with self.assertRaisesRegex(self.ledger.LedgerError,'changed'):
            self.ledger.atomic_write_ledger(self.path,value,before)
        self.assertEqual(self.path.read_bytes(),competing)
        self.assertEqual(list((self.root/'docs').glob('.parity-ledger-*.tmp')),[])

    def test_atomic_failure_keeps_last_valid_ledger(self):
        before=self.path.read_bytes();sha=self.ledger.digest(self.path)
        with patch.object(self.ledger.os,'replace',side_effect=PermissionError('fixture refusal')):
            with self.assertRaises(PermissionError):self.ledger.atomic_write_ledger(self.path,self.original,sha)
        self.assertEqual(self.path.read_bytes(),before)
        self.assertEqual(list((self.root/'docs').glob('.parity-ledger-*.tmp')),[])

    def test_atomic_regeneration_writes_only_fixed_ledger_and_retains_all_progress(self):
        value=self.ledger.build_ledger(self.root);before=self.ledger.digest(self.path)
        self.ledger.atomic_write_ledger(self.path,value,before)
        self.assertEqual(self.ledger.read_json(self.path),self.original)
        other=self.root/'docs/NOT-ledger.json'
        with self.assertRaisesRegex(self.ledger.LedgerError,'fixed'):self.ledger.atomic_write_ledger(other,value,None)
        self.assertFalse(other.exists())

    def test_duplicate_nonfinite_receipt_json_is_refused(self):
        path=self.root/'artifacts/bad.json'
        for data in ('{"passed":false,"passed":true}','{"n":NaN}','{"n":1e999}'):
            path.write_text(data)
            with self.subTest(data=data),self.assertRaises(self.ledger.LedgerError):self.ledger.read_json(path)

    def frozen_fixture(self):
        directory=self.root/'artifacts/frozen-UNIT-FIXTURE'
        source=directory/'source';(source/'ui').mkdir(parents=True)
        (source/'ui/example.mjs').write_bytes(b'export const value=20;')
        hashes={'ui/example.mjs':self.ledger.digest(source/'ui/example.mjs')}
        manifest=directory/'source-hashes.json'
        self.write({'version':'0.20.0','sourceHashes':hashes,'scope':'inert headless helper fixture; not a qualification'},manifest)
        record=self.promote.reference(self.root,manifest,self.ledger)
        return source,manifest,hashes,record

    def test_frozen_sources_are_independent_of_development_version_and_bytes(self):
        source,manifest,hashes,record=self.frozen_fixture()
        (self.root/'ui').mkdir();(self.root/'ui/example.mjs').write_bytes(b'changed-development-21')
        self.write({'version':'0.21.0'},self.root/'package.json')
        frozen=self.promote.verify_frozen(self.root,record,hashes,'0.20.0',self.apply,self.ledger)
        self.assertEqual(frozen['sourceRoot'],source)
        self.assertEqual(frozen['sourceHashes'],hashes)
        self.assertEqual(self.path.read_bytes(),self.initial_bytes)

    def test_frozen_copy_tamper_and_added_or_missing_files_are_refused(self):
        source,manifest,hashes,record=self.frozen_fixture()
        path=source/'ui/example.mjs';original=path.read_bytes()
        path.write_bytes(b'tampered')
        with self.assertRaisesRegex(ValueError,'Frozen source bytes'):
            self.promote.verify_frozen(self.root,record,hashes,'0.20.0',self.apply,self.ledger)
        path.write_bytes(original);extra=source/'UNRECORDED.txt';extra.write_bytes(b'no')
        with self.assertRaisesRegex(ValueError,'membership'):
            self.promote.verify_frozen(self.root,record,hashes,'0.20.0',self.apply,self.ledger)
        extra.unlink();path.unlink()
        with self.assertRaises((ValueError,FileNotFoundError)):
            self.promote.verify_frozen(self.root,record,hashes,'0.20.0',self.apply,self.ledger)

    def test_frozen_manifest_hash_version_scope_and_path_escape_refusals(self):
        source,manifest,hashes,record=self.frozen_fixture()
        for required,version in (({'ui/MISSING.mjs':'0'*64},'0.20.0'),(hashes,'0.21.0')):
            with self.subTest(required=required,version=version),self.assertRaises(ValueError):
                self.promote.verify_frozen(self.root,record,required,version,self.apply,self.ledger)
        manifest.write_bytes(manifest.read_bytes()+b' ')
        with self.assertRaisesRegex(ValueError,'hash'):
            self.promote.verify_frozen(self.root,record,hashes,'0.20.0',self.apply,self.ledger)
        self.write({'version':'0.20.0','sourceHashes':{'../OUTSIDE':'0'*64}},manifest)
        record=self.promote.reference(self.root,manifest,self.ledger)
        with self.assertRaisesRegex(ValueError,'Unsafe'):
            self.promote.verify_frozen(self.root,record,{},'0.20.0',self.apply,self.ledger)

    def test_candidate_version_check_remains_strict_and_historical_path_is_not_a_pass(self):
        gate=self.inert_gate();self.write({'version':'0.21.0'},self.root/'package.json')
        with self.assertRaisesRegex(ValueError,'current qualified candidate'):
            self.apply.verify_receipt_references(gate,self.root)
        # Historical mode must reach evidence validation instead of consulting
        # dev21. This deliberately incomplete fixture still cannot pass.
        with self.assertRaisesRegex(ValueError,'evidence'):
            self.apply.verify_receipt_references(gate,self.root,historical=self.historical_collector_fixture(gate))
        with self.assertRaisesRegex(ValueError,'Historical frozen version'):
            self.apply.verify_receipt_references(gate,self.root,historical={'version':'0.19.0'})

    def test_historical_source_references_use_retained_copy_and_still_refuse_hash_changes(self):
        source,manifest,hashes,record=self.frozen_fixture()
        frozen=self.promote.verify_frozen(self.root,record,hashes,'0.20.0',self.apply,self.ledger)
        (self.root/'ui').mkdir();(self.root/'ui/example.mjs').write_bytes(b'new21')
        ref={'path':str(self.root/'ui/example.mjs'),'sha256':hashes['ui/example.mjs'],
             'bytes':(source/'ui/example.mjs').stat().st_size}
        self.promote.verify_release_references(self.root,{'nested':[{'source':ref}]},frozen,self.apply,self.ledger)
        for key,value in (('sha256','0'*64),('bytes',ref['bytes']+1)):
            with self.subTest(key=key),self.assertRaisesRegex(ValueError,'Historical source'):
                self.promote.verify_release_references(self.root,{**ref,key:value},frozen,self.apply,self.ledger)

    def test_all_artifact_reference_hashes_are_rechecked_recursively(self):
        source,manifest,hashes,record=self.frozen_fixture()
        frozen=self.promote.verify_frozen(self.root,record,hashes,'0.20.0',self.apply,self.ledger)
        evidence=self.root/'artifacts/unit-log.txt';evidence.write_bytes(b'inert test log')
        ref=self.promote.reference(self.root,evidence,self.ledger)
        self.promote.verify_release_references(self.root,{'validation':{'suiteLogs':[ref]}},frozen,self.apply,self.ledger)
        evidence.write_bytes(b'tampered test log')
        with self.assertRaisesRegex(ValueError,'hash'):
            self.promote.verify_release_references(self.root,{'validation':{'suiteLogs':[ref]}},frozen,self.apply,self.ledger)

    def test_partial_or_unpromoted_summary_flags_cannot_make_released_gate(self):
        before=self.path.read_bytes()
        gate=self.inert_gate()
        for association in (None,{'format':'polytope-released-gate-association','schemaVersion':1,'version':'0.20.0','references':{}},
                            {'format':'polytope-released-gate-association','schemaVersion':1,'version':'0.21.0','references':{}}):
            with self.subTest(association=association),patch('subprocess.run',side_effect=AssertionError('No native/GUI process')):
                with self.assertRaises(ValueError):self.promote.verify_release_association(gate,association,self.root)
        self.assertEqual(self.path.read_bytes(),before)

    def portable_fixture(self):
        # Test the extracted-runtime comparison only, not a passed gate receipt.
        resources={key:{'bytes':index+3,'sha256':hashlib.sha256(key.encode()).hexdigest()}
                   for index,key in enumerate(('executable','appAsar','engineExecutable'))}
        gate={'release':resources};native={'engineResources':{'unit.exe':{'bytes':4,'sha256':'1'*64}}}
        unpacked=self.root/'release/unit-unpacked'
        binding={'unchanged':True,'matchesCandidate':True,'candidateRoot':str(unpacked),
                 'archiveSha256':resources['appAsar']['sha256'],'nativeExecutableSha256':resources['engineExecutable']['sha256'],
                 'executable':resources['executable'],'archive':resources['appAsar'],'nativeExecutable':resources['engineExecutable'],
                 'engineResources':deepcopy(native['engineResources'])}
        return binding,gate,native,unpacked

    def test_portable_actual_extracted_payload_requires_all_resource_identities(self):
        binding,gate,native,unpacked=self.portable_fixture()
        self.promote.verify_portable_binding(binding,gate,native,unpacked)
        for key,value in (('unchanged',False),('matchesCandidate',False),('candidateRoot','another'),
                          ('archiveSha256','0'*64),('nativeExecutableSha256','0'*64),('engineResources',{}),
                          ('executable',{'bytes':0,'sha256':'0'*64}),('archive',{}),('nativeExecutable',{})):
            changed=deepcopy(binding);changed[key]=value
            with self.subTest(key=key),self.assertRaises(ValueError):
                self.promote.verify_portable_binding(changed,gate,native,unpacked)

    def make_asar(self,changes=None):
        data={'package.json':b'{"version":"0.20.0"}','desktop/main.cjs':b'unit MAIN','dist/index.html':b'unit HTML'}
        tree={};offset=0;records=[]
        for name,raw in data.items():
            group=tree
            parts=name.split('/')
            for part in parts[:-1]:group=group.setdefault(part,{'files':{}})['files']
            group[parts[-1]]={'size':len(raw),'offset':str(offset)};offset+=len(raw)
            if name!='package.json':records.append({'path':name,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()})
        if changes:changes(tree)
        raw=json.dumps({'files':tree},separators=(',',':')).encode();padding=(-len(raw))%4
        size=8+len(raw)+padding
        path=self.root/'artifacts/unit-fixture.asar'
        path.write_bytes(struct.pack('<IIII',4,size,size-4,len(raw))+raw+b'\0'*padding+b''.join(data.values()))
        return path,records

    def test_static_asar_reader_checks_exact_payload_without_node_or_electron(self):
        archive,records=self.make_asar()
        with patch('subprocess.run',side_effect=AssertionError('No process permitted')):
            self.promote.read_asar_files(archive,records,'0.20.0')
        with self.assertRaisesRegex(ValueError,'version'):self.promote.read_asar_files(archive,records,'0.21.0')
        changed=deepcopy(records);changed[0]['sha256']='0'*64
        with self.assertRaisesRegex(ValueError,'bytes'):self.promote.read_asar_files(archive,changed,'0.20.0')
        with self.assertRaisesRegex(ValueError,'membership'):self.promote.read_asar_files(archive,records[:1],'0.20.0')

    def test_static_asar_reader_refuses_link_unpack_and_out_of_archive_offsets(self):
        for extra in ({'link':'elsewhere'},{'unpacked':True},{'offset':str(2**63)},{'offset':'-1'},{'size':2**40}):
            archive,records=self.make_asar(lambda tree:tree['desktop']['files']['main.cjs'].update(extra))
            with self.subTest(extra=extra),self.assertRaises(ValueError):self.promote.read_asar_files(archive,records,'0.20.0')

    def test_engine_resource_membership_and_every_byte_are_checked(self):
        unpacked=self.root/'release/unit-unpacked';directory=unpacked/'resources/engine';directory.mkdir(parents=True)
        path=directory/'unit.exe';path.write_bytes(b'UNIT NOT AN EXECUTABLE')
        expected={'unit.exe':{'bytes':path.stat().st_size,'sha256':self.ledger.digest(path)}}
        self.promote.verify_engine_resources(unpacked,expected,self.ledger)
        path.write_bytes(b'CHANGED')
        with self.assertRaisesRegex(ValueError,'bytes'):self.promote.verify_engine_resources(unpacked,expected,self.ledger)
        path.write_bytes(b'UNIT NOT AN EXECUTABLE');(directory/'extra').write_bytes(b'unlisted')
        with self.assertRaisesRegex(ValueError,'membership'):self.promote.verify_engine_resources(unpacked,expected,self.ledger)

    def test_pure_release_publication_preserves_previous_closure_and_all_other_72(self):
        association={'requirement_id':'LIB-04','status':'validated','version':'UNIT-FIXTURE',
                     'path':'artifacts/NOT-A-QUALIFIED-GATE.json','sha256':'0'*64}
        value=self.apply.publish_verified_gate(self.original,association,{'requirementId':'LIB-04','version':'UNIT-FIXTURE'})
        before=deepcopy(value);release={'format':'INERT PURE-UPDATE FIXTURE; never verified or published'}
        result=self.promote.publish_released(value,association,release)
        self.assertEqual(value,before)
        for original,updated in zip(value['requirements'],result['requirements']):
            if original['requirement_id']!='LIB-04':self.assertEqual(original,updated)
            else:
                self.assertEqual(updated['implementation_status'],'released')
                self.assertFalse(updated['release_blocker'])
                self.assertEqual(updated['gate_publications'][:-1],original['gate_publications'])
                self.assertEqual(updated['gate_publications'][-1]['previousRecord'],{k:v for k,v in original.items() if k!='gate_publications'})
        self.assertEqual(self.promote.publish_released(result,association,release),result)
        self.assertEqual(self.path.read_bytes(),self.initial_bytes)

    def test_release_publication_cannot_skip_a_validated_same_gate(self):
        association={'requirement_id':'LIB-04','status':'validated','version':'UNIT','path':'artifacts/NOT-PASSED','sha256':'0'*64}
        with self.assertRaisesRegex(ValueError,'already independently validated'):
            self.promote.publish_released(self.original,association,{})
        validated=self.apply.publish_verified_gate(self.original,association,{'requirementId':'LIB-04','version':'UNIT'})
        with self.assertRaisesRegex(ValueError,'already independently validated'):
            self.promote.publish_released(validated,{**association,'sha256':'1'*64},{})

    def test_reapplying_validated_receipt_never_downgrades_or_replaces_a_released_gate(self):
        association={'requirement_id':'LIB-04','status':'validated','version':'UNIT',
                     'path':'artifacts/NOT-QUALIFIED','sha256':'0'*64}
        validated=self.apply.publish_verified_gate(self.original,association,{'requirementId':'LIB-04','version':'UNIT'})
        released=self.promote.publish_released(validated,association,{'format':'INERT UNIT FIXTURE'})
        self.assertEqual(self.apply.publish_verified_gate(released,association,{'requirementId':'LIB-04','version':'UNIT'}),released)
        for edit in ({'requirementId':'LIB-04','version':'OTHER'},{'sha256':'1'*64},{'path':'artifacts/DIFFERENT'}):
            with self.subTest(edit=edit),self.assertRaisesRegex(ValueError,'downgraded'):
                self.apply.publish_verified_gate(released,{**association,**edit},{'requirementId':'LIB-04','version':'OTHER'})

    def desktop_fixture(self):
        # These inert bytes test reference/coherence validation only. They are
        # never passed to the full release verifier or treated as runnable.
        unpacked=self.root/'release/unit-unpacked';(unpacked/'resources').mkdir(parents=True)
        executable=unpacked/'Polytope Laboratory.exe';executable.write_bytes(b'INERT EXE')
        archive=unpacked/'resources/app.asar';archive.write_bytes(b'INERT ASAR')
        source_hashes={'scripts/qualify-desktop.cjs':'1'*64,'desktop/main.cjs':'2'*64}
        entries=[];logs=[]
        for name,script in self.promote.SUITE_SCRIPTS.items():
            source_hashes['scripts/'+script]=hashlib.sha256(script.encode()).hexdigest()
            log=self.root/'artifacts'/('UNIT-'+name+'.log');log.write_text('INERT TEST FIXTURE')
            logs.append(self.promote.reference(self.root,log,self.ledger))
            entries.append({'name':name,'script':script,'passed':True,'exitCode':0,'scriptUnchanged':True,
                            'scriptSha256':source_hashes['scripts/'+script],'log':str(log)})
        proof={'version':'0.20.0','passed':True,'runtimeUnchanged':True,'qualificationScriptUnchanged':True,
               'qualificationScriptSha256':source_hashes['scripts/qualify-desktop.cjs'],'executable':str(executable),
               'runtime':{'packaged':True,'version':'0.20.0','executablePath':str(executable),'archivePath':str(archive),
                          'executableSha256':self.ledger.digest(executable),'archiveSha256':self.ledger.digest(archive),
                          'mainSha256':source_hashes['desktop/main.cjs']},'suites':entries}
        path=self.root/'artifacts/UNIT-outer-proof.json';self.write(proof,path)
        release={'validation':{'packagedSuites':42,'qualifications':[self.promote.reference(self.root,path,self.ledger)],'suiteLogs':logs}}
        gate={'requirementId':'LIB-04','version':'0.20.0','release':{'executable':{'sha256':self.ledger.digest(executable)},'appAsar':{'sha256':self.ledger.digest(archive)}},
              'evidence':{'desktop_proof':{'path':path.relative_to(self.root).as_posix()}}}
        return path,proof,release,gate,unpacked,source_hashes

    def test_all42_distinct_suite_names_correct_scripts_and_actual_log_hashes_are_required(self):
        path,proof,release,gate,unpacked,hashes=self.desktop_fixture()
        self.assertEqual(len(self.promote.SUITES),42)
        self.promote.verify_desktop_proofs(self.root,release,gate,unpacked,self.apply,self.ledger,hashes)
        for change in ('missing','duplicate','wrongScript','changedScript','failed','logOmitted','countOnly'):
            p=deepcopy(proof);r=deepcopy(release)
            if change=='missing':p['suites'].pop()
            elif change=='duplicate':p['suites'].append(deepcopy(p['suites'][0]))
            elif change=='wrongScript':
                p['suites'][0].update(script=p['suites'][1]['script'],scriptSha256=p['suites'][1]['scriptSha256'])
            elif change=='changedScript':p['suites'][0]['scriptUnchanged']=False
            elif change=='failed':p['suites'][0]['exitCode']=1
            elif change=='logOmitted':r['validation']['suiteLogs'].pop()
            else:r['validation']['packagedSuites']=41
            self.write(p,path);r['validation']['qualifications']=[self.promote.reference(self.root,path,self.ledger)]
            with self.subTest(change=change),self.assertRaises(ValueError):
                self.promote.verify_desktop_proofs(self.root,r,gate,unpacked,self.apply,self.ledger,hashes)

    def test_desktop_proof_cannot_rebind_candidate_archive_version_or_runner(self):
        path,proof,release,gate,unpacked,hashes=self.desktop_fixture()
        for change in ('archive','exe','main','version','runner','unchanged','gateOuter'):
            p=deepcopy(proof);g=deepcopy(gate)
            if change=='archive':p['runtime']['archiveSha256']='0'*64
            elif change=='exe':p['runtime']['executableSha256']='0'*64
            elif change=='main':p['runtime']['mainSha256']='0'*64
            elif change=='version':p['version']='0.21.0'
            elif change=='runner':p['qualificationScriptSha256']='0'*64
            elif change=='unchanged':p['runtimeUnchanged']=False
            else:
                other=self.root/'artifacts/OTHER-UNIT-PROOF';other.write_bytes(b'inert')
                g['evidence']['desktop_proof']['path']=other.relative_to(self.root).as_posix()
            self.write(p,path);release['validation']['qualifications']=[self.promote.reference(self.root,path,self.ledger)]
            with self.subTest(change=change),self.assertRaises(ValueError):
                self.promote.verify_desktop_proofs(self.root,release,g,unpacked,self.apply,self.ledger,hashes)

    def compiled_fixture(self):
        source=self.root/'artifacts/UNIT-native/source';(source/'engine').mkdir(parents=True)
        (source/'engine/__init__.py').write_bytes(b'value = 20\n')
        (source/'engine/server.py').write_bytes(b'answer = 42\n')
        module_code=compile(b'value = 20\n','arbitrary-original-filename','exec',dont_inherit=True,optimize=0)
        server_code=compile(b'answer = 42\n','another-filename','exec',dont_inherit=True,optimize=0)
        data=b'INERT PYZ DATA'
        class Pyz:
            toc={'engine':None}
            def extract(self,name):return module_code
        class Archive:
            def __init__(self,filename):pass
            def open_embedded_archive(self,name):return Pyz()
            def extract(self,name):return data if name=='PYZ.pyz' else marshal.dumps(server_code)
        reader=types.ModuleType('PyInstaller.archive.readers');reader.CArchiveReader=Archive
        hashes={'engine/__init__.py':self.ledger.digest(source/'engine/__init__.py'),'engine/server.py':self.ledger.digest(source/'engine/server.py')}
        bundle={'python':self.promote.platform.python_version(),'moduleCount':1,'buildPyzSha256':hashlib.sha256(data).hexdigest(),
                'modules':[{'module':'engine','source':'engine/__init__.py','sha256':hashes['engine/__init__.py'],'compiledCodeEqual':True}]}
        return source,hashes,bundle,reader

    def test_historical_bytecode_matches_frozen_source_not_filenames_or_current_source(self):
        source,hashes,bundle,reader=self.compiled_fixture()
        (self.root/'engine').mkdir();(self.root/'engine/__init__.py').write_bytes(b'value=21')
        with patch.dict(sys.modules,{'PyInstaller.archive.readers':reader}):
            self.promote.verify_compiled_native(self.root/'UNIT-NOT-RUN.exe',bundle,{'sourceRoot':source,'sourceHashes':hashes},self.ledger)
            (source/'engine/__init__.py').write_bytes(b'value = 21\n')
            # Even a newly hashed source cannot explain the old literal code.
            changed=deepcopy(bundle);hashes['engine/__init__.py']=self.ledger.digest(source/'engine/__init__.py')
            changed['modules'][0]['sha256']=hashes['engine/__init__.py']
            with self.assertRaisesRegex(ValueError,'compiled engine code'):
                self.promote.verify_compiled_native(self.root/'UNIT-NOT-RUN.exe',changed,{'sourceRoot':source,'sourceHashes':hashes},self.ledger)

    def test_historical_bytecode_python_inventory_server_and_embedded_pyz_tamper_refusal(self):
        source,hashes,bundle,reader=self.compiled_fixture();frozen={'sourceRoot':source,'sourceHashes':hashes}
        with patch.dict(sys.modules,{'PyInstaller.archive.readers':reader}):
            for edit in ({'python':'different-runtime'},{'moduleCount':2},{'modules':[]},{'buildPyzSha256':'0'*64}):
                with self.subTest(edit=edit),self.assertRaises(ValueError):
                    self.promote.verify_compiled_native(self.root/'UNIT-NOT-RUN.exe',{**bundle,**edit},frozen,self.ledger)
            (source/'engine/server.py').write_bytes(b'answer = 43\n')
            with self.assertRaisesRegex(ValueError,'compiled server'):
                self.promote.verify_compiled_native(self.root/'UNIT-NOT-RUN.exe',bundle,frozen,self.ledger)

    def test_released_regeneration_requires_historical_association_not_current_candidate_version(self):
        gate=self.inert_gate();receipt=self.root/'artifacts/INERT-INVALID-RELEASED-GATE.json';self.write(gate,receipt)
        value=deepcopy(self.original);record=next(r for r in value['requirements'] if r['requirement_id']=='LIB-04')
        record.update(implementation_status='released',release_blocker=False,
                      requirement_gate={'requirement_id':'LIB-04','status':'released','version':gate['version'],
                                        'path':receipt.relative_to(self.root).as_posix(),'sha256':self.ledger.digest(receipt),
                                        'release':{'format':'NOT-A-REVIEWED-ASSOCIATION'}})
        self.write(value);before=self.path.read_bytes();self.write({'version':'0.21.0'},self.root/'package.json')
        with patch('subprocess.run',side_effect=AssertionError('No process allowed')):
            with self.assertRaisesRegex(ValueError,'No reviewed released association'):
                self.ledger.build_ledger(self.root)
        self.assertEqual(self.path.read_bytes(),before) # Refusal never rewrites or reopens a gate.

    def promotion_fixture(self):
        directory=self.root/'release/0.20-candidate';directory.mkdir(parents=True)
        name='Polytope Laboratory 0.20.0.exe';source=directory/name;destination=self.root/'release'/name
        source.write_bytes(b'INERT UNIT COPY; NEVER EXECUTED');destination.write_bytes(source.read_bytes())
        old=self.root/'release/Polytope Laboratory 0.19.0.exe';old.write_bytes(b'INERT OLD COPY')
        refs={key:{'sha256':hashlib.sha256(key.encode()).hexdigest()} for key in ('release','native','frontend')}
        promotion={'source':str(source),'destination':str(destination),'bytes':source.stat().st_size,'sha256':self.ledger.digest(source),
                   'releaseProofSha256':refs['release']['sha256'],'nativeProofSha256':refs['native']['sha256'],
                   'frontendProofSha256':refs['frontend']['sha256'],'previousReleasesUnchanged':True,
                   'previousReleaseHashes':{old.name:self.ledger.digest(old)}}
        release={'portable':self.promote.reference(self.root,source,self.ledger)}
        gate={'unpackedRoot':str(directory/'win-unpacked')}
        return source,destination,old,promotion,release,gate,refs

    def test_promotion_requires_exact_copy_and_all_component_proof_hashes(self):
        source,destination,old,promotion,release,gate,refs=self.promotion_fixture()
        self.assertEqual(self.promote.verify_promotion_files(self.root,promotion,release,gate,refs,self.apply,self.ledger),
                         (source,destination))
        for key,value in (('bytes',1),('sha256','0'*64),('releaseProofSha256','0'*64),('nativeProofSha256','0'*64),
                          ('frontendProofSha256','0'*64),('previousReleasesUnchanged',False),('previousReleaseHashes',{})):
            with self.subTest(key=key),self.assertRaises(ValueError):
                self.promote.verify_promotion_files(self.root,{**promotion,key:value},release,gate,refs,self.apply,self.ledger)

    def test_promoted_or_previous_portable_byte_tamper_is_refused(self):
        source,destination,old,promotion,release,gate,refs=self.promotion_fixture()
        original=destination.read_bytes();destination.write_bytes(original[:-1]+b'!')
        with self.assertRaisesRegex(ValueError,'Promoted portable bytes'):
            self.promote.verify_promotion_files(self.root,promotion,release,gate,refs,self.apply,self.ledger)
        destination.write_bytes(original);old.write_bytes(b'CHANGED OLD COPY')
        with self.assertRaisesRegex(ValueError,'Previous promoted release'):
            self.promote.verify_promotion_files(self.root,promotion,release,gate,refs,self.apply,self.ledger)

    def test_portable_source_destination_path_binding_cannot_be_substituted(self):
        source,destination,old,promotion,release,gate,refs=self.promotion_fixture()
        other=self.root/'artifacts/OTHER-COPY.exe';other.write_bytes(source.read_bytes())
        for key,value in (('source',str(other)),('destination',str(other))):
            with self.subTest(key=key),self.assertRaisesRegex(ValueError,'source/destination'):
                self.promote.verify_promotion_files(self.root,{**promotion,key:value},release,gate,refs,self.apply,self.ledger)


if __name__=='__main__':unittest.main(verbosity=2)
