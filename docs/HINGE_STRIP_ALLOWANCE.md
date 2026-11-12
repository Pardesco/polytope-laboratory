# Dihedral hinge strips with end setback (R6-NETS)

Chosen inventory scenario: `net-05-reinforcement-patterns` (NET-05), specifically
the rectangular strip pattern and an explicit physical-mm allowance. The matching
cut-list checks also address the strip subset of `net-05-measurements`; neither
scenario is promoted to full conformance. Stella option equivalence and physical
assembly have not been qualified.

In **Nets → Print or export → Reinforcement — paper templates → Dihedral hinge
strips — corner clearance**, open `hinge-strip-settings`. Expert mode is not
required. `hinge-strip-setback` defaults to 2 mm per end; `hinge-strip-width`
defaults to 10 mm. Both accept expressions through NumericEntry. Use
`hinge-strip-preview` (Preview end-relieved strips), `hinge-strip-csv` (Strip cut
list CSV), `hinge-strip-pdf`, or `hinge-strip-svg`. Preview sheet navigation is
`hinge-strip-prev` / `hinge-strip-next`. Paper dimensions/margins come from the
existing page settings. `hinge-strip-cancel` and global Cancel invalidate output.
No existing control is moved or recreated.

## Definition and evidence

`net-hinge-strip-allowance` is a read-only, warm-worker native operation. Policy
`symmetric-end-setback-v1` makes one rectangular strip per source edge, including
both hinges and cuts. If physical source-edge length is L, setback s and width w:

- Rectangle dimensions: `(L − 2s) × w` mm; score along its center at `w/2`.
- Cut perimeter: `2(L − 2s + w)` mm; score length: `L − 2s` mm.
- E0 sets the source scale; s and w remain physical mm when E0 changes.
- Part `H-Ei` matches the net's `Ei`; its two halves name the current `P…/F…`
  face owners. Set the printed approximate interior dihedral and glue inside.

CSV contains policy, full source-content hash, matching/part/source edge IDs,
source vertices and faces, current piece/face labels, E0, L, s, cut dimensions,
perimeter, score length, dihedral, fold type and hinge status. The receipt also
contains trimmed score endpoints in source space and both placed net face charts,
component/root IDs, explicit paper placements, totals and numerical residuals.
SVG cut polygons and dashed score lines carry matching `data-part-id` and
`data-source-edge-id` attributes. Sheets retain physical mm and scale 1; complete
strips that do not fit are refused, never rescaled or split. SVG export stacks
paper viewports; PDF exports separate pages using the existing bounded export.

This adds the missing end-clearance policy without changing full-length strips,
braces, rosettes, tabs, assembly policies or print sessions. All actions regenerate
from the captured source and current layout. Source/history/document/units/notes,
form, paper and placements are checked across awaits and destination review;
changing these clears stale previews. Observer zoom does not alter physical scale.
These derived exports follow the existing fabrication pattern: fields/previews are
session-local and no model operation, Undo entry or saved project field is added.

Reviewable output is in `examples/r6-hinge-strips/`: a complete JSON request,
one A4 SVG sheet and a parsed 12-row CSV. The cube at E0=30 mm, s=2 mm, w=8 mm
has 26 mm strips, total cut perimeter 816 mm and total score length 312 mm.
The generated example's attachment residual is 0 mm in float64, not an exact
arithmetic certificate.

## Domain and limits

Closed convex intrinsic 3D shells only, under existing net limits (250 faces,
512 source vertices and simple planar boundaries). Generalized/concave,
coincident-edge, open/nonmanifold and 4D assemblies are refused. Setback must be
finite, 0–100 mm, width 1–100 mm, and `2s < L` for every edge with a numerical
collapse tolerance. No automatic allowance clipping is applied. Output is
bounded to 250 sheets and the existing 32 MiB fabrication payload.

End setback is user chosen corner clearance. It is not thickness/kerf
compensation, a collision/face-fit test, or a stiffness/glue-strength guarantee.
Print at 100% and independently measure paper before assembly. Electron was
not launched; PDF printer output, hardware scale and competitor comparisons
remain R7 qualification work.

## Verification

- `python -m pytest tests/test_hinge_strip_allowance.py tests/test_net_fabrication.py tests/test_net_reinforcement.py tests/test_net_worker_protocol.py -q -p no:cacheprovider` — **90 passed**.
- `node --test tests/hinge-strip-controls.test.mjs tests/net-fabrication-controls.test.mjs tests/net-fabrication-presets.test.mjs tests/reinforcement-controls.test.mjs tests/nets-flow.test.mjs tests/engine-op-allowlist.test.cjs tests/engine-pool.test.cjs tests/bounded-export.test.mjs` — **112 passed**.
- `npx.cmd vite build --configLoader native` — passed; existing dynamic-import
  and chunk-size warnings remain.
- `git diff --check` — passed. The sample SVG was rasterized with PyMuPDF for
  layout inspection; its page bounds were 595.2756 × 841.8898 pt (A4). An optional
  isolated Chrome check timed out; no browser-rendering qualification is claimed.

Independent oracles use analytic cube/tetrahedron lengths and dihedrals at two
E0 values, unequal rectangular-box edges, parsed CSV and SVG cut/score geometry,
source incidence, explicit SE(2) component transforms and paper placement bounds.
They check every matching ID once, source owners, fixed-mm allowances, refusal
after collapsed/unsupported input, native source mutation/cancellation, warm
JSON-lines recovery after refusal, mounted actions, stale preview clearing and
held destination publication. `tests/hinge-strip-controls.test.mjs` is registered
in `test:features`.
