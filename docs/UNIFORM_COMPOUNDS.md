# Uniform compounds UC1–UC75 (W41 / LIB-03)

All 75 Skilling UC indices have a canonical `compound-ucN` entry in Library →
**Compounds**, alongside the existing generated compounds. Search `UC5` resolves
the complete index, without matching UC50–UC59. Names, component counts,
`components=5`, `chiral:true` and `symmetry:I` are searchable. Existing source
records `antiprism-ucN` and original native keys are preserved.

Construct → Create a model → **Uniform compounds (UC1–UC75)**
(`uniform-compound-settings`) contains **Skilling number** (`uc-number`),
**Rotation θ (degrees)** (`uc-angle`), **Create compound** (`uc-create`) and
**Apply parameters** (`uc-apply`). Apply is enabled on the selected UC model;
it commits a replayable operation with Undo/Redo and saved-project history.
Create opens a document. Global Cancel aborts numeric evaluation and construction;
changed source, workspace, fields or export ownership prevents publication.

Analysis retains **Components**, adding **Uniform compound**, **Compound symmetry**
and **Compound angle θ** for a current generated source. Construct's existing
**Compound component**, **Keep component** and **Delete component** controls work
with every generated constituent. Colors and separate incidence survive saving.
The history **Parameters** action can branch a recorded parameter edit.

## Definitions and parameters

Rotational families are **UC1, UC2, UC7, UC10, UC11, UC13, UC20, UC22, UC24,
UC26 and UC28**. UC3 is a fixed special member, without a free angle. θ accepts
numeric expressions in degrees from −360 to 360. The default 17° is the pinned
representative in the existing attributed OFF set. There is no unique published
default for a continuous family; Antiprism otherwise chooses random angles.

For polyhedral-axis families the seed is rotated by θ−17° about its retained
principal axis before applying the finite group. Axes are +Z for UC1/2/7,
(1,1,1)/√3 for UC10/11/13 and (0,1,φ)/√(1+φ²) for UC26/28. The supplied UC26
seed includes Antiprism's 36° reference offset. Reflection matrices reverse
face winding. Special angles can produce coincident constituents; they retain
separate incidence and component IDs, with no welding or union-volume claim.

Only **UC20–UC25** define variable polygons and repetitions. Their collapsed
**Polygon and repetition** options (`uc-polygon-options`) expose `uc-n`, `uc-d`,
`uc-k`. UC20/22/24 have 2k constituents; UC21/23/25 have k. Defaults are n=5,
k=2, d=1 for UC20–23 and d=2 for UC24–25. Other prismatic UCs have the fixed
polygons prescribed by their classification; changing n would change their UC.

The supported reduced domain is integer 3≤n≤32, 2≤k≤12, n×k≤128 and gcd(n,d)=1.
Prisms require 0<d<n/2. Antiprisms require 0<d<2n/3, odd d for UC22/23 or
even d for UC24/25. Unsupported domains fail explicitly. Unit-edge polygonal
rings use radius 1/(2 sin(πd/n)); prisms have height 1, and antiprisms have
height √(1−[2 radius sin(πd/(2n))]²). Ordered star caps are retained.
Groups are D(kn)h, or D(kn)d for odd-d antiprisms with odd k. `d` in the group
symbol is the Schoenflies suffix, distinct from the polygon denominator.

## Construction, evidence and limits

[The full audit](UNIFORM_COMPOUNDS_AUDIT.md) lists UC1–UC75, prior native keys,
source counts, components, names, symmetry and chirality. All 75 source assets
exist and pass their retained SHA-256 fingerprints. The prior 36-entry library
covered 24 distinct UC indices. This package adds canonical keys without changing
those prior implementations.

`scripts/audit-uniform-compounds.py` recovers one source component, then filters
finite octahedral/icosahedral/dihedral actions against **every component's ordered
face cycles**. It exhausts the seed orbit, checks counts and normalized vertex
agreement, and writes `engine/catalog_data/uniform_compounds.json` (about 176 KB).
Runtime uses these attributed decimal component seeds and native NumPy symmetry
orbits; UC20–25 instead use analytic rings. It does not import whole OFF meshes
at runtime and does not depend on an Antiprism executable or network access.

The maximum default normalized source residual is below 6×10⁻¹⁵ after rounding
stored matrices. Normalization uses the source RMS vertex radius. Cyclic origins
and reversed winding are equivalent for source comparisons. Numerical group
multiplication closure is independently checked; parameterized dihedral groups
use their analytic cyclic/reflection construction. Metadata retains matrices,
parameters, source fingerprints, residuals and the scope of the evidence.

Chirality refers to the whole supplied compound, including component incidence,
and is numerical: UC5, UC18, UC19, UC30, UC32, UC34, UC36, UC42, UC44 and UC55
are chiral representatives. In particular the two-snub compounds include opposite
hands and are achiral. Proper-only I or O actions and the absence of improper
actions in their full Ih/Oh normalizers distinguish the chiral entries. Maximal
symmetry at special angles is not enumerated. Opposite-hand selection for the
new canonical keys is a follow-up; existing UC5/UC55 A/B entries remain available.

Vertex transitivity describes geometric vertex sites, with face incidence kept
when testing symmetry. UC19 has 60 distinct sites but 120 constituent vertex
occurrences in the attributed OFF data. Its 60 proper actions give two orbits on
those occurrences; claiming a single orbit on all owned occurrences would be
incorrect. Its point cloud alone is achiral, while its retained component face
cycles are chiral. Source counts deliberately preserve all 120 occurrences.

These are float64 constructions from attributed seeds, **not independent analytic
derivations of all 75 component coordinate sets or exact algebraic certificates**.
Source comparisons establish the default realization; no OFF comparison is claimed
for arbitrary parameters. No self-intersection-free solid or union measure is
inferred. Electron click-through remains with the lead, as requested.

Naming and parameter definitions follow the retained Antiprism 0.32
`specialized/compound-help.txt`, [Antiprism's UC reference](https://www.antiprism.com/examples/150_named_models/540_uniform_compounds/imagelist.html)
and its [construction definitions](https://github.com/antiprism/antiprism/blob/master/base/skilling.cc).
The existing source license and notices remain in `catalog_data/specialized`.

## Verification

`tests/test_uniform_compounds.py`: all 75 default counts and normalized source
face/vertex comparisons; separate ownership and extraction; deterministic whole
models/IDs; group closure and component orbits; every free-angle family; polygon
variants, uniform edge lengths and invalid domains; chirality; project/history
Undo/Redo, replay and extraction after parameter edits.

`tests/uniform-compound-controls.test.mjs`: mounted choices and collapsed options,
numeric expressions/domains, create/apply workflows, cancellation and late-response
ownership, parameter restoration, UC alias collisions and integration.
The existing UC search regression now expects exact UC5 matches (the two hands),
instead of its former UC50–59 prefix matches.

Focused engine/regression run: **495 passed** across uniform compounds, existing
compound libraries, compounds, recipes, history, catalog registry, library navigation,
product generation and construction-family workflows. Renderer/workflow/desktop
regression: **164 passed**, including engine pool and history branching checks.
`npx.cmd vite build --configLoader native` passed with the existing large-chunk
warning. The focused new Python module contributes 195 tests and the new Node
module contributes 12 tests to those totals.
