# Fresh-user observation: core workflows

Prepared October 24, 2026. **No participants have been observed yet.** This is a
ready-to-run protocol for the roadmap's remaining usability work, not evidence
that the interface passes it. Start after the chosen build's packaged checks
pass. A separate baseline session can use qualified 0.27.20; label it explicitly
and do not attribute its observations to 0.27.21.

## Session setup

Use two or three people who have not used Polytope Laboratory. Record each
person's familiarity with duals, sections and nets; distinguish unfamiliar
mathematics from difficulty using the interface. The first round is qualitative
and does not establish population-wide success rates.

Use an isolated test profile and a new scratch folder. Record the app version,
portable SHA-256, Windows/display size and whether this is a baseline or candidate
session. Start with the normal Library view. Leave the bundled Guide available.
Allow the person to think aloud. Read each goal without naming its controls.
Record an unassisted result before giving any hint; keep hints and post-hint
outcomes separate.

## Tasks

| Task read to the participant | Observe | Moderator reference, after the unassisted attempt |
| --- | --- | --- |
| Open a cube. Find the length of one edge and tell me its displayed units. | Search/filter choices, picking mode, measurement discoverability, unit interpretation. | Library cube; entity selection/inspection and measurement tools; unit settings. |
| Make the cube's dual, then return to the original cube. Tell me what changed. | Construct versus view distinction, result feedback, Undo/history discovery, preserved source expectation. | Construct dual; Undo or source history. Verify the source's geometry/notes were retained. |
| Open a tesseract and show a cross-section next to the model. Move the cut to another position. | Meaning of Model + derived, section mode, plane/depth controls, focus and response while native work runs. | View layout plus derived section controls. The source stays 4D and the ordinary cut is 3D. |
| Open a truncated tetrahedron. Make it morph into its dual and pause halfway. Before playing, describe the size you expect; afterward, describe what you saw. | Finding Dual morph, automatic radius, method wording, pause/scrub/replay, whether the smaller sizing midpoint feels intentional or broken. | Dual morph sizing, blank reciprocal radius, Apply/Play and ratio scrub. Equal endpoint bounds do not imply a constant intermediate bound. Do not coach that explanation beforehand. |
| Save the project with a short note. Reopen it and confirm which model, construction history and morph pose survived. | Save versus geometry export, file naming, save status, Open behavior, notes/history confidence. | Native Save/Open retains project state. Compare reopened data with the saved file; do not judge preservation from the title alone. |
| Make a printable net for a cube and save a PDF or SVG. Tell me whether anything needs checking before printing. | Net discovery, overlap/tab/page feedback, export target and success feedback, camera recovery after cancel or export. | Net workflow and export review. Inspect page layout/overlap feedback and reopen the exported artifact. |

Allow roughly three minutes per ordinary task and five for morph or net export.
Record time to first relevant action and time to completion separately. Stop a
task if the person is stuck and asks to move on; record the blocker and any
assistance. Avoid converting a stalled attempt into an unassisted success.

## Observation record

Create one record per task using anonymous participant IDs:

```text
Participant / prior mathematical familiarity:
Build version / SHA-256 / display size:
Task:
Expected behavior, in the participant's words:
First relevant action time / completion time:
Unassisted result: completed / partial / not completed
Observed route and hesitation points:
Exact confusing label or feedback:
Hints given, if any / assisted result:
Actual saved or exported artifact, if applicable:
Reproducible defect or performance observation:
Suggested follow-up, linked to the observed problem:
```

For a reported defect, retain a small project and exact steps. Distinguish a
visible delay, input lag, native calculation time and animation cadence. For
morph scaling, retain the method, center, resolved radius, ratio and camera;
the description alone cannot establish which behavior was observed.

## Choosing the next change

Summarize task completion, repeated hesitation points and concrete defects.
Prioritize data loss, blocked completion and misleading feedback, then recurring
navigation/wording friction. Link each proposed interface edit to an observation
and recheck the affected task afterward. Keep access to mathematical definitions
and detailed evidence, with common actions easy to find.

Do not treat a short successful session as full product qualification or as a
reason to resume deferred feature stages automatically. The roadmap also
requires the outstanding performance investigations and packaged workflow gates.
