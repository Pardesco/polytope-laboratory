# Contributing

Polytope Laboratory is a free, open-source desktop program in an early preview
phase. Feature expansion is paused while we improve usability, performance and
reliability in the existing tools. See the [roadmap](docs/OPEN_SOURCE_ROADMAP.md).

## Interface changes

Start with a task a person is trying to complete. Review each proposed control
or data panel against these questions:

- Does it help the user take an action or understand a result?
- Does it need to be visible at this point in the workflow?
- Can a sensible default or information shown on request reduce the work?
- Are its name, position, units and behavior clear and consistent?

Group controls by task. Show advanced settings and technical diagnostics on
request. Explain limitations that affect the current action where they occur,
with enough detail to choose the next step. Preserve access to mathematical
definitions and validation details; avoid using raw JSON as the everyday
explanation of a result.

Describe the task and how the change makes it easier. Verify the affected
workflow in the app, including ordinary keyboard use and relevant display sizes.

## Development

Use Windows x64, Node 22.12 or newer, and Python 3.10 or newer:

```powershell
python -m pip install -r requirements.txt
npm.cmd ci
npm.cmd run build
npm.cmd start
```

Keep changes focused. Run the build and checks relevant to the behavior you
changed. Full regression and exhaustive comparison runs are optional during
feature development; use them when investigating a regression or preparing a
stable release.

## Reporting bugs

Include the application version, operating system, steps to reproduce, expected
behavior, and actual behavior. Include the model and settings. A small project
or geometry file helps reproduce geometry problems. Include a screenshot for
display problems. For usability reports, explain what you were trying to do
and which label, control or step caused confusion. For performance reports,
include the elapsed time and computer specifications when available.

## Geometry changes

Keep intrinsic geometry separate from display geometry. Preserve ordered
incidence, source element references, colors, units, and history when the
operation permits it. Document unsupported domains and resource limits.

The current development handoff reserves `engine/__init__.py`,
`engine/formats.py`, and `engine/geometry.py`; extend functionality in separate
modules until that reservation is explicitly lifted.
