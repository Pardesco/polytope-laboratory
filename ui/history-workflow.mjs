/** Native recipe results are published by the caller only after these guards.
 * No helper mutates the workspace. After awaiting preparation, call
 * verifyHistoryPublication immediately before publishing, with no await
 * between that final verification and the actual workspace mutation.
 */
const closed=()=>Error('Source document closed while the job ran.');
const sourceChanged=()=>Error('Source history changed while the job ran. The result was discarded; repeat it from the desired state.');
const selectionChanged=()=>Error('History selection changed during the job. The result was discarded.');
const cap=()=>Error('Close a document before opening another history result.');

function source(context){
  const sourceProject=context.getProject(),sourceDocument=context.getDocument(),sourceState=context.getState();
  if(!sourceProject||!sourceDocument||!sourceState||sourceDocument.states?.[sourceDocument.cursor]!==sourceState)throw sourceChanged();
  if(sourceProject.documents.indexOf(sourceDocument)<0)throw closed();
  // Model IDs/fingerprints can remain unchanged while a color or source
  // attribute is edited in place. Bind the complete model used by native.
  // View pose remains independent so rotation can continue during a job.
  const sourceModel=sourceState.model,sourceModelSignature=JSON.stringify(sourceModel);
  return {sourceProject,sourceDocument,sourceState,sourceModel,sourceModelSignature};
}

function verify(context,ownership,{opening=false}={}){
  if(context.isExporting())throw Error('Animation export began while the history job ran. The result was discarded.');
  const {sourceProject,sourceDocument,sourceState,sourceModel,sourceModelSignature}=ownership;
  if(context.getProject()!==sourceProject)throw opening?selectionChanged():sourceChanged();
  const index=sourceProject.documents.indexOf(sourceDocument);
  if(index<0)throw closed();
  if(sourceDocument.states?.[sourceDocument.cursor]!==sourceState)throw opening?selectionChanged():sourceChanged();
  if(sourceState.model!==sourceModel||JSON.stringify(sourceState.model)!==sourceModelSignature)throw sourceChanged();
  if(opening){
    if(context.getDocument()!==sourceDocument||context.getState()!==sourceState)throw selectionChanged();
    if(sourceProject.documents.length>=100)throw cap();
  }
  // Construction controls may bind external memories or non-pose source
  // attributes. Recheck them after the native await and at final publication.
  context.verifyPublication?.();
  return index;
}

/** Final synchronous fence after the caller's await; returns the current index.
 * Preparation's earlier checks cannot cover changes in intervening microtasks.
 */
export function verifyHistoryPublication(context,prepared,{opening=false}={}){
  return verify(context,prepared,{opening});
}

/** Verify a recipe-run result for replacement at the returned current index. */
export async function prepareHistoryCommit(context,operation,parameters,label){
  if(context.isExporting())throw Error('Finish animation export before changing geometry.');
  const ownership=source(context),observer=captureObserver(ownership.sourceState.view);
  const result=await context.run('recipe-run',{document:structuredClone(ownership.sourceDocument),operation,parameters,label},null,label);
  const index=verify(context,ownership);
  return {result,...ownership,index,observer};
}

/** Verify replay/branch output for appending a new active document. */
export async function prepareHistoryOpen(context,operation,parameters){
  if(context.isExporting())throw Error('Finish animation export before replaying history.');
  if(context.getProject().documents.length>=100)throw cap();
  const ownership=source(context);
  const result=await context.run(operation,{document:structuredClone(ownership.sourceDocument),...parameters?{parameters}:{}},null,operation==='recipe-replay'?'Verify operation replay':'Construct parameter branch');
  const index=verify(context,ownership,{opening:true});
  return {result,...ownership,index};
}

// Preserve a later observer edit without undoing the native operation's normal
// view-reset policy. Call only after the final synchronous publication guard.
const observerFields=['angles','camera','derivedCamera','cameraProjection'];
function captureObserver(view){return Object.fromEntries(observerFields.map(key=>[key,JSON.stringify(view?.[key])]));}
export function preserveHistoryObserver(prepared){
  const source=prepared.sourceState,result=prepared.result.states[prepared.result.cursor];
  if(!prepared.observer||!source?.view||!result?.view)return;
  const domain=m=>[m.dimension,m.embeddingDimension??m.dimension];
  if(JSON.stringify(domain(source.model))!==JSON.stringify(domain(result.model)))return;
  for(const key of observerFields){
    if(JSON.stringify(source.view[key])===prepared.observer[key])continue;
    if(Object.hasOwn(source.view,key))result.view[key]=structuredClone(source.view[key]);
    else delete result.view[key];
  }
}
