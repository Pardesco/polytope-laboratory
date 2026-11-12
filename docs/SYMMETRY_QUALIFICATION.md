# Release-family symmetry evidence (R7-SYMMETRY)

The ordinary Library has **Symmetry — release evidence**
(`library-symmetry-evidence`), above Corpus coverage. Open the disclosure or click
**Review symmetry evidence** (`symmetry-evidence-refresh`), choose a scenario
(`symmetry-evidence-scenario`), and expand **Source hashes, residuals and limits**
(`symmetry-evidence-receipt`). **Open catalog source** (`symmetry-evidence-open`)
uses the existing catalog/document workflow; it opens the ordinary source, not
the rotated or incidence-altered test fixture. **Compare current model**
(`symmetry-evidence-match`, status `symmetry-evidence-status`) compares the complete
current coordinates and ordered incidence to a passed receipt. A name or metadata
key is insufficient. Comparisons are transient, discarded after source navigation,
and never change geometry, history, dirty state or corpus qualification counts.

**Corpus coverage** also links covered source realizations through **Review source
symmetry evidence** (`corpus-symmetry-evidence`, output
`corpus-symmetry-receipt`). This displays recorded evidence for that named source;
it does not silently assert that the current document matches it. No Expert mode
is required. Existing Advanced → **Verify intrinsic symmetry** remains the action
for computing a fresh group for an arbitrary supported current source.

## Executed scope and scenario IDs

`engine/catalog_data/symmetry_qualification/fixtures.json` contains the complete,
literal roster of **67 scenario IDs and independent expected orders**. The shipped
`report.json` records **65 passes and two resource-limited outcomes**, with no
failures. These are native numerical qualification scenarios for §12 verified
symmetry; they do not close Stella option-comparison scenarios or promote corpus
identity/classification/redistribution status.

The following scenario IDs close the declared numerical checks:

* All **39** native classical 3D realizations: `r7-symmetry-<catalog-key>` for all
  five Platonic, thirteen Archimedean, thirteen Catalan and four Kepler–Poinsot
  identities, plus the four separately keyed reflected snub/dual realizations.
  Each has an independent full/proper order and expected flag-orbit count.
* All **16** classical regular 4D sources: `r7-symmetry-simplex4`,
  `r7-symmetry-tesseract`, `r7-symmetry-cross4`, `r7-symmetry-cell24`,
  `r7-symmetry-cell120`, `r7-symmetry-cell600`, and
  `r7-symmetry-miratope-<regular-star-name>` for the ten names listed literally in
  the fixture file. Every one has exhaustive spanning-frame enumeration and an
  independent regular flag-action crosscheck.
* Convex A4/B4/F4 representatives: `r7-symmetry-uniform4-rap`,
  `r7-symmetry-uniform4-rit`, `r7-symmetry-uniform4-rico`; H4 star representatives:
  `r7-symmetry-goursat-wythoff-gax`, `r7-symmetry-goursat-wythoff-raggix`.
* Similarity controls: `r7-symmetry-icosahedron-rotated-scaled-small`,
  `r7-symmetry-cell24-rotated-scaled-large`,
  `r7-symmetry-cell24-rotated-scaled-small`. Arbitrary QR rotations, translation,
  and scales 10⁻⁹ / 10⁹ preserve the entire source permutation group hash while
  changing the coordinate hash.
* Incidence controls: `r7-symmetry-icosahedron-missing-face` has order 6, and
  `r7-symmetry-tesseract-extra-open-cell` has order 8. Both retain the original
  coordinates and have distinct incidence hashes; neither can inherit the
  unmodified source's receipt.

The two scenarios with honestly limited outcomes are
`r7-symmetry-goursat-wythoff-rigogishi` (1,200 vertices exceed the frame engine's
1,000-vertex domain) and `r7-symmetry-cube-frame-limit` (one candidate frame).
Neither has a full-group or flag-transitivity receipt. An expected limitation is
a successful resource-policy check, not numerical completeness for that model.

## Checks, definitions and bindings

This adapter reuses `geometric_symmetry` and `regular4d_validation` without editing
their algorithms or caches. Expected orders are literal fixture data based on the
finite Coxeter groups A3/B3/H3 and A4/B4/F4/H4; convex snubs and their Catalan duals
have rotation groups only. References and the stabilizer reasoning for incidence
controls are retained in the fixtures/report.

