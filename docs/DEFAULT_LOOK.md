# Prism: beautiful by default

New documents and gallery views use Prism. Saved settings are not rewritten;
older sparse non-Prism views retain their original defaults. Other W11 styles
and Color by options retain their existing behavior.

## UI

Open **Appearance** (`surface-settings`), then **Style: Prism**
(`presentation-style`) or **Reset to preset** (`style-reset`). **Color by**
(`surface-colors`) retains Source, Face, Cell and native type choices. Prism's
extra grouping applies only to its default Face type (3D) / Cell type (4D) modes.

Automatic density messages no longer appear in the viewport. They are a small
**expert-only Appearance note** (`prism-density-note`, `data-expert`). The existing
Expert tools switch/body `expert-mode` class controls visibility immediately.
Actual geometry, clipping, fill, material and resource warnings remain visible.

## Stable multicolor grouping

When native classification supplies more than two face/cell types, Prism retains
the native type palette. With one or two types, or while classification is pending
or unavailable, Prism uses source geometry to add color:

- **3D:** group faces with parallel planes, ignoring normal sign. Opposite faces
  share a color. Faces without a parallel partner get their own class, including
  all four tetrahedron faces. Ordered pentagrams are supported. Degenerate or
  nonplanar faces are kept in separate classes rather than falsely paired.
- **4D:** reflect source vertices about the whole-model vertex mean; pair cells
  only when their complete sets of unique source vertices are antipodal. Cells
  without an opposite get separate classes, including the five 5-cell cells.
  Coincident ambiguous vertices are not inferred to be unique opposites.

These are approximate **display partitions**, not native symmetry orbits or exact
certificates. Source coordinates are centered/scaled to unit radius, with a 1e-6
normal/point matching tolerance and reported residuals in the computed partition.
The Analysis report continues to describe only the native numerical classification.
The 120-cell therefore remains multicolored even when its native orbit query is
bounded/unavailable, without inventing an available native symmetry result.

The curated eight-color Prism palette repeats beyond eight geometric classes.
Successive blocks rotate palette assignment to spread repeats. Source entity order
fixes class labels: camera rotation, projection, frames, hiding cells and saving/
reopening the same model do not reseed colors. Shared 4D faces retain the existing
first-visible-owner rule; cell shrink/isolation exposes each explicit cell owner.

Geometric grouping is bounded to 20,000 vertices, 100,000 faces, 20,000 cells and
1,000,000 incidence/candidate visits. It supports intrinsic 3D/4D sources with the
same embedding dimension; unsupported/resource-limited sources retain the native
palette or teal fallback. Partitions are cached per prepared source, never stored
in source geometry or saved preferences. Capture retains its literal source/type
checks and the existing stereographic completeness requirements.

## Density and export appearance

The previous dense-model styling is retained:

- Up to 512 edge segments: instanced tubes; 513-10,000: one screen-space quad batch;
  above 10,000: native lines. All edges remain in display/picking/export buffers.
- Dense edges inherit adjacent face/cell color, alpha scales as
  `clamp(22 / sqrt(segments), 0.08, 1)` times saved edge opacity, and back edges
  fade toward 12% foreground alpha using the actual rendering camera. Explicit
  edge-color edits override automatic tinting. This is a depth cue, not occlusion.
- Vertex markers are hidden above 256 vertices or 512 segments; selection highlights
  remain available. Dense 4D preset opacity 0.28 becomes
  `max(0.025, 0.28 * sqrt(256 / max(sourceEdges, sourceFaces)))`; other explicitly
  selected opacity values and 3D opacity retain their previous behavior.
- Studio lights, ACES filmic tone mapping, sRGB output, antialiasing, pixel ratio
  1-2 and the radial background are unchanged. PNG/video frames share materials,
  colors and target rendering; transparent export restores the background.

## Browser verification at 1600 x 1000

| Model | Geometric classes / palette colors | Appearance |
| --- | --- | --- |
| Cube | 3 / 3 | Clear amber, blue and teal face pairs with crisp edges |
| Icosahedron | 10 / 8 | Distinct jewel-colored triangles; opposite faces match |
| Great stellated dodecahedron | 6 / 6 | Multicolored sharp star points, with opposite pentagrams matched |
| Tesseract | 4 / 4 | Four translucent cell-pair tints with visible interior edges |
| 24-cell | 12 / 8 | Layered stained-glass octahedral cells |
| 120-cell | 60 / 8 | Multicolored pentagonal lattice, keeping the subdued dense edges |

All six had stable RGB buffers through rotation and pixel-identical PNG/video
render-surface output. All six had empty Prism viewport captions. The 120-cell
note was hidden normally and visible in expert Appearance; empty notes were hidden
in both modes. No browser page/shader errors occurred. Receipts and screenshots:
ignored `artifacts/u3-colors/`.

Focused verification: **420/420 Node tests**, **71/71 final focused rechecks**
(overlapping runs), **34/34 Python default/material/type/presentation tests**, and
`npx.cmd vite build --configLoader native` passed. The existing large-chunk warning
remains. New `tests/prism-color-classes.test.mjs` has 14 tests covering geometric
pairs, unpaired simplices, native type thresholds, source immutability, saved copies,
rotation, packed owner colors, limits and real app diagnostic routing. Existing
Prism default/density color expectations were updated for the new multicolor scheme;
other styles' expectations were preserved.

Paired real-Viewer CPU rotation samples versus integrated baseline
`1ea82285abf633ee0833b2580e0b39d4885b2974`: alternating order, 40 warmups and 120 measured
poses per style/mode, excluding native computation and GPU drawing. 120-cell
orthographic: 0.393 -> 0.405 ms (+3.0%); perspective: 3.390 -> 3.400 ms (+0.3%).
24-cell: -3.5% / +4.8% (orthographic/perspective). These samples remain within the
[PERFORMANCE_DENSE.md](PERFORMANCE_DENSE.md) +20% CPU budget; small negative values are
noise, not a speed claim. Earlier dense-style receipts remain in `artifacts/u3-dense/`.

No Electron launch, real desktop GPU FPS qualification or encoded MP4/GIF file
qualification was performed. Transparency intersection sorting and stereographic
resource/completeness limits remain. Eight palette colors are reused beyond eight
classes and do not guarantee accessibility for every color-vision condition.
