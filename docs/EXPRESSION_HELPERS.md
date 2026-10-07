# Equation entry and polygon helpers

Implemented by `engine/expressions.py` through the existing `expression`
operation. This extends the bounded numeric interpreter; it does not evaluate
Python or JavaScript code. The independent conformance fixtures are in
`tests/test_expression_helpers.py`, with existing kernel regressions in
`tests/test_kernel.py`.

The publisher documents implicit multiplication, golden-ratio aliases, degree
trigonometry, root shorthand and polygon helpers in its equation entry guide.
[Official equations](https://www.software3d.com/Manual/Equations.php?prod=Great)
Its vertex-description discussion and glossary describe retrograde polygon
traversal and the complementary symbol `n/(n-d)`.
[Vertex descriptions](https://mail.software3d.com/VertexDesc.php),
[Glossary](https://software3d.com/Glossary.php)
The supported conventions below are explicit application contracts. In
particular, the signed retrograde helper result and degenerate-input behavior
have not yet been compared with a licensed installed Stella 6.0 application.
The finite original MEAS-04 categories are implemented and now have a dedicated
packaged qualification collector; see `docs/MEAS04_CLOSURE_AUDIT.md`. A ledger
gate closes only after the collector and its actual receipt are reviewed and
applied. Executing or purchasing Stella6 is not an added acceptance condition.

## Supported entry

| Syntax | Meaning / example |
| --- | --- |
| `+ - * / % ^` or `**` | Arithmetic; `^` and `**` are powers. |
| `pi`, `e`, `phi`, `tau`, `g` | `phi`, `tau`, and `g` all mean the golden ratio `(1+sqrt(5))/2`; `tau` does not mean `2*pi`. |
| `sin`, `cos`, `tan` | Radian arguments. `asin`, `acos`, `atan` return radians. |
| `sind`, `cosd`, `tand` | Degree arguments; `cosd(60)` gives approximately `0.5`. Odd multiples of 90 degrees are invalid for `tand`. |
| `deg(x)` | Convert degrees to radians; `cos(deg(60))` remains valid. |
| `sqrt(x)`, `r(x)`, `r2` | Square root; `1+3r2` means `1+3*sqrt(2)`. Bare root shorthand consumes one unsigned decimal/scientific literal. |
| Implied products | `2pi`, `2(3+4)`, `(2-1)(3+1)`, `sqrt(2)3`, and adjacent named functions/constants. |
| Other retained functions | `abs`, `min`, `max`, `exp`, `log`, `floor`, `ceil`, `chord`. |
| Decimal/scientific literals | Read exactly as rational numbers; `.002`, `1e-3`, and long finite decimal strings retain their full digits. |

Names are case-sensitive. Function calls require parentheses except for the
bare `r` shorthand. Adjacent bare numeric literals such as `1 2` are rejected;
they do not silently become a product or a different number. Scientific
notation takes precedence: `2e3` means 2000, while `2e` means `2*e`.

Powers associate to the right: `2^3^2 = 512`. Powers bind more tightly than a
leading sign: `-2^2 = -4`, while `(-2)^2 = 4`. Explicit and implied products
have the same precedence and associate left-to-right with division;
`8/2(2+2) = 16`. Use parentheses whenever a denominator is intended to include
an implied product. `r2^2` means `sqrt(2)^2`; `r(2^2)` takes the root of the
whole parenthesized expression.

## Symbolic polygon arguments

`faceRad(n/d)`, `faceAngle(n/d)` and `diag(n/d)` consume a literal integer
polygon symbol. The denominator defaults to one: `faceRad(4)` means the square
`4/1`. Whitespace around the slash is accepted. Unlike ordinary arithmetic,
the pair is not divided before calling the helper. `faceRad(5/2)` describes a
unit-edge pentagram; it is not `faceRad(2.5)` or half of `faceRad(5)`.

Supported symbols have integer `n >= 3`, `0 < d < n`, and `2d != n`. A half-turn
would give a degenerate two-point component and is refused. Common factors are
allowed: `6/2` consists of triangular components and has the same unit-edge
component measurements as `3/1`. No actual polygon mesh is generated.

Arguments must be literal positive integers. Decimal counts, computed counts,
nested ratios and alternate argument lists are rejected, including
`faceRad(2.5)`, `faceRad(3+2)`, `faceRad((5/2))`, and `faceRad(5,2)`.
Use ordinary arithmetic outside the call to combine a helper result.

For the oriented regular cycle whose step angle is `2*pi*d/n`, the formulas
used by this application are:

| Helper | Definition | Examples |
| --- | --- | --- |
| `faceRad(n/d)` | Positive circumradius at edge length one: `1/(2*sin(pi*d/n))`. | Triangle: `1/sqrt(3)`; square: `1/sqrt(2)`; pentagram: `sqrt((5-sqrt(5))/10)`. |
| `faceAngle(n/d)` | Oriented corner angle in degrees: `180-360*d/n`. Returned exactly as a rational. | Triangle: `60`; pentagram `5/2`: `36`; retrograde pentagram `5/3`: `-36`. |
| `diag(n/d)` | Positive endpoint distance across two successive unit edges: `2*abs(cos(pi*d/n))`. | Square: `sqrt(2)`; pentagon: `phi`; pentagram: `1/phi`. |

`faceAngle` is signed by traversal: its magnitude is the ordinary smaller
angle between incident edge rays, and retrograde traversal makes it negative.
Radius and diagonal are unoriented lengths, so complementary symbols `n/d`
and `n/(n-d)` give identical lengths. This signed angle convention is explicit;
it should not be presented as independently verified installed-competitor
behavior. Very narrow or near-half-turn symbols use exact complementary
fractions before conversion to trigonometry to avoid subtractive rounding.

## Arithmetic guarantees and resource bounds

Arithmetic over rational literals stays rational for addition, subtraction,
multiplication, division, modulo and integral powers. `abs`, `min` and `max`
also preserve rational arguments. Polygon corner angles are rational.
Constants such as `pi` and `phi`, nonintegral powers, roots and trigonometric
functions use approximate float64 results. Algebraically rational results of
approximate functions, such as `sqrt(2)^2` or `cosd(60)`, are not certified exact.

The existing response fields remain `value`, `exactRational`, and `mode`.
`exactRational` records the exact result when available; `value` is its float64
conversion for ordinary consumers and can underflow for an extremely small
exact rational. A `rational-exact` mode does not promise that the separate
float64 `value` contains all rational digits. Degree functions reduce exact
arguments before conversion, including distances from trigonometric poles.

The bounds are 512 input characters, 100 constructed AST nodes, 64 parser
nesting levels, at most eight arguments per generic numeric call, absolute
power exponent at most 100, and finite real literals/intermediate results with
magnitude at most `1e100`. Additional limits are scientific-literal exponent
magnitude at most 3000 and numerator/denominator size at most 12,000 bits each.
Power size is checked before allocation. These additional bounds close the old
tiny-value denominator-growth loophole without changing global interpreter
settings. Domain errors, unknown names, program syntax, invalid symbols and
resource excess produce `GeometryError` rather than executing code.

## Help text for the existing UI

The single-value `expression` operation remains available. Version20 also mounts
`expression-batch` for up to 80,000 values in one atomic real or exact-rational
job. Applicable typed scalar/vector/row/count fields now use `NumericEntry`,
with source/document/units/notes/target ownership and final existing domain
checks. A compact help entry can say:

> Equations: arithmetic and powers; pi, e, phi (also tau/g); radian sin/cos/tan
> or degree sind/cosd/tand; sqrt(2) or r2; implied products such as 2pi or
> (2-1)(3+1). Polygon helpers use literal symbols: faceRad(5/2), faceAngle(5/2),
> diag(5/2), at edge length 1. faceAngle is signed for retrograde symbols.

Expose the examples `cosd(60)`, `1+3r2`, and `diag(5/2)` beside the existing
expression input or in the Guide. Keep the symbolic-polygon explanation and
precedence example accessible in detailed help. Version20 construction counts, animation/tour settings, orientation and layer
matrices now use that grammar through the mounted numeric adapter. Literal
entity indices, polygon symbols, masks, colors, structured JSON and sliders
retain their existing grammar. Exact Waterman and rational-hull entry preserve
canonical rational strings, including distinctions below binary64 resolution.
