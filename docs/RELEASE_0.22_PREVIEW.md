# 0.22 community preview

This free, GPLv3 release prioritizes usable feature coverage and community
feedback. Development uses targeted checks and a build instead of requiring
exhaustive competitor qualification for every feature. The prior 0.21 verified
release and its evidence remain available separately.

## Added workflows

- Editable, source-linked per-vertex faceting diagrams with diagram picking,
  parameter persistence, and explicit adoption of a linked search result.
- Eight 3D dual-morph modes: sizing, truncation, augmentation, expansion,
  tilting quads, tilting triangles, tilting to a compound, and tilting to
  rectification. Expansion and tilting quads also support qualified 4D sources.
- Formatted element text and PNG textures, including annotated physical nets,
  repeated net/explosion labels, still capture, and independent tour capture.
- Internal support panels, saved restoration, SVG/PDF sheets, and construction
  measurements exported as CSV or JSON with selectable units.
- Red/cyan anaglyph, parallel stereo, and cross-eyed stereo displays.
- One to six independent source views with saved cameras, linked picking,
  maximization, and whole-grid PNG export.
- Static expansion/runcination for closed convex 3D sources, with expression
  parameters, source colors, saved history, and replay.
- Project titles, author, descriptions, references, and additional JSON fields.
- A 4D construction tool that matches supplied 3D vertex figures against six
  regular convex types and 30 finite Wythoff candidates, with explicit choice
  when multiple constructions match.
- 80 specialized 3D entries: 75 attributed compounds, four noble disphenoid
  mirror entries, and a polygonal torus; editable noble disphenoid parameters.
- 980 additional attributed Miratope 4D source entries: 72 library entries and
  908 separately labeled discovery candidates, preserving distinct incidence.
- GPLv3 program licensing, third-party attribution, corresponding source
  packaging, contribution guidance, and bug/feature issue templates.

## Known limits

Catalog directory labels and discovery candidates are source classifications,
not a proof of uniformity, chirality, or complete coverage of all 2,191 Stella
forms. Some supplied files remain outside the strict importer's supported domain.

Morphs are display operations with documented source domains. The new compound
and rectification continuations can have intersecting or open intermediate
patches; those frames are not advertised as closed solid constructions. Morphs
combined with element content or tour/keyframe tracks remain limited.

Generalized nets, unrestricted faceting/stellation, all fitting domains, Stewart
toroid classification, and full uniform/scaliform construction remain unfinished.
The practical 90% coverage target has not yet been measured against the complete
feature inventory. Please report specific missing workflows and reproducible
bugs through the repository's issue templates.

## Build and source

Run `npm.cmd run package:preview` to build into a separate preview folder without
replacing historical release artifacts. Run `npm.cmd run package:source` after
the final source is settled to create the accompanying GPLv3 source archive.
