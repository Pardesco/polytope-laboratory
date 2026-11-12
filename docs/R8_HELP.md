# R8 contextual help (DESK-01)

The merged baseline already contained the nine Round 6 direct registrations
reported missing by the pinned audit. This change qualifies those routes,
updates their instructions to the current controls, and adds specific Round 7
topics. It does not duplicate the existing mathematical features.

Open **Help → Guide**, search a task, press **F1** on its field, or click **?**
in a disclosure heading. Construct tools use the **?** in their visible pane
header; their original top-level disclosure summaries stay hidden. All routes
below are tested with Expert off.

| Disclosure IDs | Help topic / click location |
| --- | --- |
| `stellation-arbitrary-settings`, `stellation-face-subgroup-settings` | `stellation-diagrams`; Construct → Stars & facets → Stellate / Interactive stellation diagrams |
| `waterman4-settings`, `waterman4-sequence-settings` | `generator-options`; Construct → Create a new shape → Waterman hull → Waterman polychora |
| `goursat-wythoff-settings` | `wythoff-generation`; Construct → Create a new shape → Goursat / Wythoff stars |
| `fabrication-measure-options`, `fabrication-presets`, `fabrication-custom` | `paper-assembly`; Nets → Measurements and reinforcement |
| `hinge-strip-settings` | `paper-assembly`; Nets → Dihedral hinge strips — corner clearance |
| `library-classification` | `classification-evidence`; Library → Specialized relationships |
| `library-symmetry-evidence` | `symmetry-evidence`; Library → Symmetry — release evidence |
| `library-corpus` | `corpus-evidence`; Library → Corpus coverage |
| `corpus-goursat-h4-stars-1`, `corpus-schwarz-wythoff-u63` | `wythoff-generation`; generated tranches inside Corpus coverage |
| `vertex-figure-construction-settings` | `vertex-figure-completion`; Construct → Create a new shape → Vertex-figure construction |

Anonymous evidence and Next queue disclosures inherit their registered owner.
In the Goursat and vertex-figure panes, the nested evidence disclosure is
displayed as **More options**; its original description is retained in its title.
Library disclosures now receive the same automatic help buttons and guarded,
idempotent disabled-button repair as Inspector disclosures. No existing IDs or
feature handlers are moved or recreated.

The mounted native check also exposed a merged dispatch regression:
`symmetry-qualification` imported its handler without returning it. One added
return restores the already registered operation; its existing native
JSON-lines test verifies the source-bound response.

Definitions and limits in the help remain explicit: arbitrary-plane completion
concerns a finite observation box; Waterman site membership is rational while
its hull is numerical; hinge setback is corner clearance without material
compensation; vertex-figure completion searches a finite candidate domain.
Classification and symmetry receipts retain residuals, source/implementation
pins and unresolved verdicts. None is an exact certificate or release approval.

Local regression scenarios closed (these are R8 test IDs, not newly invented
benchmark inventory entries):

- `desk-01-help-r6-topics`: all nine direct mappings and visible help paths.
- `desk-01-help-r7-evidence`: classification, symmetry, corpus/generated
  tranches, vertex-figure domain and nested evidence; focused-field F1 and
  idempotent Library button repair.
- `desk-01-help-fallback`: an unregistered disclosure inherits its owning tab;
  an unrelated focused control opens usable Getting started help.

Validation uses `tests/guide-mounted.test.mjs`, `tests/user-guide.test.mjs`,
`tests/help-scope.test.mjs`, `tests/discoverability.test.mjs`, the existing
common/hidden reveal suites, and `tests/test_symmetry_qualification.py`.
The mounted tests retain complete explicit-topic coverage and verify that help
leaves model name, document count and history unchanged. Production bundling
uses `npx.cmd vite build --configLoader native`.

Verification receipt: 23 Python tests passed; 26 guide/common/reveal Node tests
passed; 66 discoverability/symmetry/allowlist/pool/hidden-policy Node tests
passed; the six hidden smoke-compatibility checks passed. The first combined
reveal run had timing failures; all affected files passed on the bounded-thread
rerun without assertion changes. Vite production bundling passed with the
existing mixed Viewer import and large-chunk warnings. No new test file or
package-script registration was needed.

DESK-01 remains subject to shipped desktop, DPI, accessibility and native-dialog
qualification. No Electron app or hardware was launched for this package.
