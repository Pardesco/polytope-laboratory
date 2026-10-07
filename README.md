# Polytope Laboratory

A free, open-source desktop app for exploring and constructing 3D and 4D polytopes. Browse models, inspect their geometry, experiment with sections and duals, and create printable nets. The app runs offline and is licensed under [GPLv3](LICENSE).

**This is an early community preview, not yet a direct Stella4D competitor.** Stella4D is a reference for the long-term feature scope. The current priority is to make the existing tools easier to use, faster and more reliable; feature expansion is paused.

[Download the Windows x64 preview](https://github.com/Pardesco/polytope-laboratory/releases/download/v0.26.0/Polytope.Laboratory.0.26.0.preview.exe) | [Release notes](docs/RELEASE_0.26_PREVIEW.md) | [Report an issue](https://github.com/Pardesco/polytope-laboratory/issues)

The current preview is **0.26.0**. Run the downloaded executable; a separate Python installation is not required. [Matching source ZIP](https://github.com/Pardesco/polytope-laboratory/releases/download/v0.26.0/Polytope.Laboratory.0.26.0.source.zip).

![Four views of a model in the Windows preview](docs/images/workspace-0.26.png)

## Try it

1. Choose a model from the **Library**. Search by name or use the **3D** and **4D** filters.
2. Drag in the model view to orbit the camera. Use **Fit** to frame the model, or **Rotate** for automatic rotation.
3. Open **Inspector**. **Analysis** contains measurements; **Construct** contains geometry operations. Additional tabs appear for tools supported by the selected model.
4. Choose **Model + derived** in the View menu to compare the source with a section, dual or net.
5. Use **Save** for a native project, which retains documents, construction history and display settings. Use **PNG** to save the current view.

Click **Guide** or press **F1** for the bundled searchable help. For worked examples, extract the source ZIP and use **Open** to load a project from `examples/0.26`. The [example list](examples/README.md) explains what to try in each project.

## What you can explore

- **Models and constructions:** a 3D/4D catalog, local OFF imports, generators, duals, truncations and compounds.
- **Views and sections:** rotation, several projection modes, multiple views, cross-sections and vertex figures.
- **Geometry:** vertex, edge, face and cell selection, measurements and symmetry tools.
- **Paper models:** editable nets, folding previews, glue tabs, page layouts and SVG/PDF output.
- **Projects and animation:** saved construction history, notes, labels, face images, keyframes and PNG/WebM export.

Support depends on the model and operation. A tool being present does not mean it works on every convex, nonconvex, star or singular input. See the [0.26 release notes](docs/RELEASE_0.26_PREVIEW.md) for current limitations and the [technical feature notes](docs/RELEASE_0.26_DEVELOPMENT.md) for details.

## Current limitations

The interface still needs work on control organization, labels and how much information it presents. Some operations and animations are slow. Community reports include dual-operation latency and slow dual morphing with unexpected scaling on a 3D truncated tetrahedron; these are investigation targets, not fixes included in 0.26.

Most geometry and measurements use floating-point calculations. The **Evidence** tab contains technical validation details: a passing structural check is not a proof of every property of a model. Separate exact workflows have their own limits. These details will remain accessible while the everyday interface is simplified.

Some specialized models and operations are incomplete. Dense models can be expensive to display, and net layouts can overlap. Check a layout before printing. Test results for individual workflows do not establish that the entire app is bug-free.

## Development priorities

Feature expansion is paused while we improve the core experience: find a model, view it, inspect it, perform a construction, save it and export a result. We are reviewing each control and data panel for a clear purpose, sensible defaults and placement. Technical diagnostics should be available when needed without dominating routine use.

See the [roadmap](docs/OPEN_SOURCE_ROADMAP.md) and [contributing guide](CONTRIBUTING.md). Useful reports include the version, model, settings, steps, expected result and actual result. A small project file helps us reproduce geometry or performance problems.

## Run from source

For development on Windows x64, use Node.js 22.12 or newer and Python 3.10 or newer:

```powershell
python -m pip install -r requirements.txt
npm.cmd ci
npm.cmd run build
npm.cmd start
```

To build the Windows portable, run `npm.cmd run package:preview`. Third-party data and dependencies retain their own licenses and attribution; see [third-party notices](THIRD_PARTY_NOTICES.md).
