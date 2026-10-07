Current user preference: gaming is finished; needed visible windows/popups are
explicitly authorized. Hidden-mode evidence below remains historical qualification.
Finish any active exact-image watcher before launching a visible test of that
same runtime, so the hidden observations remain valid.

# Hidden desktop qualification

The development main process supports the explicit environment setting
`POLYTOPE_TEST_MODE=hidden-no-focus`. It requires Windows and an absolute
`POLYTOPE_TEST_USER_DATA` path different from the ordinary application profile.
Use a newly created isolated test profile, with no links or junctions into the
ordinary profile. Unknown mode values, missing/relative profiles, the ordinary
profile, and other platforms exit with code 2 before application readiness.
Configuration errors go to stderr; they are not thrown into Electron's native
main-process error-box handler.

This is a test-only mode. Leaving `POLYTOPE_TEST_MODE` unset preserves ordinary
startup, menus, native dialogs, printing, and unsaved-change confirmation.
Setting only `POLYTOPE_TEST_USER_DATA` does not enable hidden mode.

## Window and dialog policy

All application BrowserWindow construction, including both PDF/print document
paths, goes through `createAppWindow` in `desktop/main.cjs`. Hidden mode sets:

- `show:false`, `focusable:false`, `skipTaskbar:true`, `alwaysOnTop:false`,
  `fullscreen:false`, `kiosk:false`, and `paintWhenInitiallyHidden:true`;
- `backgroundThrottling:false`, `disableDialogs:true`,
  `focusOnNavigation:false`, and `disableHtmlFullscreenWindowResize:true`;
- the existing sandbox/context isolation/disabled Node integration policies.

There is no `ready-to-show` show callback or application menu in this mode.
Window show/focus/restore/maximize/minimize/fullscreen/kiosk/topmost/focusability
and taskbar-changing APIs reject. Equivalent fullscreen/kiosk/focusability
property setters reject. `app.focus`, webContents focus, detached DevTools,
and element inspection reject. New renderer windows are denied, webview
attachment is denied, and application audio is muted. Hidden close bypasses
the unsaved-change native question in the isolated test profile.

All async/sync Electron dialog entry points, including error boxes, reject with
a message identifying hidden qualification. Existing trusted-main-process
test stubs may explicitly replace dialog functions with deterministic return
values. No arbitrary destination path is added to renderer IPC. A forgotten
dialog stub fails instead of opening a picker.

Native `webContents.print` rejects; an explicit per-window callback stub can
qualify its IPC plumbing. `printToPDF` remains available in hidden nonfocusable
document windows after an explicit save-dialog stub. Native fullscreen and
printer-dialog behavior cannot be qualified by this mode. Hidden painting and
RAF cadence require the runtime canary described below; constructor preferences
alone do not prove rendering cadence. Hidden timing observations must be labeled
as hidden observations rather than foreground performance claims.

The geometry subprocess retains `windowsHide:true` and piped stdio. The mode
does not disable renderer sandboxing or alter geometry-engine contracts.

