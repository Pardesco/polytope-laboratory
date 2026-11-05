# Friendly messages (U10)

The footer describes work in plain language: “Analyzing shape…”, “Slicing
shape…”, and “Loaded 1,594 models” (using the actual catalog reply count).
Jobs shorter than the existing 400 ms status delay remain silent. Completion
times appear only above two seconds or while `body.expert-mode` is present.
Toggling Expert tools also updates the current completion time. Hover the
footer for the original completed job label.

After 700 ms of native work, `#job-progress` shows a slim indeterminate activity
indicator beside the existing `#cancel` button, now labeled **Cancel**. No
percentage or estimated completion time is claimed. Cancellation, job ownership,
worker dispatch, and geometry/refusal semantics are unchanged.

Errors use a short explanation first, followed by **Details** and **Copy details**.
Details retain the complete original message, including native/IPC wrappers.
Mappings cover dimension refusals, convex-only tools, W47 input budgets, invalid
OFF/JSON/project files, timeouts, engine startup/exit/protocol failures, busy
workers, numeric input, export failures, permissions, and full disks. OFF line
numbers are shown only when provided by the original error; none are inferred.
Unrecognized errors get a neutral explanation and the original details.

Notifications sit at the bottom right in `#friendly-notifications`, above the
footer and away from the primary toolbar. Success notices (`#success-toasts`)
follow successful save/open/export/recovery status messages and dismiss after
3.6 seconds. Error notices remain until closed or displaced by the stack’s
three-notification limit. Close, Details, and Copy are keyboard accessible;
successes use `role=status`, errors `role=alert`. Reduced motion disables the
activity animation. Details remain usable above an open modal; the stack returns
to the workspace when that dialog closes. The existing `#toast` remains the error-only container so
hidden-mode smokes can continue detecting errors by that ID; original diagnostic
text is still present in its collapsed Details DOM.

`AUDITED_CONTROLS` covers 36 common command, view, selection, construction, and
analysis controls. Disabled buttons/fields receive a title and accessible
description explaining empty workspaces, undo/redo boundaries, exports, missing
cells, projection dimension, pending saves, or missing derived results. Existing
tool-specific W52 explanations take precedence. Original tooltips return when
the control becomes available. Less specific busy/model restrictions retain a
general instruction to finish the current action or check the tool requirements.

Implementation: `ui/friendly-messages.mjs` and `.css`, with small hooks in
`ui/app.js` and optional native-job completion formatting. No dependency, engine,
project format, history, or persisted preference changes are needed.

Validation:

- `node --test tests/friendly-messages.test.mjs tests/native-jobs.test.mjs tests/status.test.mjs`
  exercises label mapping, timing boundaries, real refusal strings, original
  diagnostics, line hints, notification lifetime/cap/accessibility/copy, legacy
  error-container compatibility, activity cleanup, stale completion ownership,
  expert-mode changes, and disabled hints through DOM stubs.
- Related renderer/dispatch regression tests and Vite production build.
- Verified: 547 Node tests, 49 tests in `tests/test_input_robustness.py`, and
  `npx.cmd vite build --configLoader native` passed. Browser preview was blocked
  by sandbox permissions on Playwright's cache.

Limits: progress is indeterminate because native jobs expose no fractional
progress. Unknown specialist refusals require Details. Panel-local diagnostics
that do not use the central `guard`/error path retain their existing wording.
Electron click-through and assistive-technology qualification remain with the
lead’s desktop review.
