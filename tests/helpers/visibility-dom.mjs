export class VisibilityNode {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.value = '';
    this._text = '';
  }
  set textContent(v) {
    this._text = v;
    this.children = [];
  }
  get textContent() {
    return this._text + this.children.map((n) => n.textContent).join(' ');
  }
  set innerHTML(html) {
    this.children = [];
    for (const m of html.matchAll(/<(button|select|output)[^>]*id="([^"]+)"/g)) {
      const n = new VisibilityNode(m[1]);
      n.id = m[2];
      this.append(n);
    }
  }
  append(...nodes) {
    for (const n of nodes) n.parent = this;
    this.children.push(...nodes);
  }
  replaceChildren(...nodes) {
    this._text = '';
    this.children = [];
    this.append(...nodes);
    if (this.tagName === 'SELECT') this.value = nodes[0]?.value ?? '';
  }
  after(...nodes) {
    if (!this.parent) return;
    for (const n of nodes) n.parent = this.parent;
    this.parent.children.splice(this.parent.children.indexOf(this) + 1, 0, ...nodes);
  }
  all() {
    return this.children.flatMap((n) => [n, ...n.all()]);
  }
  get firstElementChild() {
    return this.children[0];
  }
  querySelector(s) {
    return this.all().find((n) => n.id === s.slice(1));
  }
}
export function visibilityDOM() {
  const host = new VisibilityNode(),
    anchor = new VisibilityNode();
  host.append(anchor);
  const previous = { document: globalThis.document, Option: globalThis.Option };
  globalThis.document = { createElement: (tag) => new VisibilityNode(tag), getElementById: () => anchor };
  globalThis.Option = class extends VisibilityNode {
    constructor(text, value) {
      super('option');
      this.textContent = text;
      this.value = value;
    }
  };
  return {
    host,
    restore() {
      for (const key of Object.keys(previous)) {
        if (previous[key] === undefined) delete globalThis[key];
        else globalThis[key] = previous[key];
      }
    },
  };
}
