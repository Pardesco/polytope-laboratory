# Dense stereographic completion after 0.20

This is a read-only audit of the frozen renderer plus an unmounted development experiment. The existing renderer has repaired shared-edge cracks and uses analytic spherical normals. Dense filled motion and complete fine capture remain separate, unfinished domains. A moving, source-preserving partial preview does not establish complete geometry or exact capture. No production, registered test, engine, desktop, package or GUI files changed for this work.

## Actual limits and failure modes

`prepareStereographicWorkerGeometry` applies the saved frame and angles once, snapshots Float64 presentation coordinates and retains source/presentation owners. Native indexed, separately shrunken/translated cells and declared face-local virtual corners have distinct topology domains. `computeStereographicWorkerGeometry` uses those identities for shared-edge closure. The synchronous fallback uses the same conforming computation.

| Bound | Current conforming path | Consequence |
|---|---:|---|
| Visible initial surface triangles | 8,192 | All initial triangles are refused atomically if the request exceeds the bound; no prefix truncation. Explicit lower caller caps are honored. The legacy unregistered-topology path still defaults to 2,000. |
| Conforming mesh leaves | 100,000 | Includes retained, clipped and unresolved leaves, not merely GPU triangles. |
| Classification visits / cached samples / rounds | 1,000,000 / 500,000 / 64 | A budget stop retains the last conforming mesh with explicit holes. |
| Maximum leaf depth | 8 | Counts red and green closure replacements; a depth-limited neighbor can stop refinement elsewhere. |
| Output source arcs / visible input edges | 60,000 / 30,000 | Arc output is independently clipped/qualified; surface improvements must preserve these exact line buffers. |
| Typed input or output snapshot | 32 MiB | Transport permits up to250,000 patches, but computation's100,000-leaf cap is the tighter actual surface constraint. |
| Worker queue / timeout | one active plus one latest / 15s | Old interaction snapshots can publish coherent partial geometry in the same family; idle/capture are current-only. A timed-out worker is a failure, never successful partial capture. |

The output arena stores88 bytes per triangle (Float32 points/normals plus four owners) and40 per segment. Maximum triangle/segment capacity is11,200,000 bytes, before vertices, input snapshots, resolution arrays, decoder copies and the much larger temporary JS refinement mesh. Source-seeded hybrid allocation avoids large tiny-model seeds;>=1,000 visible source triangles seed the full triangle arena. Increasing arena capacity does not resolve depth, pole, quality or global closure failure.

The existing loop marks all three edges of **every** unresolved refinable leaf, computes their combined red/green closure, and rejects the whole next round if any affected leaf reaches depth eight or the combined mesh/visit/sample requirement exceeds a cap. It can stop at66,938 mesh leaves even though the cap is100,000. Those unused slots cannot justify drawing unqualified coarse patches; they can support smaller, fully closed refinement proposals.

## Existing runtime evidence

The retained [packaged0.18 six-case benchmark](../artifacts/stereographic-dense-publication-packaged-8STMbh/result.json) observed all six cases moving with unchanged source geometry. Tesseract default/zoomed produced120/110 complete results. The600-cell default/zoomed produced zero complete results, with worker medians274.6/277ms and about8–10 distinct published frames during a2.5s observation. The120-cell produced3 complete and11 partial results in each case, with worker medians242.9/233.2ms and11 distinct published frames. These observations are historical, not a newly executed0.20 browser benchmark. Listener-prefix medians were about9–11ms on the dense cases; this measures synchronous message processing, not GPU duration or all later async work.

Current headless frozen production fixtures independently reproduce fine-quality limitations:1200 source triangles for the600-cell,2160 for the120-cell, and4320 for its cell-shrink presentation. Ordinary source sizes fit the8,192 initial cap. Dense omissions here arise during refinement, not because a2,000-triangle prefix was silently rendered.

## Development experiment and its evidence

[dense-stereographic-budget.mjs](../development/dense-stereographic-budget.mjs) copies the current production classification, projection, normals, red/green subdivision and source snapshot rules. Only round admission changes. Requested leaves are ordered by increasing depth, then original instance/path. Each proposal adds its three edges **and every incident neighbor split**. It is accepted only if the resulting whole closure fits the unchanged mesh/depth/classification/cache limits. Rejected proposals remain explicit holes while unrelated admissible proposals proceed. The original source order is retained in final output; no coordinate welding or owner reassignment occurs.

