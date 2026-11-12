# Waterman occupied-shell sequence

R8-GENERATOR-OPTIONS adds the bounded `waterman-occupied-shell-v1` convention to
scenario **`con-02-waterman-sequence`** (CON-02). The existing SC/FCC/BCC balls,
fixed squared-radius increments, centered FCC roots and Z4/D4 balls remain
available. This closes the occupied-shell navigation tranche only; it does not
qualify Stella's numbering, presets or defaults, CON-11 rational step
multiprisms, or CON-12 arbitrary crossed layers.

## UI

Construct > Waterman (`construct-card-waterman-settings`, `waterman-settings`),
then open **Waterman sequence (radius navigation)**
(`waterman-sequence-settings`, initially collapsed). Set **Sequence**
(`waterman-sequence`) to **Occupied lattice shells (3D)**. **Previous radius**
and **Next radius** retain their IDs `waterman-previous` / `waterman-next`.
Use **Exact origin and squared radius** mode; centered-root mode keeps its
existing unit-root convention. No Expert mode is needed.

The origin fields `waterman-x/y/z` and anchor `waterman-radius-squared` use
NumericEntry's exact rational expression mode. The fixed increment is disabled
and unused for shell navigation. The radius changes only after successful
publication. `waterman-sequence-status` reports the resolved squared radius,
boundary-site count and numerical support residual. **Generate Waterman hull**
continues to construct the ball at the entered radius, without navigating.

Example: choose BCC, origin `(0,0,0)`, squared radius `0`, then Next: squared
radius `3` gives a cube (8 vertices, 12 edges, 6 faces). Next reaches `4`, a
rhombic dodecahedron (14,24,12); Previous returns to `3`. Previous again refuses:
the nearest shell is radius zero and cannot form a 3D hull.

## Versioned definition and evidence

SC is all integer triples; FCC has even coordinate sum; BCC has equal coordinate
parity. Keep these integer lattice units and the supplied rational origin c.
For each lattice site p define d(p) = sum((p_i-c_i)^2). Next chooses min d(p)
strictly greater than the anchor; Previous chooses max d(p) strictly smaller.
The resulting model is the existing closed-ball hull at that threshold.
Negative anchors are refused; zero is a permitted navigation anchor. Previous
at the first site shell refuses. Degenerate shells are diagnosed, never skipped.
Combinatorial types can recur; no shape-class filtering is performed.

Selection compares integers with a common rational origin denominator. For Next,
an all-even site strictly outside the anchor ball supplies a finite upper
distance bound for all three lattices. Exhausting its enclosing coordinate box
proves that no nearer occupied shell was omitted. Previous exhausts the anchor
ball's enclosing box. `metadata.watermanSequence` retains the convention/version,
raw and resolved inputs, shell coordinates, complete search box, witness and
exact nearest-distance receipt. The receipt certifies the shell distance only.
Hull coordinates, incidence, supports and measures remain floating-point;
normalized support/planarity residuals are reported separately, with an
8 * 1e-8 refusal threshold. Existing native hull validation is preserved.

The fixture `tests/fixtures/waterman-shell-reference.json` retains the versioned
definition and independent expectations. Facets are derived from cube coordinate
planes, octahedron signed-coordinate planes, cuboctahedron coordinate/sign planes,
and rhombic-dodecahedron signed coordinate-pair planes. Tests compare complete
vertex/edge/face sets and cyclic boundaries, not counts alone. Arbitrary rational
origins are also checked against separate bounded squared-distance enumeration.

## Native integration, history and limits

`generate` with `kind: "waterman-shell"` uses the existing server dispatch and
desktop allowlisted operation; no new IPC operation or warm-worker registration
is required. Parameters include `convention: "waterman-occupied-shell-v1"`;
other conventions and unknown options refuse. Generator provenance retains the
input anchor and direction, allowing deterministic regeneration. Native projects
preserve source receipts. Construction uses the existing new-document workflow;
later transformations use normal history, Undo/Redo and replay. A generate
history node is also tested directly. Source-bound receipts become historical
after geometry operations. Form preferences are session controls, as with the
other generators; saved projects retain the actual generation parameters.

This convention supports 3D SC/FCC/BCC only, at fixed origin/lattice per step.
It inherits bounded 256-bit rational inputs, 512-bit common origin denominator,
absolute lattice coordinates <= 1,000,000, <= 1,000,000 inspected sites per
search, and the existing hull/selected-point/payload limits. Search boxes can
be larger than hull-selection boxes; resource refusal is intentional. No exact
hull certificate, numbered-root equivalence or competitor qualification is
claimed. Electron/installed desktop qualification remains for the lead.

## Verification

Native suites: `tests/test_waterman_sequence.py`, `tests/test_waterman.py`,
`tests/test_waterman_workflow.py`, `tests/test_generator_options.py`,
`tests/test_waterman4.py`.

Node suites: `waterman-sequence-controls`, `waterman-sequence-mounted`,
`waterman-controls`, `generator-options`, `waterman4-controls`,
`waterman4-mounted`, and `engine-op-allowlist`. The mounted tests use headless
Chromium and a real JSON-lines Python engine. They check Expert-off access,
successful navigation, atomic boundary refusal, native project reopening,
transform Undo/Redo/replay and hidden-mode reveal compatibility.

Run with `python -B -m pytest <files> -q -p no:cacheprovider`,
`node --test --test-concurrency=1 <files>` and
`npx.cmd vite build --configLoader native`.

Worktree verification: **236 Python tests passed** (35 new), **41 Node tests
passed** (39 unit checks plus two mounted workflows, run separately), production
Vite build passed (376 modules; existing mixed-import/chunk warnings), and
`git diff --check` passed. No Electron process was launched.
