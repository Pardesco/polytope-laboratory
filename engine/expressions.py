"""Bounded equation grammar and AST interpreter; never evaluates program code."""
import ast
import math
import operator
import re
from fractions import Fraction
from .geometry import GeometryError

MAX_RATIONAL_BITS = 12000
MAX_LITERAL_EXPONENT = 3000
POLYGON_FUNCTIONS = {'faceRad', 'faceAngle', 'diag'}
CONSTANTS = {'pi': math.pi, 'e': math.e, 'phi': (1 + math.sqrt(5)) / 2}
CONSTANTS.update({'tau': CONSTANTS['phi'], 'g': CONSTANTS['phi']})


def _degree_trig(name, value):
    # Reduce exact rational degrees before conversion to avoid huge-angle loss.
    angle = value % (180 if name == 'tand' else 360)
    if name == 'tand':
        if angle == 90:
            raise GeometryError('tand is undefined at odd multiples of 90 degrees.')
        centered = angle if angle < 90 else angle - 180
        if abs(centered) > 45:
            gap = (90 if centered > 0 else -90) - centered
            return 1 / math.tan(math.radians(float(gap)))
        return math.tan(math.radians(float(centered)))
    quadrant = int(angle // 90)
    remainder = angle - quadrant * 90
    complement = remainder > 45
    theta = math.radians(float(90 - remainder if complement else remainder))
    sine, cosine = math.sin(theta), math.cos(theta)
    if complement:
        sine, cosine = cosine, sine
    return (sine, cosine, -sine, -cosine)[quadrant] if name == 'sind' else (cosine, -sine, -cosine, sine)[quadrant]


FUNCTIONS = {name: getattr(math, name) for name in ('sqrt', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'exp', 'log', 'floor', 'ceil')}
FUNCTIONS.update({'abs': abs, 'min': min, 'max': max, 'deg': math.radians,
                  'r': math.sqrt, 'chord': lambda n: 2 * math.sin(math.pi / n)})
BINARY = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul, ast.Div: operator.truediv, ast.Pow: operator.pow, ast.Mod: operator.mod}
TOKEN = re.compile(r'(?P<number>(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?)|(?P<name>[A-Za-z_]+)|(?P<op>\*\*|[+\-*/%^(),])')


def _bounded(value):
    if isinstance(value, Fraction) and max(value.numerator.bit_length(), value.denominator.bit_length()) > MAX_RATIONAL_BITS:
        raise GeometryError('Exact rational intermediate exceeds the expression resource limit.')
    if isinstance(value, complex) or not math.isfinite(float(value)) or abs(value) > 1e100:
        raise GeometryError('Expression must have a finite real result within ±1e100.')
    return value


def _literal(text):
    exponent = re.search(r'[eE]([+-]?\d+)$', text)
    if exponent and abs(int(exponent.group(1))) > MAX_LITERAL_EXPONENT:
        raise GeometryError('Scientific literal exponent exceeds the expression resource limit.')
    return _bounded(Fraction(text))


