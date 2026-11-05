# Offline Guide refresh and What’s new (W37 / DESK-01)

Help → User guide now groups topics under ten user goals: Explore the library,
Inspect & measure, Construct & modify, Stellate & facet, Sections & 4D,
Nets & paper models, 3D printing, Animation & video, Styles & images, and
Projects & files. New feature topics provide a location, 3–6 steps, plain-language
limits and related-topic links. Existing topic IDs remain valid.

Help → **What’s new**, the command palette action **What’s new** (`whatsnew`),
and Welcome → **What’s new** (`welcome-whats-new`) open the same offline Guide
page (`whats-new`). Its links cover the October 25–26 additions, including later
4D, density, printing, paper, generator, stereo and desktop packages.
Guide links use `data-guide-topic`; topic navigation uses `data-topic`.

The inspector’s existing `?` buttons use explicit mappings for the new groups,
including dynamically mounted disclosures and the generated net groups.
Anonymous nested disclosures inherit their named owning group. F1 retains existing
context behavior, with additional focused-field contexts for the new tools.
Help buttons recover when a feature’s blanket button-disable pass disables them,
so an unsupported source can still open its group’s explanation.
The ten goals organize navigation; search includes task steps and limits.
All referenced feature Markdown notes are bundled as local lazy-loaded text.

Help → **Keyboard shortcuts** (`shortcut-sheet`, also `?` outside text fields)
continues generating real accelerators from `desktop/command-bindings.json`.
Its new `shortcut-action-index` lists tasks without inventing accelerators;
choosing one searches the live command palette. The Guide also has a keyboard
sheet/action-index topic (`shortcuts`). Existing live controls/select options
remain the command index source. Added metadata makes Export discoverable for
printable, hollow and colored/displayed geometry workflows inside its dialog.

Definitions remain scoped: element types are numerical symmetry orbits; local
fitting does not certify feasibility or optimality; density sections use signed
winding-region selection, while visible paper exteriors/solid printing use a
component-fill union. The Guide reports separate approximation, resource and
unsupported-domain limits. It adds no geometry operation or document mutation.

Validation: `node --test tests/user-guide.test.mjs tests/guide-mounted.test.mjs`
checks IDs, links, ten goals, task structure, all source-derived named disclosures,
bundled references, rendered links, context help, live palette indexing, shortcut
task searches and Welcome/native-action entry points. Existing discoverability,
product polish, Welcome, menu, availability and hidden-main-process tests are also
run. Build with `npx.cmd vite build --configLoader native`.

Electron is not launched in this worktree. Native Help menu delivery and desktop
screen-reader/GPU behavior remain the lead’s click-through checks. The renderer
tests use headless Chromium with the ordinary Python JSON-lines engine.

Verification: 106 focused Node tests and 32 focused Python tests passed;
the Vite production build succeeded with its existing large-chunk advisory.
The new tests are registered in `test:features`. The Guide contains 52 topics
and 31 What’s new task links.

W52 adds these explicit help mappings; anonymous nested options inherit the
owning topic. Shelf disclosures now receive the same `?` buttons as the inspector.

| Group id | Guide topic |
| --- | --- |
| `uniform-compound-settings`, `uc-polygon-options` | `uniform-compounds` |
| `polychoron-relationships`, `polychoron-construction-evidence` | `polychoron-relationships` |
| `star-uniform4-cell-types`, `star-uniform4-evidence` | `star-polychora` |
| `presentation-settings` | `presentation` |

The media export topic links the later format/target-render notes, and desktop
file help links the input/recovery limits. All seven later feature notes ship
offline. The shortcut action index includes the later primary tasks.

Added: `ui/guide-refresh.mjs`, `ui/guide-action-index.mjs`,
`tests/user-guide.test.mjs`, `tests/guide-mounted.test.mjs`, `docs/W37_GUIDE.md`.
Updated: `ui/user-guide.mjs`, `ui/guide-documents.mjs`,
`ui/guide-reference-index.mjs`, `ui/discoverability-controls.mjs`,
`ui/discoverability.css`, `ui/welcome-controls.mjs`, `ui/style.css`, `ui/app.js`,
`desktop/main.cjs`, `desktop/command-bindings.json`, `package.json`.
