const { registerIPCHandlers } = require('./ipc-handlers.cjs');
const { installMenu } = require('./menu.cjs');
const { app, BrowserWindow, ipcMain, dialog, Menu, MenuItem, screen } = require('electron');
const { createStartupProfile, watchEngineReady } = require('./startup-profile.cjs');
const startupProfile = createStartupProfile(process.env.POLYTOPE_STARTUP_PROFILE === '1');
app.polytopeStartupProfile = startupProfile;
const { spawn } = require('node:child_process');
const { EnginePool } = require('./engine-pool.cjs');
const { applyWorkspaceMenu } = require('./workspace-menu.cjs');
const { createPresentationWindow } = require('./presentation-window.cjs');
const {
  parseFileArguments,
  createRecentFiles,
  createOpenRequests,
  focusExistingWindow,
} = require('./desktop-files.cjs');
const { createWindowState } = require('./window-state.cjs');
const commandBindings = require('./command-bindings.json');
const { runDiscoveryMenu } = require('./discovery-menu.cjs');
const path = require('node:path');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const { createFileDialogs } = require('./dialogs.cjs');
const fileDialogs = createFileDialogs({ dialog, getWindow: () => window, path });
const { createProjectStorage } = require('./project-storage.cjs');
const { createNetPrinting } = require('./net-printing.cjs');
let netPrinting;
const projectStorage = createProjectStorage({
  writeProject: (file, project) => engine({ op: 'save', params: { path: file, project } }),
});
const { createTextExport } = require('./text-export.cjs');
const textExports = createTextExport({
  formats: ['csv', 'json', 'svg', 'pdf', 'dxf'],
  selectPath: fileDialogs.textExport,
});
const { createGeometryExport } = require('./geometry-export.cjs');
const { createImageExport } = require('./image-export.cjs');
const imageExports = createImageExport({
  selectPath: fileDialogs.imageExport,
});
const geometryExports = createGeometryExport({
  selectPath: fileDialogs.geometryExport,
});
const { createAnimationExportManager, validateExportOptions } = require('./animation-export.cjs');
const animationExports = createAnimationExportManager();
const jobs = new Map();
const queue = [];
const libraryLoads = new Map();
const { createWorkspaceReads } = require('./workspace-reads.cjs');
const workspaceReads = createWorkspaceReads({
  chooseFile: fileDialogs.openWorkspace,
  read: (file, id) => engine({ op: 'load', params: { path: file } }, id),
  recoveryPath: () => recoveryPath(),
  recoveryBackupPath: () => recoveryPath() + '.bak',
  isInUse: (id) => jobs.has(id) || libraryLoads.has(id) || queue.some((job) => job.jobId === id),
});
const root = path.join(__dirname, '..');
let window,
  dirty = false,
  closeAllowed = false;
const { allowed } = require('./engine-allowlist.cjs');
const formats = { off: 'off', json: 'json', obj: 'obj', stl: 'stl', dxf: 'dxf', vrml: 'wrl', pov: 'pov', svg: 'svg' };
const recoveryPath = () => path.join(app.getPath('userData'), 'recovery.polyproj');
const libraryPreferencesPath = () => path.join(app.getPath('userData'), 'linked-libraries.json');
const qualificationError = (name) =>
  new Error(
    `${name} is unavailable in hidden-no-focus qualification mode. Native dialogs/activation require an explicit test stub or ordinary user mode.`
  );
// Explicit qualification mode, never inferred from packaged/development status.
// Reject malformed opt-ins before readiness/window construction; tests must use
// an isolated profile. This mode is qualified only for the Windows desktop.
const qualificationMode = process.env.POLYTOPE_TEST_MODE;
// Block error boxes even for an invalid opt-in. Do not throw at startup: Electron
// can display a native main-process error box for an uncaught configuration error.
if (qualificationMode !== undefined) {
  for (const name of ['showOpenDialog', 'showSaveDialog', 'showMessageBox'])
    dialog[name] = async () => {
      throw qualificationError(`dialog.${name}`);
    };
  for (const name of ['showOpenDialogSync', 'showSaveDialogSync', 'showMessageBoxSync', 'showErrorBox'])
    dialog[name] = () => {
      throw qualificationError(`dialog.${name}`);
    };
}
const hiddenQualification = qualificationMode === 'hidden-no-focus';
const qualificationProblem =
  qualificationMode !== undefined && !hiddenQualification
    ? 'Unknown POLYTOPE_TEST_MODE; use hidden-no-focus or leave it unset.'
    : hiddenQualification &&
        (process.platform !== 'win32' ||
          !process.env.POLYTOPE_TEST_USER_DATA ||
          !path.isAbsolute(process.env.POLYTOPE_TEST_USER_DATA) ||
          path.resolve(process.env.POLYTOPE_TEST_USER_DATA).toLowerCase() ===
            path.resolve(app.getPath('userData')).toLowerCase())
      ? 'Hidden qualification requires Windows and an absolute isolated POLYTOPE_TEST_USER_DATA profile.'
      : null;
