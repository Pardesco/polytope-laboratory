import test from 'node:test';
import assert from 'node:assert/strict';
import {ProductControls} from '../ui/product-controls.mjs';
import {AntiprismControls} from '../ui/antiprism-controls.mjs';
import {FaceEditingControls} from '../ui/face-editing-controls.mjs';
import {controlFixture,deferred,tick} from './construction-controls-fixture.mjs';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';

const actions=[
  {name:'polygon product',Class:ProductControls,run:c=>c.generate(),callback:'generate',form:'product-left-symbol'},
  {name:'polygon prism',Class:ProductControls,run:c=>c.prism(),callback:'commit',form:'polygon-prism-height'},
  {name:'antiprism',Class:AntiprismControls,run:c=>c.generate('rational-antiprism'),callback:'generate',form:'antiprism-symbol'},
  {name:'antiduoprism',Class:AntiprismControls,run:c=>c.generate('antiduoprism'),callback:'generate',form:'antiduoprism-height'},
  {name:'polyhedron prism',Class:AntiprismControls,run:c=>c.prism(),callback:'commit',form:'polyhedron-prism-height'},
  {name:'face analysis',Class:FaceEditingControls,run:c=>c.apply('face-coincidences'),callback:'analyze',form:'coincidence-tolerance'},
  {name:'remove face pairs',Class:FaceEditingControls,run:c=>c.apply('remove-coincident-pairs'),callback:'commit',form:'face-weld'},
  {name:'blend faces',Class:FaceEditingControls,run:c=>c.apply('blend-faces'),callback:'commit',form:'blend-face-ids'}
];
const mutations={
  unit:f=>{f.owner.getState().view.coordinateUnit='cm';},
  notes:f=>{f.owner.getState().notes='edited source note';},
  rgba:f=>{f.owner.getState().model.metadata.offColors.faces[0].values[3]=.25;},
  geometry:f=>{f.owner.getState().model.vertices[0][0]=.125;},
  provenance:f=>{f.owner.getState().model.metadata.sourceEvidence={receipt:'changed'};},
  metadataUnit:f=>{f.owner.getState().model.metadata.coordinateUnits='in';},
  modelIdentity:f=>{f.owner.getState().model=structuredClone(f.owner.getState().model);},
  state:f=>f.owner.setState(structuredClone(f.owner.getState())),
  cursor:f=>{f.owner.getDocument().cursor=1;},
  stateArray:f=>{f.owner.getDocument().states=[f.owner.getState()];},
  document:f=>f.owner.swapDocument(),
  project:f=>f.owner.swapProject(),
  form:(f,a)=>{const node=f.nodes[a.form];if(a.form==='face-weld')node.checked=!node.checked;else node.value+='1';},
  export:f=>f.owner.setExport(true)
};
function hold(f,a,stage){
  const pending=deferred(),started=deferred();let signal;
  if(stage==='expression')f.controls.context.evaluateMany=async(entries,options)=>{
    signal=options.signal;started.resolve();await pending.promise;return entries.map(text=>text==='sqrt(4)'?2:Number(text));
  };
  else f.controls.context[a.callback]=async(...args)=>{
    const options=args.at(-1);signal=options.signal;started.resolve();await pending.promise;
    options.verifyPublication();f.options.push(options);f.publications.push(['verified publication']);return f.result;
  };
  return {pending,started,signal:()=>signal};
}
for(const a of actions){
  for(const stage of ['expression','native'])test(`${a.name}: held ${stage} refuses changed source attributes and relevant form`,async t=>{
    for(const [name,mutate] of Object.entries(mutations))await t.test(name,async()=>{
      const f=controlFixture(a.Class),h=hold(f,a,stage),result=a.run(f.controls);
      await h.started.promise;mutate(f,a);const changed=structuredClone(f.owner.getState());h.pending.resolve();
      await assert.rejects(result,/changed|export/);await tick();
      assert.equal(f.publications.length,0);assert.equal(f.controls.busy,false);assert.deepEqual(f.owner.getState(),changed);
      if(f.nodes['face-edit-evidence'])assert.equal(f.nodes['face-edit-evidence'].textContent,'original evidence');
    });
  });
  for(const stage of ['expression','native'])test(`${a.name}: camera motion is allowed during held ${stage}`,async()=>{
    const f=controlFixture(a.Class),source=structuredClone(f.owner.getState().model),h=hold(f,a,stage),result=a.run(f.controls);
    await h.started.promise;f.owner.getState().view.camera.zoom=3;f.owner.getState().view.angles[2]=45;
    h.pending.resolve();await result;
    assert.equal(f.publications.length,1);assert.deepEqual(f.owner.getState().model,source);
    assert.equal(f.owner.getState().view.camera.zoom,3);assert.equal(f.owner.getState().view.angles[2],45);
    assert.ok(f.options[0].signal instanceof AbortSignal);assert.deepEqual(f.options[0].sourceSnapshot,source);
    assert.notEqual(f.options[0].sourceSnapshot,f.owner.getState().model);
  });
  for(const stage of ['expression','native'])test(`${a.name}: cancel held ${stage} promptly and allow a fresh request`,async()=>{
    const f=controlFixture(a.Class),h=hold(f,a,stage),result=a.run(f.controls);await h.started.promise;
    const canceled=assert.rejects(result,error=>error.name==='AbortError');f.controls.cancel();await canceled;
    assert.equal(h.signal().aborted,true);assert.equal(f.controls.busy,false);assert.equal(f.publications.length,0);
    h.pending.resolve();await tick();assert.equal(f.publications.length,0);
    f.controls.context.evaluateMany=async entries=>entries.map(text=>text==='sqrt(4)'?2:Number(text));
    f.controls.context[a.callback]=async(...args)=>{args.at(-1).verifyPublication();f.publications.push(['new publication']);return f.result;};
    await a.run(f.controls);assert.equal(f.publications.length,1);
  });
}

