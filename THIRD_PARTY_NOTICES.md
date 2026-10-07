# Third-party notices

Polytope Laboratory's original program code is licensed under GNU GPL version 3
only; see `LICENSE`. Third-party code and data retain their respective licenses.

| Component | License / accompanying notice |
| --- | --- |
| Miratope regular-polytope catalog data | MIT; `engine/catalog_data/miratope/LICENSE` |
| Miratope additional 4D library and discovery source files | MIT; `engine/catalog_data/miratope_expanded/LICENSE` and `ATTRIBUTION.txt`; discovery classifications are unverified |
| Antiprism attributed polyhedra and compound resources | MIT and similar notices; `engine/catalog_data/antiprism/COPYING` and `engine/catalog_data/specialized/COPYING` |
| Skilling exceptional polyhedron resource | Retained Antiprism 0.32 MIT and accompanying notices; `engine/catalog_data/uniform_snub/COPYING`, `ATTRIBUTION.txt` and `RESOURCE_NOTICE.html` |
| Stewart toroid construction parts and adapted resources | Retained Antiprism MIT and similar notices; `engine/catalog_data/stewart/COPYING` and `engine/catalog_data/stewart_families/COPYING`, with accompanying resource notices; original construction/audit code GPL-3.0-only |
| Three.js | MIT; installed package `node_modules/three/LICENSE` |
| Electron | MIT and bundled Chromium/other notices; `node_modules/electron/dist/LICENSE` and `LICENSES.chromium.html` |
| Python | PSF license and accompanying standard-library notices |
| NumPy | BSD and bundled component notices in the installed distribution |
| SciPy | BSD and bundled component notices in the installed distribution |
| Pillow | HPND and bundled component notices in the installed distribution |
| PyInstaller | GPL with its bootloader distribution exception; installed distribution notices |

Development tools retain their own licenses and are not relicensed by this
project. Catalog additions must retain provenance and any applicable source
notices. Proprietary Stella catalog files are not distributed with the program.

Copies of installed dependency notices are in `third_party_licenses/`; its
manifest records their hashes. Provider notices also remain beside catalog data.

Release packaging must accompany the binary with the corresponding source and
the notices for its actual bundled dependencies. The license declaration applies
to the current development source; historical binaries retain their historical
release metadata.
