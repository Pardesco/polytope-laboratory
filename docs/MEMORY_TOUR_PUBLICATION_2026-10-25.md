# October 25 continuation: memory and tour publication

Follows [bounded validation-key encoding](VALIDATION_KEY_ENCODING_2026-10-25.md).
Development remains 0.27.21; the published/qualified 0.27.20 baseline is preserved.
The high-impact goal stays active; broad release qualification remains deferred.

## Implemented

**Memory Open/Swap/Add recheck export state and document capacity after native
work.** Previously these checks ran before validation/addition, allowing an
operation to add a document during an export that started while it waited, or to
exceed the 100-document limit after background catalog publication. Existing
project/state identity checks remain, and optional cancellation signals reach
NativeJobs. Aborted or failed native work leaves the document and memory bank
unchanged.

**Swap publishes its slot and document in the same continuation.** MemoryControls
passes a final source/export/bank verifier and a synchronous slot publication
callback to the authoritative app restore. The restore validates independently,
checks its owners and capacity, adopts the document, commits the slot, and then
marks dirty/renders, with no await between those steps. Dirty/save/export
observers see the complete pair. The old path adopted the document first and
checked/changed the bank in a later continuation; a changed bank could leave a
partially completed swap. The restore callback contract is now exercised in both
the memory unit fixture and the actual app-function integration tests. Ordinary
memory opens and comparison-source restores require no slot callback.

**Add verifies the selected memory bank immediately before adding its result.**
A changed bank while compound computation waits now discards the new document.
The slot remains unchanged for a successful Add.

**Tour pause forwards cancellation to native event validation.** Already canceled
events start no work. A pending event passes its signal through app run/NativeJobs;
pause releases renderer job ownership promptly even if a provider replies late.
Final checks reject source/export/generation changes with AbortError, preventing
the tour controller from treating a discarded preview as a successful show.
Tour-bank identity is checked before preview document adoption. Successful events
still reuse one preview document and retain complete validated state.

**Tour import checks export state at publication.** The shared tour publisher now
rejects mutation during export, covering an import whose chooser/read began
before another exporter started. Preview cursor publication also checks export
state after its await.

No native geometry/parser/cache code or file-worker isolation policy changed in
this pass. The worker-path investigation confirmed that Open/Save intentionally
use isolated processes; this continuation makes no file-startup latency claim.

## Focused evidence

`artifacts/memory-tour-publication-20261025-131235/result.json` passes:

- **148 Node tests** across ten relevant suites, including 29 new app-function /
  control / NativeJobs integration cases.
- The **169-module production build**. The existing large-chunk warning remains.
- Selected source/test hashes match before and after execution.

The new suite `tests/memory-tour-publication.test.mjs` executes the actual app
restore/Add/tour functions in a VM with real MemoryControls, TourControls and
NativeJobs and held native providers. Cases cover both exporters, all three
memory actions, capacity changes, bank changes, project/document replacement,
native failure/retry, cancellation and late replies, atomic swap visibility at
dirty notification, a queued export after successful publication, preview reuse,
and export starting during tour import. It is included in `npm run test:features`
for final regression preparation. No full features run was required for this pass.

Other selected suites cover memories/tours, native jobs, project workflows,
animated tour controls/export, animation capture, comparison regiments and source
reflection controls. Native providers in the new integration suite are controlled
test doubles; this does not prove visible Electron cancellation latency or a
packaged workflow. No real Electron launch was performed.

Earlier logs are preserved: `memory-tour-publication-20261025-131016` has successful
test/build logs but its receipt writer hit a console encoding error;
`memory-tour-publication-20261025-131111` passed before the final import guard.
Neither substitutes for the final source-bound receipt above.

## Continue

Profile remaining navigation/display costs. One concrete candidate is the extra
full base display when restoring an existing entity selection in renderWorkspace;
preserve annotation ownership, panel state and picking coherence when investigating.
Keep source/native/publication checks intact and defer broad qualification until
release preparation. Refresh the consolidated source/review inputs and rebuild
the native bundle for the earlier native changes before packaged qualification.
