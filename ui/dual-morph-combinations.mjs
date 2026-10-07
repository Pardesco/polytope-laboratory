/** Saved morph settings remain readable until combined animation is qualified. */
export function requireNoEnabledDualMorph(state,operation='Animation'){
  if(state?.view?.dualMorph?.enabled===true)throw Error(`${operation} cannot combine an enabled dual morph with saved animation or tour tracks yet. Reset the dual morph before continuing; its saved settings are retained.`);
}
export function requireNoTourDualMorph(timeline){
  for(const event of timeline?.tour?.events??[])requireNoEnabledDualMorph(event.state,'Animated tour');
}
