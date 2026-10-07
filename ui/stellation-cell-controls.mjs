// SPDX-License-Identifier: GPL-3.0-only
import {captureNativeSource,verifyNativeSource} from './native-source-binding.mjs';
const svgNS='http://www.w3.org/2000/svg';
const binding=a=>JSON.stringify(Object.fromEntries(['id','source','planes','bounds','regions','algorithmVersion','completeWithinDeclaredDomain','parameters'].map(key=>[key,a?.[key]??null])));
const selected=c=>Array.isArray(c.selectedRegions)?c.selectedRegions.slice().sort((a,b)=>a-b):[];
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const domain=context=>{const config=context.getConfig?.();return JSON.stringify([config?.boxScale??null,config?.planeIds??null]);};
const svgEl=(name,attrs={})=>{const node=document.createElementNS(svgNS,name);for(const [key,value]of Object.entries(attrs))node.setAttribute(key,String(value));return node;};

function checkedIds(graph,ids){
  if(!Array.isArray(ids)||ids.length>2048||new Set(ids).size!==ids.length||ids.some(i=>!Number.isSafeInteger(i)||i<0||i>=graph.nodes.length||!graph.nodes[i].selectable))throw Error('Choose distinct enclosed source region IDs.');return new Set(ids);
}
export function selectStellationCells(graph,ids,action,regionId=null){
  const current=checkedIds(graph,ids),next=new Set(current),node=Number.isSafeInteger(regionId)?graph.nodes[regionId]:null;
  if(action==='fill'){
    const reached=new Set(),pending=graph.exteriorSeedIds.filter(i=>!current.has(i));
    while(pending.length){const i=pending.pop();if(!reached.has(i)&&!current.has(i)){reached.add(i);pending.push(...graph.adjacency[i].filter(j=>!reached.has(j)&&!current.has(j)));}}
    for(const region of graph.nodes)if(region.selectable&&!reached.has(region.id))next.add(region.id);
  }else{
    if(!node?.selectable)throw Error('This region is unbounded, clipped or unresolved.');
    if(action==='toggle')next.has(regionId)?next.delete(regionId):next.add(regionId);
    else if(action==='layer'){
      const layer=graph.nodes.filter(region=>region.selectable&&region.outsidePlaneCount===node.outsidePlaneCount).map(region=>region.id),remove=layer.every(i=>next.has(i));for(const i of layer)remove?next.delete(i):next.add(i);
    }else if(action==='supports'){
      const visited=new Set(),pending=[regionId];while(pending.length){const i=pending.pop();if(visited.has(i))continue;visited.add(i);const region=graph.nodes[i];if(!region.selectable||region.facetAdjacencyUnresolved)throw Error('Supporting region is clipped, unbounded or uncertain; enlarge/re-evaluate the observation domain.');next.add(i);pending.push(...region.supports);}
    }else throw Error('Choose a cell selection action.');
  }
  return [...next].sort((a,b)=>a-b);
}

