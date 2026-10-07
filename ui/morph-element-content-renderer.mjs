/** Prepare complete content offscreen before publishing a new morph pose. */
import * as THREE from 'three';
import {contentSignature} from './element-content-lifecycle.mjs';
import {portableContentSource} from './element-content-source.mjs';
import {planMorphElementContent} from './morph-element-content.mjs';

const cache=new WeakMap(),abort=()=>Object.assign(Error('Morph element content canceled or source changed.'),{name:'AbortError'});
export async function renderMorphElementContent(viewer,frame,state,{describe,getState=()=>state,signal,isCurrent=()=>true,makeCanvas,decodeImage}={}){
  const signature=contentSignature(state),viewSignature=JSON.stringify(state.view),original=state.model;
  const verify=()=>{if(signal?.aborted||!isCurrent()||getState()!==state||contentSignature(state)!==signature||JSON.stringify(state.view)!==viewSignature)throw abort();};
  verify();const document=state.view.elementAnnotations;
  if(!document?.entries.length)return viewer.setMorphFrame(frame,original,state.view,{signal,isCurrent});
  if(typeof describe!=='function')throw Error('Morph element content requires a native source descriptor.');
  let saved=cache.get(state);
  if(saved?.signature!==signature){
    const descriptor=await describe(structuredClone(original),{document:structuredClone(document),reference_edge_mm:25},{signal,isCurrent});verify();
    const requested=entry=>({kind:entry.kind,index:entry.index,text:entry.text,texture:entry.texture});
    if(!Array.isArray(descriptor?.entries)||JSON.stringify(descriptor.entries.map(requested))!==JSON.stringify(document.entries.map(requested)))
      throw Error('Native morph descriptor omitted or changed requested source content.');
    saved={signature,descriptor};cache.set(state,saved);
  }
  planMorphElementContent(original,frame,saved.descriptor.entries);verify();
  const staged=Object.create(Object.getPrototypeOf(viewer));staged.group=new THREE.Group();staged.draw=()=>{};staged.stereographicWorkerFactory=()=>null;
  // The detached geometry preflight still executes camera-projection policy.
  // Own these observer objects: using the live camera/controls would let a
  // refused pose alter the previous frame while preparation is in flight.
  staged.perspectiveCamera=viewer.perspectiveCamera?.clone()??new THREE.PerspectiveCamera(38,1,.01,1000);
  staged.orthographicCamera=viewer.orthographicCamera?.clone()??new THREE.OrthographicCamera(-1.45,1.45,1.45,-1.45,.01,1000);
  staged.cameraProjection=viewer.cameraProjection??'orthographic';
  staged.camera=staged.cameraProjection==='perspective'?staged.perspectiveCamera:staged.orthographicCamera;
  staged.orthographicHalfHeight=viewer.orthographicHalfHeight??1.45;staged.aspect=viewer.aspect??1;
  staged.controls={target:viewer.controls?.target?.clone()??new THREE.Vector3(),update(){},dispose(){}};
  staged.bindControls=()=>{};
  let layer,target=staged,published=false;
  const ownerCurrent=()=>!signal?.aborted&&getState()===state&&contentSignature(state)===signature&&target.model===frame.model&&target.morphFrame===frame&&
    (published||isCurrent());
  try{
    staged.setMorphFrame(frame,original,state.view,{signal,isCurrent});
    await staged.setElementContent(saved.descriptor,{sourceModel:original,signal,isCurrent:ownerCurrent,makeCanvas,decodeImage});
    await staged.elementContentLayer.prepareCapture({signal,isCurrent:ownerCurrent});verify();
    const preparedModel=portableContentSource(staged.model);layer=staged.elementContentLayer;
    // Prevent a draw of bare geometry between synchronous pose and layer adoption.
    const draw=viewer.draw;viewer.draw=()=>{};let status;
    try{status=viewer.setMorphFrame(frame,original,state.view,{signal,isCurrent});}finally{viewer.draw=draw;}
    if(portableContentSource(viewer.model)!==preparedModel)throw Error('Prepared and published morph geometry differ.');
    staged.group.remove(layer.group);staged.elementContentLayer=null;layer.viewer=viewer;
    target=viewer;published=true;viewer.elementContentLayer=layer;viewer.group.add(layer.group);layer.rebuild();
    if(layer.diagnostic)throw Error(layer.diagnostic);viewer.draw();return {...status,elementContentDiagnostic:null,mappedContent:true};
  }finally{staged.clear();}
}
