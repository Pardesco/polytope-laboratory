# Remaining expression entry fields

The original 0.19 inventory below is retained as historical evidence. Its conversion and mounting columns describe that release, not the current 0.20 candidate. The current read-only source audit follows here; it does not close MEAS-04 or replace actual desktop/package qualification.

## Current 0.20 source audit

The main workspace, viewport speed, presentation radii, perspective pair, geodesic/subdivision/cupola/step/torus counts, source-zonohedron budget, exact Waterman fields, animation and tour inputs now use the mounted `NumericEntry` helper. Measurement alignment direction, symmetry frame budget and stellation observation scale also route through it. `ui/app.js` supplies project/document/state ownership, real and rational batch evaluators, and export checks; native-await publication callbacks verify the same owner before committing. Changed observer angles/camera remain independent where appropriate. Browser handlers return their asynchronous edits through `guard`; no missing numeric context or unawaited publication callback was found in the newly migrated main/viewport paths.

The two additional gaps found in that interim audit are now mounted and qualified. `orientation-direction` evaluates a nested four-vector, retains blank native inference, and binds the source/selected entity/form across final native publication. `layer-join-matrix` evaluates nine entries before the existing orthogonality/determinant checks; it does not normalize or replace the supplied matrix. The actual packaged workspace13 and layers11 receipts verify independent coordinates, source units/RGBA, native Save/Open and replay, held-source refusals and later observer-pose preservation. See `docs/MEAS04_CLOSURE_AUDIT.md` for exact receipt paths and the finite collector.

The older Product, Antiprism, FaceEditing, StarPolygon, Podia and CrossedSegmentotope controllers also now use full numeric source/form ownership, with native-await guards. This supersedes the interim weak-pointer observations below; it does not retroactively change the preserved 0.19 inventory. No remaining parser-category or specifically identified mounted field gap was found in the final finite MEAS-04 audit. A requirement-wide gate still requires review/application of actual qualified package evidence.

The frontend and native batch contracts agree on 80,000 values, 512 characters per expression, 20,000 coordinate rows with declared 2D/3D/4D dimensions, and a 128 MiB budget. One `evaluateMany` request handles all values of each numeric mode; the older 32-item fallback is not used by the mounted main workspace. Native validates the complete input shape/UTF-8 budget before evaluating any item, and returns no partial array after a later refusal. Real results are finite and bounded to ±1e100. Exact results retain canonical reduced rational strings; `NumericEntry` compares their domains with `BigInt`, rather than converting them to rounded binary64. The Waterman root converts to `Number` only after its exact safe-integer domain check. Native checks escaped JSON bytes and its output budget separately; these can conservatively reject a request even if the frontend's raw text budget passes. No false complete 80,000-value GPU or desktop throughput claim follows from these bounds.

The remaining declared numerical policy is distinct from a missing field: ordinary construction counts use real mode, so their integer test applies to the rounded binary64 result. An actual native-parser/`NumericEntry` probe with `4 - 1/10^40`, `integer: true`, yields accepted count four. This was also possible with direct floating-point literal conversion; it is not a newly introduced regression. Exact integer semantics for rational equations would require retaining rational evidence for those counts, as Waterman root already does. Current acceptance should distinguish ordinary fractional examples such as `7/2` from arbitrarily close-to-integer exact fractions.

Headless audit probes read the production controllers without changing them or launching an app. The current workspace numeric harness self-test also checks actual native expressions, literal cube/tesseract incidence, construction counts, exact rational hull coordinates and FCC membership below four versus exactly four. The desktop harness remains separate evidence. Sliders, source IDs, ring masks, polygon symbols, saved numeric records and structured JSON remain excluded from manual expression replacement.

## Historical 0.19 inventory

Read-only audit of the 0.19.0 source, 2026-10-05. MEAS-04 remained open: the native parser supported equations, but the mounted UI did not yet route every applicable numeric field through it. This inventory excludes sliders, literal source/entity/component/memory/action IDs, polygon symbols, masks, color strings, select-option numbers, and structured JSON editors. It includes integer construction parameters and numerical resource budgets. At that audit date the new adapter below was **development-only and unmounted**; the qualified 0.19 renderer/native/package files were unchanged.

