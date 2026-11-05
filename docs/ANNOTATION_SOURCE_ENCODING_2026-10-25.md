# October 25 continuation: annotation source encoding

Follows [navigation display](NAVIGATION_DISPLAY_2026-10-25.md). Development stays
0.27.21; published/qualified 0.27.20 remains preserved. Continue the active
high-impact goal with noncritical broad qualification deferred until release.

## Implemented

**Exact binary64 portable spelling without per-number allocations.**
`pythonFloatHex` now uses one private synchronous eight-byte DataView and reads
its two unsigned 32-bit words. Both words are captured before formatting the sign,
exponent and all 52 fraction bits. The old path allocated an ArrayBuffer/DataView
and performed BigInt extraction for every source number. Canonical zero,
subnormal/normal spellings and rejection of nonfinite/non-number inputs are
unchanged. Workers have independent JavaScript runtimes; the scratch buffer is
not exported or retained in a publication.

**Dense-array validation without reparsing every enumerable index string.**
`memorySourceSignature` still inspects the own data descriptor of every required
index, enforcing the same node/depth/byte/type/accessor/cycle/symbol checks. It
counts enumerable required indices, then compares that count with Object.keys.
Any extra enumerable property changes the count and is refused. Nonenumerable
indices and ignored nonenumerable data retain the existing memory serialization
semantics. This removes the separate callback/Number/string conversion for each
index key; no array element or source field is skipped.

No result cache, fingerprint shortcut, source certificate reuse or skipped
publication check was introduced. The portable source walk, SHA-256 functions
and descriptor checks are byte-for-byte unchanged after the float encoder; the
comparison script asserts that suffix equality. Native source/parser/geometry
code is unchanged in this pass.

## Why these changes

`artifacts/annotation-cpu-PC10JD/profile.cpuprofile` samples six actual app
annotated CPU navigations. Top self-sample counts include memory-source walk
(211), portable walk (138), portable number conversion (103), portable wrapper
(89) and garbage collection (32). This diagnostic profile guided the work; its
samples are not a wall-clock timing comparison. Its selected source hashes bind
the preserved pre-change inputs.

Preserved helpers: `artifacts/annotation-source-baseline-54qzn8bi`. The original
model-memories module is retained there solely to supply the baseline signature
helper's identical resource-limit constants.

## Performance evidence and limits

`scripts/profile-annotation-source.mjs` runs independent before/after Node
processes. Its baseline-only resolver maps the two changed helper imports to
preserved files, including the actual Viewer/controller consumers; the receipt
checks which modules were remapped. Child startup/imports, input cloning and
output hashing are outside timing. Nine alternating samples follow two warm-up
pairs per case. Exact source signatures and geometry/highlight/text-buffer and
owner outputs match, with all annotation publications completing.

Final receipt: `artifacts/annotation-source-profile-13CN9t/result.json`.

| CPU workload | Before median (IQR), ms | After median (IQR), ms |
| --- | ---: | ---: |
| Complete portable source key | 8.808 (0.738) | 5.951 (0.593) |
| Annotated state memory signature | 3.085 (0.281) | 2.574 (0.561) |
| Plain saved-selection navigation | 6.557 (0.216) | 6.771 (1.497) |
| Annotated saved-selection navigation | 335.391 (170.192) | 191.012 (92.739) |

Portable key encoding improves about 32% in this measured source, and the state
signature about 17%. Navigation measurements have substantial variability;
despite all nine annotated pairs improving, do not present the difference of
medians as a general desktop/navigation speedup. Raw pairs are retained. The
earlier `artifacts/annotation-source-profile-twQ3Nv` comparison also has noisy
navigation timings and remains preserved.

Input is the existing Grand hexacosichoron project with a native-prepared face
text document. Timings use the actual app/Viewer/content functions with controlled
DOM, unrelated panels and descriptor provider. Native description, actual font/
image decoding, GPU, Electron and packaged timings are excluded. Hardware/runtime:
Intel Core i7-14700K, Windows 10.0.26200, Node 24.22.1. This is an additional source
comparison after the navigation-display change; it does not compare directly to
the sealed release or qualify a portable build.

## Focused checks

`artifacts/annotation-source-checks-20261025-133411/result.json` passes:

- **403 Node tests including nested cases** (179 top-level cases), twelve files,
  zero failures/skips.
- The **169-module production build**, retaining the existing large-chunk warning.
- Selected source/test hashes unchanged across execution.

The new float suite compares more than 4,000 deterministic binary64 patterns to
Python's float.hex, covering exponent/fraction/sign boundaries, subnormals,
maximum finite values, signed zero, interleaved calls and invalid input types.
It also checks the complete portable representation for the batch. Existing
native descriptor fixtures confirm unchanged source hashes/Unicode ordering.
The suite is included in npm run test:features for final regression preparation.

New array tests exercise nonenumerable required indices, ignored hidden data,
disguised extra keys and nonenumerable accessors without invoking them. Existing
signature/binding tests cover complete literal mutations, identity replacement,
units/notes, export, cycles, sparse/custom arrays, symbols and resource bounds.
Selected consumers cover actual native content controls, lifecycle/presentation,
ordinary/worker display, morph/section mapping, capture, pose ownership and
construction source ownership. No full feature run, real Electron launch or
packaged/visible qualification was performed.

## Continue

Continue profiling substantial core costs rather than expanding features. Source
walks and portable container construction still dominate annotated preparation;
any further change must retain complete literal mutation/resource/ownership
checks. Consolidated review/source qualification needs refreshed inputs, and the
earlier native changes still require a rebuilt engine before final packaged
checks. The goal remains active.
