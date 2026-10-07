import {NumericEntry} from './numeric-entry.mjs';
const svgNS='http://www.w3.org/2000/svg';
const svgEl=(name,attrs)=>{const el=document.createElementNS(svgNS,name);for(const [key,value] of Object.entries(attrs))el.setAttribute(key,String(value));return el;};
const defaults=()=>({boxScale:3,planeIds:null,selectedRegions:null,diagramPlane:0,display:'solid',searchSymmetry:'geometric',searchGeneratorIds:'',searchIncludeSeed:true,searchConnected:true});

export class StellationControls{
  constructor(context){
    const {getState,getModel,run,number,rawNumbers,guard,markDirty,refresh,api,setStatus}=context;this.context=context;
    Object.assign(this,{getState,getModel,run,number,rawNumbers,guard,markDirty,refresh,api,setStatus});
    this.sequence=0;this.searchSequence=0;this.root=document.createElement('div');this.root.id='stellation-controls';
    this.root.innerHTML='<div class="panel-title">3D STELLATION / PLANE REGIONS</div><label>Observation scale <input id="stellation-scale" value="3"></label><label>Facial planes <input id="stellation-faces" placeholder="All, or face IDs"></label><button id="stellation-evaluate" class="wide accent">Evaluate facial-plane arrangement</button><label>View <select id="stellation-display"><option value="solid">Selected solid</option><option value="diagram">Facial-plane diagram</option></select></label><label>Diagram plane <input id="stellation-plane" type="number" min="0" value="0"></label><div id="stellation-summary" class="muted">Choose a convex 3D seed. Regions are computed inside a finite observation box.</div><button id="stellation-all-bounded" class="wide">Select all enclosed regions</button><button id="stellation-seed" class="wide">Select original seed region</button><div id="stellation-regions"></div><button id="stellation-export-diagram" class="wide">Export current diagram SVG</button><p class="muted">Enclosed regions can form a closed solid. Unbounded or clipped regions remain visible in the diagram. Box completion does not establish unrestricted stellation enumeration.</p><div class="rule"></div>';
    document.getElementById('construct-panel').prepend(this.root);
    this.$=id=>document.getElementById(id);
    const search=document.createElement('div');search.innerHTML='<div class="rule"></div><div class="panel-title">FINITE REGION-UNION SEARCH</div><label>Symmetry <select id="stellation-symmetry"><option value="geometric">Geometric source symmetries</option><option value="geometric-proper">Proper rotational subgroup</option><option value="signed-axis">Verified signed-axis subgroup</option><option value="none">No symmetry constraint</option></select></label><label>Source generator IDs <input id="stellation-generator-ids" placeholder="Optional IDs; identity for trivial group"></label><label><input id="stellation-include-seed" type="checkbox" checked> Include original seed</label><label><input id="stellation-connected" type="checkbox" checked> Connected through full facets</label><button id="stellation-enumerate" class="wide">Enumerate qualifying unions</button><div id="stellation-search-status" class="muted"></div><label>Candidate <select id="stellation-candidate"></select></label><button id="stellation-use-candidate" class="wide">Display selected candidate</button><p class="muted">These are explicit region-union criteria. Complete means this finite orbit-subset search finished; benchmark stellation criteria require further conformance work.</p>';
    this.root.insertBefore(search,this.root.querySelector('p'));for(const id of ['stellation-symmetry','stellation-generator-ids','stellation-include-seed','stellation-connected'])this.$(id).onchange=()=>{this.saveSearch();this.searchSequence++;this.getState().stellationSearch=null;this.renderSearch(null);markDirty();};
    this.$('stellation-evaluate').onclick=guard(()=>this.editScale());
    this.$('stellation-display').onchange=()=>{this.config().display=this.$('stellation-display').value;markDirty();refresh();};
    this.$('stellation-plane').onchange=()=>{this.config().diagramPlane=Number(this.$('stellation-plane').value);markDirty();refresh();};
    this.$('stellation-all-bounded').onclick=guard(()=>{const a=getState().arrangement;if(!a)throw new Error('Evaluate an arrangement first.');this.config().selectedRegions=a.regions.filter(this.selectable).map(r=>r.id);markDirty();refresh();});
    this.$('stellation-seed').onclick=guard(()=>{const a=getState().arrangement;if(!a)throw new Error('Evaluate an arrangement first.');this.config().selectedRegions=a.regions.filter(r=>r.exteriorPlaneCount===0&&this.selectable(r)).map(r=>r.id);markDirty();refresh();});
    this.$('stellation-export-diagram').onclick=guard(async()=>{if(!this.svg)throw new Error('Choose the facial-plane diagram view first.');const result=await api.saveSvg(this.svg,'Stellation diagram.svg');if(result)setStatus('Exported '+result.path);});
    this.$('stellation-enumerate').onclick=guard(async()=>{
      const s=getState(),a=s.arrangement;if(!a)throw new Error('Evaluate a facial-plane arrangement first.');
      this.saveSearch();const sequence=++this.searchSequence,c=this.config(),mode=c.searchSymmetry,params={arrangement:a,symmetry:mode==='geometric-proper'?'geometric':mode,include_seed:c.searchIncludeSeed,connected:c.searchConnected};if(params.symmetry==='geometric'){const options={orientation:mode==='geometric-proper'?'proper':'all'},ids=c.searchGeneratorIds.trim();if(ids)options.generator_ids=ids==='identity'?[]:rawNumbers(ids);params.symmetry_options=options;}else if(c.searchGeneratorIds.trim())throw new Error('Generator IDs require geometric source symmetry.');
      const result=await run('stellation-enumerate',params,getModel(),'Enumerate finite region unions');
      if(getState()!==s||s.arrangement!==a||this.searchSequence!==sequence)return;s.stellationSearch=result;markDirty();this.renderSearch(result);
    });
    this.$('stellation-use-candidate').onclick=guard(()=>{const result=getState().stellationSearch,index=Number(this.$('stellation-candidate').value);if(!result?.candidates[index])throw new Error('Choose an enumerated candidate.');this.config().selectedRegions=result.candidates[index].regionIds;this.config().display='solid';this.$('stellation-display').value='solid';getState().view.derivedMode='stellation';this.$('derived-mode').value='stellation';markDirty();refresh();});
  }
  config(s=this.getState()){return s.view.stellation ||= defaults();}
  scaleTarget(){return {scale:this.$('stellation-scale').value,faces:this.$('stellation-faces').value,
    config:this.getState().view.stellation??null,derivedMode:this.getState().view.derivedMode??null};}
  async editScale(){
    if(this.numericEntry?.busy)throw Error('Finish or cancel the current observation-scale edit first.');
    const text=this.$('stellation-faces').value.trim(),planeIds=text?this.rawNumbers(text):null;
    if(planeIds&&(planeIds.some(id=>!Number.isSafeInteger(id)||id<0||id>=this.getState().model.faces.length)||new Set(planeIds).size!==planeIds.length))throw Error('Facial plane IDs must be distinct literal existing face indices.');
    const entry=new NumericEntry({...this.context,getTarget:()=>this.scaleTarget()});this.numericEntry=entry;
    try{return await entry.run({boxScale:{text:this.$('stellation-scale').value,min:1.01,max:100}},({boxScale},verify)=>{
      verify();const s=this.getState();Object.assign(this.config(s),{boxScale,planeIds,selectedRegions:null});
      s.view.derivedMode='stellation';this.$('stellation-scale').value=String(boxScale);this.$('derived-mode').value='stellation';this.markDirty();this.refresh();return boxScale;
    });}finally{if(this.numericEntry===entry)this.numericEntry=null;}
  }
  cancelNumeric(){this.numericEntry?.cancel();this.sequence++;this.searchSequence++;}
  saveSearch(){const c=this.config();c.searchSymmetry=this.$('stellation-symmetry').value;c.searchGeneratorIds=this.$('stellation-generator-ids').value;c.searchIncludeSeed=this.$('stellation-include-seed').checked;c.searchConnected=this.$('stellation-connected').checked;}
  selectable(r){return r.boundedness==='bounded-numerical'&&!r.touchesObservationBox;}
  sync(){
    this.sequence++;this.searchSequence++;
    const s=this.getState();if(!s)return;const c=this.config(s);
    this.$('stellation-scale').value=c.boxScale;this.$('stellation-faces').value=c.planeIds?.join(', ')||'';this.$('stellation-display').value=c.display;this.$('stellation-plane').value=c.diagramPlane;
    this.$('stellation-symmetry').value=c.searchSymmetry??'geometric';this.$('stellation-generator-ids').value=c.searchGeneratorIds??'';this.$('stellation-include-seed').checked=c.searchIncludeSeed??true;this.$('stellation-connected').checked=c.searchConnected??true;
    this.svg=null;if(s.arrangement)this.renderRegions(s.arrangement,c);else{this.$('stellation-regions').replaceChildren();this.$('stellation-summary').textContent='Choose a convex 3D seed. Regions are computed inside a finite observation box.';}
    this.renderSearch(s.stellationSearch);
  }
  toggle(id){const c=this.config();const ids=new Set(c.selectedRegions||[]);ids.has(id)?ids.delete(id):ids.add(id);c.selectedRegions=[...ids].sort((a,b)=>a-b);this.markDirty();this.refresh();}
  renderRegions(a,c){
    const bounded=a.regions.filter(this.selectable);
    this.$('stellation-summary').textContent=`${a.regions.length} observed regions · ${bounded.length} enclosed · ${c.selectedRegions?.length||0} selected. Complete inside this box; unrestricted search remains open.`;
    this.$('stellation-plane').max=a.planes.length-1;const list=this.$('stellation-regions');list.replaceChildren();
    for(const region of [...a.regions].sort((x,y)=>Number(this.selectable(y))-Number(this.selectable(x))||x.id-y.id)){
      const label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.dataset.region=region.id;check.checked=c.selectedRegions?.includes(region.id)||false;check.disabled=!this.selectable(region);check.onchange=()=>this.toggle(region.id);
      const text=document.createElement('span');text.textContent=`R${region.id} · ${this.selectable(region)?'enclosed':region.boundedness==='unbounded-numerical'?'unbounded':region.touchesObservationBox?'box-clipped':'unresolved'} · ${region.exteriorPlaneCount} outside planes`;
      label.append(check,text);list.append(label);
    }
  }
  renderSearch(result){
    const select=this.$('stellation-candidate');select.replaceChildren();
    if(!result){this.$('stellation-search-status').textContent='No finite search evaluated for this source.';return;}
    this.$('stellation-search-status').textContent=`${result.candidates.length} candidates · ${result.subsetsEvaluated}/${result.totalOrbitSubsets} subsets · ${result.completeWithinDeclaredCriteria?'complete for these criteria':'stopped at result limit'} · acting group order ${result.group.actingOrder}${result.group.fullSourceGroupVerified?' (full numerical source group)':result.group.preservesAllSourceActions===false?' (box domain restricts the group; enlarge observation scale)':' (selected subgroup)'}`;
    result.candidates.forEach((candidate,index)=>{const option=document.createElement('option');option.value=index;option.textContent=`${index+1}: ${candidate.regionCount} regions · volume ${Number(candidate.volume.toPrecision(6))}`;select.append(option);});
  }
  async evaluate(m,s){
    const sequence=++this.sequence,c=structuredClone(this.config(s)),params={box_scale:c.boxScale,plane_ids:c.planeIds,diagram_plane:c.diagramPlane};
    const stale=()=>this.sequence!==sequence||this.getState()!==s;
    const key=JSON.stringify([m.fingerprint,c.boxScale,c.planeIds]);let a=s.arrangement;
    if(!a||s.arrangementKey!==key){a=await this.run('arrangement',params,m,'Evaluate facial-plane regions');if(stale())return {model:null,stale:true};s.arrangement=a;s.arrangementKey=key;s.stellationSearch=null;this.searchSequence++;this.renderSearch(null);this.markDirty();}
    if(c.selectedRegions===null){c.selectedRegions=a.regions.filter(r=>r.exteriorPlaneCount===0&&this.selectable(r)).map(r=>r.id);this.config(s).selectedRegions=c.selectedRegions;}
    if(c.diagramPlane!==a.diagram.plane){const diagram=await this.run('arrangement-diagram',{arrangement:a,plane:c.diagramPlane},null,'Evaluate facial-plane diagram');if(stale())return {model:null,stale:true};a.diagram=diagram;}
    let resultModel=null;
    if(c.selectedRegions.length)resultModel=await this.run('stellation-union',{arrangement:a,region_ids:c.selectedRegions},m,'Construct selected region union');
    if(stale())return {model:resultModel,stale:true};
    this.renderRegions(a,c);
    if(c.display==='diagram'){const svg=this.drawDiagram(a,c);this.svg=new XMLSerializer().serializeToString(svg);return {model:resultModel,diagram:svg,status:`Facial plane ${a.diagram.sourceFace} · click a region to change the selected solid`};}
    this.svg=null;return {model:resultModel,status:resultModel?`${c.selectedRegions.length} regions · volume ${Number(resultModel.measure.content.toPrecision(7))} u³`:'No enclosed regions selected'};
  }
  drawDiagram(a,c){
    const polygons=a.diagram.polygons;const p=polygons.flatMap(r=>r.points),low=[Math.min(...p.map(v=>v[0])),Math.min(...p.map(v=>v[1]))],high=[Math.max(...p.map(v=>v[0])),Math.max(...p.map(v=>v[1]))];
    const span=Math.max(high[0]-low[0],high[1]-low[1]),margin=span*.035;
    const svg=svgEl('svg',{xmlns:svgNS,viewBox:`${low[0]-margin} ${low[1]-margin} ${high[0]-low[0]+margin*2} ${high[1]-low[1]+margin*2}`});
    const meta=svgEl('metadata',{});meta.textContent=`Facial-plane arrangement diagram, source ${a.source.name}, face ${a.diagram.sourceFace}; finite observation box; ${a.numericMode}.`;svg.append(meta);
    for(const region of polygons){
      const selected=region.regionIds.some(id=>c.selectedRegions.includes(id));
      const polygon=svgEl('polygon',{points:region.points.map(p=>p.join(',')).join(' '),fill:selected?'#57a694':'#1b3343',stroke:'#83b0b8','stroke-width':span*.0015});
      polygon.dataset.regions=region.regionIds.join(',');polygon.style.cursor='pointer';
      const title=svgEl('title',{});title.textContent='Incident regions '+region.regionIds.map(id=>'R'+id).join(', ');polygon.append(title);
      polygon.onclick=()=>{const choices=region.regionIds.map(id=>a.regions[id]).filter(this.selectable).sort((x,y)=>y.exteriorPlaneCount-x.exteriorPlaneCount);if(choices.length)this.toggle(choices[0].id);};svg.append(polygon);
      const center=region.points.reduce((sum,p)=>[sum[0]+p[0]/region.points.length,sum[1]+p[1]/region.points.length],[0,0]);
      const text=svgEl('text',{x:center[0],y:center[1],'text-anchor':'middle','dominant-baseline':'middle','font-size':span*.014,fill:'#d5ede7','pointer-events':'none'});text.textContent=region.regionIds.map(id=>'R'+id).join('/');svg.append(text);
    }
    return svg;
  }
}
