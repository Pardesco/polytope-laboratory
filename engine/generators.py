"""Independently generated convex and regular-star references; no copied meshes."""
from itertools import product, permutations
import math
import numpy as np
from .geometry import hull, GeometryError

CATALOG = [
    {'key': 'tetrahedron', 'name': 'Tetrahedron', 'dimension': 3, 'symbol': '{3,3}', 'family': 'Platonic', 'counts': [4,6,4,0]},
    {'key': 'cube', 'name': 'Cube', 'dimension': 3, 'symbol': '{4,3}', 'family': 'Platonic', 'counts': [8,12,6,0]},
    {'key': 'octahedron', 'name': 'Octahedron', 'dimension': 3, 'symbol': '{3,4}', 'family': 'Platonic', 'counts': [6,12,8,0]},
    {'key': 'dodecahedron', 'name': 'Dodecahedron', 'dimension': 3, 'symbol': '{5,3}', 'family': 'Platonic', 'counts': [20,30,12,0]},
    {'key': 'icosahedron', 'name': 'Icosahedron', 'dimension': 3, 'symbol': '{3,5}', 'family': 'Platonic', 'counts': [12,30,20,0]},
    {'key': 'simplex4', 'name': '5-cell', 'dimension': 4, 'symbol': '{3,3,3}', 'family': 'Regular convex', 'counts': [5,10,10,5]},
    {'key': 'tesseract', 'name': 'Tesseract', 'dimension': 4, 'symbol': '{4,3,3}', 'family': 'Regular convex', 'counts': [16,32,24,8]},
    {'key': 'cross4', 'name': '16-cell', 'dimension': 4, 'symbol': '{3,3,4}', 'family': 'Regular convex', 'counts': [8,24,32,16]},
    {'key': 'cell24', 'name': '24-cell', 'dimension': 4, 'symbol': '{3,4,3}', 'family': 'Regular convex', 'counts': [24,96,96,24]},
    {'key': 'cell120', 'name': '120-cell', 'dimension': 4, 'symbol': '{5,3,3}', 'family': 'Regular convex', 'counts': [600,1200,720,120]},
    {'key': 'cell600', 'name': '600-cell', 'dimension': 4, 'symbol': '{3,3,5}', 'family': 'Regular convex', 'counts': [120,720,1200,600]},
    {'key': 'cuboctahedron', 'name': 'Cuboctahedron', 'dimension': 3, 'symbol': 'r{4,3}', 'family': 'Archimedean', 'counts': [12,24,14,0]},
    {'key': 'icosidodecahedron', 'name': 'Icosidodecahedron', 'dimension': 3, 'symbol': 'r{5,3}', 'family': 'Archimedean', 'counts': [30,60,32,0]},
    {'key': 'truncated-tetrahedron', 'name': 'Truncated tetrahedron', 'dimension': 3, 'family': 'Archimedean', 'counts': [12,18,8,0]},
    {'key': 'truncated-cube', 'name': 'Truncated cube', 'dimension': 3, 'family': 'Archimedean', 'counts': [24,36,14,0]},
    {'key': 'truncated-octahedron', 'name': 'Truncated octahedron', 'dimension': 3, 'family': 'Archimedean', 'counts': [24,36,14,0]},
    {'key': 'truncated-dodecahedron', 'name': 'Truncated dodecahedron', 'dimension': 3, 'family': 'Archimedean', 'counts': [60,90,32,0]},
    {'key': 'truncated-icosahedron', 'name': 'Truncated icosahedron', 'dimension': 3, 'family': 'Archimedean', 'counts': [60,90,32,0]},
    {'key': 'rhombicuboctahedron', 'name': 'Rhombicuboctahedron', 'dimension': 3, 'family': 'Archimedean', 'counts': [24,48,26,0]},
    {'key': 'truncated-cuboctahedron', 'name': 'Truncated cuboctahedron', 'dimension': 3, 'family': 'Archimedean', 'counts': [48,72,26,0]},
    {'key': 'rhombicosidodecahedron', 'name': 'Rhombicosidodecahedron', 'dimension': 3, 'family': 'Archimedean', 'counts': [60,120,62,0]},
    {'key': 'truncated-icosidodecahedron', 'name': 'Truncated icosidodecahedron', 'dimension': 3, 'family': 'Archimedean', 'counts': [120,180,62,0]},
]

