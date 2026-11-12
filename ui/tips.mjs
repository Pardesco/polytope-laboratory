// SPDX-License-Identifier: GPL-3.0-only
import { canvasOverlays } from './canvas-overlays.mjs';
export const TIPS = [
  'Press Ctrl+K to find any tool by name or by what you want to do.',
  'Hold Shift and drag a 4D shape to turn it through the fourth dimension.',
  'Try Truncate in Construct. Its live slider previews a shape before you Apply.',
  'Build from symmetry lets you make shapes by choosing a diagram and its rings.',
  'Open Nets to unfold a shape into a paper model. Print at 100% scale.',
  'Press F5 to start a presentation. Escape brings you back to your workspace.',
  'Browse Collections in the Library to discover families of related shapes.',
  'Use View options to change the camera or show a second viewport.',
  'Look in More on the bottom dock for memories and the dual morph.',
  'Undo and Redo let you explore constructions without losing earlier shapes.',
];
const SESSION = 'polytope.tip.session.v1',
  NEXT = 'polytope.tip.next.v1';
export function chooseTip(storage, session) {
  try {
    const saved = JSON.parse(session?.getItem(SESSION) ?? 'null');
    if (saved && Number.isInteger(saved.index) && saved.index >= 0 && saved.index < TIPS.length) return saved;
  } catch {}
  let index = 0;
  try {
    const value = Number(storage?.getItem(NEXT));
    if (Number.isInteger(value) && value >= 0) index = value % TIPS.length;
  } catch {}
  const tip = { index, dismissed: false };
  try {
    session?.setItem(SESSION, JSON.stringify(tip));
  } catch {}
  try {
    storage?.setItem(NEXT, String((index + 1) % TIPS.length));
  } catch {}
  return tip;
}
export class Tips {
  constructor({ document: doc = globalThis.document, storage, session } = {}) {
    this.doc = doc;
    try {
      this.storage = storage ?? doc.defaultView?.localStorage;
    } catch {}
    try {
      this.session = session ?? doc.defaultView?.sessionStorage;
    } catch {}
    const counts = doc.getElementById('counts-strip');
    if (!counts) return;
    this.host = counts.parentElement;
    this.root = doc.createElement('div');
    this.root.id = 'workspace-tip';
    this.root.hidden = true;
    this.overlays = canvasOverlays(doc, this.host);
    const label = doc.createElement('strong');
    label.textContent = 'Tip';
    this.text = doc.createElement('span');
    this.text.id = 'workspace-tip-text';
    this.dismiss = doc.createElement('button');
    this.dismiss.id = 'workspace-tip-dismiss';
    this.dismiss.type = 'button';
    this.dismiss.textContent = '×';
    this.dismiss.setAttribute('aria-label', 'Dismiss tip for this session');
    this.dismiss.onclick = () => {
      this.overlays?.dismiss('tip');
      this.tip.dismissed = true;
      try {
        this.session?.setItem(SESSION, JSON.stringify(this.tip));
      } catch {}
      this.hide();
    };
    this.root.append(label, this.text, this.dismiss);
    counts.after(this.root);
  }
  start({ hidden = false } = {}) {
    if (!this.root) return;
    if (hidden) {
      this.overlays?.enable(false);
      this.hide();
      return;
    }
    this.overlays?.enable(true);
    this.tip ??= chooseTip(this.storage, this.session);
    this.text.textContent = TIPS[this.tip.index];
    this.text.title = this.text.textContent;
    this.root.hidden = this.tip.dismissed;
    this.host.classList.toggle('has-workspace-tip', !this.root.hidden);
    if (this.overlays && !this.tip.dismissed)
      this.overlays.enqueue('tip', this.root, {
        onDismiss: () => {
          this.tip.dismissed = true;
          try {
            this.session?.setItem(SESSION, JSON.stringify(this.tip));
          } catch {}
          this.host.classList.remove('has-workspace-tip');
        },
      });
  }
  hide() {
    this.overlays?.eligible('tip', false);
    if (this.root) this.root.hidden = true;
    this.host?.classList.remove('has-workspace-tip');
  }
}