if (qualificationProblem) {
  process.stderr.write(qualificationProblem + '\n');
  app.exit(2);
  return;
}
if (process.env.POLYTOPE_TEST_USER_DATA) app.setPath('userData', process.env.POLYTOPE_TEST_USER_DATA);
if (!app.requestSingleInstanceLock()) {
  app.quit();
  return;
}
const openRequests = createOpenRequests();
const recentFiles = createRecentFiles({ file: path.join(app.getPath('userData'), 'recent-files.json'), io: fs });
const recentTokens = new Map();
let recentMenuEntries = [],
  recentNotice = '';
const windowState = createWindowState({ file: path.join(app.getPath('userData'), 'window-state.json') });
function enqueueOpen(file) {
  openRequests.enqueue(file);
  window?.webContents.send('open-available');
}
function launchFiles(argv, cwd) {
  if (hiddenQualification) return;
  for (const file of parseFileArguments(argv, { packaged: app.isPackaged, cwd }))
    try {
      enqueueOpen(file);
    } catch (error) {
      process.stderr.write(error.message + '\n');
    }
}
launchFiles(process.argv, process.cwd());
app.on('second-instance', (_event, argv, cwd) => {
  if (hiddenQualification) return;
  launchFiles(argv, cwd);
  focusExistingWindow(window, false);
});
app.on('open-file', (event, file) => {
  event.preventDefault();
  if (hiddenQualification) return;
  launchFiles(app.isPackaged ? ['app', file] : ['app', root, file], process.cwd());
  focusExistingWindow(window, false);
});
async function refreshRecentFiles() {
  const result = await recentFiles.list();
  if (result.message) recentNotice = result.message;
  const previous = new Map([...recentTokens].map(([id, file]) => [file, id]));
  recentTokens.clear();
  recentMenuEntries = result.files.map((file) => {
    const id = previous.get(file) || crypto.randomUUID();
    recentTokens.set(id, file);
    return { id, label: path.basename(file), path: file };
  });
  const item = Menu.getApplicationMenu()?.getMenuItemById('workspace-recent');
  if (item) {
    item.submenu.clear();
    for (const entry of recentMenuEntries.length
      ? recentMenuEntries.map((entry) => ({
          label: entry.path.replace(/&/g, '&&'),
          click: () => enqueueOpen(entry.path),
        }))
      : [{ label: 'No recent files', enabled: false }])
      item.submenu.append(new MenuItem(entry));
    Menu.setApplicationMenu(Menu.getApplicationMenu());
  }
  return recentMenuEntries;
}
async function rememberFile(result) {
  if (result?.path && !hiddenQualification)
    try {
      await recentFiles.add(result.path);
      await refreshRecentFiles();
      window?.webContents.send('recent-files-changed');
    } catch (error) {
      process.stderr.write('Recent files: ' + error.message + '\n');
    }
  return result;
}
// Hidden qualification also bypasses Chromium's Windows occlusion classifier.
// Apply before readiness; never change ordinary renderer scheduling or replace
// unrelated caller-provided disabled features. Background throttling remains
// disabled per WebContents; this does not show/activate a native window.
let qualificationScheduling;
if (hiddenQualification) {
  const flag = 'disable-backgrounding-occluded-windows';
  if (!app.commandLine.hasSwitch(flag)) app.commandLine.appendSwitch(flag);
  const feature = 'CalculateNativeWinOcclusion',
    disabled = app.commandLine.getSwitchValue('disable-features');
  if (!disabled.split(',').some((value) => value.trim() === feature))
    app.commandLine.appendSwitch('disable-features', disabled ? disabled + ',' + feature : feature);
  qualificationScheduling = Object.freeze({
    occludedWindowBackgrounding: false,
    nativeWinOcclusion: false,
    disableFeatures: app.commandLine.getSwitchValue('disable-features'),
  });
}

