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
    complete(token, text) {
      if (!token || token !== owner) return false;
      set(text);
      return true;
    }
  });
}