Additional adjacency scheduling has its own cumulative8×classification-visit cap, at most8,000,000 accounted index/adjacency visits. Sorting and bounded mesh scans add CPU work. This is not a resumable worker or cancellation implementation. It remains synchronous, bounded development computation; production transport cancellation/family guards are unchanged.

`node --test development/test-dense-stereographic-budget.mjs` now passes **14 tests**. Independent witnesses reconstruct each leaf from source barycentric coordinates, sum exact dyadic parameter areas to one, pair every interior leaf edge and both sides of shared source edges, check reversed winding, inverse stereographic ray agreement, midpoint/interior sampled error, sphere-gradient normals, owners and source immutability. Tests include empty/invalid/over-budget requests, actual dense native fixtures, all4320 shrunk120-cell instances, incremental index reuse and high-valence shared ownership with literal RGBA/null/unit lookup. Whole-curve/whole-surface error, Float32/GPU/raster error and transparency ordering are not certified.

| Fine fixture, same100k-leaf cap | Production retained patches | Selected retained patches | Production retained parameter area | Selected retained parameter area | Selected complete |
|---|---:|---:|---:|---:|---|
| Tesseract,48 original triangles | 16,464 | 16,464 | 48/48 | 48/48 | yes |
|600-cell,1200 |65,860 |84,352 |1148.59375/1200=95.7161% |1167.0625/1200=97.2552% |no: pole and unresolved pieces |
|120-cell,2160 |55,090 |98,853 |2113.71875/2160=97.8573% |2155.9453125/2160=99.8123% |no: unresolved pieces |

These percentages measure raw source-triangle parameter domains, equally weighted per original triangle. They are **not** projected area, visible pixels or a model-wide geometric area measurement.120-cell unresolved original triangles fall94→15. Both dense selected meshes reach exactly100,000 total leaves; neither gets reclassified as complete. The600-cell's clipped leaf count increases420→1080 because more of its domain is classified/refined; leaf counts alone are not lost-area comparisons.

One independent two-patch pole-free fixture genuinely completes in20 leaves at tolerance0.02 under cap20; production's all-round policy stops with four retained leaves and unresolved area. This proves that bounded proposal selection can enable some complete cases without raising caps or relaxing the sampled criterion. Unlimited tesseract and small-patch outputs remain identical to production points, normals, owners, coverage and mesh counts.

The **first** prototype cost more CPU than production: one cold Node surface-only comparison measured tesseract185→194ms,600-cell695→1225ms and120-cell1187→2101ms. These include JS refinement/result records but exclude edge projection, worker transport, packed decoding and GPU publication. CPU/GC/hardware fluctuations matter; these are observations, not FPS claims. That first adjacency-rebuild policy is retained as `denseBudgetReferencePoleCut` for comparison. The updated candidate below removes much of its added scheduling overhead, while keeping the same geometry and coverage.

## Incremental scheduler follow-on

The development module now has a whole-round fast path. If all marked edges fit, it admits the identical full closure without building an adjacency index or sorting proposals. The first constrained round lazily creates one job-local edge incidence table. Parent removal and child insertion use dense adjacency rows with swap removal and per-leaf row slots, avoiding per-edge Sets and repeated whole-mesh rebuilds. Unchanged retained leaves keep their incidence. Index-update work is reserved before the atomic mesh replacement; once the next mesh saturates the cap, the useless index is released rather than updated.

Registered samples receive bounded internal integer IDs solely for scheduling. With at most500,000 samples, an unordered pair encodes exactly as `minId*500001+maxId`, below2^53. These IDs do not replace source/presentation identities. External corner keys, literal raw endpoint ordering, midpoint arithmetic, normals, native output order and attributes remain unchanged. There is no coordinate equality lookup or source welding.

The14-test suite compares actual tesseract/600/120 fine outputs against the preserved first scheduler: **points, analytic normals, raw coordinates, barycentric domains, child paths, external corner keys, holes, source face/cell/triangle owners, diagnostics and completeness are deeply identical**. The geometric caps are unchanged. Additional indexed/scheduling work remains bounded to8×the classification limit, and its checked accounting decreases:

| Fine fixture | First scheduling visits | Incremental visits | Index builds | Whole-round fast paths |
|---|---:|---:|---:|---:|
| Tesseract |162,048 |92,996 |0 |6 |
|600-cell |1,595,146 |878,274 |1 |4 |
|120-cell |1,302,010 |797,108 |1 |4 |

This reduces the counted adjacency/scan work by approximately43%,45% and39%. Sorting remains separately bounded by the maximum request count; the counter is not an instruction count or wall-clock budget. A21-leaf fixture performs real incremental parent/child index updates and reuses its single index in the next constrained round. A20-owner coincident topology fixture verifies high-valence closure, independent face lookup and hard budget behavior. Saturated dense fixtures need no maintenance after their final selected round.

