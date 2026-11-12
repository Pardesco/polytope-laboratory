# X6 integration qualification

Round 7 repairs for the merged Round 5/6 baseline. No native operation,
algorithm version, project schema, source ownership fence or numeric claim changes.

1. Guide: registered explicit contexts for all twelve missing named disclosures:
   Appearance cell/effects groups, memory blend, arbitrary stellation planes,
   face subgroups, Waterman 4D/sequence, Goursat star polychora, fabrication
   measures/presets/custom and hinge strips. Goursat opens Star polychora help;
   the other groups use their existing task topics. The mounted Guide test now
   passes unchanged, including Help/Ctrl+K live command and shortcut indexes.
2. The disclosure inventory test retains its complete scanner and valid-topic
   requirements; a task-specific Goursat context assertion was added.
3. Uniform compound history test: updated its HistoryControls mock with
   `getDocument`, Check support and support-status elements. Production already
   supplies these in `ui/app.js`; removing the document lookup would defeat
   source-owned history-support reports. No production history guard changed.
4. Section choices: isolated runs initially passed; the exploratory full run
   exposed an intermittent missing promoted-history graph on the star case.
   After the final non-resizing notification placement and disclosure timing
   corrections, the existing test passes for separated cubes, the concave
   L-prism product, Grand hexacosichoron and unsupported density refusal,
   including two additional consecutive runs. No density kernel or promotion
   receipt was changed. Added assertions for all four current choices, including
   `winding-cells`, disabled on 3D sources, and a diagnostic assertion for the
   required saved history graph. Ordinary/global-density history checks remain;
   independent winding-cell geometry has its existing native/mounted suites.
5. Prism replay: the failing test expected an implicit branch upgrade to 0.2.0.
   This expectation predates the immutable version policy in HISTORY_SUPPORT.md
   and conflicts with test_history_migrations.py. Updated the test to require
   legacy 0.1.0 generalized interpretation and full canonical geometry equality
   to the retained kernel, preserving the original document. A separate current
   construction assertion still requires convex classification, one component
   and positive content. Changing production branching would break compatibility;
   no geometry validation or version check was relaxed.
6. Notifications: the fixed bottom-right stack introduced by FriendlyMessages
   could cover derived/section controls. It now anchors inside the primary model
   viewport, above the bottom hint/count area, with bounded scrolling. Text and
   backgrounds pass pointer events through; Details, Copy, Close and selectable
   technical text remain interactive. Modal errors stay inside the open dialog
   and return to the model viewport when it closes. Section errors retain their
   original technical details. Notices do not resize the viewport or change PNG
   capture dimensions: the full suite caught that regression in an initial
   flow-based placement, and the unchanged environment pixel-equality test
   qualifies the final placement.
7. Timeline: every sync derives `hidden` from Animation/Tour disclosure `open`
   state once a source exists. A temporary empty source can hide the panel;
   restoring the source with either disclosure open restores it without another
   toggle event. An observer of just the two `open` attributes synchronizes
   visibility before the queued native toggle event, so the smoke's immediate
   visibility check also holds. Repeated syncs do not rewrite unchanged attributes.

The first full Node run also exposed two additional merged UI timing defects:
Appearance reserved its sheet width only after the queued toggle event, and
first-use 3D face nets captured view ownership before the split-view resize's
automatic camera fit. Appearance now observes only its disclosure's `open`
attribute and uses its existing idempotent layout function. Face-net evaluation
calls the same synchronous `prepareLayout` hook already used by cell nets before
capturing ownership. Native/source/view/history checks remain unchanged. Existing
smoke-compat and R6 normal/hidden follow-up tests pass without edits; an additional
regression verifies that a later camera edit still refuses face-net publication.

UI click-through: Inspector / section controls (`derived-mode`, `section-normal`,
`apply-section`, `section-events`, `section-density-mode`); error Details/Close
inside `friendly-notifications` over the model canvas. Workspace shelf Animation (`animation-settings`)
and Tours (`tour-settings`) open `timeline-panel`. Close Timeline remains
`timeline-close`. Help buttons on the named disclosures retain their original IDs.

`tests/x6-integration-mounted.test.mjs` runs Vite/Chromium with the real Python
JSON-lines engine. It checks a zero-normal refusal with expanded Details at
1500px and 1100px widths using pointer hit testing and actual section clicks,
modal error return, a held PNG write canceled by a document switch, aborted
staging without finish, Animation/Tour visibility, keyboard Undo/Redo, explicit
close, and temporary empty-source recovery with idempotent visibility writes.
The export transport is a deterministic stub; native export filesystem behavior
remains covered by existing tests and desktop smokes.

Changed files: `ui/guide-refresh.mjs`, `ui/friendly-messages.mjs`,
`ui/friendly-messages.css`, `ui/timeline-panel.mjs`, `ui/appearance-sheet.mjs`,
`ui/net-editor.js`, one additive context property in `ui/app.js`, `package.json`,
`tests/user-guide.test.mjs`,
`tests/uniform-compound-controls.test.mjs`, `tests/section-choices-mounted.test.mjs`,
`tests/test_construction_families_workflow.py`, this note and the new
`tests/x6-integration-mounted.test.mjs`.

Validation:

- Full Python: `python -m pytest tests -q -p no:cacheprovider -x` — 7,233 passed,
  96 subtests passed, one skipped (Windows has no POSIX named pipes), 1,403.54s.
  The requested `--timeout 0` was unavailable because pytest-timeout is absent;
  the command above ran the complete suite without that option.
- Focused native construction/history/section suites — 303 passed and 13
  subtests passed.
- The four named Node files run individually: Guide mounted 1, user guide 5,
  uniform compound controls 12, section choices mounted 5; all passed. Section
  choices also passed two consecutive additional runs after final layout fixes.
- Notification unit tests, native environment pixel equality and mounted X6
  regression — 47 passed before adding the separate face-net ownership case.
- Final X6 regression file — 4 passed. Layout/net/expression/smoke compatibility
  focused group — 49 passed. Timeline/V4/X6 focused group — 23 passed before
  adding the separate face-net ownership case.
- `npx.cmd vite build --configLoader native` — passed; existing large-chunk
  warning remains. `git diff --check` — passed.
- Final `npm.cmd run test:features:run` — 3,412 passed, zero failed/skipped,
  665.97s, including the existing face-fill script checks. The first exploratory
  full run had 3,405 passed and six failures (including parent/subtest counts);
  its findings drove the capture-size, Appearance and net-layout corrections
  described above. The final run includes the new face-net ownership regression.

Logs are in ignored `artifacts/x6-*.log`. Electron was not launched; the lead
must rerun section-workflow and animation desktop smokes. Native export dialog,
staging/filesystem publication and actual Electron render timing are not
qualified by the stubbed export transport in the mounted X6 test.
