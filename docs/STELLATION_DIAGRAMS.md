# Interactive facial diagrams and supported search (W9)

Construct → Advanced constructions contains **3D STELLATION / PLANE REGIONS**
and **Interactive stellation diagrams** (`stellation-cell-settings`). Choose a
convex intrinsic-3D source and evaluate its facial-plane arrangement first.
Then press **Build interactive diagrams** (`stellation-cell-evaluate`). The
facial SVG remains in the inspector while edits display the selected solid in
the derived 3D viewport. Electron click-through remains a lead qualification;
the constructor/handlers are tested headlessly against native geometry.

## Diagram editing

- `stellation-face-plane`: facial-plane selector with original source face IDs.
- `stellation-face-symmetry`: full source group, rotations, or individual cells.
  Color identifies the target cell orbit; clicking toggles its entire orbit.
- `stellation-face-side`: choose the cell below or above the plane, defined by
  its signed half-space, rather than by a centroid/visual guess.
- `stellation-face-attached`: **Attached only** retains target cells already
  selected or adjacent through an actual full facet to a selected cell.
- White outline: boundary of the currently exposed selected elementary regions
  in this plane. Interfaces with both incident cells selected are internal.
- Ctrl-click adds the clicked orbit and all recursively lower-facet supports;
  Shift-click toggles the entire outside-plane-count layer. Support addition is
  additive, including when the clicked cell was already selected.
- `stellation-cell-undo` / `stellation-cell-redo`: source-bound selection history
  (32 edits), persisted in `view.stellation.cellSelectionHistory`.
- `stellation-face-export`: exports the facial SVG with source hash, plane,
  selection, mode and numeric metadata. Dependency graph/export remain available.

The old derived facial-diagram clicks also use the new orbit/history path,
building its analysis first if necessary. The literal region-checkbox list
remains an individual-cell editor. Changing selection outside diagram history
invalidates an incompatible Undo step instead of overwriting it.

`stellation-face-fill` opts into **Include inaccessible cells after edits**.
Unselected enclosed cells unreachable from exterior seeds through unselected
full-facet neighbors are counted in the status. Enabled edits fill these cells;
disabled edits preserve cavities. Disabling filling does not remove cells
already selected. Unbounded, clipped, unresolved and unmatched-facet cells seed
the exterior conservatively. Topology is never removed implicitly.

The status reports reflexibility **within the verified source group**: an
orientation-reversing source action must preserve the selection. It reports
unknown if the box restricts source symmetry. This does not search for new
symmetries of the resulting solid. Residuals and absolute tolerances are
float64 evidence, without an exact certificate.

## Criteria and stepping

`stellation-criteria` offers the existing custom seed/connectivity search and
**All lower-facet supports**. The latter exhausts nonempty orbit subsets closed
under every downward full-facet dependency. Choose the full source group or
proper rotations in `stellation-symmetry`; arbitrary generator restrictions
remain supported by the custom search. Seed/connectivity checkboxes apply to
the custom search only. `stellation-merge-mirrors` identifies reflection-related
supported candidates; uncheck it to retain both handed forms.

`stellation-enumerate` reports exhausted/limited and evaluated/total subsets.
`stellation-next` / `stellation-previous` display candidates with
`stellation-position` showing k of N; candidate labels include source-group
reflexibility for supported results. The index and criteria persist; changed
source/criteria require a new enumeration before stepping. This is finite
observed-domain completion, never an unrestricted enumeration claim.

Verified support-closure fixtures (including the original seed):

| Source / scale | Full group | Rotations, mirror pairs once | Rotations, separate mirrors |
| --- | ---: | ---: | ---: |
| Octahedron / 3 | 2 | 2 | 2 |
| Dodecahedron / 5 | 4 | 4 | 4 |
| Icosahedron / 10 | 16 | 18 | 20 |

The scale-10 icosahedral arrangement encloses all 473 observed bounded cells;
its full group has 11 cell orbits and rotations have 12. The default scale 3
encloses only 341; scale 5 encloses 413. The new status explicitly counts bounded
cells clipped by the box. Supported enumeration refuses clipping, restricted
source actions or unresolved facets. It is limited to 20 orbits and defaults to
4,096 results (headless maximum 100,000); result limits retain partial candidates
and report limited. Existing arrangement limits still apply.

**Miller's 59 is not the fully supported count.** Webb's
[criteria definitions](https://software3d.com/PolyNav/PolyNavigator.php), §3.6,
distinguish 59 Miller stellations from 18 fully supported icosahedral cases.
Miller rules include accessibility and non-compound semantics and permit holes
and disconnected parts. [Miller enumeration and 59-case verification](MILLER_STELLATIONS.md)
are now available as a separate criterion; support closure remains distinct.
Arbitrary diagram subgroups and 3D-attached perspective overlays also remain
follow-ups. The diagram's Attached only option is the explicit adjacency filter
described above.

## Make base and verification

`stellation-face-base` (**Make base model**) calls `commitOperation` with the
replayable `stellation-make-base` operation. Parameters retain box bounds,
source facial-plane IDs and signed cell signatures, without copying arrangement
caches into the recipe. Native replay rebuilds the arrangement and union;
ordinary model Undo/Redo, snapshots, project validation and replay retain the
source and resulting convex-piece topology. Source, notes, units, domain,
selection, cancellation and export ownership are rechecked before publication.

Native operations: `stellation-diagram-data`, `stellation-supported-enumerate`,
`stellation-make-base`. Pure analysis operations use warm workers. No dependencies
were added. Tests:

- `tests/test_stellation_diagrams.py`: symmetry actions/residuals, plane incidence,
  2/4/18 supported counts, 16/20 reflection conventions, chiral pairs, explicit
  limits, clipping refusal, saved diagram state, make-base history and replay.
- `tests/stellation-diagram-controls.test.mjs`: mounted SVG clicks with eight-cell
  orbit replication, above/below picks, outline, attached filter, cavity policy,
  persisted selection Undo/Redo, native criteria dispatch, k-of-N stepping,
  cancellation and source/selection publication guards.
- Existing stellation, recipe/history, numeric-entry, renderer-contract and
  engine-pool regressions, plus Vite production build.
