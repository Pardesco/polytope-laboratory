/** Read-only numerical predicates on the current native-validated 4D model.
 * Camera/rotation/notes may change while checking; complete model attributes
 * and the current state/model pointers must still belong to this request.
 */
import {storeMemory} from './model-memories.mjs';

const TOLERANCE=1e-8;
const fingerprint=value=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);
const names={twoParallelLayers:'Two W layers',equalEdges:'Equal edges',commonHypersphere:'Common hypersphere',orderedRegularFaces:'Ordered regular faces'};
const residual=(value,label)=>{
  if(typeof value!=='number'||!Number.isFinite(value)||value<0)throw Error(`Invalid native ${label} residual.`);
  return value;
};
function eligible(model){
  return model?.dimension===4&&(model.embeddingDimension??4)===4&&typeof model.id==='string'&&model.id.length>0&&model.id.length<=256&&fingerprint(model.fingerprint)&&Array.isArray(model.vertices)&&model.vertices.length>0&&model.vertices.length<=64;
}
function capture(model){
  const copy=storeMemory(undefined,1,{model,view:{}},{}).slots[0].state.model;
  return {copy,signature:JSON.stringify(copy)};
}

/** Validate the returned numeric scope and source binding before text output.
 * This checks the response envelope; native math remains the authority.
 */
export function strictPredicateSummary(result,model){
  if(!result||!['passed','not-strict','unsupported','invalid'].includes(result.status)||result.certified!==false)
    throw Error('Invalid native strict-predicate result; numerical analysis cannot issue a certificate.');
  if(result.sourceModelId!==model.id||result.sourceFingerprint!==model.fingerprint)
    throw Error('Strict-predicate result is not bound to the current source model ID and fingerprint.');
  if(result.numeric?.mode!=='float64-approximate'||result.numeric.tolerance!==TOLERANCE)
    throw Error('Invalid native strict-predicate numerical scope.');
  if(typeof result.strictPredicatesPassed!=='boolean'||result.strictPredicatesPassed!==(result.status==='passed'))
    throw Error('Inconsistent native strict-predicate status.');
  const checks=result.checks;
  if(!checks||typeof checks!=='object'||Array.isArray(checks))throw Error('Invalid native strict-predicate checks.');
  const lines=[],flags=[];
  for(const [key,name] of Object.entries(names)){
    const check=checks[key];
    if(check===undefined){
      if(result.status==='passed'||result.status==='not-strict')throw Error(`Missing native ${name} check.`);
      continue;
    }
    if(!check||typeof check.passed!=='boolean')throw Error(`Invalid native ${name} check.`);
    flags.push(check.passed);
    let values;
    if(key==='twoParallelLayers')values=[['normalized',residual(check.normalizedResidual,name)]];
    else if(key==='equalEdges'||key==='commonHypersphere')values=[['relative',residual(check.relativeResidual,name)]];
    else{
      if(!Array.isArray(check.faces)||check.faces.length!==model.faces.length)throw Error('Invalid native ordered-face coverage.');
      const ids=new Set();let sides=0,turns=0,circles=0,all=true;
      for(const face of check.faces){
        if(!face||!Number.isInteger(face.sourceFaceId)||face.sourceFaceId<0||face.sourceFaceId>=model.faces.length||ids.has(face.sourceFaceId)||typeof face.passed!=='boolean')
          throw Error('Invalid native ordered-face source ownership.');
        ids.add(face.sourceFaceId);all&&=face.passed;
        sides=Math.max(sides,residual(face.sideRelativeResidual,'face side'));
        turns=Math.max(turns,residual(face.turnCosineResidual,'face turn'));
        circles=Math.max(circles,residual(face.circleRelativeResidual,'face circle'));
        if(face.passed&&[face.sideRelativeResidual,face.turnCosineResidual,face.circleRelativeResidual].some(value=>value>TOLERANCE))
          throw Error('Inconsistent native ordered-face residuals.');
      }
      if(all!==check.passed)throw Error('Inconsistent native ordered-face status.');
      values=[['side',sides],['turn cosine',turns],['circle',circles]];
    }
    if(check.passed&&values.some(([,value])=>value>TOLERANCE))throw Error(`Inconsistent native ${name} residuals.`);
    lines.push(`${name}: ${check.passed?'pass':'fail'}; ${values.map(([label,value])=>`${label} ${value.toExponential(2)}`).join(', ')}`);
  }
  if((result.status==='passed'||result.status==='not-strict')&&flags.every(Boolean)!==result.strictPredicatesPassed)
    throw Error('Inconsistent native combined predicate status.');
  const title={passed:'Numerical predicates passed','not-strict':'Numerical predicates not strict',unsupported:'Unsupported predicate analysis',invalid:'Invalid predicate analysis'}[result.status];
  if(!Array.isArray(result.diagnostics)||result.diagnostics.length>100)throw Error('Invalid native predicate diagnostics.');
  const diagnostics=result.diagnostics.slice(0,3).map(item=>{
    if(typeof item?.message!=='string')throw Error('Invalid native predicate diagnostic.');
    return item.message.slice(0,256);
  });
  return {status:result.status,text:[`${title}. Float64 tolerance ${TOLERANCE}; W-aligned layers; not a certificate.`,...lines,...diagnostics].join('\n')};
}

