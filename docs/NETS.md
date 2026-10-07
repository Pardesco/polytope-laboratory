# Editing and folding 3D face nets

Choose a convex 3D model, select **3D FACE NET** in the derived view, and open the **Nets** inspector tab. **Generate / reset net** selects a root face and sets the physical length of source edge E0. This reference length is independent of camera zoom. Every face retains its source vertex and edge IDs.

The initial layout uses a deterministic hinge tree. Connections can form a forest with several separate paper pieces:

- **Cut / join source edge** toggles an edge by its source ID. In **Cut / join edge** mouse mode, clicking an edge performs the same edit.
- Cutting a hinge preserves the current flat face positions while splitting its connected piece.
- Joining two pieces aligns them at the selected source edge. A join that would close a hinge cycle is rejected; cut another hinge first.
- In **Move connected piece** mouse mode, drag a face to move its entire connected piece. Numeric X/Y translations are in millimeters. Rotation acts about the piece's vertex mean.
- **Undo net edit** and **Redo net edit** restore layout parameters independently of the source model's construction history. Up to 100 layout states persist in the project.

Each cut edge has the same E label on both exposed copies. The default tab policy places one trapezoid tab on one copy. Tab normals are perpendicular to their edges. Face overlaps and tab-to-face/tab-to-tab overlaps are reported separately. Overlapping tab outlines are amber. These diagnostics help with manual assembly; they do not guarantee a printable nonoverlapping layout.

**3D folding** uses the same layout. The fold slider spans flat (0%) to the source geometry (100%). **Animate folding** plays a time-based, reversible loop. Faces move rigidly about the selected hinge edges. Separate pieces also interpolate their root poses into common source positions so that the full fold reconstructs every source vertex. Motion is evaluated from the fold fraction without modifying source coordinates or making a background request per animation frame.

The kernel checks full-fold reconstruction and records its maximum endpoint error. The tolerance is `1e-7 × E0` millimeters. Tests independently check all intra-face distances, joined hinge endpoints, reflected/reversed-face input, layouts with no hinges, extreme coordinate scales, and moved/rotated pieces. The renderer's motion is compared with the Python kernel at intermediate fractions as well as endpoints. Intermediate collision detection is not implemented; a kinematically valid fold may pass through other faces.

Projects store root, physical reference length, hinge IDs, component placements and layout history. On save/load, cached geometry and fold descriptors are regenerated from the source and those parameters. Editing preserves the source model. A stale net belonging to different geometry is diagnosed.

SVG and PDF export use the flat physical layout, even while the derived view shows folding. The SVG declares millimeters and matching source labels. The original **Export PDF net** action produces a custom page sized around the whole layout.

## Standard paper and multiple pages

Choose A4, A3, US Letter, US Legal or custom paper dimensions, orientation, margin and gap, then **Pack / preview paper pages**. The display switches to **Packed paper pages** with previous/next controls. **Export packed PDF** writes every page in one vector PDF; **Export page SVG** writes the current page. The Print command prints the packed pages while that preview is selected.

Packing keeps connected pieces intact and never changes their physical scale. It rotates pieces by quarter turns when helpful and uses a deterministic rectangle-placement heuristic, without an optimality claim. Each piece's bounds include all owned tabs plus 4 mm label padding. A source cut edge retains one globally owned tab and two matching edge labels across the whole page set. Pieces with existing face/tab overlaps retain those overlaps, which remain reported. If a piece exceeds the usable paper area, packing reports the required dimensions. Choose larger paper, change E0, or cut the piece first. **Start with separate faces** provides a quick layout with one component per face.

Projects save page settings; validation regenerates page geometry and SVG from the source and authoritative layout parameters. Edits invalidate the old packing plan. `scripts/verify-net-pdf.py` independently checks the custom-page cube fixture; `scripts/verify-packed-net-pdf.py` checks all six A4 pages of the 65 mm separate-face dodecahedron fixture, every source face label once, every cut-edge label twice and PDF vector lengths within 0.01 mm (requires PyMuPDF in the verification environment). Paper dimensions are subject to Chromium's CSS-pixel roundoff. Printer hardware calibration, colors/images, reinforcement parts, advanced coincident-edge/tab policies and generalized/nonconvex nets remain pending. Convex 3D support is limited to 250 faces. For complete-cell arrangements of convex 4D sources, see [the whole-cell workflow](CELL_NETS.md).

Benchmark reference: [Stella nets and folding manual](https://www.software3d.com/Manual/Build.php). The present controls and numerical checks are implemented workflows, without a requirement-wide parity claim.
