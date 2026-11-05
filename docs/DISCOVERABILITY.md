# Discoverability and model information (W10)

The header Search commands button (`command-search`), Ctrl+K and Ctrl+Shift+P open
`command-palette`. Search indexes the live buttons, labels, fields, select choices,
inspector disclosure paths, renderer action table, full indexed model library and
offline Guide topics. Results include their location and disabled explanation when
available. Arrow keys wrap, Enter runs the existing button/action or focuses a field,
and Escape closes. Inspector results reveal the sidebar, correct tab and all owning
disclosures, then focus and briefly highlight the target. Execution rechecks the live
index so removed or newly disabled controls cannot run. Existing construction/history,
file dialogs, source review and unsaved-close confirmations remain authoritative.

Every inspector summary receives a small `group-help` button, including summaries
mounted later. Group IDs map to bundled Guide topic IDs; new unmapped groups inherit
the owning tab's introduction. F1 uses the focused control's existing context lookup.
New Guide topics cover discovery and metadata. `?` (Shift+/ outside editable fields)
or Help → Keyboard shortcuts opens `shortcut-sheet`. The table is generated from
`desktop/command-bindings.json`, consumed by the native menus and renderer's palette,
memory and tour bindings. Memory/tour shortcuts retain their dialog, text-entry,
AltGraph, busy and export guards.

Analysis → **Model information** (`model-information-summary`) shows saved fields
read-only; **Edit model information** (`metadata-edit`) opens Advanced → **Model
information** (`project-metadata-settings`). Fields are `metadata-title`, `-author`,
`-description`, `-reference` (multiline references/URLs), `-tags` (comma separated),
`-license`, and `-source`. The collapsed advanced section retains `metadata-custom`
and read-only `metadata-source-record`. Press **Save model information**
(`metadata-save`) before saving the native project. The title also names the document
tab. Links and license strings are inert text.

Information lives in the existing current-state `view.documentMetadata`; saving edits
that state, marks the project dirty and invalidates pending project adoption through
the normal revision path. It does not add a geometry history step. Existing operation,
promotion, memory and project snapshots carry these fields. Unchanged saves are a
no-op. Export and stale-owner guards prevent cross-document writes. Draft text survives
syncs for the same state; switching states/documents reloads the saved information.
The separate document Notes field remains independent.

Native projects and JSON retain structured information. OFF/4OFF uses one
`# Polytope Laboratory document: {"metadata":...,"notes":...}` JSON comment;
the native importer restores this envelope. Newlines and Unicode are escaped, so
user text cannot become OFF incidence. Other readers can discard comments; export
review reports this portability limit. Ordinary OFF comments remain ignored;
malformed or duplicate owned envelopes are diagnosed. Metadata is bounded to 128 KiB,
custom editor JSON to 64 KiB, tags to 128 entries of 128 characters, and document notes
to the existing 1 MiB export bound. Unknown metadata fields are retained. No geometry
computation or exactness claim changes.

Validation:

- `python -m pytest tests/test_discoverability_metadata.py tests/test_export_metadata.py tests/test_display_state.py tests/test_export_options.py tests/test_project_geometry_reuse.py -q -p no:cacheprovider` — 62 passed.
- `node --test tests/discoverability.test.mjs tests/document-metadata.test.mjs tests/model-memories.test.mjs tests/tour.test.mjs tests/workspace-menu.test.cjs` — 54 passed.
- `node --test tests/document-field-edits.test.mjs tests/derived-document-context.test.mjs tests/project-workflow.test.mjs tests/workspace-availability.test.mjs tests/geometry-export-session.test.mjs tests/geometry-export.test.cjs tests/memory-tour-publication.test.mjs tests/animation-tour-numeric.test.mjs tests/animated-tour-controls.test.mjs tests/animated-tour-layer.test.mjs tests/animated-tour-renderer.test.mjs tests/viewport-numeric-controls.test.mjs tests/navigation-display.test.mjs tests/renderer-contract.test.mjs` — 196 passed.
- `node --test tests/discoverability.test.mjs tests/document-metadata.test.mjs tests/hidden-qualification.test.cjs tests/qualification-launch-mode.test.cjs tests/hidden-runtime.test.cjs tests/project-storage.test.cjs` — 60 passed (includes 13 repeated feature tests). The main-process VM fixture accepts the new pure binding/menu modules without changing its filesystem, process or Electron mocks. Existing Electron smoke scripts were updated for topic count and metadata location but were not launched.
- `npx.cmd vite build --configLoader native` succeeds (existing large-bundle warning).
- After the build, `node scripts/discoverability-browser-smoke.mjs` exercises the
  mounted application in headless Chromium with the real Python JSON-lines engine
  and a file-dialog bridge fixture: 21 assertions covering both palette shortcuts,
  reveal/focus, contextual help/F1, shortcut sheet, metadata save/Analysis/native
  validation, projection, construction history, catalog loading, disabled commands
  and dynamically mounted groups.

Electron launch was intentionally not attempted. Native menu accelerator delivery,
clipboard/zoom roles and actual file/close dialogs require the lead's desktop click
through. The palette shows up to 80 results; refine the query to find further matches.
Hidden controls remain unavailable until their owning workspace mode enables them.

Files added: `ui/command-index.mjs`, `ui/discoverability-controls.mjs`,
`ui/discoverability.css`, `ui/document-metadata.mjs`, `ui/shortcut-bindings.mjs`,
`desktop/command-bindings.json`, `desktop/discovery-menu.cjs`,
`engine/document_metadata.py`, `tests/discoverability.test.mjs`,
`tests/document-metadata.test.mjs`, `tests/test_discoverability_metadata.py`,
`scripts/discoverability-browser-smoke.mjs`, and this document.

Files updated: `ui/app.js`, `ui/project-metadata-controls.mjs`, `ui/user-guide.mjs`,
`ui/memory-controls.mjs`, `ui/tour-controls.mjs`, `desktop/main.cjs`,
`desktop/preload.cjs`, `engine/display_state.py`, `engine/export_context.py`,
`engine/formats.py`, `package.json`, `tests/hidden-qualification.test.cjs`,
`scripts/guide-quick-smoke.cjs`, and `scripts/feature-0.23-quick-smoke.cjs`.
