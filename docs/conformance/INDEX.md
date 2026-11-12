# Versioned option scenarios

`inventory.json` is the entry point. This is a frozen source/fixture audit at
`582c0015f4baa5a8a567a06523c8a664061825f2`, dated 2026-11-09, targeting the build
specification's Stella4D / Pro 6.0 scope. It is not a new parity ledger. The lead
owns canonical ledger changes; this package proposes no requirement promotion.
The preceding gap audit's commit (`01c5d22e104a0f2c89ea42ce1241427f883a0a2d`)
is recorded separately from this worktree's inspected implementation commit.

## Files and record contract

| File | Contents |
| --- | --- |
| `inventory.json` | Version, scope/exclusions, requirement-to-case indexes |
| `sources.json` | Version, location, evidence category and scope of each source |
| `domains.json` | Supported dimension/class qualifications, limits and refusals |
| `scenarios-common.json` | First-use hull, core, dual, section, net, fitting and IO cases |
| `scenarios-fitting-options.json` | Selected/combined conditions, scale/symmetry/targets, invalid adoption |
| `scenarios-generators.json` | Specialized sequences, products, segmentotopes, figures and springs |
| `scenarios-modifications.json` | Cuts/expansion, compounds, attachment, refinement and blending |
| `scenarios-stellation-faceting.json` | Plane arrangements, criteria, groups, cavities, searches and diagrams |
| `scenarios-nets.json` | Tab/assembly policies, packing, reinforcements and measurement formats |
| `scenarios-materials.json` | Saved materials, alpha, bump/environment and imported asset gaps |
| `scenarios-io.json` | Import policies, six baseline codecs, selected views, media and printing |

Every scenario has a stable `id` (`requirement-id-option`), `requirement_id`,
`option`, `domain_id`, a described input with parameters, expected checks and
source references, fixture pointers, UI IDs and a follow-up owner/action.
Parameters describe a reproducible scenario, **not an executable engine request**;
arrays may describe alternatives or literal coordinates. The named fixture
contains executable setup. `case_domain` narrows source dimensions/classes;
`domain_id` supplies shared caps and qualification rules. These are necessary
conditions, not a promise that every input below a resource cap is supported.

`source_dimensions` means dimensions to investigate in this case.
`supported_source_dimensions` states bounded native support; it is empty for
unsupported or unverified cases. A vertex-figure case starts with a 3D source
and searches for a 4D completion. A 4D section/export can produce 3D output.

Source references distinguish requirement scope, implementation contracts,
documented options, historical metadata and independent expectation oracles.
For example, a manual can establish that a center is selectable while a literal
plane-equation fixture establishes a numerical reciprocal expectation.
It cannot supply an unrecorded competitor output. A reference marked
`unretrieved-scope-link` supplies no verified option semantics.

`implementation` has these meanings:

| Value | Meaning |
| --- | --- |
| `supported` | Implementation and relevant fixture exist for the stated bounded workflow |
| `restricted` | Source/parameter/interpretation restrictions or compatibility differences apply |
| `engine-only` | Native computation exists but the requested mounted UI is absent |
| `unsupported` | Requested option/domain is absent or expressly refused; parity obligation may still need reconciliation |
| `unverified` | Option mapping/eligibility has insufficient evidence to classify support |

`fixtures[].role=direct` means relevant coverage exists, not that every listed
parameter combination was asserted. `related-not-oracle` deliberately marks a
nearby test that needs a new fixture or extension for the requested case.
Python selectors identify actual test functions or `Class::method` nodes; null selectors identify
whole Python or Node suites. No executable test IDs are invented.

Every `benchmark.status` is `unverified`. Fixture inspection, native test runs,
mock-DOM tests, desktop execution and competitor execution are separate levels.
`qualification.native_fixture_run=not-recorded-per-case` means execution evidence
is retained by command/suite in `VERIFICATION.md`, rather than converted into
per-case conformance badges. Counts and measures marked independent are scoped
to the named literal fixture and tolerances; float64 coordinates remain approximate.

Each requirement lists all `case_ids`, `qualification_case_ids` and the narrower
`implementation_gap_case_ids` (unsupported, engine-only or support-unverified).
A partial row may have no missing implementation case yet still need option
qualification. Its follow-up actions remain open. Cross-products of options,
dimensions/classes and codecs are explicitly unverified until represented by a
new scenario with its own evidence. This initial inventory is not an assertion
that every undocumented competitor option has been recovered.

## Version and source limits

The installed 5.4 manual's SHA256 was checked and its named anchors read locally.
No installed application was launched, no `.stel` model contents were copied,
and no new Stella operation output was collected. Static dialog details use the
existing installed-version report. Historical report links to artifacts are not
treated as fixtures when those artifacts are absent from this checkout.

