const { createDialogs } = require('./dialogs.cjs');
function registerIPCHandlers(ctx) {
  const {
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
  } = ctx;
  function trusted(event) {
    if (
      !ctx.window ||
      event.sender !== ctx.window.webContents ||
      event.senderFrame !== ctx.window.webContents.mainFrame
    )
      throw new Error('Untrusted IPC sender.');
  }
  function handle(channel, fn) {
    ipcMain.handle(channel, async (event, ...args) => {
      trusted(event);
      return fn(...args);
    });
  }

  const dialogs = createDialogs(
    Object.create(ctx, {
      printDocument: { value: printDocument },
      packedPrintDocument: { value: packedPrintDocument },
    })
  );
  handle('engine', (request, id) => {
    if (!request || !allowed.has(request.op)) throw new Error('Operation is unavailable through the geometry API.');
    if (libraryLoads.has(id) || workspaceReads.has(id)) throw Error('Duplicate job ID.');
    return engine(request, id);
  });
  handle('cancel', (id) => {
    const library = libraryLoads.get(id);
    if (library) library.cancelled = true;
    const file = workspaceReads.cancel(id);
    if (enginePool.cancel(id)) return true;
    const i = queue.findIndex((j) => j.jobId === id);
    if (i >= 0) {
      queue.splice(i, 1)[0].reject(new Error('Queued job cancelled.'));
      return true;
    }
    return Boolean(library) || file;
  });
  handle('open', async (id) => rememberFile(await workspaceReads.open(id)));
  handle('recent-files', async () => {
    if (hiddenQualification) return { files: [], message: '' };
    const files = await refreshRecentFiles(),
      message = ctx.recentNotice;
    ctx.recentNotice = '';
    return { files, message };
  });
  handle('request-recent', (id) => {
    if (hiddenQualification) throw qualificationError('Recent files');
    const file = recentTokens.get(id);
    if (!file) throw Error('The recent list changed. Choose the file again.');
    enqueueOpen(file);
  });
  handle('take-open-request', () => (hiddenQualification ? null : openRequests.take()));
  handle('discard-open-request', (token) => openRequests.discard(token));
  handle('open-requested', async (token, id) => {
    if (hiddenQualification) throw qualificationError('External file opening');
    const file = openRequests.consume(token);
    try {
      return await rememberFile(await workspaceReads.openPath(file, id));
    } catch (error) {
      if (/No such file|cannot find|WinError 2|Errno 2|ENOENT|ENOTDIR/.test(error.message)) {
        await refreshRecentFiles();
        ctx.window?.webContents.send('recent-files-changed');
        throw Error('The file is missing and was removed from Open Recent: ' + file);
      }
      throw error;
    }
  });
  handle('confirm-project-open', dialogs.confirmProjectOpen);
  handle('import-tour', dialogs.importTour);
  handle('export-tour', dialogs.exportTour);
  handle('save', dialogs.save);
  handle('autosave', (project) => projectStorage.publish(recoveryPath(), project));
  handle('recover', (id) => workspaceReads.recover(id));
  handle('recovery-info', async () => {
    for (const file of [recoveryPath(), recoveryPath() + '.bak'])
      try {
        const s = await fs.stat(file);
        return { modified: s.mtime.toISOString() };
      } catch {}
    return null;
  });
  handle('startup-info', () => ({ hidden: hiddenQualification, fullscreen: ctx.window?.isFullScreen() ?? false }));
  handle('dirty', (value) => {
    ctx.dirty = Boolean(value);
  });
  handle('workspace-availability', (value) => applyWorkspaceMenu(Menu.getApplicationMenu(), value));
  handle('export', dialogs.export);
  handle('save-image', (data) => imageExports.save(data));
  handle('image-export-begin', (id, params) => imageExports.begin(id, params));
  handle('image-export-write', (id, data) => imageExports.write(id, data));
  handle('image-export-abort', (id) => imageExports.abort(id));
  handle('save-svg', dialogs.saveSvg);
  const libraryPaths = new Map();
  let linkedRoots = [],
    libraryAudits = {},
    libraryQueue = Promise.resolve();
  function libraryTask(fn) {
    const task = libraryQueue.then(fn);
    libraryQueue = task.catch(() => {});
    return task;
  }
  async function indexLinkedRoot(
    directory,
    auditPath = libraryAudits[path.resolve(directory)],
    verifyAuditHashes = false
  ) {
    const resolved = path.resolve(directory),
      realRoot = await fs.realpath(resolved);
    let entries, auditError;
    try {
      entries = await engine({
        op: 'library',
        params: {
          path: resolved,
          ...(auditPath ? { audit_path: auditPath } : {}),
          ...(verifyAuditHashes ? { verify_audit_hashes: true } : {}),
        },
      });
    } catch (error) {
      if (!auditPath) throw error;
      auditError = error.message;
      entries = await engine({ op: 'library', params: { path: resolved } });
    }
    const capabilities = [];
    for (const entry of entries) {
      if (!entry.supported) continue;
      const realPath = await fs.realpath(entry.key);
      const relative = path.relative(realRoot, realPath);
      if (relative.startsWith('..' + path.sep) || relative === '..' || path.isAbsolute(relative))
        throw new Error('Linked file resolves outside its catalog folder.');
      capabilities.push([path.resolve(entry.key), realPath, entry.relativePath]);
    }
    return { path: resolved, entries, capabilities, auditPath, auditError };
  }
  function authorizeLinkedRoot(library) {
    for (const [file, realPath, relativePath] of library.capabilities) {
      const roots = libraryPaths.get(file)?.roots || new Map();
      roots.set(library.path, relativePath);
      libraryPaths.set(file, { realPath, roots });
    }
    return {
      path: library.path,
      entries: library.entries,
      auditPath: library.auditPath,
      auditError: library.auditError,
    };
  }
  async function saveLinkedRoots(paths, audits = libraryAudits) {
    await fs.mkdir(app.getPath('userData'), { recursive: true });
    const target = libraryPreferencesPath(),
      pending = target + '.' + crypto.randomUUID() + '.pending';
    try {
      await fs.writeFile(
        pending,
        JSON.stringify(
          { version: 1, paths, audits: Object.fromEntries(paths.filter((p) => audits[p]).map((p) => [p, audits[p]])) },
          null,
          2
        )
      );
      await fs.rename(pending, target);
    } finally {
      await fs.unlink(pending).catch((e) => {
        if (e.code !== 'ENOENT') throw e;
      });
    }
  }
  // Restore only directories previously chosen through the native picker.
  handle('libraries', () =>
    libraryTask(async () => {
      let stored;
      try {
        stored = JSON.parse(await fs.readFile(libraryPreferencesPath(), 'utf8'));
      } catch (e) {
        if (e.code === 'ENOENT') return { libraries: [], errors: [] };
        throw new Error('Could not read linked library preferences: ' + e.message);
      }
      if (
        stored.version !== 1 ||
        !Array.isArray(stored.paths) ||
        stored.paths.length > 32 ||
        stored.paths.some((p) => typeof p !== 'string' || !path.isAbsolute(p))
      )
        throw new Error('Invalid linked library preferences.');
      linkedRoots = [...new Set(stored.paths.map((p) => path.resolve(p)))];
      if (
        stored.audits !== undefined &&
        (typeof stored.audits !== 'object' || stored.audits === null || Array.isArray(stored.audits))
      )
        throw new Error('Invalid library audit preferences.');
      libraryAudits = {};
      for (const directory of linkedRoots) {
        const audit = stored.audits?.[directory];
        if (audit) {
          if (typeof audit !== 'string' || !path.isAbsolute(audit)) throw new Error('Invalid saved audit path.');
          const relative = path.relative(path.join(app.getPath('userData'), 'library-audits'), audit);
          if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative))
            throw new Error('Saved audit path is outside the application evidence folder.');
          libraryAudits[directory] = audit;
        }
      }
      libraryPaths.clear();
      const libraries = [],
        errors = [];
      for (const directory of linkedRoots) {
        try {
          libraries.push(authorizeLinkedRoot(await indexLinkedRoot(directory)));
        } catch (e) {
          errors.push({ path: directory, error: e.message });
        }
      }
      return { libraries, errors };
    })
  );
  handle('library', () =>
    libraryTask(async () => {
      const { canceled, filePaths } = await fileDialogs.chooseLibrary();
      if (canceled) return null;
      const directory = path.resolve(filePaths[0]);
      if (!linkedRoots.includes(directory) && linkedRoots.length >= 32)
        throw new Error('Up to 32 linked catalog folders are supported. Remove a link before adding another.');
      const result = await indexLinkedRoot(directory);
      const updated = [...new Set([...linkedRoots, directory])];
      await saveLinkedRoots(updated);
      linkedRoots = updated;
      return authorizeLinkedRoot(result);
    })
  );
  handle('unlink-library', (directory) =>
    libraryTask(async () => {
      if (typeof directory !== 'string' || !linkedRoots.includes(path.resolve(directory)))
        throw new Error('This folder is not a linked catalog.');
      const resolved = path.resolve(directory),
        updated = linkedRoots.filter((p) => p !== resolved);
      await saveLinkedRoots(updated);
      linkedRoots = updated;
      delete libraryAudits[resolved];
      for (const [file, entry] of libraryPaths) {
        entry.roots.delete(resolved);
        if (!entry.roots.size) libraryPaths.delete(file);
      }
      return { path: resolved };
    })
  );
  handle('attach-library-audit', (directory) =>
    libraryTask(async () => {
      if (typeof directory !== 'string' || !linkedRoots.includes(path.resolve(directory)))
        throw new Error('Choose a linked library folder.');
      const resolved = path.resolve(directory);
      const { canceled, filePaths } = await fileDialogs.chooseLibraryAudit();
      if (canceled) return null;
      const evidenceDirectory = path.join(app.getPath('userData'), 'library-audits');
      await fs.mkdir(evidenceDirectory, { recursive: true });
      const output = path.join(evidenceDirectory, crypto.randomUUID() + '.library-index.json');
      await engine({ op: 'library-audit-index', params: { report_path: filePaths[0], output_path: output } });
      const library = await indexLinkedRoot(resolved, output);
      if (library.auditError) throw new Error(library.auditError);
      const audits = { ...libraryAudits, [resolved]: output };
      await saveLinkedRoots(linkedRoots, audits);
      libraryAudits = audits;
      return authorizeLinkedRoot(library);
    })
  );
  handle('verify-library-audit', (directory) =>
    libraryTask(async () => {
      if (typeof directory !== 'string' || !linkedRoots.includes(path.resolve(directory)))
        throw new Error('Choose a linked library folder.');
      const resolved = path.resolve(directory);
      if (!libraryAudits[resolved]) throw new Error('Attach importer audit evidence first.');
      return authorizeLinkedRoot(await indexLinkedRoot(resolved, libraryAudits[resolved], true));
    })
  );
  handle('repair-library-copy', async (p) => {
    if (typeof p !== 'string') throw new Error('Choose a linked OFF file.');
    const entry = libraryPaths.get(path.resolve(p));
    if (!entry) throw new Error('This file is not in a supported linked catalog.');
    if ((await fs.realpath(p)) !== entry.realPath) throw new Error('Linked file location changed; relink its folder.');
    const { canceled, filePath } = await fileDialogs.repairLibraryCopy(p);
    if (canceled) return null;
    try {
      await fs.lstat(filePath);
      throw new Error('Choose a new copy filename; existing files cannot be overwritten.');
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
    return engine({ op: 'library-edge-count-copy', params: { source_path: p, output_path: filePath } });
  });
  handle('library-model', async (p, id = crypto.randomUUID()) => {
    if (typeof p !== 'string') throw new Error('Choose a linked OFF file.');
    if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(id)) throw Error('Use a bounded library load ID.');
    if (libraryLoads.has(id) || workspaceReads.has(id) || jobs.has(id) || queue.some((job) => job.jobId === id))
      throw Error('Duplicate job ID.');
    if (libraryLoads.size >= 40) throw Error('Finish or cancel pending linked model loads before opening more.');
    const entry = libraryPaths.get(path.resolve(p));
    if (!entry) throw new Error('This geometry is not in a supported linked catalog.');
    const pending = { cancelled: false };
    libraryLoads.set(id, pending);
    try {
      const [directory, relativePath] = [...entry.roots][0];
      if ((await fs.realpath(p)) !== entry.realPath)
        throw new Error('Linked file location changed. Relink its catalog folder before loading it.');
      if (pending.cancelled) throw Error('Linked model loading cancelled.');
      const result = await engine({ op: 'load', params: { path: p } }, id);
      if (pending.cancelled) throw Error('Linked model loading cancelled.');
      result.model.metadata.linkedLibraryRoot = directory;
      result.model.metadata.linkedRelativePath = relativePath;
      return result;
    } finally {
      libraryLoads.delete(id);
    }
  });
  async function printDocument(svg, onWindow = () => {}) {
    if (typeof svg !== 'string' || !svg.startsWith('<svg') || svg.length > 16 * 1024 * 1024)
      throw new Error('Choose a 3D face net before printing.');
    const width = Number(svg.match(/width="([\d.e+-]+)mm"/)?.[1]),
      height = Number(svg.match(/height="([\d.e+-]+)mm"/)?.[1]);
    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width <= 0 ||
      height <= 0 ||
      Math.max(width, height) > 2000
    )
      throw new Error('Net page dimensions must be positive and no larger than 2,000 mm.');
    const printWindow = createAppWindow({
      show: false,
      webPreferences: { sandbox: true, nodeIntegration: false, contextIsolation: true, javascript: false },
    });
    const html = `<!doctype html><html><head><title>Polytope Laboratory - Net</title><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:"><style>@page {size:${width + 20}mm ${height + 20}mm;margin:10mm}body{margin:0}svg{display:block;width:${width}mm;height:${height}mm}</style></head><body>${svg}</body></html>`;
    try {
      onWindow(printWindow);
      await printWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    } catch (error) {
      if (!printWindow.isDestroyed()) printWindow.destroy();
      throw error;
    }
    return { printWindow, width, height };
  }
  handle('print', async (svg) => {
    const { id } = await ctx.netPrinting.begin(crypto.randomUUID(), { packed: false, content: svg });
    return ctx.netPrinting.commit(id);
  });
  handle('save-net-pdf', dialogs.saveNetPdf);
  async function packedPrintDocument(pages, onWindow = () => {}) {
    if (
      !Array.isArray(pages) ||
      !pages.length ||
      pages.length > 250 ||
      pages.some((svg) => typeof svg !== 'string' || !svg.startsWith('<svg')) ||
      pages.reduce((sum, svg) => sum + svg.length, 0) > 32 * 1024 * 1024
    )
      throw new Error('Choose a valid packed net preview with up to 250 pages.');
    const dimensions = pages.map((svg) =>
      ['width', 'height'].map((key) => Number(svg.match(new RegExp(key + '="([\\d.e+-]+)mm"'))?.[1]))
    );
    const [width, height] = dimensions[0];
    if (
      dimensions.some(
        (d) => d.some((x) => !Number.isFinite(x) || x < 20 || x > 2000) || d[0] !== width || d[1] !== height
      )
    )
      throw new Error('Packed pages must have equal finite paper dimensions in 20–2,000 mm.');
    const printWindow = createAppWindow({
      show: false,
      webPreferences: { sandbox: true, nodeIntegration: false, contextIsolation: true, javascript: false },
    });
    const html = `<!doctype html><html><head><title>Polytope Laboratory - Net</title><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:"><style>@page{size:${width}mm ${height}mm;margin:0}body{margin:0}.page{position:relative;width:${width}mm;height:calc(${height}mm - 1px);break-after:page;overflow:hidden}.page:last-child{break-after:auto}svg{position:absolute;top:0;left:0;display:block;width:${width}mm;height:${height}mm}</style></head><body>${pages.map((svg) => '<section class="page">' + svg + '</section>').join('')}</body></html>`;
    try {
      onWindow(printWindow);
      await printWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
      return printWindow;
    } catch (e) {
      if (!printWindow.isDestroyed()) printWindow.destroy();
      throw e;
    }
  }
  ctx.netPrinting = createNetPrinting({
    prepare: async ({ packed, content }, track) =>
      packed ? await packedPrintDocument(content, track) : (await printDocument(content, track)).printWindow,
    print: (printWindow) =>
      new Promise((resolve, reject) =>
        printWindow.webContents.print({ printBackground: true, scaleFactor: 100 }, (ok, reason) =>
          ok
            ? resolve(true)
            : /cancel/i.test(reason ?? '')
              ? resolve(false)
              : reject(Error(reason || 'Net printing failed.'))
        )
      ),
  });
  handle('net-print-begin', (id, params) => ctx.netPrinting.begin(id, params));
  handle('net-print-commit', (id) => ctx.netPrinting.commit(id));
  handle('net-print-abort', (id) => ctx.netPrinting.cancel(id));
  handle('save-packed-net-pdf', dialogs.savePackedNetPdf);
  handle('render-packed-net-pdf', async (pages) => {
    const printWindow = await packedPrintDocument(pages);
    try {
      return new Uint8Array(
        await printWindow.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true, scale: 1 })
      );
    } finally {
      printWindow.destroy();
    }
  });
  handle('text-export-begin', (params) => textExports.begin(params));
  handle('text-export-write', (id, data) => textExports.write(id, data));
  handle('text-export-abort', (id) => textExports.abort(id));
  handle('geometry-export-begin', (params) => geometryExports.begin(params));
  handle('geometry-export-write', (id, data) => geometryExports.write(id, data));
  handle('geometry-export-abort', (id) => geometryExports.abort(id));
  handle('print-packed-nets', async (pages) => {
    const { id } = await ctx.netPrinting.begin(crypto.randomUUID(), { packed: true, content: pages });
    return ctx.netPrinting.commit(id);
  });
  handle('fullscreen', () => {
    ctx.window.setFullScreen(!ctx.window.isFullScreen());
    return ctx.window.isFullScreen();
  });
  handle(
    'presentation-window',
    createPresentationWindow({ getWindow: () => ctx.window, hidden: () => hiddenQualification })
  );
  handle('discovery-menu', (name) => runDiscoveryMenu(name, { window: ctx.window, app, dialog }));
  handle('animation-begin', dialogs.animationBegin);
  handle('animation-write', (id, index, data) => animationExports.write(id, index, data));
  handle('animation-finish', (id) => animationExports.finish(id));
  handle('animation-abort', (id) => animationExports.abort(id));
}
module.exports = { registerIPCHandlers };
