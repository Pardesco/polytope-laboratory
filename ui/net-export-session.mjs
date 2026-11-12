import { captureNativeSource, verifyNativeSource } from './native-source-binding.mjs';
import { publishBoundedExport } from './bounded-export.mjs';
import { currentFaceNet } from './net-presentation.mjs';
import { publishNetPrint } from './net-print-session.mjs';
import { assemblyParts, assemblySheets, numberNetSvg } from './net-assembly.mjs';
import { holdObservationControls } from './observation-controls.mjs';
const printSignature = (state, currentPage) =>
  JSON.stringify([
    state.netLayout ?? null,
    state.netPages ?? null,
    state.view.netPrint ?? null,
    state.view.netAssembly ?? null,
    state.view.elementAnnotations ?? null,
    state.view.net
      ? {
          root: state.view.net.root,
          length: state.view.net.length,
          tabs: state.view.net.tabs,
          tabOptions: state.view.net.tabOptions,
          page: currentPage ? state.view.net.page : undefined,
        }
      : null,
  ]);
/** Print the reviewed layout, with source ownership rechecked after the dialog. */
export class NetExportSession {
  constructor(context) {
    this.context = context;
    this.busy = false;
  }
  async run(format, { packed = false, currentPage = false, assemblyOnly = false, isCurrent = () => true } = {}) {
    if (this.busy) throw Error('Finish the current net export first.');
    if (!['svg', 'pdf', 'print'].includes(format)) throw Error('Choose SVG or PDF net output.');
    const owner = captureNativeSource(this.context),
      state = owner.state,
      net = state.netLayout,
      pages = state.netPages;
    if (!currentFaceNet(state)) throw Error('Generate a current 3D face net before exporting it.');
    if (packed && !pages) throw Error('Pack and preview the paper pages first.');
    const pageIndex = state.view.net?.page ?? 0;
    let svg = packed ? (currentPage ? pages.pages[pageIndex]?.svg : pages.pages.map((page) => page.svg)) : net.svg;
    if (svg == null) throw Error('Choose an available paper page.');
    const signature = printSignature(state, currentPage),
      verify = () => {
        if (this.controller?.signal.aborted || !isCurrent())
          throw Object.assign(Error('Net export dialog changed, canceled or closed.'), { name: 'AbortError' });
        verifyNativeSource(this.context, owner);
        if (printSignature(state, currentPage) !== signature)
          throw Error('The net layout, print settings or source content changed. Review the layout and export again.');
      };
    this.busy = true;
    this.controller = new AbortController();
    this.context.onState?.();
    try {
      if (net.components) {
        const parts = assemblyParts(net, packed ? pages : null),
          paint = (value) => numberNetSvg(value, parts, state.view.netAssembly?.color);
        svg = Array.isArray(svg) ? svg.map(paint) : paint(svg);
      }
      if (assemblyOnly || (format === 'pdf' && state.view.netAssembly?.include === true)) {
        const viewer = this.context.assemblyViewer;
        if (!viewer) throw Error('The main 3D view is unavailable for the assembly thumbnail.');
        if (viewer.model !== state.model)
          throw Error('Show the finished source model in the main 3D view before exporting its assembly sheet.');
        const observation = holdObservationControls([viewer]);
        let thumbnail;
        try {
          const view = JSON.stringify(viewer.view),
            camera = JSON.stringify(viewer.cameraState()),
            source = viewer.model;
          const current = () => {
            try {
              verify();
              return (
                viewer.model === source &&
                JSON.stringify(viewer.view) === view &&
                JSON.stringify(viewer.cameraState()) === camera
              );
            } catch {
              return false;
            }
          };
          await viewer.prepareCapture({ signal: this.controller.signal, isCurrent: current });
          if (!current()) throw Error('The 3D view changed during assembly thumbnail capture. Export again.');
          thumbnail = viewer.image();
          verify();
        } finally {
          observation.release();
        }
        const first = Array.isArray(svg) ? svg[0] : svg;
        const dimensions = assemblyOnly
          ? { widthMm: 210, heightMm: Math.max(297, 110 + assemblyParts(net, packed ? pages : null).length * 6) }
          : {
              widthMm: Number(first.match(/width="([\d.e+-]+)mm"/)?.[1]),
              heightMm: Number(first.match(/height="([\d.e+-]+)mm"/)?.[1]),
            };
        const sheets = assemblySheets(net, {
          ...dimensions,
          thumbnail,
          pages: packed ? pages : null,
          color: state.view.netAssembly?.color,
          title: state.model.name,
        });
        svg = assemblyOnly ? sheets[0] : [...(Array.isArray(svg) ? svg : [svg]), ...sheets];
      }
      if (format === 'print')
        return await publishNetPrint(this.context.api, svg, {
          packed: packed && !currentPage,
          verifyPublication: verify,
          signal: this.controller.signal,
        });
      const payload = format === 'pdf' ? (Array.isArray(svg) ? svg : [svg]) : svg;
      if (format === 'svg' && typeof payload !== 'string') throw Error('Choose a single paper page for SVG output.');
      const result = await publishBoundedExport(this.context.api, format, payload, {
        verifyPublication: verify,
        signal: this.controller.signal,
        defaultName: assemblyOnly
          ? 'Assembly sheet'
          : packed
            ? currentPage
              ? `Net page ${pageIndex + 1}`
              : 'Packed net pages'
            : 'Net',
      });
      return isCurrent() ? result : null;
    } finally {
      this.controller = null;
      this.busy = false;
      this.context.onState?.();
    }
  }
  cancel() {
    this.controller?.abort();
  }
}
