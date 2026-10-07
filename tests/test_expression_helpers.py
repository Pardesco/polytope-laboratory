"""Equation expectations from exact arithmetic and independent polygon coordinates."""
import math
from fractions import Fraction

import pytest

from engine.expressions import evaluate
from engine.geometry import GeometryError


def value(expression):
    return evaluate(expression)['value']


def test_documented_aliases_degree_trig_and_root_examples():
    golden = (1 + math.sqrt(5)) / 2
    for alias in ('phi', 'tau', 'g'):
        assert value(alias) == pytest.approx(golden)
        assert value('2 + 1 / ' + alias) == pytest.approx(1 + golden)
    assert value('sind(30)') == pytest.approx(.5)
    assert value('cosd(60)') == pytest.approx(.5)
    assert value('tand(45)') == pytest.approx(1)
    assert value('cos(deg(60))') == pytest.approx(value('cosd(60)'))
    assert value('sin(pi/2)') == pytest.approx(1)
    assert value('1 + 3r2') == pytest.approx(1 + 3 * math.sqrt(2))
    assert value('3r(1+1)') == pytest.approx(3 * math.sqrt(2))
    assert value('r.25') == pytest.approx(.5)
    assert value('r2^2') == pytest.approx(2)
    assert value('r(2^2)') == pytest.approx(2)


@pytest.mark.parametrize('expression,expected', [
    ('(2 - 1)(3 + 1)', '4'), ('2(3+4)', '14'), ('(1+2)3', '9'),
    ('(1/3)(3/2)', '1/2'), ('2^3^2', '512'), ('2**3**2', '512'),
    ('-2^2', '-4'), ('(-2)^2', '4'), ('2^-3', '1/8'),
    ('8/2(2+2)', '16'), ('1/3 + 1/6', '1/2'), ('3%2', '1'),
    ('abs(-1/3)', '1/3'), ('min(1/3,2/3)', '1/3'),
    ('max(1/3,2/3)', '2/3'), ('1e-3 + .002', '3/1000'),
    ('0.12345678901234567890123456789', '12345678901234567890123456789/100000000000000000000000000000'),
])
def test_exact_arithmetic_implied_products_and_precedence(expression, expected):
    result = evaluate(expression)
    assert result['exactRational'] == expected
    assert result['mode'] == 'rational-exact'
    assert result['value'] == float(Fraction(expected))


def test_function_and_constant_adjacency_and_scientific_literals():
    assert value('2pi') == pytest.approx(2 * math.pi)
    assert value('pi2') == pytest.approx(2 * math.pi)
    assert value('2 sin(pi/2)') == pytest.approx(2)
    assert value('sqrt(2) sqrt(2)') == pytest.approx(2)
    assert value('sqrt(4)3') == pytest.approx(6)
    assert value('2e') == pytest.approx(2 * math.e)
    assert evaluate('2e3')['exactRational'] == '2000'
    assert evaluate('2e-3')['exactRational'] == '1/500'


def test_unit_edge_regular_and_star_analytic_helpers():
    assert value('faceRad(3)') == pytest.approx(1 / math.sqrt(3))
    assert value('faceRad(4)') == pytest.approx(1 / math.sqrt(2))
    assert value('diag(4)') == pytest.approx(math.sqrt(2))
    assert value('diag(5)') == pytest.approx((1 + math.sqrt(5)) / 2)
    assert value('diag(5/2)') == pytest.approx((math.sqrt(5) - 1) / 2)
    assert value('faceRad(5/2)') == pytest.approx(math.sqrt((5 - math.sqrt(5)) / 10))
    assert evaluate('faceAngle(3)')['exactRational'] == '60'
    assert evaluate('faceAngle(5/2)')['exactRational'] == '36'
    assert evaluate('faceAngle(7/2)')['exactRational'] == '540/7'
    assert value('faceRad(5/2)') != pytest.approx(value('faceRad(5)/2'))
    assert value('2faceRad(5/2)') == pytest.approx(2 * value('faceRad(5/2)'))


@pytest.mark.parametrize('n,d', [(3, 1), (4, 1), (5, 1), (5, 2), (7, 2), (8, 3), (13, 5), (5, 3), (8, 5), (6, 2), (9, 3)])
def test_helpers_match_independent_stepped_polygon_coordinates(n, d):
    # Construct three points on a unit circle, scale by their measured edge,
    # and measure chords/corner via dot products rather than helper formulas.
    points = [(math.cos(2 * math.pi * i * d / n), math.sin(2 * math.pi * i * d / n)) for i in (-1, 0, 1)]
    distance = lambda a, b: math.hypot(a[0] - b[0], a[1] - b[1])
    edge = distance(points[0], points[1])
    assert value(f'faceRad({n}/{d})') == pytest.approx(1 / edge)
    assert value(f'diag({n}/{d})') == pytest.approx(distance(points[0], points[2]) / edge)
    a = [points[0][i] - points[1][i] for i in (0, 1)]
    b = [points[2][i] - points[1][i] for i in (0, 1)]
    angle = math.degrees(math.acos(max(-1, min(1, sum(x * y for x, y in zip(a, b)) / edge ** 2))))
    assert abs(value(f'faceAngle({n}/{d})')) == pytest.approx(angle)
    assert (value(f'faceAngle({n}/{d})') < 0) == (2 * d > n)


