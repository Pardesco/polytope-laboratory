import {captureNativeSource,verifyNativeSource} from './native-source-binding.mjs';

export const SPRING_OPERATION='spring-relaxation',SPRING_PREVIEW_OPERATION='spring-relaxation-preview',SPRING_VERSION='0.1.0';
export const SPRING_CONTROL_LIMITS=Object.freeze({vertices:256,edges:2048,faces:512,faceVertices:64,
  incidences:16384,sourceBytes:16*1024*1024,constraintBytes:1024*1024,resultBytes:32*1024*1024,
  historyBytes:64*1024*1024,expressionCharacters:256});
const advancedKeys=new Set(['edge_lengths','edge_weights','face_steps','face_weights','extra_springs','pins']);
const statuses=new Set(['constraints-satisfied','stationary-residual','evaluation-limit','resource-limited','invalid-realization']);
const fieldIds=['spring-initialization','spring-seed','spring-edge-length','spring-random-scale','spring-evaluations',
  'spring-residual-tolerance','spring-solver-tolerance','spring-regular-faces','spring-constraints'];
const encoder=new TextEncoder(),fail=message=>{throw Error(message);};
const canceled=()=>Object.assign(Error('Spring relaxation canceled.'),{name:'AbortError'});
function data(value,key,fallback){const d=value&&typeof value==='object'?Object.getOwnPropertyDescriptor(value,key):null;return d&&'value' in d?d.value:fallback;}
function finite(value,lo,hi,label){if(typeof value!=='number'||!Number.isFinite(value)||value<lo||value>hi)fail(label+' is outside its finite numeric bounds.');return value;}
function integer(value,lo,hi,label){finite(value,lo,hi,label);if(!Number.isSafeInteger(value))fail(label+' must evaluate to an integer.');return value;}
function canonical(value,limit){
  let nodes=0,strings=0;const ancestors=new Set();
  function visit(item,depth){
    if(++nodes>2_000_000||depth>64)fail('Spring JSON exceeds structural bounds.');
    if(item===null||typeof item==='boolean')return item;
    if(typeof item==='number'){if(!Number.isFinite(item))fail('Spring JSON requires finite numbers.');return item;}
    if(typeof item==='string'){strings+=encoder.encode(item).length;if(strings>limit)fail('Spring JSON exceeds its byte bound.');return item;}
    if(!item||typeof item!=='object'||ancestors.has(item))fail('Spring JSON must be plain and acyclic.');
    const proto=Object.getPrototypeOf(item);if(!Array.isArray(item)&&proto!==Object.prototype&&proto!==null)fail('Spring JSON must contain plain records.');
    if(Object.getOwnPropertySymbols(item).length)fail('Spring JSON cannot contain symbol keys.');
    const descriptors=Object.getOwnPropertyDescriptors(item);ancestors.add(item);let result;
    if(Array.isArray(item)){
      const length=descriptors.length?.value;
      if(!Number.isSafeInteger(length)||length<0||length>2_000_000||Object.keys(descriptors).length!==length+1)fail('Spring JSON needs dense plain arrays.');
      result=[];for(let i=0;i<length;i++){const d=descriptors[i];if(!d||!('value'in d))fail('Spring JSON cannot read accessors.');result.push(visit(d.value,depth+1));}
    }else{
      result=Object.create(null);for(const key of Object.keys(descriptors).sort()){
        const d=descriptors[key];if(!('value'in d))fail('Spring JSON cannot read accessors.');
        strings+=encoder.encode(key).length;if(strings>limit)fail('Spring JSON exceeds its byte bound.');result[key]=visit(d.value,depth+1);
      }
    }ancestors.delete(item);return result;
  }
  const string=JSON.stringify(visit(value,0));if(encoder.encode(string).length>limit)fail('Spring JSON exceeds its byte bound.');return string;
}
function waitFor(value,signal){
  if(signal.aborted)return Promise.reject(canceled());
  return new Promise((resolve,reject)=>{
    const finish=(fn,value)=>{signal.removeEventListener('abort',abort);fn(value);};
    const abort=()=>finish(reject,canceled());signal.addEventListener('abort',abort,{once:true});
    Promise.resolve(value).then(v=>finish(resolve,v),e=>finish(reject,e));
  });
}
export function eligibleSpringSource(model){
  if(data(model,'dimension')!==3||data(model,'embeddingDimension',3)!==3)return false;
  const vertices=data(model,'vertices'),edges=data(model,'edges'),faces=data(model,'faces'),cells=data(model,'cells',[]);
  if(!Array.isArray(vertices)||vertices.length<4||vertices.length>256||!Array.isArray(edges)||!edges.length||edges.length>2048||
    !Array.isArray(faces)||!faces.length||faces.length>512||!Array.isArray(cells)||cells.length)return false;
  if(vertices.some(p=>!Array.isArray(p)||p.length!==3||p.some(x=>typeof x!=='number'||!Number.isFinite(x)||Math.abs(x)>1e100)))return false;
  const ids=v=>Number.isInteger(v)&&v>=0&&v<vertices.length,key=(a,b)=>a<b?`${a}:${b}`:`${b}:${a}`;
  const table=new Map(),neighbors=vertices.map(()=>new Set()),links=vertices.map(()=>[]);let visits=edges.length*2;
  for(const e of edges){if(!Array.isArray(e)||e.length!==2||!e.every(ids)||e[0]===e[1]||table.has(key(...e)))return false;
    table.set(key(...e),0);neighbors[e[0]].add(e[1]);neighbors[e[1]].add(e[0]);}
  for(const f of faces){if(!Array.isArray(f)||f.length<3||f.length>64||!f.every(ids)||new Set(f).size!==f.length)return false;
    visits+=f.length;if(visits>16384)return false;
    for(let i=0;i<f.length;i++){const a=f[i],b=f[(i+1)%f.length],k=key(a,b);if(!table.has(k))return false;
      table.set(k,table.get(k)+1);links[a].push([f[(i+f.length-1)%f.length],b]);}}
  if([...table.values()].some(n=>n!==2))return false;
  for(let v=0;v<vertices.length;v++){
    if(!neighbors[v].size)return false;const graph=new Map(),pairs=new Set();
    for(const [a,b] of links[v]){const k=key(a,b);if(pairs.has(k))return false;pairs.add(k);
      for(const [x,y] of [[a,b],[b,a]]){if(!graph.has(x))graph.set(x,new Set());graph.get(x).add(y);}}
    if(graph.size!==neighbors[v].size||[...graph].some(([i,n])=>!neighbors[v].has(i)||n.size!==2))return false;
    const todo=[graph.keys().next().value],reached=new Set(todo);while(todo.length)for(const other of graph.get(todo.pop()))if(!reached.has(other)){reached.add(other);todo.push(other);}
    if(reached.size!==graph.size)return false;
  }return true;
}
function checkedPacket(packet,source){
  const detached=JSON.parse(canonical(packet,SPRING_CONTROL_LIMITS.resultBytes));
  if(detached.operation!==SPRING_PREVIEW_OPERATION||detached.algorithmVersion!==SPRING_VERSION||detached.recipeRecorded!==false||detached.runtimePartialPublished!==false)
    fail('Spring preview has an unsupported or recordable response.');
  const result=detached.result,e=result?.evidence,a=detached.adoption,m=result?.model;
  if(!result||!statuses.has(result.status)||result.certified!==false||result.uniform!==false||!e||!a||
    e.algorithmVersion!==SPRING_VERSION||typeof e.requestedConstraintsSatisfied!=='boolean'||a.constraintsSatisfied!==e.requestedConstraintsSatisfied||
    a.uniformityEstablished!==false||a.optimizerExecutionCertified!==false||e.sourceModelId!==source.id||
    canonical(e.sourceModel,SPRING_CONTROL_LIMITS.sourceBytes)!==canonical(source,SPRING_CONTROL_LIMITS.sourceBytes))fail('Spring preview source or numerical evidence is inconsistent.');
  const valid=m!==null;
  if(a.publishable!==valid||a.requiresExplicitNearMiss!==(valid&&!e.requestedConstraintsSatisfied)||e.geometricValidity?.passed!==valid)
    fail('Spring preview adoption/validity flags disagree.');
  if(valid){
    if(!eligibleSpringSource(m)||m.interpretation!=='generalized-complex'||m.numeric?.certified!==false||m.vertices.length!==source.vertices.length||
      typeof m.id!=='string'||!m.id||m.id.length>128||typeof m.fingerprint!=='string'||!/^[0-9a-f]{64}$/.test(m.fingerprint)||
      canonical(m.edges,SPRING_CONTROL_LIMITS.sourceBytes)!==canonical(source.edges,SPRING_CONTROL_LIMITS.sourceBytes)||
      canonical(m.faces,SPRING_CONTROL_LIMITS.sourceBytes)!==canonical(source.faces,SPRING_CONTROL_LIMITS.sourceBytes)||
      m.fingerprint!==e.resultFingerprint||m.id!==e.resultModelId||e.nativeValidation?.passed!==true||
      canonical(m.metadata?.springRelaxation,SPRING_CONTROL_LIMITS.resultBytes)!==canonical(e,SPRING_CONTROL_LIMITS.resultBytes))
      fail('Spring preview changed source incidence or lacks validated numerical ownership.');
    for(const field of ['offColors','coordinateUnits']){
      const original=source.metadata??{},derived=m.metadata??{};
      if(Object.hasOwn(original,field)!==Object.hasOwn(derived,field)||
        Object.hasOwn(original,field)&&canonical(original[field],SPRING_CONTROL_LIMITS.sourceBytes)!==canonical(derived[field],SPRING_CONTROL_LIMITS.sourceBytes))
        fail('Spring preview lost source RGBA/nulls or coordinate units.');
    }
  }else if(result.status!=='invalid-realization'||result.preview?.publishable!==false)fail('Invalid spring preview cannot be adopted.');
  const r=e.residuals;for(const field of ['maximumAbsoluteNormalizedResidual','rmsNormalizedResidual','weightedSpringEnergy'])finite(r?.[field],0,1e100,'Spring residual');
  return detached;
}