Fresh **separate Node processes**, Windows x64, Node v22.21.0, three jobs per fixture/algorithm, explicit GC before and after each job, observed the following surface-only medians. Fixture loading and source preparation are outside each timed solve. Each process uses the same cached literal pose and fine tolerance0.004. These are locally reproduced computation measurements, not renderer/worker transport, GPU or actual motion results:

| Fixture | First scheduler median (three samples, ms) | Incremental median (three samples, ms) |
|---|---|---|
| Tesseract |176.88 (210.80,163.58,176.88) |112.03 (157.91,112.03,90.85) |
|600-cell |1307.02 (1307.02,1052.08,1690.24) |713.20 (793.75,713.20,669.84) |
|120-cell |1294.11 (1294.11,1031.24,1622.08) |719.83 (824.15,719.83,635.72) |

The equivalence tests deliberately retain several large complete results for comparison. In that shared-heap context the600-cell incremental solve can measure slower (one final run1163→1441ms), while120-cell measured1818→1290ms. Do not discard that contrary observation: allocating/retaining full result objects affects GC and runtime behavior. Explicit-GC isolated measurements do **not** promise the browser will match them. Root should run the actual worker/motion benchmark before mounting or claiming performance improvement. The total dense solve remains hundreds of milliseconds, and both dense fine fixtures remain incomplete. This batch has not solved continuous30fps filled motion, completed their fine capture or changed the finite-view pole contract.

A separate three-job memory observation in fresh processes recorded process maximum RSS600-cell402→361MiB and120-cell424→359MiB. These are whole-process high-water observations, including fixture/import/JS runtime overhead; they are not isolated index allocation sizes or browser bounds. After explicit GC while retaining the full result, heap usage was still about136MiB for600-cell and145–165MiB for120-cell in either implementation. The returned development records include raw/barycentric samples, paths, normals and explicit holes. This makes the much smaller typed32MiB transport cap **not** a total worker heap bound. A future mount should avoid materializing all those rich evidence records into a second full JS surface list and pack validated leaves directly. It must retain independent compact area/owner/resolution witnesses and never suppress capture refusal to save memory.

## Direct bounded packet follow-on

[dense-stereographic-packet.mjs](../development/dense-stereographic-packet.mjs) now supplies `computeDenseStereographicPacket(input,options,{signal,isCurrent})`. It consumes the current production prepared input layout; coordinates are already posed exactly once. The scheduler's new `emitDenseBudgetConformingPoleCut` uses the identical classification/refinement loop, but sends each qualified leaf's local points/normals directly to the production hybrid typed arena. It does not construct duplicate raw/barycentric/path/corner/point/normal result records. Compact source coverage, explicit unresolved/clipped counts, stop diagnostics and ownership remain. `materialized:false` distinguishes this evidence summary; it has no fake empty rich triangle/hole lists.

Point and edge computation uses the actual production helper with only a private surface mask suppressed. The packet retains its exact point/arc slots, source owners, visibility and resolution bytes. Surface Float32 points/normals and Uint32/Int32 owner arrays use the **existing wire layout**. The surface arena has no second edge capacity, since arcs already belong to the base buffers. The authoritative production decoder validates finite values, specific visible source-instance provenance, every resolution slot and the total32MiB output limit, then makes owned exact-size copies. It never transfers unused capacity or caller arrays. Capture keeps a source-bound input receipt; its ownership check has a separate lexical scope so it cannot accidentally retain the arena/sink's unused buffers.

The8 new packet tests and14 scheduler tests pass **22 combined tests**. Independent rich-oracle packing is byte-identical for actual tesseract/600/120 points, normals and surface owner/instance arrays. Production point/arc arrays are independently compared byte for byte. Per-coordinate Float32 conversion differences from Float64 oracle samples are at most1e-6 for points and6e-8 for normals in these fixtures; this is conversion evidence, not a raster/error certificate. Actual shrunk cell instances remain distinct. RGBA/null attributes are resolved by unchanged face/cell IDs; the packet does not invent or bake colors. Tests include initial atomic refusals, partial mesh/edge caps, missing topology, whole pole-excluded triangles, empty requests, lower byte limits, malformed/forged owners, NaN, real ArrayBuffer transfer/detachment, source replacement/cancellation and forged completion flags.

