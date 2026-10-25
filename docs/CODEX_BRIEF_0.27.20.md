# Codex build brief: 0.27.20

Source: Claude's review, `docs/CLAUDE_REVIEW_0.27.19_RESPONSE.md`. Read it first,
then `docs/CLAUDE_REVIEW_0.27.19.md`, `docs/HANDOFF_0.27.19.md`,
`docs/NEXT_SESSION.md` and `docs/OPEN_SOURCE_ROADMAP.md`.

## Hard rules

- No commits, pushes, tags or publication. Do not reset, clean, or overwrite any
  existing archive, receipt, or `release/preview-0.27.19*` / earlier artifact.
- Do not change the protected files `engine/__init__.py`, `engine/formats.py` or
  `engine/geometry.py` (hashes are in the 0.27.19 brief). No engine changes are
  expected for this work at all.
- This is a runtime change, so the version is **0.27.20**. Never rebuild or
  re-seal 0.27.19.
- Scope is only the three tasks below. No new features, controls or catalog work.
  If you find something else, write it down in the handoff and don't fix it.
- Do not weaken any source/document validation, and do not substitute IDs,
  counts or fingerprints for literal source checks on any path that publishes content.
- Run heavy GUI, native and packaging work sequentially, in isolated profiles,
  as the existing docs describe. Preserve initial failures and raw samples.

## Task 1: annotation refresh must not run on pose-only updates

Problem (review F1): `displayBase()` (`ui/app.js` ~line 446) always calls
`elementContent.refresh()`. The Rotate tick (`ui/viewport-controls.mjs` ~line 59)
and plane slider `oninput` (`ui/app.js` ~line 703) call `displayBase()` on every
frame. With any non-null annotation document, including `{entries:[]}` after
removing the last label, `refresh` runs `captureNativeSource` (a full model
clone plus `JSON.stringify`) on every frame before its cache check. The
descriptor does not depend on pose. `Viewer.setDisplay` already re-projects the
existing layer through `syncElementContent()` → `elementContentLayer.rebuild()`.

Do this:

1. **Reproduce first.** Extend `scripts/profile-model-view.cjs` with a workload
   option: `absent` (current behavior), `annotated` (one face text label added
   through the real UI before rotating), and `emptied` (add one label, remove it,
   then rotate). Each run still asserts that source, notes and the annotation
   document survive rotation unchanged. Run it on the packaged 0.27.19 to confirm
   that `annotated` and `emptied` show the source-walk hotspot. Save the receipts.
2. **Fix.** Give pose-only updates a display path that does not call
   `elementContent.refresh()`. Do this either as a separate function, for example
   `displayPose()`, or as an explicit option on `displayBase`. Use it **only**
   where nothing but the 4D angles or rotation pose changed: the viewport Rotate
   tick, the plane sliders, and any other call site you can show is angle-only.
   Every other caller (visibility, cells, projection, appearance, morph frames,
   model or state change, Undo/Redo, Open) keeps the full refresh. If unsure
   about a call site, leave it on the full path.
3. **Safety net.** The pose path still calls `base.setDisplay(...)`, so the
   existing layer gets re-projected. If no full refresh has completed for the
   current `state` / `viewer.model` / `net` / `cellNet` (for example, the first
   frame after a model change), the pose path falls through to the full refresh.
   The skip may only apply when those identities match the last completed full
   refresh.
4. **Tests** (node:test, behavioral):
   - With an annotated document, N pose-only updates cause zero
     `captureNativeSource`/source enumeration. Use a Proxy trap like the existing
     `tests/empty-element-content.test.mjs`. The layer receives `rebuild()` each
     time, and labels follow the new pose.
   - The same holds for an explicit `{entries:[], assets:{}}` document.
   - A pose update right after a model, state or document change still runs the
     full validated refresh.
   - A content edit during rotation still publishes through the full path, and
     stale results are still retired as `AbortError`.
   - Check all projection modes that `syncElementContent` serves (orthographic,
     perspective, stereographic, stereo, exploded). Labels must track geometry
     under rotation. Use one packaged screenshot or a pixel or rebuild assertion
     per mode, whichever the existing harnesses support.
5. Do **not** canonicalize empty documents to `null` in the engine or the UI.

## Task 2: `holdObservationControls().release` must restore every group

`ui/observation-controls.mjs`: if restoring one group throws, the loop stops and
later groups stay disabled forever (frozen orbit). Restore each group in its own
try/catch, always delete ownership, finish the loop, then rethrow the first
error. Add a regression test with two viewers where the first group's
`enabled` setter throws. Assert that the second viewer's controls get restored
and both ownership entries are released.

## Task 3: measurement and a mock contract

