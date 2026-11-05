# 4D compounds and scaliforms (W40)

This is a verified finite slice of LIB-06, not a complete regular-compound or
fissary/scaliform classification. Existing dual compounds and the five-24-cell
partition are reused. No meshes or runtime downloads are required.

## Click through

- Library `#library-family`: **4D compounds** (eight new entries plus the three
  existing 4D compounds) or **Scaliform polychora** (Tuta and Koho).
- Search `#search`: `tuta`, `koho`, `components:75 dim:4`,
  `scaliform:true uniform:false`, `fissary:unknown`. Geometry properties adds
  `#library-scaliform` and `#library-fissary`. Unknown never matches yes/no.
- Inspector **Analysis**, **4D compounds / scaliforms**:
  `#polychoron-relationships`, `#polychoron-classification`,
  `#polychoron-frame-summary`, `#polychoron-scaliform-summary`.
  **Open frame type** (`#polychoron-open-frame`) uses the existing guarded library
  loader; Related also offers this link. Library scale/orientation can differ
  from the construction's analytic frame.
- **Check literal vertex links** (`#polychoron-check-links`) writes
  `#polychoron-link-result`. Source changes, export and global Cancel revoke
  publication. Numerical residuals and references are collapsed under
  `#polychoron-construction-evidence`.

## Compounds

Every constituent keeps its complete convex incidence, separate source vertex
IDs, component ownership/color, retained source snapshots and extraction paths.
The counts below include repeated coordinate positions. Coordinates are checked
against the analytic frame before adopting its vertex IDs. Group actions exhaust
the finite declared group and verify generator closure on its frame permutation.

| Key suffix (`compound4-`) | Components | V/E/F/C | Distinct positions | Multiplicity | Generating group |
| --- | ---: | --- | ---: | ---: | --- |
| two-16-cells | 2 | 16/48/64/32 | 16 | 1 | B4, 384 |
| three-16-cells | 3 | 24/72/96/48 | 24 | 1 | F4, 1152 |
| three-tesseracts | 3 | 48/96/72/24 | 24 | 2 | F4, 1152 |
| fifteen-16-cells | 15 | 120/360/480/240 | 120 | 1 | left 2I, 120 |
| fifteen-tesseracts | 15 | 240/480/360/120 | 120 | 2 | left 2I, 120 |
| seventy-five-16-cells | 75 | 600/1800/2400/1200 | 120 | 5 | H4, 14400 |
| seventy-five-tesseracts | 75 | 1200/2400/1800/600 | 120 | 10 | H4, 14400 |
| twenty-five-24-cells | 25 | 600/2400/2400/600 | 120 | 5 | H4, 14400 |

The first frame is the unit-radius tesseract; the next two use the Hurwitz
24-cell. All remaining frames use the analytic unit-radius 600-cell.
Seeds are the coordinate orthoplex, its half-coordinate tesseract, or their
24-vertex union. Left quaternion multiplication gives the one-sided orbits.
Left/right multiplication and quaternion conjugation give the H4 orbits.
Signed coordinate permutations generate B4; adjoining Hurwitz multiplication
gives F4. Tesseract entries are coordinate-seed orbits, not assumed polar duals
of the similarly numbered orthoplex entries.

The three-constituent F4 entries are labeled regular compounds. Other entries
retain their explicit orbit description without a guessed Coxeter identity.
In particular, **75 inscribed 16-cells in the 600-cell** is different from the
75-orthoplex partition of the 120-cell. Left 2I is a verified generating subgroup,
not a maximal symmetry claim. The 15-tesseract orbit has no inferred uniform or
vertex-transitive property: the declared group alone does not prove transitivity
on all literal constituent-vertex occurrences.

