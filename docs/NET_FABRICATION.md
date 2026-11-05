# Net reinforcement parts and builder measurements (W49)

Open **Nets → Paper and export → Reinforcement parts and measurements**
(`net-fabrication-settings`). The existing source-vertex **Internal support
panels** workflow is retained independently.

- **Inner face braces** (`fabrication-braces`): one separate cutout per source
  face, with a constant perpendicular inward miter offset. Set **Brace margin
  (mm)** (`fabrication-margin`). Convex and simple concave planar faces are
  supported when the offset remains one simple polygon. Collapsed, crossing,
  reversed or split offsets are refused with the source P/F label. Each brace
  retains its P/F and E labels on the cutout.
- **Dihedral hinge strips** (`fabrication-hinges`): one rectangular strip per
  source edge, its source edge length by **Strip width (mm)**
  (`fabrication-width`). Each half identifies its E and adjacent P/F. Score the
  center, set the printed interior angle using the two-ray gauge, and glue the
  halves inside the adjacent faces. The printed fold convention matches the
  net: convex bends are valley; reentrant bends are mountain.
- **Vertex direction rosettes** (`fabrication-hubs`): one labelled rosette per
  source vertex; **Rosette radius (mm)** (`fabrication-radius`) sets template
  size, independently of strut length. Spokes identify incident E labels.
  Printed azimuth/elevation and every pair's true 3D angle describe the strut
  directions. The local outward axis is opposite the mean incident direction;
  the first source edge fixes zero azimuth. Degenerate projection axes are
  refused. H numbers group valence, sorted pair-angle and edge-length signatures
  rounded to six decimal places; they are not certified symmetry classes.

**Parts SVG sheets** (`fabrication-parts-svg`) and **Parts PDF sheets**
(`fabrication-parts-pdf`) use the current E0 scale, net forest/placements and
selected paper dimensions/margins. **Prepend packed net sheets**
(`fabrication-include-net`, initially checked) adds the base net through the
existing packing pipeline before the extra support sheets. SVG exports stack
separate physical page viewports vertically; PDF uses the existing bounded
packed-page renderer. Parts are packed on shelves, without scaling or splitting;
oversized parts or intact net components are refused. P numbers follow the
editable net's sorted component roots, not optional color-separated batches.

**Measurements (CSV / PDF / DXF)** provides:

- **Cut list CSV** (`fabrication-measure-csv`): one row per edge and face. Edge
  rows include E, source endpoints, physical length, adjacent P/F, interior
  dihedral, printed-side fold and whether it is a retained net hinge. Face rows
  include P/F, ordered source vertices, n-gon designation, every ordered side
  length and corner angle, including reflex corners. Headers declare mm and
  degrees. Semicolons separate lists inside quoted CSV fields.
- **Measurements PDF** (`fabrication-measure-pdf`): a paginated table of every
  edge and every face side/corner, including the maximum flattened-edge length
  residual. Values wrap rather than truncate. It uses the selected paper size.
- **Flat faces DXF** (`fabrication-measure-dxf`): each intact face laid flat in a
  separate row slot with a 10 mm gap. Closed boundary loops use the existing
  ASCII LINE/group-code conventions on `CUT`; P/F and E use TEXT on `LABELS`.
  `$INSUNITS=4` declares millimeters. Disable `LABELS` in cutting software when
  only the outlines should be cut. There are no tabs, kerf or joint allowances.

All exports are read-only and leave document/history geometry unchanged. The
existing saved net settings supply layout and physical scale; export-form
choices are session-local. Numeric fields use NumericEntry expressions.
Source, notes, units, form, paper, net layout and cancellation are checked across
native work and before bounded file publication. Global Cancel and
`fabrication-cancel` cancel these jobs. Both new native operations
(`net-reinforcement-parts`, `net-measurement-export`) reuse warm engine workers.

## Definitions and limits

Results use approximate float64 coordinates, not exact certificates. The engine
reports `maxEdgeFlatteningResidualMm` and each brace's minimum boundary clearance.
Lengths derive from physical E0, independently of model coordinate-unit hints.
Interior dihedrals are 180 minus the normal bend for valley folds, 180 plus it
for mountain folds. Unknown shell orientation leaves measurement angles blank
and refuses hinge-strip generation. Generalized shells retain the existing
closed orientable simple-planar-face domain; global intersections are not
certified. Bounds are 250 faces, 512 vertices, 128 corners per face, 4,000 total
face corners and 250 output pages. Fabrication paper dimensions are 60–2,000 mm.

These are paper construction templates. Hinge strips require setting and gluing
at the indicated angle; their stiffness is not qualified. Rosettes are projected
direction guides, not developed 3D sockets: a cube has 120-degree projected
spokes but 90-degree true 3D strut angles. No material thickness, structural
strength, mechanical fit, printer calibration or laser-cutting qualification is
claimed. Inspect overlaps in the source net before assembly. Electron was not
launched in this worker.

## Verification

`tests/test_net_fabrication.py` has 22 tests for convex/concave offsets in both
windings, collapsed-margin refusal, source dihedrals, analytic cube/icosahedron
hub angles and direction reconstruction, complete CSV/DXF labels and units,
SVG/PDF-page structure, concave reflex angles, dispatch and cancellation.
`tests/net-fabrication-controls.test.mjs` has 15 tests, including actual native
exports for all five actions, mounted controls, expression fields, held-source/
paper/form/cancellation fences, dismissed export dialogs and worker registration.
It is registered in `test:features`.

Focused runs: **142 Python tests passed** across fabrication, reinforcement,
printing, paper UX and DXF; **89 Node tests passed** across fabrication,
reinforcement, assembly, engine pool, bounded export and text export. Vite built
successfully with `npx.cmd vite build --configLoader native`. MuPDF rendered
sample brace, hinge/rosette and measurement SVG pages for visual inspection.

An additional 66-test Node run passed 47 and failed 19 print-session fixture
tests with `ReferenceError: ShowcaseControls is not defined`. The extracted
`printNet`→`const actions` app block is byte-for-byte identical to HEAD, and
evaluating that baseline block reproduces the same missing fixture binding.
The unrelated fixture was left unchanged.