- With the extended profiler, run packaged 0.27.19 and 0.27.20 **alternating**,
  at least 5 runs per version per workload (`absent`, `annotated`, `emptied`),
  sequentially on an otherwise idle machine. Report the median and IQR of
  renderer non-idle ms per rotation window, plus long-task count. RAF cadence is
  vsync-capped at about 5.6 ms on this display, so report it but do not draw
  conclusions from it. Write the comparison to
  `artifacts/model-view-comparison-0.27.20.json`.
- Add a test that fails if `ui/viewer.js` calls a renderer method that the
  shared fake renderer in the tests does not implement. Use static extraction of
  `this.renderer.<method>(` calls, or whatever is least brittle.

## Finish

- Run the existing focused suites touched by these files, plus the new tests.
  Then package and qualify 0.27.20 with the project's existing documented
  procedure (freeze, verification receipts, source-pair). No publication.
- Write `docs/RELEASE_0.27.20_DEVELOPMENT.md` and `docs/HANDOFF_0.27.20.md` in the
  existing style. Say exactly what was run, what passed, what failed initially,
  the measured before/after distribution, and anything you deliberately left out
  of scope. Update `docs/NEXT_SESSION.md`.
- Final message: changed files, test counts, profile medians, and any open risks.

---

## Addendum (Claude, Oct 23): baseline reproduced, Task 1 unblocked, new Task 4

Claude ran your new profiler from Randall's normal Windows session. Electron
launches fine there. Packaged 0.27.19, Grand hexacosichoron, 1.5 s Rotate:

| Workload | Receipt | RAF median | Non-idle | New programs during rotation |
| --- | --- | --- | --- | --- |
| absent | `artifacts/model-view-profile-YTlmPn` | 5.6 ms | low | 0 |
| emptied | `artifacts/model-view-profile-GFRm4h` | 6.3 ms (p95 12.7) | 1,618 / 1,637 ms | 0 |
| annotated (1 face label) | `artifacts/model-view-profile-5GRQeE` | **31.4 ms** | 2,054 / 2,074 ms | **102** |

Hotspots mapped against the 0.27.19 bundle: emptied = memory signature walkers
(`memorySourceSignature`/`storeMemory`, minified `W0`/`yc`), which is review F1/F2.
Annotated adds portable source hashing (`portableContentSource`, minified
`un`/`x1`) and GPU program churn. The "reproduce first" step is done, so
implement Task 1 now.

### Task 4 (new, fold into 0.27.20): label layer rebuild is expensive on every frame

`ViewerElementContent.rebuild()` (`ui/viewer-element-content.mjs` ~line 34) runs
on every `setDisplay` through `syncElementContent()`. Each call:

1. Calls `rendererCheck` (the `check` closure in `set()`, ~line 18), which runs
   `portableContentSource(rendererModel)` over the whole model, and `isCurrent()`.
   For the interactive path, `isCurrent()` calls `verifyPublication` →
   `verifyNativeSource` → another full memory signature walk. So skipping
   `refresh()` (Task 1) alone will not fix the annotated case.
2. Creates new `MeshBasicMaterial`/`SpriteMaterial` objects and disposes the old
   ones in `clearGeometry()`. Three.js then deletes and recompiles programs on
   every frame (102 in 1.5 s).

Fix, in this order, measuring each (Claude will run the packaged profiles):

- **Materials:** keep one face material and one sprite material per texture
  record, reused across rebuilds. Update only mutable uniforms such as opacity.
  Dispose them in `destroy()` and whenever a record's texture is replaced.
  `clearGeometry()` keeps disposing geometry but no longer disposes reused
  materials. Retained materials must never hold a disposed texture, stale
  colors, picking indices or source mapping. Add tests: zero material
  construction across N pose rebuilds; `destroy()` disposes every retained
  material exactly once; a texture replacement disposes the old material.
- **Per-frame source verification:** pose-only rebuilds must not walk or hash
  the whole source. You may not just delete the check. Find an *equivalent
  proof* that the literal source has not changed since the full check at
  `set()`. For example, show that `viewer.model` and the bound source snapshot
  cannot be mutated in place (frozen at adoption, with a test that in-place
  mutation throws or is impossible), so reference identity plus generation is
  equivalent. Otherwise, run the full check on every non-pose display and on
  any capture or publication, and skip it only on pose-only rebuilds after a
  completed full check with identical identities. Capture (`prepareCapture`)
  and every content publication keep the full literal checks. Write the
  argument down in `RELEASE_0.27.20_DEVELOPMENT.md`. Claude will review it
  before the result counts as done.

### Environment rule for this run

Electron cannot launch inside your sandbox, so don't retry launches or ACL
workarounds. Do all code, unit/behavioral tests and `npm run build`. Then stop
and list, in `HANDOFF_0.27.20.md`, the exact packaged commands Claude should run
(package, profiles, qualification) in order. Do not freeze, seal or write the
source pair until those packaged checks have been run.
