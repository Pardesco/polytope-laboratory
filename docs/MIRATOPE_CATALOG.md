# Miratope regular 4D source catalog

`engine/catalog_data/miratope` contains 16 unchanged OFF assets copied from the
read-only local checkout
`C:\Users\Randall\Documents\art-projects\miratope-rs\lib\4D\regular`.
The checkout's HEAD at acquisition is
`f8ecb0da7bac755586d114a6609d1b6968cff82c`. The manifest records the acquisition
time, source-relative paths, raw-file SHA256 and byte lengths, Git-blob SHA256,
source representation fingerprints, strict-import results and numerical
evidence. No edits are made in the source checkout.

The copied `LICENSE` is the source MIT license, with attribution
`Copyright (c) 2021 Miratope authors`; `ATTRIBUTION.txt` identifies the acquisition.
Its unchanged raw SHA256 is
`136b8993848f2fb87fd3d021c387a6b2ed510e28e3404eeca526cf5b2b13572d`.
The local README identifies a fork of
[vihdzp/miratope-rs](https://github.com/vihdzp/miratope-rs).
The local repository has no configured remotes, so the manifest does not claim
that its revision or files were downloaded directly from that upstream URL.

The checkout is clean for these OFF sources and license. Its OFF worktree files
use CRLF while their Git blobs use LF. Copies retain the worktree bytes exactly;
the manifest truthfully records `bytesEqualGitBlob=false` and
`lineEndingNormalizedEqualGitBlob=true`. Both identities are kept, so acquisition
does not silently normalize source line endings.

## Registrations and alternate references

The directory names these sources as regular polychora. The manifest retains
that source classification separately from the measured properties. Ten
nonconvex source entries use `miratope-<stable filename slug>` keys with
`registration='regular-star'`. Six convex source entries use
`registration='alternate-convex-source'` and reference existing builtin keys;
they do not request duplicate builtin registration.

| Source name | V / E / F / C | Manifest role |
| --- | --- | --- |
| Grand hecatonicosachoron | 120 / 720 / 720 / 120 | Star registration |
| Grand hexacosichoron | 120 / 720 / 1200 / 600 | Star registration |
| Grand stellated hecatonicosachoron | 120 / 720 / 720 / 120 | Star registration |
| Great grand hecatonicosachoron | 120 / 1200 / 720 / 120 | Star registration |
| Great grand stellated hecatonicosachoron | 600 / 1200 / 720 / 120 | Star registration |
| Great hecatonicosachoron | 120 / 720 / 720 / 120 | Star registration |
| Great icosahedral hecatonicosachoron | 120 / 720 / 1200 / 120 | Star registration |
| Great stellated hecatonicosachoron | 120 / 720 / 720 / 120 | Star registration |
| Icosahedral hecatonicosachoron | 120 / 720 / 1200 / 120 | Star registration |
| Stellated hecatonicosachoron | 120 / 1200 / 720 / 120 | Star registration |
| Pentachoron | 5 / 10 / 10 / 5 | Alternate `simplex4` |
| Tesseract | 16 / 32 / 24 / 8 | Alternate `tesseract` |
| Hexadecachoron | 8 / 24 / 32 / 16 | Alternate `cross4` |
| Icositetrachoron | 24 / 96 / 96 / 24 | Alternate `cell24` |
| Hecatonicosachoron | 600 / 1200 / 720 / 120 | Alternate `cell120` |
| Hexacosichoron | 120 / 720 / 1200 / 600 | Alternate `cell600` |

No Schläfli symbol is inferred from a filename, metric or catalog label. All
ten star imports retain `interpretation='generalized-complex'`, original source
coordinates, ordered face cycles and complete source-cell face references.
No filled star-cell interior or convex supporting-cell orientation is asserted.
The six convex alternates are recognized only when the current strict importer
matches the complete supplied incidence to its independently reconstructed
convex hull; their imported source coordinates/incidence remain unchanged.

## Numerical evidence and limits

All 16 raw files pass the unmodified strict OFF importer. The acquisition script
then performs separate checks on the supplied source realization, using a
relative `1e-7` tolerance:

- All source edge lengths agree and are nonzero.
- All source vertices lie at a common distance from their arithmetic mean, and
  the centered source has affine rank four.
- Every ordered face has common centered radius, is planar, and has a constant
  angular step `2πd/n`, with one face type throughout the source.
- Source vertices have uniform edge/face/cell incidence counts; cells have a
  common incidence signature and rank three; every ridge has two cell owners;
  every source cell-edge link has two face occurrences.

The face check constructs its planar basis from the first two centered source
vertices, evaluates successive signed angles, and records the unsigned shortest
integer step. Reversing a source cycle does not change this unsigned measurement.
That convention does not identify retrograde traversal, recover a full 4D
Schläfli symbol, or replace the original source cycle. A pentagram's measured
face step is `5/2`; ordinary face geometry and winding-defined display filling
remain distinct.

These are necessary regularity checks, not an exact algebraic certificate,
proof of flag transitivity, exhaustive regular-polychoron classification,
generalized manifold theorem or assertion of a solid interior. Source cell
Euler characteristics are not forced to match convex spherical cells.

Five selected sources also have exhausted, numerically incidence-preserving
Euclidean symmetry enumeration, verified generator closure and one orbit at
each source entity rank:

| Source | Verified full order | Proper order |
| --- | ---: | ---: |
| Pentachoron | 120 | 60 |
| Tesseract | 384 | 192 |
| Hexadecachoron | 384 | 192 |
| Icositetrachoron | 1152 | 576 |
| Grand hecatonicosachoron | 14400 | 7200 |

This symmetry evidence uses the existing engine's exhaustive compatible vertex
frames, metric bijection and full source incidence checks. It applies to the
supplied decimal coordinates within the engine's numerical tolerance. Other
entries explicitly say `not-run`; neither their group order nor exact
classification is inferred from the selected samples. Single entity-rank
orbits alone are not a flag-transitivity certificate.

## Manifest and reproduction

`manifest.json` has `schemaVersion=1`, `source`, `license`, `entries`,
`registrationKeys`, `alternateSources`, `summary`, `strictImportFailures` and
`guarantees`. Each entry includes `key`, `name`, `dimension`, `family`, `file`,
`rawSha256`, `rawByteLength`, `sourcePath`, Git-blob comparisons,
`sourceClassification`, `registration`, `alternateBuiltinKey`, `counts`,
`interpretation`, `strictImportPassed`, `sourceFingerprint`, `numericChecks`
and `symmetryEvidence`. `counts` order is vertices, edges, faces, cells.
Files are relative to the manifest directory; keys and source filenames remain
stable across rebuilds.

```powershell
python scripts/build-miratope-regular-catalog.py
python -m pytest tests/test_miratope_catalog.py -q
```

The script accepts explicit `--source` and `--output` paths and optional
`--skip-symmetry`. It refuses a destination within the source checkout, demands
the complete 16-file partition and expected license, and fails on a strict
import or numerical metric check failure. It never relaxes the importer,
repairs edge declarations, substitutes hull geometry, changes source files,
installs tools or requires a network fetch. Acquisition time changes on a
rebuild; source hashes and metric results are reproducible.

The 22 conformance cases pin all raw hashes and source counts, license/revision
and registration roles; reparse every source; reproduce every numerical check;
compare the read-only checkout when available; test an independently constructed
regular simplex and analytic pentagram; reject a regular-looking perturbation;
and verify metric covariance under rotation, translation and scaling. Symmetry
summary tests preserve explicit completeness/proper-order/orbit evidence and
independently check that the simplex has every one of its `5!` vertex actions.

Production catalog registration, generator loading, packaging and actual
desktop rendering are separate integration work. This source acquisition does
not by itself complete the broader specification's catalog or generalized
geometry requirements.
