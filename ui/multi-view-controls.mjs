import {appearanceBackground} from './appearance-config.mjs';
import {resolveExplosion,explosionGeometry} from './explosion.mjs';
const copy=structuredClone,abort=()=>Object.assign(Error('Multiple views source or capture changed.'),{name:'AbortError'});
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const contentSignature=s=>JSON.stringify([s?.view?.elementAnnotations??null,s?.view?.elementContentDetached??null,s?.view?.elementContentTransfer??null]);
const cameraValid=c=>c&&['orthographic','perspective'].includes(c.projection)&&['position','target','up'].every(k=>Array.isArray(c[k])&&c[k].length===3&&c[k].every(Number.isFinite))&&Number.isFinite(c.zoom)&&c.zoom>0&&Number.isFinite(c.orthographicHalfHeight)&&c.orthographicHalfHeight>0;
export function multiViewSettings(value){
  if(value===undefined||value===null)return {version:1,count:4,cameras:[]};
  if(value.version!==1||!Number.isInteger(value.count)||value.count<1||value.count>6||!Array.isArray(value.cameras)||value.cameras.length>6||value.cameras.some(c=>c!==null&&!cameraValid(c)))throw Error('Saved multiple views need 1..6 views and finite independent cameras.');
  return {version:1,count:value.count,cameras:value.cameras.map(c=>c===null?null:copy(c))};
}
export function multiViewGrid(count){if(!Number.isInteger(count)||count<1||count>6)throw Error('Choose 1..6 source views.');const columns=count===1?1:count===2||count===4?2:3;return {columns,rows:Math.ceil(count/columns)};}
export class MultiViewControls{
  constructor(context){
    this.context=context;this.session=null;this.generation=0;this.busy=false;this.destroyed=false;
    const create=context.createElement??(tag=>document.createElement(tag));this.create=create;
    this.button=create('button');this.button.id='open-multiple-views';this.button.textContent='Multiple views';
    if(context.mount)context.mount(this.button);else(document.querySelector('.workspace-shelf')??document.body).append(this.button);
    this.dialog=create('dialog');this.dialog.id='multiple-views-dialog';
    this.dialog.innerHTML=`<style>
      #multiple-views-dialog{width:min(1180px,95vw);max-width:95vw;height:min(850px,90vh);max-height:90vh;padding:14px;box-sizing:border-box}
      #multiple-views-dialog .multi-toolbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px}
      #multiple-views-dialog .multi-toolbar h2{margin:0;flex:1}#multiple-views-dialog label{display:flex;gap:5px;align-items:center}
      #multiple-views-dialog select{width:auto}#multiple-views-grid{height:calc(100% - 110px);min-height:260px;display:grid;gap:9px}
      #multiple-views-dialog .multi-tile{display:flex;flex-direction:column;border:1px solid #46505d;border-radius:5px;min-width:0;min-height:0;overflow:hidden}
      #multiple-views-dialog .multi-tile[hidden]{display:none}#multiple-views-dialog .multi-tile-bar{display:flex;align-items:center;flex-wrap:wrap;gap:4px;padding:5px;background:#202733}
      #multiple-views-dialog .multi-tile-bar button,#multiple-views-dialog .multi-tile-bar select{font-size:11px;padding:4px;margin:0}
      #multiple-views-dialog .multi-canvas{flex:1;min-height:0;position:relative;overflow:hidden}#multiple-views-dialog canvas{width:100%;height:100%;display:block}
      #multiple-views-status{display:block;margin-top:8px}#multiple-views-dialog .multi-note{margin:6px 0;color:#aab4c4;font-size:12px}
    </style><div class="multi-toolbar"><h2>Multiple source views</h2><label>Views <select id="multiple-views-count">${[1,2,3,4,5,6].map(n=>`<option>${n}</option>`).join('')}</select></label><button id="multiple-views-export">Save grid PNG</button><button id="multiple-views-close">Close</button></div><div id="multiple-views-grid"></div><output id="multiple-views-status" aria-live="polite"></output><p class="multi-note">Drag each view to orbit; scroll to zoom. Pick a source element in any view. Cameras are saved with this document.</p>`;
    (context.host??document.body).append(this.dialog);
    const guard=fn=>context.guard?context.guard(fn):fn;
    this.button.onclick=guard(()=>this.open());this.node('multiple-views-close').onclick=()=>this.close();
    this.node('multiple-views-export').onclick=guard(()=>this.export());this.node('multiple-views-count').onchange=guard(()=>this.setCount(Number(this.node('multiple-views-count').value)));
    this.dialog.addEventListener('cancel',()=>this.close());this.dialog.addEventListener('close',()=>this.close());this.sync();
  }
  node(id){return this.dialog.querySelector('#'+id);}
  owner(){const state=this.context.getState(),source=this.context.getSource?.()??state?.model;if(!state?.view||!source)throw Error('Choose a source model.');return {state,source,project:this.context.getProject?.(),document:this.context.getDocument?.(),model:JSON.stringify(source),notes:state.notes??'',unit:state.view.coordinateUnit??source.metadata?.coordinateUnits??'model',content:contentSignature(state)};}
  verify(session=this.session){
    if(!session||this.destroyed||this.session!==session||session.controller.signal.aborted)throw abort();const now=this.owner();
    for(const key of ['state','source','project','document','model','notes','unit','content'])if(now[key]!==session.owner[key])throw abort();
    if(this.context.isExporting?.())throw Error('Finish animation export before using multiple views.');
  }
  current(session){try{this.verify(session);return true;}catch{return false;}}
  settings(session=this.session){return multiViewSettings(session.owner.state.view.multiViews);}
  writeSettings(settings,session=this.session){this.verify(session);session.owner.state.view.multiViews=copy(settings);this.context.markDirty?.();}
  async open(){
    if(this.destroyed)throw abort();if(this.session){this.verify();return;}
    if(this.context.isExporting?.())throw Error('Finish animation export before opening multiple views.');
    const owner=this.owner();if(owner.model.length>16*1024*1024)throw Error('Multiple views source snapshot exceeds 16 MiB.');
    if(owner.state.view.dualMorph?.enabled)throw Error('Multiple source views cannot reproduce an enabled dual morph. Disable the morph before opening the grid.');
    const settings=multiViewSettings(owner.state.view.multiViews),state={model:freeze(copy(owner.source)),view:copy(owner.state.view),notes:owner.state.notes??''};delete state.view.multiViews;
    // Independent cameras observe one fixed source presentation. Ordinary
    // workspace/tour layout and the base camera remain owned by the main view.
    state.view.viewportLayout='single';state.view.stereoMode='none';delete state.view.camera;delete state.view.derivedCamera;
    const session={owner,state,settings,controller:new AbortController(),generation:++this.generation,views:[],maximized:null,descriptorPromise:null,preparing:true};this.session=session;
    try{
      this.node('multiple-views-count').value=String(settings.count);this.dialog.showModal();
      await this.rebuild(settings.count,session);this.verify(session);session.preparing=false;this.status(`${settings.count} independent source views.`);this.sync();this.animate(session);
    }catch(error){this.close();throw error;}
  }
  async prepareContent(viewer,session){
    const options={signal:session.controller.signal,isCurrent:()=>this.current(session)};
    if(this.context.prepareContent){await this.context.prepareContent(viewer,session.state,options);this.verify(session);return;}
    if(!session.state.view.elementAnnotations?.entries?.length)return;
    if(typeof this.context.describeContent!=='function'||typeof viewer.setElementContent!=='function')throw Error('Requested annotations need a source content renderer in multiple views.');
    session.descriptorPromise??=Promise.resolve(this.context.describeContent(session.state.model,{document:copy(session.state.view.elementAnnotations),reference_edge_mm:25},options));
    const descriptor=await session.descriptorPromise;this.verify(session);await viewer.setElementContent(descriptor,{...options,sourceModel:session.state.model});this.verify(session);
  }
  disposeView(record){record.viewer.onCamera=null;record.viewer.clear?.();record.viewer.observer?.disconnect();record.viewer.controls?.dispose();record.viewer.renderer?.dispose();record.viewer.renderer?.forceContextLoss?.();this.context.releaseViewer?.(record.viewer);record.tile.remove();}
  async rebuild(count,session=this.session){
    this.verify(session);const settings=this.settings(session);settings.count=count;this.writeSettings(settings,session);session.settings=settings;session.maximized=null;
    for(const record of session.views)this.disposeView(record);session.views=[];this.node('multiple-views-grid').replaceChildren();
    const {columns}=multiViewGrid(count);this.node('multiple-views-grid').style.gridTemplateColumns=`repeat(${columns},minmax(0,1fr))`;
    const directions=['isometric','x','y','z','-x','-z'];
    for(let slot=0;slot<count;slot++){
      const tile=this.create('section');tile.className='multi-tile';tile.dataset.slot=String(slot);
      const bar=this.create('div');bar.className='multi-tile-bar';const name=this.create('span');name.textContent=`View ${slot+1}`;
      const direction=this.create('select');direction.setAttribute('aria-label',`View ${slot+1} direction`);
      for(const [id,text] of [['free','Free'],['isometric','Isometric'],['x','+X'],['-x','−X'],['y','+Y'],['-y','−Y'],['z','+Z'],['-z','−Z']]){const o=this.create('option');o.value=id;o.textContent=text;direction.append(o);}
      const projection=this.create('select');projection.setAttribute('aria-label',`View ${slot+1} camera`);for(const value of ['orthographic','perspective']){const o=this.create('option');o.value=value;o.textContent=value==='orthographic'?'Parallel':'Perspective';projection.append(o);}
      const fit=this.create('button');fit.textContent='Fit';const maximize=this.create('button');maximize.textContent='Maximize';bar.append(name,direction,projection,fit,maximize);
      const container=this.create('div');container.className='multi-canvas';tile.append(bar,container);this.node('multiple-views-grid').append(tile);
      const onPick=(index,candidates,kind='vertex')=>{if(!this.current(session)||this.busy)return;const source=session.state.model,field={vertex:'vertices',edge:'edges',face:'faces',cell:'cells'}[kind];if(!field||!Number.isInteger(index)||index<0||index>=source[field].length)return;const ids=kind==='vertex'?[index]:kind==='cell'?[...new Set(source.cells[index].flatMap(face=>source.faces[face]))]:source[field][index];for(const record of session.views)record.viewer.select?.(ids);this.context.onSelect?.(index,candidates,kind,slot);};
      const viewer=this.context.createViewer?this.context.createViewer(container,onPick):new this.context.Viewer(container,onPick);
      const view=copy(session.state.view);if(settings.cameras[slot])view.cameraProjection=settings.cameras[slot].projection;
      const record={slot,tile,bar,container,direction,projection,fit,maximize,viewer,view};session.views.push(record);viewer.setModel(session.state.model);viewer.setDisplay(view);
      if((view.explosionAmount??0)>0){const resolved=resolveExplosion(session.state.model,{direction:view.explosionDirection??'normal',planeCache:view.cellFacingCache});if(!resolved.supported)throw Error(resolved.diagnostic);const receipt=viewer.setExplosion(explosionGeometry(resolved,view.explosionAmount));if(!receipt.applied)throw Error(receipt.diagnostic||'Source explosion is unavailable in multiple views.');viewer.setDisplay(view);}
      viewer.resize?.();if(settings.cameras[slot])viewer.restoreCamera(settings.cameras[slot]);else this.snap(record,directions[slot],false);
      projection.value=viewer.cameraState().projection;direction.value=settings.cameras[slot]?'free':directions[slot];
      viewer.onCamera=()=>{if(!this.busy&&this.current(session)){direction.value='free';this.persistCameras(session);}};
      const guard=fn=>this.context.guard?this.context.guard(fn):fn;
      fit.onclick=guard(()=>{this.verify(session);viewer.fit();this.persistCameras(session);});
      direction.onchange=guard(()=>{this.verify(session);if(direction.value!=='free')this.snap(record,direction.value);});
      projection.onchange=guard(()=>{this.verify(session);viewer.setCameraProjection(projection.value);record.view.cameraProjection=projection.value;viewer.setDisplay(record.view);this.persistCameras(session);});
      maximize.onclick=()=>this.maximize(slot);viewer.draw();
    }
    this.persistCameras(session);await Promise.all(session.views.map(record=>this.prepareContent(record.viewer,session)));this.verify(session);
  }
  snap(record,direction,persist=true){
    const negative=direction.startsWith('-');record.viewer.snap(negative?direction.slice(1):direction);
    if(negative){const c=record.viewer.cameraState();c.position=c.position.map((x,k)=>2*c.target[k]-x);record.viewer.restoreCamera(c);}
    if(persist)this.persistCameras();
  }
  persistCameras(session=this.session){this.verify(session);const settings=this.settings(session);for(const record of session.views)settings.cameras[record.slot]=copy(record.viewer.cameraState());this.writeSettings(settings,session);session.settings=settings;}
  async setCount(count){if(this.busy||this.session?.preparing)throw Error('Finish the current multiple-view action.');multiViewGrid(count);const session=this.session;this.verify(session);session.preparing=true;this.sync();try{await this.rebuild(count,session);this.status(`${count} independent source views.`);}catch(error){this.close();throw error;}finally{session.preparing=false;this.sync();}}
  applyLayout(session,slot){session.maximized=slot;for(const record of session.views){record.tile.hidden=session.maximized!==null&&record.slot!==session.maximized;record.maximize.textContent=record.slot===session.maximized?'Restore grid':'Maximize';record.tile.style.gridColumn=session.maximized===record.slot?'1 / -1':'';}for(const record of session.views)record.viewer.resize?.();}
  maximize(slot){if(this.busy||!this.session)return;const session=this.session;this.verify(session);this.applyLayout(session,session.maximized===slot?null:slot);}
  animate(session){
    const tick=()=>{if(this.session!==session||session.controller.signal.aborted)return;const now=this.context.getState(),source=this.context.getSource?.()??now?.model;if(now!==session.owner.state||source!==session.owner.source||this.context.getProject?.()!==session.owner.project){this.close();return;}
      try{for(const record of session.views)if(!record.tile.hidden)record.viewer.draw();
        if(!this.busy&&!session.preparing){const settings=this.settings(session),cameras=session.views.map(r=>r.viewer.cameraState());if(JSON.stringify(cameras)!==JSON.stringify(settings.cameras.slice(0,session.views.length))){cameras.forEach((camera,i)=>settings.cameras[i]=copy(camera));session.owner.state.view.multiViews=settings;session.cameraDirty=true;}if(session.cameraDirty&&Date.now()-(session.lastCameraSave??0)>250){session.cameraDirty=false;session.lastCameraSave=Date.now();this.context.markDirty?.();}}}catch(error){this.status(error.message);this.close();return;}session.raf=(this.context.requestFrame??requestAnimationFrame)(tick);};session.raf=(this.context.requestFrame??requestAnimationFrame)(tick);
  }
  status(text){this.node('multiple-views-status').textContent=text;this.context.setStatus?.(text);}
  async export(){
    if(this.busy||this.session?.preparing)throw Error('Finish preparation before saving the multiple-view grid.');const session=this.session;this.verify(session);this.busy=true;this.sync();
    const views=session.views,maximized=session.maximized,enabled=views.map(r=>r.viewer.controls?.enabled),damping=views.map(r=>r.viewer.controls?.enableDamping);
    try{for(const record of views)if(record.viewer.controls){record.viewer.controls.enabled=false;record.viewer.controls.enableDamping=false;record.viewer.draw();}
    this.applyLayout(session,null);this.persistCameras(session);
    const signature=()=>JSON.stringify([this.settings(session),session.maximized,views.map(r=>[r.viewer.cameraState(),r.view,r.container.getBoundingClientRect().width,r.container.getBoundingClientRect().height])]),expected=signature();
    const check=()=>{this.verify(session);if(this.session.views!==views||signature()!==expected)throw abort();};
      this.status('Preparing all source views for PNG…');for(const record of views){await this.prepareContent(record.viewer,session);check();await record.viewer.prepareCapture({signal:session.controller.signal,isCurrent:()=>{try{check();return true;}catch{return false;}}});check();record.viewer.draw();}
      // Export the entire saved grid, even when one tile is maximized locally.
      const {columns,rows}=multiViewGrid(views.length),width=Math.max(...views.map(r=>r.viewer.renderer.domElement.width)),height=Math.max(...views.map(r=>r.viewer.renderer.domElement.height));
      if(!width||!height||width*columns*height*rows>32000000)throw Error('Multiple-view PNG exceeds the 32 million pixel capture bound.');
      const canvas=this.context.makeCanvas?.()??this.create('canvas');canvas.width=width*columns;canvas.height=height*rows;const ctx=canvas.getContext('2d');if(!ctx)throw Error('PNG grid canvas is unavailable.');ctx.fillStyle=appearanceBackground(session.state.view);ctx.fillRect(0,0,canvas.width,canvas.height);
      views.forEach((record,i)=>ctx.drawImage(record.viewer.renderer.domElement,(i%columns)*width,Math.floor(i/columns)*height,width,height));check();
      const image=canvas.toDataURL('image/png');check();const result=await this.context.saveImage(image);check();if(result)this.status('Saved multiple-view grid '+(result.path??''));return result;
    }finally{if(this.session===session){this.applyLayout(session,maximized);for(let i=0;i<views.length;i++)if(views[i].viewer.controls){views[i].viewer.controls.enabled=enabled[i];views[i].viewer.controls.enableDamping=damping[i];}this.busy=false;this.sync();}}
  }
  close(){const session=this.session;if(!session)return;this.session=null;session.controller.abort();(this.context.cancelFrame??cancelAnimationFrame)(session.raf);for(const record of session.views)this.disposeView(record);this.node('multiple-views-grid').replaceChildren();if(this.dialog.open)this.dialog.close();this.busy=false;this.sync();}
  sync(){if(this.session&&!this.current(this.session)){this.close();return;}this.button.disabled=this.destroyed||!this.context.getState()?.model||Boolean(this.context.isExporting?.());if(this.session){const blocked=this.busy||this.session.preparing;for(const node of this.dialog.querySelectorAll('button,select'))node.disabled=blocked;this.node('multiple-views-close').disabled=false;}}
  destroy(){if(this.destroyed)return;this.close();this.destroyed=true;this.button.remove();this.dialog.remove();}
}