test('inactive controls are excluded from the narrow form binding',async()=>{
  for(const [a,ids] of [[actions[0],['polygon-prism-height']],
    [actions[2],['antiprism-elevation-value','antiduoprism-height','polyhedron-prism-height']],
    [actions[5],['face-weld','blend-face-ids','face-color-policy']]]){
    const f=controlFixture(a.Class),h=hold(f,a,'expression'),result=a.run(f.controls);await h.started.promise;
    for(const id of ids){f.nodes[id].value='invalid inactive';f.nodes[id].checked=false;}
    h.pending.resolve();await result;assert.equal(f.publications.length,1);
  }
});
test('active antiprism sizing and blend color selections belong to the pending form',async()=>{
  for(const [a,id,value] of [[actions[2],'antiprism-base-sizing','base-edge'],[actions[2],'antiprism-elevation','height'],
    [actions[3],'antiprism-elevation-value','2'],[actions[7],'face-color-policy','require-equal']]){
    const f=controlFixture(a.Class);if(id==='antiprism-elevation-value')f.nodes['antiprism-elevation'].value='height',f.nodes[id].value='1';
    const h=hold(f,a,'native'),result=a.run(f.controls);await h.started.promise;f.nodes[id].value=value;h.pending.resolve();
    await assert.rejects(result,/target fields changed/);assert.equal(f.publications.length,0);
  }
});
test('analysis independently fences late native results even when a callback omits publication verification',async()=>{
  const a=actions[5],f=controlFixture(a.Class),pending=deferred(),started=deferred();
  f.controls.context.analyze=async()=>{started.resolve();return pending.promise;};
  const result=a.run(f.controls);await started.promise;f.owner.getState().notes='late change';pending.resolve(f.result);
  await assert.rejects(result,/source.*changed/);assert.equal(f.nodes['face-edit-evidence'].textContent,'original evidence');
});

