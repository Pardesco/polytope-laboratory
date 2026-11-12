function createStartupProfile(enabled, now = Date.now) {
  const marks = [];
  return {
    enabled,
    marks,
    mark(name) {
      if (enabled && !marks.some((row) => row.name === name)) marks.push({ name, epochMs: now() });
    },
  };
}
function watchEngineReady(proc, profile) {
  if (!profile.enabled) return proc;
  let buffer = '';
  const read = (chunk) => {
    buffer = (buffer + chunk).slice(-1024);
    if (buffer.includes('POLYTOPE_ENGINE_READY')) {
      profile.mark('engine-ready');
      proc.stderr.removeListener('data', read);
    }
  };
  proc.stderr.on('data', read);
  return proc;
}
module.exports = { createStartupProfile, watchEngineReady };
