// Shared renderer surface for Viewer tests; method coverage is checked separately.
export function fakeRenderer({ width = 900, height = 900, clearAlpha = 1 } = {}) {
  return {
    domElement: { getBoundingClientRect: () => ({ width, height }) },
    setClearColor(_color, alpha = 1) {
      clearAlpha = alpha;
    },
    getClearAlpha() {
      return clearAlpha;
    },
    setPixelRatio() {},
    setSize(w, h) {
      width = w;
      height = h;
    },
    render() {},
  };
}