Electron documents that `show()` shows and focuses the window, whereas
`focusable:false` prevents focus and implies taskbar skipping on Windows.
It also documents hidden painting, disabled dialogs, focus-on-navigation, and
background throttling. These are the API basis for this policy:
[BrowserWindow](https://www.electronjs.org/docs/latest/api/browser-window),
[window constructor options](https://www.electronjs.org/docs/latest/api/structures/base-window-options),
[application focus](https://www.electronjs.org/docs/latest/api/app).

Before application readiness, this mode alone applies
`disable-backgrounding-occluded-windows` and disables the Chromium feature
`CalculateNativeWinOcclusion`. Existing `disable-features` entries and other
switches are preserved; an existing occlusion entry is not duplicated.
The frozen `app.polytopeQualification.scheduling` record reports this policy and
the effective disabled-feature list. These flags bypass the Windows occlusion
classifier; they do not make HWNDs visible or enable activation. They do not
disable sandboxing, elevate renderer priority, or introduce an offscreen renderer.
Google's [Chrome flags for tools](https://github.com/GoogleChrome/chrome-launcher/blob/main/docs/chrome-flags-for-tools.md)
documents both switches. Electron's historical hidden-frame
[issue 31016](https://github.com/electron/electron/issues/31016) was addressed by
[PR 38924](https://github.com/electron/electron/pull/38924), merged in 2023;
that old issue is not evidence of a current-version regression.

The root-run initial canary observed 360 native HWND checks with no visibility
or foreground violation, but failed its 250 ms RAF assertion. Its clock began
before the first callback, so a delayed first callback could end the interval
with only one sample. Subsequent canaries must report first-callback latency
separately from consecutive RAF timestamps/gaps over a bounded sampling interval.
The revised scheduling policy still requires fresh native-window and cadence
evidence; these static tests do not establish it.

## Static proof and runtime gate

`node --test tests/hidden-qualification.test.cjs` executes the actual main
entry in a CommonJS VM with mocked Electron, filesystem writes, and process
creation. Its 15 tests cover the constructor policy, all activation blockers,
quiet invalid configuration, native dialog rejection and explicit stubs,
both hidden PDF paths, both printer rejections, stubbed printer callbacks,
dirty close, popup/webview rejection, engine console hiding, ordinary behavior,
the single guarded BrowserWindow construction site, pre-readiness occlusion
switches, preservation of supplied switches, and unchanged ordinary scheduling.
These tests launch
no Electron/browser/engine processes and create no native windows.

Static tests establish application code policy. They cannot prove Windows
HWND behavior or absence of a transient OS-level focus event. Before any full
desktop qualification run, root must separately authorize and run a minimal
hidden canary with an external Windows watcher armed **before** Electron starts:

1. Verify the selected executable's main-process source includes this mode.
   The frozen qualified 0.13 executable predates it and must never be launched
   expecting this environment value to keep it hidden. An application version
   number alone is insufficient; check the actual development entry or packaged
   `app.asar` source before launch.
2. Record the existing foreground HWND/PID and watch newly created processes
   by executable path and process ancestry. Include renderer/utility children
   and the geometry engine, not just the parent Electron PID.
3. Enumerate application-owned top-level HWNDs using `IsWindowVisible`, and
   monitor foreground/window-show events from before process creation through
   shutdown. Abort the test process tree on any visible owned HWND or owned
   foreground activation. Legitimate foreground changes among the user's own
   programs are not violations. Polling alone can miss transient events; pair
   enumeration with WinEvent foreground/show notifications where possible.
4. From Electron's main process, collect `app.polytopeQualification` and each
   BrowserWindow's visibility/focusability/focus state and native handle. The
   mode metadata is read-only, main-process-only, versioned data containing the
   exact profile, mode, and engine console-hiding policy. There is no renderer
   qualification IPC endpoint.
5. Exercise hidden readiness, renderer/worker rendering, a diagnosed unstubbed
   dialog, an explicit dialog stub, hidden PDF output, and clean shutdown. Save
   the OS watcher evidence alongside the application-level evidence.

Only a successful runtime canary establishes the no-visible-HWND/no-owned-focus
condition for that build and machine. Full suites may then run sequentially
under the same mode and watcher. Do not use `bringToFront`, activate a native
window, attach a visible browser, or invoke native dialogs as a workaround for
a hidden harness failure. Continue native/Node work if hidden qualification is
unavailable. User permission to resume visible testing is a separate condition.

The static 15-test suite passes. Root subsequently ran the real canary in
`artifacts/hidden-desktop-canary-g4et4b/result.json`: the actual window remained
hidden/nonfocusable, dialogs rejected, 813 HWND samples and armed WinEvent show/
foreground hooks recorded zero owned violations. This is observed runtime
evidence for the source hash and machine in that artifact, combined with the
constructor/API guards; notifications can be delayed.

Hidden rendering still produced roughly one RAF callback per second, despite
visible document state and the scheduling preferences. The canary separates
first-callback delay from subsequent gaps. This mode supports functional
qualification, not a claim about foreground rendering speed.

`node scripts/hidden-desktop-smoke.cjs` creates a fresh private profile and arms
the native watcher before launch. To run sequential development scenarios, set
`POLYTOPE_HIDDEN_CANARY` to that passing result, then invoke
`node scripts/hidden-qualify-desktop.cjs <suite names>`. The runner rejects a
different main-process source hash, requires armed event hooks, and observes
native visibility/focus for the entire run. It also accepts an unpacked
candidate whose actual archive main-process bytes and version match current
inputs. A packaged canary must match the exact executable and archive SHA256.
Old packaged releases and portable wrappers without an adjacent archive are
refused before launch. Portable launch qualification is a separate visible test.

The first repaired product workflow passed all four groups in 126.192 seconds:
`artifacts/hidden-qualification-QVqcEc/result.json`. Its 8,083 polling samples
recorded no visible/foreground test window; that earlier run preceded the
additional event-hook monitoring. Later source changes require separate
qualification. No portable 0.14 release qualification is claimed here.

The later three-suite run passed20 actual groups under native event monitoring:
`artifacts/hidden-qualification-pMOk2n/result.json` records37,154 polling checks,
armed SHOW/FOREGROUND hooks and zero owned visibility/focus violations. This
qualifies the recorded source/machine, not future source changes or foreground
performance. A later layer-join canary failed under the tool filesystem sandbox
with Electron runtime ACL denial; failure artifacts are retained. Electron's own
sandbox remains enabled. Read/execute access was granted only to its runtime
folder; the next guarded canary is being run outside the tool filesystem sandbox.
