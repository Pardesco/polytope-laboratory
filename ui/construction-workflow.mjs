/** Publish a generated document only into the workspace that requested it. */
export async function generateConstruction(context,kind,parameters,label,options={}){
  if(context.isExporting())throw new Error('Finish animation export before constructing geometry.');
  const workspace=context.getProject();
  const verify=()=>{
    if(options.signal?.aborted){const error=new Error('Construction canceled.');error.name='AbortError';throw error;}
    if(context.getProject()!==workspace)throw new Error('Workspace changed while constructing geometry. The result was discarded.');
    if(context.isExporting())throw new Error('Animation export began while constructing geometry. The result was discarded.');
    options.verifyPublication?.();
  };
  verify();
  const args=['generate',{...parameters,kind},null,label];
  if(options.signal)args.push({signal:options.signal});
  const model=await context.run(...args);
  verify();
  context.addDocument(model,label);
  return model;
}
