# Desktop readiness (W31)

`npm run package:installer` builds the Windows x64 NSIS installer with
`desktop/installer-config.cjs`. It shares the existing Vite, frozen Python engine
and staging pipeline. The existing `package` and `package:preview` portable
commands and portable builder options are unchanged.

The assisted installer defaults to the current user, creates a Start menu link,
offers a **Create a desktop shortcut** checkbox, installs an uninstaller and
preserves user data on uninstall. An upgrade skips the shortcut-choice page and
uses electron-builder's existing shortcut preservation. The app, installer and
uninstaller use the included six-size tesseract icon; `scripts/create-desktop-icon.py`
rebuilds it using the Python standard library. Resource editing supplies the
package version, product name, description and copyright. This configuration
explicitly produces **unsigned** artifacts; signing and update qualification remain
release work.

The installer registers `.polyproj` and `.off` through electron-builder's NSIS
file associations. `4OFF` content uses `.off`; a separate `.4off` association is
not registered. Command-line opens additionally accept the existing `.dxf` and
`.json` import formats. Windows can still require the user to choose a default
app. Registration and uninstall cleanup require real installer verification.

File opens use a single instance per Electron user-data profile. First-launch
paths wait for the renderer; later launches restore/focus the existing ordinary
window. Supported arguments are resolved against the launching process's working
directory; options, option values, URLs and unsupported extensions are ignored.
Use `--` before paths when supplying additional command-line switches. A launch
accepts at most ten paths, with at most forty outstanding requests.

Main-process single-use tokens authorize file reads. The renderer passes tokens
and job IDs, never an arbitrary path. Opens reuse `createWorkspaceReads`, native
`load` validation, cancellation, `ProjectOpening` revision/export fences and the
existing project adoption or geometry-import history. Requests wait for any
ordinary Open/Save already in progress. Replacing a dirty workspace with a project
offers **Keep working** (default) / **Open without saving**; save first to retain
changes. Imported geometry adds a document and does not replace the workspace.

**File → Open Recent** (`workspace-recent`) lists the last ten validated file
reads or successful explicit saves, newest first. The list deduplicates normalized
Windows paths without resolving symlinks. It persists as `recent-files.json` in
`userData`. A validated read may be listed even when subsequent replacement review
is declined. Missing paths/directories are pruned at startup, on list refresh and
after a failed recent open, with a user-visible message. Permission errors retain
the entry. No autosave or catalog preview is added.

**Help → Welcome → Open Recent** uses `welcome-recent-section`, `welcome-recent`,
buttons `welcome-recent-0` through `welcome-recent-9`, and the live status
`welcome-recent-status`. The native menu and Welcome buttons use the same reader.

`window-state.json` in `userData` stores normal bounds and maximized state.
Restoration chooses the current display with the greatest overlap, falls back to
the primary display and clamps the whole window to its work area in Electron DIP
coordinates. Small displays reduce the minimum bounds. Move/resize changes are
debounced, and close synchronously publishes the tiny preferences file. Corrupt
or inaccessible preferences fall back to defaults. Minimized/fullscreen geometry
does not overwrite normal bounds. Monitor changes are checked on the next launch.

`POLYTOPE_TEST_MODE=hidden-no-focus` retains its isolated-profile lock but ignores
OS/argv file opens, skips bounds restoration/persistence and recent-file access,
and never restores, maximizes, shows or focuses a window. Existing explicitly
stubbed Open dialogs continue working. Replacement confirmation uses the same
guarded native dialog API as other prompts.

## Verification

- `node --test tests/desktop-readiness.test.cjs tests/desktop-files.test.mjs tests/hidden-qualification.test.cjs tests/workspace-menu.test.cjs tests/workspace-availability.test.mjs tests/project-workflow.test.mjs tests/project-storage.test.cjs tests/welcome.test.mjs tests/renderer-contract.test.mjs tests/hidden-runtime.test.cjs tests/qualification-launch-mode.test.cjs`
- `python -m pytest tests/test_kernel.py tests/test_project_geometry_reuse.py -q -p no:cacheprovider`
- `npx.cmd vite build --configLoader native`

The new Node files are included in `test:features`. Configuration tests validate
both configurations against the installed electron-builder schema. Main-process
tests execute the real entry with mocked Electron (including read-only submenu
properties), filesystem and engine processes. They create no native windows.
The commands above passed: **119 Node tests**, **89 Python tests**, and the Vite
production build (with its existing large-chunk advisory).

Electron documents [single-instance argument delivery](https://www.electronjs.org/docs/latest/api/app#apprequestsingleinstancelockadditionaldata).
Its [44.5.1 MenuItem implementation](https://github.com/electron/electron/blob/v44.5.1/lib/browser/api/menu-item.ts)
makes `submenu` read-only, so recents mutate the existing submenu through its Menu
API. Installer options follow the [NSIS target](https://www.electron.build/nsis/)
and the installed builder's schema/templates, including per-user shell context.

No Electron launch or full packaging was attempted here. The lead still needs to
verify fresh install/uninstall, upgrade, shortcut selection, file associations,
first/running-instance unsaved review, monitor/DPI restoration and clean-machine
offline operation. Signed distribution and automatic updates are not qualified.
