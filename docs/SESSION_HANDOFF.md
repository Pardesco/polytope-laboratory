# Published checkpoint ? October 24, 2026

The public community preview is 0.27.20. See [release notes](RELEASE_0.27.20_PREVIEW.md)
and [source correspondence](RELEASE_SOURCE_PAIR_0.27.20.json). This tag contains
the sealed qualified 0.27.20 runtime. Later 0.27.21 development remains local and
unqualified. Text below is the preserved historical local checkpoint.

# Superseded by the October 22, 2026 checkpoint

Start with [HANDOFF_0.27.19.md](HANDOFF_0.27.19.md) and
[CLAUDE_REVIEW_0.27.19.md](CLAUDE_REVIEW_0.27.19.md).
The current verified local preview is 0.27.19; production remains 0.26.0.
The older session text below is preserved as history. Its integration instructions
are superseded by the core-workflow roadmap and the new paused handoff.

# Current priority - October 7, 2026

The current direction is to pause feature expansion and improve the core
experience: simplify controls and visible data, measure and improve performance,
investigate reported dual-morph scaling, and verify common workflows. Follow
[the roadmap](OPEN_SOURCE_ROADMAP.md) and [interface contribution guidance](../CONTRIBUTING.md).
The feature-expansion instructions below are historical and are superseded by
this direction. Existing staged features remain deferred.

## Current 0.27 implementation

Working sources are now 0.27.0. The first core-experience pass adds a task-based
Inspector, collapsed numerical reports, warm workers for frequent calculations,
and a source-size default for new dual morphs. See [0.27 development notes](RELEASE_0.27_DEVELOPMENT.md).
The reviewed local portable is `release/preview-0.27.0-reviewed/Polytope Laboratory 0.27.0 preview.exe`.
GitHub's public executable remains 0.26.0; public documentation was updated at
`0a6d371f17c9b3df447141e2f9c40fe5bec196dc`. Runtime changes have not been published.
The staged feature additions remain deferred. Older instructions to integrate
those stages are historical and must not drive the next task.

Next work: measure visible-window rendering, test common workflows with users,
and further simplify task organization. The hidden playback test has a slow
scheduling cadence; its engine timings do not imply a measured rendering FPS.

## Previous development checkpoint - October 7, 2026

Read [NEXT_SESSION.md](NEXT_SESSION.md) first. It is the authoritative resume
handoff for the October 7, 2026 stopping checkpoint requested by Randall.

The 0.26 Windows portable and matching GPLv3 source are published on GitHub.
Production remains 0.26.0. Star vertex-figure completion, symmetry orbit coloring
and D4 Waterman are READY/frozen in isolated stages and are not mounted or shipped.
Next session should bump to 0.27 and integrate them one at a time.

The feature-complete goal is unfinished and paused at Randall's request.
The detailed handoff records release links, hashes, evidence, pending checks,
exact mount commands, protected files and separate public/development Git ancestry.

Earlier prose is retained in
[the historical handoff](history/session-handoff-before-2026-10-07-stopping-point.md).
Its active-development instructions are superseded by this checkpoint.