`assertDensePacketCapture` requires the original qualified packet and its independently saved complete status, rechecks current ownership, and reruns authoritative geometry validation. A caller setting `complete=true` and clearing the pole count on an originally incomplete packet still cannot acquire capture rights. Rich and direct paths have identical source-area coverage and counts; dense fine fixtures stay partial. Unknown topology is diagnosed/omitted, never inferred by coordinate equality. Oversized complete initial meshes are refused without prefix truncation.

Cancellation checks occur before preparation, between computational stages, at bounded classification/output checkpoints and before returning decoded buffers. A thrown cancellation returns **no packet**, even if a local arena has some writes. This is synchronous cooperative checking: it does not yield to the browser event loop, process worker cancellation messages during a solve, interrupt computation at arbitrary time, or replace main-thread source/family/generation publication guards. Cross-realm transport, stale packets and capture publication still need the existing coordinator. No production worker, viewer, package or GUI is mounted by this prototype.

Fresh Windows x64 Node22.21 processes, three stack-scoped jobs per path, explicit GC around each job, cached actual source poses, measured:

| Fine model | Rich solve + naive surface encoding median | Direct complete packet median | Rich separate encoding samples | First-job retained JS heap delta, rich→direct | Process high-water RSS, rich→direct |
|---|---:|---:|---|---:|---:|
|600-cell |805ms |665ms |71.9/74.4/74.5ms |131.1→1.47MiB |363→249MiB |
|120-cell |823ms |703ms |82.9/85.4/84.9ms |139.6→1.90MiB |408→254MiB |

Timing scopes differ honestly: the rich path includes surface solve and a deliberately independent `flatMap`/typed-array encoding reference, excluding arcs and authoritative decoding. The direct path includes arcs, validation, source preparation, surface solve, incremental writes and authoritative decoding; no isolated direct-encode timer is claimed. The after-GC rich deltas remain about130–140MiB across jobs, while direct metadata delta can shrink as the JIT/heap settles. Retained ArrayBuffers add about7.4MiB (600) and8.8MiB (120) to the direct path, including its detached input receipt and full output. Output packet arrays themselves total7,593,016 and8,848,224 bytes, respectively. Source preparation/fixture loading are outside timed calls. Process RSS is whole-process high-water, not allocation-level peak attribution or a fixed memory bound.

An early diagnostic run discovered that placing the capture guard closure in the same lexical scope as the solve retained arena capacity after decode (roughly16–18MiB retained ArrayBuffers). The isolated guard factory removed that retention; the above final observations use the corrected code. The rich benchmark also uses stack-scoped solve functions so temporary local result bindings do not accidentally survive between jobs. Both pitfalls and the measurement scope matter when adapting this candidate.

This is meaningful bounded packing/heap progress, not proof of completed dense motion or capture. Native geometry/source attributes, shared-boundary refinement and pole/error refusals remain intact. A future mount should first replace the rich materialization seam while retaining external worker/source guards, then qualify actual browser heap, coherent picking/colors, partial previews and exact capture refusal/retry. No cap was increased and no incomplete geometry was relabeled complete.

## Pole clipping is not resource starvation

For radial stereographic projection r=p.xyz/(||p||−p.w), normalized w≥0.98 corresponds to |r|≥sqrt(99)≈9.949874. Projection at the north pole is unbounded; no finite image can capture its entire mathematical neighborhood. Production intentionally excludes the0.02 pole cap, then conservatively retains/refines whole safe dyadic leaves and records the boundary uncertainty as holes. The600-cell default pose has a north-pole source vertex and real cap-intersecting faces/arcs. The120-cell default fine fixture has no clipped surface leaves; its failure is refinement budget, so clipping would not fix that fixture's unresolved quality pieces.

The pole cutoff is not the observer frustum. A large3D radius does **not** imply off-screen geometry: under orthographic viewing, a far point along the observer direction projects onto the center of the image. Under perspective, depth and near/far planes matter. Therefore the excluded600-cell parameter area cannot honestly be labeled entirely outside the user's camera from radius alone. This audit did not prove its clipped patches off-screen. Scheduling cannot remove this distinction or grant current capture rights.

A future **declared finite-view capture** could be complete relative to a rigorously clipped observer frustum, while the full unbounded source image remains excluded. That is a new explicit scope, not a change to the current complete-full-request flag. It needs analytic source-domain coverage for every retained/outside/uncertain piece, conservative numerical predicates, common cut vertices on both sides of a shared edge, curved boundary agreement, analytic normals and unchanged source owners. Interior singular/pole cases and unresolved arithmetic must remain refusals. Until those witnesses exist, fully pole-excluded conforming leaves still cause capture refusal.