The [official history](https://www.software3d.com/History.php) now includes releases
after 6.0. Only its 6.0 entry informs this target; later versions do not silently
expand scope. Current [import](https://www.software3d.com/Manual/IO.php?prod=Stella4DPro),
[export](https://www.software3d.com/Manual/Export.php?prod=Stella4DPro) and
[fitting](https://www.software3d.com/Manual/TryTo.php?prod=Stella4DPro) pages were
read as live documentation, not frozen 6.0 snapshots. The materials page could
not be retrieved; material scope uses the repository spec/history and explicitly
requests versioned option evidence before declaring equivalence.

## Existing UI entry points

These are click-through pointers for lead qualification, not new controls.
Open Inspector (`toggle-inspector`) to reach its tabs. Layout/access descriptions
refer to the audited baseline; R5-UX, R5-SECTIONS and R5-NETS may improve access.
All existing IDs/handlers remain untouched by this package.

| Workflow | Entry points |
| --- | --- |
| Hull/core/dual | Construct: `build-hull`, `make-convex-core`, `make-dual`, `dual-options-settings`; core card is expert-only but command-search reaches its pane |
| Sections | Derived selector `derived-mode`, `section-normal`, `section-offset`, `apply-section`, `section-events`; filled options `density-section-controls` are expert-gated in baseline |
| Fitting/springs | Construct → Make it regular: `preview-fitting`, `adopt-fitting`, `accept-fitting-near-miss`, `preview-spring` |
| Cuts/expansion | Construct: `truncate`, `preview-incidence-cut`, `make-expansion` |
| Attachment/placement | Construct: `apply-face-surgery`, `drill-face-surgery`, `place-at-faces` |
| Generators | Construct: `podia-settings`, `stephanoid-settings`, `torus-settings`, `waterman-settings`, `product-settings`, `antiprism-settings`, `step-prism-settings` |
| Segmentotopes/figures | Construct: `layer-join-settings`, `crossed-segmentotope-settings`, `vertex-figure-search` |
| Compounds/refinement/blend | Construct: `add-dual`, `compound-extract`, `blending-controls`, `make-source-zonohedron`, `coincidence-analyze`, `face-editing-settings`; source zonohedron card is expert-only in baseline |
| Stellation | Construct → Stars & facets: `stellation-evaluate`, `stellation-enumerate`, `stellation-candidate`, `stellation-face-diagram`, `stellation-cell-fill`, `stellation-face-base`; arbitrary planes have no UI |
| Faceting | Construct: `facet-cycles`/`facet`, `faceting-candidates`, `faceting-search`, `faceting-criterion`, `faceting-preview`, `faceting-adopt`, `faceting-diagram-build` |
| Nets | Nets: `net-rebuild`, `net-toggle-edge`, `net-fold`, `net-tabs`, `net-tab-settings`, `net-pack`, `cell-net-build`, `cell-net-reattach` |
| Assembly/fabrication | Nets expert controls: `coincident-edge-assembly`, `net-reinforcement-settings`, `net-fabrication-settings` |
| Materials | Appearance: `surface-colors`, `surface-opacity`; expert `material-effects-settings`, `effects-bump`, `effects-environmentMode` |
| Import/export | File `open`; export dialog `export-source`, `export-format`, `export-units`, `export-preview`, `confirm-export` |
| Images/media/print | `image`, `png-settings`, `animation-format`, `animation-export`; Nets `net-print`, `net-export-pdf`, `net-paper-settings` |

## Follow-up tranches

The JSON `follow_up` fields are the actionable backlog. Useful first slices are:

- `con-05-cut-transitions`: independent zero/interior/rectify and just-outside
  incidence tables, including preview/adopt/replay, before expanding cut domains.
- `con-07-target-filters`, `con-07-color-coincidence`: exact face-ID/RGBA owner
  tables for static dialog choices before adding attachment presets.
- `stel-01-arbitrary-planes`: mount the existing bounded arrangement engine;
  test three-plane octants, repeated/parallel planes and saved input rows.
- `fac-02-dodecahedron-frontier`: fix the 20-vertex oracle and profile candidate
  generation/pruning; avoid raising a cap without exhaustion evidence.
- `con-09-generalized-domain`: pick one named licensed source and condition;
  specify validity/adoption checks before expanding beyond convex fitting.
- `io-01-dxf-unsupported`, `io-03-legacy-containers`: reconcile baseline acceptance
  before treating every DXF entity or historical format as a required new codec.
- `vis-03-imported-assets`: choose one versioned 3D bump/environment asset type
  with portability, decode bounds and output evidence. Rich 4D optics stay optional.
- `io-04-hardware-calibration`: retain device/driver/paper settings and measured
  100-mm ruler errors; a digital PDF check cannot satisfy this case.

Library/classification crosswalks belong to R5-CORPUS, detailed morph methods to
R5-MORPH-SCOPE, history/migrations to R5-HISTORY and access changes to R5-UX.
No speculative algorithm implementation is requested by this inventory.

## Offline validation and queries

```powershell
python -m pytest tests/test_conformance_inventory.py -q -p no:cacheprovider
python -c "import json,pathlib; p=pathlib.Path('docs/conformance'); m=json.loads((p/'inventory.json').read_text()); print(next(r for r in m['requirements'] if r['id']=='CON-07'))"
python -c "import json,pathlib; p=pathlib.Path('docs/conformance'); cs=[c for f in p.glob('scenarios-*.json') for c in json.loads(f.read_text())['scenarios']]; print('\n'.join(c['id']+': '+c['follow_up']['next_action'] for c in cs if c['implementation'] in ('unsupported','engine-only','unverified')))"
```

The validator checks references, actual fixture selectors, version/category
separation, bounded domains, coverage/indexes, actionable open cases, duplicate
IDs/keys, safe relative paths and rejection of inflated evidence. It requires
neither the installed competitor nor internet access and runs in the normal
Python suite. There is no new Node test or `test:features` registration.
