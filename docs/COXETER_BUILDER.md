# Shape builder (U6)

Open **Library → Build from symmetry** or **Construct → Shape builder · Coxeter diagrams**, search commands for
**Shape builder**, or call `window.openCoxeterBuilder()`. The public function
also serves the Library/gallery entry points owned by other UX packages.

Choose a visual symmetry chip, then click diagram nodes to add/remove rings.
At least one ring remains selected. Arrows move focus between nodes, Space
toggles a ring, and Enter on a node opens the current completed preview.
The panel is a nonmodal dialog; Close/Escape cancels work and removes the preview.
Its header and Open button stay reachable on smaller desktop windows.

- Families: A3, B3, H3, A4, B4, D4, F4, H4. D4 has a true three-arm branch,
  with node 1 central (zero-based). All 96 nonempty ring patterns are supported.
- Chains omit branch label 3, following Coxeter–Dynkin convention; 4/5 are shown.
  A ring sets a positive equal chamber weight; an unringed node has weight zero.
- B3/H3 offer **Twist into a snub shape**, which selects all three nodes.
  **Mirror twist** switches the existing engine's A/B coordinate convention;
  no absolute left/right convention is claimed. Removing a ring exits snub mode.
- Names use the local uniform catalog, including Bowers aliases in native
  metadata and equivalent diagrams under reversal, D4 triality and enhanced F4
  symmetry. Unsupported future catalog matches fall back to diagram notation.

`coxeter-build` is a reusable native computation. The 3D path reuses the finite
reflection/hull implementation. The 4D path reuses parabolic face orbits from
`uniform4.py`, extended to graph-connected subdiagrams for D4. No Qhull rebuild
is needed for dense H4 boundaries. The maximum orbit is 14,400 vertices;
the existing native finite-orbit resource ceiling remains 20,000.

The main viewport's separately rendered overlay is explicitly labeled
**Unsaved shape preview**. Preview requests debounce for 180 ms and abort on
new choices, Close, Cancel, navigation or export. Sequence/publication fences
discard stale replies even if cancellation is ignored. Previewing changes no
model, history, notes, settings, or dirty state. Source display edits close the
builder; image/export/print/presentation actions clear it before using the
document's source geometry.

**Open as model** commits `generate` with `kind: 'coxeter-builder'` through `commitOperation`/native
recipes, preserving Undo/Redo, replay, notes, and project save validation.
With no current document, it uses the ordinary generated-document path.
Source-dependent net/animation/camera settings reset on a committed build.
The commit verifies both the diagram selection and source document ownership.

Dense 4D native boundaries use the same W8 `uniform4.wythoff_boundary`
generation as the uniform Library. Project/history validation regenerates the
family and ring parameters and compares complete ordered coordinates/incidence,
embedding dimension and optional facet vertices before accepting a dense native
source. Neither a supplied fingerprint nor catalog name/measure grants trust.
The ordinary 1,024-vertex 4D convex-import budget remains in force for other
sources. Both current `generate` recipes and older `coxeter-build` histories
are supported. Four bounded, process-owned reference receipts may be reused, with
every incoming source checked again.

Intrinsic measures for these regenerated dense boundaries use convex cell
pyramids for 4D content and tetrahedral sums for 3D boundary measure. They are
float64 computations, independently compared with Qhull volume/area in tests;
saved measure scalars are ignored. The preview passes through
`initialDocumentState(model, ...).view`, exactly like a newly opened Library
model, including the shared Prism appearance, type colors and dense primitive
fallbacks. It has no separate edge/vertex or pose override.

Key IDs: `coxeter-builder`, `open-coxeter-builder`,
`coxeter-builder-family-A3` (and each family code), `coxeter-builder-node-0`
(through rank minus one), `coxeter-builder-name`, `coxeter-builder-counts`,
`coxeter-builder-status`, `coxeter-builder-snub`, `coxeter-builder-hand`,
`coxeter-builder-open`, `coxeter-builder-close`, `coxeter-builder-preview`.
The advanced method/residual disclosure has `data-expert`; no global expert
toggle is introduced. Existing manual Wythoff IDs/handlers remain intact.

Limits: convex finite uniform forms only; no arbitrary diagrams, unequal
weights, star forms, or 4D snubs. Float64 coordinates/predicates are approximate,
with no exact certificate. The panel reports relative edge-length spread and
reflection closure residual where applicable. A numerical failure refuses the
shape rather than presenting a partial orbit. Dense H4 can take several seconds;
committing recomputes through the normal history path. Desktop Electron was not
launched in the sandbox; mounted renderer tests use Chromium with the real
JSON-lines Python engine.

Verification:

```text
python -m pytest tests/test_coxeter_builder.py tests/test_wythoff.py tests/test_recipes.py tests/test_history.py tests/test_catalog_registry.py -q -p no:cacheprovider
node --test tests/coxeter-builder.test.mjs tests/navigation-display.test.mjs tests/renderer-contract.test.mjs tests/discoverability.test.mjs tests/history-workflow.test.mjs tests/construction-workflow.test.mjs tests/engine-pool.test.cjs
node --test tests/engine-op-allowlist.test.cjs tests/default-look.test.mjs
npx.cmd vite build --configLoader native
node scripts/coxeter-builder-browser-smoke.mjs
```

The native fixture checks all 7 patterns per 3D family and all 15 per 4D family
against independent uniform-library counts, numerical evidence and incidence
validation. D4 triality/equivalent diagrams additionally compare vertex distance
spectra. Tests cover both snub hands, rejection paths, source immutability,
history replay and saved-project validation. Node DOM stubs cover every mask,
keyboard wiring, cancellation/publication races and commit ownership. The browser
smoke checks actual preview, keyboard commit, Undo/Redo, saved history, palette,
snubs, D4/4D, 1280/1600 layouts and first construction in an empty workspace;
screenshots are written to ignored `build/coxeter-builder-*.png`.

Dense regressions send the UI's exact `recipe-run → generate` request for
H4 masks `1001` (2,400 vertices), `1101` (7,200), and `1111` (14,400).
Each commits, replays, saves to disk, reopens, and retains both undo/redo states.
Additional checks refuse forged native parameters, coordinates, edges, face
cycles, cells, facet tables and numeric claims, and retain the ordinary import
limit when generation provenance is absent. The desktop renderer operation
allowlist is checked separately.
The 1,152-vertex full F4 case also commits from an already-dense source through
the legacy recipe path, covering validation of retained dense history states.
