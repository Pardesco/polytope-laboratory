export function literalNetIndex(text,count,label){
  if(!Number.isSafeInteger(count)||count<1)throw Error('The source has no available '+label+' indices.');
  const literal=typeof text==='string'?text.trim():'';
  const value=Number(literal);
  if(!/^\d+$/.test(literal)||!Number.isSafeInteger(value)||value<0||value>=count)
    throw Error(`Choose a literal ${label} index from 0 to ${Math.max(0,count-1)}.`);
  return value;
}
export function faceNetSummary(net){
  const pieces=net.components.length,faces=net.overlapPairs.length,tabs=net.tabOverlapPairs.length;
  return `${net.faces.length} faces in ${pieces} connected piece${pieces===1?'':'s'}\n${net.hinges.length} hinges · E0 = ${net.referenceEdgeLengthMm} mm\n`+
    (faces||tabs?`${faces} face overlap pairs · ${tabs} tab overlap pairs. Check the layout before printing.`:'No face or tab overlaps in the flat layout.');
}
export function cellNetSummary(net){return `${net.cells.length} complete cells · ${net.components.length} connected pieces\n${net.connections.length} face connections\nCell intersections not checked.`;}
export function cellNetChecks(net){return `Rigidity error ${net.validation.maxRigidDistanceError.toExponential(2)} · face gap ${net.validation.maxConnectedFaceGap.toExponential(2)} model units\n${net.domain??''}`;}
export function currentFaceNet(state){
  const net=state?.netLayout,c=state?.view.net,model=state?.model;
  return Boolean(net&&c&&model&&net.sourceFingerprint===model.fingerprint&&(!net.sourceId||net.sourceId===model.id)&&net.root===c.root&&net.referenceEdgeLengthMm===c.length&&net.tabs===c.tabs&&
    JSON.stringify(net.tabOptions??null)===JSON.stringify(c.tabOptions??null)&&JSON.stringify(net.elementAnnotations??null)===JSON.stringify(state.view.elementAnnotations??null)&&
    JSON.stringify(net.printSource?.metadata?.offColors?.faces??null)===JSON.stringify(model.metadata?.offColors?.faces??null));
}
