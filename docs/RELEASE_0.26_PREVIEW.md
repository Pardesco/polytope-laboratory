# Polytope Laboratory 0.26.0 preview

An early Windows preview for exploring and constructing 3D and 4D polytopes. It is not yet a direct Stella4D competitor. The interface, performance and support for specialized geometry still need work.

[Download for Windows x64](https://github.com/Pardesco/polytope-laboratory/releases/download/v0.26.0/Polytope.Laboratory.0.26.0.preview.exe) | [Matching GPLv3 source ZIP](https://github.com/Pardesco/polytope-laboratory/releases/download/v0.26.0/Polytope.Laboratory.0.26.0.source.zip) | [Report a problem](https://github.com/Pardesco/polytope-laboratory/issues)

Run the downloaded executable. Python and the mathematical dependencies are included. The app works offline.

## What changed in 0.26

- **More 4D sections:** slice supported 4D models with ordinary 3D cells, including concave cells. Sections can contain separate regions or holes. Source labels follow the section; face images are supported when a whole source face survives the cut.
- **Dual-morph animation export:** save a morph-ratio track and export it as a PNG sequence or WebM video for supported morphs. Eligible source labels and face images follow the animation.
- **Export framing:** use **Fit export frames** to choose a camera that contains the geometry across the sampled animation frames.
- **Paper-model assembly:** choose how supported pieces join along coincident edges, edit glue tabs and supports, and export SVG/PDF. Face images now appear in net PDF output.
- **Projective duals:** inspect wireframe duals with vertices at infinity. A clipping control determines how much of the infinite geometry is displayed.
- **Catalog and analysis tools:** additional snub mirror forms and symbol search, a separate Skilling model, signed winding and algebraic measurements for supported 3D models, 4D arrangement comparisons, and distances to bounded concave faces.

The [technical feature notes](https://github.com/Pardesco/polytope-laboratory/blob/main/docs/RELEASE_0.26_DEVELOPMENT.md) explain the supported inputs and mathematical definitions.

## Try an example

The source ZIP includes nine projects in `examples/0.26`. Extract it, launch the preview and use **Open** to load a project. The [example list](https://github.com/Pardesco/polytope-laboratory/blob/main/examples/README.md) includes instructions for each one. The executable can run without the example files.

For a first look, select a model from the Library, drag to orbit, use **Fit** to frame it, and open **Inspector** for measurements and constructions. Click **Guide** or press **F1** for help.

## Known limitations

- **Usability and speed:** control organization and documentation need improvement. Community reports include dual-operation latency and slow dual morphing with unexpected scaling on a 3D truncated tetrahedron. These reports still need reproduction and measurement; 0.26 does not include fixes for them.
- **Geometry support:** some star, self-crossing, nonconvex and singular inputs are unsupported. General star-cell sections and unrestricted nonconvex 4D distances remain incomplete. Infinite duals have a wire display, but no filled faces, nets or morphs.
- **Mathematical results:** most calculations are numerical. Structural validation is a set of checks, not a general mathematical proof. Algebraic volume counts signed contributions and is not necessarily the volume of the filled union.
- **Catalog coverage:** the catalog is incomplete and does not represent every uniform 4-polytope.
- **Testing:** the Windows executable was checked with development Python unavailable, and selected geometry, saving and export workflows were tested. The preview has not passed a complete regression of every feature.

## Next priority

Feature expansion is paused while we simplify the interface, reduce unnecessary visible data, investigate performance and morph scaling, and improve reliability in common workflows. See the [roadmap](https://github.com/Pardesco/polytope-laboratory/blob/main/docs/OPEN_SOURCE_ROADMAP.md).

For bug reports, include the model, settings, steps, expected result and actual result. Attach a small project when possible. The program is GPL-3.0-only; [third-party notices](https://github.com/Pardesco/polytope-laboratory/blob/main/THIRD_PARTY_NOTICES.md) cover included data and dependencies.
