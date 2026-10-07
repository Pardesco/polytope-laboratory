import {ExpressionEntry,splitExpressionVector,captureExpressionOwner,verifyExpressionOwner} from './expression-entry.mjs';

export class CellNetEditor{
  constructor(context){
    const {getState,getModel,run,guard,markDirty,refresh,viewer,onSourceSelection}=context;
    Object.assign(this,{getState,getModel,run,guard,markDirty,refresh,viewer,onSourceSelection});this.context=context;
    this.expressionEntry=new ExpressionEntry(context);this.sequence=0;
    const panel=document.getElementById('net-panel'),faceControls=document.createElement('div');faceControls.id='face-net-controls';while(panel.firstChild)faceControls.append(panel.firstChild);panel.append(faceControls);
    this.root=document.createElement('div');this.root.id='cell-net-controls';this.root.hidden=true;
    this.root.innerHTML='<div class="panel-title">4D WHOLE-CELL NET</div><label>Root cell <input id="cell-net-root" type="number" min="0" value="0"></label><button id="cell-net-build" class="wide accent">Generate / reset cell net</button><button id="cell-net-separate" class="wide">Start with separate cells</button><div id="cell-net-summary" class="code-box"></div><div class="net-history"><button id="cell-net-undo">Undo cell edit</button><button id="cell-net-redo">Redo cell edit</button></div><label>Source face <input id="cell-net-face" type="number" min="0" value="0"></label><button id="cell-net-match" class="wide">Highlight matching faces</button><button id="cell-net-toggle" class="wide">Cut / join at source face</button><label>Moving cell <input id="cell-net-moving" type="number" min="0" value="1"></label><button id="cell-net-reattach" class="wide">Reattach cell and descendants</button><label>Connected piece <select id="cell-net-component"></select></label><label>Move XYZ <input id="cell-net-translation" value="0, 0, 0"></label><label>Rotate XYZ, deg <input id="cell-net-angles" value="0, 0, 0"></label><button id="cell-net-move" class="wide">Apply rigid piece placement</button><label>Surface shrink <input id="cell-net-shrink" type="range" min="0.15" max="1" step="0.01" value="1"></label><output id="cell-net-shrink-value">100%</output><label>Source vertex <input id="cell-net-vertex" type="number" min="0" value="0"></label><button id="cell-net-match-vertex" class="wide">Highlight all vertex copies</button><div id="cell-net-selection" class="code-box"></div><p class="muted">Click a cell face to highlight its matching copy; Shift-click a vertex to highlight every source copy. Placements use intrinsic model units. Shrink changes display surfaces only; edges and mathematical cells retain their size. Complete cells are retained; intersections are not checked or removed.</p>';
    panel.prepend(this.root);this.$=id=>document.getElementById(id);
    this.$('cell-net-build').onclick=guard(()=>this.build(false));this.$('cell-net-separate').onclick=guard(()=>this.build(true));
    this.$('cell-net-toggle').onclick=guard(()=>this.edit('toggle-face',{face:Number(this.$('cell-net-face').value)}));
    this.$('cell-net-reattach').onclick=guard(()=>this.edit('reattach-cell',{face:Number(this.$('cell-net-face').value),moving_cell:Number(this.$('cell-net-moving').value)}));
    this.$('cell-net-match').onclick=guard(()=>this.select('face',Number(this.$('cell-net-face').value)));
    this.$('cell-net-match-vertex').onclick=guard(()=>this.select('vertex',Number(this.$('cell-net-vertex').value)));
    this.$('cell-net-component').onchange=()=>{this.config().component=Number(this.$('cell-net-component').value);this.select('cell',this.config().component);markDirty();};
    this.$('cell-net-move').onclick=guard(()=>this.move());
    this.$('cell-net-shrink').oninput=()=>{this.config().shrink=Number(this.$('cell-net-shrink').value);markDirty();this.activate();refresh();};
    this.$('cell-net-undo').onclick=guard(()=>this.restore(-1));this.$('cell-net-redo').onclick=guard(()=>this.restore(1));
    viewer.onCellFace=(face,cell)=>{this.$('cell-net-face').value=face;this.$('cell-net-moving').value=cell;this.select('face',face);};
    viewer.onCellVertex=vertex=>{this.$('cell-net-vertex').value=vertex;this.select('vertex',vertex);};
    for(const id of ['cell-net-translation','cell-net-angles']){this.$(id).type='text';this.$(id).inputMode='text';}
  }
  config(s=this.getState()){return s.view.cellNet ||= {root:0,shrink:1,component:0,selection:null};}
  async move(){
    const text=this.$('cell-net-component').value.trim(),component=Number(text);
    if(!/^\d+$/.test(text)||!Number.isSafeInteger(component))throw Error('Use a literal nonnegative integer component ID.');
    const fields={translation:splitExpressionVector(this.$('cell-net-translation').value),angles:splitExpressionVector(this.$('cell-net-angles').value)};
    return this.expressionEntry.run(fields,(values,verify,owner)=>this.edit('move-component',{component,...values},{verifyPublication:verify,owner}));
  }
  activate(){this.getState().view.derivedMode='cell-net';this.$('derived-mode').value='cell-net';}
  sync(){this.sequence++;const s=this.getState();if(!s)return;const four=this.getModel().dimension===4;this.root.hidden=!four;this.$('face-net-controls').hidden=four;
    const c=this.config(s);this.$('cell-net-root').value=c.root;this.$('cell-net-shrink').value=c.shrink;this.$('cell-net-shrink-value').textContent=Math.round(c.shrink*100)+'%';this.$('cell-net-summary').textContent='Generate a whole-cell arrangement from a closed 4D shell with intact orientable 3D cells and simple planar faces.';this.$('cell-net-selection').textContent='';}
  build(separate){const s=this.getState();this.config(s).root=Number(this.$('cell-net-root').value);s.cellNetLayout=null;s.cellNetSeparate=separate;this.activate();this.markDirty();this.refresh();}
  remember(s,net){if(s.cellNetHistory?.sourceFingerprint&&(s.cellNetHistory.sourceFingerprint!==net.sourceFingerprint||s.cellNetHistory.sourceId&&s.cellNetHistory.sourceId!==net.sourceId))s.cellNetHistory=null;const h=s.cellNetHistory ||= {cursor:-1,states:[]};h.sourceFingerprint=net.sourceFingerprint;h.sourceId=net.sourceId;h.states.splice(h.cursor+1);h.states.push({root:net.root,connections:structuredClone(net.connections),placements:structuredClone(net.placements)});if(h.states.length>100)h.states.shift();h.cursor=h.states.length-1;}
  async evaluate(model,state){const sequence=++this.sequence,c=structuredClone(this.config(state));let net=state.cellNetLayout;
    if(!net||net.sourceId!==model.id||net.sourceFingerprint!==model.fingerprint||net.root!==c.root){
      const h=state.cellNetHistory,saved=h?.sourceFingerprint===model.fingerprint&&(!h.sourceId||h.sourceId===model.id)?h.states[h.cursor]:null,restoring=!net&&saved?.root===c.root;
      const owner=captureExpressionOwner({...this.context,isBusy:()=>false,isExporting:()=>false}),historySignature=JSON.stringify(state.cellNetHistory??null);
      net=await this.run('cell-net',{root:c.root,...restoring?{connections:structuredClone(saved.connections),placements:structuredClone(saved.placements??[])}:state.cellNetSeparate?{connections:[]}:{}},model,'Arrange whole 3D cells');
      if(this.sequence!==sequence||this.getState()!==state)return {stale:true};verifyExpressionOwner({...this.context,isBusy:()=>false,isExporting:()=>false},owner);
      if(JSON.stringify(state.cellNetHistory??null)!==historySignature)throw Error('Saved cell-net history changed while preparing the layout.');
      state.cellNetLayout=net;if(!restoring)this.remember(state,net);this.markDirty();
    }return net;}
  async edit(action,params,{verifyPublication,owner}={}){owner??=captureExpressionOwner(this.context);verifyPublication??=()=>verifyExpressionOwner(this.context,owner);verifyPublication();const s=this.getState(),net=s.cellNetLayout;if(!net)throw new Error('Generate a 4D cell net first.');const sequence=++this.sequence;
    const result=await this.run('cell-net-edit',{net,action,...params},this.getModel(),'Edit cell net '+action);verifyPublication();if(this.getState()!==s||s.cellNetLayout!==net||this.sequence!==sequence)return;
    s.cellNetLayout=result;this.remember(s,result);this.activate();this.markDirty();this.refresh();}
  async restore(delta){const s=this.getState(),h=s.cellNetHistory,target=h?.cursor+delta;if(!h||target<0||target>=h.states.length)return;const owner=captureExpressionOwner(this.context),sequence=++this.sequence;
    const result=await this.run('cell-net',h.states[target],this.getModel(),'Restore cell-net layout');verifyExpressionOwner(this.context,owner);if(this.getState()!==s||this.sequence!==sequence)return;h.cursor=target;s.cellNetLayout=result;this.config(s).root=result.root;this.activate();this.markDirty();this.refresh();}
  show(net){const c=this.config();this.viewer.setCellNet(net,c.shrink);this.viewer.restoreCamera(this.getState().view.derivedCamera);this.viewer.setDisplay({...this.viewer.view,appearance:this.getState().view.appearance,materialEffects:this.getState().view.materialEffects});
    this.$('cell-net-summary').textContent=`${net.cells.length} complete cells · ${net.components.length} connected pieces\n${net.connections.length} face connections\nRigidity error ${net.validation.maxRigidDistanceError.toExponential(2)} · face gap ${net.validation.maxConnectedFaceGap.toExponential(2)} model units\nCell intersections not checked.${net.domain?`\n${net.domain}`:""}`;
    const h=this.getState().cellNetHistory;this.$('cell-net-summary').dataset.edit=h?.cursor??0;this.$('cell-net-undo').disabled=!h||h.cursor<=0;this.$('cell-net-redo').disabled=!h||h.cursor>=h.states.length-1;
    const select=this.$('cell-net-component');select.replaceChildren();if(!net.components.some(item=>item.root===c.component))c.component=net.components[0].root;
    for(const item of net.components){const option=document.createElement('option');option.value=item.root;option.textContent=`C${item.root}: ${item.cells.length} cells`;select.append(option);}select.value=c.component;
    this.$('cell-net-root').value=net.root;this.$('cell-net-shrink-value').textContent=Math.round(c.shrink*100)+'%';
    this.$('derived-status').textContent=`${net.cells.length} whole cells · ${net.components.length} pieces · cell intersections ignored`;
    if(c.selection)this.select(c.selection.kind,c.selection.index,false);
  }
  select(kind,index,dirty=true){const net=this.getState().cellNetLayout,model=this.getModel();if(!net)throw new Error('Generate a cell net before selecting matching elements.');
    const count=kind==='face'?model.faces.length:kind==='vertex'?model.vertices.length:model.cells.length;if(!Number.isInteger(index)||index<0||index>=count)throw new Error('Source selection index is outside this model.');
    this.config().selection={kind,index};if(dirty&&this.getState().view.derivedMode!=='cell-net'){this.activate();this.refresh();}this.viewer.selectCellSource(kind,index);this.onSourceSelection(kind,index,dirty);
    const cells=kind==='face'?net.faceAdjacency[String(index)]:kind==='vertex'?net.cells.filter(c=>c.sourceVertices.includes(index)).map(c=>c.id):[index];
    this.$('cell-net-selection').textContent=`Source ${kind} ${index}\nMatching cells: ${cells.map(i=>'C'+i).join(', ')}${kind==='face'?'\nConnection '+(net.connections.includes(index)?'joined':'cut'):''}`;if(dirty)this.markDirty();}
}
