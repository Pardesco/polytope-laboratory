# Animated tour rendering adapters

`ui/animated-tour-timeline.mjs`, `ui/animated-tour-renderer.mjs`, and
`ui/animated-tour-export.mjs` provide an absolute-time planner, two independent
live model previews, and capture of their composed canvas. They are mounting
building blocks; native v2 validation and app controls are separate integration
work. This document does not claim completion of ANIM-03 or Stella conformance.

The [author's Tours manual](https://www.software3d.com/Manual/Tours.php) describes
events with saved models, layouts, animation, outgoing transitions, separate
hold/transition durations, and video export. It also specifies inherited layout
and animation rates and selection of multiple events. Inheritance, multi-event
editing, morph animation, and `.tour` compatibility remain open here. No newer
Stella installation or purchase is required for this implementation.

## Saved data and time

The v2 envelope is `{version:2,events,cursor}`. Each event is exactly
`{id,state,duration,transition}`. Its complete source snapshot retains model
coordinates, ordered incidence, RGBA, units, notes, offline metadata, and inert
operation ancestry. Hold duration excludes the outgoing transition duration.
Legacy v1 instant tours migrate to detached v2 planner records without modifying
the stored source. Native validation must independently validate all snapshots.

Prepare once with `prepareAnimatedTourTimeline(tour,{loop})` and evaluate with
`evaluateAnimatedTour(timeline,absoluteSeconds)`. A hold advances the event's
saved rotation, section-depth, explosion, and qualified rigid face-net folding
sequence. Non-loop sequences stop at their endpoint; saved looping sequences
wrap. During transitions the outgoing event holds its terminal hold pose and
the incoming event holds its initial pose. This is an explicit interpolation
policy, not a claim about Stella's animation during a fade. A final outgoing
transition is included only when looping to event zero.

The timeline has no dependence on the previous frame or requested FPS. Sparse
seeks reproduce the same pose. Timeline limits are 100 events, 200 intervals,
366000 seconds, 32 MiB per event, 128 MiB of saved events, nesting depth 64, and
eight million JSON values. Loss of a positive interval through Float64 addition
is diagnosed instead of silently making the interval unreachable.

## App factory contract

Construct `AnimatedTourRenderer` with the following context:

```js
new AnimatedTourRenderer({
  tour, loop, canvas, createCanvas,
  getOwner: () => ({project, tour: project.tour, sourceState, document}),
  createLayer: async ({slot, getState, width, height, isCurrent}) => ({
    viewer, netViewer,
    prepareLayout: async (view, {signal, isCurrent}) => {},
    run: async (op, params, model, label, {signal, isCurrent}) => {},
    refreshSection: async ({signal, isCurrent}) => {},
    refreshDerived: async ({signal, isCurrent}) => {},
    syncPose: view => {},
    showNet: pose => {},
    dispose: () => {}
  }),
  onPresent: publication => {},
  onDiagnostic: message => {}
})
```

`getState()` is initially null and later returns an adapter-owned detached event
preview. Callbacks must operate on that private state, never the app's source
document. All four possible viewers and their WebGL canvases must be distinct.
Each viewer must expose the actual Three group, normal Viewer methods, and
strict `prepareCapture({signal,isCurrent})`. Explosion and folding require
the existing advertised capabilities. Native `run` implements existing `net`
and `cell-facing` contracts; callbacks must check both cancellation and
ownership before native work and immediately before publishing derived results.

`prepareLayout` is awaited after assigning the preview state and before
`setModel`; it is also awaited after applying each track pose, before fine
capture. Folding can change a captured single layout to split. Size each real
pane to `width/(split ? 2 : 1)` by `height`, update container CSS and explicitly
resize its Viewer, and preserve saved camera settings. The hook may no-op
unchanged layouts. Stretching full-aspect sources into half-width destinations
is not an acceptable substitute. Context disposal removes observers, controls,
canvases, GPU resources, and owned WebGL contexts; it must leave app viewers
untouched.

Both source canvases have transparent backgrounds. The final 2D canvas and its
separate staging canvas are bounded to 4096 by 4096 pixels. Single layouts copy
one pane; split layouts copy base and derived panes side by side. Outgoing and
incoming sources are rendered afresh, transformed in their actual Three groups,
and composited in event order with transition opacity. The completed staging
canvas is copied atomically to the displayed canvas only after every layer's
fine capture has passed. These are live animated scenes, not cached event
screenshots. The two event scenes do not mutually depth-test against each other.
The compositor is read-only; transition picking is not qualified.

Supported transition presentation comprises sideways/orbit motion, scale,
spin, opacity, and supported radial explosions, including validated
combinations. Radial transition explosions combine multiplicatively with a
saved radial track: `(1 + amount) * factor - 1`, bounded to amount 10. A saved
normal explosion combined with a radial transition, fold combined with entity
explosion, unsupported generalized entity directions, and excessive amounts
are diagnosed. Their saved data remain readable. There is no vertex morph.

`apply(time,{signal})` resolves a complete publication. `current(publication)`
checks whether that publication still owns the current fine pose, and
`image(publication)` returns its PNG. `cancel()` invalidates pending poses;
`await close()` drains pending providers and disposes private previews. Only one
active and one latest queued request are retained. An obsolete provider that
ignores abort cannot publish, but disposal must wait for it to settle.

## Control hooks and source ownership

The app supplies Play/Pause/Seek/Loop and export controls. Playback uses an
elapsed-time origin, such as `performance.now() - startTime * 1000`, and passes
elapsed seconds to `apply`. Await one request before scheduling the next to
avoid starving strict fine capture by retiring every pose. Skipped elapsed
frames do not change the animation. Pause cancels pending work and leaves the
last displayed composite. Stop closes the adapter, removes the overlay, and
reveals the untouched source viewport. Escape, source/workspace changes,
project/tour edits, and app shutdown must cancel/close the adapter.

The owner fence retains project, tour, source-state identities and the source's
complete JSON attributes, including its view. Optional document ownership also
checks document reference, ID, states array, and cursor. Do not write the saved
tour cursor or source view while the renderer is active; update a transient UI
selection from `onPresent`. Commit persistent cursor edits after stopping, or
create a new renderer. Private model edits, notes edits, camera drift, and
output resize invalidate exact capture. New user source/view changes are never
overwritten by restoration. Native cache preparation is retained across event
revisits; native descriptor and radial resolver pools are each capped at 128 MiB.

## PNG and WebM capture

Construct `AnimatedTourExporter` with `{renderer,api,onProgress,
onExportStateChange,onDiagnostic}`. The native API is the existing
`animationBegin`, `animationWrite`, `animationFinish`, and `animationAbort`.
Call `export('png'|'webm',{fps,name})` and `cancel()` for cancellation.
`onExportStateChange` must disable ordinary app/tour edits and other exporters;
editing the owner must abort the active export before disposal. Export awaits
the renderer's complete fine current pose before every PNG or recorder copy.

PNG uses the existing uniform `i/fps` native manifest grid plus the exact final
endpoint. It does not insert arbitrary event boundaries that would make that
manifest false. Current native limits cap capture at 300 seconds and existing
sequence frame/FPS limits. Longer tours remain readable. WebM uses the existing
cold-start-safe recorder and encoder-drain path; it is real-time recording, so
slow rendering can lengthen its encoded duration. It does not promise
deterministic video timestamps or compression bytes.

Cancellation aborts preparation, recorder work, and native staging. The last
composite time is restored only while source ownership still matches. Once
native `animationFinish` commits an output, cancellation during its response
cannot guarantee rollback of the committed file; the current native API has no
source-ownership commit token. Do not report committed-file rollback as proven.

## Verification and remaining gates

Headless tests cover 25 timeline cases, 20 renderer cases, and nine export cases.
Renderer fixtures use actual Viewer prototype methods, Three cameras/buffers/
materials, rigid folding, explosion geometry, production stereographic Worker
jobs, and held asynchronous completion. Independent checks cover literal cube
rotation, radial displacements, derived section planes, split sizing, source
RGBA/units/notes, repeated seeks, cancellation, stale poses/cameras, and close.
Canvas copy operations are recorded by fixture contexts; this is not GPU pixel
or browser encoder proof. Export tests qualify native option/grid semantics,
staging ordering, incomplete capture refusal, existing EBML encoder logic,
write failures, and restoration with a controlled recorder.

Actual app mounting, native v2 envelope/storage validation, real browser
multi-scene GPU pixels, saved source project reopen, and decoded WebM endpoints
remain release gates. Inherited layout/rates, animated morphs, transition picks,
cross-scene depth intersection, more than two event layers, legacy proprietary
tour compatibility, and complete ANIM-03 parity are not qualified by these tests.
