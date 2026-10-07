import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {StarPolygonControls} from '../ui/star-polygon-controls.mjs';
import {PodiaControls} from '../ui/podia-controls.mjs';
import {CrossedSegmentotopeControls} from '../ui/crossed-segmentotope-controls.mjs';
import {numericControlFixture,deferred,flush} from './numeric-control-fixture.mjs';
const observed=p=>p.then(value=>({value}),error=>({error}));
function fixture(){const f=numericControlFixture(StarPolygonControls.prototype,{'star-polygon-symbol':' 6/-2 ','star-polygon-radius':'sqrt(4)','generate-star-polygon':''});f.context.generate=async(params,options)=>{options.verifyPublication();f.calls.push(params);f.options.push(options);return f.result;};return f;}

test('radius is native evaluated separately from the literal signed/unreduced symbol',async()=>{
  const f=fixture(),source=structuredClone(f.state);assert.equal(await f.control.generate(),f.result);assert.deepEqual(f.calls,[{symbol:'6/-2',radius:2}]);assert.deepEqual(f.expressionCalls[0].parts,['sqrt(4)']);assert.equal(f.expressionCalls.length,1);assert.deepEqual(f.options[0].sourceSnapshot,source.model);assert.deepEqual(f.state,source);
});

test('literal symbol grammar and required radius reject before evaluation while native retains mathematical authority',async()=>{
  for(const [id,value] of [['star-polygon-symbol',''],['star-polygon-symbol','sqrt(25)'],['star-polygon-symbol','5/(1+1)'],['star-polygon-symbol','5/2+1'],['star-polygon-symbol','1'.repeat(33)],['star-polygon-radius',' ']]){const f=fixture();f.nodes[id].value=value;await assert.rejects(f.control.generate());assert.deepEqual(f.calls,[]);assert.deepEqual(f.expressionCalls,[]);}
  // Digon and polygon-size limits remain native decisions, not an invented UI domain.
  const f=fixture();f.nodes['star-polygon-symbol'].value='6/3';f.context.generate=async()=>{throw Error('Native polygon step produces a digon');};await assert.rejects(f.control.generate(),/digon/);assert.equal(f.control.busy,false);
});

test('radius rejects nonpositive, nonfinite, oversized and forged native values with unchanged source',async()=>{
  for(const value of [0,-1,NaN,Infinity,1e101,true]){const f=fixture(),source=structuredClone(f.state);f.context.evaluateMany=async()=>[value];await assert.rejects(f.control.generate(),/domain|finite|bounded/);assert.deepEqual(f.calls,[]);assert.deepEqual(f.state,source);assert.equal(f.control.busy,false);}
});

test('full source/project/document/unit/RGBA and exact form changes fence held radius expressions',async()=>{
  for(const mutate of [f=>f.setProject({...f.project}),f=>f.document.id='other',f=>f.document.states=[f.state],f=>f.state.notes='changed',f=>f.state.model.vertices[0][0]=4,f=>f.state.model.metadata.offColors.faces[0].values[3]=.1,f=>f.state.view.coordinateUnit='cm',f=>f.nodes['star-polygon-symbol'].value='5/2',f=>f.nodes['star-polygon-radius'].value='999',f=>f.setExport(true)]){
    const f=fixture(),gate=deferred();f.context.evaluateMany=()=>gate.promise;const pending=observed(f.control.generate());await flush();mutate(f);gate.resolve([2]);assert.ok((await pending).error);assert.deepEqual(f.calls,[]);assert.equal(f.control.busy,false);
  }
});

test('busy and export block programmatic generation and visible fields restore after completion',async()=>{
  const f=fixture();f.setExport(true);f.control.sync();await assert.rejects(f.control.generate(),/export/);assert.deepEqual(f.expressionCalls,[]);assert.ok(Object.values(f.nodes).every(n=>n.disabled));f.setExport(false);const gate=deferred();f.context.evaluateMany=()=>gate.promise;const pending=f.control.generate();await flush();assert.ok(Object.values(f.nodes).every(n=>n.disabled));await assert.rejects(f.control.generate(),/current polygon/);gate.resolve([2]);await pending;assert.ok(Object.values(f.nodes).every(n=>!n.disabled));
});

test('native generation rechecks source and fields after await but permits observer motion',async()=>{
  for(const mutate of [f=>f.state.notes='changed',f=>f.nodes['star-polygon-radius'].value='3',f=>f.setExport(true)]){
    const f=fixture(),gate=deferred();let options;f.context.generate=async(params,o)=>{options=o;await gate.promise;o.verifyPublication();f.calls.push(params);};const pending=observed(f.control.generate());while(!options)await flush();mutate(f);gate.resolve();assert.ok((await pending).error);assert.deepEqual(f.calls,[]);
  }
  const f=fixture(),gate=deferred();let options;f.context.generate=async(params,o)=>{options=o;await gate.promise;o.verifyPublication();f.calls.push(params);};const pending=f.control.generate();while(!options)await flush();f.state.view.camera={latest:true};f.state.view.angles[0]=21;f.project.memories={unrelated:true};gate.resolve();await pending;assert.equal(f.calls.length,1);assert.equal(f.state.view.angles[0],21);
});