def test_retrograde_common_factor_and_near_degenerate_numerics_are_explicit():
    assert value('faceRad(5/3)') == pytest.approx(value('faceRad(5/2)'))
    assert value('diag(5/3)') == pytest.approx(value('diag(5/2)'))
    assert evaluate('faceAngle(5/3)')['exactRational'] == '-36'
    assert value('faceRad(6/2)') == pytest.approx(value('faceRad(3)'))
    assert value('faceAngle(6/2)') == pytest.approx(60)
    assert value('diag(6/2)') == pytest.approx(1)
    n = 10 ** 40
    # These integer pairs differ although converting their ratio directly to
    # float would round it to 1 or 1/2 and produce incorrect chord lengths.
    assert value(f'faceRad({n}/{n-1})') == pytest.approx(n / (2 * math.pi))
    assert value(f'diag({n}/{n//2-1})') == pytest.approx(2 * math.pi / n, rel=1e-12, abs=0)
    assert evaluate(f'faceAngle({n}/{n//2-1})')['exactRational'] == str(Fraction(360, n))


def test_exact_degree_reduction_and_trig_pole_diagnostics():
    assert value('sind(360000000000000000000000000000030)') == pytest.approx(.5)
    assert value('tand(-135)') == pytest.approx(1)
    assert value('cosd(90+1e-30)') == pytest.approx(-math.pi * 1e-30 / 180, rel=1e-12, abs=0)
    assert value('sind(180+1e-30)') == pytest.approx(-math.pi * 1e-30 / 180, rel=1e-12, abs=0)
    assert value('tand(90-1e-30)') == pytest.approx(180 / (math.pi * 1e-30))
    for expression in ('tand(90)', 'tand(-90)', 'tand(270)', 'tand(360000000000000000000000000000090)'):
        with pytest.raises(GeometryError, match='undefined'):
            evaluate(expression)


@pytest.mark.parametrize('expression', [
    '__import__("os")', '(1).__class__', 'open("file")', 'lambda:1', '[1]', '{1:2}',
    '1;2', '1 #comment', 'a=1', 'sqrt(x=1)', 'sqrt(*[1])', 'True', 'False', '1j',
    '2//1', '1<<2', '0x10', '1 2', '1.2.3', 'sin pi', 'rr2', 'r-2', 'r()',
    'sqrt(-1)', '1/0', 'chord(0)', 'log(0)', '(-1)^.5', '2^101', 'exp(1000)', 'tand(90+1e-100)',
    'faceRad(2)', 'faceRad(5/0)', 'faceRad(5/5)', 'faceRad(4/2)', 'faceRad(-5/2)',
    'faceAngle(5/-2)', 'diag(5/2.0)', 'faceRad(5.0/2)', 'diag(2.5)',
    'diag(5,2)', 'diag((5/2))', 'faceRad(3+2)', 'faceAngle(tau)',
    'max(1,2,3,4,5,6,7,8,9)', 'sind(30,60)', 'cosd()', '',
])
def test_malformed_unsupported_and_malicious_equations_are_refused(expression):
    with pytest.raises(GeometryError):
        evaluate(expression)


def test_resource_limits_cover_expansion_nesting_and_underflow_denominator_growth():
    for expression in ('1' * 513, '+'.join(['1'] * 60), '(' * 66 + '1' + ')' * 66,
                       '1e-1000000000', '1e1000000000', '((1e-100)^30)^100', '(1e-100)^100',
                       '1e101', '10^1000'):
        with pytest.raises(GeometryError):
            evaluate(expression)
    assert evaluate('(1e-100)^30')['mode'] == 'rational-exact'
    assert evaluate('(1e-100)^30')['exactRational'].startswith('1/')
    assert evaluate('1e100')['value'] == 1e100
    assert evaluate('2^100')['exactRational'] == str(2 ** 100)


def test_existing_expression_operation_exposes_the_same_parser():
    from engine.server import dispatch
    result = dispatch({'op': 'expression', 'params': {'expression': 'faceAngle(5/2) + cosd(60)'}})
    assert result['value'] == pytest.approx(36.5)