`V` below means one vector: top-level commas or semicolons separate entries; commas inside balanced function parentheses are retained. Whitespace separation is allowed only for numeric literals, so `1 -2 3` remains valid while `sqrt(4) sqrt(9) 1` requires delimiters. `R` means newline-separated vectors with a consistent declared dimension. Each component is a separate native expression, at most 512 characters. No JavaScript evaluation, implicit fraction/symbol conversion, sorting, or coordinate rounding is introduced.

## Main workspace and viewport

| Field ID | Owner module | Kind / existing domain | Current conversion | Grammar | Existing publication fence |
| --- | --- | --- | --- | --- | --- |
| `section-normal` | `ui/app.js` | Nonzero intrinsic normal, source dimension | `rawNumbers` -> `Number` | V | Apply captures state pointer before depth await; no full attributes/units/target fence. Vertex-event action is synchronous. |
| `section-depth` | `ui/app.js` | Finite section offset | Apply uses native `number`; **Next vertex** uses direct `Number` | Scalar | Apply checks state pointer only; Next vertex has no async fence. Evaluate normal/depth together before clearing derived geometry. |
| `incidence-dual-center` | `ui/app.js` | Optional XYZ reciprocation center; blank retains native default | `rawNumbers` -> `Number` | V | No owner captured around radius expression await. |
| `incidence-dual-radius` | `ui/app.js` | Positive radius | Already native `number` | Scalar | Not a parser gap; combine with center under one source fence. |
| `block-sizes` | `ui/app.js` | Three or four positive side lengths | `rawNumbers` -> `Number` | V | No workspace fence around the two unrelated n/m expression awaits or native generation. |
| `coxeter-weights` | `ui/app.js` | Optional rank-3/rank-4 seed, nonnegative, positive entries match ring mask | `rawNumbers` -> `Number` | V | No retained family/mask/weights/workspace fence across native generation. |
| `hull-points` | `ui/app.js` | Native supports 2D/3D/4D, 1..20,000 points; full rank required | Rows of `rawNumbers` -> `Number` | R | No workspace/export/field fence across native hull await. Do **not** restrict this field to 32 coordinates or 32 points. |
| `generator-n`, `generator-m` | `ui/app.js` | Kind-specific counts, height, radius-squared | Already native `number` | Scalar | Not parser gaps; both are evaluated even when irrelevant. Capture kind/fields/project before evaluation; check integer domains only for applicable counts. |
| `auto-rotation-speed` | `ui/viewport-controls.mjs` | Signed degrees/s, -180..180 | `Number` in onchange | Scalar | Synchronous `canEdit()` export check; no async owner/target fence yet. Preserve independently advancing angles. |
| `vertex-radius`, `edge-radius` | `ui/presentation-controls.mjs` | Positive display radii <=0.5 | `Number` in input handler | Scalar | Synchronous export check. Current handler republishes other form values; expression integration must edit only intended fields. |
| `perspective-distance-4d` | `ui/perspective-controls.mjs` | Positive normalized eye distance <=100 | `Number` | Scalar | Synchronous export check; validate distance/near jointly. |
| `perspective-near-4d` | `ui/perspective-controls.mjs` | Positive near depth < eye distance | `Number` | Scalar | Same pair; preserve current observer and angles when publishing. |
| `measure-align-direction` | `ui/measurement-controls.js` | Optional finite intrinsic direction, native alignment eligibility/nonzero checks | `rawNumbers` -> `Number` | V | State pointer/sequence after offset expression await; strengthen for source/selection/direction ownership. |

Main operation fields already using `number` also need a separate ownership review: `truncation`, `extrusion-height`, `model-scale`, and `reference-length` are evaluated before `commitOperation` captures its source. `reference-edge` is an excluded literal source ID, but its selection must bind the operation. These are stale-source risks rather than missing expression syntax.

## Construction counts and budgets

