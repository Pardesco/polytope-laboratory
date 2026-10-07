/** Independent live viewers for saved tour events. Preview state belongs to
 * the renderer; native results never replace the user's active document. */
import {attachElementContentCapture,contentParameters,contentSignature} from './element-content-lifecycle.mjs';
import {Viewer} from './viewer.js';
import {hasSectionSourceContent,rememberSectionSource,hasEmptySectionSource} from './section-source-content.mjs';
const abort=()=>Object.assign(Error('Tour layer preparation cancelled.'),{name:'AbortError'});

export function createAnimatedTourLayerFactory({host,run,ViewerClass=Viewer,createElement=tag=>document.createElement(tag)}){
  if(!host||typeof run!=='function')throw Error('Tour layers require a preview host and native dispatcher.');
  return ({slot,getState,width,height,isCurrent})=>{
    const owner=createElement('div');owner.dataset.tourSlot=String(slot);
    Object.assign(owner.style,{position:'fixed',left:'-20000px',top:'0',pointerEvents:'none'});
    const containers=[createElement('div'),createElement('div')];owner.append(...containers);host.append(owner);
    for(const container of containers)Object.assign(container.style,{width:width+'px',height:height+'px'});
    const viewers=[];
    const dispose=()=>{for(const viewer of viewers){viewer.clear();viewer.observer?.disconnect();viewer.controls?.dispose();viewer.renderer.dispose();viewer.renderer.forceContextLoss?.();}owner.remove();};
    try{viewers.push(new ViewerClass(containers[0]));viewers.push(new ViewerClass(containers[1]));}
    catch(error){dispose();throw error;}
    const [viewer,netViewer]=viewers;let sequence=0,closed=false;
    const detach=viewers.map(v=>attachElementContentCapture(v,{getState,isCurrent:()=>!closed&&isCurrent?.()!==false,
      canMap:()=>v===viewer||Boolean(v.net||v.cellNet)||hasSectionSourceContent(v.model)||hasEmptySectionSource(v),referenceEdgeMm:()=>v.net?.referenceEdgeLengthMm??25,
      describe:(model,params,options)=>run('element-content-describe',params,model,'Prepare tour element content',options)}));
    const check=(state,options)=>{if(closed||options.signal?.aborted||options.isCurrent?.()===false||isCurrent?.()===false||getState()!==state)throw abort();};
    const prepareLayout=view=>{const paneWidth=width/(view.viewportLayout==='split'?2:1);
      for(let index=0;index<viewers.length;index++){containers[index].style.width=paneWidth+'px';viewers[index].resize();}};
    const derivedView=view=>({angles:Array(6).fill(0),projection:'orthographic',cameraProjection:view.cameraProjection,
      faces:view.faces!==false,vertices:view.vertices,edges:view.edges,fillRule:view.fillRule||'nonzero',surfaceOpacity:view.surfaceOpacity,surfaceColors:view.surfaceColors,appearance:view.appearance,materialEffects:view.materialEffects});
    const refreshDerived=async(options={})=>{
      const state=getState();check(state,options);const token=++sequence,m=state.model,v=state.view,mode=v.derivedMode||'section',signature=contentSignature(state),netSignature=JSON.stringify(v.net||{});
      const call=(op,params)=>run(op,params,m,'Tour '+mode,options);let result;
      if(mode==='net'){
        if(v.net?.display==='pages')throw Error('Saved tour paper-page layouts require a separate SVG tour adapter.');
        const settings=v.net||{},cache=state.netLayout;
        result=cache?.sourceFingerprint===m.fingerprint&&cache.root===(settings.root??0)&&cache.referenceEdgeLengthMm===(settings.length??25)&&cache.tabs===(settings.tabs??true)&&JSON.stringify(cache.tabOptions??null)===JSON.stringify(settings.tabOptions??null)&&JSON.stringify(cache.elementAnnotations??null)===JSON.stringify(v.elementAnnotations??null)
          ?structuredClone(cache):await call('net',{root:settings.root??0,edge_length_mm:settings.length??25,tabs:settings.tabs??true,...(settings.tabOptions?{tab_options:structuredClone(settings.tabOptions)}:{}),...(cache?.sourceFingerprint===m.fingerprint&&cache.root===(settings.root??0)?{hinges:structuredClone(cache.hinges),placements:structuredClone(cache.placements??[])}:state.netSeparate?{hinges:[]}:{}),...contentParameters(state)});
      }else if(mode==='cell-net'){
        const settings=v.cellNet||{},cache=state.cellNetLayout;
        result=cache?.sourceFingerprint===m.fingerprint&&cache.root===(settings.root??0)?structuredClone(cache):await call('cell-net',{root:settings.root??0,...state.cellNetSeparate?{connections:[]}: {}});
      }else if(mode==='section')result=await call('section',{normal:v.sectionNormal,offset:v.sectionOffset??0,fill_rule:v.fillRule||'nonzero'});
      else if(mode==='cell-section'){
        const plane=JSON.stringify([v.sectionNormal,v.sectionOffset??0,v.fillRule||'nonzero']);
        result=await call('section',{normal:structuredClone(v.sectionNormal),offset:v.sectionOffset??0,fill_rule:v.fillRule||'nonzero',section_domain:'ordinary-cells'});
        const live=getState()?.view;if(JSON.stringify([live?.sectionNormal,live?.sectionOffset??0,live?.fillRule||'nonzero'])!==plane)throw abort();
      }
      else if(mode==='dual'||mode==='incidence-dual')result={model:await call(mode,{})};
      else if(mode==='vertex-figure')result=await call(mode,{vertex:v.entity??0});
      else if(mode==='cell'||mode==='face')result={model:await call('cell',{kind:mode==='face'||m.dimension!==4?'face':'cell',index:v.entity??0})};
      else throw Error('Saved tour derived mode '+mode+' requires a live renderer adapter.');
      check(state,options);if(token!==sequence||contentSignature(state)!==signature||mode==='net'&&JSON.stringify(v.net||{})!==netSignature)throw abort();prepareLayout(v);
      if(mode==='net'){netViewer.setNet(result);netViewer.setFold(v.net?.fraction??0);netViewer.setDisplay(derivedView(v));}
      else if(mode==='cell-net'){netViewer.setCellNet(result,v.cellNet?.shrink??1);netViewer.setDisplay(derivedView(v));}
      else{netViewer.setModel(result.model??null);rememberSectionSource(netViewer,result,m);if(result.model)netViewer.setDisplay(derivedView(v));}
      if(v.derivedCamera)netViewer.restoreCamera(v.derivedCamera);else netViewer.fit();
      if(mode==='cell-section'&&(result.model||hasEmptySectionSource(netViewer)))await netViewer.prepareCapture({...options,isCurrent:()=>token===sequence&&!closed&&getState()===state&&contentSignature(state)===signature&&options.isCurrent?.()!==false});
      check(state,options);netViewer.draw();return result;
    };
    return {viewer,netViewer,run,prepareLayout,refreshDerived,refreshSection:refreshDerived,
      dispose:()=>{if(closed)return;closed=true;sequence++;for(const remove of detach)remove();dispose();}};
  };
}