for key, name, symbol, counts in (
    ('snub-cube', 'Snub cube', 's{4,3}', [24,60,38,0]),
    ('snub-dodecahedron', 'Snub dodecahedron', 's{5,3}', [60,150,92,0])
):
    for suffix, form in (('', 'A'), ('-mirror', 'B')):
        CATALOG.append({'key':key+suffix,'name':name+' ('+form+')','dimension':3,'symbol':symbol,
                        'family':'Archimedean','counts':counts,'chiral':True,'enantiomorph':form,
                        'aliases':[name, 'mirror '+name] if suffix else [name]})

CATALAN_SOURCES = {
    'triakis-tetrahedron': 'truncated-tetrahedron',
    'rhombic-dodecahedron': 'cuboctahedron',
    'triakis-octahedron': 'truncated-cube',
    'tetrakis-hexahedron': 'truncated-octahedron',
    'pentakis-dodecahedron': 'truncated-icosahedron',
    'triakis-icosahedron': 'truncated-dodecahedron',
    'rhombic-triacontahedron': 'icosidodecahedron',
    'deltoidal-icositetrahedron': 'rhombicuboctahedron',
    'disdyakis-dodecahedron': 'truncated-cuboctahedron',
    'pentagonal-icositetrahedron': 'snub-cube',
    'deltoidal-hexecontahedron': 'rhombicosidodecahedron',
    'disdyakis-triacontahedron': 'truncated-icosidodecahedron',
    'pentagonal-hexecontahedron': 'snub-dodecahedron'
}
for key, source in list(CATALAN_SOURCES.items()):
    if source.startswith('snub-'):
        CATALAN_SOURCES[key+'-mirror']=source+'-mirror'
for key, source in CATALAN_SOURCES.items():
    primal=next(e for e in CATALOG if e['key']==source)
    name=key.removesuffix('-mirror').replace('-', ' ').capitalize()
    if primal.get('chiral'):name+=' ('+primal['enantiomorph']+')'
    CATALOG.append({'key':key,'name':name,'dimension':3,'family':'Catalan','counts':[primal['counts'][2],primal['counts'][1],primal['counts'][0],0],
                    'dualOf':source,'edgeUniform':key in ('rhombic-dodecahedron','rhombic-triacontahedron'),'faceTransitive':True,
                    'chiral':primal.get('chiral',False),'enantiomorph':primal.get('enantiomorph'),
                    'aliases':['dual of '+primal['name'],key.replace('hexeconta','hexaconta').replace('-',' ')]})
for key, symbol, counts, dual_key in (
    ('small-stellated-dodecahedron','{5/2,5}',[12,30,12,0],'great-dodecahedron'),
    ('great-dodecahedron','{5,5/2}',[12,30,12,0],'small-stellated-dodecahedron'),
    ('great-stellated-dodecahedron','{5/2,3}',[20,30,12,0],'great-icosahedron'),
    ('great-icosahedron','{3,5/2}',[12,30,20,0],'great-stellated-dodecahedron')
):
    CATALOG.append({'key':key,'name':key.replace('-',' ').capitalize(),'dimension':3,'family':'Kepler-Poinsot',
                    'symbol':symbol,'counts':counts,'dualKey':dual_key,'aliases':[key.replace('-',' ')]})


def simplex(d):
    centered = np.eye(d + 1) - np.ones((d + 1, d + 1)) / (d + 1)
    _, _, vt = np.linalg.svd(centered)
    return centered @ vt[:d].T


def even_permutations(values):
    for perm in permutations(range(len(values))):
        if sum(perm[i] > perm[j] for i in range(len(perm)) for j in range(i + 1, len(perm))) % 2 == 0:
            yield [values[i] for i in perm]


def vertices600():
    phi = (1 + math.sqrt(5)) / 2
    vertices = [s * e for e in np.eye(4) for s in (-1, 1)]
    vertices.extend(np.array(v) / 2 for v in product((-1, 1), repeat=4))
    for a, b, c in product((-1, 1), repeat=3):
        vertices.extend(even_permutations([0, a / 2, b * phi / 2, c / (2 * phi)]))
    return np.asarray(vertices)


