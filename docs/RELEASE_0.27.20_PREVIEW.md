# Polytope Laboratory 0.27.20 community preview

An early Windows preview focused on making existing 3D/4D workflows easier to use,
more responsive and more reliable. Feature expansion remains paused.

[Download for Windows x64](https://github.com/Pardesco/polytope-laboratory/releases/download/v0.27.20/Polytope.Laboratory.0.27.20.preview.exe) | [Matching GPLv3 source ZIP](https://github.com/Pardesco/polytope-laboratory/releases/download/v0.27.20/Polytope.Laboratory.0.27.20.source.zip) | [Report a problem](https://github.com/Pardesco/polytope-laboratory/issues)

Run the executable directly. Python and the mathematical dependencies are included;
the application works offline. The source ZIP also contains the existing worked
projects in `examples/0.26`.

## Improvements since the 0.26 public preview

- Common construction and analysis controls come first, with additional numerical
  details and advanced tools available on request. Inspector tabs and the bundled
  Guide follow the task organization.
- Frequent native operations reuse warm workers, reducing repeated Python and
  mathematical-library startup. The first request still pays initialization costs.
- New dual morphs can automatically choose a reciprocal radius that matches the
  source and dual endpoint bounds. Saved projects retain their resolved settings.
- Angle-only rotation avoids repeated full annotation preparation and retains label
  materials, reducing CPU work and shader-program rebuilding. Content changes,
  ordinary displays and capture retain full validation paths.

## Measured rotation improvement

On the tested Windows machine, five annotated Grand hexacosichoron runs per version
reduced median renderer non-idle work during a 1.5-second rotation window from
2,056 ms in 0.27.19 to 521 ms in 0.27.20. Median animation-frame intervals changed
from 31.6 ms to 6.3 ms on that display. These are a specific text-label workload
and machine, not a universal FPS promise or a large-PNG performance measurement.
See the [technical checkpoint](RELEASE_0.27.20_DEVELOPMENT.md).

## Checks and known limits

The actual Windows portable passed with development Python unavailable. Twelve
packaged workflow/portable checks cover annotations, sections, nets/printing,
saved tours, capture recovery, core constructions/history/Save/Open, morphs,
geometry exports, intrinsic feedback and the registered regular-4D catalog.
Thirty alternating rotation profiles compare 0.27.19 and 0.27.20.

This is targeted qualification, not a fully green source regression or proof of
complete mathematical coverage. Fourteen inherited native test expectations were
subsequently reproduced as failing on this sealed source; their corrections and
the broader passing suites belong to unreleased 0.27.21 development. The new
0.27.21 sizing and analysis caches and their timings are not included here.

Some operations remain slow, especially cold requests and dense geometry.
Equal morph endpoint sizes do not guarantee a constant intermediate size: the
Sizing method shrinks its two layers toward the midpoint. Specialized star,
nonconvex and singular inputs retain operation-specific limits. Most geometry
uses floating-point arithmetic. Net layouts can overlap; inspect before printing.
Fresh-user usability evaluation remains outstanding.

## Source and integrity

The downloadable source ZIP is the original sealed source corresponding to the
qualified executable: 2,522 archived source files and 1,878 frozen runtime inputs
were verified. The release tag uses that source snapshot with publication-only
documentation updates. [Source correspondence](RELEASE_SOURCE_PAIR_0.27.20.json)
records the exact assets and documentation differences.

SHA-256:

```text
8be9e68b92f82f8ca605edd1e252b1154d312f231694728619bb569d7fbcea69  Polytope.Laboratory.0.27.20.preview.exe
ff3ed74b608892d26f2d994e501b4efbf5c47a6475c2d9f29c181b51fb9412cf  Polytope.Laboratory.0.27.20.source.zip
```

Both archives retain GPLv3 and third-party notices. This is a community preview;
report reproducible problems with the model, settings and a small saved project.
