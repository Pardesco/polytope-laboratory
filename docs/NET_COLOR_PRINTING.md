Source color net printing
========================

The Nets paper-preview controls now offer mixed colors, automatic policy, or one
source color per net and page. Source OFF face RGB/RGBA (metadata.offColors.faces)
defines the batches; equivalent byte/unit records form one batch. Alpha is
retained and participates in grouping. Missing face colors form an explicit
uncolored batch. Display-generated face/cell palettes are not source colors and
are not silently substituted. Native output retains literal source face IDs,
source vertex cycles, source edge IDs, and actual cut/hinge flags.

For separate printing, cross-color hinges are explicitly cut in a detached print
forest. Every resulting connected piece is monochromatic. Existing whole-face
positions, dimensions, tab options and mm widths are retained before packing;
only the print forest's connectivity changes. Original model, editable net,
component placements and net-edit history remain untouched. Matching connection
IDs retain their source values across color batches. Every source edge occurrence
remains present, even where former hinge copies are geometrically coincident in
the original flat layout. This is not a geometry weld or stroke-suppression rule.

Automatic policy mixes colors for convex sources or sources with face PNG
images; otherwise it separates. Explicit separate mode works with images too.
Choose all paper colors or a batch identified by a literal representative source
face. Select separate mode to choose a batch. Each paper-preview page names its
batch; packed SVG/PDF export uses exactly those selected pages. A subset print
reports selectedSourceFaceIds and does not claim that all source faces printed.
Print source face color fill can be disabled for colored stock; source text and
PNG images still print. Uncolored source faces receive no invented color ink.

Every page keeps its mm viewBox and physical page size. Tab/label extents are
included in rigid packing bounds. No automatic scale change, edge deletion,
convex replacement, or overlap repair is performed. Tab overlap diagnostics
remain visible, including overlaps with the owning concave face. Single-tab
ownership is consistent across color/page subsets; annotated SVG regenerates
source-owned tab geometry rather than trusting saved tab point buffers.

Print settings are saved in view.netPrint and cached netPages.parameters. Native
Save/Open re-creates layouts, source snapshots and color batches from the actual
project model. Existing source-bound expression/commit fencing protects paper
controls and rejects publication after source, unit or state changes. Batch
settings carry color_source_id/fingerprint and reset on a new source. Stored
projects/tour states retain the settings and caches. The existing animated-tour
paper-page adapter continues to refuse paper-page capture explicitly; this stage
does not replace a requested paper view with a folding view.

Native API: existing net-pack accepts optional color_mode ('auto'|'mixed'|
'separate'), paper_color ('all' or source face ID), print_fill (Boolean), and
optional color_source_id/color_source_fingerprint. Omitting color_mode keeps the
legacy packing path. New colorPrinting metadata records originalHinges,
printHinges, crossColorCuts, sourceFaceMap, selectedSourceFaceIds and color groups.
Color-bearing generated nets include a geometry/source-color printSource snapshot
which is regenerated during cached-layout reconstruction. A source annotation
document supplies its existing complete snapshot instead where applicable.

Primary references and the deliberately open domain
-------------------------------------------------

Robert Webb's Stella Build manual section 7.1.2 documents automatic, separated
and mixed net/paper colors, per-color batches and printing source images:
https://www.software3d.com/Manual/Build.php

The coincident-edge manual explicitly concerns four faces at a pinched source
edge and specifies assembly/incidence choices (tongue-in-groove, internal support,
no support, disconnected). Current net qualification requires two source faces
per edge. Coincident planar line suppression would not implement that domain;
the four-face source assembly policy remains open:
https://software3d.com/Manual/CoincEdges.php

Focused independent evidence
----------------------------

tests/test_net_color_printing.py authors a literal cube with supplied source face
cycles and independently specified byte/unit RGB/RGBA colors. SVG XML checks
measure 37mm face edges, perpendicular 5mm tab widths, two occurrences of every
source edge, tab ownership and source alpha. A selected color batch persists
through actual native Save/Open without changing original hinges/history/source
metadata. Tampered cached color snapshots are re-created from the model. Tests
also verify automatic nonconvex/image behavior, annotated legacy single tabs
across paper subsets, text/PNG retention and foreign batch-owner refusal.
Frontend checks cover equivalent byte/unit RGBA groups and literal source-face
batch validation. No GUI qualification was launched in this stage.
