import {captureNativeSource,verifyNativeSource} from './native-source-binding.mjs';

export function millerCandidate(controls){
  const s=controls.getState(),c=controls.config(),result=s.stellationSearch;
  if(result?.criteria?.ruleSet!=='miller-59'||s.stellationSearchBinding!==controls.searchBinding())return null;
  const candidate=result.candidates[c.searchCandidateIndex];
  return candidate&&JSON.stringify(candidate.regionIds)===JSON.stringify(c.selectedRegions)?candidate:null;
}

export function mountMillerControls(controls){
  const option=document.createElement('option');option.value='miller';option.textContent="Miller's rules (59 icosahedra)";controls.$('stellation-criteria').append(option);
  const note=document.createElement('p');note.className='muted';note.textContent="Miller's rules use all rotations, count mirror pairs once, allow disconnected face parts and exclude buried cavities / separated symmetric shells. Use a regular icosahedron, all face planes and observation scale 10. f1* denotes both mirror cell sets; f1 is one hand.";
  controls.$('stellation-enumerate').before(note);
  const button=document.createElement('button');button.id='stellation-miller-base';button.className='wide';button.textContent='Make base model';controls.$('stellation-use-candidate').after(button);
  button.onclick=controls.guard(()=>makeMillerBase(controls));
}

export function syncMillerControls(controls){
  // Constructed before any document exists; nothing to sync until a model is open.
  if(!controls.getState?.())return;
  const miller=controls.config().searchCriteria==='miller';
  for(const id of ['stellation-symmetry','stellation-generator-ids','stellation-include-seed','stellation-connected','stellation-merge-mirrors'])controls.$(id).disabled=miller;
  const button=controls.$('stellation-miller-base');button.hidden=!miller;button.disabled=Boolean(controls.baseController||controls.context.isExporting?.()||!millerCandidate(controls));
}

export async function makeMillerBase(controls){
  if(controls.baseController)throw Error('Finish or cancel the current stellation construction.');
  const candidate=millerCandidate(controls);if(!candidate)throw Error('Display a current Miller candidate before making a base model.');
  const owner=captureNativeSource(controls.context),s=controls.getState(),a=s.arrangement,binding=controls.searchBinding(),selection=JSON.stringify(controls.config().selectedRegions),controller=new AbortController();
  const params={box_scale:a.parameters.box_scale,plane_ids:a.source.faceIds.slice(),bounds:structuredClone(a.bounds),region_signs:candidate.regionIds.map(i=>a.regions[i].signs.slice())};
  const verifyPublication=()=>{
    if(controller.signal.aborted)throw Error('Stellation construction canceled.');verifyNativeSource(controls.context,owner);
    if(s.arrangement!==a||binding!==controls.searchBinding()||selection!==JSON.stringify(controls.config().selectedRegions))throw Error('Stellation selection or criteria changed during construction.');
  };
  controls.baseController=controller;syncMillerControls(controls);
  try{verifyPublication();return await controls.context.commit('stellation-make-base',params,`Miller ${candidate.bookIndex}: ${candidate.coxeterLabel}`,{signal:controller.signal,verifyPublication});}
  finally{if(controls.baseController===controller)controls.baseController=null;syncMillerControls(controls);}
}

export function renderMillerSearch(controls,result){
  syncMillerControls(controls);if(result?.criteria?.ruleSet!=='miller-59')return;
  const select=controls.$('stellation-candidate');
  for(let i=0;i<select.options.length;i++)select.options[i].textContent=`${result.candidates[i].bookIndex}: ${result.candidates[i].coxeterLabel} | ${result.candidates[i].reflexibleWithinSourceGroup?'reflexible':'chiral'} | ${result.candidates[i].regionCount} cells`;
  const current=millerCandidate(controls);
  if(current)controls.$('stellation-position').textContent=`${current.bookIndex} of ${result.candidates.length} — ${current.coxeterLabel}`;
  controls.$('stellation-search-status').textContent+=` | Miller's rules: ${result.counts.reflexible} reflexible + ${result.counts.chiral} chiral; mirrors counted once; max vertex residual ${result.maxVertexResidual.toExponential(2)} (float64)`;
}
