# Paper-model layout and assembly sheets (W30)

New multi-piece 3D face nets use a deterministic shelf arrangement selected from
six candidate widths. The objective balances occupied area and aspect ratio.
Bounds include actual tabs, 4 mm of label clearance, and a 5 mm inter-piece gap.
Pieces retain their orientation and physical scale. A single connected net is
unchanged. Explicit saved placements, including older strip layouts, remain
authoritative; use **Re-arrange pieces** to compact an existing layout.

In **Nets → 3D face net**, **Re-arrange pieces** (`net-rearrange`) returns to the
2D layout and uses `net-edit` / `arrange-pieces`. It creates an ordinary net
history entry. Manual dragging, piece rotation, net Undo/Redo, folding, and
Save/Open preserve those placements. Reset generates a fresh compact layout.
The internal strip basis remains unchanged so saved placement recipes retain
their original meaning.

Pieces are numbered **P1…Pn**, ordered by their root source-face ID. The piece
selector displays both P and F IDs. Cut copies retain matching **E** source-edge
IDs. Labels rotate along their edge, scale with its length, and shrink to fit
inside the face without overlapping other edge-label boxes. Labels stay on the
face side of the tab crease. Face IDs remain where there is room, and every face
has a P/F SVG hover title. The summary warns when edge text falls below 1.2 mm;
increase Edge 0 length before printing. Font bounds are conservative estimates,
not measured printer glyph bounds; arbitrary annotation text/images can still
cover labels. Source face fills and RGBA paper batches use the existing color
printing workflow.

**Nets → Paper and export** contains:

- **Number / parts color** (`net-piece-color`): source-face color, a repeating
  piece palette, or black. This colors P identifiers; source face fill remains
  controlled by Color printing. Contrasting outlines keep light P colors visible.
- **Add assembly sheet to PDF** (`net-assembly-include`): append optional assembly
  pages to either net PDF export. Packed PDF is recommended because its sheets
  have the selected physical paper size.
- **Export assembly sheet SVG** (`net-assembly-svg`): one standalone SVG with
  enough vertical space for all parts. In Packed paper pages view it describes
  the detached print pieces; otherwise it describes the editable net.

Assembly sheets capture the **main 3D view** through the app's prepared PNG path.
Show the finished source model there; a different/deformed model is refused.
Source, print settings, camera, and cancellation are checked during preparation;
source/settings ownership is checked again around the export dialog and PDF
rendering. The thumbnail is embedded, with no external image dependency.
The sheets contain P identifiers, face counts and source face IDs, source-color
swatches, E-label convention, fold legend and scoring/gluing tips. Long face-ID
lists abbreviate on paper; the complete list is in each SVG row's title. Up to
six source color swatches are shown per row. Additional PDF sheets paginate the
parts list and keep the reviewed net pages' dimensions. Color-separated batches
use one global numbering across all selected pages; assembly lists follow those
print pieces, including additional cross-color cuts. Palette colors may repeat.
Preferences persist in `view.netAssembly`; thumbnails are captured afresh.

## Fold convention and limits

Native code coherently orients each closed shell, chooses its outward orientation
by signed volume, and computes `atan2(t · (n1 × n2), n1 · n2)` about a coherently
directed source edge. Under this printed-side convention, positive convex bends
are **valley** (short dashes, cube: all valley); negative reentrant bends are
**mountain** (dash-dot). Glue-tab bases are valley creases. Cut outlines are solid.
Flat/undefined hinge signs use dotted strokes. Near-zero signed-volume shells
have unknown fold direction rather than an invented interior. This is a local
float64 convention on the existing supported orientable shell domain, not an
exact certificate or a global interior guarantee for self-intersecting shells.

Packing does not resolve overlaps inside a connected piece, rotate pieces, split
pieces, optimize globally, or change E0. Very long individual pieces can prevent
a near-square arrangement. The verified 20-piece great stellated dodecahedron
at E0 = 25 mm occupies about 282 × 336 mm including clearance (aspect 1.19), with
zero face/tab overlaps and a reconstructed folding endpoint. Old manually
overlapping layouts remain as edited until rearranged. Paper calibration and
folding collisions remain unqualified. Assembly PNGs are bounded to 12 MB;
very wide/short page ratios below 0.5 are refused for assembly sheets. An
unpacked PDF's assembly page uses its existing canvas dimensions; choose packed
pages for ordinary print-size typography. No Electron launch was attempted.

## Validation

`tests/test_net_paper_ux.py` checks 20-piece tab-inclusive gap/aspect bounds, the
single cube, signed reentrant folds and reversed face cycles, label scaling and
pair coverage, SVG styles, global batch numbering, manual rotation, native
dispatch, reconstruction and saved project/history/preferences.
`tests/net-assembly.test.mjs` checks assembly SVG content/pagination, source
colors, thumbnail/export ownership, mounted controls and net history routing.
It is registered in `test:features`.

Focused verification commands:

```
python -m pytest tests/test_net_paper_ux.py tests/test_nets.py tests/test_net_editing.py tests/test_generalized_nets.py tests/test_net_printing.py tests/test_net_tabs.py tests/test_net_color_printing.py tests/test_visible_surface.py tests/test_net_worker_protocol.py tests/test_element_content_workflow.py tests/test_element_content_specialists.py tests/test_project_geometry_reuse.py -q -p no:cacheprovider
node --test tests/net-assembly.test.mjs tests/net-generation-history.test.mjs tests/net-export-state.test.mjs tests/net-export-session.test.mjs tests/net-print-session.test.mjs tests/net-presentation.test.mjs tests/net-content-ownership.test.mjs tests/net-drag-ownership.test.mjs tests/net-color-printing-controls.test.mjs tests/net-tab-controls.test.mjs tests/net-source-triangles.test.mjs tests/visible-surface-controls.test.mjs tests/renderer-contract.test.mjs tests/discoverability.test.mjs tests/engine-pool.test.cjs
npx.cmd vite build --configLoader native
```