[Baez's quaternion construction](https://johncarlosbaez.wordpress.com/2017/12/28/the-600-cell-part-3/)
supplies the subgroup chain and orthoplex/24-cell relationships, including the
75 and 25 inscribed cases. The
[600-cell relationships](https://en.wikipedia.org/wiki/600-cell#Twenty-five_24-cells)
and [4D compound tables](https://en.wikipedia.org/wiki/Polytope_compound#4-polytope_compounds)
were cross-checked. The tables distinguish regular, uniform and dual compounds;
equal constituent counts alone do not establish identity.

## Scaliforms

Scaliform means vertex-transitive, equal edges and circumscribable elements;
cells need not be uniform. This family contains two **non-uniform** examples:

- `scaliform4-tuta`: convex truncated tetrahedral alterprism, 24/60/52/16.
  Uses `(3,1,1,1)/sqrt(8)`, permutations of the first three coordinates and
  even sign changes. Its independently rebuilt hull has 2 truncated tetrahedra,
  8 triangular cupolas (J3) and 6 tetrahedra. Numerical symmetry order 48.
- `scaliform4-koho`: generalized skew octahemioctachoron, 8/24/28/12.
  Uses the cross-polytope vertices in order `xyzwXYZW`; eight consecutive
  tetrahedra and four adjacent-square bowtie bipyramids retain literal cycles.
  There are 24 triangular faces and four square faces. Numerical symmetry order
  16. No filled interior, convexification or union volume is asserted.

Native loading independently checks count vectors, cell inventories, equal
edges, element circumspheres, two-cell ridge incidence, closed cell edge links
and a complete incidence-preserving vertex-transitive symmetry group.
Observed relative edge spread is zero; maximum element circumsphere spread is
below `3e-16` in this environment. These are float64 residuals, not certificates.

References: [Klitzing's Tuta coordinates/incidence](https://bendwavy.org/klitzing/incmats/tut=invtut.htm),
[Koho construction/incidence](https://bendwavy.org/klitzing/incmats/koho.htm),
[scaliform definition](https://bendwavy.org/klitzing/explain/scaliform.htm),
[Bowers S1/S7](https://polytope.net/hedrondude/simplesc.htm).

## Fissary scope, persistence and limits

`classification_metadata` cross-references exact published acronyms against
[Bowers' regiment lists](https://polytope.net/hedrondude/regiments.html).
Only an exact named identity gets a source fissary flag; membership in a regiment,
an unverified directory, coincident coordinates or a compound does not suffice.
The current bundled registry contains none of those positively identified
fissary entries. Tuta/Koho are identified non-fissary examples; other unclassified
entries remain unknown. The crosswalk is intentionally partial.

`polychoron-relationships` is a read-only warm-worker IPC operation. It separately
checks each literal vertex link: incident source cells connect across shared
source faces containing that vertex. A disconnected link is a diagnostic,
not an automatic published classification; connected vertex links do not rule
out fissary behavior at other ranks. Bounds: 2,048 vertices, 10,000 edges/faces,
4,096 cells, 100,000 incidences and 16 MiB JSON. Coincident coordinates are never
welded. No unrestricted regiment enumeration is claimed.

Library loads use the normal new-document snapshot workflow. Component extraction
uses existing recipe/history operations. Save/Open preserves full geometry,
ownership, colors and construction evidence; Undo/Redo and replay of subsequent
component operations use existing infrastructure. Analysis queries do not dirty
the project. Evidence is shown only for its matching geometry fingerprint.

Follow-ups: the remaining Coxeter/McMullen regular-compound identities and variants,
120-cell-frame partitions, 600-cell compounds, further verified convex/nonconvex
scaliforms, actual source-qualified fissary meshes, all-rank fissary diagnosis and
unrestricted regiment classification. No exact algebraic certificate or Electron
desktop click-through is claimed.

## Verification

- `python -m pytest tests/test_compound4.py tests/test_scaliform4.py -q -p no:cacheprovider`
  covers counts, frame containment/multiplicity, closure, incidence, property
  crosswalks, malformed/unsupported domains, cache independence, native dispatch,
  Save/Open, Undo/Redo and component replay: **21 passed**.
- Regression: `tests/test_compound_library.py`, `tests/test_compounds.py`,
  `tests/test_coincidic_regiments.py`, `tests/test_library_navigation.py`,
  `tests/test_catalog_registry.py`: **208 passed**.
- `node --test tests/polychoron-relationships.test.mjs tests/library-navigation.test.mjs tests/engine-pool.test.cjs tests/catalog-loading.test.mjs tests/catalog-discovery.test.mjs tests/renderer-contract.test.mjs tests/construction-workflow.test.mjs`
  verifies mounted controls, property search, source/export/cancel guards and IPC.
  **58 passed**. The new Node test is registered in `test:features`.
- `npx.cmd vite build --configLoader native` succeeds with the existing chunk-size
  warning. Electron was not launched.