class _EquationParser:
    """Construct only numeric/whitelisted AST nodes, including implied products.

    Polygon arguments are parsed as literal integer pairs before arithmetic;
    ordinary divisions elsewhere retain Fraction semantics.
    """
    def __init__(self, text):
        self.tokens = []
        cursor = 0
        while cursor < len(text):
            if text[cursor].isspace():
                cursor += 1
                continue
            token = TOKEN.match(text, cursor)
            if token is None:
                raise GeometryError(f'Invalid equation character at position {cursor + 1}.')
            self.tokens.append((token.lastgroup, token.group(), cursor))
            cursor = token.end()
        self.tokens.append(('end', '', len(text)))
        self.cursor = 0

    def peek(self):
        return self.tokens[self.cursor]

    def take(self, expected=None):
        token = self.peek()
        if expected is not None and token[1] != expected:
            raise GeometryError(f'Expected {expected!r} at equation position {token[2] + 1}.')
        self.cursor += 1
        return token

    def parse(self):
        result = ast.Expression(self.expression())
        if self.peek()[0] != 'end':
            raise GeometryError(f'Unexpected token at equation position {self.peek()[2] + 1}.')
        if sum(1 for _ in ast.walk(result)) > 100:
            raise GeometryError('Expression is too complex.')
        return result

    def expression(self, minimum=0, depth=0):
        if depth > 64:
            raise GeometryError('Expression nesting exceeds the resource limit.')
        left = self.prefix(depth)
        operators = {'+': (10, 11, ast.Add), '-': (10, 11, ast.Sub),
                     '*': (20, 21, ast.Mult), '/': (20, 21, ast.Div), '%': (20, 21, ast.Mod),
                     '^': (40, 40, ast.Pow), '**': (40, 40, ast.Pow)}
        while True:
            kind, text, _ = self.peek()
            previous = self.tokens[self.cursor - 1]
            implied = text == '(' or kind == 'name' or kind == 'number' and (previous[1] == ')' or previous[0] == 'name')
            if implied:
                before, after, operation = operators['*']
            elif text in operators:
                before, after, operation = operators[text]
            else:
                break
            if before < minimum:
                break
            if not implied:
                self.take()
            left = ast.BinOp(left=left, op=operation(), right=self.expression(after, depth + 1))
        return left

    def prefix(self, depth):
        kind, text, position = self.take()
        if text in ('+', '-'):
            return ast.UnaryOp(op=ast.UAdd() if text == '+' else ast.USub(), operand=self.expression(30, depth + 1))
        if kind == 'number':
            return ast.Constant(value=_literal(text))
        if text == '(':
            value = self.expression(0, depth + 1)
            self.take(')')
            return value
        if kind == 'name':
            if text in CONSTANTS:
                return ast.Name(id=text, ctx=ast.Load())
            if text not in FUNCTIONS and text not in POLYGON_FUNCTIONS and text not in ('sind', 'cosd', 'tand'):
                raise GeometryError(f'Unknown equation name {text!r}.')
            if text == 'r' and self.peek()[0] == 'number':
                return ast.Call(func=ast.Name(id='sqrt', ctx=ast.Load()), args=[ast.Constant(value=_literal(self.take()[1]))], keywords=[])
            self.take('(')
            if text in POLYGON_FUNCTIONS:
                args = [self.polygon_integer()]
                if self.peek()[1] == '/':
                    self.take('/')
                    args.append(self.polygon_integer())
                else:
                    args.append(ast.Constant(value=Fraction(1)))
            else:
                args = [self.expression(0, depth + 1)]
                while self.peek()[1] == ',':
                    self.take(',')
                    if len(args) >= 8:
                        raise GeometryError('A numeric function accepts at most eight arguments.')
                    args.append(self.expression(0, depth + 1))
            self.take(')')
            return ast.Call(func=ast.Name(id=text, ctx=ast.Load()), args=args, keywords=[])
        raise GeometryError(f'Expected a number, constant or function at equation position {position + 1}.')

    def polygon_integer(self):
        kind, text, _ = self.take()
        if kind != 'number' or not text.isascii() or not text.isdigit():
            raise GeometryError('Polygon helpers require a literal positive integer n or n/d, not an arithmetic argument.')
        return ast.Constant(value=_literal(text))


def _polygon_value(name, n, d):
    if n < 3 or d <= 0 or d >= n or 2 * d == n:
        raise GeometryError('Polygon helpers require n >= 3 and 0 < d < n, excluding a degenerate half-turn polygon.')
    # Keep retrograde signs for the oriented corner angle. Positive lengths use
    # the complementary step, avoiding loss near d/n = 1 or the half-turn.
    if name == 'faceAngle':
        return Fraction(180) - 360 * d / n
    step = min(d, n - d)
    if name == 'faceRad':
        return 1 / (2 * math.sin(math.pi * float(step / n)))
    return 2 * math.sin(math.pi * float((n - 2 * step) / n) / 2)


