# Local OFF corpus audit

The local Miratope library contains **257 OFF files**, of which **196 currently import successfully** into Polytope Laboratory. All **88 four-dimensional files** import successfully. These are source files in a local checkout, rather than an independently generated named reference library or a verified complete download of the official Polytope Wiki collection.

The source directory is `C:\Users\Randall\Documents\art-projects\miratope-rs\lib`. The audit reads source files without copying or editing them. The existing independent reference catalog remains separate.

| Source folder | Files | Importer result |
| --- | ---: | --- |
| `3D/uniform` and its subfolders | 75 | 75 parsed |
| `3D/rf` | 33 | 33 parsed |
| `3D/other` | 1 | 1 explicit diagnostic |
| `4D/regular` | 16 | 6 convex, 10 generalized complexes |
| `4D/convex uniform` | 41 | 41 convex |
| `4D/nonconvex uniform` | 31 | 31 generalized complexes |
| `5D/Uniform` | 58 | Unsupported source dimension; skipped |
| `0D` and `1D` | 2 | Unsupported source dimensions; skipped |
| **Total** | **257** | **196 parsed, 1 diagnosed, 60 skipped** |

Successful parsing establishes compatibility with the current numerical importer and its incidence checks. Directory labels and filenames are retained as source metadata. The audit does not certify uniformity, regularity, canonical naming, or complete coverage of any mathematical classification. Convex recognition requires supplied face cycles and cell incidence to agree with a reconstructed hull; imported generalized boundaries retain their supplied incidence instead of being replaced by the hull. The 196 imports divide evenly into 98 convex polytopes and 98 generalized complexes.

`3D/other/utahteapot.off` is rejected because supplied faces 1233, 1647 and 2082 fail the current planarity check. Those are zero-based face identifiers. The audit retains the error, rather than repairing or modifying the source mesh.

The separate directory `C:\Users\Randall\Documents\art-projects\miratope-rs\target\release\discoveries` contains **1,652 OFF files**: 744 with 3D headers and 908 with 4D headers. They received only header, file-size and SHA-256 inventory checks. They were not imported or mathematically validated in this run. Their inclusion in an inventory is not a promotion into the reference library. No byte-identical duplicate files were found across the 1,909 inventoried files; geometric equivalence or repeated abstract incidence was not tested.

## Evidence and reproduction

The complete machine-readable evidence is [artifacts/miratope-corpus-audit.json](../artifacts/miratope-corpus-audit.json). Each record retains its absolute source path, path relative to its collection, unverified directory classification, file size, SHA-256, OFF marker, source dimension, declared count record, and explicit audit status. Parsed entries additionally retain the actual `[vertices, edges, faces, cells]` counts, geometry fingerprint, interpretation, numerical contract, validation result and timing. Header count records remain in source order: ordinary OFF uses `V F E`; 4OFF uses `V F E C`.

The initial complete run took approximately 75 seconds on this machine. It used two importer processes, a 90-second timeout per file, the existing 128 MiB file and 20,000-vertex importer limits, and no sample limit. All 197 supported library files received an importer result. None timed out. The parser and geometry module hashes stayed unchanged during the run, and all files checked after import retained their original hashes. This is a measured local run, not a performance guarantee.

From the application repository, run:

```powershell
python scripts/audit-local-corpus.py 'C:\Users\Randall\Documents\art-projects\miratope-rs\lib' --inventory-directory 'C:\Users\Randall\Documents\art-projects\miratope-rs\target\release\discoveries' --output artifacts/miratope-corpus-audit.json
```

The script recursively inventories OFF files and defaults to validating every supported library file. `--limit N` creates an explicitly partial audit: remaining supported files have status `not-audited-limit`. `--timeout`, `--workers` and repeated `--inventory-directory` options control resources and additional inventory collections. Additional inventory directories never receive importer validation through that option. Timeouts, unsupported dimensions, importer diagnostics and worker failures remain distinct statuses. Engine hashes before and after the run make concurrent importer changes visible.

