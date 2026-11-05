# W5 Viewer UX

Source selections now show amber four-pixel edge strokes, translucent face fills
with polygon outlines, and the faces of selected cells. Vertex dots remain as the
fallback. Picking and highlights consume the same published display owners and
position buffers, including rotated 4D perspective, stereographic worker output,
explosion copies and cell shrink/masks. Morph frames use explicit source ownership;
missing ownership uses dots rather than guessed incidence. Highlights are overlays
and can be seen through other surfaces.

The Model canvas (`base-canvas`) identifies the current **Pick** type on hover using
the existing source description/units. `.viewport-hover` shows the nearest source
candidate. Work is throttled to 100 ms with a trailing final-position update. Hover
does not advance coincident-click cycling or change selection. Dragging, rotation,
animation, morph/fold playback and exports suppress it; leaving or changing the
published pose/camera clears stale output. Multiple-view tiles also have hover.

**Multiple views** (`open-multiple-views`, on the workspace settings shelf) retains
the existing one-through-six camera grid and PNG export. `multiple-views-count`
supports 1/2/4/6 layouts (the existing 3/5 choices remain available). Each tile has
independent camera projection/direction, Fit, Maximize/Restore, and, for 4D sources,
4D projection and XW/YW/ZW quarter-turn presets relative to the source angles.
Tile IDs use zero-based slots: `multiple-view-0-camera`, `-direction`, `-fit`,
`-maximize`, `-projection`, `-pose`. Picking shares source selection across tiles
and the main view. `view.multiViews` saves camera snapshots, six-angle presentation
records and the maximized slot. Native project validation checks finite values,
supported projections, camera scales and slot bounds. Closing/reopening restores
these settings. Grid PNG still exports all tiles while a tile is maximized.

The automatically opened Tesseract starts in 4D perspective at 4 degrees/second
in XW. **Pause rotation** (`auto-rotate`), pointer/wheel interaction with the model,
or an explicit rotation edit stops the introductory spin. Opening models and
restoring saved projects retain their ordinary behavior; playback itself does not
automatically resume from a project. The toolbar is compact on desktop widths and
can still wrap below 1400 px.

Integration API: `viewer.selectEntities(kind, indices)` accepts homogeneous source
sets; `viewer.select(vertexIds)` retains its legacy dots behavior. Persist a set
as `view.entitySelection = {kind, indices}`; workspace navigation restores it
before the existing single full display. Single selections retain `{kind,index}`.
Selection remains a view edit, not a geometry/history construction.

Limits: rich highlights traverse at most 100,000 displayed edges/triangles and then
use dots with a diagnostic. Hidden/clipped/degenerate faces have no fill. Curved
outlines use published tessellation boundaries, so their accuracy follows that
display's existing approximation. Hover follows the active pick type and existing
visibility/resource restrictions. The grid remains a fixed source presentation;
its existing enabled-dual-morph refusal is unchanged. No new geometry op or IPC
route is needed: project persistence uses the existing native validator/save path.
Electron rendering and the 1500 px toolbar need the lead's desktop click-through.

Validation: `tests/viewer-ux.test.mjs` covers builders, sets, masks, explosion,
projection/morph frames, packed publication, hover suppression/trailing updates,
saved set restoration and startup policy. `tests/multi-view-controls.test.mjs`
covers independent saved cameras/projections/orientations, layouts, maximize,
export and cancellation. `tests/test_viewer_ux.py` covers native layout validation
and project roundtrip. The new Node suite is in `test:features`.
