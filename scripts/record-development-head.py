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
build pass. These later additions are not in the 0.24 binary or source ZIP.

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

Next staged work: complete generalized 4D cell sections, four-face coincident-edge
assembly, and actual dual-morph animation/video export. Via-snub is a proposed
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
