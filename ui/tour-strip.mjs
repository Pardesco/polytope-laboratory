export function tourStopLabel(event, index) {
  return `${index + 1}: ${event?.state?.model?.name || 'Model'}`;
}
export function tourDurationLabel(duration) {
  return `${duration} s`;
}
export function tourTransitionLabel(transition) {
  const method = typeof transition === 'string' ? transition : transition?.method || 'instant',
    label = method.replaceAll('-', ' ');
  return label.charAt(0).toUpperCase() + label.slice(1);
}
export function moveTourSelection(index, delta, count) {
  if (!Number.isInteger(count) || count <= 0) return -1;
  const start = Number.isInteger(index) ? Math.max(0, Math.min(index, count - 1)) : 0;
  return Math.max(0, Math.min(start + delta, count - 1));
}