test('cancel consumes ignored expression/native results and allows a later explicit generation',async()=>{
  for(const where of ['evaluateMany','generate']){
    const f=fixture(),gate=deferred(),original=f.context[where];let options;f.context[where]=where==='evaluateMany'?()=>gate.promise:async(params,o)=>{options=o;await gate.promise;o.verifyPublication();f.calls.push(params);};const pending=observed(f.control.generate());await flush();f.control.cancel();assert.match((await pending).error.message,/cancel/i);if(options)assert.equal(options.signal.aborted,true);assert.equal(f.control.busy,false);gate.resolve([2]);await flush();assert.deepEqual(f.calls,[]);f.context[where]=original;await f.control.generate();assert.equal(f.calls.length,1);
  }
});

test('legacy number provider still uses full owner checks between individual podium expressions',async()=>{
  const f=numericControlFixture(PodiaControls.prototype,{'podium-kind':'rational-podium','podium-symbol':'3','podium-sizing':'radius','podium-elevation':'height','podium-base-size':'1','podium-top-size':'1','podium-elevation-size':'1','podium-base-label':'','podium-top-label':'','podium-elevation-label':'','generate-podium':''});
  delete f.context.evaluateMany;let calls=0;f.context.number=async()=>{if(++calls===3)f.state.notes='late third expression';return 1;};await assert.rejects(f.control.generate(),/changed/);assert.equal(calls,3);assert.deepEqual(f.calls,[]);
});

test('actual native batch-driven star, podium and crossed generation keep analytic incidence and original source',async()=>{
  const native=request=>JSON.parse(execFileSync('python',['-c',"import json,sys;from engine.server import dispatch;print(json.dumps(dispatch(json.loads(sys.argv[1]))))",JSON.stringify(request)],{cwd:process.cwd(),windowsHide:true,encoding:'utf8'}));
  const f=fixture(),source=structuredClone(f.state);f.nodes['star-polygon-symbol'].value='5/2';f.context.evaluateMany=async(expressions,{mode})=>native({op:'expression-batch',params:{expressions,mode}}).values;f.context.generate=async(params,o)=>{const model=native({op:'generate',params:{kind:'regular-star-polygon',...params}});o.verifyPublication();return model;};const star=await f.control.generate();assert.deepEqual(star.faces,[[0,2,4,1,3]]);assert.equal(star.vertices.length,5);star.vertices.forEach((p,j)=>{assert.ok(Math.abs(p[0]-2*Math.cos(j*2*Math.PI/5))<1e-12);assert.ok(Math.abs(p[1]-2*Math.sin(j*2*Math.PI/5))<1e-12);});assert.deepEqual(f.state,source);
  const p=numericControlFixture(PodiaControls.prototype,{'podium-kind':'rational-podium','podium-symbol':'3/1','podium-sizing':'radius','podium-elevation':'height','podium-base-size':'sqrt(4)','podium-top-size':'1/2','podium-elevation-size':'sqrt(9)','podium-base-label':'','podium-top-label':'','podium-elevation-label':'','generate-podium':''});
  const c=numericControlFixture(CrossedSegmentotopeControls.prototype,{'crossed-layer-symbol':'4/3','crossed-layer-sizing':'radius','crossed-layer-size':'sqrt(4)','crossed-layer-elevation':'height','crossed-layer-elevation-size':'sqrt(9)','crossed-layer-depth':'1/2','crossed-layer-orientation':'identity','crossed-layer-matrix':'','crossed-layer-size-name':'','crossed-layer-elevation-name':'','generate-crossed-segmentotope':'',...Object.fromEntries(Array.from({length:9},(_,i)=>['crossed-layer-matrix-'+i,i%4===0?'1':'0']))});
  for(const [h,counts] of [[p,[6,9,5,0]],[c,[16,40,36,12]]]){
    const before=structuredClone(h.state);h.context.evaluateMany=f.context.evaluateMany;h.context.generate=async(kind,params,o)=>{const model=native({op:'generate',params:{kind,...params}});o.verifyPublication();return model;};const model=await h.control.generate();assert.deepEqual(['vertices','edges','faces','cells'].map(key=>model[key].length),counts);assert.deepEqual(h.state,before);
  }
});

test('constructor mounts stable anchors and guarded buttons for all three controls',()=>{
  const saved=Object.getOwnPropertyDescriptor(globalThis,'document');
  try{
    for(const [Type,anchor,expectedId] of [[StarPolygonControls,'cupola-settings','star-polygon-settings'],[PodiaControls,'torus-settings','podia-settings'],[CrossedSegmentotopeControls,'layer-join-settings','crossed-segmentotope-settings']]){
      let mounted,guarded=0;const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{value:id.includes('sizing')?'radius':id.includes('elevation')&&!id.endsWith('size')?'height':id.includes('orientation')?'identity':'',disabled:false});return nodes.get(id);};
      const panel={innerHTML:'',querySelector:selector=>node(selector==='button'?'button':selector.slice(1)),querySelectorAll:()=>[...nodes.values()]};globalThis.document={createElement:()=>panel,getElementById:id=>id===anchor?{after:value=>mounted=value}:null};
      new Type({guard:fn=>{guarded++;return fn;},isExporting:()=>false});assert.equal(mounted,panel);assert.equal(panel.id,expectedId);assert.equal(guarded,1);assert.match(panel.innerHTML,/maxlength="32"/);
    }
  }finally{if(saved)Object.defineProperty(globalThis,'document',saved);else delete globalThis.document;}
});
