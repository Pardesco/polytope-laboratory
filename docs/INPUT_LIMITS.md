# Input limits and corrupted-file recovery (W47)

File → Open / the **Open** toolbar button (`open`) uses these native checks.
Refusals appear in the existing status/error area (`status`) and leave the workspace in
place. File → **Recover autosave** tries the latest recovery project, then its
previous `.bak` snapshot. A fallback explicitly reports that newer changes may
be missing. Save the recovered workspace to keep it. Recovery cancellation and
workspace/export ownership checks still apply to both attempts.

All file sizes below count UTF-8 bytes, including a BOM. A leading UTF-8 BOM,
LF, CRLF and mixed ordinary line endings are supported. Invalid UTF-8 refuses;
decoding does not replace bytes. File reads stop at 128 MiB + one detection byte,
in small chunks, and hashes use the bytes actually parsed. No source is repaired
or overwritten by opening it.

Before splitting lines, OFF permits at most 2,100,000 text lines and DXF at
most 2,000,000 (its pair budget). Unicode line separators count too. OFF numeric
and incidence records have a 16,384-character limit after comments are removed;
this bounds token allocation before numeric conversion. Document comments keep
their existing metadata/notes bounds.

| Format | File size | Vertices | Faces / cells / other limits |
| --- | --- | --- | --- |
| OFF / 4OFF (in `.off`) | 128 MiB | 1–20,000 | At most 1,000,000 declared faces, edges or cells; at most 1,024 indices in each face/cell; at most 1,000,000 total edge/face/cell references per model |
| Geometry JSON (`.json`) | 128 MiB | 1–20,000 per model | At most 1,000,000 edges, faces or cells each; 1,024 indices per boundary; 1,000,000 total incidence references per model; JSON structural limits below also apply |
| Project (`.polyproj`) | 128 MiB | Same per-model bounds | Version 1 only; 1–100 documents; 1–200 states per document; valid cursor, active index and display state required |
| ASCII DXF (`.dxf`) | 128 MiB | 20,000 retained; 100,000 source coordinate occurrences | 1,000,000 group pairs; 100,000 entity records; at most 100,000 generated faces (bounded by source/entity counts); 1,000,000 welding distance comparisons |

Limits intersect: a count header below its maximum can still exceed the file,
reference, JSON or computation budget. Numeric refusal messages name the limit
that was exceeded. OFF/JSON source coordinates must be numeric, finite and
within ±1e50; DXF coordinates and welding tolerance retain their existing ±1e100
domain (tolerance is nonnegative). Negative coordinates are allowed. NaN and
infinity are refused, including overflowed decimal literals. Repeated corners,
out-of-range/self references and nonplanar faces are validated. A generalized
complex may have coincident vertices/faces or nonmanifold links; acceptance does
not certify an embedded manifold or a filled solid.

JSON is screened before decoding: at most 64 nested containers and 1,000,000
structural entries (opening containers plus commas outside strings). Project
and history traversal additionally enforce finite JSON, valid Unicode, no
cycles, depth 64 and 8,000,000 values. History graphs retain their existing
1,024-node, 32 MiB-per-node and 128 MiB-total bounds. Rational coordinate/plane
and original certificate literals are limited to 256 characters and exponent
magnitude 1,024 before Fraction allocation; exact certificates are still
independently recomputed. A project state that omits `view`, or supplies a
non-object view, refuses as incomplete when opening a file. Internal
programmatic saves retain v1 normalization of omitted views to empty objects;
they write complete view records before those files are opened again.

Convex import verification additionally permits at most 1,024 vertices in 4D,
100,000 Qhull simplices, 5,000,000 vertex/support comparisons and 1,000,000
candidate facet-pair occurrences. These guard support/ridge expansion, including
small adversarial 4D point sets. OFF preserves valid supplied incidence as a
generalized complex when optional convex recognition exceeds a budget; the
reason is in `metadata.convexRecognition`. JSON/projects claiming convex solids
must pass the budget and independent reconstruction, or refuse. This does not
make approximate Qhull predicates exact. The regular 120-cell import remains
recognized as convex.

The JSON-lines server bounds each raw request to 128 MiB before UTF-8 decoding,
drains refused records and accepts the next request. Invalid response Unicode
or nonfinite values produce a refusal instead of breaking response framing.
Desktop workers retain their existing 128 MiB input/output cap, two-minute job
timeout, cancellation and isolated file-load processes. Resource ceilings are
not promises that maximum-size geometry will finish within that timeout.

Autosaves now retain the preceding published snapshot using the existing
fsynced/atomic project-storage backup path. Both recovery candidates receive
full native project validation. Missing latest files also try the backup; two
missing snapshots mean no recovery, and two unusable snapshots explain both
failures. Only one previous snapshot is retained, so corruption of both cannot
be recovered automatically. Existing installations gain a backup after their
next successful replacement autosave.

## Verification

Run:

```
python -m pytest tests/test_input_robustness.py tests/test_off_compatibility.py tests/test_dxf.py tests/test_interchange.py tests/test_history.py tests/test_project_geometry_reuse.py -q -p no:cacheprovider
node --test tests/input-recovery.test.cjs tests/project-storage.test.cjs tests/project-workflow.test.mjs tests/engine-pool.test.cjs tests/desktop-files.test.mjs
npx.cmd vite build --configLoader native
```

The CI mutation corpus uses fixed seeds 4700–4704: 80 byte mutations per
OFF/4OFF/DXF/JSON/project sample, valid/BOM seeds and 80 structural mutations
for each JSON kind (570 cases). Each format runs in a killable child, with a
9-second wall budget, 2 seconds per input and 64 MiB of traced import allocations.
The five format budgets total 45 seconds; focused CI execution is under 60
seconds. These memory checks exclude interpreter/import startup and are not an
OS process-memory sandbox. Explicit regressions cover malformed UTF-8, deep or
partial JSON, wrong versions/shapes, huge counts/boundaries, extreme/nonfinite
coordinates, Unicode history strings/keys, rational exponent bombs, 4D hull
expansion and continued native operation after corrupt requests.

Set `POLYTOPE_FUZZ_LONG=1` for 2,000 byte mutations per format and 2,000 structural
mutations per JSON kind (14,010 cases), with a 180-second child budget. No
Hypothesis, dependencies, Electron launch or universal parser/security proof
is implied. Recovery tests use real temporary files and controlled providers;
native dialogs and final packaged-app click-through remain for the lead.

Focused verification: 318 Python tests passed across the listed six suites and
`test_kernel.py`, `test_generalized.py`, `test_model_interchange.py`,
`test_library_copy_protocol.py`, `test_rational.py`; 65 Node tests passed;
the Vite production build passed (275 modules, existing large-chunk warning).
The standalone CI robustness suite has 48 tests; long mode exercises the same
48 tests with the 14,010-case corpus.
