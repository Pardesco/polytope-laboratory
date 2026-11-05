/** A single finite reciprocal morph, with native target verification at install. */
import {normalizeSequence} from './animation.mjs';
import {morphEligible} from './dual-morph-session.mjs';

export function dualTourTransition(source,target,transition,terminal){
  const p=target.model.provenance;
  if(!morphEligible(source.model,'sizing')||source.model.interpretation!=='convex-polytope'||!['dual','incidence-dual'].includes(p?.operation)||p.sourceFingerprint!==source.model.fingerprint)
    throw Error('Morph to dual requires the next event to be a native dual of the current convex model.');
  if(source.view.dualMorph?.enabled||source.view.animation?.tracks?.fold||source.view.animation?.tracks?.explosion)
    throw Error('Reset the source morph, fold and explosion tracks before adding a morph-to-dual transition.');
  const state=structuredClone(source),duration=transition.duration;
  const angles=terminal?.angles??source.view.angles??Array(6).fill(0),sectionOffset=terminal?.sectionOffset??source.view.sectionOffset??0;
  state.view.dualMorph={version:1,enabled:true,method:'sizing',center:p.parameters?.center??null,radius:p.parameters?.radius??1,
    ratio:0,duration,loop:false,interpolateColors:source.view.dualMorph?.interpolateColors===true};
  const sequence=normalizeSequence({version:3,duration,fps:24,loop:false,tracks:{morphRatio:{kind:'dual-morph',version:1}},
    keyframes:[{time:0,angles,sectionOffset,morphRatio:0},{time:duration,angles,sectionOffset,morphRatio:1}]});
  state.view.animation=sequence;
  return {state,sequence,target:target.model};
}
