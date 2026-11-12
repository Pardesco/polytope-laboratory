# Current help and supported scope

The offline Guide now describes the current task gallery and docked Timeline.
Open Help, search a topic, or press F1 on a control. **Show controls** buttons
reveal and focus existing controls; they never run constructions, replay,
branching or exports. Disabled destinations retain their source requirements.
Ctrl+K searches the same live controls. No element IDs or handlers are replaced.

- **Faceting:** Construct → Stars & facets → Facet (search),
  `faceting-criterion`. Tidy-dual checks both the faceting and its finite
  incidence polar at a declared center/radius. The blank center is the mean of
  all source vertices. Search is bounded to 4–12 intrinsic 3D source vertices
  and closed single-link incidence. Exact predicates refer to supplied
  coordinates; finite native polar geometry also passes numerical checks.
  Unsupported, canceled and resource-limited verdicts are unknown, not proven
  failed criteria. Counts and completion apply to the recorded candidate pool.
- **History:** viewport shelf → History, `history-replay` and `history-branch`.
  Replay verifies recorded constructions and opens an independent document.
  Parameters → Create branch changes supported saved inputs in another
  document. Valid snapshot-only documents remain inspectable but cannot replay
  missing operations. Unavailable recorded algorithms/numeric policies refuse
  replay while retaining readable snapshots. Project format version 1 is
  accepted; future format versions are rejected without modifying the source.
  No general future-version migration is claimed. File → Recover autosave
  restores recovery work; save it as a native project. Backups/recovery do not
  substitute for clean-machine upgrade and power-loss qualification.
- **Animation:** viewport shelf → Animation or Tours opens the docked Timeline.
  More → Dual morph contains method setup. Export video opens the Video dialog;
  Timeline → Export settings retains `animation-format`, `tour-format` and their
  original export controls. View options → PNG options (`png-settings`) sets
  still capture; Snapshot (PNG) captures it.

Every media format awaits deterministic mathematical source samples. This
does not promise bit-identical GPU pixels or encoder bytes:

| Output | Timing and availability |
| --- | --- |
| PNG sequence | Manifest records mathematical sample times. |
| VP8 WebM | Explicit pose timestamps rounded to microseconds; requires a supported VP8 WebCodecs encoder. |
| H.264 MP4 | Rendered samples use frame-index/FPS cadence, including any final endpoint sample; requires a supported H.264 WebCodecs encoder. |
| GIF | At most 256 palette colors; each delay rounds to centiseconds with a one-centisecond minimum. |
| PNG still | Supports transparent background and size scaling within stated GPU/byte limits; scaled/transparent anaglyph is unsupported. |

Video/GIF is opaque. An unavailable video encoder refuses without a real-time
fallback; choose PNG sequence or GIF. Hardware/container/pose combinations and
actual printer output still need shipped qualification.

**Source domains** explains dimension versus convex/generalized/ordinary
boundary requirements, singular reciprocals and resource limits. A refused
operation is not a declaration that the source is invalid. A hull is an explicit
change of boundary. Domain-specific diagnostics remain authoritative.

Verification: `node --test --test-concurrency 1 tests/help-scope.test.mjs
tests/user-guide.test.mjs tests/guide-mounted.test.mjs tests/discoverability.test.mjs`.
Mounted tests use headless Chromium with the native Python JSON-lines engine,
not Electron. They follow every Show controls destination, check live command
matches, preserve source/history and cover normal startup with Expert off.
Native faceting/history and media suites independently check the documented
contracts. `npx.cmd vite build --configLoader native` verifies offline bundling.

Lead follow-up: refresh the stale replay and generalized-domain statements in
`docs/ARCHITECTURE.md` and the old `known_limits` entries in the parity ledger
against current code. Those lead-owned files are unchanged by this package.
