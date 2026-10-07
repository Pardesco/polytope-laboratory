import {NumericEntry} from './numeric-entry.mjs';

export class MeasurementControls{
  constructor(context){
    const {getState,getModel,run,guard,markDirty,refresh,number,rawNumbers,format}=context;this.context=context;
    Object.assign(this,{getState,getModel,run,guard,markDirty,refresh,number,rawNumbers,format});this.sequence=0;this.$=id=>document.getElementById(id);
    const root=document.createElement('div');root.id='entity-measure-controls';
    const choices='<option value="vertex">Source vertex</option><option value="edge">Source edge / line</option><option value="face">Source face / plane</option><option value="cell">Source cell / hyperplane</option><option value="line">Line through vertex IDs</option><option value="plane">Plane through vertex IDs</option><option value="hyperplane">Hyperplane through vertex IDs</option>';
    root.innerHTML='<div class="rule"></div><div class="panel-title">ENTITY MEASUREMENTS / ALIGNMENT</div><label>Entity A <select id="measure-a-kind">'+choices+'</select></label><label>A index / vertex IDs <input id="measure-a-ids" value="0"></label><button id="measure-use-a" class="wide">Use selected entity as A</button><label>Entity B <select id="measure-b-kind">'+choices+'</select></label><label>B index / vertex IDs <input id="measure-b-ids" value="1"></label><button id="measure-use-b" class="wide">Use selected entity as B</button><label><input id="measure-bounded" type="checkbox"> Bounded vertices / edges / convex faces / cells</label><div class="net-history"><button id="measure-flat-distance">Distance A / B</button><button id="measure-flat-angle">Principal angles A / B</button></div><button id="measure-entity-info" class="wide">A: area / volume / circumradius</button><label>Ridge ID <input id="measure-ridge" type="number" min="0" value="0"></label><button id="measure-dihedral" class="wide">Convex interior dihedral</button><p class="muted">Ridge is an edge in 3D or a face in 4D. Principal angles describe unoriented direction spaces; two 4D planes can have two angles. Distances use infinite supporting flats unless bounded source entities are selected. Convex face/cell distances report numerical distance bounds; concave/star filled regions are unavailable.</p><label>Alignment offset <input id="measure-align-offset" value="0"></label><label>Alignment direction <input id="measure-align-direction" placeholder="Optional intrinsic XYZ / XYZW"></label><button id="measure-align-section" class="wide">Section through A + offset</button><p class="muted">Zero offset puts the section through A. Faces in 3D and cells in 4D determine a unique normal. Other flats use a radial perpendicular direction or your explicit direction.</p><pre id="entity-measure-result" class="code-box">Choose intrinsic source entities.</pre>';
    this.$('measurement-result').after(root);
    for(const id of ['measure-a-kind','measure-a-ids','measure-b-kind','measure-b-ids','measure-bounded','measure-ridge','measure-align-offset','measure-align-direction'])this.$(id).onchange=()=>{this.sequence++;this.save();};
    for(const side of ['a','b'])this.$('measure-use-'+side).onclick=()=>{this.$('measure-'+side+'-kind').value=this.$('selection-kind').value;this.$('measure-'+side+'-ids').value=this.$('selection-id').value;this.sequence++;this.save();};
    this.$('measure-flat-distance').onclick=guard(()=>this.compute('entity-measure',{kind:'flat-distance',entities:this.entities(),bounded:this.$('measure-bounded').checked}));
    this.$('measure-flat-angle').onclick=guard(()=>this.compute('entity-measure',{kind:'flat-angle',entities:this.entities()}));
    this.$('measure-entity-info').onclick=guard(()=>this.compute('entity-info',{entity:this.entity('a')}));
    this.$('measure-dihedral').onclick=guard(()=>this.compute('dihedral',{ridge:Number(this.$('measure-ridge').value)}));
    this.$('measure-align-section').onclick=guard(()=>this.align());
  }
  settings(){return this.getState().view.measurements ||= {aKind:'vertex',aIds:'0',bKind:'vertex',bIds:'1',bounded:false,ridge:0,offset:'0',direction:''};}
  save(){const c=this.settings();Object.assign(c,{aKind:this.$('measure-a-kind').value,aIds:this.$('measure-a-ids').value,bKind:this.$('measure-b-kind').value,bIds:this.$('measure-b-ids').value,bounded:this.$('measure-bounded').checked,ridge:Number(this.$('measure-ridge').value),offset:this.$('measure-align-offset').value,direction:this.$('measure-align-direction').value});this.markDirty();}
  sync(){this.sequence++;const c=this.settings();for(const [id,key] of Object.entries({'measure-a-kind':'aKind','measure-a-ids':'aIds','measure-b-kind':'bKind','measure-b-ids':'bIds','measure-ridge':'ridge','measure-align-offset':'offset','measure-align-direction':'direction'}))this.$(id).value=c[key];this.$('measure-bounded').checked=c.bounded;this.$('entity-measure-result').textContent='Choose intrinsic source entities.';delete this.$('entity-measure-result').dataset.operation;}
  entity(side){const kind=this.$('measure-'+side+'-kind').value,ids=this.rawNumbers(this.$('measure-'+side+'-ids').value);if(['line','plane','hyperplane'].includes(kind))return {kind,vertices:ids};if(ids.length!==1)throw new Error('A source entity uses one index; an explicit flat uses a list of vertex IDs.');return {kind,index:ids[0]};}
  entities(){return [this.entity('a'),this.entity('b')];}
  alignmentTarget(){return {kind:this.$('measure-a-kind').value,ids:this.$('measure-a-ids').value,
    offset:this.$('measure-align-offset').value,direction:this.$('measure-align-direction').value,
    measurements:this.getState().view.measurements??null,
    sectionNormal:this.getState().view.sectionNormal??null,sectionOffset:this.getState().view.sectionOffset??0,
    derivedMode:this.getState().view.derivedMode??null,sectionAlignment:this.getState().view.sectionAlignment??null};}
  async align(){
    if(this.numericEntry?.busy)throw Error('Finish or cancel the current alignment edit first.');
    const entity=this.entity('a'),direction=this.$('measure-align-direction').value.trim(),model=this.getState().model,dimension=model.embeddingDimension??model.dimension;
    const fields={offset:{text:this.$('measure-align-offset').value},...direction?{direction:{kind:'vector',text:direction,length:dimension,nonzero:true}}:{}};
    const entry=new NumericEntry({...this.context,getTarget:()=>this.alignmentTarget()});this.numericEntry=entry;
    try{return await entry.run(fields,async(values,verify,{signal,source})=>{
      verify();const params={entity,offset:values.offset,...values.direction?{direction:[...values.direction]}:{}};
      const result=await this.run('align-section',params,source,'Intrinsic align-section',{signal});verify();
      if(!Array.isArray(result.normal)||result.normal.length!==dimension||result.normal.some(x=>typeof x!=='number'||!Number.isFinite(x))||
         Math.abs(Math.hypot(...result.normal)-1)>1e-8||typeof result.offset!=='number'||!Number.isFinite(result.offset))throw Error('Native alignment returned an invalid section plane.');
      const text=`Section depth: ${this.format(result.offset)} model-units\nNormal: ${result.normal.map(this.format).join(', ')}\n${result.directionPolicy}\n${result.definition}`;
      verify();const view=this.getState().view;Object.assign(view,{sectionNormal:[...result.normal],sectionOffset:result.offset,derivedMode:'section',sectionAlignment:structuredClone(result)});
      this.$('section-normal').value=result.normal.join(', ');this.$('section-depth').value=result.offset;this.$('section-offset').value=result.offset;this.$('derived-mode').value='section';
      this.$('entity-measure-result').textContent=text;this.$('entity-measure-result').dataset.operation='align-section';this.save();this.refresh();return result;
    });}finally{if(this.numericEntry===entry)this.numericEntry=null;}
  }
  cancelNumeric(){this.numericEntry?.cancel();this.sequence++;}
  async compute(op,params){this.save();const source=this.getState(),sequence=++this.sequence;const result=await this.run(op,params,source.model,'Intrinsic '+op);
    if(this.getState()!==source||this.sequence!==sequence)return;
    let text;
    if(op==='entity-info')text=`Content: ${result.content===null?'unavailable':this.format(result.content)+' '+result.contentUnits}\n${result.contentDefinition}\nCircumradius: ${result.circumradius===null?'unavailable (no common sphere)':this.format(result.circumradius)+' model-units'}\nVertex-mean radius range: ${result.vertexMeanRadiusRange.map(this.format).join(' / ')}\n${result.circumsphereDefinition}`;
    else if(op==='align-section'){
      source.view.sectionNormal=result.normal;source.view.sectionOffset=result.offset;source.view.derivedMode='section';source.view.sectionAlignment=result;
      this.$('section-normal').value=result.normal.join(', ');this.$('section-depth').value=result.offset;this.$('section-offset').value=result.offset;this.$('derived-mode').value='section';this.markDirty();this.refresh();
      text=`Section depth: ${this.format(result.offset)} model-units\nNormal: ${result.normal.map(this.format).join(', ')}\n${result.directionPolicy}\n${result.definition}`;
    }else text=`${result.angles?result.angles.map(this.format).join(' / '):this.format(result.value)} ${result.units}\n${result.definition}${result.witnessPoints?'\nClosest points: '+result.witnessPoints.map(p=>'('+p.map(this.format).join(', ')+')').join(' / '):''}${result.records?'\nAdjacent facets: '+result.records[0].facets.join(', '):''}`;
    if(result.boundedDistanceEvidence)text+='\nNumerical distance bounds: '+result.boundedDistanceEvidence.distanceBounds.map(this.format).join(' .. ')+' model-units\nFloat64 convex optimality check; source incidence retained.';
    this.$('entity-measure-result').textContent=text;this.$('entity-measure-result').dataset.operation=op;
  }
}
