# Attributed Antiprism catalog

The vendored catalog contains all 92 Johnson entries J1–J92 and the 75 finite listed uniform entries U1–U75 from pinned Antiprism 0.32. All 167 adapted assets pass the application's unchanged strict OFF importer. The native registry exposes them through the desktop library with lazy loading, source-hash verification and manifest count checks. Packaged coverage remains a separate verification gate.

The source is the [official Antiprism 0.32 Windows download](https://www.antiprism.com/files/antiprism-0.32_w64_install.exe). Its SHA-256 is `a5318868fa6032923bd9acca945609d5bad0e88cbc8bc1ffec83df35a7d266cc`; the extracted `off_util.exe` SHA-256 is `ecf4f858fcfcd5210a0211e97a2a9ac6c198328752d7e7b5f753dc4bf837f1b4`. The installer was extracted and never executed. Build tools, DLLs and the installer remain ignored acquisition artifacts and are not catalog runtime dependencies.

## Attribution and scope

`engine/catalog_data/antiprism/COPYING` preserves the complete upstream copyright and permission notices, including Adrian Rossiter and Roger Kaufman and the component-specific notices. Upstream identifies the distribution as MIT-and-similar, permissive with attribution. The full upstream resource notice is retained as `RESOURCE_NOTICE.html` and states that individual external resource headers must be checked. This acquisition uses the internal generated Johnson/uniform resources through their numbered IDs; it does not vendor external example models, optional extras, code, executables or external color-map files. The upstream copyright file and resource notice were read before vendoring.

Exact names and uniform Wythoff symbols come from `off_util -H johnson` and `off_util -H uniform`, retained with hashes. Uniform U76–U80 are example prism/antiprism resources outside the requested U1–U75 range. Infinite prism/antiprism families, separate uniform compound resources, dual catalogs and mirror counterparts are not acquired by this batch. No model is labelled a uniform compound based on its name or a self-crossing face. Every acquired source boundary graph has one connected component; that fact alone does not establish a filled solid or rule out other geometric interpretations.

## Source-preserving adapter

Each entry includes a raw `sources/<id>.off` and a strict `models/<id>.off`, with both SHA-256 hashes and its command `off_util.exe -d 17 <id>`. Raw output is retained byte-for-byte. Coordinates and ordered polygon cycles are preserved; the adapter does not hull, triangulate, merge, reorder, reflect or normalize the source geometry.

Antiprism OFF permits one-index vertex drawing rows and two-index edge drawing rows among its face records. Our strict OFF dialect accepts polygon boundaries only. The explicit adapter separates these drawing rows into `manifest.entries[].adapter.decorations`, including their source row, indices, original record and color identity. It recalculates the adapted header's polygon count and boundary-derived edge count. The raw declared counts are retained. The strict importer itself is unchanged.

RGB/RGBA polygon suffixes keep their source values and decimal spelling. Indexed suffixes, if supplied, retain their original integer index in source metadata; a documented four-color modulo display palette can resolve the strict OFF suffix without claiming that palette is source RGB. Every actual J1–J92/U1–U75 output in this acquisition supplies RGB polygon colors, so no source polygon index needed resolution. Independent adapter fixtures cover indexed face/vertex colors, edge decorators and RGBA. Unsupported attributes, malformed colors, nonfinite coordinates, invalid incidence and resource excesses fail explicitly.

## Numerical evidence and interpretation

All coordinates are approximate supplied decimals interpreted as float64. There are no exact algebraic certificates. The manifest reports independent checks of plane residuals, equal polygon edges, equal circumradii, constant angular traversal and a common model edge length. Every acquired model passes the documented `1e-7` regular-face/equal-edge tolerance; the largest recorded face residual is approximately `2.89e-14`. These checks support regular polygon geometry, including preserved star winding, but do not alone prove vertex transitivity or mathematical uniformity. Johnson/Uniform family labels remain attributed upstream classifications rather than classifications inferred from names.

The importer recognizes convexity only when the complete supplied face cycles agree with the reconstructed convex boundary. U3, U34, U52 and U75 remain generalized complexes; they are not replaced by convex hulls. Winding metadata reports `{5/2}` pentagram faces for U34 and U52. Source connectivity and edge-face multiplicities are recorded without assigning a filled-volume interpretation. U75 has 60 vertices, 240 edges and 124 faces, with two incidences on each edge and Euler characteristic −56; those facts do not make its intersecting surface a convex solid.

Exhaustive incidence-preserving Euclidean symmetry samples for U1, U6, U12, U29, U34 and U75 complete their numerical frame search and generator-closure checks, each with one vertex orbit. Independent signed-axis subgroup fixtures prove vertex transitivity for U1, U6, U12 and U34 without calling the builder's symmetry routine. The supplied U12 snub cube has 24 proper actions and no improper actions; U29 snub dodecahedron has 60 proper actions and no improper actions. These support numerical chirality for the supplied coordinate/incidence representations. J84 snub disphenoid independently has four proper and four improper actions, with two vertex orbits, demonstrating that a snub name does not alone imply chirality or uniformity. Other unsampled entries carry an explicit unclassified chirality status. No reflected counterpart is synthesized.

| Independent fixture | Vertices | Edges | Faces | Boundary faces |
| --- | ---: | ---: | ---: | --- |
| J1 square pyramid | 5 | 8 | 5 | 4 triangles, 1 square |
| J2 pentagonal pyramid | 6 | 10 | 6 | 5 triangles, 1 pentagon |
| J3 triangular cupola | 9 | 15 | 8 | 4 triangles, 3 squares, 1 hexagon |
| J84 snub disphenoid | 8 | 18 | 12 | 12 triangles |
| U29 snub dodecahedron | 60 | 150 | 92 | 80 triangles, 12 pentagons |
| U3 octahemioctahedron | 12 | 24 | 12 | 8 triangles, 4 hexagons |
| U34 small stellated dodecahedron | 12 | 30 | 12 | 12 pentagrams |
| U52 great stellated dodecahedron | 20 | 30 | 12 | 12 pentagrams |
| U75 great dirhombicosidodecahedron | 60 | 240 | 124 | 40 triangles, 60 squares, 24 pentagons |

## Reproduction and verification

```powershell
python scripts/build-antiprism-catalog.py
python -m pytest tests/test_antiprism_catalog.py -q
```

The builder checks both pinned installer/tool hashes, requires the expected copyright/resource notices, and restricts output to its owned `engine/catalog_data/antiprism` directory. It obtains exact help metadata, generates all required entries, validates strict assets and writes the version 1 manifest. A strict import failure produces an explicit manifest diagnostic and failing exit status. Tests use only shipped source/data assets; no Antiprism executable is required at runtime or for those tests.

All 365 checks pass. Coverage includes every required entry and source/adapted hash; exact raw cycle/coordinate/color preservation; strict import and OFF color/incidence round-trip; independent unit-edge, planarity and regular-circle tests for all 167 models; independent reference counts; Johnson two-face manifold/Euler checks; generalized U topology; transitivity/chirality/winding evidence; official names/symbols; and rejected adapter color, resource, coordinate, incidence and declared-edge attributes.

The integrated 0.11.0 development desktop additionally passed actual J92 and U75 library loads in `artifacts/recipes-smoke-BWOgF9`, with no renderer errors. Native saved J92 retained its 18/36/20 geometry, attributed source key, adapted-file hash and source polygon RGB. U75 retained all 60/240/124 source elements and its generalized interpretation. The script also checked the separately attributed regular 4D star catalog. Packaged asset verification remains pending.
