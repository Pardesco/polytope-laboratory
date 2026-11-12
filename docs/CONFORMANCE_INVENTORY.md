# Option conformance inventory (R5-DOMAINS)

The [inventory](conformance/inventory.json) contains 139 scenario records for
37 requirement rows, including all 29 partial rows in this package's scope.
It records options, source dimensions/classes, parameter limits, versioned
expectations, existing fixtures, UI entry IDs and actionable unverified work.
It adds no engine operation, UI control or dependency and changes no ledger status.

Start with [INDEX.md](conformance/INDEX.md) for the format, UI routes, evidence
definitions and follow-up priorities. [VERIFICATION.md](conformance/VERIFICATION.md)
records the commands actually executed. Validate the inventory offline with:

```powershell
python -m pytest tests/test_conformance_inventory.py -q -p no:cacheprovider
```

The installed 5.4 manual was read without launching its application; its SHA256
matches the prior static report. Public live manuals and the 6.0 release-history
entry supply documentation, not executed 6.0 results. No purchase or installation
is needed. Competitor comparisons, shipped desktop checks and hardware calibration
remain explicitly unverified. Generalized domains and exact arithmetic retain
their existing bounded contracts.