function lockQualificationWindow(created) {
  if (!hiddenQualification) return;
  for (const name of [
    'show',
    'showInactive',
    'focus',
    'restore',
    'maximize',
    'minimize',
    'moveTop',
    'setFullScreen',
    'setKiosk',
    'setAlwaysOnTop',
    'setFocusable',
    'setSkipTaskbar',
    'flashFrame',
  ])
    if (typeof created[name] === 'function')
      Object.defineProperty(created, name, {
        value: () => {
          throw qualificationError(`BrowserWindow.${name}`);
        },
        writable: false,
        configurable: false,
      });
  // Electron exposes property setters as well as methods for these operations.
  for (const name of ['focusable', 'fullScreen', 'simpleFullScreen', 'kiosk'])
    Object.defineProperty(created, name, {
      get: () => false,
      set: () => {
        throw qualificationError(`BrowserWindow.${name}`);
      },
      configurable: false,
    });
  for (const name of ['focus', 'openDevTools', 'inspectElement'])
    if (typeof created.webContents[name] === 'function')
      Object.defineProperty(created.webContents, name, {
        value: () => {
          throw qualificationError(`webContents.${name}`);
        },
        writable: false,
        configurable: false,
      });
  // Print is writable so the harness can supply an explicit callback stub.
  created.webContents.print = () => {
    throw qualificationError('Native printing');
  };
  created.webContents.setAudioMuted(true);
  created.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  created.webContents.on('will-attach-webview', (event) => event.preventDefault());
  created.webContents.on('will-prevent-unload', (event) => event.preventDefault());
}
if (hiddenQualification) {
  Object.defineProperty(app, 'focus', {
    value: () => {
      throw qualificationError('app.focus');
    },
    writable: false,
    configurable: false,
  });
  // These are Electron's actual native entry points, replaced BEFORE readiness.
  // Existing explicit test dialog overrides remain supported and never invoke
  // the originals. No renderer-provided arbitrary destination is introduced.
  app.on('browser-window-created', (_event, created) => lockQualificationWindow(created));
  Object.defineProperty(app, 'polytopeQualification', {
    value: Object.freeze({
      version: 1,
      mode: qualificationMode,
      platform: process.platform,
      profile: app.getPath('userData'),
      windowVisibility: 'hidden',
      focusable: false,
      skipTaskbar: true,
      nativeDialogs: 'blocked-unless-explicitly-stubbed',
      nativePrint: 'blocked-unless-explicitly-stubbed',
      backgroundThrottling: false,
      engineWindowsHide: true,
      scheduling: qualificationScheduling,
    }),
    writable: false,
    configurable: false,
  });
}
function createAppWindow(options) {
  return new BrowserWindow(
    hiddenQualification
      ? {
          ...options,
          show: false,
          focusable: false,
          skipTaskbar: true,
          alwaysOnTop: false,
          fullscreen: false,
          kiosk: false,
          paintWhenInitiallyHidden: true,
          webPreferences: {
            ...options.webPreferences,
            backgroundThrottling: false,
            disableDialogs: true,
            focusOnNavigation: false,
            disableHtmlFullscreenWindowResize: true,
          },
        }
      : options
  );
}

