# Export by goal (U14)

The File / toolbar **Export** action opens six goal cards in `export-dialog`.
The command palette also offers **Export for 3D printing**, **Make a paper
model**, **Save picture**, **Export video**, **Export to Blender or CAD**, and
**Save exact geometry**.

| Card ID | Focused form and default | Existing workflow |
| --- | --- | --- |
| `export-goal-print` | Struts, 100 mm, binary STL; panels / solid / 3MF available | Reviewed printable export, including native mesh checks and size residuals |
| `export-goal-paper` | Continue to Nets | Reveals the existing Unfold faces button in Nets step 1; 4D paper limitations are explained |
| `export-goal-picture` | Landscape PNG, opaque background | Existing reviewed main-view image capture; size presets and transparency |
| `export-goal-video` | Current animation, WebM, landscape | Existing animation / tour export; GIF, MP4, PNG sequence and Reels / square / landscape presets |
| `export-goal-software` | GLB, longest dimension 0.1 m | Displayed geometry; OBJ + MTL, X3D and DXF have purpose / loss hints |
| `export-goal-geometry` | OFF / 4OFF; JSON available | Original source coordinates and incidence; always visible without Expert tools |

The focused fields use `export-focus-<existing-control-id>` and forward edits
to the original controls and their handlers. Numeric expressions still go
through the existing NumericEntry / native validation paths. Geometry uses
the original `confirm-export` primary button and `export-preview` review.
Picture, video and paper use `export-goal-action`; video also offers
`export-video-source` and a **Set up animation / tour** link.

**More options** (`export-all-formats` for geometry, `export-media-more` for
media) contains the existing detailed controls. The original geometry panel,
format list, units, source selector, net SVG/PDF actions and every existing ID
and handler remain intact. Image/media settings are temporarily reparented
and restored on goal changes, close, Escape and before starting an export.
**Export goals** (`export-goal-back`) returns to the cards. **All formats** on
the chooser opens the complete original form. Its existing controls also
respond to `app-chrome-reveal`; desktop smokes now reveal them before use.

Preferences use localStorage key `polytope.export-goals.v1`, independently per
goal, including detailed options and the animation/tour selection. Opening
Export always shows the chooser and marks the last-used card. Selecting it
restores its options. Disabled derived sources are rechecked, and native
availability / unit validation remains authoritative. Denied or malformed
storage falls back to defaults. Preferences do not modify projects, source
geometry or construction history.

## Definitions and limits

“Exact geometry” means preserving the original source data rather than a
projected mesh. It adds no exact-arithmetic guarantee; floating-point source
coordinates remain numerical. JSON retains existing native model data and
certificates as supported by the existing serializer. Save a project to keep
views and history. Native export loss reports remain visible.

Solid mode is disabled with an explanation for non-3D/open source surfaces
and exploded/preview assemblies; struts remain available. This is a cheap UI
preflight, not a manifold or manufacturing certificate. Native checks still
refuse unsupported surfaces and report residuals. Panels need displayed faces.
No new exporters, geometry algorithms, IPC operations or dependencies were
needed: this slice reuses the existing qualified exporters and ownership /
atomic publication flows.

Video exports the current saved sequence or tour. Use **Set up animation**
to add a rotation or record poses; an empty tour needs events first. Existing
codec, frame, size, stereo and resource limits still apply. GPU capture,
Electron native dialogs, physical printers and external 3D applications were
not qualified by this change.

## Verification

- Final focused run: **143 Node tests passed**, including **15 export-goal
  tests**; **111 Python tests passed**; Vite production build and
  `git diff --check` passed. Node/build logs are under
  `artifacts/u14-export-goals/`. Python command:
  `python -m pytest tests/test_export_options.py tests/test_printable_export.py tests/test_interchange.py tests/test_solid_printing.py tests/test_export_metadata.py -q -p no:cacheprovider`.
- `tests/export-goals.test.mjs`: mounted DOM stubs cover all goal mappings,
  defaults, original handler retention, options, storage, source rechecks,
  disabled solid reasons and reveal behavior. Headless Chromium mounts the
  actual dialog and existing controls, prepares/saves native STL, GLB and
  JSON through Python dispatch, and exercises media/paper routing. Screenshots:
  `artifacts/u14-export-goals/chooser.png` and `print.png`.
- Focused existing Node suites cover reviewed saves, stale results,
  NumericEntry, printable/interchange/solid exports, image/media controls,
  target rendering, discovery, walkthroughs and Nets.
- Focused pytest covers export options, printable meshes, interchange, solids
  and export metadata. Production Vite build is required; existing bundle
  size / mixed-import warnings remain.
- No Electron process was launched. Updated desktop smoke access is syntax
  checked; actual native desktop click-through remains for the lead.
