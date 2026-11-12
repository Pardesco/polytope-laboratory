# Faceting source arithmetic

Construct → **Facet & stellate** → **Automatic facets (3D)** now has
**Source arithmetic · inspect supplied coordinates** (`faceting-arithmetic`).
The read-only `facet-source-arithmetic` native job reports exact coordinate
ratios, each source face's anchor plane and exact plane values, approximate
anchor-plane distance residuals, candidate counts and full-source symmetry
discovery status. `faceting-arithmetic-summary` shows the explanation;
`faceting-evidence` contains its JSON receipt. Cancellation, export exclusion
and source ownership use the existing faceting controller/NativeJobs path.
Inspection does not change a model or create a history node. Source changes
revoke the displayed inspection; observer camera movement does not.
**Use source faces** now refuses an empty source-face selection explicitly,
preserving the previous selection. It cannot silently turn absent exact source
faces into the blank field's "all candidates" domain.

## Pinned regular source and arithmetic contract

`tests/fixtures/faceting-dodecahedron-source-v1.json` pins the app's existing
`regular('dodecahedron')`, the numerical polar dual of `regular('icosahedron')`,
after R7. It retains all literal vertices, incidence and binary64 hexadecimal
words. Representation fingerprint:
`5e3dacd536a20b3a6e94f0a30614c574e8faafe88fa02a4e711d0cfc192131ac`.
The provider-match test intentionally fails if a platform/provider produces
different coordinates: a new source pin needs new qualification.

The three positive supplied coordinate magnitudes are:

| Magnitude | Supplied exact ratio | Intended algebraic reference |
| --- | --- | --- |
| A | 3440443971868337/9007199254740992 | (3−√5)/2 |
| B | 347922205179541/562949953421312 | (√5−1)/2 |
| C | 8505245244017279/36028797018963968 | √5−2 |

In the supplied domain, `A+B−1 = 1/9007199254740992` and
`C−(B−A) = 3/36028797018963968`. These are nonzero exact discrepancies.
All twelve displayed pentagons fail exact supplied-coordinate planarity;
the maximum distance from the first noncollinear anchor plane is approximately
`5.700616386180099e-19` source units. This residual is numerical reporting,
not an exact distance certificate. The receipt retains the nonzero rational
plane values and affected source vertex IDs independently of that display.

| Exhausted domain | Supplied binary64 ratios | Intended Q(√5) reference |
| --- | --- | --- |
| Source-supported planes | 807 | 319 |
| Plane vertex counts | 696 triangles; 111 quadrilaterals | 200 triples; 75 quadruples; 24 quintuples; 20 sextuples |
| All simple cycles, rotation/reversal identified | 1,473 | 5,553 |
| Metric and cyclic-incidence source actions | 24 (12 proper) | 120 |
| Original pentagon cycles in exact candidate domain | 0/12 | 12/12 |

The independent supplied oracle scales every binary64 ratio onto a common
integer grid and exhausts primitive integer plane determinants. An independent
spanning-frame Gram oracle exhausts the entire centered linear action domain,
checks every pair and ordered face cycle, and compares all 24 native actions
and all 87 candidate orbits. The reference oracle uses test-only rational pairs
`a+b√5`, proves its 12 supporting pentagons and equal source edges, and exhausts
its planes/actions without float predicates. The fixture contains explicit
Q(√5) coefficient pairs and the unchanged source-ID correspondence.

**The intended reference is not a native algebraic faceting provider.** No
snapping, coordinate substitution, field coercion or changed search bound is
introduced. Automatic faceting reads `vertices`; it does not substitute a
`rationalCoordinates` table. Other exact-policy helpers have a different
explicit rational-table contract; the inspection discloses this when present.

## Qualified search and adoption tranche

For the pinned supplied source, select **Discover full source group**, check
**Keep selected subgroup symmetry**, and choose **Isohedral in selected
subgroup**. The full-vertex search exhausts with zero results. This is a finite
supplied-coordinate result, not absence of regular algebraic facetings.

Check **Allow unused source vertices** to obtain exactly two results: the
six-face cube and the eight-face compound of two tetrahedra on the eight
vertices `(±A,±A,±A)`. Both are tidy in the recorded closed, single-link domain;
the optional **Also require spiky** retains only the tetrahedral compound.
Independent edge/link/plane-ownership and exhaustive support-plane segment
oracles establish these counts. Spiky means no entire candidate edge lies on
the exact supplied convex-hull boundary, not merely that its endpoints are
extreme vertices. All 20 source IDs/coordinates remain in partial results.
Diagram preview/adoption, source-owned preview/adopt, two-state history,
save/reopen and deterministic replay are tested for the tidy-spiky result.

Bounded scenario coverage is added for `fac-02-dodecahedron-frontier`,
`fac-03-isohedral`, `fac-03-tidy`, `fac-03-spiky`, `fac-03-tidy-spiky`,
the partial-vertex part of `fac-03-partial-coplanar`, and
`fac-04-replication-adoption`. These closures concern the named supplied source
and policy combination. They do not close all FAC-02/03/04 or establish
competitor option equivalence, chart/stepping modes, or the intended regular
algebraic source domain.

## Limits and follow-up

Inspection accepts intrinsic/embedded 3D sources with 4–20 vertices, at most
128 source faces and 20 corners per source face. The existing candidate/group
work caps remain in force; limited jobs expose partial counts and unresolved
group status. Inspection never reports a faceting enumeration count. Native
surface realization remains approximate (`certified: false`). Tidy-dual above
12 vertices remains unsupported. General labeled searches can hit the existing
256-variable frontier; no unrestricted-search completeness is claimed.

A follow-up intended regular provider needs bounded Q(√5) arithmetic,
representation identity and replay/version rules, exact source planes and
isometries, and an independently validated numerical surface adapter. Its
5,553-cycle domain already exceeds the current 4,096-candidate cap; 120 full
actions require 666,360 candidate references, exceeding the 100,000-reference
cap. Increasing those bounds alone cannot repair the supplied domain or create
an algebraic provider. The retained exact oracle is the prerequisite contract.

Tests: `tests/test_faceting_source_arithmetic.py` (including the pinned fixture,
independent two-domain oracles and history),
`tests/faceting-source-arithmetic.test.mjs` (copy and IPC/pool registration),
and new mounted-controller/native JSON-lines cases in
`tests/automatic-faceting-controls.test.mjs` (inspection, stale publication,
cancel/export and camera ownership). Existing faceting/diagram suites and the
production Vite build are regression checks. No Electron or competitor run was
performed.

Verification in this worktree: **274 existing Python regression tests passed**
across the automatic-faceting/scalable/diagram suites; **10 new Python tests
passed** on the final source fixture; **58 Node tests passed** across the
automatic-faceting controls, source-arithmetic copy, IPC allowlist and worker
pool suites. The first combined Python run had one new lifecycle failure from
the fixture's omitted `numeric` record; after retaining the generator's actual
policy and fingerprint, the complete new suite was rerun successfully.
`npx.cmd vite build --configLoader native` passed (377 modules; existing
mixed-import and large-chunk warnings). `git diff --check` passed.
