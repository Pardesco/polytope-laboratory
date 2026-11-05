# October 25 continuation: bounded portable source emission

Follows [annotation source encoding](ANNOTATION_SOURCE_ENCODING_2026-10-25.md).
Development remains 0.27.21; published/qualified 0.27.20 is preserved. The active
goal prioritizes important core workflows with broad release checks deferred.

## Implemented

`portableContentSource` emits the native-compatible tagged JSON directly into
string fragments. It no longer builds a second object/array tree containing a
tagged node for every source value before serializing it. Every source value and
object key is still visited, validated and represented in the same canonical
bytes for ordinary dense JSON input. Key sorting, binary64 spellings, SHA-256
and descriptor/cancellation/publication checks are unchanged.

UTF-8 output bytes are counted during emission. ASCII syntax/number tokens use
their exact character count; non-ASCII JSON strings use TextEncoder. Encoding
stops collecting output when the configured portable byte cap is exceeded.
The existing original-JSON byte cap, aggregate character cap, 250,000-visit cap,
64-depth cap, finite numbers, Unicode, plain-record, accessor and cycle checks
remain. Impossible wide arrays are refused before allocating their descriptor
table because every required child consumes at least one remaining visit.

Repeated nonnegative integers below 2,048 reuse their immutable tagged scalar
spelling within that one encoding call. The private null-prototype lookup can
hold at most 2,048 entries and is discarded after the call. It contains no model,
fingerprint or validation result and cannot authorize source reuse. Fractions,
larger values and negative numbers retain ordinary exact conversion. The lookup
has no inherited array entries; a regression test covers that edge case.

Dense-array validation now requires every own index to be enumerable data.
Previously a hole or hidden index plus an extra enumerable property could satisfy
the key-count check and produce a misleading portable array. Such malformed
inputs are refused. Native JSON arrays retain identical output and limits.

## Comparison

Preserved pre-change source: `artifacts/portable-stream-baseline-6x3gjom1`.
The unchanged memory signature/limits modules are copied alongside it solely to
support the existing comparison harness. The initial prototype is also retained.

Run `node scripts/profile-annotation-source.mjs
artifacts/portable-stream-baseline-6x3gjom1 --portable-stream` on one line.
The flag asserts unchanged float/key-order/hash/descriptor functions and
byte-identical memory helper modules. Independent before/after source processes
resolve their actual Viewer/controller imports to the selected helper files.
Nine alternating samples follow two warm-up pairs; startup, cloning and output
hashing are outside timing. Input is the existing Grand hexacosichoron project
and native-prepared face text document. Key bytes and geometry/highlight/text
buffers and ownership hashes match in every comparison.

Final receipt: `artifacts/annotation-source-profile-5pJNLp/result.json`.

| CPU workload | Before median (IQR), ms | After median (IQR), ms |
| --- | ---: | ---: |
| Complete portable source key | 6.173 (1.196) | 4.578 (0.492) |
| Unchanged memory-signature control | 2.486 (0.053) | 2.654 (0.426) |
| Plain navigation control | 7.012 (1.095) | 7.639 (0.944) |
| Annotated saved-selection navigation | 141.350 (99.804) | 132.651 (83.457) |

Portable source key encoding improves about **26%** in this measured case.
Navigation/control timings vary substantially; no broad loading/FPS claim is
established. CPU measurements use Node 24.22.1 on Intel Core i7-14700K/Windows
10.0.26200. Native description, real font/image decoding, GPU, Electron and
packaged timings are excluded. No measured peak-memory claim is made.

Intermediate receipts remain preserved: `annotation-source-profile-nzVzRc`
precedes small-scalar text reuse; `annotation-source-profile-23x5kv` precedes
the final null-prototype lookup. Neither binds the final source snapshot.

## Focused checks

`artifacts/portable-stream-checks-20261025-135356/result.json` passes:

- **419 Node tests including nested cases** (195 top-level), thirteen files,
  zero failures/skips.
- The **169-module production build**, with the existing large-chunk warning.
- Selected before/after source/test hashes remain unchanged.

Sixteen new cases cover 96 varied complete models compared byte-for-byte with
native Python _source, exact UTF-8/JSON/character caps, supplementary Unicode
across fragment flushes, early byte/node refusal, exact node/depth eligibility,
disguised sparse/hidden-index arrays, accessors without invocation, aliases and
cycles, unsupported values, scalar spelling boundaries/inheritance and literal
mutation after descriptor binding. The native golden corpus uses XML-representable
source text; separate direct-helper tests retain JSON escaping/byte-boundary cases.
The new suite is included in npm run test:features for final regression preparation.

Related suites cover actual native content controls, portable number spelling,
presentation/lifecycle, full-source signatures/bindings, pose/navigation,
morph/section mapping, capture and construction ownership. No full feature run,
real Electron launch or packaged/visible qualification was performed. The earlier
418-test receipt `portable-stream-checks-20261025-135041` predates the inheritance
regression fix and remains historical. Native code is unchanged in this pass.

## Continue

The project has substantial working breadth, but the parity ledger still measures
mostly prototype conformance and the full baseline audit is incomplete. Remaining
high-impact work should emphasize coherent everyday workflows, responsiveness,
clear limits and source/publication reliability. Further isolated encoding tuning
should be justified against those priorities. Full catalog crosswalk, difficult
star/nonconvex domains, interface polish and final packaged/fresh-user qualification
remain open; this optimization does not establish Stella4D equivalence.

Refresh consolidated review/source inputs and rebuild the native engine for the
earlier native changes before final packaged checks. The goal remains active.
