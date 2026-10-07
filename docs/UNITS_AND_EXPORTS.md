# Coordinate units, reference scaling and export sources

The Construct inspector declares source coordinate units (`model`, `mm`, `cm`,
`m`, `in`, `ft`). This saved view declaration does not rescale coordinates.
Scale to reference uses the actual length of the indexed source edge and a
positive desired length; it creates an independently replayable operation.
Camera zoom and display rotation remain separate.

The export dialog selects Base or Derived intrinsic geometry directly and an
output unit. Physical conversion requires declared physical source units; a
unitless source cannot silently become millimeters. Factors are exact rational
SI definitions (one inch is 127/5000 meter, one foot 381/1250 meter), then applied
in float64. Scaling an exact rational model therefore reports its downgraded
numeric guarantee. Physical VRML uses meters. DXF edge exports include an
INSUNITS header. OFF and JSON retain complete source incidence and attributes;
other codecs retain their explicitly supported boundaries and report color or
entity losses. JSON model imports revalidate source geometry, recompute measures
and exact certificates, and preserve file provenance.

Native tests independently check a 25.4-mm cube becoming a one-inch cube,
format coordinates, units, incidence, rejected declarations, source immutability
and reference-operation replay. Seven actual desktop workflows pass in
`artifacts/units-export-smoke-DpE3aj/result.json`, including direct derived
section export and JSON reopening. Packaged verification remains pending.

Projected display-coordinate export, full material interchange and generalized
solid STL/POV domains remain under development; these bounded workflows do not
close MEAS-03 or IO-02 across the original specification.


## Packaged 0.11.0 verification

The shipped 0.11.0 desktop passed this workflow with development Python disabled.
Evidence: [artifacts/units-export-smoke-Jp6w2E/result.json](../artifacts/units-export-smoke-Jp6w2E/result.json). This supersedes earlier
packaged-verification-pending notes for the tested subset. It does not establish
requirement-wide competitor conformance. The actual portable launcher and all
3,064 linked-source hashes also passed; see [release evidence](../artifacts/release-0.11.0.json).