## Concrete next implementation batches

1. **Qualify the incremental scheduling candidate before mounting.** The development implementation now supplies cached integer edge pairs, a lazy source-bound incidence table, whole-round fast paths and bounded selective closure. Preserve the14 tests above as independent geometry/coverage/quality witnesses. Profile actual worker heap/allocation and coherent GPU publication, including source switches, capture cancellation/retry and held stale packets; the pure candidate has no transport or resumable cancellation. Fair admission across regions must be explicit; this experiment's native-ID tie-break can favor early owners at a saturated cap.

2. **Recover unused refinement capacity through coherent coarsening/warm starts.** Retain a job-local refinement hierarchy and parent acceptance checks. Coarsen only a closed shared-midpoint removal group when each resulting parent passes the original pole/origin and sampled-quality predicates, literal winding and source-face normal domains. Warm-start new SO(4) poses from cached unposed topology/barycentric samples, but recompute their posed quality and normals exactly once. Old-pose quality is not valid for the next pose. Acceptance: complete pole-free120-cell fine fixtures within existing caps, independent parameter coverage/shared-edge pairs, unchanged lines/owners/colors and stale-family/capture guards. Neither current experiment nor current arena proves that target achievable.

3. **Introduce bounded indexed surface packets before enlarging any domain.** Reuse projected shared corners only within the explicit presentation and normal/attribute domain. A source-face seam can require separate normals/colors even when topology corners match. Keep source face/cell/triangle-instance owners per indexed patch and strict visible-input provenance. Indexed positions/normals can reduce repeated88-byte patches, but do not by themselves solve100k-leaf caps or CPU work. Measure live old+new buffers and decoder copies, not merely packet prefixes. No pooled buffer may be detached while the published picking/GPU snapshot owns it.

4. **Solve finite-view pole/frustum clipping as a separate geometric contract.** Start with independent literal sphere/plane and circle-cut fixtures, including a pole-neighborhood aligned to the observer axis that remains centered on-screen. Use inverse stereo q=(2r.xyz/(|r|²+1),(|r|²−1)/(|r|²+1)) to derive source-patch/view halfspace predicates; source triangle positive-cone membership must still hold. Agree common cut/refinement topology before GPU publication. Quantify declared-view parameter coverage and sampled error, separately from whole-image singularity and whole-patch error certification.

5. **Qualify motion and exact capture on the actual runtime.** Main/worker integration remains one-active+one-latest, atomic points/edges/surfaces/normals/owners/picking, intermediate interaction allowed only within the current family, fine/capture strictly current. Exact capture must reject partial, timed-out, canceled or replaced-source results; canceled same-pose recovery and retries stay intact. Worker yielding requires an explicit resumable state/guard boundary; a wall-clock partial stop cannot be relabeled reproducible completion. Root should repeat native120/600 source snapshots, angle motion/pixel change, rotated shrink/explosion and fine PNG/WebM capture/cancel/retry on the built renderer before any performance or domain closure claim.

Full VIEW/VIS and installed Stella5.4 parity remain open. No purchase, install, external-baseline execution, GUI launch or frozen release change was made here.

## Frozen audit bindings

- Production conforming math SHA256: `2EF1BB09E4FC2AA8A1DFF3A4798111D39DB614966747E88F2668529E1F8AF5CA`.
- Production worker geometry: `42CAC8371484CF4F34990F814B5AB8A43355F786A33A25E7024B52374F13A64E`.
- Native fixture manifest: `26DD7EBC8443C355EDBE612F6576437D37BDC06B4703164899B2F0A38C08B7F4`.
- First development scheduler snapshot: `59828E85A566D356F09BB28A7D973295E9AA6142A3B764825E855E4A56B8FEB8`; its admission function remains as the comparison reference.
- Incremental scheduler before sink addition: `521E54E330599E1C661B3D54F105EDF69AF480C742489243F41376C4551ED6B5`.
- Current scheduler + direct leaf sink: `4FEED913CBBECB40CFEE53A87F4BEEB11A0BF4C28E2B5B530A4F9E21B436F92B`.
- Development14-test evidence: `E60D3EF9964A7869AF109487621625635475AF2DEC8CDC6D56CE83F21CF7B276`.
- Development packet: `1D45065405FDC484FF1B72D37BB4E86F3A96FA1B1F6D026D64559C8AF505FA07`.
- Development8 packet tests: `5A9A04FEC87A502613F81B3FC978F39619617DA19AC26EE43EABCA2F87477B4D`.
