import {NumericEntry} from './numeric-entry.mjs';
/** Explicit derived construction; no Stella crossed/gyro preset aliases. */
export class CrossedSegmentotopeControls {
  constructor(context) {
    this.context=context;this.busy=false;
    const panel=document.createElement('details');panel.id='crossed-segmentotope-settings';
    const matrix=Array.from({length:9},(_,i)=>`<input id="crossed-layer-matrix-${i}" value="${i%4===0?1:0}" aria-label="Matrix row ${Math.floor(i/3)+1} column ${i%3+1}">`).join('');
    panel.innerHTML='<summary>Crossed antiprism product (4D)</summary><label>Polygon <input id="crossed-layer-symbol" value="4/3" maxlength="32" placeholder="Retrograde n/d"></label><label>Base sizing <select id="crossed-layer-sizing"><option value="radius">Radius</option><option value="base-edge">Edge length</option></select></label><label><span id="crossed-layer-size-name">Radius</span><input id="crossed-layer-size" value="1"></label><label>Layer separation <select id="crossed-layer-elevation"><option value="height">Height</option><option value="side-edge">Side edge length</option></select></label><label><span id="crossed-layer-elevation-name">Height</span><input id="crossed-layer-elevation-size" value="1"></label><label>Interval depth <input id="crossed-layer-depth" value="1"></label><details id="crossed-layer-orientation-settings"><summary>Orientation</summary><label>Common frame <select id="crossed-layer-orientation"><option value="identity">Identity</option><option value="reflect-x">Reflect X</option><option value="matrix">Explicit matrix</option></select></label><div id="crossed-layer-matrix" hidden style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px">'+matrix+'</div></details><button id="generate-crossed-segmentotope">Generate</button>';
    const anchor=document.getElementById('layer-join-settings')??document.getElementById('segmentotope-settings')??document.getElementById('podia-settings');
    if(!anchor)throw Error('Crossed layer controls require a construction controls anchor.');
    anchor.after(panel);this.panel=panel;
    for(const id of ['crossed-layer-sizing','crossed-layer-elevation','crossed-layer-orientation'])panel.querySelector('#'+id).onchange=()=>this.sync();
    panel.querySelector('#generate-crossed-segmentotope').onclick=context.guard(()=>this.generate());this.sync();
  }
  checkExport(){if(this.context.isExporting?.())throw Error('Finish animation export before constructing geometry.');}
  inputs(){
    const value=id=>this.panel.querySelector('#crossed-layer-'+id).value;
    const symbol=value('symbol'),sizing=value('sizing'),elevation=value('elevation'),orientation=value('orientation');
    const match=symbol.length<=32&&/^\s*([0-9]+)\s*\/\s*([+-]?[0-9]+)\s*$/.exec(symbol);
    if(!match)throw Error('Enter a literal retrograde n/d, such as 4/3 or 5/-3.');
    const n=Number(match[1]),d=Number(match[2]);
    if(!Number.isSafeInteger(n)||!Number.isSafeInteger(d)||n<3||n>1000||Math.abs(d)>=n||2*Math.abs(d)<=n)throw Error('Use 3 ≤ n ≤ 1000 and n/2 < |d| < n.');
    if(!['radius','base-edge'].includes(sizing)||!['height','side-edge'].includes(elevation))throw Error('Choose base sizing and layer separation.');
    if(!['identity','reflect-x','matrix'].includes(orientation))throw Error('Choose a common orientation frame.');
    const texts=[value('size'),value('elevation-size'),value('depth')];
    if(texts.some(text=>!text.trim()))throw Error('Enter all three positive sizes.');
    const matrixTexts=orientation==='matrix'?Array.from({length:9},(_,i)=>value('matrix-'+i)):[];
    if(matrixTexts.some(text=>!text.trim()))throw Error('Enter all nine matrix entries.');
    return {symbol,sizing,elevation,orientation,texts,matrixTexts};
  }
  rigid(values){
    const matrix=Array.from({length:3},(_,i)=>values.slice(3*i,3*i+3));
    for(let i=0;i<3;i++)for(let j=0;j<3;j++){
      const dot=matrix[i].reduce((sum,value,k)=>sum+value*matrix[j][k],0);
      if(!Number.isFinite(dot)||Math.abs(dot-(i===j?1:0))>1e-10)throw Error('Orientation must be an orthogonal matrix; scale and shear are unsupported.');
    }
    return matrix;
  }
  async generate(){
    this.checkExport();if(this.busy)throw Error('Finish the current crossed layer construction first.');
    const input=this.inputs(),entry=this.numericEntry=new NumericEntry({...this.context,getTarget:()=>this.inputs()});
    const fields=Object.fromEntries(['size','elevation','depth'].map((key,i)=>[key,{text:input.texts[i],min:0,exclusiveMin:true,max:1e100}]));
    input.matrixTexts.forEach((text,i)=>{fields['matrix'+i]={text};});
    this.busy=true;this.sync();
    try{return await entry.run(fields,(values,verify,{signal,source})=>{
      const params={symbol:input.symbol,[input.sizing==='radius'?'radius':'base_edge']:values.size,
        [input.elevation==='height'?'height':'side_edge']:values.elevation,depth:values.depth};
      if(input.orientation==='reflect-x')params.orientation=[[-1,0,0],[0,1,0],[0,0,1]];
      if(input.orientation==='matrix')params.orientation=this.rigid(Array.from({length:9},(_,i)=>values['matrix'+i]));
      verify();return this.context.generate('crossed-antiprism-segmentotope',params,{signal,verifyPublication:verify,sourceSnapshot:source,expressionInputs:input});
    });}finally{if(this.numericEntry===entry)this.numericEntry=null;this.busy=false;this.sync();}
  }
  cancel(){this.numericEntry?.cancel();}
  sync(){
    const node=id=>this.panel.querySelector('#crossed-layer-'+id),disabled=this.busy||Boolean(this.context.isExporting?.());
    node('size-name').textContent=node('sizing').value==='base-edge'?'Base edge length':'Radius';
    node('elevation-name').textContent=node('elevation').value==='side-edge'?'Side edge length':'Height';
    const explicit=node('orientation').value==='matrix';node('matrix').hidden=!explicit;
    for(const input of this.panel.querySelectorAll('input,select,button'))input.disabled=disabled;
    for(let i=0;i<9;i++)node('matrix-'+i).disabled=disabled||!explicit;
  }
}
