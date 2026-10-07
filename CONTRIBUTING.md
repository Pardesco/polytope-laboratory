# Contributing

Polytope Laboratory is being developed as a free, open-source desktop program.
Our immediate target is broad, usable coverage of Stella4D workflows. Remaining
bugs and uncommon cases can be reported through GitHub issues.

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
behavior, and actual behavior. A small project or geometry file helps reproduce
geometry problems. Include a screenshot for display problems.

## Geometry changes

Keep intrinsic geometry separate from display geometry. Preserve ordered
incidence, source element references, colors, units, and history when the
operation permits it. Document unsupported domains and resource limits.

The current development handoff reserves `engine/__init__.py`,
`engine/formats.py`, and `engine/geometry.py`; extend functionality in separate
modules until that reservation is explicitly lifted.
