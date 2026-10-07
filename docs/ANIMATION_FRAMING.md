# Fit export frames

In Animation, select the capture view and choose **Fit export frames** before
exporting. The action evaluates every PNG/WebM export time, including both
endpoints, and fits one camera around their displayed geometry. It then restores
the original pose and time. The fitted camera persists in the project.

The action supports ordinary rotation, qualified explosion and rigid face-net
folding, section capture, and supported dual-morph ratio tracks. Morph tracks
require Base model capture; folding requires Face net or Base model capture.
Complete ordinary cell sections retain their explicit section domain.

Camera direction, up vector and observer projection are retained. Other viewers'
cameras are restored. No camera changes occur automatically during playback or
export. Cancelling a fit restores the original source pose and camera when it
still owns the source; intervening source/view edits are retained.

The bounds cover finite, visible geometry at the selected export times. They do
not certify every intervening continuous playback instant, screen-space labels,
or geometry intentionally removed by projection clipping. Changing the sequence,
frame rate, visible elements, capture target or viewport size may require another
fit. Sampling has a two-million-point work bound and refuses partial fitting when
it exceeds the bound or finds no finite visible geometry.

Focused checks cover actual native cube nets and production Viewer folding,
all sampled camera projections, source/pose/time preservation, cancellation,
external edits and resource refusals. Actual-app evidence is in
`artifacts/feature-0.26-quick-254ZbX/result.json`: three fitted concave-fold PNG
poses, three decoded VP8 frames, five dual-morph PNG poses, five decoded VP8
frames and saved camera/source restoration. Visual review confirms the formerly
clipped concave folding endpoint is wholly inside the capture.
