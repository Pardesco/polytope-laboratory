# Coxeter builder — Build from symmetry

Open **Library → Build from symmetry**, **Construct → Build from symmetry**
(`open-coxeter-builder`), or the Shape builder command. The nonmodal dialog is
`coxeter-builder`; Close/Escape cancels its computation and restores the document.

Round 10 improves the existing workflow:

- Family cards lead with names such as **Octahedral**, with **B3** secondary,
  under **3D shapes** / **4D shapes**. Families and ring settings scroll separately;
  the result name, counts and action stay in the footer.
- Click any node's 48 px SVG target or press Space to toggle its ring. Arrows move
  focus; Enter opens a completed preview. Targets remain at least 44 × 44 CSS px
  (the diagram scrolls horizontally if necessary). A square keyboard outline is
  distinct from the circular mathematical ring. `aria-label` and `aria-pressed`
  update synchronously, before the new computation finishes.
- **Reset rings** (`coxeter-builder-reset`) restores the family's first-node ring
  and clears snub/mirror choices. **?** (`coxeter-builder-help`) reveals
  **What are rings?** (`coxeter-builder-ring-help`). Selecting no rings clears the
  preview, explains the missing active mirror, disables opening and sends no
  engine request. Unsupported/numerically unresolved builds report their error.
- The viewport badge reads **<Name> · symmetry preview**. The 4D projection
  selector/label, Depth slider and 4D drag control hide during a 3D preview and return to their
  normal document-dependent visibility when it closes.
- The existing behavior is retained: **Replace current model**
  (`coxeter-builder-open`) commits a history step in the current document.
  Undo/Redo, recipe replay, notes and project saving continue to work. With no
  document, that same action reads **Open in new tab** and creates a document.
  Previewing never modifies history or dirty state. Display-only source changes
  retain the builder; model replacement, navigation and export cancel it.

## Construction and numerical scope

Families: A3, B3, H3, A4, B4, D4, F4, H4: all **96 nonempty ringings**.
D4 has a true branch, with node 2 central (one-based) and triality among its three
outer nodes. Chains omit branch label 3 and display 4/5. A ring sets a positive
unit chamber weight; an unringed node has weight zero. Equal weights yield the
supported convex uniform forms. B3/H3 additionally support both snub hands;
removing a ring exits snub mode. No absolute left/right convention is claimed.

The audited engine path remains `coxeter-build → build_coxeter`: 3D reflection
orbits/convex hulls and 4D parabolic face orbits. Opening uses
`commitOperation('generate', {kind: 'coxeter-builder', ...params}, ...)`, or the
existing document generator when empty. No new operation or dependency is added.
Names retain the existing catalog equivalents under A4/F4 reversal, D4 triality
and B4 enhanced symmetry. No count or name mismatch was found in this round.

Coordinates and predicates are float64 approximations, not exact certificates.
**How this shape is built** (`coxeter-builder-method`, Expert mode) reports
relative edge-length spread and reflection closure residual. Refusals retain the
existing validation/resource limits. Dense H4 reaches 14,400 vertices and may
need several seconds; opening recomputes via history. Arbitrary diagrams,
unequal weights, star forms and 4D snubs remain unsupported.

## Independent ringing table

`tests/data/coxeter_ringings.json` contains an explicit row for every nonempty
mask: family, ordered mask, conventional displayed name, V/E/F/C counts and a
source URL. Counts were transcribed from the **Face vector** on **61 distinct
[Richard Klitzing incidence pages](https://bendwavy.org/klitzing/explain/index.htm)**,
accessed November 12, 2026. The fixture imports no engine or product catalog.
B/H source chains are reversed to match this app's diagrams; A/F reversal and
D4 outer-node triality identify repeated forms. Klitzing's figure aliases are
normalized to conventional English names (for example girco → Truncated
cuboctahedron). A 3D row has C=0, matching the model's empty `cells` array.

`tests/test_coxeter_builder_counts.py` sends every row through the same dispatch
operation/parameters used for previews and checks both counts and displayed
name, validation and numerical residuals. The table checks this finite domain;
it does not prove a complete classification or geometric congruence. Existing
builder tests separately check equivalent-figure distance spectra, snubs, dense
history, replay, saves and rejection paths.

## Verification

```text
python -m pytest tests/test_coxeter_builder.py tests/test_coxeter_builder_counts.py -q -p no:cacheprovider
node --test tests/coxeter-builder.test.mjs tests/coxeter-builder-mounted.test.mjs
npx.cmd vite build --configLoader native
node scripts/coxeter-builder-browser-smoke.mjs
```

Round 10 results: **221 Python tests passed**, including all 96 independent
count/name rows and the coverage test. **221 selected Node tests passed** across
20 files (builder, Library, guides, framing, history, dispatch and existing
mounted regressions); the 12 focused builder tests were rerun after the final
target change. The native renderer smoke passed **36 assertions**. Vite build,
Prettier, Ruff formatting and `git diff --check` passed.

The mounted Node test first verified the baseline SVG pointer click worked in
Chromium. It now checks pointer/Space/ARIA, empty/reset/help behavior, every
family's target sizes, focus notation and a fixed footer with independent scroll
regions at 1280×800, 1600×1000 and 1024×600. The full renderer smoke uses the real
JSON-lines engine and checks preview badges, projection visibility, native counts,
history, save, snubs, D4, dense H4 and an empty workspace. Screenshots are written
to ignored `build/coxeter-builder-*.png`. Electron is not launched in the sandbox.
