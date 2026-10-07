# Video endpoint repair: actual browser component evidence

The retained 0.20 candidate is unpromoted. Its old canvas-stream recorder can omit the final requested pose. The two failed recordings and the independent all-reference diagnosis remain in `artifacts/animated-tour-webm-endpoint-diagnosis-0.20.0.json`; the stronger endpoint oracle rejects both. Earlier endpoint checks based only on a global color-error threshold do not establish pose identity.

Root ran `scripts/video-explicit-pose-smoke.cjs` against the actual unpacked 0.20 Electron executable, loading the frozen 0.21 recorder and muxer in a separate sandboxed renderer. The candidate archive, executable, main window policy and development runtime sources were unchanged. The test uses the seven actual GPU PNG frames previously captured independently in `artifacts/desktop-qualification-rY2gcg/animatedTours/animated-tours-packaged-0Audu7/tour.frames`.

Result: `artifacts/video-explicit-pose-browser-VtMQuC/result.json`, SHA-256 `6394652f0dcfd9da64b2a224a9b5847bbddd9d9463239cbc0b2f284e514ab776`, **PASS**.

- Actual Chromium `VideoEncoder`/`VideoFrame` and the new VP8 WebM writer produced exactly seven submitted, encoded and decoded frames at 0, 0.125, 0.25, 0.375, 0.5, 0.625 and 0.75 seconds.
- Every decoded frame is uniquely closest to its corresponding independently captured PNG among all seven references and meets the declared mean RGB error below 5.
- First-pose mean RGB error is 1.6610; final-pose error is 1.8930. The final frame is uniquely closest to reference 6, with reference 5 at 3.9342. Both strict endpoint identity checks pass.
- The terminal pose has an explicit 0.125-second display hold. Source timeline length is 0.75 seconds; container display length includes that hold.
- Real cancellation before the third frame submission throws `AbortError`, drains three earlier writes and releases the recorder control.
- Sandbox and context isolation are enabled; Node integration is disabled. All harness/module/reference inputs and retained runtime hashes match before and after execution.

Output: `explicit-poses.webm` in the proof directory, 48,761 bytes, SHA-256 `f53ff8629d610bf99f9b2e1e739340c22cc692aa92211d85498441cd4cc38676`.

This establishes actual browser codec and mux behavior for these independently captured poses. The renderer uses a 2D canvas to submit those images. The component result alone does not establish mounted live capture or release qualification. No original requirement is closed by this component result; the ledger remains 2 validated and 71 open.

## Subsequent mounted and packaged evidence

The replacement is now mounted in 0.21. `artifacts/desktop-qualification-Z0vNQL/result.json` passes live animated-tour and single-animation export, including native staging/publication, independent endpoints, cancellation, competing controls, source replacement and restoration.

The stronger packaged tour test also passes: `artifacts/desktop-qualification-G4SE7y/animatedTours/animated-tours-packaged-gzHPU8/result.json`. It requires exactly seven frames, exact source timestamps and every decoded pose uniquely closest to its corresponding independently rendered PNG. FFmpeg/FFprobe availability is required for this qualification. Packaged single-animation proof `artifacts/animation-packaged-smoke-YlsElb/result.json` independently checks both poses and timestamps 0/0.1, with the live source canvas fully offscreen.

Full packaged regression, actual portable launcher and release promotion remain pending. This repairs the demonstrated missing-endpoint behavior on the tested workflows; it does not close full ANIM parity or assert universal codec/hardware availability. [Current candidate status](CANDIDATE_0.21.md) records the broader evidence.
