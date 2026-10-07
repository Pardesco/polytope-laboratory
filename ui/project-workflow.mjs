/** Keep project replacement atomic across the native file/recovery await. */
export async function openWorkspace(context) {
  if(context.isExporting())throw Error('Finish or cancel animation export before opening a project.');
  const workspace=context.getProject(),revision=context.getRevision();
  const result=await context.load();
  if(!result)return null;
  if(context.isExporting())throw Error('Animation export began while opening the project. The result was discarded.');
  if(context.getProject()!==workspace||context.getRevision()!==revision)throw Error('Workspace changed while opening the project. The result was discarded.');
  // No further await before adoption: the final checks and publication share
  // this continuation, including any queued export microtasks before it.
  context.publish(result);
  return result;
}