| Field ID | Owner module | Final domain | Current conversion / grammar | Existing fence |
| --- | --- | --- | --- | --- |
| `geodesic-frequency` | `ui/source-construction-controls.mjs` | Integer 1..128, further native output bounds | Literal regex + `Number`; scalar | Full `captureNativeSource`/`verifyNativeSource` surrounding commit. Retain this fence when adding expression await. |
| `edge-divisions` | `ui/subdivision-controls.mjs` | Integer 1..128 | Direct `Number`; scalar | Export check before synchronous input/commit; no expression owner yet. Source edge IDs stay literal. |
| `cupola-n` | `ui/cupola-controls.mjs` | Integer 3..128; blank height supported only n=3,4,5 | Direct `Number`; scalar | Busy/export checks; n and optional-height semantics must be validated after evaluation. New-document workflow owns native publication. |
| `torus-ring-segments`, `torus-arm-segments` | `ui/torus-controls.mjs` | Integer 3..1333 each; product <=4000 | Literal regex + `Number`; scalar | Project/export checks around radius awaits; extend to the counts and final product check. |
| `step-prism-n` | `ui/step-prism-controls.mjs` | Integer 5..128 | Literal regex + `Number`; scalar | Busy/export checks; new-document workflow publication. |
| `step-prism-step` | `ui/step-prism-controls.mjs` | Signed nonzero integer with abs(step)<n | Literal regex + `Number`; scalar | Same operation as n; preserve signed/unreduced parameter provenance. This is an integer parameter, not a polygon-symbol field. |
| `zonohedron-max-zones` | `ui/source-zonohedron-controls.mjs` | Integer 1..32; further selected-zone/native budget checks | `literalZones` regex + `Number`; scalar | Full source/selection/generation/cancellation fences already surround center/length evaluation. Include max_zones in that job. |
| `symmetry-frame-limit` | `ui/symmetry-controls.js` | Integer 1..1,000,000 | `save()` type-number -> `Number`; scalar | Computation uses source pointer + sequence. Capture settings and source before expression await; preserve explicit partial-search diagnostics. |
| `waterman-root` | `ui/waterman-controls.mjs` | Positive safe integer; native FCC enumeration bounds | Literal regex + `Number`; scalar | Busy/export checks and new-document workflow. Integer expression evaluation can be added separately from exact sphere coordinates. |

Literal IDs excluded here remain literal after the change: `entity-id`, selection/measurement source IDs, `reference-edge`, `facet-cycles`, net roots/edges/faces/vertices/components, subdivision edge IDs, memory slots, zonohedron feature IDs, symmetry generator/entity/action IDs, stellation facial/diagram plane IDs, cell visibility IDs, and attachment/placement face indices. Ring masks and `n/d` polygon-symbol inputs also retain their existing grammar.

## Animation and tour settings

| Field ID | Owner module | Final domain | Current conversion | Existing fence |
| --- | --- | --- | --- | --- |
| `animation-duration` | `ui/animation-controls.mjs` | Finite >0..300 s; saved timeline endpoints resized consistently | `Number` | Own/other export checks; scalar expression needs source plus sequence identity/generation fence. Preserve native frame-count limit. |
| `animation-fps` | `ui/animation-controls.mjs` | Integer 1..60 | `Number` | Same sequence/export ownership. |
| `animation-turns` | `ui/animation-controls.mjs` | Finite; all resulting endpoint angles abs<=1e6 | `Number` | `rotation()` currently configures/saves before validating turns. Expression migration should preflight the entire candidate before any save. |
| `animation-explosion-endpoint` | `ui/animation-controls.mjs` | Amount 0..10 | `Number` | Candidate adapter preflight + source/generation/own/other export checks; extend over expression evaluation. |
| `tour-duration` | `ui/tour-controls.mjs` | Finite >0..3600 s | `Number` in onchange | Editing availability and project/tour preview lifecycle; bind selected event ID and original tour bank across expression await. |
| `tour-fps` | `ui/tour-controls.mjs` | Integer 1..60; export duration <=300 s, native frame cap | `Number` at export | Exporter owns project/tour/renderer/worker capture fences after creation; evaluate FPS before starting/staging export. |
| `tour-transition-duration` | `ui/tour-controls.mjs` | 0..60; noninstant >0, instant exactly 0 | `Number` | `transitionInput()` synchronous; bind selected event, transition fields and tour bank before await. |
| `tour-transition-angle` | `ui/tour-controls.mjs` | -360..360 degrees | `Number` | Same transition candidate. |
| `tour-transition-distance` | `ui/tour-controls.mjs` | 0..100 | `Number` | Same transition candidate. |
| `tour-transition-tilt` | `ui/tour-controls.mjs` | -180..180 degrees | `Number` | Same transition candidate. |
| `tour-transition-orbits` | `ui/tour-controls.mjs` | 0..100; fractional values allowed | `Number` | Same transition candidate. |
| `tour-transition-spin` | `ui/tour-controls.mjs` | 0..100; fractional values allowed | `Number` | Same transition candidate. |
| `tour-transition-explosionSize` | `ui/tour-controls.mjs` | 1..100 | `Number` | Same transition candidate. |
| `tour-transition-direction` | `ui/tour-controls.mjs` | Exactly -1 or +1 | `Number` | Same transition candidate; cannot accept arbitrary nonzero values. |

