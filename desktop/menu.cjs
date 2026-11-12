function installMenu({ Menu, commandBindings, action, hiddenQualification }) {
  const menu = [
    {
      label: 'File',
      submenu: [
        { label: 'New document', accelerator: commandBindings.new.keys[0], click: () => action('new') },
        { label: 'Open…', accelerator: commandBindings.open.keys[0], click: () => action('open') },
        {
          id: 'workspace-save',
          enabled: false,
          label: 'Save project…',
          accelerator: commandBindings.save.keys[0],
          click: () => action('save'),
        },
        { label: 'Recover autosave', click: () => action('recover') },
        { type: 'separator' },
        { id: 'workspace-export', enabled: false, label: 'Export model…', click: () => action('export') },
        { id: 'workspace-image', enabled: false, label: 'Save image…', click: () => action('image') },
        {
          id: 'workspace-print',
          enabled: false,
          label: 'Print…',
          accelerator: commandBindings.print.keys[0],
          click: () => action('print'),
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        {
          id: 'workspace-undo',
          enabled: false,
          label: 'Undo geometry',
          accelerator: commandBindings.undo.keys[0],
          click: () => action('undo'),
        },
        {
          id: 'workspace-redo',
          enabled: false,
          label: 'Redo geometry',
          accelerator: commandBindings.redo.keys[0],
          click: () => action('redo'),
        },
        { type: 'separator' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          id: 'workspace-reset',
          enabled: false,
          label: 'Reset camera',
          accelerator: commandBindings.reset.keys[0],
          click: () => action('reset'),
        },
        { label: 'Fullscreen', accelerator: commandBindings.fullscreen.keys[0], click: () => action('fullscreen') },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'resetZoom' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Welcome', click: () => action('welcome') },
        { label: 'What?s new', click: () => action('whatsnew') },
        { label: 'Search commands', accelerator: commandBindings.commands.keys[0], click: () => action('commands') },
        { label: 'Keyboard shortcuts', click: () => action('shortcuts') },
        { label: 'User guide', accelerator: commandBindings.help.keys[0], click: () => action('help') },
        {
          label: 'About',
          click: () =>
            dialog.showMessageBox(window, {
              title: 'Polytope Laboratory',
              message: 'Polytope Laboratory ' + app.getVersion(),
              detail:
                'Offline 3D/4D mathematical workspace. Convex operations use float64 predicates. Early community preview. Current focus: usability, performance and reliability.',
            }),
        },
      ],
    },
  ];
  menu
    .find((group) => group.label === 'View')
    .submenu.splice(2, 0, {
      label: 'Presentation',
      accelerator: commandBindings.presentation.keys[0],
      click: () => action('presentation'),
    });
  menu
    .find((group) => group.label === 'Help')
    .submenu.splice(1, 0, { label: 'Learn 4D', click: () => action('learn4d') });
  menu[0].submenu.splice(2, 0, {
    id: 'workspace-recent',
    label: 'Open Recent',
    submenu: [{ label: 'No recent files', enabled: false }],
  });
  for (const group of menu)
    for (const item of group.submenu)
      if (item.role && commandBindings[item.role]?.keys.length) item.accelerator = commandBindings[item.role].keys[0];
  Menu.setApplicationMenu(hiddenQualification ? null : Menu.buildFromTemplate(menu));
}
module.exports = { installMenu };
