export class NetAssemblyControls {
  constructor(editor, root, paper) {
    this.editor = editor;
    const $ = editor.$;
    const arrange = document.createElement('button');
    arrange.id = 'net-rearrange';
    arrange.className = 'wide';
    arrange.textContent = 'Re-arrange pieces';
    $('net-rebuild').after(arrange);
    arrange.onclick = editor.guard(() => editor.edit('arrange-pieces', {}));
    const controls = document.createElement('div');
    controls.id = 'net-assembly-controls';
    controls.innerHTML =
      '<label>Number / parts color <select id="net-piece-color"><option value="source">Source face color</option><option value="piece">Piece palette</option><option value="black">Black</option></select></label><label><input id="net-assembly-include" type="checkbox"> Add assembly sheet to PDF</label><button id="net-assembly-svg" class="wide">Export assembly sheet SVG</button><p class="muted">P labels number connected pieces; match identical E labels. Short dashes: valley / glue tabs. Dash-dot: mountain, from the printed side. Score folds before gluing. Assembly sheets capture the main 3D view; packed PDF is recommended for paper-size output.</p>';
    paper.append(controls);
    $('net-assembly-svg').onclick = editor.guard(() =>
      editor.export('svg', { assemblyOnly: true, packed: editor.config().display === 'pages' })
    );
    const change = editor.guard(() => {
      editor.requireEditable();
      const state = editor.getState();
      state.view.netAssembly = { include: $('net-assembly-include').checked, color: $('net-piece-color').value };
      editor.markDirty();
      if (state.netLayout) editor.show(state.netLayout);
    });
    $('net-assembly-include').onchange = change;
    $('net-piece-color').onchange = change;
  }
  sync() {
    const c = this.editor.getState()?.view.netAssembly ?? {};
    this.editor.$('net-assembly-include').checked = c.include === true;
    this.editor.$('net-piece-color').value = c.color ?? 'source';
  }
}