Sliders remain out of this manual-entry audit: rotations, section-offset, opacity, shrink, fold/explosion pose, and timeline scrubbers. No blanket replacement of `Number` is appropriate: many occurrences decode options, source IDs, array-index keys, pointer-derived state, or saved numeric records rather than user numeric expressions.

## Exact-input fields: separate implementation gate

| Field ID | Owner | Existing grammar | Required expression contract |
| --- | --- | --- | --- |
| `waterman-radius-squared`, `waterman-x`, `waterman-y`, `waterman-z` | `ui/waterman-controls.mjs` | Exact integer/p/q strings, positive squared radius | Native expression result must retain `exactRational`. Keep that rational string in the native parameters and provenance; do not replace with `value`. Irrational results need explicit refusal until the exact FCC domain is extended. |
| `rational-points` | `ui/app.js` | Rows of exact literal decimal/rational coordinates; native max 32 points | Top-level V/R grammar plus exact-rational result strings. Preserve exact distinctions, dimensional/resource checks and certification scope. |

Historical note: the 0.19 approximate-real prototype intentionally **did not** handle these fields; version20 mounts a separate canonical-rational path for both. The following paragraph records the original required contract. A separate batch result contract should expose each native `{value, exactRational, numericMode}` result, then require and preserve `exactRational` for exact-input consumers. Independently test `4 - 1/10^40` against `4`: they may have equal float `value` but must retain different rational bounds/Waterman memberships. Fractional polygon symbols are not numerical fractions for this purpose.

## Already expression-enabled entries

The 0.19 net editors already use `ExpressionEntry` for `net-length`, `net-move-x`, `net-move-y`, `net-angle`, `net-paper-width`, `net-paper-height`, `net-paper-margin`, `net-paper-gap`, `cell-net-translation`, and `cell-net-angles`, including nested function commas and full source/view/layout/notes/units ownership.

Other mounted construction real-value inputs already call the native parser: cupola edge/height; star polygon radius; product radii; antiprism base/elevation and prism heights; step-prism radius; torus ratio/radius; podia sizing; crossed-layer sizing/depth/matrix; layer-join height/points/transforms; augmentation and face-placement scale/height/rotation; convex-core centers; source-zonohedron center/edge length; face coincidence tolerance; and measurement alignment offset. Their heterogeneous existing owner fences need review during migration, but they are not direct-number syntax gaps. `measure-align-direction` in `ui/measurement-controls.js` is an additional **V parser gap** (`rawNumbers`); it currently checks state pointer/sequence after the offset await. `stellation-scale` already calls `number` but mutates a captured configuration immediately after await without a complete source fence; keep it in the fence-strengthening batch.

## Proposed implementation order and acceptance fixtures

