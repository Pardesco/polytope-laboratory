// SPDX-License-Identifier: GPL-3.0-only
export const WALKTHROUGHS = [
  {
    id: 'measure',
    title: 'Measure an edge',
    key: 'cube',
    steps: [
      {
        anchor: 'measure-a-kind',
        event: 'change',
        value: 'edge',
        text: 'In Analysis, open Measurements and choose Source edge / line as Entity A.',
      },
      { anchor: 'measure-a-ids', event: 'change', text: 'Type 0 to measure the first edge, then press Tab.' },
      {
        anchor: 'measure-entity-info',
        event: 'click',
        text: 'Request A’s content to see the intrinsic edge length and numerical definition.',
      },
    ],
  },
  {
    id: 'dual',
    title: 'Make the dual',
    key: 'cube',
    steps: [
      {
        anchor: 'make-dual',
        event: 'click',
        text: 'Dual is open in Construct. Make the dual of this cube: its faces and corners exchange roles.',
      },
      { anchor: 'undo', event: 'click', text: 'Undo returns to the cube without losing the dual.' },
      { anchor: 'redo', event: 'click', text: 'Redo restores the dual; saved projects keep both history states.' },
    ],
  },
  {
    id: 'slice',
    title: 'Slice a 4D object',
    key: 'tesseract',
    steps: [
      {
        anchor: 'derived-mode',
        event: 'change',
        value: 'section',
        text: 'The second viewport is open. Choose Surface / convex section to see a 3D slice of the tesseract. View options can show or hide this second view.',
      },
      { anchor: 'apply-section', event: 'click', text: 'Evaluate the section at the current normal and depth.' },
      {
        anchor: 'section-offset',
        event: 'input',
        text: 'Drag Depth to move the section through the original four-dimensional object.',
      },
    ],
  },
  {
    id: 'morph',
    title: 'Morph to the dual',
    key: 'cube',
    steps: [
      {
        anchor: 'dual-morph-play',
        event: 'click',
        text: 'Find this drawer through More on the bottom dock. Play a continuous preview from this cube toward its dual.',
      },
      { anchor: 'dual-morph-pause', event: 'click', text: 'Pause the preview at an intermediate shape.' },
      {
        anchor: 'dual-morph-scrub',
        event: 'input',
        text: 'Drag the ratio to explore the morph; this preview does not replace source geometry.',
      },
    ],
  },
  {
    id: 'paper',
    title: 'Make and print a net',
    key: 'cube',
    steps: [
      {
        anchor: 'net-length',
        event: 'change',
        text: 'In Nets, set the reference edge length in millimetres, then press Tab.',
      },
      {
        anchor: 'net-rebuild',
        event: 'click',
        text: 'Choose Generate face net to lay this cube flat, with matching edge labels and glue tabs.',
      },
      {
        anchor: 'net-pack',
        event: 'click',
        text: 'Pack and preview the pieces on physical paper at the chosen scale.',
      },
      {
        anchor: 'net-packed-pdf',
        text: 'Export all pages as PDF, or choose File → Print net for reviewed printing; check paper size and use 100% scale.',
      },
    ],
  },
  {
    id: 'struts',
    title: 'Export a 3D-printable strut model',
    key: 'icosahedron',
    steps: [
      { anchor: 'export', event: 'click', text: 'Open the export dialog for this icosahedron.' },
      {
        anchor: 'export-goal-print',
        event: 'click',
        text: 'Choose 3D print it to build physical geometry from the displayed pose.',
      },
      {
        anchor: 'confirm-export',
        text: 'Build it as Struts (rods and joints), set the longest dimension in millimetres, then Export STL. Inspect overlapping shells and supports in your slicer.',
      },
    ],
  },
  {
    id: 'turn4d',
    title: 'Turn a shape in 4D',
    key: 'tesseract',
    steps: [
      {
        anchor: 'base-canvas',
        text: 'Hold Shift and drag the shape to turn it through the fourth dimension. Ordinary drag turns the 3D camera. Try both, then choose Next.',
      },
      {
        anchor: 'direct-4d-xw',
        event: 'click',
        text: 'The 4D turn pads give you precise control. Drag XW, or focus it and press an arrow key, then choose Next. Enter makes a small turn and advances this step.',
      },
      {
        anchor: 'direct-4d-yw',
        event: 'click',
        text: 'Try YW for another direction, then choose Next. ZW is the third pad; Shift-scroll also turns in ZW.',
      },
      {
        anchor: 'direct-4d-straighten',
        event: 'click',
        text: 'Choose Straighten to return to the default 4D pose. Your shape and its history stay the same.',
      },
    ],
  },
  {
    id: 'cut-corners',
    title: 'Morph a cube into an octahedron',
    key: 'cube',
    steps: [
      {
        anchor: 'live-truncation-stop-0',
        event: 'click',
        text: 'Truncate / Rectify is open in Construct. Choose Original to begin with the cube. These stops preview the result without changing your model.',
      },
      {
        anchor: 'live-truncation-stop-1',
        event: 'click',
        text: 'Choose Truncated to cut each corner into a triangle. You can also drag the live slider between stops.',
      },
      {
        anchor: 'live-truncation-stop-2',
        event: 'click',
        text: 'Choose Rectified: the cuts meet at the edge midpoints. This is a cuboctahedron, with triangles and squares. An octahedron needs a different construction; we will try that next.',
      },
      {
        anchor: 'live-truncation-apply',
        event: 'click',
        text: 'Wait for the preview, then Apply to keep the cuboctahedron as one history step.',
      },
      {
        anchor: 'undo',
        event: 'click',
        text: 'Undo returns to the cube. Now we can exchange its faces and corners to reach the octahedron.',
      },
      {
        anchor: 'make-dual',
        event: 'click',
        text: 'Wait for the cube to reappear, then choose Dual. Its six faces become six corners of an octahedron, with eight triangular faces. Truncate / Rectify and Dual change shapes in different ways.',
      },
    ],
  },
];

export class Walkthrough {
  constructor({ find, onStep = () => {}, onEnd = () => {} }) {
    Object.assign(this, { find, onStep, onEnd });
    this.tour = null;
    this.index = -1;
  }
  start(tour) {
    this.stop('replaced');
    this.tour = tour;
    this.index = -1;
    return this.next();
  }
  next() {
    if (!this.tour) return false;
    while (++this.index < this.tour.steps.length) {
      const step = this.tour.steps[this.index],
        anchor = this.find(step.anchor);
      if (anchor) {
        this.onStep({ tour: this.tour, step, anchor, index: this.index });
        return true;
      }
    }
    this.stop('complete');
    return false;
  }
  event(id, type, value) {
    const step = this.tour?.steps[this.index];
    if (step && step.anchor === id && step.event === type && (step.value === undefined || step.value === value))
      return this.next();
    return false;
  }
  stop(reason = 'exit') {
    if (!this.tour) return;
    this.tour = null;
    this.index = -1;
    this.onEnd(reason);
  }
}