test('mounted native expressions and construction/face operations accept the unchanged controller parameter domains',async()=>{
  const child=spawn('python',['-B','-u','engine/server.py'],{cwd:fileURLToPath(new URL('..',import.meta.url)),
    windowsHide:true,env:{...process.env,PYTHONUTF8:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'}});
  let errors='',closed=false;const queue=[];child.stderr.on('data',value=>errors+=value);
  const lines=createInterface({input:child.stdout});lines.on('line',line=>{
    const waiter=queue.shift();if(!waiter)return;
    try{const reply=JSON.parse(line);if(reply.ok)waiter.resolve(reply.result);else waiter.reject(Error(reply.error));}
    catch(error){waiter.reject(error);}
  });
  child.on('error',error=>{while(queue.length)queue.shift().reject(error);});
  child.on('close',code=>{closed=true;while(queue.length)queue.shift().reject(Error(`Native engine closed (${code}): ${errors}`));});
  const native=request=>new Promise((resolve,reject)=>{if(closed)return reject(Error(errors));queue.push({resolve,reject});child.stdin.write(JSON.stringify(request)+'\n');});
  const counts=model=>[model.vertices.length,model.edges.length,model.faces.length,model.cells.length];
  try{
    const polygon=await native({op:'generate',params:{kind:'regular-star-polygon',symbol:'4',radius:1}}),
      cube=await native({op:'generate',params:{kind:'regular',key:'cube'}});
    for(const model of [polygon,cube])model.metadata.coordinateUnits='mm',model.metadata.offColors={
      faces:model.faces.map(()=>({encoding:'unit',values:[.2,.4,.6,.8]})),cells:[]};
    const published=[];
    const prepare=(Class,source)=>{
      const f=controlFixture(Class);f.owner.setState({...f.owner.getState(),model:structuredClone(source)});
      f.controls.context.evaluateMany=async(expressions,{mode,signal})=>{assert.equal(signal.aborted,false);return (await native({op:'expression-batch',params:{expressions:[...expressions],mode}})).values;};
      f.controls.context.generate=async(...args)=>{
        const options=args.at(-1),params=Class===ProductControls?{kind:'polygon-product',...args[0]}:{kind:args[0],...args[1]};
        const result=await native({op:'generate',params});options.verifyPublication();published.push(result);return result;
      };
      f.controls.context.commit=async(op,params,label,options)=>{
        const result=await native({op,params,model:options.sourceSnapshot});options.verifyPublication();published.push(result);return result;
      };
      f.controls.context.analyze=async(model,params,options)=>{
        const result=await native({op:'face-coincidences',model,params});options.verifyPublication();return result;
      };
      return f;
    };
    const product=prepare(ProductControls,polygon);product.nodes['product-left-symbol'].value='5/2';product.nodes['product-right-symbol'].value='4';
    product.nodes['product-left-radius'].value='min(2, sqrt(4))';product.nodes['product-right-radius'].value='1/2';
    assert.deepEqual(counts(await product.controls.generate()),[20,40,29,9]);
    assert.deepEqual(counts(await product.controls.prism()),[8,12,6,0]);
    const anti=prepare(AntiprismControls,cube);anti.nodes['antiprism-symbol'].value='3';
    assert.deepEqual(counts(await anti.controls.generate('rational-antiprism')),[6,12,8,0]);
    anti.nodes['antiprism-symbol'].value=' 6/-2 ';anti.nodes['antiprism-elevation'].value='height';anti.nodes['antiprism-elevation-value'].value='sqrt(4)/2';
    assert.deepEqual(counts(await anti.controls.generate('antiduoprism')),[24,60,56,20]);
    assert.deepEqual(counts(await anti.controls.prism()),[16,32,24,8]);
    const face=prepare(FaceEditingControls,cube);face.nodes['coincidence-tolerance'].value='sqrt(4)-2';
    assert.deepEqual((await face.controls.apply('face-coincidences')).pairs,[]);
    await face.controls.apply('remove-coincident-pairs');assert.deepEqual(counts(published.at(-1)),[8,12,6,0]);
    face.nodes['blend-face-ids'].value='0; 1';
    await assert.rejects(face.controls.apply('blend-faces'),/coplanar|planar/);
    assert.equal(published.length,6);assert.deepEqual(face.owner.getState().model,cube);
  }finally{lines.close();child.stdin.end();await new Promise(resolve=>closed?resolve():child.once('close',resolve));}
});