def regular(key):
    from .catalog import load_catalog_model
    source = load_catalog_model(key)
    if source is not None: return source
    entry = next((e for e in CATALOG if e['key'] == key), None)
    if not entry:
        raise GeometryError(f'Unknown catalog key: {key}')
    d = entry['dimension']
    if key in CATALAN_SOURCES:
        from .operations import dual
        result=dual(regular(CATALAN_SOURCES[key]));result['name']=entry['name'];result['metadata'].update(entry)
        result['metadata']['source']='Polar dual of independent Archimedean reference'
        return result
    if key.startswith('snub-'):
        from .chiral import snub
        result=snub('B3' if key.startswith('snub-cube') else 'H3',entry['enantiomorph'])
        result['metadata'].update(entry)
        return result
    if entry['family']=='Kepler-Poinsot':
        from .star_polyhedra import kepler_poinsot
        result=kepler_poinsot(key);result['metadata'].update(entry)
        return result
    if key in ('tetrahedron', 'simplex4'):
        p = simplex(d)
    elif key in ('cube', 'tesseract'):
        p = list(product((-1, 1), repeat=d))
    elif key in ('octahedron', 'cross4'):
        p = [s * e for e in np.eye(d) for s in (-1, 1)]
    elif key == 'cell24':
        p = sorted(set(v for a in set(permutations([1, 1, 0, 0])) for v in product(*[(-x, x) if x else (0,) for x in a])))
    elif key == 'cell600':
        p = vertices600()
    elif key == 'cell120':
        from .operations import dual
        result = dual(regular('cell600'))
        result['name'] = entry['name']
        result['metadata'].update(entry)
        return result
    elif key == 'icosahedron':
        phi = (1 + math.sqrt(5)) / 2
        p = [v for a in (-1, 1) for b in (-phi, phi) for v in ((0, a, b), (a, b, 0), (b, 0, a))]
    elif key == 'dodecahedron':
        from .operations import dual
        result = dual(regular('icosahedron'))
        result['name'] = entry['name']
        result['metadata'].update(entry)
        return result
    elif key in ('cuboctahedron', 'icosidodecahedron'):
        from .operations import truncate
        result = truncate(regular('cube' if key == 'cuboctahedron' else 'icosahedron'), 0.5)
        result['name'] = entry['name']
        result['metadata'].update(entry)
        return result
    elif key in ('rhombicuboctahedron','truncated-cuboctahedron','rhombicosidodecahedron','truncated-icosidodecahedron'):
        from .wythoff import wythoff
        result=wythoff('B3' if 'cuboctahedron' in key else 'H3',rings=[1,1,1] if key.startswith('truncated-') else [1,0,1])
        result['name']=entry['name'];result['metadata'].update(entry)
        return result
    elif key.startswith('truncated-'):
        from .operations import truncate
        base = key.removeprefix('truncated-')
        t = {'cube': 1 / (2 + math.sqrt(2)), 'dodecahedron': 1 / (2 + (1 + math.sqrt(5)) / 2)}.get(base, 1 / 3)
        result = truncate(regular(base), t)
        result['name'] = entry['name']
        result['metadata'].update(entry)
        return result
    else:
        raise GeometryError('Generator is not implemented.')
    return hull(p, entry['name'], {**entry, 'source': 'Analytic vertex construction', 'redistribution': 'Original generated geometry'})


def polygon(n, radius=1):
    if isinstance(n, bool) or not float(n).is_integer():
        raise GeometryError('Polygon side count must be an integer.')
    n = int(n)
    if not 3 <= n <= 200:
        raise GeometryError('Polygon side count must be in 3–200.')
    if not math.isfinite(radius) or radius <= 0:
        raise GeometryError('Radius must be finite and positive.')
    return np.array([[radius * math.cos(2 * math.pi * i / n), radius * math.sin(2 * math.pi * i / n)] for i in range(n)])