export class SegmentotopeAnalysisControls{
  constructor(context){
    this.context=context;this.busy=false;this.publishedOwner=null;
    const anchor=document.getElementById('layer-join-settings');
    if(!anchor)throw Error('Strict-predicate controls require the parallel layer join panel.');
    const row=document.createElement('div');row.className='strict-segmentotope-analysis';
    row.innerHTML='<button id="analyze-strict-segmentotope" data-independent-control title="Read-only float64 checks of two W layers, edge lengths, a common hypersphere, and ordered face regularity.">Strict predicates</button><output id="strict-segmentotope-result" role="status" aria-live="polite"></output>';
    anchor.append(row);this.panel=row;this.output=row.querySelector('#strict-segmentotope-result');
    this.output.style.whiteSpace='pre-line';
    row.querySelector('#analyze-strict-segmentotope').onclick=context.guard(()=>this.analyze());this.sync();
  }
  checkExport(){if(this.context.isExporting?.())throw Error('Finish animation export before analyzing strict predicates.');}
  ownerCurrent(owner){
    if(this.context.getState()!==owner.state||owner.state.model!==owner.model)return false;
    try{return capture(owner.model).signature===owner.signature;}catch{return false;}
  }
  verify(owner){
    this.checkExport();
    if(!this.ownerCurrent(owner))throw Error('The source model, history state or model attributes changed during predicate analysis.');
  }
  clear(){this.output.textContent='';delete this.output.dataset.status;this.publishedOwner=null;}
  async analyze(){
    this.checkExport();if(this.busy)throw Error('Finish the current strict-predicate analysis first.');
    const state=this.context.getState(),model=state?.model;
    if(!eligible(model))throw Error('Strict predicates require a source-bound intrinsic 4D model with at most 64 vertices.');
    const snapshot=capture(model),owner={state,model,signature:snapshot.signature};
    this.clear();this.busy=true;this.sync();this.output.textContent='Checking numerical predicates...';
    try{
      this.verify(owner);
      const result=await this.context.analyze(structuredClone(snapshot.copy),{tolerance:TOLERANCE});
      this.verify(owner);
      const summary=strictPredicateSummary(result,snapshot.copy);
      // No asynchronous gap between final source fence and publication.
      this.verify(owner);this.output.textContent=summary.text;this.output.dataset.status=summary.status;this.publishedOwner=owner;
      return summary;
    }catch(error){this.clear();throw error;}
    finally{this.busy=false;this.sync();}
  }
  sync(){
    this.panel.querySelector('#analyze-strict-segmentotope').disabled=this.busy||Boolean(this.context.isExporting?.())||!eligible(this.context.getState()?.model);
    if(this.publishedOwner&&!this.ownerCurrent(this.publishedOwner))this.clear();
  }
}
