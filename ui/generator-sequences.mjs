export function adjacentStepPrism(n, step, direction) {
  if (
    !Number.isSafeInteger(n) ||
    n < 5 ||
    n > 128 ||
    !Number.isSafeInteger(step) ||
    !step ||
    Math.abs(step) >= n ||
    ![1, -1].includes(direction)
  )
    throw Error('Sequence navigation needs literal integer n (5 to 128) and a nonzero signed step below n.');
  const sign = Math.sign(step);
  let magnitude = Math.abs(step);
  for (;;) {
    magnitude += direction;
    if (magnitude > n - 2) {
      if (n === 128) break;
      n++;
      magnitude = 2;
    }
    if (magnitude < 2) {
      if (n === 5) break;
      n--;
      magnitude = n - 2;
    }
    if (2 * magnitude !== n) return [n, sign * magnitude];
  }
  throw Error('Reached the bounded step-prism sequence endpoint.');
}
