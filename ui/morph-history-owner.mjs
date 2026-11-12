import { captureNativeSource } from './native-source-binding.mjs';

const signature = JSON.stringify,
  clone = structuredClone;
const fail = () => {
  throw Error('Animation history changed the morph source or unexpected history fields. Prepare the morph again.');
};

export function commitMorphAnimationHistory(session, commit) {
  if (!session.owner || !session.prepared) return commit();
  session.checked();
  const owner = session.owner,
    prepared = session.prepared,
    before = clone(owner.state),
    literal = signature(before);
  session.cancel();
  try {
    const changed = commit();
    if (changed?.then) throw Error('Animation history publication must be synchronous.');
    if (!changed) {
      session.checked();
      return changed;
    }
    const next = captureNativeSource(session.context),
      states = next.states,
      previous = states.at(-2);
    if (
      next.project !== owner.project ||
      next.document !== owner.document ||
      next.documentId !== owner.documentId ||
      next.state !== owner.state ||
      next.modelSignature !== owner.modelSignature ||
      next.notes !== owner.notes ||
      next.unit !== owner.unit ||
      session.owner !== owner ||
      session.prepared !== prepared ||
      signature(next.state.view.dualMorph) !== session.expected ||
      signature(next.state.view.elementAnnotations ?? null) !== owner.contentSignature ||
      !previous ||
      previous === owner.state ||
      signature(previous) !== literal
    )
      fail();
    const expected = [...owner.states.slice(0, owner.cursor), previous, owner.state].slice(-200);
    if (
      next.cursor !== states.length - 1 ||
      states.length !== expected.length ||
      states.some((value, i) => value !== expected[i])
    )
      fail();
    before.view.animation = clone(next.state.view.animation);
    before.label = 'Animation keyframes';
    if (signature(before) !== signature(next.state)) fail();
    next.contentSignature = owner.contentSignature;
    session.owner = next;
    session.checked();
    session.context.onState?.();
    return changed;
  } catch (error) {
    session.invalidate();
    throw error;
  }
}