Every full-group result must exhaust its frame search, verify generator closure,
and match the independent full/proper orders. A separate scalar checker tests
every returned action's vertex bijection, determinant and normalized metric
residual. It checks generator edge multiplicities, cyclic boundaries (modulo
cyclic shift and reversal), and cell ownership as multisets of full face cycles;
it then traverses actual vertex–edge–face–cell flags. It does not reuse the core's
optimized integer-row incidence maps or entity-orbit output. For regular 4D
sources, independently constructed adjacent-flag reflections must also reach the
expected number of flags. These checks concern the supplied incidence, including
the changed-cell fixture, rather than vertex sets or catalog labels alone.
The largest recorded normalized coordinate residual is 3.16×10⁻¹³ and the largest
orthogonality residual is 7.60×10⁻¹³; these remain numerical residuals.

Each receipt binds `source.fingerprint`, `coordinateSha256`, `incidenceSha256`,
the expected fixture, candidate budget, observed termination, frame conditioning,
tolerance, residuals and checked-action counts. Coordinate hashes normalize
integer/float spelling and signed zero; incidence hashes retain literal indexed
ordered lists. They are representation bindings, not congruence/isomorphism tests.
The report records Python/NumPy/SciPy versions, fixture SHA-256 and fourteen
implementation source hashes. The read-only reusable native op
`symmetry-qualification` returns the recorded report and rechecks available source
file hashes, without recomputing groups. `{key}` selects ordinary-source receipts;
`{scenario}` selects one fixture; optional request `model` checks its geometry
hashes. Unknown keys return no receipts. Arbitrary paths/options are refused.
The JSON evidence is included by the existing catalog-data packaging rule.

After merging a change to a pinned implementation, the UI explicitly reports
**Implementation changed** until receipts are reproduced. Frozen engines can
omit Python source files; those implementation pins are **unavailable**, never
silently called current. Matching a supplied model to recorded geometry remains a
separate check. A recorded report is neither a live re-execution nor a signature
against deliberate local file tampering.

## Reproduction and verification

Run from the repository root, offline, without Electron:

```powershell
python scripts/qualify-symmetry.py
python scripts/qualify-symmetry.py --output artifacts/symmetry-report.json
python -m pytest tests/test_symmetry_qualification.py tests/test_symmetry.py tests/test_regular4d_validation.py tests/test_corpus_reconciliation.py -q -p no:cacheprovider
node --test tests/symmetry-evidence-controls.test.mjs tests/corpus-reconciliation-controls.test.mjs tests/engine-op-allowlist.test.cjs tests/engine-pool.test.cjs tests/renderer-contract.test.mjs tests/numeric-analysis-controls.test.mjs tests/library-rail.test.mjs tests/startup-performance.test.mjs tests/design-tokens.test.mjs
node --test tests/navigation-display.test.mjs tests/symmetry-orientation.test.mjs tests/common-workflows-mounted.test.mjs tests/integration-polish-mounted.test.mjs tests/smoke-compat-mounted.test.mjs
npx.cmd vite build --configLoader native
```

The script exits nonzero for a failed or unexpectedly limited scenario. It has no
new dependencies. Floating residuals may vary with numerical-library/platform
versions, which are recorded. Source coordinate ordering is intentionally pinned;
an equivalent reordered realization needs its own reproduction/match.

Executed results: **164 Python tests and 120 Node/browser tests passed**; the
qualification script produced 65 passes and two expected limitations. The new
browser scenario runs the actual app against the native JSON-lines engine with
Expert mode off, compares an unchanged source, rejects altered incidence, opens a
catalog source, and follows its corpus receipt link. Vite built successfully with
the existing mixed-import and bundle-size warnings. Implementation pins and the
fixture hash were rechecked current after the final run.

Scope excludes all-U75 coverage, Johnson families, compounds/scaliforms, the
2,191-entry uniform-4D obligation, arbitrary imports and via-snub intermediate
trajectories. The native snub cube and its dual endpoints are included, but that
does not qualify the complete morph. This is **reproducible numerical completeness
evidence**, never an exact algebraic group certificate. Electron and shipped
desktop qualification remain with the lead.