def evaluate(expression):
    if not isinstance(expression, str) or len(expression) > 512:
        raise GeometryError('Expression must contain at most 512 characters.')
    try:
        root = _EquationParser(expression).parse()
        def visit(node):
            if isinstance(node, ast.Constant) and isinstance(node.value, Fraction):
                return node.value
            if isinstance(node, ast.Name) and node.id in CONSTANTS:
                return CONSTANTS[node.id]
            if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub)):
                return visit(node.operand) * (-1 if isinstance(node.op, ast.USub) else 1)
            if isinstance(node, ast.BinOp) and type(node.op) in BINARY:
                left, right = visit(node.left), visit(node.right)
                if isinstance(node.op, ast.Pow):
                    if abs(right) > 100:
                        raise GeometryError('Exponent magnitude exceeds 100.')
                    if isinstance(left, Fraction) and isinstance(right, Fraction) and right.denominator == 1:
                        projected_bits = max(left.numerator.bit_length(), left.denominator.bit_length()) * abs(right.numerator)
                        if projected_bits > MAX_RATIONAL_BITS:
                            raise GeometryError('Exact rational power exceeds the expression resource limit.')
                result = BINARY[type(node.op)](left, right)
            elif isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and not node.keywords and 1 <= len(node.args) <= 8:
                name = node.func.id
                args = [visit(a) for a in node.args]
                if name in POLYGON_FUNCTIONS:
                    result = _polygon_value(name, *args)
                elif name in ('sind', 'cosd', 'tand'):
                    if len(args) != 1:
                        raise GeometryError('Degree trig functions require one argument.')
                    result = _degree_trig(name, args[0])
                elif name in ('abs', 'min', 'max'):
                    result = FUNCTIONS[name](*args)
                elif name in FUNCTIONS:
                    result = FUNCTIONS[name](*[float(a) for a in args])
                else:
                    raise GeometryError('Only documented numeric functions are allowed.')
            else:
                raise GeometryError('Only arithmetic, documented constants and numeric functions are allowed.')
            return _bounded(result)
        value = visit(root.body)
        return {'value': float(value), 'exactRational': str(value) if isinstance(value, Fraction) else None,
                'mode': 'rational-exact' if isinstance(value, Fraction) else 'float64-approximate'}
    except (SyntaxError, OverflowError, ZeroDivisionError, TypeError, ValueError, RecursionError) as exc:
        raise GeometryError(f'Invalid expression: {exc}') from exc


def exact_orientation(points):
    """Exact determinant relative to supplied rational/decimal strings."""
    if len(points) not in (3, 4, 5) or any(len(p) != len(points)-1 for p in points):
        raise GeometryError('Orientation requires d+1 points in d dimensions, d=2,3,4.')
    try:
        p = [[Fraction(str(x)) for x in row] for row in points]
    except (ValueError, ZeroDivisionError) as exc:
        raise GeometryError('Coordinates must be rational or finite decimal strings.') from exc
    a = [[x-y for x, y in zip(row, p[0])] for row in p[1:]]
    determinant = Fraction(1)
    for k in range(len(a)):
        pivot = next((i for i in range(k, len(a)) if a[i][k]), None)
        if pivot is None:
            determinant = Fraction(0); break
        if pivot != k:
            a[k], a[pivot] = a[pivot], a[k]; determinant *= -1
        value = a[k][k]
        determinant *= value
        for i in range(k+1, len(a)):
            ratio = a[i][k] / value
            for j in range(k+1, len(a)):
                a[i][j] -= ratio * a[k][j]
    return {'determinant': str(determinant), 'sign': (determinant > 0) - (determinant < 0),
            'mode': 'rational-exact', 'interpretation': 'Exact relative to supplied rational/decimal values; not a certificate of intended algebraic geometry.'}
