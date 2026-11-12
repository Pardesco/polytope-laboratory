"""Property-scoped exact evidence; numerical validation grants no inheritance."""

from .geometry import GeometryError, identity, validate, TOLERANCE


def validate_exact_evidence(model):
    if model.get('numeric', {}).get('mode') == 'rational-exact':
        from .rational import revalidate_rational_model

        return revalidate_rational_model(model)
    if 'exactSurfaceSection' in model.get('metadata', {}):
        from .exact_surface_sections import revalidate_exact_surface_section

        return revalidate_exact_surface_section(model)
    return None


def drop_exact_guarantees(model, operation):
    had = bool(
        model.get('certificate')
        or model.get('rationalCoordinates')
        or model.get('metadata', {}).get('exactSurfaceSection')
    )
    for field in ('rationalCoordinates', 'rationalFacetEquations', 'certificate'):
        model.pop(field, None)
    model.get('metadata', {}).pop('exactSurfaceSection', None)
    for field in ('predicates', 'constructions', 'exactConstruction'):
        model.get('numeric', {}).pop(field, None)
    if had:
        model.setdefault('numeric', {})['guaranteeLoss'] = {
            'operation': operation,
            'reason': 'Ordinary float64 transform; exact source evidence does not certify the result.',
        }


def precision_report(model, validation=None):
    validation = validate(model) if validation is None else validation
    numeric = model.get('numeric', {})
    section = model.get('metadata', {}).get('exactSurfaceSection')
    claimed = numeric.get('mode') == 'rational-exact' or section is not None
    exact = False
    unresolved = []
    if claimed:
        try:
            validate_exact_evidence(model)
            exact = validation.get('passed') is True
            if not exact:
                unresolved.append('Display geometry failed its structural checks; exact evidence is not qualified.')
        except (GeometryError, ValueError, TypeError, KeyError, IndexError, ArithmeticError) as error:
            unresolved.append(str(error))
    if section is not None:
        property_name = 'rational source-face intersection points, segments and coplanar winding faces'
        interpretation = (
            section.get('coordinatePolicy', 'unresolved source interpretation')
            if type(section) is dict
            else 'unresolved source interpretation'
        )
        algorithm = section.get('algorithmVersion') if type(section) is dict else None
        scope = 'Supplied ordered source faces and declared winding rule; no filled-solid interior, tolerance welding or convexification.'
    else:
        property_name = 'complete convex facet support set relative to supplied rational input'
        interpretation = (
            'Recorded rational literals; decimals denote their supplied decimal values.'
            if claimed
            else 'Supplied float64 coordinates; intended algebraic values are not recovered.'
        )
        certificate = model.get('certificate', {})
        algorithm = (
            certificate.get('algorithmVersion') if claimed and type(certificate) is dict else numeric.get('version')
        )
        scope = (
            'Exhaustive supporting-plane predicates and rational extreme coordinates; candidate boundary must agree.'
        )
    properties = [
        {
            'property': property_name if claimed else 'exact signs and equalities of geometry predicates',
            'status': 'exact' if exact else 'unresolved',
            'scope': scope if claimed else 'Numerical structural checks do not establish exact predicate signs.',
        },
        {'property': 'structural display checks', 'status': 'numerical-pass' if validation.get('passed') else 'failed'},
        {
            'property': 'measurements',
            'status': 'approximate',
            'arithmetic': 'IEEE-754 binary64',
            'inheritedExactness': False,
        },
        {'property': 'display coordinates', 'status': 'approximate', 'arithmetic': 'IEEE-754 binary64'},
    ]
    if not claimed:
        unresolved.append(
            'Exact predicate signs and equalities are unresolved; float64 tolerance checks supply no certified error interval.'
        )
    unresolved.append(
        'Intended algebraic values, general algebraic/interval predicates and exact measurements are not certified.'
    )
    residuals = {}
    if exact:
        residuals['exactPredicateResidual'] = '0 (rational equalities; signs checked exactly)'
        rational = model.get('rationalCoordinates', [])
        from fractions import Fraction

        residuals['maxDisplayCoordinateRoundingError'] = str(
            max(
                (
                    abs(Fraction(float(x)) - Fraction(q))
                    for row, raw in zip(model['vertices'], rational)
                    for x, q in zip(row, raw)
                ),
                default=Fraction(0),
            )
        )
        if section is not None:
            n = list(map(Fraction, section['equation']['normal']))
            b = Fraction(section['equation']['offset'])
            residuals['maxDisplayPlaneEquationResidual'] = str(
                max(
                    (
                        abs(sum((Fraction(float(x)) * a for x, a in zip(row, n)), Fraction(0)) - b)
                        for row in model['vertices']
                    ),
                    default=Fraction(0),
                )
            )
        else:
            residuals['maxDisplayPlaneEquationResidual'] = str(
                max(
                    (
                        abs(
                            sum(
                                (Fraction(float(x)) * Fraction(a) for x, a in zip(model['vertices'][v], plane[:-1])),
                                Fraction(plane[-1]),
                            )
                        )
                        for facet, plane in zip(model['facetVertices'], model['rationalFacetEquations'])
                        for v in facet
                    ),
                    default=Fraction(0),
                )
            )
    scale = None
    if validation.get('passed'):
        vertices = model['vertices']
        scale = max(
            max(float(row[k]) for row in vertices) - min(float(row[k]) for row in vertices)
            for k in range(len(vertices[0]))
        )
    try:
        fingerprint = identity(model)
    except (ValueError, TypeError, KeyError, IndexError):
        fingerprint = None
    limits = {}
    if exact:
        if section is not None:
            limits = dict(section['limits'])
        else:
            from .rational import MAX_EXACT_POINTS

            limits = {
                'inputPoints': MAX_EXACT_POINTS,
                'suppliedPoints': len(model['certificate']['sourceCoordinates']),
                'candidatePlanesTested': model['certificate']['candidatePlaneCount'],
                'exactFacets': model['certificate']['exactFacetCount'],
            }
    fallback = {
        'implemented': False,
        'scope': 'General interval/high-precision predicate fallback and universal exact kernel are separate future work.',
    }
    if exact and model.get('certificate', {}).get('displayAdapter'):
        fallback = {
            'implemented': True,
            'scope': 'Bounded XYZ rational support reconstruction (at most 12 supplied points); exact binary64 support incidence agrees and unchanged display checks pass. General floating hulls are not certified.',
            'evidence': dict(model['certificate']['displayAdapter']),
        }
    return {
        'version': '0.1.0',
        'sourceFingerprint': fingerprint,
        'certificateStatus': 'revalidated' if exact else 'unresolved' if claimed else 'absent',
        'inputInterpretation': interpretation,
        'arithmetic': 'bounded Python Fraction' if exact else 'float64 numerical checks',
        'algorithmVersion': algorithm,
        'tolerance': TOLERANCE,
        'modelCoordinateSpan': scale,
        'limits': limits,
        'toleranceDefinition': 'Numerical structural checks use normalized coordinates; support-plane residual bound is 4 * tolerance * model coordinate span. Individual checks have their own thresholds.',
        'properties': properties,
        'residuals': residuals,
        'unresolved': unresolved,
        'guaranteeLoss': numeric.get('guaranteeLoss'),
        'fallback': fallback,
    }


def validate_with_precision(model):
    report = validate(model)
    report['precision'] = precision_report(model, report)
    return report
