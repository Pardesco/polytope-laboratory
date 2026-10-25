/** Temporary observation ownership survives the viewer's own control rebinding.
 * It never changes an independently installed controls object. */
const owners=new WeakMap();

export function holdObservationControls(viewers){
  const token={},groups=[];let released=false;
  const release=()=>{
    if(released)return;released=true;
    let firstError,failed=false;
    for(const group of groups){
      try{
        group.holds.delete(token);if(group.holds.size)continue;
        const controls=group.current;if(owners.get(controls)!==group)continue;
        owners.delete(controls);
        if(group.viewer.controls===controls){controls.enabled=group.enabled;controls.enableDamping=group.damping;}
      }catch(error){if(!failed)firstError=error;failed=true;}
    }
    if(failed)throw firstError;
  };
  try{
    for(const viewer of new Set(viewers.filter(Boolean))){
      const controls=viewer.controls;if(!controls)continue;
      let group=owners.get(controls);
      if(group&&group.viewer!==viewer)throw Error('Observation controls cannot belong to two viewers.');
      if(!group){
        const enabled=controls.enabled,damping=controls.enableDamping;
        controls.update();
        group={viewer,current:controls,enabled,damping,holds:new Set()};owners.set(controls,group);
      }
      group.holds.add(token);groups.push(group);controls.enabled=false;controls.enableDamping=false;
    }
  }catch(error){release();throw error;}
  return {release};
}

/** Only Viewer.bindControls calls this for its own initialized replacement. */
export function transferObservationControls(previous,next){
  if(!previous||!next||previous===next||owners.has(next))return false;
  const group=owners.get(previous);
  if(!group||group.current!==previous||group.viewer.controls!==next)return false;
  owners.delete(previous);group.current=next;owners.set(next,group);
  next.enabled=false;next.enableDamping=false;return true;
}
