import { normalizeSequence } from './animation.mjs';

export function saveAnimationHistory(document, source, value) {
  const sequence = normalizeSequence(value);
  if (document?.states?.[document.cursor] !== source) throw Error('Animation source history changed. Repeat the edit.');
  if (JSON.stringify(source.view.animation) === JSON.stringify(sequence)) return false;
  const previous = structuredClone(source);
  document.states = [...document.states.slice(0, document.cursor), previous, source].slice(-200);
  document.cursor = document.states.length - 1;
  source.view.animation = sequence;
  source.label = 'Animation keyframes';
  return true;
}