## Source provenance

The local checkout's `README.md` describes it as a Miratope fork focused on concrete polytopes, with all regular polytopes, all 3D uniforms, **some** 4D/5D uniforms and some Johnson solids. This is a statement from the source project, rather than a completeness result established by this audit. Its `LICENSE` contains the MIT license with copyright attributed to the Miratope authors (2021). The audit retains paths to the local files and does not establish a per-file chain of origin from the Polytope Wiki or redistribute those files.

A linked library adds useful breadth while retaining this distinction: source labels describe what a file is intended to represent, import results describe what the kernel can validate, and independent reference tests establish separately checked mathematical examples.

## User-supplied Drive collection

The user supplied the public [Uniforms Drive folder](https://drive.google.com/drive/folders/1DrGRp2SluE3nlMGaXgxdOXaXpOSLQOZi) as an additional acquisition source. It is downloaded separately under `data/drive-uniforms`; it is not a replacement for the local Miratope checkout. Files retain their source names and nested category paths.

The public folder inventory found **3,064 OFF entries in 57 folders**, plus one non-OFF spreadsheet entry. This is the number of entries exposed by the traversed public `embeddedfolderview` pages. The downloader checks that each listed entry is recognized, rejects pagination/truncated listings, and records each folder's HTML hash. Google supplies no independently authoritative total through that endpoint, so this traversal does not certify complete remote coverage. These source folders include `Cat1` through `Cat30`, `CatS*`, `CatP3` and `Compounds` subfolders. Their relationship to published polychoron categories has not yet been crosschecked, and no 2,191-type mathematical coverage claim follows from the file count.

`data/drive-uniforms/inventory-manifest.json` retains the remote Drive IDs, source links, relative paths, folder listing hashes and listing method. `download-manifest.json` separately records per-file `downloaded`, `pending` or `failed` status, acquired byte counts, SHA-256 and OFF marker. `downloadComplete` becomes true only when every listed OFF entry has downloaded successfully. A file's existence alone does not count as successful acquisition: the audit requires a downloaded manifest entry and matching acquisition hash.

The completed acquisition downloaded **all 3,064 listed OFF files**, totaling **1,852,330,542 bytes**, with no failed or pending entries. The final header/hash inventory matched every acquisition SHA-256. Every file has a 4D OFF header; there are no 3D files in this Drive collection.

| Source folder group | 3D headers | 4D headers |
| --- | ---: | ---: |
| `Cat1` through `Cat30` | 0 | 1,944 |
| `CatS*` | 0 | 660 |
| `CatP3` | 0 | 31 |
| `Compounds` and subfolders | 0 | 429 |
| **Total** | **0** | **3,064** |

The inventory found 13 pairs of byte-identical files at different source paths, leaving **3,051 distinct byte streams**. Those duplicate groups are recorded without removing source entries. Identical bytes are a stricter comparison than geometric equivalence: differently ordered or scaled realizations may still represent the same shape. No geometric or classification deduplication is claimed.

The bounded compatibility check is:

```powershell
python scripts/audit-drive-corpus.py --sample-size 24 --output artifacts/drive-corpus-audit.json
```

This recursively accounts for every entry in a snapshot of the acquisition manifest, retaining explicit undownloaded and unsampled statuses. Downloaded files receive header/hash inventory checks and per-category dimension counts. Full import is limited to the requested sample, using regular/star source anchors, four files with the largest declared incidence counts and representatives from further source categories. The default is 24 files, two importer workers and a 90-second timeout per file. `--sample-relative 'Cat1/7-Fix.off'` prioritizes an exact source path, and `--sample-size 0` inventories without importing. The script never downloads or edits the acquired source files.

Audit reports distinguish source category labels, acquisition completion, numerical importer compatibility and mathematical certification. They record whether the acquisition manifest or importer changed during the run. Running while downloads continue therefore creates explicitly dated partial acquisition evidence; repeat after completion for the final header inventory. A sampled importer run does not establish compatibility of all 3,064 entries.

The [completed header inventory and 24-file importer sample](../artifacts/drive-corpus-audit.json) contains full per-category 3D/4D counts, source links, hashes, resource checks and explicit statuses. All 24 sampled files imported: **4 convex polytopes and 20 generalized complexes**, including `CatS1`, `CatS19`, `CatP3`, `Compounds`, `Cat29` and `Cat30` representatives. The four largest sampled incidence records have 7,200 vertices, 57,600 edges and up to 123,600 faces. All supplied counts agreed with the imported counts. No sampled file timed out or failed importer validation. Generalized validation warnings remain recorded; successful parsing does not certify manifoldness or uniformity.

That sampled run retained unchanged acquisition-manifest and importer module hashes throughout the audit. All sampled source files also retained their original hashes after import. In that historical sample report, the other 3,040 entries have explicit `inventory-only-unsampled` status. The October 4 full audit below supersedes its importer coverage.

All source header counts and file sizes lie within the current importer resource domain. Across the collection the maximum declared counts are 14,400 vertices, 57,600 edges, 123,600 faces and 19,920 cells; these maxima occur in potentially different files. This is a header resource check, not an exhaustive parse or mathematical validation.

The first five-file pilot imported `Cat1/1-Pen.off`, `2-Tes.off`, `5-Hi.off`, `6-Ex.off` and `7-Fix.off`. Four matched convex boundaries and `7-Fix.off` retained generalized incidence. [The pilot evidence](../artifacts/drive-corpus-pilot-audit.json) is separate from final download and compatibility evidence. The Drive files' publishing license and per-file upstream attribution have not been established by the acquisition manifests; they remain locally acquired sources rather than bundled reference geometry.

[Star preservation evidence](../artifacts/drive-star-preservation.json) additionally checks `Cat1/7-Fix.off`, `10-Sishi.off`, `15-Gax.off` and `16-Gogishi.off`. Supplied float coordinates, ordered face cycles and cell-face incidence survive import and OFF export/reimport exactly. The Sishi and Gogishi files each retain 720 faces with winding number 2; Fix and Gax each retain 1,200 faces with winding number 1. All four remain generalized complexes. Winding is measured numerically in each face's SVD plane, and the evidence retains source SHA-256 and importer module hashes.

## Full importer audit — October 4, 2026

The [resumable validator](CORPUS_VALIDATION.md) has now checked all **3,064**
manifest entries with isolated importer processes, four workers and a 90-second
per-file timeout. The run first checkpointed 16 entries, then resumed through
the remaining 3,048 in **1,485.38 seconds (24.76 minutes)**. Every manifest entry
received either a passing parse or a deterministic importer diagnosis.

| Result | Files |
| --- | ---: |
| Parsed as convex polytopes | 66 |
| Parsed as generalized complexes | 2,982 |
| Diagnosed: declared edge count differs from face-derived edges | 12 |
| Diagnosed: extra integers after cell boundaries | 2 |
| Diagnosed: cells fail affine dimension 3 | 2 |
| Timeout / worker failure / source-hash change | 0 |
| **Total** | **3,064** |

The 12 edge-count diagnoses are in `Cat19`; the exact source paths and actual
versus declared counts are in the [compact failure report](../artifacts/drive-corpus-full-audit.failures.json).
`Cat20/966-Sidtidap.off` and `Cat20/967-Ditdidap.off` append three integers to
every cell boundary. Their declared face indices are in range; suffix triples
such as `[64, 255, 64]` and `[255, 128, 255]` appear to be RGB colors. The historical strict
importer rejected these extra fields; the 0.9.0 RGB/RGBA compatibility importer accepts both files. This is a format-compatibility
finding, not a conclusion that the shapes themselves are invalid.

`Compounds/2demitessic/2hex-Haddet.off` is diagnosed for cells 22 and 23;
`Compounds/2demitessic/2tho-a-Dathah.off` for cells 6 and 7. Those cells fail
the current numerical affine-dimension check. No source file was repaired,
renamed, normalized or excluded from the manifest count.

All acquisition hashes matched; every post-import source hash remained unchanged.
The acquisition manifest and all hashed validator sources remained unchanged
throughout the run. The slowest worker took **16.35 seconds**. Every imported
model remains `float64-approximate` with no exact certificate. Full validation
warnings are retained, including generalized manifold/Euler diagnostics.

An immediate full resume reverified the source hashes and reused all **3,064**
results with **zero new imports**, in **3.43 seconds**. The result timestamps,
counts, fingerprints and checkpoint journal remained unchanged. The command
returns 1 because the 16 deterministic rejections remain in the report;
`completeImporterAudit` is true because coverage is complete.

Evidence:

- [Latest complete inventory and per-file results](../artifacts/drive-corpus-full-audit.json)
- [Compact list of 16 rejections](../artifacts/drive-corpus-full-audit.failures.json)
- [Original full-run summary and timings](../artifacts/drive-corpus-full-audit-run-summary.json)
- [Full-library resume verification](../artifacts/drive-corpus-resume-verification.json)
- `artifacts/drive-corpus-full-audit.checkpoint.jsonl` — durable results for future resume

The full kernel suite passed **292 tests with one Windows-specific skip** before
four additional audit edge-case tests were added; the final audit test module
passes **23 tests**. The initial focused audit/download run passed 39 tests.
Tests include real worker timeout/cancellation and full/limited/no-op resume.

Importer compatibility is now exhaustively accounted for this acquisition
snapshot. Mathematical classification, canonical names, uniformity and the
2,191-baseline crosswalk remain unverified. The 0.9.0 compatibility investigation accounts for all sixteen historical findings: two colored files import, twelve header mismatches permit validated separate copies, and two supplied compound cells remain rejected with exact rank-four witnesses. Reconciliation against the baseline remains a separate corpus task. See [OFF compatibility](OFF_COMPATIBILITY.md).


## Current 0.9.0 importer audit ? October 4, 2026

The fresh audit covers every one of the same **3,064 unchanged sources**: **3,050 parsed** (66 convex and 2,984 generalized complexes), **14 diagnosed**, and zero timeouts, worker failures or pending entries. It completed in **27.11 minutes**; the slowest import took **16.68 seconds**. Acquisition-manifest, importer and validator hashes remained unchanged throughout.

Both RGB-suffixed `Cat20` sources now import. Twelve `Cat19` header edge-count mismatches still receive strict source-file rejections; explicit corrected copies pass complete incidence validation. Two compound files retain cells whose affine rank is four rather than the required three, with exact integer determinant witnesses. Source files are preserved. See [OFF compatibility](OFF_COMPATIBILITY.md).

The current compact index contains 3,064 provenance-bearing results and is 2,710,667 bytes. Independent explicit hashing of the complete **1,852,330,542-byte** source tree took **2.21 seconds** and found all source hashes current: **3,050 passed / 14 rejected**, with fresh importer provenance. Compilation took **0.35 seconds**, without reconstructing geometry. The app's normal linked-library profile now attaches this evidence. Startup hashes remain bounded; use **Verify** to refresh all source hashes in the current session.

Evidence:

- [Current complete audit](../artifacts/drive-corpus-0.9.0-audit.json)
- [Current 14 diagnoses](../artifacts/drive-corpus-0.9.0-audit.failures.json)
- [Compact library index](../artifacts/drive-corpus-0.9.0-audit.library-index.json)
- [Independent provenance/hash verification](../artifacts/drive-corpus-0.9.0-audit-verification.json)

The earlier 3,048/16 audit remains historical. Neither audit certifies source classification, uniformity or full benchmark conformance.
