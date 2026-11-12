import { captureNativeSource, verifyNativeSource } from './native-source-binding.mjs';

/** Exact certification belongs to the complete source that requested it. */
export async function certifyCurrent(context) {
  const owner = captureNativeSource(context),
    source = JSON.parse(owner.modelSignature);
  if (source.interpretation !== 'convex-polytope') throw Error('Certification supports convex hull sources only.');
  const capacity = () => {
    if (context.getProject().documents.length >= 100)
      throw Error('Close a document before opening a certification result.');
  };
  capacity();
  const result = await context.run(
    'rational-hull',
    { points: source.vertices.map((p) => p.map(String)), name: 'Rational input hull of ' + source.name },
    null,
    'Certify supplied decimal hull'
  );
  verifyNativeSource(context, owner);
  capacity();
  context.addDocument(result, 'Certify decimal input');
  return result;
}

/** Publish a generated document only into the workspace that requested it. */
export async function generateConstruction(context, kind, parameters, label, options = {}) {
  if (context.isExporting()) throw new Error('Finish animation export before constructing geometry.');
  const workspace = context.getProject();
  const verify = () => {
    if (options.signal?.aborted) {
      const error = new Error('Construction canceled.');
      error.name = 'AbortError';
      throw error;
    }
    if (context.getProject() !== workspace)
      throw new Error('Workspace changed while constructing geometry. The result was discarded.');
    if (context.isExporting())
      throw new Error('Animation export began while constructing geometry. The result was discarded.');
    options.verifyPublication?.();
  };
  verify();
  const args = ['generate', { ...parameters, kind }, null, label];
  if (options.signal) args.push({ signal: options.signal });
  const model = await context.run(...args);
  verify();
  context.addDocument(model, label);
  return model;
}
