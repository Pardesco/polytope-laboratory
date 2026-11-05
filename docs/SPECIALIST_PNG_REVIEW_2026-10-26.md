# Specialist PNG destination review — October 26, 2026

Resumed after the overnight integration. Completed the specialist PNG follow-up
identified in the October 25 paused handoff.

Multiple-view grid and projective reciprocal PNG saves now use the existing
begin/write/abort image export bridge. After the destination chooser returns,
their own source and display checks run before issuing the atomic write. Closing
either specialist view aborts its pending destination request; a late chooser
result cannot publish. Grid export retains its observation-control restoration
and saved maximized layout. Projective export also checks its independent camera
and rejects duplicate exports. Legacy bridge callers retain their existing API.

Changed: ui/image-capture-session.mjs, ui/app.js,
ui/multi-view-controls.mjs, ui/projective-dual-controls.mjs, and the three
corresponding existing test suites. No native engine or main/preload changes.

Verification:

- 56 tests pass across image-capture-session, multi-view-controls,
  projective-dual-controls, image-export, png-capture-options and
  animation-export-capture. Includes real filesystem/preload/main handler checks
  for preserved destination bytes, canceled and late chooser results, and retry.
- Production build passes (293 modules; existing large-chunk warning).
- `node scripts/core-experience-smoke.cjs` could not launch the app: Windows
  denied the Electron sandbox token access to node_modules/electron/dist
  (install_dir_access.cc:52). No ACL change or sandbox workaround attempted.
  This run supplies no desktop or native chooser qualification.

Version remains 0.27.21. No commit, package or publication. Existing overnight
packages predate this change. Formal release qualification, native chooser
checks, clean-machine installation and fresh-user observation remain pending.
