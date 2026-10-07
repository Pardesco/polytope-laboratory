# Installed Stella 5.4 construction metadata

The user confirmed on October 5 that this is their original paid copy and that
they will not buy or install the newer release. Further comparisons use this
available version, public 6.0 documentation and independent mathematical fixtures.
The original specification's feature scope remains unchanged; differences in
version and executed versus documented evidence must stay explicit. No purchase
is required or pending.

Recorded October 5, 2026 by read-only file inspection. The installed executable
was **not launched**, loaded as code, or driven through a desktop session.
Only PE version/menu/dialog metadata and the local manual were inspected;
installed catalog filenames were counted without reading model contents.
This establishes labels and documented options, not executed behavior,
mathematical output equivalence, licensing status, or Stella 6.0 conformance.

## Product and version evidence

| Evidence | Observed value |
| --- | --- |
| Installed executable | `C:\Program Files (x86)\Stella4D\Stella4D.exe` |
| FileVersion and ProductVersion | `5.4, 10th May 2014` |
| PE ProductName | `Stella` |
| PE FileDescription | `Stella - Polyhedron Navigator` |
| PE company | `Robert Webb` |
| Executable SHA256 | `e56977ded0a791da1003ab85a38177923ee08e2502419292dc7bcd0b9d8e0a4d` |
| Local manual | `C:\Program Files (x86)\Stella4D\Stella4DManual.html` |
| Manual title/update | Stella4D Manual; May 4, 2014 |
| Manual SHA256 | `9cda8b03212946417655ce2d95a5ffece4904b83e4c9f8b936434dbf0050e49c` |
| Build-spec target | Stella4D / Stella4D Pro 6.0; different version |