export class SpringControls{
  constructor(context,{anchor='convex-core-settings'}={}){
    this.context=context;this.active=null;this.busy=false;this.generation=0;this.destroyed=false;this.previewData=null;
    const panel=document.createElement('details');panel.id='spring-settings';
    panel.innerHTML=`<summary>Spring relaxation · 3D</summary>
      <label>Start <select id="spring-initialization"><option value="source">Original vertices</option><option value="random">Seeded random vertices</option></select></label>
      <label>Seed <input id="spring-seed" value="0" title="An integer from 0 to 4294967295; numeric expressions are supported."></label>
      <label>Target edge (source units) <input id="spring-edge-length" value="1"></label>
      <label>Evaluation limit <input id="spring-evaluations" value="500"></label>
      <label>Residual tolerance <input id="spring-residual-tolerance" value="1e-8"></label>
      <label><input type="checkbox" id="spring-regular-faces">Regular-face distances</label>
      <details><summary>Constraints</summary>
        <label>Random spread (edge units) <input id="spring-random-scale" value="1"></label>
        <label>Solver tolerance <input id="spring-solver-tolerance" value="1e-11"></label>
        <label>Constraint arrays (JSON) <textarea id="spring-constraints" rows="3" spellcheck="false" title="Literal source IDs and source-unit lengths/positions. Allowed: edge_lengths, edge_weights, face_steps, face_weights, extra_springs, pins. Star faces require explicit signed face_steps when regular-face distances are enabled.">{}</textarea></label>
      </details>
      <button id="preview-spring">Solve preview</button><button id="cancel-spring" hidden>Cancel</button>
      <output id="spring-result" style="white-space:pre-line" aria-live="polite"></output>
      <label><input type="checkbox" id="spring-accept-near-miss">Accept a valid realization with unresolved targets</label>
      <button id="adopt-spring" disabled>Adopt preview</button>`;
    if(context.mount)context.mount(panel);else{const target=document.getElementById(anchor);if(!target)fail('Spring controls need an explicit mount or construction anchor.');target.after(panel);}
    this.panel=panel;const guarded=fn=>context.guard?context.guard(fn):fn;
    this.node('preview-spring').onclick=guarded(()=>this.preview());this.node('adopt-spring').onclick=guarded(()=>this.adopt());
    this.node('cancel-spring').onclick=()=>this.cancel();
    for(const id of [...fieldIds,'spring-accept-near-miss'])this.node(id).onchange=()=>this.sync();this.sync();
  }
  node(id){return this.panel.querySelector('#'+id);}
  fields(){return fieldIds.map(id=>{const node=this.node(id);return [id,id==='spring-regular-faces'?Boolean(node.checked):String(node.value).trim()];});}
  history(){return canonical(this.context.getDocument()?.operationHistory??null,SPRING_CONTROL_LIMITS.historyBytes);}
  verify(job){
    if(this.destroyed||this.active!==job||job.generation!==this.generation||job.controller.signal.aborted)throw canceled();
    verifyNativeSource(this.context,job.owner);
    if(this.history()!==job.history||JSON.stringify(this.fields())!==job.fields)fail('Spring source history or controls changed. Repeat the preview.');
    if(job.params&&canonical(job.params,SPRING_CONTROL_LIMITS.constraintBytes)!==job.paramsSignature)fail('Spring requested parameters changed before publication.');
    if(job.kind==='adopt'&&Boolean(this.node('spring-accept-near-miss').checked)!==job.acceptUnresolved)fail('Spring adoption choice changed before publication.');
  }
  start(kind,owner){
    if(this.destroyed)throw canceled();if(this.busy)fail('Finish or cancel the current spring solve first.');
    owner=owner??captureNativeSource(this.context);const source=JSON.parse(owner.modelSignature);
    if(encoder.encode(owner.modelSignature).length>SPRING_CONTROL_LIMITS.sourceBytes||!eligibleSpringSource(source))fail('Spring relaxation requires a closed XYZ 3D source within the 256-vertex bound.');
    const job={kind,owner,source,history:this.history(),fields:JSON.stringify(this.fields()),controller:new AbortController(),generation:++this.generation};
    this.active=job;this.busy=true;this.sync();return job;
  }
  async parameters(job){
    const fields=Object.fromEntries(JSON.parse(job.fields)),initialization=fields['spring-initialization'];
    if(!['source','random'].includes(initialization))fail('Choose original or seeded random vertices.');
    const text=fields['spring-constraints'];if(encoder.encode(text).length>SPRING_CONTROL_LIMITS.constraintBytes)fail('Constraint JSON exceeds 1 MiB.');
    let advanced;try{advanced=JSON.parse(text);}catch{fail('Enter a valid constraint-array JSON object.');}
    if(!advanced||Array.isArray(advanced)||typeof advanced!=='object'||Object.keys(advanced).some(k=>!advancedKeys.has(k))||Object.values(advanced).some(v=>!Array.isArray(v)))fail('Only explicit constraint arrays are allowed in advanced JSON.');
    canonical(advanced,SPRING_CONTROL_LIMITS.constraintBytes);
    const keys=['edge-length','random-scale','residual-tolerance','solver-tolerance','seed','evaluations'],expressions=keys.map(k=>fields['spring-'+k]);
    if(expressions.some(s=>!s||s.length>SPRING_CONTROL_LIMITS.expressionCharacters))fail('Enter bounded spring numeric expressions.');
    let values;
    if(typeof this.context.evaluateMany==='function'){
      this.verify(job);values=await waitFor(this.context.evaluateMany(expressions,{mode:'real',signal:job.controller.signal}),job.controller.signal);this.verify(job);
      if(!Array.isArray(values)||values.length!==expressions.length)fail('Native spring numeric batch has the wrong result count.');
      values=JSON.parse(canonical(values,4096));
    }else values=await Promise.all(expressions.map(async expression=>{this.verify(job);const value=await waitFor(this.context.number(expression,{signal:job.controller.signal}),job.controller.signal);this.verify(job);return value;}));
    const seed=integer(values[4],0,4294967295,'Spring seed'),max_evaluations=integer(values[5],1,2000,'Evaluation limit');
    const solver={initialization,seed,max_evaluations,edge_length:finite(values[0],1e-100,1e100,'Target edge'),
      random_scale:finite(values[1],.001,1000,'Random spread'),residual_tolerance:finite(values[2],1e-12,1e-3,'Residual tolerance'),
      solver_tolerance:finite(values[3],1e-14,1e-3,'Solver tolerance'),regular_faces:fields['spring-regular-faces'],...advanced};
    return {solver,adoption:'constraints-satisfied'};
  }
  async preview(){
    const job=this.start('preview');this.previewData=null;
    try{
      const params=await this.parameters(job);job.params=params;job.paramsSignature=canonical(params,SPRING_CONTROL_LIMITS.constraintBytes);this.verify(job);
      if(typeof this.context.preview!=='function')fail('Native spring preview is unavailable.');
      const response=await waitFor(this.context.preview(SPRING_PREVIEW_OPERATION,params,{sourceSnapshot:structuredClone(job.source),
        signal:job.controller.signal,verifyPublication:()=>this.verify(job)}),job.controller.signal);
      this.verify(job);const packet=checkedPacket(response,job.source);
      this.previewData={owner:job.owner,source:job.source,params:structuredClone(params),history:job.history,fields:job.fields,packet};
      this.show(packet);return packet;
    }catch(error){job.controller.abort();throw error;}
    finally{if(this.active===job){this.active=null;this.busy=false;this.sync();}}
  }
  show(packet){
    const result=packet.result,e=result.evidence,r=e.residuals,n=e.solverTermination?.evaluations;
    const status=result.model?(e.requestedConstraintsSatisfied?'Targets satisfied':'Targets unresolved'):'Invalid realization';
    this.node('spring-result').textContent=`${status} · max ${r.maximumAbsoluteNormalizedResidual.toExponential(3)} · RMS ${r.rmsNormalizedResidual.toExponential(3)} (edge units)\n${result.status}${Number.isInteger(n)?` · ${n} evaluations`:''} · uniformity not established`+
      (result.model?'':`\n${(e.geometricValidity?.diagnostics??[]).slice(0,4).join(' ')}`);
  }
  validPreview(){
    const cached=this.previewData;if(!cached)return false;
    verifyNativeSource(this.context,cached.owner);
    if(this.history()!==cached.history||JSON.stringify(this.fields())!==cached.fields)fail('Spring preview source or controls changed.');return true;
  }
  async adopt(){
    if(this.busy)fail('Finish or cancel the current spring solve first.');
    if(!this.validPreview())fail('Solve a current spring preview before adoption.');
    const cached=this.previewData;if(!cached.packet.adoption.publishable)fail('Invalid realizations cannot be adopted.');
    const acceptUnresolved=Boolean(this.node('spring-accept-near-miss').checked);
    if(cached.packet.adoption.requiresExplicitNearMiss&&!acceptUnresolved)fail('Explicitly accept the valid realization with unresolved targets.');
    const job=this.start('adopt',cached.owner);job.acceptUnresolved=acceptUnresolved;
    job.params={solver:structuredClone(cached.params.solver),adoption:acceptUnresolved?'valid-near-miss':'constraints-satisfied'};
    job.paramsSignature=canonical(job.params,SPRING_CONTROL_LIMITS.constraintBytes);
    try{
      this.verify(job);const result=await waitFor(this.context.commit(SPRING_OPERATION,job.params,'Spring relaxation',{
        sourceSnapshot:structuredClone(job.source),signal:job.controller.signal,verifyPublication:()=>this.verify(job)}),job.controller.signal);
      // The provider must invoke the callback immediately before publishing.
      // A successful commit intentionally changes the current source afterward.
      if(this.active!==job||job.generation!==this.generation||job.controller.signal.aborted)throw canceled();
      this.previewData=null;return result;
    }catch(error){job.controller.abort();throw error;}
    finally{if(this.active===job){this.active=null;this.busy=false;this.sync();}}
  }
  cancel(){const job=this.active;if(!job)return false;this.active=null;this.generation++;this.busy=false;job.controller.abort();this.sync();return true;}
  sync(){
    if(this.destroyed)return;const blocked=this.busy||Boolean(this.context.isExporting?.());
    for(const node of this.panel.querySelectorAll('input,select,textarea,button'))node.disabled=blocked;
    const eligible=eligibleSpringSource(data(this.context.getState(),'model'));
    this.node('preview-spring').disabled=blocked||!eligible;
    this.node('spring-seed').disabled=blocked||this.node('spring-initialization').value!=='random';
    this.node('spring-random-scale').disabled=blocked||this.node('spring-initialization').value!=='random';
    let current=false;try{current=this.validPreview();}catch{this.previewData=null;this.node('spring-result').textContent='Source or controls changed; solve a new preview.';}
    const valid=current&&this.previewData.packet.adoption.publishable;
    this.node('adopt-spring').disabled=blocked||!valid||this.previewData.packet.adoption.requiresExplicitNearMiss&&!this.node('spring-accept-near-miss').checked;
    this.node('spring-accept-near-miss').disabled=blocked||!valid||!this.previewData.packet.adoption.requiresExplicitNearMiss;
    this.node('cancel-spring').hidden=!this.busy;this.node('cancel-spring').disabled=!this.busy;
  }
  destroy(){if(this.destroyed)return;this.cancel();this.destroyed=true;this.previewData=null;this.panel.remove();}
}
