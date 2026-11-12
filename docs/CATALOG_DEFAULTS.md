# Catalog browsing defaults

The Library hides the 908 unclassified 4D discovery candidates by default.
They are computer-found shapes, not checked against published lists. A successful
numerical import validates supported geometry checks; it does not verify a
published mathematical classification.

Use **Library → Discovery candidates (unverified)**
(`#library-discovery-candidates`) to include them in browsing and search.
The subtitle (`#library-discovery-note`) explains their status. The checkbox is
off at startup and resets when returning to Collections. It is a browsing
preference, not a saved project field.

Default result counts, family choices, collection counts and representatives,
Show all models, and the Library presentation playlist use the visible catalog.
Opting in restores candidate results and the discovery collection, whose ID stays
`discovery4`. The featured gallery is a fixed curated list containing no discovery
candidates; there is no random catalog picker.

Candidate rows show **Unverified**. An opened candidate also shows **Unverified**
beside the model title (`#catalog-classification-badge`), including when loaded
from a saved project or opened directly by its existing catalog key. Turning off
the filter does not close the model or remove its badge.

`ui/catalog-defaults.mjs` identifies candidates from the existing family
`4D discovery candidates` or source classification
`Unclassified discovery candidate`. It does not guess from names or hide every
entry with `classificationVerified: false`: other attributed source families
remain visible. `catalogBrowseEntries` filters only presentation inputs. Native
catalog output, generation, project loading, catalog keys/IDs, hashes and pinned
data remain unchanged. Existing unsupported-source diagnostics still apply.

Verification:

- `tests/catalog-defaults.test.mjs`: full manifest visibility, opt-in search,
  counts/representatives, featured keys and direct loader access.
- `tests/catalog-defaults-mounted.test.mjs`: real mounted renderer/native engine,
  default counts, filter/collection controls, row/title badges, direct opening,
  and saved project restoration.
- `tests/test_catalog_defaults.py`: complete native inventory, direct generation,
  pinned source hash and project round trip without identity/provenance changes.
- Existing library/catalog regressions and `npx.cmd vite build --configLoader native`.

This is a presentation policy, not mathematical verification or reclassification.
No catalog candidate has been removed or promoted to a published identity.
