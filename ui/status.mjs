/** An asynchronous completion may replace only the status it started. */
export function createStatus(publish) {
  let owner;
  const set = text => {
    owner = Object.freeze({});
    publish(text);
    return owner;
  };
  return Object.freeze({
    set,
    // Progress for quick work stays silent: the message appears only if the
    // work is still running after `delay`, and only while nothing newer was set.
    defer(text, delay = 400) {
      const token = {base: owner, published: false, settled: false};
      token.timer = setTimeout(() => {
        token.timer = null;
        if (token.settled || owner !== token.base) return;
        owner = token; token.published = true;
        publish(text);
      }, delay);
      return token;
    },
    // Stops a deferred token's pending message; true when it was shown.
    settle(token) {
      if (!token || !('settled' in token)) return true;
      token.settled = true; clearTimeout(token.timer); token.timer = null;
      return token.published;
    },
    complete(token, text) {
      if (!token) return false;
      if (token.settled === false && !token.published && token.base === owner) { clearTimeout(token.timer); token.timer = null; token.settled = true; }
      else if (token !== owner) return false;
      set(text);
      return true;
    }
  });
}
