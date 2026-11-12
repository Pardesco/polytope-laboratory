export const MEDIA_FORMATS = ['webm', 'mp4', 'gif', 'png'];
export const MEDIA_SIZES = {
  viewport: 'Viewport',
  w480: '480 px wide',
  w720: '720 px wide',
  w1080: '1080 px wide',
  square: '1080 × 1080',
  vertical: '1080 × 1920 (Reels / TikTok)',
  landscape: '1920 × 1080',
  uhd: '3840 × 2160 (4K)',
};
export const MEDIA_BITRATES = { compact: 3000000, standard: 6000000, high: 12000000 };
export function mediaExportOptions(value = {}) {
  const o = {
    format: 'webm',
    size: 'viewport',
    framing: 'fit',
    margin: 0.1,
    supersample: 1,
    bitrate: 'standard',
    palette: 'frame',
    dither: false,
    loopCount: 0,
    ...value,
  };
  if (
    !MEDIA_FORMATS.includes(o.format) ||
    !Object.hasOwn(MEDIA_SIZES, o.size) ||
    !['fit', 'viewport', 'letterbox', 'crop'].includes(o.framing) ||
    !Number.isFinite(o.margin) ||
    o.margin < 0 ||
    o.margin > 0.4 ||
    ![1, 2].includes(o.supersample) ||
    !Object.hasOwn(MEDIA_BITRATES, o.bitrate) ||
    !['frame', 'global'].includes(o.palette) ||
    typeof o.dither !== 'boolean' ||
    !Number.isInteger(o.loopCount) ||
    o.loopCount < 0 ||
    o.loopCount > 65535
  )
    throw Error('Invalid animation export format, size, framing or GIF options.');
  return o;
}
export function mediaDimensions(width, height, value = {}) {
  const o = mediaExportOptions(value);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 8192 || height > 8192)
    throw Error('Invalid export viewport size.');
  let w = width,
    h = height;
  if (o.size.startsWith('w')) {
    w = Number(o.size.slice(1));
    h = Math.max(1, Math.round((height * w) / width));
  } else if (o.size === 'square') {
    w = 1080;
    h = 1080;
  } else if (o.size === 'vertical') {
    w = 1080;
    h = 1920;
  } else if (o.size === 'landscape') {
    w = 1920;
    h = 1080;
  } else if (o.size === 'uhd') {
    w = 3840;
    h = 2160;
  }
  if (o.format === 'mp4') {
    w = Math.max(2, Math.ceil(w / 2) * 2);
    h = Math.max(2, Math.ceil(h / 2) * 2);
  }
  if (w > 8192 || h > 8192 || w * h > 33554432) throw Error('Export size exceeds the bounded canvas limit.');
  return { width: w, height: h };
}
export function mediaControls(prefix) {
  return `<label>Export format <select id="${prefix}-format">${MEDIA_FORMATS.map((v) => `<option value="${v}">${{ webm: 'WebM', mp4: 'MP4 (H.264)', gif: 'Animated GIF', png: 'PNG sequence' }[v]}</option>`).join('')}</select></label>
  <label>Export size <select id="${prefix}-size">${Object.entries(MEDIA_SIZES)
    .map(([v, label]) => `<option value="${v}">${label}</option>`)
    .join('')}</select></label>
  <details data-guide-topic="media-export"><summary>Export options</summary><label>Framing <select id="${prefix}-framing"><option value="fit">Fit model</option><option value="viewport">Match viewport</option></select></label>
  <label>Frame margin <select id="${prefix}-margin"><option value="0.1">10%</option><option value="0.05">5%</option><option value="0">0%</option><option value="0.2">20%</option></select></label>
  <label>Antialiasing <select id="${prefix}-supersample"><option value="1">Native resolution</option><option value="2">×2 supersampling</option></select></label>
  <label>Video bitrate <select id="${prefix}-bitrate"><option value="standard">Standard (6 Mbps)</option><option value="compact">Compact (3 Mbps)</option><option value="high">High (12 Mbps)</option></select></label>
  <label>GIF palette <select id="${prefix}-palette"><option value="frame">Per frame</option><option value="global">Global (two render passes)</option></select></label>
  <label><input id="${prefix}-dither" type="checkbox"> GIF ordered dithering</label>
  <label>GIF repeat <select id="${prefix}-loop-count"><option value="0">Forever</option><option value="1">Once after first play</option><option value="3">3 repeats</option><option value="10">10 repeats</option></select></label></details>`;
}
export const mediaControlKeys = [
  'format',
  'size',
  'framing',
  'margin',
  'supersample',
  'bitrate',
  'palette',
  'dither',
  'loop-count',
];
export function readMediaControls(nodes = {}, format = nodes.format?.value || 'webm') {
  return mediaExportOptions({
    format,
    size: nodes.size?.value || 'viewport',
    framing: nodes.framing?.value || 'fit',
    margin: Number(nodes.margin?.value ?? 0.1),
    supersample: Number(nodes.supersample?.value ?? 1),
    bitrate: nodes.bitrate?.value || 'standard',
    palette: nodes.palette?.value || 'frame',
    dither: Boolean(nodes.dither?.checked),
    loopCount: Number(nodes['loop-count']?.value || 0),
  });
}
export function createViewerMediaSurface(viewer, options, onDiagnostic = () => {}) {
  const o = mediaExportOptions(options);
  // Viewport-sized PNG frames capture the viewer directly; no surface (or renderer access) needed.
  if (o.format === 'png' && o.size === 'viewport' && o.supersample === 1) return null;
  const source = viewer.renderer.domElement;
  if (viewer.createExportSurface)
    return viewer.createExportSurface({ ...o, ...mediaDimensions(source.width, source.height, o), onDiagnostic });
  return createMediaSurface(source, o);
}
export function createMediaSurface(source, options, createCanvas = () => document.createElement('canvas')) {
  const o = mediaExportOptions(options),
    canvas = createCanvas(),
    width = source.width,
    height = source.height,
    size = mediaDimensions(width, height, o);
  Object.assign(canvas, size);
  const context = canvas.getContext('2d', { alpha: false, willReadFrequently: o.format === 'gif' });
  if (!context) throw Error('Export capture surface unavailable.');
  const copy = () => {
    if (source.width !== width || source.height !== height) throw Error('Export source canvas dimensions changed.');
    const s = Math[o.framing === 'crop' ? 'max' : 'min'](canvas.width / source.width, canvas.height / source.height),
      w = source.width * s,
      h = source.height * s;
    context.fillStyle = '#000';
    context.fillRect?.(0, 0, canvas.width, canvas.height);
    context.drawImage(source, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
  };
  return { canvas, copy };
}
