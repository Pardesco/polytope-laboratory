import {
  createMemories,
  normalizeMemories,
  storeMemory,
  retrieveMemoryEntry,
  swapMemory,
  clearMemory,
} from './model-memories.mjs';
import { bindings, matchesShortcut } from './shortcut-bindings.mjs';
import { MemoryNumericWorkflow } from './memory-numeric-workflow.mjs';

export class MemoryControls {
  constructor(context) {
    this.context = context;
    this.busy = false;
    this.syncGeneration = 0;
    this.derivedAvailable = false;
    const shelf = document.querySelector('.workspace-shelf');
    if (!shelf) throw new Error('Memories require the workspace shelf.');
    this.details = document.createElement('details');
    this.details.id = 'memories-settings';
    this.details.className = 'workspace-disclosure';
    this.details.innerHTML = `<summary>Memories</summary><div class="settings-body" id="memory-controls">
      <label>Slot <select id="memory-slot" aria-label="Model memory slot"></select></label>
      <label>Source <select id="memory-source" aria-label="Model memory source"><option value="base">Model</option><option value="derived">Derived</option></select></label>
      <div class="memory-actions"><button id="memory-store">Store</button><button id="memory-open">Open</button><button id="memory-swap">Swap</button><button id="memory-clear">Clear</button></div></div>`;
    if (typeof context.addStates === 'function') {
      const addition = document.createElement('div');
      addition.id = 'memory-addition';
      addition.innerHTML = `<label>Relative scale <input id="memory-scale" value="1" aria-label="Memory relative scale" inputmode="text"></label>
        <div class="memory-addition-actions"><button id="memory-add">Add</button><button id="memory-blend">Blend (merge)</button><button id="memory-cancel">Cancel</button></div>
        <details id="memory-blend-options"><summary>Blend options</summary><label>Solid winding <select id="memory-fill-rule"><option value="nonzero">Nonzero</option><option value="even-odd">Even / odd</option></select></label><label>Coplanar colors <select id="memory-color-policy"><option value="require-equal">Require equal colors</option><option value="first-source">Use first source</option></select></label></details>
        <p class="muted" id="memory-addition-policy">Scale the stored coordinates about the origin after unit conversion (1e-9 to 1e9; expressions allowed). Add keeps separate components; Blend merges closed 3D interiors into one shell (100 source faces maximum, approximate). Both open a new document with Undo/Redo and replay. Current notes remain; source content stays in snapshots, and stored content stays in the slot.</p>
        <output id="memory-addition-result" class="muted" aria-live="polite"></output>`;
      this.details.querySelector('#memory-controls').append(addition);
    }
    const history = shelf.querySelector('#history-settings');
    if (history) shelf.insertBefore(this.details, history);
    else shelf.append(this.details);
    this.nodes = Object.fromEntries(
      [...this.details.querySelectorAll('[id]')].map((node) => [node.id.replace('memory-', ''), node])
    );
    const panel = this.nodes.controls;
    panel.style.width = 'min(380px, 100%)';
    panel.style.display = 'grid';
    panel.style.gap = 'var(--space-1)';
    for (const row of this.details.querySelectorAll('.memory-actions,.memory-addition-actions')) {
      row.style.display = 'flex';
      row.style.gap = 'var(--space-1)';
      row.style.flexWrap = 'wrap';
      for (const button of row.children) button.style.flex = '1';
    }
    for (let slot = 1; slot <= 9; slot++) this.nodes.slot.add(new Option(`${slot}: Empty`, String(slot)));
    const wrap = (fn) =>
      context.guard
        ? context.guard(fn)
        : async (...args) => {
            try {
              return await fn(...args);
            } catch (error) {
              context.setStatus?.(error.message);
            }
          };
    this.actions = {
      store: wrap((slot) => this.store(slot)),
      open: wrap((slot) => this.open(slot)),
      swap: wrap((slot) => this.swap(slot)),
      clear: wrap((slot) => this.clear(slot)),
      add: wrap((slot) => this.add(slot)),
      blend: wrap((slot) => this.add(slot, { blend: true })),
    };
    for (const action of ['store', 'open', 'swap', 'clear', 'add', 'blend'])
      if (this.nodes[action]) this.nodes[action].onclick = () => this.actions[action]();
    this.numeric = new MemoryNumericWorkflow(context, () => this.additionFields());
    if (this.nodes.cancel) this.nodes.cancel.onclick = () => this.numeric.cancel();
    this.nodes.slot.onchange = () => this.sync();
    this.nodes.source.onchange = () => this.sync();
    this.keyHandler = (event) => this.onKey(event);
    document.addEventListener('keydown', this.keyHandler);
    this.sync();
  }
  selectedSlot() {
    return Number(this.nodes.slot.value);
  }
  bank(project = this.context.getProject()) {
    if (!project) throw new Error('Open a project before using model memories.');
    const bank = normalizeMemories(project.memories);
    project.memories = bank;
    return bank;
  }
  sync() {
    const generation = ++this.syncGeneration,
      project = this.context.getProject(),
      state = this.context.getState();
    let bank, error;
    try {
      if (project) bank = this.bank(project);
    } catch (caught) {
      error = caught;
      this.context.setStatus?.(caught.message);
    }
    if (bank)
      for (let index = 0; index < 9; index++) {
        const entry = bank.slots[index];
        this.nodes.slot.options[index].textContent =
          `${index + 1}: ${entry ? entry.state.model.name || 'Unnamed model' : 'Empty'}`;
      }
    this.derivedAvailable = false;
    const update = () => {
      const unavailable = this.busy || this.context.isExporting?.() || !bank || !state || !!error;
      const occupied = !!bank?.slots[this.selectedSlot() - 1];
      this.nodes.slot.disabled = !!unavailable;
      this.nodes.source.disabled = !!unavailable;
      this.nodes.source.options[1].disabled = !this.derivedAvailable;
      this.nodes.store.disabled = !!unavailable || (this.nodes.source.value === 'derived' && !this.derivedAvailable);
      this.nodes.open.disabled = !!unavailable || !occupied;
      this.nodes.swap.disabled =
        !!unavailable || !occupied || (this.nodes.source.value === 'derived' && !this.derivedAvailable);
      this.nodes.clear.disabled = !!unavailable || !occupied;
      if (this.nodes.add) {
        this.nodes.add.disabled =
          !!unavailable || !occupied || (this.nodes.source.value === 'derived' && !this.derivedAvailable);
        this.nodes.add.title = `Add memory ${this.selectedSlot()} to the selected source model`;
      }
      if (this.nodes.blend) {
        this.nodes.blend.disabled = this.nodes.add.disabled;
        this.nodes.blend.title =
          'Merge the scaled memory with the selected source; native validation requires closed intrinsic 3D components.';
        for (const id of ['scale', 'fill-rule', 'color-policy']) this.nodes[id].disabled = !!unavailable;
        this.nodes.cancel.disabled = !this.busy;
      }
      this.nodes.store.title = `Store in memory ${this.selectedSlot()} (Ctrl+Alt+${this.selectedSlot()})`;
      this.nodes.open.title = `Open memory ${this.selectedSlot()} (Alt+${this.selectedSlot()})`;
      this.nodes.swap.title = `Swap with memory ${this.selectedSlot()} (Alt+Shift+${this.selectedSlot()})`;
    };
    update();
    if (state && this.context.getDerivedState) {
      try {
        const derived = this.context.getDerivedState();
        if (derived && typeof derived.then === 'function')
          derived
            .then((value) => {
              if (generation !== this.syncGeneration) return;
              this.derivedAvailable = !!value;
              update();
            })
            .catch((caught) => {
              if (generation === this.syncGeneration) this.context.setStatus?.(caught.message);
            });
        else {
          this.derivedAvailable = !!derived;
          update();
        }
      } catch (caught) {
        this.context.setStatus?.(caught.message);
      }
    }
  }
  assertCurrent(project, state) {
    if (this.context.getProject() !== project || this.context.getState() !== state)
      throw new Error('Source document changed while the memory action ran. Repeat it from the desired model.');
    if (this.context.isExporting?.())
      throw new Error('Finish or cancel animation export before changing model memories.');
  }
  async capture(project, state) {
    const target = this.nodes.source.value;
    const captured = target === 'derived' ? await this.context.getDerivedState?.() : state;
    this.assertCurrent(project, state);
    if (!captured) throw new Error('The derived model is unavailable. Choose Model or evaluate a derived view first.');
    const source = (await this.context.getSource?.(target)) || {};
    this.assertCurrent(project, state);
    return { state: captured, source };
  }
  async operate(fn) {
    if (this.busy) throw new Error('A model memory action is already running.');
    const project = this.context.getProject(),
      state = this.context.getState();
    if (!project || !state) throw new Error('Open a model before using model memories.');
    this.assertCurrent(project, state);
    this.busy = true;
    this.sync();
    try {
      return await fn(project, state);
    } finally {
      this.busy = false;
      this.sync();
    }
  }
  async store(slot = this.selectedSlot()) {
    return this.operate(async (project, state) => {
      const captured = await this.capture(project, state),
        bank = storeMemory(this.bank(project), slot, captured.state, captured.source);
      this.assertCurrent(project, state);
      project.memories = bank;
      this.nodes.slot.value = String(slot);
      this.context.markDirty();
      this.context.setStatus?.(`Stored ${captured.state.model.name || 'model'} in memory ${slot}.`);
    });
  }
  async open(slot = this.selectedSlot()) {
    return this.operate(async (project, state) => {
      const entry = retrieveMemoryEntry(this.bank(project), slot);
      this.assertCurrent(project, state);
      await this.context.restoreState(entry.state, `Open memory ${slot}`);
      if (this.context.getProject() !== project) throw new Error('Project changed while opening the memory.');
      this.nodes.slot.value = String(slot);
      this.context.setStatus?.(`Opened memory ${slot}: ${entry.state.model.name || 'model'}.`);
    });
  }
  async swap(slot = this.selectedSlot()) {
    return this.operate(async (project, state) => {
      const captured = await this.capture(project, state),
        originalBank = this.bank(project);
      // The authoritative restore verifies both owners immediately before
      // adoption, then commits the slot in that same synchronous publication.
      const swapped = swapMemory(originalBank, slot, captured.state, captured.source);
      this.assertCurrent(project, state);
      let published = false;
      await this.context.restoreState(swapped.state, `Swap memory ${slot}`, {
        verifyPublication: () => {
          this.assertCurrent(project, state);
          if (project.memories !== originalBank)
            throw new Error('Model memories changed while the swap ran. The replacement was discarded.');
        },
        onPublication: () => {
          project.memories = swapped.memories;
          published = true;
        },
      });
      if (this.context.getProject() !== project) throw new Error('Project changed while swapping the memory.');
      if (!published) throw new Error('The model restore did not commit the memory swap.');
      this.nodes.slot.value = String(slot);
      this.context.setStatus?.(`Swapped with memory ${slot}: ${swapped.state.model.name || 'model'}.`);
    });
  }
  async clear(slot = this.selectedSlot()) {
    return this.operate(async (project, state) => {
      const bank = clearMemory(this.bank(project), slot);
      this.assertCurrent(project, state);
      project.memories = bank;
      this.nodes.slot.value = String(slot);
      this.context.markDirty();
      this.context.setStatus?.(`Cleared memory ${slot}.`);
    });
  }
  additionFields() {
    return {
      scale: this.nodes.scale?.value ?? '1',
      source: this.nodes.source.value,
      slot: this.nodes.slot.value,
      fillRule: this.nodes['fill-rule']?.value ?? 'nonzero',
      colorPolicy: this.nodes['color-policy']?.value ?? 'require-equal',
    };
  }
  async add(slot = this.selectedSlot(), { blend = false } = {}) {
    return this.operate(async (project, state) => {
      if (typeof this.context.addStates !== 'function') throw new Error('Model addition is unavailable.');
      const fields = this.additionFields(),
        originalBank = this.bank(project),
        entry = retrieveMemoryEntry(originalBank, slot),
        captured = await this.capture(project, state);
      // Both inputs are detached and representation-validated. Native addition
      // owns geometry validation and the independent result document.
      const current = retrieveMemoryEntry(storeMemory(createMemories(), 1, captured.state, captured.source), 1).state;
      this.assertCurrent(project, state);
      if (project.memories !== originalBank)
        throw new Error('Model memories changed while addition ran. Repeat the action.');
      const verifyBank = () => {
        this.assertCurrent(project, state);
        if (project.memories !== originalBank)
          throw new Error('Model memories changed while addition ran. Repeat the action.');
        if (JSON.stringify(this.additionFields()) !== JSON.stringify(fields))
          throw new Error('Memory addition options changed. Repeat the action.');
      };
      const publish = async ({ relativeScale }, verify = () => {}, { signal } = {}) => {
        const result = await this.context.addStates(current, entry.state, `${blend ? 'Blend' : 'Add'} memory ${slot}`, {
          relativeScale,
          blend,
          fillRule: fields.fillRule,
          colorPolicy: fields.colorPolicy,
          signal,
          verifyPublication: () => {
            verifyBank();
            verify();
          },
        });
        const output = this.nodes['addition-result'];
        if (output) {
          const m = result?.states?.[result.cursor]?.model ?? result,
            residual = m?.metadata?.compoundMerge?.visibleSurface?.maxWindingResidual;
          output.textContent = blend
            ? `Merged at relative scale ${relativeScale}. Approximate winding residual: ${residual === undefined ? 'unavailable' : residual.toExponential(3)}.`
            : `Added at relative scale ${relativeScale}; separate component IDs retained in this result.`;
        }
        return result;
      };
      if (this.nodes.scale) await this.numeric.run(fields.scale, publish);
      else await publish({ relativeScale: 1 });
      if (this.context.getProject() !== project) throw new Error('Project changed while adding the memory.');
      this.nodes.slot.value = String(slot);
      this.context.setStatus?.(`${blend ? 'Blended' : 'Added'} memory ${slot}: ${entry.state.model.name || 'model'}.`);
    });
  }
  onKey(event) {
    if (
      event.defaultPrevented ||
      event.repeat ||
      event.metaKey ||
      !event.altKey ||
      this.busy ||
      this.context.isExporting?.() ||
      event.getModifierState?.('AltGraph')
    )
      return;
    const target = event.target;
    if (
      target?.isContentEditable ||
      target?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]') ||
      document.querySelector('dialog[open]')
    )
      return;
    const match = /^Digit([1-9])$/.exec(event.code || '') || /^([1-9])$/.exec(event.key || '');
    if (!match) return;
    const keyEvent = {
      key: match[1],
      ctrlKey: event.ctrlKey,
      altKey: event.altKey,
      shiftKey: event.shiftKey,
      metaKey: event.metaKey,
    };
    const action = [
      ['memoryOpen', 'open'],
      ['memoryStore', 'store'],
      ['memorySwap', 'swap'],
    ].find(([id]) => bindings[id].keys.some((key) => matchesShortcut(keyEvent, key)))?.[1];
    if (!action) return;
    event.preventDefault();
    this.actions[action](Number(match[1]));
  }
  destroy() {
    this.numeric?.destroy();
    this.syncGeneration++;
    document.removeEventListener('keydown', this.keyHandler);
    this.details.remove();
  }
}
