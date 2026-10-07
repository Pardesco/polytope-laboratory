import {NumericEntry} from './numeric-entry.mjs';

export class SymmetryControls{
  constructor(context){
    const {getState,run,guard,markDirty,viewer,format}=context;this.context=context;
    Object.assign(this,{getState,run,guard,markDirty,viewer,format});this.$=id=>document.getElementById(id);this.sequence=0;this.result=null;
    const controls=document.createElement('div');controls.id='symmetry-controls';controls.innerHTML='<label>Symmetry method <select id="symmetry-method"><option value="geometric">Full intrinsic frame search</option><option value="signed-axis">Signed coordinate subgroup</option></select></label><label>Orientation <select id="symmetry-orientation"><option value="all">All orthogonal actions</option><option value="proper">Proper rotations only</option></select></label><label>Setwise stabilizer <select id="symmetry-stabilize"><option value="none">No entity restriction</option><option value="vertex">Source vertex</option><option value="edge">Source edge</option><option value="face">Source face</option><option value="cell">Source cell</option></select></label><label>Stabilized entity ID <input id="symmetry-stabilize-id" type="number" min="0" value="0"></label><button id="symmetry-use-selection" class="wide">Stabilize selected source entity</button><label>Candidate frame limit <input id="symmetry-frame-limit" type="number" min="1" max="1000000" value="100000"></label>';
    this.$('symmetry').before(controls);const custom=document.createElement('label');custom.textContent='Source generator IDs';const input=document.createElement('input');input.id='symmetry-generator-ids';input.placeholder='Blank: full group; identity; or IDs';custom.append(input);controls.append(custom);
    const inspection=document.createElement('div');inspection.id='symmetry-inspection';inspection.innerHTML='<label>Orbit entity <select id="symmetry-orbit-kind"><option value="vertex">Source vertex</option><option value="edge">Source edge</option><option value="face">Source face</option><option value="cell">Source cell</option></select></label><label>Orbit entity ID <input id="symmetry-orbit-id" type="number" min="0" value="0"></label><button id="symmetry-highlight-orbit" class="wide">Inspect / highlight orbit</button><pre id="symmetry-orbit-result" class="code-box"></pre><label>Action ID <input id="symmetry-action-id" type="number" min="0" value="0"></label><button id="symmetry-inspect-action" class="wide">Inspect intrinsic action</button><pre id="symmetry-action-result" class="code-box"></pre><p class="muted">Entity stabilizers fix the selected entity as a set. Actions apply about the source vertex mean. Numerical completeness requires exhausted frames and verified generator closure. Limited searches return actions without orbit or group claims.</p>';
    this.$('symmetry-result').after(inspection);
    this.ids={'symmetry-generator-ids':'generatorIds','symmetry-method':'method','symmetry-orientation':'orientation','symmetry-stabilize':'stabilize','symmetry-stabilize-id':'stabilizeId','symmetry-frame-limit':'maxFrames','symmetry-orbit-kind':'orbitKind','symmetry-orbit-id':'orbitId','symmetry-action-id':'actionId'};
    for(const id of Object.keys(this.ids))this.$(id).onchange=()=>{this.save();if(['symmetry-orbit-kind','symmetry-orbit-id','symmetry-action-id'].includes(id))return;this.clear();this.configure();};
    this.$('symmetry-use-selection').onclick=()=>{this.$('symmetry-method').value='geometric';this.$('symmetry-stabilize').value=this.$('selection-kind').value;this.$('symmetry-stabilize-id').value=this.$('selection-id').value;this.save();this.clear();this.configure();};
    this.$('symmetry-frame-limit').type='text';this.$('symmetry-frame-limit').maxLength=512;
    this.$('symmetry').onclick=guard(()=>this.compute());
    this.$('symmetry-highlight-orbit').onclick=guard(()=>this.highlight());
    this.$('symmetry-inspect-action').onclick=guard(()=>this.inspect());
  }
  settings(){return this.getState().view.symmetry ||= {method:'geometric',orientation:'all',stabilize:'none',stabilizeId:0,maxFrames:100000,orbitKind:'vertex',orbitId:0,actionId:0,generatorIds:''};}
  save(){const c=this.settings();for(const [id,key] of Object.entries(this.ids)){if(key==='maxFrames')continue;c[key]=this.$(id).type==='number'?Number(this.$(id).value):this.$(id).value;}this.markDirty();}
  configure(){const signed=this.$('symmetry-method').value==='signed-axis';for(const id of ['symmetry-orientation','symmetry-stabilize','symmetry-stabilize-id','symmetry-frame-limit','symmetry-generator-ids'])this.$(id).disabled=signed;}
  clear(){this.sequence++;this.result=null;this.$('symmetry-result').textContent='Verify the source metric and full ordered incidence. The full frame search supports intrinsic 2D, 3D and 4D.';delete this.$('symmetry-result').dataset.order;this.$('symmetry-orbit-result').textContent='';delete this.$('symmetry-orbit-result').dataset.size;this.$('symmetry-action-result').textContent='';}
  sync(){this.clear();const c=this.settings();for(const [id,key] of Object.entries(this.ids))this.$(id).value=c[key]??'';this.configure();}
  queryTarget(){return {fields:Object.fromEntries(Object.entries(this.ids).filter(([,key])=>!['orbitKind','orbitId','actionId'].includes(key)).map(([id])=>[id,this.$(id).value])),
    saved:this.getState().view.symmetry?Object.fromEntries(Object.entries(this.getState().view.symmetry).filter(([key])=>!['orbitKind','orbitId','actionId'].includes(key))):null};}
  cancelNumeric(){this.numericEntry?.cancel();this.clear();}
  async compute(){
    if(this.numericEntry?.busy)throw Error('Finish or cancel the current symmetry query first.');
    this.clear();const sequence=this.sequence,c={method:this.$('symmetry-method').value,orientation:this.$('symmetry-orientation').value,
      stabilize:this.$('symmetry-stabilize').value,stabilizeId:Number(this.$('symmetry-stabilize-id').value),generatorIds:this.$('symmetry-generator-ids').value.trim()};
    const entry=new NumericEntry({...this.context,getTarget:()=>this.queryTarget()});this.numericEntry=entry;
    const fields={maxFrames:{text:c.method==='geometric'?this.$('symmetry-frame-limit').value:'1',integer:true,min:1,max:1000000}};
    try{return await entry.run(fields,async({maxFrames},verify,{signal,source})=>{
      const params={method:c.method};
      if(c.method==='geometric'){params.orientation=c.orientation;params.max_frames=maxFrames;
        if(c.stabilize!=='none'){if(!Number.isSafeInteger(c.stabilizeId)||c.stabilizeId<0)throw Error('Choose a literal nonnegative stabilized entity ID.');params.stabilize={kind:c.stabilize,index:c.stabilizeId};}
        if(c.generatorIds){const ids=c.generatorIds==='identity'?[]:c.generatorIds.split(/[\s,;]+/).map(Number);
          if(ids.some(id=>!Number.isSafeInteger(id)||id<0))throw Error('Generator IDs must be literal nonnegative integers.');params.generator_ids=ids;}
      }
      verify();const result=await this.run('symmetry',params,source,'Verify intrinsic symmetry',{signal});verify();
      if(this.sequence!==sequence)throw Error('Symmetry query changed before publication.');
      this.publish(result);this.save();if(c.method==='geometric'){this.settings().maxFrames=maxFrames;this.$('symmetry-frame-limit').value=String(maxFrames);}return result;
    });}finally{if(this.numericEntry===entry)this.numericEntry=null;}
  }
  publish(result){
    this.result=result;let text=`Order ${result.order}; proper order ${result.properOrder}\n${result.status}\n${result.checks.join(', ')}\n${result.numericMode}`;
    if(result.candidateFramesEvaluated!==undefined)text+=`\nFrames: ${result.candidateFramesEvaluated}; source candidates: ${result.unrestrictedVerifiedOrder}\nGenerators (this result): ${result.generatorIndices.join(', ')||(result.complete?'identity only':'unresolved')}\nFull-source generator IDs: ${result.unrestrictedGeneratorIndices.join(', ')}\nClosure: ${result.closureVerified===true?'verified':result.closureVerified===false?'failed':'unresolved'}`;
    if(result.entityOrbits)for(const [kind,orbits] of Object.entries(result.entityOrbits))if(orbits.length)text+=`\n${kind} orbits: ${orbits.length}; sizes ${orbits.map(o=>o.size).join(', ')}`;
    this.$('symmetry-result').textContent=text;this.$('symmetry-result').dataset.order=result.order;
  }
  ready(){if(!this.result)throw new Error('Verify symmetry for the current source and settings first.');return this.result;}
  highlight(){const result=this.ready();if(!result.entityOrbits)throw new Error('Verified full-group orbits require an exhausted geometric frame search.');this.save();const c=this.settings(),orbit=result.entityOrbits[c.orbitKind]?.find(o=>o.ids.includes(c.orbitId));if(!orbit)throw new Error('Choose an existing source entity ID for this orbit.');
    const model=this.getState().model,vertices=new Set();for(const id of orbit.ids){const ids=c.orbitKind==='vertex'?[id]:c.orbitKind==='edge'?model.edges[id]:c.orbitKind==='face'?model.faces[id]:model.cells[id].flatMap(f=>model.faces[f]);ids.forEach(v=>vertices.add(v));}this.viewer.select([...vertices]);this.viewer.setDisplay(this.viewer.view||{});
    this.$('symmetry-orbit-result').textContent=`${c.orbitKind} orbit size ${orbit.size}; setwise stabilizer order ${orbit.stabilizerOrder}\nSource IDs: ${orbit.ids.slice(0,64).join(', ')}${orbit.ids.length>64?' … ('+orbit.ids.length+' total)':''}\nHighlighted ${vertices.size} source vertices.`;this.$('symmetry-orbit-result').dataset.size=orbit.size;
  }
  inspect(){const result=this.ready();this.save();const index=this.settings().actionId;if(!Number.isInteger(index)||index<0||index>=result.actions.length)throw new Error('Choose an existing verified action ID.');const action=result.actions[index];this.$('symmetry-action-result').textContent=`Action ${index}; source action ${action.sourceActionId??index}; determinant ${action.determinant}\nSource center: ${result.center.map(this.format).join(', ')}\nMatrix:\n${action.matrix.map(row=>row.map(this.format).join(', ')).join('\n')}\nVertex permutation (source → image): ${action.permutation.slice(0,64).join(', ')}${action.permutation.length>64?' … ('+action.permutation.length+' total)':''}`;}
}