function engine(request, jobId = crypto.randomUUID()) {
  if (jobs.has(jobId) || queue.some((j) => j.jobId === jobId)) return Promise.reject(new Error('Duplicate job ID.'));
  if (jobs.size >= 3) {
    if (queue.length >= 40)
      return Promise.reject(new Error('Job queue is full. Cancel pending work before continuing.'));
    return new Promise((resolve, reject) => queue.push({ request, jobId, resolve, reject }));
  }
  return execute(request, jobId);
}
function drainQueue() {
  while (queue.length && jobs.size < 3) {
    const task = queue.shift();
    execute(task.request, task.jobId).then(task.resolve, task.reject);
  }
}
const enginePool = new EnginePool({
  jobs,
  spawnWorker: () => {
    startupProfile.mark('engine-spawned');
    const executable = app.isPackaged
      ? path.join(process.resourcesPath, 'engine', 'polytope-engine.exe')
      : process.env.POLYTOPE_PYTHON || 'python';
    const args = app.isPackaged ? [] : ['-u', path.join(root, 'engine', 'server.py')];
    return watchEngineReady(
      spawn(executable, args, {
        cwd: app.isPackaged ? process.resourcesPath : root,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          POLYTOPE_CATALOG_CACHE: path.join(app.getPath('userData'), 'catalog-index-v1.json'),
          PYTHONUTF8: '1',
          PYTHONIOENCODING: 'utf-8',
          OPENBLAS_NUM_THREADS: '1',
          OMP_NUM_THREADS: '1',
        },
      }),
      startupProfile
    );
  },
});
function execute(request, jobId) {
  return enginePool.run(request, jobId).finally(drainQueue);
}

function action(name) {
  window?.webContents.send('menu-action', name);
}

const ipcContext = {
  fileDialogs,
  app,
  ipcMain,
  dialog,
  Menu,
  path,
  fs,
  crypto,
  allowed,
  formats,
  engine,
  enginePool,
  queue,
  jobs,
  libraryLoads,
  workspaceReads,
  hiddenQualification,
  qualificationError,
  openRequests,
  recentTokens,
  refreshRecentFiles,
  rememberFile,
  enqueueOpen,
  projectStorage,
  recoveryPath,
  libraryPreferencesPath,
  imageExports,
  textExports,
  geometryExports,
  animationExports,
  validateExportOptions,
  applyWorkspaceMenu,
  createPresentationWindow,
  runDiscoveryMenu,
  createAppWindow,
  createNetPrinting,
  get window() {
    return window;
  },
  set window(value) {
    window = value;
  },
  get dirty() {
    return dirty;
  },
  set dirty(value) {
    dirty = value;
  },
  get netPrinting() {
    return netPrinting;
  },
  set netPrinting(value) {
    netPrinting = value;
  },
  get recentNotice() {
    return recentNotice;
  },
  set recentNotice(value) {
    recentNotice = value;
  },
};

app.whenReady().then(async () => {
  startupProfile.mark('electron-ready');
  registerIPCHandlers(ipcContext);
  installMenu({ Menu, commandBindings, action, hiddenQualification });
  const restored = hiddenQualification
    ? {}
    : windowState.load([screen.getPrimaryDisplay(), ...screen.getAllDisplays()]);
  const { maximized, ...bounds } = restored;
  window = createAppWindow({
    width: 1500,
    height: 960,
    minWidth: 1050,
    minHeight: 720,
    ...bounds,
    icon: path.join(__dirname, 'assets', 'polytope.ico'),
    backgroundColor: '#101722',
    title: 'Polytope Laboratory',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  startupProfile.mark('window-created');
  if (!hiddenQualification) {
    windowState.track(window);
    await refreshRecentFiles().catch((error) => process.stderr.write('Recent files: ' + error.message + '\n'));
  }
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.on('closed', () => netPrinting.dispose());
  window.on('enter-full-screen', () => window.webContents.send('fullscreen-changed', true));
  window.on('leave-full-screen', () => window.webContents.send('fullscreen-changed', false));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.on('close', async (event) => {
    if (hiddenQualification) return;
    if (dirty && !closeAllowed) {
      event.preventDefault();
      const result = await fileDialogs.confirmClose();
      if (result.response === 1) {
        closeAllowed = true;
        window.close();
      }
    }
  });
  if (!hiddenQualification)
    window.on('ready-to-show', () => {
      if (maximized) window.maximize();
      window.show();
    });
  window.loadFile(path.join(root, 'dist', 'index.html'));
});
app.on('window-all-closed', () => {
  netPrinting?.dispose();
  workspaceReads.dispose();
  for (const job of libraryLoads.values()) job.cancelled = true;
  textExports.dispose();
  geometryExports.dispose();
  imageExports.dispose();
  enginePool.dispose();
  animationExports.abortAll().finally(() => app.quit());
});
