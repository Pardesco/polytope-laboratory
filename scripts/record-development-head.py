"""Keep the current handoff separate from retained historical release evidence."""
from pathlib import Path
import hashlib,json
root=Path(__file__).resolve().parents[1]
version=json.loads((root/'package.json').read_text())['version']
short_version=version.rsplit('.',1)[0]
previews=[json.loads(p.read_text()) for p in (root/'artifacts').glob('community-preview-*.json')]
preview_version=max(previews,key=lambda r:tuple(map(int,r['version'].split('.'))))['version']
protected={name:hashlib.sha256((root/'engine'/name).read_bytes()).hexdigest() for name in ('__init__.py','formats.py','geometry.py')}
assert protected=={'__init__.py':'386c22bb99742201703c33eba63836bd0bebcccff37107c67a06b139fd0e5923','formats.py':'fdc634c8a992e2b6a33ea69ae68f3fbd5d021949123efd584744d8a0a76c8d23','geometry.py':'9a9a1243223ca38aabce4bc762cbd463939a177f104bfa08c4ada81774b85414'}
prefix=f'''# Active development - October 7, 2026

The feature-complete goal remains active, using GPT-6.1-Sol subagents. Randall
prioritizes free/open-source feature coverage or roughly 90% of Stella4D,
with a build and relevant checks. Practical 90% coverage is not yet measured.
The historical pause below is superseded; its evidence remains retained.

Working sources are **{version} development**. The usable **{preview_version} GPLv3 community
preview and corresponding source archive** are packaged in `release`.
Its real portable launch passed with development Python unavailable. The prior
qualified 0.21 release is unchanged. Program license is GPL-3.0-only; third-party
licenses remain intact, and contribution guidance and issue templates are ready.

The sources include eight scoped 3D morph methods, faceting diagrams, element
text/PNG content, repeated-instance labels, physical reinforcement and measurement
exports, stereo, one-to-six independent views, project metadata, finite 4D
construction from vertex figures, 80 specialized 3D and 980 attributed 4D entries.
New in 0.23: convex 4D expansion, tidy/spiky search filters, automatic source labels,
structured catalog queries, metadata JSON export/reopen, material/lighting/themes,
regular-face/equal-edge/equal-area fitting, grounded stephanoids, and analytic
tetrahedron, triangular-prism, and triangular-grid controls, procedural bump/studio
reflection, exact rational 3D surface sections, and stellation cell/dependency diagrams.
See `RELEASE_{short_version}_DEVELOPMENT.md` and `OPEN_SOURCE_ROADMAP.md` for current limits.

Build passes. A short actual-app check passes fitting preview/adoption, 4D
expansion, material presets, labels, and JSON metadata export/reopen:
`artifacts/feature-0.23-quick-hX7RvM/result.json`. Stephanoids passed six focused
staged checks and the mounted build. The final fitting coordinate guard passed
three mounted native checks. FAC03 production sanity passes actual criteria
receipts and adoption. No full regression or requirement-wide conformance closure
is claimed for this community development checkpoint.

The real-app surface-tool check passes shader rendering and PNG capture,
cell selection Undo/Redo/filling, and rational section preview/adoption:
`artifacts/surface-tools-quick-kQ79El/result.json`. Mounted sections and cell
diagrams also pass six native and six controller/Viewer checks.

New in 0.24: environment-only refraction, bounded convex face/cell distances,
source-incidence truncation/quasi cuts, generalized nonconvex face and 4D whole-cell
nets, sphere projection, and seven Stewart entries with checked genera one through
three. The real-app refraction/measurement check passes:
`artifacts/refraction-measurements-quick-jiij6x/result.json`. Quasitruncation
adoption and concave folding/native Save/Open pass:
`artifacts/truncation-nets-quick-hvg5IF/result.json`. Generalized netLayout
restoration routes through the new kernel without changing the protected importer.

Sphere expression/default controls, generalized whole-cell net display and matching
faces, native net Save/Open, and the genus-three Stewart catalog load pass:
`artifacts/sphere-cell-stewart-quick-vVDCuk/result.json`.
Concave ordinary source cells, tidy-dual faceting and generalized sizing are
mounted with focused native/controller/Viewer checks. Moving text/PNG content,
capture, enabled-morph Save/Open and unsupported PNG endpoint retention pass:
`artifacts/morph-content-quick-7Zmypa/result.json`. The actual-app check required
detached camera initialization and readable billboard texture orientation fixes.
Offline help now has 21 searchable topics with F1 control context; its app check
passes in `artifacts/guide-quick-w7OtRW/result.json`.

New in 0.25: generalized expansion morphs, automatic exact full/proper source
symmetry for faceting, per-edge physical glue tabs and literal 4D incidence
reciprocation. Mounted eight native and six Viewer/session/controller groups pass;
source-symmetry native/UI sanity and
build pass. These features are included in the qualified 0.25 binary/source pair.

Exact regular faceting sources and source-color paper batches are also mounted.
Source/adoption Save/Open and history replay, three native printing and two
controller groups pass. The real-app check passes 4D reciprocation/capture,
physical tabs, exact-source faceting, source-RGBA paper batches and star expansion
Save/Open/capture: `artifacts/feature-0.25-quick-NuAPGG/result.json`.

Generalized 4D expansion is mounted: three native and two Viewer/session groups
pass. The real-app check passes concave expansion with four-rank text, moving
face PNG, Save/Open and retained prior pose after unsupported image refusal:
`artifacts/generalized-4d-morph-quick-zxan0U/result.json`.

Generalized net folding is mounted for keyframes/tours and PNG/WebM export.
Two native source checks and six Viewer/animation/tour checks pass. Actual GPU
PNG0/.5/1, three decoded VP8 frames and source/annotation/tab/history Save/Open
pass: `artifacts/generalized-fold-quick-FEbVM9/result.json`.

New in 0.26: complete ordinary 4D cell sections with concave/disconnected/holed
regions, saved dual-morph ratio tracks and PNG/WebM export, and explicit Fit export
frames. Mounted focused checks and actual desktop exports/promotion/SaveOpen pass:
`artifacts/feature-0.26-quick-254ZbX/result.json`. The formerly clipped concave-fold
endpoint is now wholly visible after explicit fitting; continuous-motion/label
extents are not certified by sampled frame fitting.

Four-face coincident-edge assembly supports all four policies for qualified ordinary
convex/concave/toroidal pieces, physical tabs, detached history and source text/PNG SVG/PDF. Mounted native
and five Node groups pass. Actual UI/export/SaveOpen passes in
`artifacts/coincident-assembly-quick-G0Jdvd/result.json`; its PDF review confirms
both support instructions, A4 dimensions and embedded source PNG. Root fixed the
shared print-window data-image policy after the initial PDF omitted that image.
The frozen 0.25 preview retains the old behavior, now recorded publicly.

GitHub is published: https://github.com/Pardesco/polytope-laboratory and its
v0.25.0 prerelease with Issues enabled. Uploaded digests match the original binary
and corresponding source ZIP. Publication came from a clean archive extraction in
`build/github-publication-0.25/source`, preserving runtime files; current 0.26
sources are not pushed. `artifacts/github-publication-0.25.0.json` records it.

Projective infinite/hemi incidence duals, twelve supplied reflected snub forms,
U1-U75 symbol aliases, separate Skilling source and source-owned reflection are
mounted. Eight native/five Node groups and actual desktop catalog/PNG/source
selection/clipping recipes/history SaveOpen pass:
`artifacts/projective-snub-quick-fWUhHk/result.json`. Three controller groups pass
after PNG save feedback integration. Actual concave assembly UI/PDF/SaveOpen passes
`artifacts/coincident-assembly-quick-2rcRiL/result.json`; PNG/SUP instructions are
present and custom 1000 mm paper measures 1000.167 mm.

The public documentation follow-up is pushed at 3ff0111999b4f8d6f31cfa7f5ec95eca1f0fcc7f.
The initial release tag/source remains 4fc3b02a9763860f73349d3f378571dc969a663c.
Current build: 153 modules pass; offline help has 25 searchable topics. Stale unstarted ledger rows for supplied specialized
families, bounded vertex-figure completion, reinforcement and element content now
reflect existing prototypes; no additional conformance gates were closed.

Source-owned content on ordinary 4D cell sections is mounted: repeated formatted
labels retain rank-loss owners and whole-surviving-face PNG retains UV/source alpha.
Three mounted native/four actual Viewer-animation-tour checks and real GUI PNG
sequence/content/promotion/refusal/SaveOpen pass:
`artifacts/section-content-quick-ApisKX/result.json`. Export-owned read admission
was fixed after actual capture hit the construction guard; ordinary construction
and promotion remain blocked during export. Three section-controller groups pass
including late lost-owner refusal. Generalized 3D density/algebraic measures are
mounted; native four-star/analytic/ownership cases and three real-native controller
checks pass. Actual density inspector/query/source JSON/CSV and evidence SaveOpen pass:
`artifacts/density-info-quick-X0hY43/result.json`.

Literal 4D arrangement/regiment comparison and independent-incidence compounds,
plus simple concave-face bounded distances, are mounted. Three regiment native,
six distance native and five combined Node groups pass; actual desktop comparison,
navigation, compound PNG/content/SaveOpen/replay and bounded/flat metrics pass:
`artifacts/regiment-distance-quick-UdLQGc/result.json`. Root fixed comparison
empty-state initialization and the shared history commit return value, and enabled
native-supported comparison/compound history branching. Nine runnable projects
are in examples/0.26. No broad regression was performed.

Next isolated work: 4D D4-lattice Waterman construction, finite completion from
nonconvex/star vertex figures and verified symmetry-orbit coloring.
The 0.25 portable passes with
development Python disabled; all 2,354 archived hashes and 1,828 frozen runtime
inputs matched the actual corresponding source ZIP before this version bump. Via-snub is a proposed
future method, not a grounded current benchmark requirement. Protected importer files and
historical release assets remain unchanged. Initial full-test receipts predate
the new features. The expanded native regression was stopped at Randall's request
and contains unresolved failures; old frontend doubles were fixed in focused
checks. Reinforcement PDF verification was corrected for Chromium quantization;
the complete desktop wrapper was not rerun. Retained failures remain inspectable.

Preview receipt: `artifacts/community-preview-{preview_version}.json`.
Source archive receipt: `artifacts/source-package-{preview_version}.json`.

---
'''
for name in ('BUILD_STATUS.md','SESSION_HANDOFF.md'):
    p=root/'docs'/name;old=p.read_text(encoding='utf-8');_,history=old.split('\n---\n',1);p.write_text(prefix+history,encoding='utf-8')
(root/'artifacts'/f'development-head-{version}.json').write_text(json.dumps({'version':version,'goalStatus':'active','license':'GPL-3.0-only','protectedImporterHashes':protected,'currentNotes':str(root/'docs'/f'RELEASE_{short_version}_DEVELOPMENT.md')},indent=2)+'\n')
print('Updated current development handoff:',version)
