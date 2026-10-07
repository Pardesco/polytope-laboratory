# Stereographic display and capture

Four-dimensional stereographic display first radially normalizes source points
onto S3. Ordered source edges follow great-circle arcs; face triangles become
curved spherical patches. Pole clipping prevents artificial bridges, and smooth
normals come from the projected sphere or plane. Display rotation, clipping and
tessellation leave the mathematical source vertices and incidence unchanged.

The dedicated module worker owns tessellation. The renderer keeps one active job
and one latest queued snapshot, with transferred copies of its input buffers.
Published points, edges, patches, normals, source picks and highlights all belong
to the same original pose. New input cannot relabel older geometry as current.
Source replacement, presentation changes and capture cancel obsolete ownership.

During continuous rotation, a validated intermediate interaction result may
publish while a newer angle is queued. A result with retained fragments or
omitted primitives remains explicitly partial and carries a resource diagnostic.
This avoids freezing dense models merely because every computed pose was
superseded. Changing masks, source, frame, styling or camera prevents this
intermediate publication; its permission applies only within the same rotation
presentation family. Exact idle and capture requests keep their current-pose
guards.

An orthographic observer uses CSS scale and zoom to select a sampled world-error
tolerance: interaction targets 3.5 pixels and idle/capture target one pixel,
subject to fixed tolerance bounds. Perspective observation uses the fixed fine
tolerance. These are adaptive sample criteria, not mathematical error bounds
over every point of a curve or patch.

PNG and animation capture await the complete fine result for the exact requested
pose before reading pixels. Source/view changes, cancellation, unresolved
primitives and exhausted budgets reject capture. Cancelling capture restores
ownership even when the restored pose is identical to the previous one.

The mounted 0.18 renderer supports 8,192 input surface triangles and 100,000
mesh leaves, using shared-edge closure so neighbouring curved chords match.
This includes all 2,160 source fill triangles of the full 120-cell, but pole,
depth, quality and mesh budgets can still leave partial filled views. Pole-excluded
or unresolved surface leaves refuse complete capture. The validated synchronous
fallback uses the same computation and typed output. Older unextended descriptors
retain their legacy 2,000-input bound. See [the repair review](STEREOGRAPHIC_SURFACE_FIX_0.18.md)
for indexed/star/shrink ownership, approximate virtual paint identities and GPU evidence.

Actual 0.18 packaged motion evidence is
`artifacts/stereographic-dense-publication-packaged-8STMbh/result.json`.
All six cases move and preserve source geometry. The tested tesseract publishes
complete interaction results; dense 600/120-cell cases remain partial or capped.
Worker medians were17.5?20.1 ms for tesseract and233?277 ms for dense cases.
These observations exclude later asynchronous and GPU duration and do not
establish identical-camera speedup or universal whole-surface conformance.
The earlier qualification records below remain historical.

`scripts/stereographic-dense-benchmark.cjs` exercises actual catalog tesseract,
600-cell and 120-cell models at two zoom settings, continuous rotation, native
before/after source equality, published poses, visible pixels, RAF gaps and
worker timing. Worker compute time covers validation, tessellation and buffer
preparation; post-to-main delivery is measured separately. Partial and no-motion
outcomes are retained. Completion of the script alone does not prove smooth
motion, complete surfaces, universal FPS or complete viewport parity.

An earlier packaged run is
`artifacts/stereographic-dense-packaged-bzh5u7/result.json`: all six cases have
changing published angles and pixels while Rotate remains active, actual worker
timings, and unchanged native source geometry. Every case includes some partial
results. The 600-cell and 120-cell median worker computation ranges from about
0.57 to 0.80 seconds in this run; responsive controls do not imply fast geometry
updates. The earlier candidate's 120-cell failed moving-publication checks in
`artifacts/stereographic-dense-packaged-skkAng/result.json`; that evidence is
retained, and the complete-only publication condition was corrected.


## Qualified 0.14 publication work

Actual packaged benchmark `artifacts/stereographic-dense-publication-packaged-hseSua/result.json`
qualifies six moving angle/pixel cases with unchanged native source. Dense
worker medians317?456ms; production message-listener synchronous prefix medians
27?36ms, about20?24% below the preserved firstcandidate measurements. Packed
RGBA handling and exact indexed source-owner comparisons reduce main work.
This measurement excludes later async execution and GPU duration. Every case
still includes partial/capped output; worker throughput and completeness remain
unfinished. Source-linked interval-camera/endpoint math and faster adaptive/arena
prototypes are explicitly unmounted future work; they do not change this release's
sampled error or strict complete/current capture contracts.

## Qualified 0.15 worker computation

The scalar arithmetic, recursive sample reuse and hybrid typed output arena are
now mounted. Independent frozen legacy fixtures agree on every tested Float32
coordinate, analytic normal, owner, resolution status and partial/cap diagnostic.
Final decoding still owns the exact-size transferable arrays. The sampled error
criterion, clipping, global caps and complete/current capture contract remain
the same. Source-linked interval-camera and whole-edge prototypes are unmounted.

Actual packaged evidence is
`artifacts/stereographic-dense-publication-packaged-Ob0Z2q/result.json`.
All six cases show distinct published angles/pixels and unchanged native sources.
Dense worker medians are 220.1â€“269.9 ms, versus 317â€“456 ms in the prior build;
tesseract medians are 17.7â€“29.7 ms. Production message-listener prefixes remain
about 27â€“35 ms for dense cases. These are observations on this machine and exclude
later asynchronous execution and GPU duration. All cases retain partial/capped
results. Smoother dense motion and complete surfaces remain unfinished.

`artifacts/stereographic-fit-observation-Wb2IIV/result.json` separately observes
the published Float32 cloud against the saved observer camera. Fit contains the
tested cloud in both parallel and perspective modes. The initial parallel view
is cropped after switching projection, so projection-change framing remains a
UI task. This observation excludes omitted geometry, curve interiors, GPU
arithmetic and the actual far plane. Independently subdivided neighbouring
triangle boundaries remain a surface-seam risk; conforming mesh prototypes are
development evidence only.
