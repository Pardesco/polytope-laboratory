# Formatter-proof source tests

This release-preparation slice changes tests only; app controls and IDs are unchanged.

Use tests/helpers/source-match.mjs for source wiring checks. Prefer importing and calling a module, then AST inspection/extraction, then a normalized source pattern. The helper uses the already installed Rollup parser and esbuild; it adds no dependency.

- matchSource / doesNotMatchSource retain regex expectations after syntax formatting is normalized.
- includesSource / indexOfSource / findSource / matchAllSource use the same normalization; compare order within the same source.
- sourceFunction / sourceRange / sourceAssignment / sourceInitializer / sourceProperty / sourceStatement extract original executable code using AST ranges, with explicit existence/uniqueness checks.
- sourceNodes supports structural discovery; sourceStrings supplies decoded JS literal/template text for embedded markup.
- htmlElement extracts a named paired fixture element without assuming one source line. It is not a general HTML parser.

Normalization preserves identifiers, values, operators, literal whitespace and array holes. It ignores comments and formatting trivia, optional arrow parentheses, trailing commas and optional terminal semicolons. Normalized output is for matching, never execution. Source extraction returns the original text. Unsupported languages should use behavior, their native parser, or an explicitly formatting-tolerant pattern.

Regression tests are registered as tests/source-match.test.mjs in test:features. The full inventory, scratch-format procedure and results are in [history/R9_TESTS.md](history/R9_TESTS.md).