The generic PE ProductName alone does not establish the product edition. The
installed directory, executable name and accompanying manual identify Stella4D.
The official release history dates 6.0 to August 11, 2026 and describes a new
64-bit build, menu reorganization and expanded catalog. Those changes cannot be
inferred from this 32-bit 2014 executable.
[Official 6.0 history](https://www.software3d.com/History.php)

## Static resource coverage

The extraction script parsed one standard MENU resource, ID **128**, language
**1033**, containing 802 items including popup headings/separators. It parsed all
36 DIALOG resources with no parser errors, recognizing standard and extended
templates. Relevant dialogs below have language **3081**. Numeric IDs belong to
this exact executable and may change in later builds. A menu command ID is not a
dialog resource ID; this inspection does not establish runtime routing between
generic dialogs and commands.

The reproducible extraction and full relevant label metadata are in
[inspect_metadata.py](../artifacts/stella54-static-inspection/inspect_metadata.py)
and [metadata.json](../artifacts/stella54-static-inspection/metadata.json).
The parser reads PE bytes with `pefile`; it does not call LoadLibrary or execute
Stella. Dialog layout decoding follows Microsoft's
[DLGTEMPLATEEX format](https://learn.microsoft.com/en-us/windows/win32/dlgbox/dlgtemplateex).

## Construction commands found

Ampersands in raw resources indicate mnemonic keys. The table removes them for
readability but preserves meaningful labels; raw strings remain in the artifact.

| MENU 128 command ID | Stored menu path | Local manual evidence |
| --- | --- | --- |
| 33402 | 4D > Create Duoprism... | Two `n` or `n/d` regular-polygon specifications; one may be supplied for equal factors. |
| 33403 | 4D > Create Antiduoprism... | A 4D prism on a 3D antiprism; a retrograde base such as `5/3` requests a crossed antiprism. |
| 33529 | 4D > Create 4D Step Prism (Duals of Gyrochora)... | Input consists of a polygon specification and a step size. |
| 33302 | 4D > Create 4D Prism on Current Polyhedron | Builds on the current polyhedron. |
| 33008 | Poly > Augment Polyhedron... (`A`) | Attach, excavate, preview, orient and optionally retain coincident faces. |
| 33352 | Poly > Try to Make Faces Regular | Static command is present; no matching detailed section was found in the local manual. Its fitting algorithm and stopping rules remain unqualified. |
| 33058 | Poly > Create Spring Model... | Static command and a dialog are present; not executed. |

The 2014 manual's `#menu4D` section and the current official
[4D menu](https://www.software3d.com/Manual/Menu4D.php?prod=Stella4DPro)
describe the same antiduoprism and step-prism input concepts. Neither provides
an independent coordinate-level oracle or specifies every signed/unreduced,
degenerate or coincident-case policy.

## Augmentation dialog 191

All 52 controls were decoded, with zero unparsed bytes. Relevant source choices
are Pyramid **1115**, Cupola **1116**, Prism **1117**, Antiprism **1381**, memory
**33411**, built-in model **1373**, and file **1374**. The dialog also contains
Crossed **1383**, Dual **1303**, Symbol edit **1302**, and Scale edit **1592**.
The resource alone does not reveal dynamically populated height-combobox items.

| Group | Control IDs and stored labels |
| --- | --- |
| Target faces | 1121 Selected face only; 1120 All faces of same type; 1384 All of same shape & size; 1385 All of same shape; 1387 Only faces of same color |
| Direction | 33008 Augment (outwards); 1124 Excavate (inwards) |
| Colors | 1216 Re-color by current scheme; 1217 Keep source colors; 1386 Inherit colors from augmented faces; 1371 Single new-face color; 1590 Any single new color |
| Preview | 1218 Always; 1219 Only when multiple orientations; 1483 Wire-frame; 1514 Solid; 1515 Both |
| Coincident faces | 1504 Keep coincident faces |
| Completion | 1 OK; 2 Cancel |

The local `#augmentation` text documents seven pyramid-height choices: an
automatic guess, equal-edge construction, face radius, face diameter,
circumsphere contact, unit new-edge length, and unit height. Prism-height choices
use the average, shortest or longest boundary edge, or unit height. Scale usually
multiplies height; equal-edge/unit-edge pyramid choices instead scale the chosen
edge length, and circumsphere contact scales the target radius.

The same section documents coincident-face removal by default, optional
retention, orientation/attachment-face cycling, independent height and top-radius
preview gestures, temporary gaps, acceptance and cancellation. These are manual
claims, not static proof that every option runs correctly. Current
[augmentation documentation](https://www.software3d.com/Manual/Augmentation.php?prod=Stella4DPro)
still describes those core concepts; later changes require separate checks.

## Fitting is several different operations

Dialog **212**, Stretch (Non-Uniform Scale), has 12 controls: axes **1228–1230**,
selected-face perpendicular **1231**, factor **1637**, explicit height **1638**,
measured-distance target **1639**, value edit **1232**, and recoloring **1596**.
The local `#scale` section distinguishes changing physical/net scale from an
actual shape-changing directional stretch, and says measured-distance fitting
can set an antiprism's lateral edges. It supplies no numerical solver tolerance.

Dialog **221**, Put Models on Faces/Vertices, has 46 controls. Its static size
choices include fitting to the current face/vertex **1285**, fitting to the
smallest face/vertex of a part **1286**, and matching the base-part size **1447**.
Bounding-box/sphere height choices are **1406/1407**, and original-center
retention is **1294**. These placement options are distinct from strict
regular-face predicates or uniformity certificates.

View-fitting commands are **32896/32897** (room for rotation, one/all views) and
**33288/33289** (tight fit, one/all views). Net page fitting is **32978**. Their
presence is not evidence of a geometric regularization solver.

Generic resources **132** (Enter a string), **134** (Enter a number), and **216**
(Select one item from list) also exist. Dynamic prompts, default values and
combobox contents cannot be reconstructed from their template labels alone.

## Explicit 5.4-to-6.0 gaps

No dedicated Create Antiprism/Prism/Podium/Antipodium command or matching dialog
title was found in the installed MENU/DIALOG metadata. This does not prove there
is no indirect construction through augmentation, a library or dynamic prompts.
The official 6.0 history explicitly lists new precision-construction entries,
along with added/changed edge-equality and face-area fitting. It also identifies
segmentotopes as new. Therefore 5.4 cannot qualify those 6.0 workflows.
[Official 6.0 construction changes](https://www.software3d.com/History.php)

The current official antiprism page describes four combinations of base
radius/edge length and side-edge/height sizing, plus the 4D vertex-figure face
interpretation. That is current documentation, not a recovered 5.4 dialog.
[Current antiprism manual](https://software3d.com/Manual/Antiprism.php?prod=Stella4DPro)

Unresolved cross-version questions include default orientations, star/compound
incidence policies, unattainable sizing refusals, fitting tolerances, any 6.0
preview changes and exact output/provenance. Answering them requires appropriately
versioned manual evidence or independently permitted executable workflows.

## Installed library metadata

The installed `Stella4DLib` contains **2318 `.stel` files**, counted by filenames
only. Examples of directory counts are Convex **64**, Compounds **15**, Fissary
**14**, CatA_Duoprisms **19**, and CatB_Antiduoprisms **9**. Category directories,
overlapping named collections and vertex-figure files are not a count of unique
verified uniform polychora. No model contents were copied or inspected for this
report, and no full catalog-conformance claim follows from this count.

## Actual 5.4 launch observation (later evidence)

After the user confirmed the available version, a separate session was launched
and closed by scripts/inspect-stella54-session.py. Actual evidence is retained in
artifacts/stella54-session-0gas45tf/result.json: visible main window, 584 runtime
menu command records, no visible startup dialog, no construction/export/registration
or upgrade command, graceful process exit and unchanged executable hash. Many
legacy menu entries use custom drawing and return no live text; their command
IDs can be compared to static PE labels, but those labels are not recovered
runtime strings. The two preceding attempts retained traversal failures caused
by hidden helper-window handles; the successful run restricts menu inspection
to visible windows with valid menu handles.

This establishes that the installed reference can run without an upgrade prompt.
It does not qualify any mathematical operation, export result or Stella6 behavior.
The earlier static inspection remains historical evidence with its original scope.