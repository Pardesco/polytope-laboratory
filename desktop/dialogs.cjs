function createDialogs(ctx) {
  const {
    dialog,
    engine,
    projectStorage,
    rememberFile,
    formats,
    path,
    fs,
    animationExports,
    validateExportOptions,
    printDocument,
    packedPrintDocument,
  } = ctx;
  return {
    confirmProjectOpen: async () =>
      !ctx.dirty ||
      (
        await dialog.showMessageBox(ctx.window, {
          type: 'question',
          buttons: ['Keep working', 'Open without saving'],
          defaultId: 0,
          cancelId: 0,
          message: 'Open project with unsaved changes?',
          detail: 'Opening a project replaces the workspace. Save first to keep your latest changes.',
        })
      ).response === 1,
    importTour: async () => {
      const { canceled, filePaths } = await dialog.showOpenDialog(ctx.window, {
        properties: ['openFile'],
        filters: [{ name: 'Saved tour', extensions: ['polytour', 'json'] }],
      });
      return canceled ? null : engine({ op: 'load-tour', params: { path: filePaths[0] } });
    },
    exportTour: async (tour) => {
      const { canceled, filePath } = await dialog.showSaveDialog(ctx.window, {
        defaultPath: 'Models.polytour',
        filters: [{ name: 'Saved tour', extensions: ['polytour'] }],
      });
      return canceled ? null : engine({ op: 'save-tour', params: { path: filePath, tour } });
    },
    save: async (project) => {
      const { canceled, filePath } = await dialog.showSaveDialog(ctx.window, {
        defaultPath: 'Untitled.polyproj',
        filters: [{ name: 'Polytope project', extensions: ['polyproj'] }],
      });
      if (canceled) return null;
      return rememberFile(await projectStorage.publish(filePath, project));
    },
    export: async (model, format) => {
      if (!formats[format] || format === 'svg') throw new Error('Unsupported model format.');
      const { canceled, filePath } = await dialog.showSaveDialog(ctx.window, {
        defaultPath: (model.name.replace(/[^a-zA-Z0-9 _-]/g, '') || 'Model') + '.' + formats[format],
        filters: [{ name: format.toUpperCase(), extensions: [formats[format]] }],
      });
      if (canceled) return null;
      return engine({ op: 'export', model, params: { format, path: filePath } });
    },
    saveSvg: async (svg, name = 'Net.svg') => {
      if (typeof svg !== 'string' || svg.length > 16 * 1024 * 1024 || !svg.startsWith('<svg'))
        throw new Error('Invalid SVG.');
      const { canceled, filePath } = await dialog.showSaveDialog(ctx.window, {
        defaultPath: path.basename(String(name)),
        filters: [{ name: 'SVG geometry', extensions: ['svg'] }],
      });
      if (canceled) return null;
      await fs.writeFile(filePath, svg, 'utf8');
      return { path: filePath };
    },
    saveNetPdf: async (svg) => {
      const { canceled, filePath } = await dialog.showSaveDialog(ctx.window, {
        defaultPath: 'Net.pdf',
        filters: [{ name: 'PDF net', extensions: ['pdf'] }],
      });
      if (canceled) return null;
      const { printWindow } = await printDocument(svg);
      try {
        const data = await printWindow.webContents.printToPDF({
          printBackground: true,
          preferCSSPageSize: true,
          scale: 1,
        });
        await fs.writeFile(filePath, data);
        return { path: filePath };
      } finally {
        printWindow.destroy();
      }
    },
    savePackedNetPdf: async (pages) => {
      const { canceled, filePath } = await dialog.showSaveDialog(ctx.window, {
        defaultPath: 'Packed nets.pdf',
        filters: [{ name: 'PDF paper nets', extensions: ['pdf'] }],
      });
      if (canceled) return null;
      const printWindow = await packedPrintDocument(pages);
      try {
        await fs.writeFile(
          filePath,
          await printWindow.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true, scale: 1 })
        );
        return { path: filePath };
      } finally {
        printWindow.destroy();
      }
    },
    animationBegin: async (options) => {
      const spec = validateExportOptions(options);
      const extension = spec.format === 'png' ? 'frames' : spec.format;
      const { canceled, filePath } = await dialog.showSaveDialog(ctx.window, {
        defaultPath: spec.name + '.' + extension,
        filters: [
          {
            name: spec.format === 'png' ? 'New PNG sequence folder' : spec.format.toUpperCase() + ' animation',
            extensions: [extension],
          },
        ],
      });
      return canceled ? null : animationExports.begin(options, filePath);
    },
  };
}
function createFileDialogs({ dialog, getWindow, path }) {
  return {
    textExport: ({ format, defaultName }) =>
      dialog.showSaveDialog(getWindow(), {
        defaultPath: defaultName,
        filters: [{ name: format.toUpperCase() + ' supporting data', extensions: [format] }],
      }),
    imageExport: ({ defaultName }) =>
      dialog.showSaveDialog(getWindow(), {
        defaultPath: defaultName,
        filters: [{ name: 'PNG image', extensions: ['png'] }],
      }),
    geometryExport: ({ format, defaultName }) =>
      dialog.showSaveDialog(getWindow(), {
        defaultPath: defaultName,
        filters: [{ name: format.toUpperCase() + ' geometry', extensions: [format === 'vrml' ? 'wrl' : format] }],
      }),
    openWorkspace: () =>
      dialog.showOpenDialog(getWindow(), {
        properties: ['openFile'],
        filters: [{ name: 'Polytope projects and geometry', extensions: ['polyproj', 'off', 'dxf', 'json'] }],
      }),
    chooseLibrary: () => dialog.showOpenDialog(getWindow(), { properties: ['openDirectory'] }),
    chooseLibraryAudit: () =>
      dialog.showOpenDialog(getWindow(), {
        properties: ['openFile'],
        filters: [{ name: 'Importer audit or compact evidence index', extensions: ['json'] }],
      }),
    repairLibraryCopy: (p) =>
      dialog.showSaveDialog(getWindow(), {
        defaultPath: path.basename(p, '.off') + '-corrected.off',
        filters: [{ name: 'Validated OFF copy', extensions: ['off'] }],
      }),
    confirmClose: () =>
      dialog.showMessageBox(getWindow(), {
        type: 'question',
        buttons: ['Keep working', 'Close'],
        defaultId: 0,
        cancelId: 0,
        message: 'Close with unsaved changes?',
        detail: 'A recovery snapshot is saved every 30 seconds. Save your project to preserve the latest changes.',
      }),
  };
}
module.exports = { createDialogs, createFileDialogs };
