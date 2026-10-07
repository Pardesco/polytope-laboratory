# Independently generated reference library

The desktop library has 45 separate entries: five Platonic solids, six convex regular 4-polytopes, thirteen Archimedean types plus the two mirrored snub forms, thirteen Catalan types plus the mirrored snub duals, and four Kepler-Poinsot polyhedra. Names, symbols, counts and available aliases are searchable. Original analytic/reflection constructions and their reconstructed incidence provide the geometry; no external mesh corpus is bundled. [The measured manifest](reference-manifest.json) records each current construction, geometry fingerprint, counts and numeric contract; regenerate it with `python scripts/reference-manifest.py`.

## Snub forms and Catalan duals

The snub cube and snub dodecahedron use proper rotational subgroups of B3 and H3. The generator solves equal squared distances from a positive fundamental-chamber seed to the three pairwise mirror products, normalizes the edge length to 1, exhausts the finite rotational orbit, and reconstructs the convex boundary. The algorithm records positive weights, solver residual, orbit size and termination. Numerical residuals are evidence, not exact algebraic certificates.

Forms **A** and **B** are explicitly different coordinate realizations. B reflects A's first coordinate; these labels do not assert a universal left/right convention. Their exhaustive geometric symmetry groups contain only proper actions, of orders 24 and 60. The snub cube's complete distance spectrum is also checked against an independent tribonacci-coordinate construction. All snub polygon faces are checked for uniform edges, common circumradii and ordinary winding.

Catalan entries are named polar duals of the independently generated Archimedean references. They use unit reciprocation radius around the source vertex mean. The library records each primal key and tests congruence of every face and dual-of-dual recovery. Most Catalans have multiple edge lengths; the rhombic dodecahedron and rhombic triacontahedron have uniform edges. They are not classified as vertex-uniform Archimedean solids.

Construction references: [Koca et al., Chiral Polyhedra Derived From Coxeter Diagrams and Quaternions](https://arxiv.org/abs/1006.3149) and [Catalan Solids Derived From 3D-Root Systems and Quaternions](https://arxiv.org/abs/0908.3272). The implementation derives its geometry independently; these papers establish the relevant group/construction context.

## Regular stars

| Entry | Symbol | V / E / F | Face winding | Surface genus |
| --- | --- | --- | --- | --- |
| Small stellated dodecahedron | {5/2,5} | 12 / 30 / 12 | 2 | 4 |
| Great dodecahedron | {5,5/2} | 12 / 30 / 12 | 1 | 4 |
| Great stellated dodecahedron | {5/2,3} | 20 / 30 / 12 | 2 | 0 |
| Great icosahedron | {3,5/2} | 12 / 30 / 20 | 1 | 0 |

The first three references enumerate coplanar regular pentagonal sets from analytic icosahedral/dodecahedral vertices. Pentagrams traverse the angular order with step 2. The great icosahedron enumerates long-edge equilateral triangular cycles of the icosahedral vertex set. Crossings create no new mathematical vertices. No convex hull replaces these ordered boundaries.

Each reference is validated as a generalized complex, with its actual Euler characteristic. Tests independently check edge-to-radius ratios, polygon winding, two-face edge incidence, vertex valence, connected orientability, genus, full order-120 geometric symmetry, OFF round trips and source immutability. Convex truncation, nets and solid export still reject these domains. Face display supports nonzero or even/odd winding fills, and generalized sections preserve source-face intersection segments and coplanar faces with source references. These surface semantics do not assign a filled volume or density. See [star surfaces and sections](STAR_SURFACES_AND_SECTIONS.md).

The [Kepler-Poinsot gallery](https://www.software3d.com/Kepler.php) and its named model pages provide independent reference counts and dual pairings, without contributing geometry or assets.

## Incidence duals and individual source faces

**3D INCIDENCE DUAL** is a separate linked view; **Construct 3D incidence dual** commits an undoable result. The committed operation accepts a center in intrinsic XYZ coordinates (blank means vertex mean) and positive reciprocation radius. The linked view uses vertex mean and radius 1.

One dual vertex is constructed for each source face plane. Each dual face follows the source vertex's cyclic incident-face link. That order is preserved even when the dual polygon self-intersects. The implementation never angular-sorts those links or uses a hull to replace generalized incidence. It requires exactly two distinct faces per source edge and one simple cyclic link of at least three faces per vertex, for up to 2,048 face planes. Open/nonmanifold/pinched links, planes through the center and coincident reciprocal planes are diagnosed. This is ordered surface reciprocation, not a claim of a convex polar solid.

Tests check polarity residuals, preserved Euler characteristic, every cyclic boundary under double reciprocation, source-coordinate recovery, singularities, extreme scales and native round trips. The existing **Construct polar dual** operation retains its convex supporting-half-space contract.

**FACE** extracts any validated source polygon into its intrinsic plane while preserving its complete ordered cycle. **CELL / FACE** also extracts generalized 4D cells with their original face boundaries, including open links. Source vertex/face IDs and the embedding basis/origin are retained so coordinates can be reconstructed. Imported generalized surfaces default to a face view; regular star library models default to an incidence-dual view.

Remaining uniform/nonconvex catalogs, Johnson and specialized families, algebraic certification, filled-star presentation and requirement-wide benchmark conformance remain release blockers.
