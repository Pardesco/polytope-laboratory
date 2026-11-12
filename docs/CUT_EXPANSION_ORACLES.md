# Cut transitions and expansion oracles (R8-CUTS)

Closes the **native literal-source evidence slice** of `con-05-cut-transitions`,
`con-05-normal-quasi`, `con-05-expand-3d`, and `con-05-expand-4d` (CON-05).
Competitor equivalence and extrapolation semantics remain unverified. Round 7
generation/classification/morph work is reused without modification.

The demonstrated defect was the missing 4D zero-cut endpoint: native incidence
cuts and their numeric field previously rejected zero. Zero now returns a detached,
validated copy of the complete source boundary, with unchanged coordinates,
incidence, interpretation, attributes and source-entity owners. It uses the existing
preview, adopt, Undo/Redo, project-save and recipe-replay paths. Other 4D fractions
remain bounded by `[0, 1/2]`; no extrapolation algorithm was introduced.

## UI

Construct → Modify → **Star truncation**, disclosure **Incidence truncation /
rectification (3D / 4D)** (`incidence-truncation-settings`). Select **Manual edge-cut
fraction** (`incidence-cut-preset`), enter `0` or `1 - 1` in
`incidence-cut-amount`, click **Preview edge cut** (`preview-incidence-cut`), then
**Adopt edge cut** (`adopt-incidence-cut`). Results use `incidence-cut-result`.
The existing 3D **Regular-face quasitruncation**, reference face ID and cap colors
remain available (`incidence-cut-reference`, `incidence-cut-colors`).

Construct → Fit & refine → **Expand / Runcinate**, disclosure **Expand / runcinate
(3D / 4D)** (`expansion-settings`): `expansion-ratio`, `expansion-radius`,
`expansion-center`, `expansion-colors`, **Construct expansion** (`make-expansion`).
Both paths work with Expert mode off. No element IDs or handlers were replaced.

## Independent definitions and incidence tables

`tests/fixtures/cut-expansion-oracles.json` contains literal cube/tesseract sign
coordinates, an alternating-sign tetrahedron, and a generalized shell of six
analytic step-3 octagrams plus eight triangles. Fixture construction used no engine
generator or hull. The tests read those fixed coordinates and cycles directly.

Entries are `(V,E,F,C)`; 3D sources have zero cells. These are derived expectations,
also checked against actual native output in `cut-expansion-results.json`.

| Source | Zero | Interior, t=1/4 | Rectify, t=1/2 | Just outside, t=0.5001 |
| --- | --- | --- | --- | --- |
| Cube | 8,12,6,0 | 24,36,14,0 | 12,24,14,0 | 24,36,14,0; generalized |
| Tesseract | 16,32,24,8 | 64,128,88,24 | 32,96,88,24 | Refused |
| Tetrahedron | 4,6,4,0 | 12,18,8,0 | 6,12,8,0 | 12,18,8,0; generalized |
| Octagram cube shell | 24,36,14,0 | 72,108,38,0 | 36,72,38,0 | 72,108,38,0; generalized |

For trivalent surfaces, an interior cut gives `V'=2E`, `E'=3E`, `F'=F+V`;
rectification gives `V'=E`, `E'=2E`, `F'=F+V`. Every old face doubles its side
count away from rectification; each old vertex adds a triangle. Tesseract cells
contribute 64 cell/vertex corner triangles, giving 88 faces and `C'=8+16=24`.
Interior vertices have degree four, rectified vertices degree six.

For sign cubes at `0<=t<=1/2`, a separate support oracle intersects `|x_i|<=1`
with `s·x<=d-2t` for every sign vector `s`. It derives **complete edge, face and
cell vertex sets** from analytic flat intersections, then checks actual face-cycle
edges. Both the convex-hull `truncate` adapter and literal incidence adapter are
checked against this oracle; neither adapter supplies expected incidence.

