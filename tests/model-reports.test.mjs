import test from 'node:test';
import assert from 'node:assert/strict';
import {ModelReports} from '../ui/model-reports.mjs';
function fixture(){
  let state={model:{id:'source',fingerprint:'unchanged',vertices:[[0,0,0]],metadata:{color:'red'}},notes:'original',view:{coordinateUnit:'mm',angles:[0]}},document={id:'document'},project={documents:[document]};
  const reports=new ModelReports({getProject:()=>project,getDocument:()=>document,getState:()=>state});
  return {reports,state,replaceProject:()=>project={documents:[document]},replaceDocument:()=>document={id:'document'},replaceState:()=>state={...state}};
}
test('manual validation supersedes the validation half of an automatic analysis without discarding its other fields',()=>{
  const f=fixture(),automatic=f.reports.begin(['analysis','validation']),manual=f.reports.begin(['validation']);
  assert.equal(f.reports.current(automatic,'analysis'),true);assert.equal(f.reports.current(automatic,'validation'),false);assert.equal(f.reports.current(manual,'validation'),true);
  const newer=f.reports.begin(['validation']);assert.equal(f.reports.current(manual,'validation'),false);assert.equal(f.reports.current(newer,'validation'),true);
});
test('view, notes and unit-display edits preserve an intrinsic report',()=>{
  const f=fixture(),ticket=f.reports.begin(['analysis']);f.state.view.angles[0]=45;f.state.view.coordinateUnit='cm';f.state.notes='edited';
  assert.equal(f.reports.current(ticket,'analysis'),true);
});
test('project, document, state and in-place model changes refuse late reports even with unchanged IDs and fingerprints',()=>{
  for(const edit of [f=>f.replaceProject(),f=>f.replaceDocument(),f=>f.replaceState(),f=>f.state.model={...f.state.model},f=>f.state.model.vertices[0][0]=4,f=>f.state.model.metadata.color='blue']){
    const f=fixture(),ticket=f.reports.begin(['analysis','validation']);edit(f);assert.equal(f.reports.current(ticket,'analysis'),false);assert.equal(f.reports.current(ticket,'validation'),false);assert.equal(f.reports.owns(ticket,'analysis'),true);
  }
});
test('workspace navigation invalidation refuses old replies even after returning to the original source',()=>{
  const f=fixture(),ticket=f.reports.begin(['analysis','validation']);f.reports.invalidate();assert.equal(f.reports.current(ticket,'analysis'),false);assert.equal(f.reports.owns(ticket,'validation'),false);
  const fresh=f.reports.begin(['analysis','validation']);assert.equal(f.reports.current(fresh,'analysis'),true);assert.equal(f.reports.current(ticket,'validation'),false);
});
test('an empty workspace refuses a report before registering output ownership',()=>{
  const reports=new ModelReports({getProject:()=>({}),getDocument:()=>undefined,getState:()=>undefined});assert.throws(()=>reports.begin(['validation']),/Choose a model/);assert.equal(reports.channels.size,0);
});
test('query targets and channel cancellation stay independent of other reports',()=>{
  const f=fixture();let target=['distance','0, 1'];const ticket=f.reports.begin(['measurement'],{getTarget:()=>target}),identity=f.reports.begin(['identity']);
  target=['distance','0, 3'];assert.equal(f.reports.current(ticket,'measurement'),false);assert.equal(f.reports.current(identity,'identity'),true);
  f.reports.invalidate('measurement');assert.equal(f.reports.owns(ticket,'measurement'),false);assert.equal(f.reports.current(identity,'identity'),true);
});
