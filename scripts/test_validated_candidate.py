"""Temporary inert archival fixtures; no production ledger or engine execution.

No fixture is accepted as a qualified finite gate. Pure publication tests start
with an explicitly synthetic already-validated record; public verifiers must
reject every incomplete fixture. Frozen tool selection is tested separately.
"""
from copy import deepcopy
import importlib.util
import json
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch
import test_parity_ledger as accounting


class CandidateTests(unittest.TestCase):
    def setUp(self):
        self.fixture=accounting.AccountingTests()
        self.fixture.setUp();self.addCleanup(self.fixture.doCleanups)
        self.root=self.fixture.root;self.app=self.fixture.apply;self.ledger=self.fixture.ledger
        self.archive=self.fixture.promote
        self.binding=self.app.load_script(self.root,'bind-validated-candidate.py','candidate_test')

    def association(self):
        return {'format':'polytope-validated-candidate-association','schemaVersion':1,
                'status':'validated','version':'0.20.0','releaseQualified':False,
                'all42SuitesPassed':False,'all73RequirementsFulfilled':False,
                'references':{},'tools':[],'nativeRevalidation':{'INERT':True}}

    def record(self,rid='LIB-04'):
        gate={'path':'artifacts/INERT-NOT-A-QUALIFIED-GATE.json','sha256':'0'*64,
              'version':'0.20.0','requirement_id':rid,'status':'validated'}
        value=self.app.publish_verified_gate(self.fixture.original,gate,
                                             {'requirementId':rid,'version':'0.20.0'})
        return value,gate

    def frozen_fixture(self,*,marker=False):
        # Real helper bytes with explicitly incomplete gate evidence. The dummy
        # files exercise full membership checking, never supply qualification.
        qualified=self.root/'artifacts/frozen-qualified';tools=self.root/'artifacts/frozen-tools'
        for directory in (qualified,tools):(directory/'source/scripts').mkdir(parents=True)
        source=qualified/'source'
        spec='STELLA4D_FEATURE_COMPLETE_BUILD_SPEC.md'
        (source/spec).write_bytes((self.root/spec).read_bytes())
        for name in ('promote-parity-gate.py','qualify-lib04-gate.py','qualify-meas04-gate.py'):
            (source/'scripts'/name).write_bytes((self.root/'scripts'/name).read_bytes())
        for i in range(817):(source/f'INERT-{i}.txt').write_text('NOT QUALIFIED',encoding='utf-8')
        qhash={p.relative_to(source).as_posix():self.ledger.digest(p) for p in source.rglob('*') if p.is_file()}
        (qualified/'source-hashes.json').write_text(json.dumps({'version':'0.20.0','sourceHashes':qhash}),encoding='utf-8')
        tool_source=tools/'source'
        for name in self.binding.TOOL_PATHS:
            (tool_source/name).write_bytes((self.root/name).read_bytes())
        if marker:
            (tool_source/'scripts/bind-validated-candidate.py').write_text(
                "def verify_candidate_association(*args,**kwargs):\n    raise ValueError('FROZEN VERIFIER SELECTED; INERT REJECTED')\n",encoding='utf-8')
        thash={p.relative_to(tool_source).as_posix():self.ledger.digest(p) for p in tool_source.rglob('*') if p.is_file()}
        (tools/'source-hashes.json').write_text(json.dumps({'version':'0.20.0','sourceHashes':thash}),encoding='utf-8')
        native=self.root/'artifacts/INERT-native.json';front=self.root/'artifacts/INERT-front.json'
        for file in (native,front):file.write_text('{}',encoding='utf-8')
        association=self.association()
        association['references']={name:self.archive.reference(self.root,path,self.ledger) for name,path in
            (('frozenQualified',qualified/'source-hashes.json'),('frozenTools',tools/'source-hashes.json'),('native',native),('frontend',front))}
        association['tools']=[self.archive.reference(tool_source,tool_source/name,self.ledger) for name in sorted(self.binding.TOOL_PATHS)]
        gate={'requirementId':'LIB-04','version':'0.20.0','specification':{'sha256':self.ledger.digest(source/spec)},
              'scripts':[self.archive.reference(source,source/'scripts/qualify-lib04-gate.py',self.ledger)]}
        return association,gate,qualified,tools

    def test_pure_archival_keeps_all73_rows_other72_metadata_status_and_history(self):
        value,gate=self.record();value['release_notes']={'literal':'NOT A RELEASE','retain':[1,2]}
        for row in value['requirements']:row['user_metadata']={'literal':row['requirement_id'],'rgba':[1,2,3,4]}
        before=deepcopy(value);association=self.association()
        result=self.binding.publish_candidate(value,gate,association)
        self.assertEqual(value,before)
        self.assertEqual(len(result['requirements']),73)
        for left,right in zip(before['requirements'],result['requirements']):
            if left['requirement_id']!='LIB-04':self.assertEqual(left,right)
        record=next(r for r in result['requirements'] if r['requirement_id']=='LIB-04')
        self.assertEqual(record['implementation_status'],'validated');self.assertFalse(record['release_blocker'])
        self.assertEqual(record['requirement_gate']['status'],'validated')
        self.assertEqual(record['gate_publications'][:-1],next(r for r in before['requirements'] if r['requirement_id']=='LIB-04')['gate_publications'])
        self.assertEqual(record['gate_publications'][-1]['previousRecord']['requirement_gate'],gate)
        self.assertEqual(result['release_notes'],before['release_notes'])
        association['version']='CHANGED';self.assertEqual(record['requirement_gate']['candidate']['version'],'0.20.0')

    def test_both_finite_domains_can_be_associated_without_release_or_other_gate_closure(self):
        value,lib=self.record();meas={**lib,'requirement_id':'MEAS-04','path':'artifacts/INERT-MEAS.json'}
        value=self.app.publish_verified_gate(value,meas,{'requirementId':'MEAS-04','version':'0.20.0'})
        for gate in (lib,meas):value=self.binding.publish_candidate(value,gate,self.association())
        self.assertEqual(sum(r['release_blocker'] is False for r in value['requirements']),2)
        self.assertFalse(any(r['implementation_status']=='released' for r in value['requirements']))

    def test_candidate_cannot_close_an_open_requirement_or_replace_a_different_gate(self):
        value,gate=self.record()
        with self.assertRaisesRegex(ValueError,'already validated'):self.binding.publish_candidate(self.fixture.original,gate,self.association())
        for edit in ({'sha256':'1'*64},{'path':'artifacts/OTHER.json'},{'version':'0.21.0'},{'requirement_id':'VIEW-01'}):
            with self.subTest(edit=edit),self.assertRaises(ValueError):self.binding.publish_candidate(value,{**gate,**edit},self.association())

    def test_candidate_idempotence_and_no_silent_replacement_or_reapply_drop(self):
        value,gate=self.record();association=self.association()
        result=self.binding.publish_candidate(value,gate,association)
        self.assertEqual(self.binding.publish_candidate(result,gate,association),result)
        other=deepcopy(association);other['nativeRevalidation']['INERT']='different'
        with self.assertRaisesRegex(ValueError,'silently replaced'):self.binding.publish_candidate(result,gate,other)
        self.assertEqual(self.app.publish_verified_gate(result,gate,{'requirementId':'LIB-04','version':'0.20.0'}),result)
        with self.assertRaisesRegex(ValueError,'archived/released'):self.app.publish_verified_gate(result,{**gate,'sha256':'2'*64},{'requirementId':'LIB-04','version':'0.20.0'})

    def test_release_all42_or_all73_claims_and_unknown_domains_are_refused(self):
        value,gate=self.record()
        for key,bad in (('releaseQualified',True),('all42SuitesPassed',True),('all73RequirementsFulfilled',True),('status','released'),('schemaVersion',2),('schemaVersion',True),('inventedReleaseClaim',True)):
            with self.subTest(key=key),self.assertRaises(ValueError):self.binding.publish_candidate(value,gate,{**self.association(),key:bad})
        with self.assertRaises(ValueError):self.binding.publish_candidate(value,{**gate,'requirement_id':'ANIM-03'},self.association())

    def test_incomplete_public_associations_reject_without_native_or_ledger_writes(self):
        before=self.fixture.path.read_bytes()
        with patch.object(subprocess,'Popen',side_effect=AssertionError('NO PROCESS')):
            for gate in (self.fixture.inert_gate(),self.fixture.inert_meas_gate()):
                with self.subTest(rid=gate['requirementId']),self.assertRaises(ValueError):
                    self.app.verify_candidate_association(gate,self.association(),self.root)
        self.assertEqual(self.fixture.path.read_bytes(),before)

    def test_public_dispatch_loads_hashed_frozen_tools_not_current_binder(self):
        association,gate,_,_=self.frozen_fixture(marker=True)
        (self.root/'scripts/bind-validated-candidate.py').write_text("raise AssertionError('CURRENT TOOL MUST NOT EXECUTE')",encoding='utf-8')
        with patch.object(subprocess,'Popen',side_effect=AssertionError('NO PROCESS')):
            with self.assertRaisesRegex(ValueError,'FROZEN VERIFIER SELECTED'):
                self.app.verify_candidate_association(gate,association,self.root)

    def test_changed_frozen_tool_bytes_or_membership_refuse_before_loading(self):
        association,gate,_,tools=self.frozen_fixture(marker=True)
        file=tools/'source/scripts/bind-validated-candidate.py';original=file.read_bytes();file.write_bytes(original+b'\n')
        with self.assertRaisesRegex(ValueError,'Frozen source bytes differ'):self.app.verify_candidate_association(gate,association,self.root)
        file.write_bytes(original);(tools/'source/UNRECORDED.txt').write_text('extra',encoding='utf-8')
        with self.assertRaisesRegex(ValueError,'membership differs'):self.app.verify_candidate_association(gate,association,self.root)

    def test_actual_frozen_binder_bootstraps_peer_helpers_after_current21_changes(self):
        association,gate,_,tools=self.frozen_fixture()
        frozen=self.app.load_script(tools/'source','bind-validated-candidate.py','frozen_actual_test')
        for name in ('apply-parity-gate.py','parity-ledger.py','promote-parity-gate.py'):
            (self.root/'scripts'/name).write_text("raise AssertionError('CURRENT 21 HELPER MUST NOT EXECUTE')",encoding='utf-8')
        with patch.object(subprocess,'Popen',side_effect=AssertionError('NO PROCESS')):
            with self.assertRaisesRegex(ValueError,'Only a passed unchanged'):
                frozen.verify_candidate_association(gate,association,self.root)

    def test_all821_retained_source_bytes_checked_before_incomplete_gate_rejection(self):
        association,gate,qualified,tools=self.frozen_fixture()
        frozen=self.app.load_script(tools/'source','bind-validated-candidate.py','frozen_source_test')
        file=qualified/'source/INERT-811.txt';file.write_text('CHANGED',encoding='utf-8')
        with self.assertRaisesRegex(ValueError,'Frozen source bytes differ: INERT-811'):
            frozen.verify_candidate_association(gate,association,self.root)

    def test_reference_escape_sha_size_and_tool_inventory_refuse(self):
        association,gate,_,_=self.frozen_fixture(marker=True)
        for kind in ('escape','sha','size','missing','duplicated'):
            bad=deepcopy(association)
            if kind=='escape':bad['references']['frozenTools']['path']='../source-hashes.json'
            elif kind=='sha':bad['references']['frozenTools']['sha256']='0'*64
            elif kind=='size':bad['references']['frozenTools']['bytes']+=1
            elif kind=='missing':bad['tools'].pop()
            else:bad['tools'][1]=deepcopy(bad['tools'][0])
            with self.subTest(kind=kind),self.assertRaises(ValueError):self.app.verify_candidate_association(gate,bad,self.root)


if __name__=='__main__':unittest.main(verbosity=2)