Normal/quasi cube depths follow equal retained/corner edge lengths:
`t_normal=1-sqrt(2)/2`, `t_quasi=1+sqrt(2)/2`. Both have `(24,36,14,0)`;
their six ordered eight-cycles wind once / three times respectively. Reference face
2 and both cap-color policies are checked. Odd-sided tetrahedral quasi refuses.

| Expansion | t=0 | 0<t<1 | t=1 |
| --- | --- | --- | --- |
| Cube | 8,12,6,0 | 24,48,26,0 | 6,12,8,0 |
| Tesseract | 16,32,24,8 | 64,192,208,80 | 8,24,32,16 |

Expansion expectations use the Minkowski sum `(1-t) cube + t polar_C(cube)`.
With radius squared 2 and centered reciprocal, vertices have one coordinate of
magnitude `a+b` and the others `a`, where `a=1-t`, `b=2t`. Analytic supports over
each nonempty signed coordinate subset derive full incidence, independently of
the native flag kernel. Ratios `0,1/4,1/2,3/4,1` are checked at the origin and
shifted centers `(1/8,-1/4,1/16[,3/16])`.

Centered content is independently integrated as
`sum_k binomial(d,k) (2a)^(d-k) 2^k b^k/k!`; boundary measure sums the corresponding
support-facet products with factor `sqrt(k)`. Shifted cases check full incidence,
coordinates and planarity; an independent shifted volume oracle is not claimed.

## Evidence, refusal boundaries and limits

The reproducible JSON table has 16 literal-cut rows, six convex-adapter rows,
four preset/color rows, 20 expansion rows and 21 atomic refusals. Maximum observed
expansion coordinate residual was `1.49e-15`, normalized planarity `1.34e-15`,
centered content/boundary residual `8.53e-14`; preset depth residual was below
`4.45e-16`. These are float64 observations, not exact certificates.

Negative fractions, convex cuts beyond rectification, 4D deep incidence cuts,
3D singular depth 1, unsupported 4D presets, odd quasi references, expansion
ratios outside `[0,1]`, generalized expansion sources and reciprocal centers on
the source boundary refuse without changing the source/document. Tiny nonzero
cuts and cuts within `1e-12` of rectification can be numerically unresolved and
refuse; they are never silently snapped to the endpoint. Arbitrary metric links
still need planar caps. Generalized surfaces retain winding without solid volume.

Twelve recipe cases verify saved requested numeric parameters, resolved native
depths, reference IDs, colors, units, notes and source immutability through real
project files and replay. The mounted app test covers four flows: 4D zero,
3D quasi, shifted 3D expansion and shifted 4D expansion, including Undo/Redo,
reopen and the History replay button with Expert mode off.

Known diagnostic follow-up: full-source `sourceSnapshotSha256` can differ across
renderer/native replay when JSON integer/float spellings change (observed on 3D
expansion). The geometry fingerprint, requested parameters, source geometry,
ownership maps and attributes remain checked. The mounted comparison explicitly
excludes that raw snapshot hash; no stable raw-byte hash guarantee is claimed.
Stella4D 5.4/6.0 expansion/extrapolation equivalence, arbitrary generalized
domains, exact arithmetic and Electron desktop qualification remain outstanding.

## Verification

Run `python -m pytest tests/test_cut_expansion_oracles.py -q -p no:cacheprovider`.
Regenerate the table with
`python -B tests/test_cut_expansion_oracles.py docs/cut-expansion-results.json`.
Run `node --test tests/cut-expansion-oracles-mounted.test.mjs` for the real mounted
renderer/native workflow. The test is registered in `package.json`'s
`test:features` list. Existing cut/expansion/generalized-4D, live-slider and polish
suites are included in regression verification, plus
`npx.cmd vite build --configLoader native`. Electron was not launched.

Observed results: the seven-file Python regression run passed 143 tests; the final
oracle suite (including six additional near-singular/outside refusals) passed 80.
The six-file Node run passed 17 tests, including four mounted subcases. Vite built
successfully with its existing chunk-size/dynamic-import warnings.