def generate(kind, **params):
    if kind in ('edge-tetrahedron','triangular-prism','triangular-grid'):
        from .basic_solids import basic_solid
        return basic_solid(kind,**params)
    if kind == 'stephanoid':
        from .stephanoids import stephanoid
        unknown = set(params)-{'n','a','b','mode','radius','height'}
        if unknown:
            raise GeometryError('Unknown stephanoid parameters: '+', '.join(sorted(unknown)))
        return stephanoid(**params)
    if kind == 'noble-disphenoid':
        from .specialized_catalog import noble_disphenoid
        return noble_disphenoid(**params)
    if kind == 'polygonal-torus-sweep':
        from .specialized_catalog import torus_sweep
        return torus_sweep(**params)
    if kind == 'crossed-antiprism-segmentotope':
        import json
        from .crossed_segmentotopes import crossed_antiprism_segmentotope, _native_gate
        from .segmentotopes import _bounded_json
        allowed = {'symbol', 'radius', 'base_edge', 'height', 'side_edge', 'depth', 'orientation', 'cap_colors'}
        _bounded_json(params)
        unknown = set(params)-allowed
        if unknown:
            raise GeometryError('Unknown crossed segmentotope generator parameters: '+', '.join(sorted(unknown)))
        retained = json.loads(_bounded_json(params))
        result = crossed_antiprism_segmentotope(**params)
        result['provenance']['generator'] = {'kind': kind, 'parameters': retained}
        return _native_gate(result)
    if kind in ('waterman-fcc', 'waterman-root'):
        import json
        from .history import _json_bytes
        from .waterman import waterman_fcc, centered_waterman_root, MAX_PAYLOAD_BYTES
        allowed = {'radius_squared', 'center'} if kind == 'waterman-fcc' else {'root'}
        unknown = set(params)-allowed
        if unknown:
            raise GeometryError('Unknown '+kind+' generator parameters: '+', '.join(sorted(unknown)))
        # JSON generator inputs use literal fractions or numerator/denominator
        # records. The direct Python kernel additionally accepts Fraction.
        retained = json.loads(_json_bytes(params, MAX_PAYLOAD_BYTES))
        result = waterman_fcc(**params) if kind == 'waterman-fcc' else centered_waterman_root(**params)
        result['provenance']['generator'] = {'kind': kind, 'parameters': retained}
        _json_bytes(result, MAX_PAYLOAD_BYTES)
        return result
    if kind in ('rational-podium', 'rational-antipodium'):
        from copy import deepcopy
        from .podia import rational_podium, rational_antipodium
        allowed = {'n', 'd', 'symbol', 'base_radius', 'top_radius', 'base_edge', 'top_edge', 'height', 'side_edge', 'cap_colors'}
        unknown = set(params)-allowed
        if unknown:
            raise GeometryError('Unknown '+kind+' generator parameters: '+', '.join(sorted(unknown)))
        kernel = rational_podium if kind == 'rational-podium' else rational_antipodium
        result = kernel(**params)
        result['provenance']['generator'] = {'kind': kind, 'parameters': deepcopy(params)}
        from .construction_finalization import finalize_construction
        return finalize_construction(result)
    if kind == 'torus':
        from copy import deepcopy
        from .torus import polyhedral_torus
        unknown = set(params)-{'ring_segments', 'arm_segments', 'arm_ratio', 'ring_radius', 'face_colors'}
        if unknown:
            raise GeometryError('Unknown torus generator parameters: '+', '.join(sorted(unknown)))
        result = polyhedral_torus(**params)
        result['provenance']['generator'] = {'kind': kind, 'parameters': deepcopy(params)}
        return result
    if kind in ('rational-antiprism', 'antiduoprism', 'step-prism'):
        from copy import deepcopy
        from .construction_finalization import finalize_construction
        if kind == 'step-prism':
            from .step_prisms import step_prism
            allowed = {'n', 'step', 'radius'}
            unknown = set(params)-allowed
            if unknown:
                raise GeometryError('Unknown step-prism generator parameters: '+', '.join(sorted(unknown)))
            if not {'n', 'step'} <= params.keys():
                raise GeometryError('Step-prism generation requires literal n and signed step integers.')
            result = step_prism(**params)
        else:
            from .antiprisms import rational_antiprism
            allowed = {'n', 'd', 'symbol', 'radius', 'base_edge', 'height', 'side_edge', 'cap_colors'}
            if kind == 'antiduoprism':
                allowed.add('interval_height')
            unknown = set(params)-allowed
            if unknown:
                raise GeometryError('Unknown '+kind+' generator parameters: '+', '.join(sorted(unknown)))
            values = dict(params)
            interval_height = values.pop('interval_height', 1.0)
            result = rational_antiprism(**values)
            if kind == 'antiduoprism':
                from .prisms import polyhedron_prism
                result = polyhedron_prism(result, height=interval_height)
        result['provenance']['generator'] = {'kind': kind, 'parameters': deepcopy(params)}
        return finalize_construction(result)
    if kind == 'polygon-product':
        from copy import deepcopy
        from .products import polygon_product
        unknown = set(params)-{'left', 'right'}
        if unknown:
            raise GeometryError('Unknown polygon product generator parameters: '+', '.join(sorted(unknown)))
        factors = []
        for name in ('left', 'right'):
            factor = params.get(name)
            if type(factor) is not dict:
                raise GeometryError(f'Polygon product requires a {name} factor parameter object.')
            if any(type(key) is not str for key in factor):
                raise GeometryError('Polygon product factor parameter names must be strings.')
            unknown_factor = set(factor)-{'symbol', 'n', 'd', 'radius'}
            if unknown_factor:
                raise GeometryError('Unknown polygon product '+name+' factor parameters: '+', '.join(sorted(unknown_factor)))
            if not {'symbol', 'n'} & factor.keys():
                raise GeometryError(f'Polygon product {name} factor requires a literal symbol or explicit n/d parameters.')
            factors.append(generate('regular-star-polygon', **factor))
        result = polygon_product(*factors)
        result['provenance']['generator'] = {'kind': kind, 'parameters': deepcopy(params)}
        from .construction_finalization import finalize_construction
        return finalize_construction(result)
    if kind == 'regular-star-polygon':
        from .star_polygons import parse_polygon_symbol, regular_star_polygon
        unknown = set(params)-{'symbol', 'n', 'd', 'radius'}
        if unknown:
            raise GeometryError('Unknown regular polygon generator parameters: '+', '.join(sorted(unknown)))
        values = dict(params)
        if 'symbol' in values and ('n' in values or 'd' in values):
            raise GeometryError('Use a literal polygon symbol or explicit n/d integer parameters, not both.')
        if not {'symbol', 'n', 'd'} & values.keys():
            values['symbol'] = '5/2'
        if 'symbol' in values:
            values.update(parse_polygon_symbol(values.pop('symbol')))
        if 'n' not in values:
            raise GeometryError('Regular polygon generation requires n or a literal n/d symbol.')
        return regular_star_polygon(**values)
    if kind == 'cupola':
        from .cupola import cupola
        return cupola(**params)
    if kind == 'snub':
        from .chiral import snub
        return snub(**params)
    if kind == 'wythoff':
        from .wythoff import wythoff
        return wythoff(**params)
    if kind == 'regular':
        return regular(params.get('key', 'tesseract'))
    if kind == 'polygon':
        return hull(polygon(params.get('n', 5), float(params.get('radius', 1))), 'Regular polygon')
    if kind == 'duoprism':
        raw_n, raw_m = params.get('n', 5), params.get('m', 5)
        if not float(raw_n).is_integer() or not float(raw_m).is_integer():
            raise GeometryError('Duoprism side counts must be integers.')
        n, m = int(raw_n), int(raw_m)
        if n * m > 4000:
            raise GeometryError('Duoprism limit is 4,000 product vertices.')
        p = [np.concatenate((a, b)) for a in polygon(n) for b in polygon(m)]
        return hull(p, f'{n} × {m} duoprism', {'family': 'Duoprism', 'parameters': {'n': n, 'm': m}})
    if kind in ('prism', 'antiprism', 'pyramid'):
        raw_n = params.get('n', 5)
        if not float(raw_n).is_integer():
            raise GeometryError('Polygon side count must be an integer.')
        n = int(raw_n)
        height = float(params.get('height', 2))
        if not math.isfinite(height) or height <= 0:
            raise GeometryError('Height must be finite and positive.')
        base = polygon(n)
        if kind == 'pyramid':
            p = [[*v, -height / 2] for v in base] + [[0, 0, height / 2]]
        else:
            top = polygon(n)
            if kind == 'antiprism':
                theta = math.pi / n
                top = top @ np.array([[math.cos(theta), math.sin(theta)], [-math.sin(theta), math.cos(theta)]])
            p = [[*v, -height / 2] for v in base] + [[*v, height / 2] for v in top]
        return hull(p, f'{n}-gonal {kind}', {'family': kind, 'parameters': {'n': n, 'height': height}})
    if kind == 'block':
        sizes = [float(v) for v in params.get('sizes', [2, 2, 2])]
        if len(sizes) not in (3, 4) or any(not math.isfinite(v) or v <= 0 for v in sizes):
            raise GeometryError('Block requires three or four positive finite dimensions.')
        return hull(list(product(*[(-s / 2, s / 2) for s in sizes])), 'Block', {'parameters': {'sizes': sizes}})
    if kind == 'waterman':
        raw_radius = params.get('radiusSquared', 10)
        if not float(raw_radius).is_integer():
            raise GeometryError('Waterman squared radius must be an integer in this generator.')
        radius_squared = int(raw_radius)
        if not 2 <= radius_squared <= 400:
            raise GeometryError('Waterman squared radius must be in 2–400.')
        lim = math.isqrt(radius_squared)
        points = [(x, y, z) for x in range(-lim, lim + 1) for y in range(-lim, lim + 1) for z in range(-lim, lim + 1)
                  if (x + y + z) % 2 == 0 and x*x + y*y + z*z <= radius_squared]
        return hull(points, f'Waterman FCC, r²={radius_squared}', {'family': 'Waterman', 'lattice': 'FCC integer-even-sum', 'radiusSquared': radius_squared})
    raise GeometryError(f'Unknown generator: {kind}')
