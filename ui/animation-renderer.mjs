import {contentParameters,contentSignature} from './element-content-lifecycle.mjs';
import {foldingPreparationSignature} from './generalized-fold-qualification.mjs';
/** Bridge qualified absolute animation poses to the actual linked viewers. */
import {resolveExplosion,explosionGeometry} from './explosion.mjs';
import {requireNoEnabledDualMorph} from './dual-morph-combinations.mjs';
export class AnimationRenderer {
  constructor(context){this.context=context;this.foldNet=null;this.restoreGeneration=0;}
  capabilities(){
    const {viewer,netViewer}=this.context;
    return {explosion:viewer?.supportsExplosion===true,
      fold:typeof netViewer?.setNet==='function'&&typeof netViewer?.setFold==='function'};
  }
  checkedState(model,options={}){
    const state=this.context.getState();
    if(options.signal?.aborted||options.isCurrent?.()===false||!state||
       state.model.id!==model.id||state.model.fingerprint!==model.fingerprint)
      throw new Error('Animation source changed during preparation.');
    return state;
  }
  async loadPlanes(model,options={}){
    this.checkedState(model,options);
    const result=await this.context.run('cell-facing',{},model,'Prepare explosion planes',{signal:options.signal});
    this.checkedState(model,options);return result;
  }
  async loadNet(model,options={}){
    const source=this.checkedState(model,options),settings=structuredClone(source.view.net||{}),signature=contentSignature(source),netSignature=JSON.stringify(source.view.net||{}),layoutSignature=foldingPreparationSignature(source),saved=source.netHistory?.sourceFingerprint===model.fingerprint?source.netHistory.states[source.netHistory.cursor]:null;
    const contentRestore=!source.netLayout&&saved?.root===(settings.root??0)&&saved.edge_length_mm===(settings.length??25)&&saved.tabs===(settings.tabs??true)&&JSON.stringify(saved.tab_options??null)===JSON.stringify(settings.tabOptions??null);
    const result=await this.context.run('net',{root:settings.root??0,
      edge_length_mm:settings.length??25,tabs:settings.tabs??true,...(settings.tabOptions?{tab_options:structuredClone(settings.tabOptions)}:{}),...(source.netLayout?.sourceFingerprint===model.fingerprint&&source.netLayout.root===(settings.root??0)?{hinges:structuredClone(source.netLayout.hinges),placements:structuredClone(source.netLayout.placements??[])}:contentRestore?{hinges:structuredClone(saved.hinges),placements:structuredClone(saved.placements??[])}:source.netSeparate?{hinges:[]}:{}),...contentParameters(source)},model,'Prepare folding track',{signal:options.signal});
    this.checkedState(model,options);if(contentSignature(source)!==signature||JSON.stringify(source.view.net||{})!==netSignature||foldingPreparationSignature(source)!==layoutSignature)throw Error('Animation source content, net settings or layout/history changed during folding preparation.');return result;
  }
  clearTracks(){this.restoreGeneration++;this.context.viewer.setExplosion?.(null);this.foldNet=null;}
  applyExplosion(geometry){
    const {viewer}=this.context;
    if(geometry?.amount>0&&(viewer.supportsExplosion!==true||typeof viewer.setExplosion!=='function'))
      throw new Error('Explosion renderer is unavailable.');
    const result=viewer.setExplosion?.(geometry||null);
    if(geometry?.amount>0&&(result?.supported!==true||result?.applied!==true||result?.diagnostic))
      throw new Error(result?.diagnostic||'Explosion presentation was not applied.');
    return result;
  }
  async restoreSavedExplosion(){
    const state=this.context.getState(),track=state?.view.animation?.tracks?.explosion;
    if(!track||!(state.view.explosionAmount>0))return;
    const model=state.model,view=structuredClone(state.view),signature=JSON.stringify(view),generation=++this.restoreGeneration;
    const isCurrent=()=>generation===this.restoreGeneration&&this.context.getState()===state&&state.model===model&&JSON.stringify(state.view)===signature;
    let resolved=resolveExplosion(model,{direction:track.direction,planeCache:view.cellFacingCache});
    if(!resolved.supported&&model.dimension===4&&track.direction==='normal'){
      const cache=await this.loadPlanes(structuredClone(model),{isCurrent});
      if(!isCurrent())return;
      resolved=resolveExplosion(model,{direction:track.direction,planeCache:cache});
    }
    if(!isCurrent())return;
    if(!resolved.supported)throw new Error(resolved.diagnostic);
    this.applyExplosion(explosionGeometry(resolved,view.explosionAmount));
    this.context.display();
    if(this.context.viewer.explosionDiagnostic)throw new Error(this.context.viewer.explosionDiagnostic);
    this.context.viewer.draw();
  }
  async renderTracks(pose,options={}){
    if(options.signal?.aborted||options.isCurrent?.()===false)throw new Error('Animation publication cancelled.');
    const {viewer,netViewer}=this.context,source=this.context.getState();
    requireNoEnabledDualMorph(source,'Animation presentation');
    requireNoEnabledDualMorph({view:pose.view},'Animation presentation');
    if(!source||source.model.id!==pose.source.modelId||source.model.fingerprint!==pose.source.fingerprint)
      throw new Error('Animation presentation belongs to another source.');
    this.applyExplosion(pose.baseExplosion);
    if(options.signal?.aborted||options.isCurrent?.()===false)throw new Error('Animation publication cancelled.');
    const previousOffset=source.view.sectionOffset;
    source.view=structuredClone(pose.view);
    this.context.display();
    if(pose.baseExplosion?.amount>0&&viewer.explosionDiagnostic)
      throw new Error(viewer.explosionDiagnostic);
    this.context.syncPose?.(source.view);
    if(pose.restoring){
      this.foldNet=null;
      await this.context.refreshDerived(options);
    }else if(pose.foldNet){
      if(this.foldNet!==pose.foldNet){
        netViewer.setNet(pose.foldNet);this.foldNet=pose.foldNet;
        if(source.view.derivedCamera)netViewer.restoreCamera(source.view.derivedCamera);
        else netViewer.fit();
      }
      netViewer.setFold(pose.frame.foldFraction);
      netViewer.setDisplay(source.view);
      this.context.showNet?.(pose);
    }else if(source.view.derivedMode==='section'&&previousOffset!==source.view.sectionOffset){
      await this.context.refreshSection(options);
    }
    if(options.signal?.aborted||options.isCurrent?.()===false)throw new Error('Animation publication cancelled.');
    viewer.draw();if(pose.foldNet||source.view.derivedMode==='section')netViewer.draw();
  }
}
