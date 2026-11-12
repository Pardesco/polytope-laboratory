# Four-dimensional Waterman lattice balls

R6-GENERATORS tranche: R5 scenario **`con-02-waterman-4d`** (CON-02).
The installed 5.4 manual, anchor `waterman`, documents a 4D choice and sequence
navigation, but does not define its lattice, origin or root numbering. This
package adds the explicit mathematical domain below. It does not assert Stella
6.0 defaults, root-number equivalence or competitor output conformance. The
existing 3D FCC/SC/BCC and centered-author-root implementations are retained.

In **Construct → Create a new shape → Waterman hull**, open **Waterman polychora
— 4D lattice balls** (`waterman4-settings`). Choose `waterman4-lattice`, enter
`waterman4-radius` (squared radius), then click **Generate 4D Waterman hull**
(`generate-waterman4`). Expert mode is unnecessary. The closed **Origin and
squared-radius sequence** disclosure (`waterman4-sequence-settings`) contains
the four-coordinate expression field `waterman4-center`, positive increment
`waterman4-increment`, and `waterman4-previous` / `waterman4-next`. Results and
numerical support residuals appear in `waterman4-status`.

For rational center c and positive squared radius q, select every integer point
x satisfying Σ(xᵢ−cᵢ)² ≤ q. **Z⁴** admits all integer quadruples. **D₄** admits
only quadruples with even coordinate sum. D₄ is not the 3D BCC parity rule.
Coordinates retain their original lattice frame and scale. A bounded exhaustive
box search uses exact integer comparisons after rational denominator clearing;
boundary sites are included without float rounding. The 4D convex hull, its
incidence and measures use the existing numerical Qhull kernel.

Native request: `generate` with `kind: "waterman-4d"`, `lattice: "Z4" | "D4"`,
`radius_squared` (default 2), and `center` (default four zeros). Default lattice
is D4. JSON inputs use integer/rational literals or numerator/denominator
objects; UI NumericEntry fields evaluate exact rational expressions. Next and
Previous add/subtract the supplied positive increment from **squared radius**.
They preserve lattice/origin, retain repeated hulls, and update the radius only
after successful publication. There is no automatic skip or numbered-root mode.

Every new shape uses the existing generated-document workflow. Provenance
retains the literal generator parameters, canonical selection parameters and
raw rational input evidence. Projects retain the selected-site snapshot,
membership certificate, hull vertex maps and source-bound residual report.
Subsequent changes use the normal Undo/Redo and operation-history workflow;
historical selection evidence applies to its recorded source fingerprint.
No new IPC operation or worker policy is needed: `generate` is already allowed
and reusable.

Limits are visible beside the controls: 65,536 inspected box sites, 256 selected
sites, 128 output vertices, 0 < q ≤ 64, |cᵢ| ≤ 1000, 256-bit rational operands,
512-bit common center denominator and an 8 MiB result payload. Resource caps
can refuse a request below the radius ceiling. Fewer than five sites or lower
affine rank refuse a 4D hull. Unsupported lattices/options and floats in exact
inputs refuse explicitly. Only site membership is certified; hull topology,
supports, measures, exact algebraic geometry and benchmark conventions are not.

Independent analytic fixtures in `tests/fixtures/waterman4-reference.json`
contain complete vertices, edges, face cycles and cell incidence. They were
derived using supporting inequalities and regular-polytope minimum-distance
edge graphs, without the application hull or catalog:

| Reference | Parameters | V, E, F, C | 4-volume |
| --- | --- | --- | --- |
| 16-cell | Z4, q=1, c=0 | 8, 24, 32, 16 | 2/3 |
| 24-cell | D4, q=2, c=0 | 24, 96, 96, 24 | 8 |
| Tesseract | Z4, q=1, c=(1/2,1/2,1/2,1/2) | 16, 32, 24, 8 | 1 |
| Dual 24-cell coordinates | Z4, q=4, c=0 | 24, 96, 96, 24 | 32 |

`tests/test_waterman4.py` checks all incidence against these fixtures, independent
Fraction site exhaustion, exact threshold neighbors, repeated sequence hulls,
maps/residuals, native save/reopen, cursor undo/redo, generation/transform replay,
JSON-lines dispatch and domain/resource refusals. `tests/waterman4-controls.test.mjs`
checks NumericEntry, atomic sequence publication, source/export/target ownership,
cancel/busy behavior and idempotent synchronization. The mounted browser test
uses the real Python JSON-lines engine with the normal renderer: Expert-off
navigation, generation, Next/Previous, validated reopen, scale/Undo/Redo/replay,
and legacy/4D hidden-mode reveal. It does not launch Electron.

Verification commands:

```powershell
python -m pytest tests/test_waterman4.py tests/test_waterman_workflow.py tests/test_generator_options.py -q -p no:cacheprovider
node --test --test-concurrency 1 tests/waterman4-controls.test.mjs tests/waterman-controls.test.mjs tests/generator-options.test.mjs tests/construction-workflow.test.mjs tests/engine-op-allowlist.test.cjs tests/waterman4-mounted.test.mjs
npx.cmd vite build --configLoader native
```

Executed results: **123 Python tests passed** (35 new 4D cases plus the existing
Waterman/generator regressions), **42 Node tests passed** (including the mounted
browser workflow), and the production Vite build passed. All four analytic
references had zero reported floating support/planarity residuals in this run;
the tests require residuals below 1e-12, not an exact hull certificate.

Follow-ups: versioned benchmark lattice/origin/root definitions and shipped
desktop qualification. Other product/specialized parameter families remain
separate packages; this slice does not close CON-02 as a whole.
