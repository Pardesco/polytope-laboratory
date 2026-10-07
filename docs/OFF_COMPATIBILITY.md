# OFF compatibility and audit evidence

The importer accepts `OFF` and `4OFF`. A boundary record begins with its declared
size, followed by exactly that many integer vertex IDs (faces) or face IDs
(cells). An optional suffix contains exactly three RGB or four RGBA channels.
Integer channel tokens mean byte colors from 0 through 255. If any channel uses
a decimal point or exponent, all channels mean finite normalized values from
0 through 1. For normalized white, use `1.0 1.0 1.0`; `1 1 1` means byte color.
Other attribute arities, out-of-range colors, invalid IDs, and malformed
incidence remain rejected. Vertex color attributes are not supported.

Imported colors are preserved in `metadata.offColors.faces` and `.cells`, with
one entry per supplied boundary: `null` or
`{"encoding":"byte"|"unit","values":[...]}`. OFF export preserves their
encoding and boundary association. Colors do not change geometry identity.

Strict import continues to reject a nonzero declared edge count that differs
from the edges implied by face cycles. The explicit Save Repaired Copy workflow
changes only that count token, validates the entire result, and writes a new
file. It preserves coordinate and incidence spelling, comments, and color
attributes. `repair_off_edge_count(text, name)` returns corrected text, the
validated model, and hashes of the UTF-8 input/output text plus old/new counts;
the helper itself never writes. A zero declared edge count remains OFF's
unspecified-count convention. Invalid geometry cannot be repaired by changing
an edge-count header.

Rechecking all 16 previous corpus failures established:

- Twelve `Cat19` entries produce valid explicit copies with corrected edge
  counts. Their linked source files remain unchanged.
- `Cat20/966-Sidtidap.off` and `Cat20/967-Ditdidap.off` now import successfully;
  their 54 and 26 cell records carry color attributes.
- `Compounds/2demitessic/2hex-Haddet.off` cells 22 and 23, and
  `Compounds/2demitessic/2tho-a-Dathah.off` cells 6 and 7, actually span affine
  dimension **four**, whereas each declared 3-cell must span dimension three.
  Each has a nonzero integer 4-by-4 affine difference determinant of absolute
  value 32. This is a supplied cell-incidence mismatch, not a tolerance-induced
  collapse. The importer keeps these records rejected and reports actual rank.

See `artifacts/off-compatibility-validation.json` for source hashes, unchanged
source checks, and exact integer determinant witnesses.

## Compact library audit index

Attach a schema 2 resumable Drive audit report through the library UI, or compile
one explicitly with:

```powershell
python scripts/compile-library-audit.py artifacts/drive-corpus-full-audit.json --output artifacts/drive-corpus-full-audit.library-index.json
```

Compilation reads bounded report provenance and streams the adjacent matching
checkpoint journal once. It writes a compact index outside the linked source
directory. It never loads the full report body or reconstructs geometry.
Historical provenance remains historical; compilation never certifies old
results against a new importer. An existing compact index may also be attached.

`index_library(root, audit_path=compact_path)` reports passed, rejected, untested,
or stale independently of the catalog's header-only load capability. Freshness
requires matching source bytes, importer source hashes, Python version, and
NumPy/SciPy versions. Missing or changed provenance and unavailable current
source hashes produce explicit diagnostics. Warnings are retained with their
full count and a bounded sample; interrupted or timed-out tests remain untested.

Startup hashing retains the existing 1 MiB per-file and 64 MiB aggregate limits.
The explicit Verify action uses
`index_library(root, audit_path=compact_path, verify_audit_hashes=True)` to hash
files up to the 128 MiB importer limit and a 4 GiB aggregate budget. It performs
no geometric imports. Sources beyond these limits remain stale with the limit
reason; a changed importer still requires a new audit, even after Verify.

The previous 3,064-file full audit compiles to a 2.7 MB index in approximately
0.35 seconds on the development machine. Its results correctly become stale
when the color-support importer changes.

The fresh 0.9.0 corpus audit completes all 3,064 imports in 27.11 minutes:
3,050 pass and 14 remain rejected (12 incorrect declared edge counts and the
two compound cell-incidence mismatches). Independent explicit hash verification
of all 1.85 GB of source files takes 2.21 seconds and produces exactly 3,050
passed and 14 rejected library statuses, with no stale or untested records.
Importer, dependency, acquisition-manifest and source-byte provenance all match.
The current compact evidence is
`artifacts/drive-corpus-0.9.0-audit.library-index.json`; the small independent
verification report is `artifacts/drive-corpus-0.9.0-audit-verification.json`.

## Desktop and packaged verification

`node scripts/library-audit-smoke.cjs` exercises native audit attachment,
status filters, rejection inspection, validated Save Copy, source preservation,
hash verification, stale source/dependency evidence, and attachment restoration
after restart. It also observes the actual base-view WebGL RGBA upload:
byte `[255, 0, 0, 128]` becomes `[1, 0, 0, 128/255]`, including alpha.

The same smoke passes against the unpacked packaged executable when
`POLYTOPE_TEST_EXECUTABLE` names it. The application receives a deliberately
unavailable development Python executable, proving these operations use the
bundled engine. Frozen builds include the three importer source files and
NumPy/SciPy distribution metadata required for independent freshness checks.
Evidence is saved in `artifacts/library-audit-smoke.json` and
`artifacts/library-audit-packaged-smoke.json` with separate screenshots.
