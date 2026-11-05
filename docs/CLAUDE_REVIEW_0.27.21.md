> Published October 24, 2026: [0.27.20 community preview](https://github.com/Pardesco/polytope-laboratory/releases/tag/v0.27.20) is now public, with matching executable/source ZIP. GitHub main and tag v0.27.20 use the verified sealed source plus publication documentation updates (commit `62abb4c`). Local 0.27.21 remains unqualified. Older public-0.26.0 statements below are historical.

# Review brief: 0.27.21 core performance and source qualification

October 25 update: this brief and its referenced diff describe an earlier source
snapshot. Include all later core-workflow continuations, most recently
[image capture reliability](IMAGE_CAPTURE_RELIABILITY_2026-10-25.md), when refreshing
the consolidated review diff. In particular formats.py now changes project
validation and section_validation.py changes bounded key encoding, while parser
logic and original geometry helpers remain intact.

Prepared October 24, 2026. This is a review request artifact, not a record that
independent review has happened. Read the current
[handoff](HANDOFF_0.27.21.md), [release notes](RELEASE_0.27.21_DEVELOPMENT.md) and
[analysis reuse argument](NATIVE_ANALYSIS_REUSE.md). Normal-session packaged
qualification and fresh-user observation remain outstanding.

## Baseline and boundaries

Compare with the sealed **0.27.20** source, not the old Git commit or the heavily
dirty worktree's index. Baseline verification is
`artifacts/source-pair-0.27.20.json`; the original archive/portable hashes are in
`artifacts/prior-pair-and-runtime-analysis-0.27.21.json`.
The runtime and test/tool changes through the analysis continuation are in
`artifacts/runtime-review-analysis-0.27.21.patch`. The subsequent qualification
coverage and fixture repairs are recorded separately by the current source
qualification receipts and the final qualification audit. The consolidated
43-file runtime/tool/test diff is
`artifacts/runtime-review-source-qualification-0.27.21.patch`; its JSON companion
binds every included candidate/baseline file hash.

No feature stages were integrated. No protected importer, core geometry,
measurement implementation or mathematical trajectory was changed. No Electron
launch, ACL workaround, package, freeze, source seal, commit or publication has
been performed in this managed environment. Public production remains the
documented 0.26.0 preview; the last qualified local pair remains 0.27.20.

## Three changes to challenge

1. **Pose ownership snapshots.** Review
   `ui/element-content-controls.mjs` and
   `ui/element-content-display-owner.mjs`. A completed full refresh captures
   detached literal notes/non-angle-view values. Immutable strings are retained
   without per-frame JSON encoding; nested mutable records are copied. Existing
   identity/cancellation/job guards remain. The complete annotation document is
   compared inside the view, including embedded source/assets. Non-pose display,
   native publication and capture retain their full checks. This preserves the
   previously reviewed bounded angle-only exception; it does not claim arbitrary
   model immutability or that object identity certifies in-place source edits.

2. **Convex 3D sizing-plan reuse.** Review `engine/dual_morph.py` and
   `engine/dual_morph_cache.py`. Only the read-only convex intrinsic 3D sizing
   plan is admitted. The key contains the entire canonical validated source,
   normalized settings and notes/effective-unit context. Every evaluation still
   compares the caller's complete preparation against the native preparation.
   Check that evaluation cannot mutate retained plan data, that output records
   do not alias it, and that rejected/forged requests cannot authorize a later
   incorrect publication. Larger inputs compute without reuse. Other morph
   methods retain their original paths.

3. **Repeat analysis reuse.** Review `engine/server.py` and
   `engine/analysis_cache.py`. The original analyzer runs on misses and errors
   are never cached. Complete literal input and analyzer identity own each entry;
   neither claimed validation nor model measure scalars authorize reuse. Explicit
   `validate` dispatch is unchanged. Check LRU entry/key/result/total budgets,
   source type distinctions, eviction, copied cached reports and new request IDs
   in JSON-lines replies. Frontend report ownership and cancellation stay with
   the existing controllers.

In each case, challenge edits that retain IDs, counts and fingerprints. Include
in-place annotations, source colors/metadata/units, pending refreshes, stale
worker publication, native source mutation and exact capture. The focused tests
exercise these cases, but do not treat their existence as a substitute for
examining whether the asserted invariant is the right one.

## Measurement limits

- `element-owner-benchmark-Jy8SoN`: saved Grand hexacosichoron ownership
  comparison; Node only. The 4 MiB image case is an opaque synthetic string,
  without decoding or GPU work.
- `native-sizing-profile-vbl7d6t2`: seven alternating-order passes, direct Python
  dispatch, exact sampled frame equality against sealed old source.
- `native-analysis-profile-0kc_w57q`: original protected analyzer versus cached
  computation, with unchanged source and complete report equality.
- `analysis-protocol-profile-6p7c5jny`: actual JSON-lines pipe round trips against
  the sealed old server source, with fresh IDs and equal decoded reports. These
  are Python source workers, not the packaged native executable or Electron IPC.

All folders above are under `artifacts/`. Their input hashes are checked against
the measured implementation. The 120-cell analysis timings vary substantially;
retain IQRs and raw observations. Cold misses add bookkeeping and independent
model generation is not accelerated. No desktop latency or general FPS claim is
supported until the packaged observations are collected.

The supplied truncated-tetrahedron sizing investigation confirms equal automatic-
radius endpoints and the defined smaller midpoint. A real Viewer/native-frame
test verifies a fixed camera and normalization. This does not establish which
settings were used in every older scaling report.

## Qualification coverage and initial failures

The original `test:features` omitted 33 shipped-code test files. They are now
declared, with sequential execution. Five explicitly named tests still target
unmounted development-only projection prototypes. The frontend qualifier checks
complete shipped-test membership and records the exclusions.

The expanded first run had **2,044 passes and 30 failures**, with unchanged
inputs. Twenty-nine failures were renderer doubles missing the production
`setClearColor()` API; one tour-layer double lacked `setSectionModel()`.
Initial bytes and paths are preserved by
`artifacts/frontend-qualification-initial-index-0.27.21.json`.

Six Viewer fixtures now use the shared renderer, and the tour fake records the
section source/mode. The shared renderer contract also covers the appearance
helper and checks transparent tour alpha. The affected **51 tests pass** in
`artifacts/fixture-repair-focused-0.27.21.tap`. Production rendering was not
weakened to accommodate the doubles.

Source qualification now binds native and JavaScript dependencies used across
the boundary, scripts, test helpers/fixtures and top-level development reference
sources before and after execution. Tests run from this workspace; the source-
stage override variables were absent in this session. Installed dependencies are
described by lock/configuration and runtime versions; these are source-test
receipts, not a claim that every external dependency byte was hashed.

Final broad qualification passes: **2,075 Node tests**, **4,476 native tests
plus 96 subtests**, one native skip, and the **168-module build**. Both qualifiers
bind the same 2,474 unchanged inputs. Inspect the actual
`frontend-source-tests-0.27.21.json`, `native-development-0.27.21.json` and their
logs, together with `artifacts/local-checks-source-qualification-0.27.21.json`.
The older 263-Node/192-native focused receipts remain overlapping historical
evidence. [Source qualification](SOURCE_QUALIFICATION_0.27.21.md) documents the
expanded coverage, inherited repairs and preserved failed runs.

## Native regression debt reproduced on the qualified baseline

The first complete native run reported **4,459 passes, 14 failures, one skip
and 96 passing subtests**, with unchanged bound inputs. The exact same 14
failing cases also fail on all 2,522 hash-verified files extracted from the
sealed 0.27.20 archive. The six affected test files were byte-identical there.
See `artifacts/native-inherited-baseline-0.27.21.json` and its raw log;
`artifacts/qualification-before-native-repair-index-0.27.21.json` preserves the
initial native run and the earlier green frontend receipt before test repairs.

The repairs retain malformed-input refusals, using non-boolean values for the
now-supported spiky/tidy-dual filters. A tetrahedron additionally proves a
completed negative spiky result and accepted tidy-dual adoption/replay. Catalog
membership now binds the 167 original Antiprism entries plus twelve reflected
snubs and the separately attributed Skilling figure to their actual manifests.

Pose-only history still appends directly to the existing parent. Edited notes
are literal content: `content_source_changed()` requires a new full source
snapshot before placement/geodesic operations. Separate tests check preserved
old graph nodes, source/operation dependency, source immutability and replayed
notes. Regular star models with ordinary face cycles now check exact source
face ownership and rigid net folding; pentagram-face nets and convex-only duals
still refuse. Four-dimensional incidence reciprocity now checks tesseract counts,
round-trip coordinates/cycles/cells and open-boundary refusal. No production
geometry or history contract was weakened to satisfy these older tests.

## Normal-session decision

Record findings with reproductions and distinguish blockers from optional
improvements. Run the exact sequential package/canary, alternating navigation/
rotation and morph profiles, packaged workflows, actual portable and sealing
sequence from the handoff. If a candidate fails, preserve it and its evidence.
Do not freeze or seal untested runtime, or treat source-only receipts as desktop
qualification. No online publication is part of this continuation.
