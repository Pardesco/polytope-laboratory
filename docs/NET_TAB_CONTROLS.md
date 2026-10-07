Glue tab placement
=================

The Nets panel now supports a default construction method (none, single tab,
double tabs), a physical tab width in mm, and an override for each literal source
edge. A single-tab override can choose either incident source face. Use default
removes the edge override. The Select tab edge mouse action picks an edge without
cutting it or moving the component. Include glue tabs remains a temporary master
switch; disabling it preserves all preferences.

Generate a net, choose a default method and width, and Apply default and width.
Select a source edge, select its method and optional source face, then Apply to
source edge. Native results commit through the existing net history, including
Undo/Redo. Overrides on hinges remain dormant and reappear when the edge is cut.
Generate/reset changes the forest but retains the current source's preferences.
Moving to another source resets preferences instead of transferring edge IDs.

The width is the perpendicular tab extent in actual mm; changing reference E0
scales faces but leaves this width fixed. The trapezoid's end bevel is
min(width, edge_length/5). No shape/angle correspondence beyond the documented
tab-method/size workflow is claimed. Double tabs have one actual polygon on each
incident cut-edge copy. Tab outlines use signed complete source cycles, including
concave edges; an outward tab may collide with another part of its own concave
face. Such overlaps are reported and are never silently trimmed or removed.

SVG and packed PDF/SVG pages use actual polygons and preserve source face text,
PNG alpha and physical dimensions. Packing includes tab extents in its rigid
part bounds. Folding keeps the original rigid face forest and its source metric;
folded glue tabs themselves are not separately rendered or collision certified.
Cached native layouts are reconstructed from authoritative source-bound
preferences on Save/Open, not from saved tab point buffers. Saved animated-tour
net preparation and folding animation carry these preferences and the forest.

Parameters: optional native tab_options is version 1 with sourceId,
sourceFingerprint, mode ('none'|'single'|'double'), widthMm (0.1..100), edges
([{edge,mode,face?}]). face is only valid for single and must touch the source
edge. Output field is tabOptions; view.net.tabOptions mirrors it. Existing native
net-edit action set-tab-options commits a complete validated preference object.
Legacy nets without preferences retain their existing default tab generation.

Primary scope reference: Robert Webb, Stella manual, Build > Tabs:
https://www.software3d.com/Manual/Tabs.php?prod=Small
The manual documents default/per-edge none/single/double, switching single-tab
side, restoring default, and tab size. Scale says the physical tab size remains
fixed when the model scale changes:
https://mail.software3d.com/Manual/Scale.php?prod=Stella4DPro
Coincident-edge assembly is a separate remaining domain: current source shells
require two faces per edge. No four-way edge pairing, tongue-in-groove policy,
or hull substitution has been inferred.

Focused evidence
----------------

The independent fixture is a literal L-prism with complete concave source caps,
not a convex hull. Checks measure exactly 5mm outward width at E0=25 and E0=73,
including the reentrant source edge [2,3]; count two tabs per cut edge in actual
SVG and packed-page XML; switch the single-tab owner; cut/move/join; turn the
master switch off/on; and Save/Open native cached layout, history, text and
literal RGBA PNG. Tampered saved tab points are recomputed. Foreign owners and
invalid physical widths/incident faces are rejected. Frontend sanity checks
cover source reset, incidence, default reset and ignored native work after a
tab setting change. No GUI qualification was run in this stage.