export class StellationCellControls{
  constructor(context){
    this.context=context;this.receipt=null;this.job=null;this.busy=false;this.svg=null;const panel=document.createElement('details');panel.id='stellation-cell-settings';
    panel.innerHTML=`<summary>Stellation cell / dependency diagram</summary>
      <button id="stellation-cell-evaluate">Build current cell diagram</button>
      <label>Click action <select id="stellation-cell-mode"><option value="toggle">Toggle individual region</option><option value="supports">Add region and all supports</option><option value="layer">Toggle outside-plane layer</option></select></label>
      <div class="button-row"><button id="stellation-cell-fill">Fill inaccessible regions</button><button id="stellation-cell-undo">Undo selection</button><button id="stellation-cell-redo">Redo</button></div>
      <button id="stellation-cell-export">Export cell diagram SVG</button>
      <output id="stellation-cell-status" aria-live="polite">Evaluate a facial-plane arrangement first.</output>
      <div id="stellation-cell-diagram" style="max-height:360px;overflow:auto"></div>
      <p class="muted">Individual enclosed regions, linked only through actual full facets. Ctrl-click adds supports; Shift-click toggles a layer. Unknown, clipped and unbounded regions seed the exterior for conservative cavity filling.</p>`;
    const anchor=document.getElementById('stellation-controls');if(!anchor)throw Error('Cell diagrams need stellation controls.');anchor.after(panel);this.panel=panel;
    const guard=fn=>context.guard?context.guard(fn):fn;this.node('evaluate').onclick=guard(()=>this.evaluate());this.node('fill').onclick=guard(()=>this.apply('fill'));this.node('undo').onclick=guard(()=>this.moveHistory(-1));this.node('redo').onclick=guard(()=>this.moveHistory(1));this.node('export').onclick=guard(()=>this.export());this.sync();
  }
  node(key){return this.panel.querySelector('#stellation-cell-'+key);}
  verify(receipt=this.receipt){
    if(!receipt||this.context.isExporting?.())throw Error('Build a current cell diagram before editing selection.');verifyNativeSource(this.context,receipt.owner);
    if(this.context.getState().arrangement!==receipt.arrangement||binding(receipt.arrangement)!==receipt.signature)throw Error('Arrangement geometry or source planes changed. Build the cell diagram again.');
    if(receipt.domain!==undefined&&domain(this.context)!==receipt.domain)throw Error('Observation scale or source plane selection changed. Rebuild the arrangement and cell diagram.');
  }
  async evaluate(){
    if(this.busy)throw Error('Finish or cancel the current cell analysis.');const owner=captureNativeSource(this.context),arrangement=this.context.getState().arrangement;if(!arrangement)throw Error('Evaluate a facial-plane arrangement first.');
    const config=this.context.getConfig?.();if(config){const planes=config.planeIds??owner.state.model.faces.map((_,i)=>i);if(config.boxScale!==arrangement.parameters?.box_scale||!same(planes,arrangement.source?.faceIds))throw Error('Wait for the arrangement of the current observation scale and source planes.');}
    const job={owner,arrangement,signature:binding(arrangement),domain:domain(this.context),controller:new AbortController()};this.job=job;this.busy=true;this.receipt=null;this.node('diagram').replaceChildren();this.sync();
    const verify=()=>{if(this.job!==job||job.controller.signal.aborted)throw Object.assign(Error('Cell analysis canceled.'),{name:'AbortError'});this.verify(job);};
    try{
      verify();const graph=await this.context.run('stellation-cell-graph',{arrangement:structuredClone(arrangement)},JSON.parse(owner.modelSignature),'Build source cell diagram',{signal:job.controller.signal});verify();
      if(graph?.algorithmVersion!=='0.1.0'||graph.sourceId!==owner.state.model.id||graph.arrangementId!==arrangement.id||!Array.isArray(graph.nodes)||graph.nodes.length!==arrangement.regions.length||graph.nodes.length>2048||!Array.isArray(graph.links)||graph.links.length>100000||typeof graph.arrangementSha256!=='string')throw Error('Invalid native cell graph receipt.');
      this.receipt={...job,graph};this.render();return graph;
    }finally{if(this.job===job){this.job=null;this.busy=false;}this.sync();}
  }
  history(){
    const graph=this.receipt?.graph;if(!graph)return null;const value=this.context.getConfig().cellSelectionHistory;
    if(!graph||value?.version!==1||value.sourceFingerprint!==graph.sourceFingerprint||value.arrangementSha256!==graph.arrangementSha256||!Array.isArray(value.steps)||value.steps.length>32||!Number.isSafeInteger(value.cursor)||value.cursor<0||value.cursor>value.steps.length)return null;
    try{for(const step of value.steps){checkedIds(graph,step.before);checkedIds(graph,step.after);}}catch{return null;}return value;
  }
  publish(ids){this.context.getConfig().selectedRegions=ids;this.context.applySelection(ids);this.render();this.sync();}
  apply(action,regionId=null){
    this.verify();const graph=this.receipt.graph,config=this.context.getConfig(),before=selected(config),after=selectStellationCells(graph,before,action,regionId);if(same(before,after)){this.node('status').textContent=action==='fill'?'No provably inaccessible enclosed regions to fill.':'Selection unchanged.';return after;}
    let history=this.history();const previous=history?.steps[history.cursor-1];if(!history||previous&&!same(previous.after,before)||history.cursor===0&&history.steps.length&&!same(history.steps[0].before,before))history={version:1,sourceFingerprint:graph.sourceFingerprint,arrangementSha256:graph.arrangementSha256,steps:[],cursor:0};
    history=structuredClone(history);history.steps=history.steps.slice(0,history.cursor);history.steps.push({before,after,action,regionId});history.steps=history.steps.slice(-32);history.cursor=history.steps.length;config.cellSelectionHistory=history;this.publish(after);return after;
  }
  moveHistory(direction){
    this.verify();const history=this.history();if(!history||![1,-1].includes(direction))throw Error('No current source selection history.');const step=history.steps[direction===-1?history.cursor-1:history.cursor];if(!step)throw Error('Reached the selection history endpoint.');
    const current=selected(this.context.getConfig()),expected=direction===-1?step.after:step.before;if(!same(current,expected))throw Error('Selection changed outside this diagram. Make a new selection before undoing.');
    history.cursor+=direction;this.publish((direction===-1?step.before:step.after).slice());
  }
  render(){
    if(!this.receipt)return;const graph=this.receipt.graph,selection=new Set(selected(this.context.getConfig())),nodes=graph.nodes.filter(node=>node.selectable),layers=new Map();
    for(const node of nodes){if(!layers.has(node.outsidePlaneCount))layers.set(node.outsidePlaneCount,[]);layers.get(node.outsidePlaneCount).push(node);}
    const position=new Map(),columns=Math.min(12,Math.max(1,...[...layers.values()].map(row=>row.length))),width=columns*66+80;let height=40;
    for(const [layer,row]of [...layers].sort((a,b)=>b[0]-a[0])){for(let i=0;i<row.length;i++)position.set(row[i].id,[70+i%12*66,height+Math.floor(i/12)*64]);height+=Math.ceil(row.length/12)*64+30;}
    const svg=svgEl('svg',{xmlns:svgNS,viewBox:`0 0 ${width} ${height}`,width,height,role:'img','aria-label':'Individual source-region cell dependency diagram'});svg.style.background='#11202d';
    const metadata=svgEl('metadata');metadata.textContent=JSON.stringify({sourceId:graph.sourceId,sourceFingerprint:graph.sourceFingerprint,arrangementSha256:graph.arrangementSha256,domain:graph.domain,fillDefinition:graph.fillDefinition,numericMode:graph.numericMode,selectedRegionIds:[...selection]});svg.append(metadata);
    for(const [layer,row]of layers){const label=svgEl('text',{x:8,y:position.get(row[0].id)[1]+4,'font-size':10,fill:'#a8c1d0'});label.textContent='L'+layer;svg.append(label);}
    for(const link of graph.links){const [a,b]=link.regions;if(!position.has(a)||!position.has(b))continue;const p=position.get(a),q=position.get(b),line=svgEl('line',{x1:p[0],y1:p[1],x2:q[0],y2:q[1],stroke:'#698ba2','stroke-width':2});line.dataset.regions=link.regions.join(',');line.dataset.sourceFaces=link.sourceFaceIds.join(',');const title=svgEl('title');title.textContent=`R${a} / R${b}; source facial planes ${link.sourceFaceIds.join(', ')}`;line.append(title);svg.append(line);}
    for(const node of nodes){const [x,y]=position.get(node.id),group=svgEl('g',{role:'button',tabindex:0,'aria-pressed':selection.has(node.id),'aria-label':`Region ${node.id}, outside-plane layer ${node.outsidePlaneCount}`});group.dataset.region=node.id;group.style.cursor='pointer';
      const circle=svgEl('circle',{cx:x,cy:y,r:21,fill:selection.has(node.id)?'#3c9984':'#243f54',stroke:node.facetAdjacencyUnresolved?'#efbc62':selection.has(node.id)?'#ffffff':'#86a9bd','stroke-width':selection.has(node.id)?3:1.5}),title=svgEl('title');title.textContent=`R${node.id}; ${node.outsidePlaneCount} outside planes; supports ${node.supports.map(i=>'R'+i).join(', ')||'none'}${node.facetAdjacencyUnresolved?'; facet adjacency uncertain':''}`;circle.append(title);const text=svgEl('text',{x,y:y+4,'text-anchor':'middle','font-size':12,fill:'#e6f2f7','pointer-events':'none'});text.textContent='R'+node.id;group.append(circle,text);
      const click=event=>{event.preventDefault();if(this.busy)return;const action=event.ctrlKey?'supports':event.shiftKey?'layer':this.node('mode').value;return this.apply(action,node.id);};group.onclick=this.context.guard?this.context.guard(click):click;group.onkeydown=event=>{if(event.key==='Enter'||event.key===' ')group.onclick(event);};svg.append(group);
    }
    this.receipt.renderSelection=JSON.stringify([...selection]);this.svg=svg;this.node('diagram').replaceChildren(svg);this.node('status').textContent=`${nodes.length} enclosed regions; ${selection.size} selected; ${graph.exteriorSeedIds.length} exterior/uncertain seeds. ${graph.completeWithinObservedFacetDomain?'All observed internal facets matched.':'Unmatched facets remain uncertain and seed the exterior.'}`;
  }
  async export(){this.verify();if(!this.svg)throw Error('Build a cell diagram first.');this.render();const svg=new XMLSerializer().serializeToString(this.svg);this.verify();return this.context.saveSvg(svg,'Stellation cell diagram.svg');}
  cancel(){this.job?.controller.abort();}
  sync(){
    if(this.receipt){try{this.verify();}catch{this.receipt=null;this.svg=null;this.node('diagram').replaceChildren();this.node('status').textContent='Source or arrangement changed. Rebuild the cell diagram.';}}
    if(this.receipt&&this.receipt.renderSelection!==JSON.stringify(selected(this.context.getConfig())))this.render();
    const blocked=this.busy||this.context.isExporting?.();for(const node of this.panel.querySelectorAll('button,select'))node.disabled=Boolean(blocked)||(!this.receipt&&node!==this.node('evaluate'));const history=this.history();this.node('undo').disabled=Boolean(blocked)||!history||history.cursor===0;this.node('redo').disabled=Boolean(blocked)||!history||history.cursor===history.steps.length;
  }
}
