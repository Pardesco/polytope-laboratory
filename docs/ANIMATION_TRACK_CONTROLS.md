# Qualified explosion and folding controls

Version 0.12 extends the existing animation shelf with normal/radial explosion endpoints, current explosion/fold poses and rigid 3D face-net folding. Both development and unpacked packaged desktop workflows passed 13 checks, including actual PNG and decoded offscreen WebM endpoints. The packaged run deliberately disabled development Python. Saved version 1 rotation and section sequences retain their rendering path and all 17 original tests.

The controls require actual capabilities supplied by the application, plus an asynchronous `renderTracks` callback. A saved version 2 sequence remains intact and reports an unavailable-renderer diagnostic when a required capability is missing. Presence of a method name alone is not sufficient evidence of implemented rendering; the application supplies qualified flags.

## Context

| Context field | Contract |
| --- | --- |
| `capabilities()` | Returns `{explosion:true,fold:true}` only for implemented viewport adapters. |
| `loadPlanes(model,{signal,isCurrent})` | Native plane acquisition from a detached source; checks cancellation/source before returning. |
| `loadNet(model,{signal,isCurrent})` | Native face-net acquisition using the source's saved net settings; returns the actual reconstructable descriptor. |
| `renderTracks(pose,{signal,isCurrent})` | Applies the complete detached view and actual presentation, checks `isCurrent` immediately before publication, and resolves after drawing and any strict section computation. |
| `netViewer` | Face-net capture viewport; the existing `sectionViewer` is a fallback. |
| `showNet()` | Synchronizes Compare presentation without overwriting qualified pose view fields. |

The other existing version 1 context methods remain unchanged. The renderer must reject an unsupported `setExplosion` result rather than allow capture to continue. On a fold, use the owned immutable `pose.foldNet`, set the rigid fraction and then restore evaluated angles after the existing fold method resets them. `pose.restoring` restores the exact original view and derived mode. The normal [adapter publication contract](ANIMATION_ADAPTERS.md) applies throughout.

## Editing and sampling

Adding a track validates the candidate source/sequence before saving it. Unsupported geometry or failed native acquisition does not publish that candidate. The track is added to existing rotation, depth and other presentation tracks. Explosion can end at a finite amount from 0 through 10 with normal or explicitly radial direction; folding ends at fraction 1 from a flat fraction 0. Existing keyframe times are retained and receive the absolute linear sweep value. Current-pose sliders record a keyframe at the selected time and render it. Duration, fps, loop, pose recording and absolute start/end seeking apply to all tracks.

`AnimationTrackSessions` privately reuses acquired native data across candidate preflight, the saved playback session and interruptions while the source and serialized sequence remain stable. It never writes source caches. A changed source, fingerprint or sequence resets acquisition ownership. Pending generations are aborted when editing, pausing or switching documents.

## Export and restoration

PNG sampling and the existing WebM recorder both await each qualified render before capture. A folding sequence can capture the explicitly labeled Face net or Base model view; Section capture rejects for a folding sequence because the shared derived viewport displays a net. Base capture on a combined sequence shows the source/explosion presentation, while Face net capture shows rigid folding.

Export snapshots include the complete original view and field presence. Cancellation restores source presentation through the guarded adapter and restores the original full view only while ownership remains current. A new source or an external camera/view edit prevents restoration, preserving the newer state. Legacy version 1 export also gains complete-view ownership and restoration rather than a partial `Object.assign` snapshot. Viewer input enable/damping settings are restored only on the same control object.

## Checks and remaining desktop proof

`tests/animation-track-controls.test.mjs` passes 11 tests covering capabilities, retained unsupported sequences, combined sweeps, exact fractional endpoint values, candidate atomicity, stale renderer guards and exact view ownership. An actual `engine.nets.unfold` cube fixture verifies one native fetch across preflight, saving and interrupted rendering. Controller-level PNG fixtures verify render-before-capture ordering, both exact endpoints, cancellation/native abort, absent-field restoration and preservation of an external camera edit. Existing 17 animation tests and 17 adapter tests also pass.

Desktop qualification covers actual cube/4D explosions, literal rigid net folding, normal/radial selection, keyframe pose edits, endpoint playback, project round trips, PNG and decoded WebM content, cancellation and unsupported-source diagnostics. Pure controller tests remain separate from rendered image/video evidence.

`scripts/animation-tracks-smoke.cjs` passed 13 checks in an isolated development profile: [result](../artifacts/animation-tracks-smoke-NCuLAA/result.json). It supports `POLYTOPE_TEST_EXECUTABLE` for a packaged run with development Python deliberately unavailable. Checks cover 4D normal/radial poses, source incidence preservation, saved nonzero-pose viewport hydration, unsupported partial 4D/generalized directions, playback, interior pose recording, combined source/net views, both explicit PNG targets and native staging cleanup with exact full-view restoration.

Saved-pose hydration differed from the saved endpoint by mean RGB error `0.0000185`, with no pixels differing by more than four byte levels. The original unexploded image failed the same threshold with mean error `9.78465` and `26.958%` differing pixels, demonstrating a meaningful pose check. Literal flat/folded net PNGs and source face/cell explosion images were visually inspected.

The 0.2-second WebM test moves the net canvas fully offscreen during recording, bounds completion to 30 seconds, and uses external test-only FFprobe/FFmpeg to decode the result. It produced six VP9 frames at 672 by 889 pixels. First/last decoded frames matched exact PNG endpoints with mean RGB errors `2.4093` and `2.4072` below the five-level compression tolerance; a wrong endpoint failed with error `21.3022`. Both decoded endpoints contain the intended model. [Decode metrics](../artifacts/animation-tracks-smoke-NCuLAA/video-proof.json) and PNGs are retained. FFmpeg is not an application or export dependency; the smoke script uses tools on PATH or `POLYTOPE_FFPROBE`/`POLYTOPE_FFMPEG` overrides, with 30-second subprocess and 64 MiB decode-output caps.

The unpacked packaged 0.12.0 application also passed all 13 checks in the isolated profile with development Python unavailable: [packaged result](../artifacts/animation-tracks-packaged-smoke-ysOgb6/result.json), [qualification runner log](../artifacts/desktop-qualification-t6x16v/tracks/run.log). Its own decoded WebM and hydration metrics are recorded alongside the result. This is animation-track proof; the complete release qualification suite is tracked separately by its coherent runner rollup.
