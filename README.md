# Polytope Laboratory

Free, open-source desktop software for constructing and exploring 3D and 4D polytopes. Licensed under [GPLv3](LICENSE).

This is an early community preview. Our goal is broad Stella4D feature coverage; full feature parity is still in development. Bug reports and feature requests are welcome through [GitHub Issues](https://github.com/Pardesco/polytope-laboratory/issues).

## Download

[Download the Windows x64 portable preview](https://github.com/Pardesco/polytope-laboratory/releases/download/v0.25.0/Polytope.Laboratory.0.25.0.preview.exe) or browse the [0.25.0 release](https://github.com/Pardesco/polytope-laboratory/releases/tag/v0.25.0). The portable includes the geometry engine; Python and Node are not required to run it.

[Corresponding GPLv3 source archive](https://github.com/Pardesco/polytope-laboratory/releases/download/v0.25.0/Polytope.Laboratory.0.25.0.source.zip). The binary and source ZIP are the same frozen 0.25 checkpoint. This repository has the same runtime sources, with documentation updated for GitHub publication; see the [source-pair record](docs/RELEASE_SOURCE_PAIR_0.25.json).

## Features

- 3D/4D polytope library, construction, ordered incidence and source-preserving edits.
- Interactive rotation, projection, stereographic viewing and multiple views.
- Sections, duals, measurements, symmetry, stellation and faceting workflows.
- Editable face and cell nets, physical glue tabs, color paper batches and SVG/PDF printing.
- Dual morphs, source-owned text and PNG content, saved animations and tours, PNG frames and WebM video.
- Native projects, notes, history, undo/redo and geometric file import/export.

See [0.25 features and limits](docs/RELEASE_0.25_PREVIEW.md), the [feature roadmap](docs/OPEN_SOURCE_ROADMAP.md), and the [full build specification](STELLA4D_FEATURE_COMPLETE_BUILD_SPEC.md).

Saved folding cameras can clip later poses; review the motion and adjust framing before export. Embedded PNG annotations can be omitted from printed net PDFs in this preview; use SVG when the images are required. The print-window fix is in 0.26 development. Some advanced generalized, infinite and hemi operations remain unavailable or report explicit diagnostics. Please include the model/project and steps to reproduce when reporting an issue.

## Build from source

On Windows x64, install Node.js 22.12+ and Python 3.10+, then run:

```powershell
python -m pip install -r requirements.txt
npm.cmd ci
npm.cmd run build
npm.cmd start
```

To package the portable, run `npm.cmd run package`. All geometry work happens locally; no account or server is required. See [CONTRIBUTING.md](CONTRIBUTING.md) for development details and focused verification.

## License and acknowledgments

Program code is [GPL-3.0-only](LICENSE). Catalog data, dependencies and other third-party materials retain their attributed licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and [third_party_licenses](third_party_licenses).