1. Mount native bounded batch expression evaluation, then main section/Next vertex, incidence center/radius, block/Wythoff and hull fields. Keep one immutable source/project/document/field binding across every chunk and final native geometry request. Validate a real >32-coordinate hull, a 20,000x4 preflight budget fixture, nested min/max normal, changed units/notes/RGBA while held, and unchanged document after a late invalid expression.
2. Viewport speed, presentation radii, 4D perspective pair, and measurement direction. Change applicable browser inputs from `number` to `text`; preserve final existing validators. Test spinning observer motion during evaluation, competing target edits, near>=distance refusal, export denial, and exact preservation of the latest camera/angles.
3. Construction counts/budgets together with existing real-parameter ownership review. Test count `2+3`, fractional count refusal, signed step, product/output caps, optional cupola height dependent on evaluated n, native source/history ownership, and selected-memory full attributes where relevant.
4. Animation and tour numeric candidates. Evaluate all fields before saving/configuring any candidate; preserve original bank on failure. Fence selected sequence/event/tour identities and native preflight/capture/export lifecycles. Test invalid turns leaves sequence unchanged, FPS integer cap, edited event during await, another export starting while held, and deterministic endpoint/loop preservation.
5. Exact Waterman/rational hull inputs with full exact-rational native results and independent threshold witnesses. Do not use the approximate-real adapter to claim this batch complete.

This historical inventory did not close MEAS-04. Version20 mounts the migrations above; finite packaged evidence is collected separately, without claiming exact installed Stella equation parity or all-product completion.

## Development adapter contract

`development/main-viewport-expression-entry.mjs` exports `MainViewportExpressionEntry` and explicit limits. Context:

* `getProject/getDocument/getState`, `isExporting`, optional `isBusy` for **other** operations, and the existing native source binding. Model reference plus full source JSON, RGBA, metadata units, effective display units, notes, document ID/states/cursor, project and state bind the edit. Camera/angles and unrelated memories can change independently.
* `evaluateBatch(strings,{signal}) -> number[]` evaluates at most 32 entries per request through the native parser. One job covers all requests; no partial publication. `number(text,{signal})` is a sequential compatibility fallback only. Large hull integration should provide the batch endpoint; this prototype makes no native batch throughput claim.
* Optional `getTarget()` returns bounded plain JSON for the **specific edited form/target**: retain field text, kind, selected event/sequence/normal/settings and explicit property-presence flags where needed. Independent pose fields must be omitted. Maximum 2,048 nodes / depth 16 / 64 KiB. This fence supplements full source ownership.
* Optional `yieldBetweenBatches({signal})` yields between native requests. The adapter does not start 80,000 cold one-expression processes; a 20,000x4 matrix uses 2,500 requests of at most 32 expressions. Backend process reuse, batching latency and genuine UI responsiveness require separate integration/performance proof.
* `run(fields,publish,{signal,validate})`: fields have `{text,kind:'scalar'|'vector'|'rows',length,min,max,exclusiveMin,integer,nonzero}`. Allowed vector/row dimensions are explicit, 1..4; rows retain literal order. Maximum 64 fields / 80,000 values / 20,000 rows / 128 MiB text. `integer` checks safe integer results **after** native evaluation. Optional `validate(values)` implements cross-field rules using existing qualified validators.
* `publish(values,verify,{signal,source})` receives detached numeric arrays, a detached source model, and the same owner fence. If it awaits a native operation, it **must call `verify()` after that await immediately before publication**. It must update only the intended fields on the current state/view, never reassign a captured whole view. The helper cannot make an arbitrary callback that ignores this contract atomic.
* `cancel/destroy` abort the job, stop future chunks and suppress late publication even if the injected native evaluator ignores its signal. The physical native process must separately honor cancellation; aborting a JavaScript wait does not prove it stopped computing. Busy state clears on rejection; retry starts a fresh generation.

Headless verification: `node --test development/test-main-viewport-expression-entry.mjs` passes **24 tests**, including one actual native parser call and a complete 80,000-coordinate injected-batch fixture. The approximately 0.53-second synthetic large-input run measures adapter overhead with injected immediate numeric results and a small source owner, not native or viewport performance. Full source signature revalidation is deliberately retained at await boundaries; its cost for a large active source must be measured before mounting. No GUI or qualified production files were changed.
