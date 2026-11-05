# Native Wythoffian star polychora (W33)

The offline library adds **79** verified, named nonconvex Wythoffians:
**66 H4, 7 B4, and 6 F4**, including native constructions of all ten
Schläfli–Hess regular stars. Existing attributed OFF records retain their keys
and geometry. No external OFF folder or downloaded mesh is used by these entries.

## Click through

In Library, choose **Star uniform polychora (Wythoffian)** in `#library-family`.
Search `#search` for `gofix`, `sishi`, `gaghi`, `tiffix`, or a rational ring
symbol. Properties such as `shape:star uniform:true symmetry:H4` work normally.
Native keys are `star-uniform4-<bowers>`, exposed through the existing
`generate` operation with `kind: regular`.

Open Inspector → **Analysis → Element types** (`#element-types`). The named
inventory is `#star-uniform4-cell-types`; buttons
`#star-uniform4-cell-type-0`, etc. select the complete source cell set of that
named type. Polygon labels retain winding: `{5/2}` is a pentagram, `{10/3}`
is a decagram. **Construction evidence** (`#star-uniform4-evidence`) is collapsed
and reports residuals and references. This inventory remains available when
the separate full-symmetry search exceeds its existing limits.

Library opening creates an ordinary document. Project snapshots, subsequent
operation Undo/Redo and replay, source-cell selection, and OFF export use the
existing workflows. Named inventories require the complete ordered native
geometry; changed coordinates/incidence do not inherit the construction receipt.

## Verified scope

The following H4 chains group reversals and complementary-angle realizations;
the manifest retains each entry's actual rational diagram and ring mask.

| Chain | Native entries |
| --- | ---: |
| [3,3,5/2] | 14 |
| [3,5,5/2] | 14 |
| [3,5/2,5] | 15 |
| [5,3,5/2] | 14 |
| [5,5/2,5] | 5 |
| [5/2,5,5/2] | 4 |

B4 includes Quidpith, Qrit, Quitit, Paqrit, Quiproh, Gaqrit, Gaquidpoth.
F4 includes Quippic, Qrico, Paqri, Gic, Gaqri, Gaquapac. No additional
verified nonconvex A4 entry was identified in the selected linear tables.

Names, diagrams, V/E/F/C counts and cell facts come from
[Klitzing's linear Wythoffian tables](https://bendwavy.org/klitzing/dimensions/polychora-neu.htm)
and their linked incidence matrices, reviewed 2026-10-26. Every entry and
cell type has its own reference URL in `engine/catalog_data/star_uniform4.json`.
Counts sum diagonal orbit blocks; repeated occurrences of the same named cell
type are combined. For example, [Gofix](https://bendwavy.org/klitzing/incmats/gofix.htm)
has V/E/F/C 120/720/1200/120 and 120 great icosahedral cells.

## Construction and limits

Rational-angle mirror Gram matrices define the seed and reflection actions.
The orbit must exhaust the independently published vertex count and close under
every mirror within unit-sphere tolerance 1e-9. Parabolic **boundary** orbits
construct edges, ordered face cycles and cell-face incidence. No convex hull or
angular resorting changes star winding. Generation checks published counts,
cell V/E/F and regular-polygon inventories, equal edges and face regularity
(1e-7 residual limits), affine ranks and structural validation. It independently
checks two cells per face, two faces per cell edge, connectedness and consistent
abstract boundary orientations. Signed cell-face orientations are retained in
provenance. These are numerical checks, **not exact certificates**.

This is a bounded published subset, not all 2,191 known uniform polychora or
all possible Goursat diagrams. Unnamed/unverified masks, compounds, coincident
or degenerate elements, nonorientable cases, nonlinear diagrams, snubs and
non-Wythoffian constructions remain outside this package. Generalized incidence
does not define filled 4D interiors, density or hypervolume. The largest entry
has 14,400 vertices; existing rendering and symmetry resource limits still apply.

## Reproduction and tests

`python scripts/build-star-uniform-manifest.py` refreshes published facts over
the network and admits only checked native candidates; application use is offline.
The script uses the standard library and existing NumPy/SciPy dependencies.

`tests/test_star_uniform4.py` exercises all 79 entries, independent regular
flag-action checks, deterministic generation, closed oriented incidence,
source-bound inventories, project/OFF persistence and history replay.
`tests/star-uniform4.test.mjs` covers search/filter discovery and mounted cell
buttons, including stale-source refusal. Existing catalog, library-navigation
and element-type suites cover integration. Run focused pytest with
`-q -p no:cacheprovider`, Node with `node --test`, and
`npx.cmd vite build --configLoader native`. Electron launch is left to the lead.
