# Polytope Laboratory 0.28.0 community preview

A Windows preview that rolls up everything on `main` since 0.27.20: a simpler interface, a Coxeter-diagram builder,
many new constructions, and a first outside check of the catalog against published tables.

[Download for Windows x64](https://github.com/Pardesco/polytope-laboratory/releases/download/v0.28.0/Polytope.Laboratory.0.28.0.preview.exe) | [Matching GPLv3 source ZIP](https://github.com/Pardesco/polytope-laboratory/releases/download/v0.28.0/Polytope.Laboratory.0.28.0.source.zip) | [Report a problem](https://github.com/Pardesco/polytope-laboratory/issues)

Run the executable directly. Python and the mathematical libraries are bundled; the app works offline.

## What's new

**Easier to use** ([UX round](UX_ROUND_2026-11-04.md), [UI pass](UI_PASS_2026-11-05.md))

- An essentials-only toolbar, a visual library with collections and thumbnails, and **⋯ → Show expert tools** for the
  full technical controls.
- **Build from symmetry:** ring the nodes of a Coxeter–Dynkin diagram (A3 to H4) to make a uniform polyhedron or
  polychoron, with a live preview ([details](COXETER_BUILDER.md)).
- Shift-drag turns the model through the fourth dimension; **Learn 4D** is a six-chapter lesson under Help.
- Export by goal: 3D print, paper model, picture, video/GIF, other 3D software, or raw model data
  ([details](EXPORT_GOALS.md)).
- A docked Timeline for animation and tours ([details](TIMELINE.md)).

**More mathematics** (rounds 5–8, November 6–9)

- Goursat star polychora and Schwarz-triangle Wythoff generation (79 4D and 63 3D generated forms), 40 generated
  uniform duals, Tuta scaliform vertex-figure completion.
- Faceting with 20-vertex sources, stellation by arbitrary planes, filled (density) sections of star cells, Waterman
  polyhedra in 4D, fitting with several components, hinge strips for paper models, memory add/blend, DXF face
  boundaries, PNG environments for materials.
- Dual morphs between the 120-cell and 600-cell (Expansion and Tilting quads), and via-snub morphs for the cube and
  icosahedron families.

**Catalog and verification**

- 870 models are shown by default. The 908 computer-found "4D discovery candidates", which haven't been checked against
  any published list, are now behind a **Discovery candidates (unverified)** filter, and show an **Unverified** badge
  when opened ([details](CATALOG_DEFAULTS.md)).
- [Verification report](VERIFICATION_REPORT.md): the 870 visible models were compared with Richard Klitzing's
  incidence tables, Jonathan Bowers' lists and the Miratope OFF library. 508 agree on every check made, 356 have no
  outside data to compare with, and 6 differ. All 6 are explained: four are a construction-group versus full-symmetry
  convention, one is an edge-counting convention for Skilling's figure, and one looks like a typo in an outside table.
  All 284 full-geometry comparisons matched to within 1e-9.

**Fixes**

- A new document no longer starts out marked as modified, so Open and Close don't ask about unsaved changes that don't
  exist.
- Faster 120-cell/600-cell morphs, density sections and vertex-figure searches.

## What's checked

- Automated tests on this release's source: 3,638 Node tests and 8,370 Python tests, plus a real hidden launch of the
  app and 17 end-to-end workflow runs.
- The packaged app passed a hidden launch check and nine packaged workflow runs: element content, regular 4D catalog,
  sections, nets and printing, tours, core constructions with Save/Open, morphs, exports and intrinsic feedback.
- The actual portable .exe passed a visible launch-and-use check with no development Python available.
- The conformance inventory (73 requirements, 193 scenarios) was rerun on this source.

## What's approximate or partial

- Geometry uses double-precision floating point. Results report residuals; only the small rational-exact workflow
  calls anything exact.
- Of the 73 tracked requirements, 34 are done and 39 are partial; each partial row says what's missing
  ([gap audit](GAP_AUDIT_2026-11-10.md)). Benchmark equivalence with Stella4D hasn't been checked.
- The 2,191 known uniform polychora aren't mapped one-to-one to catalog entries; the verification report says what
  blocks the rest.
- Dense models and cold requests can still be slow. Net layouts can overlap; check before printing.
- Not completed for this release: the visible capture-control check (its script predates the Welcome screen and
  current save status; it stopped at its first save), a clean-machine install, printer calibration, and the rotation
  profile series used for 0.27.20.

## Building it yourself

See [Run from source](../README.md#run-from-source) and [Architecture](ARCHITECTURE.md).
