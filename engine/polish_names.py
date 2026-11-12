"""Descriptive result names; these do not assert catalog identity."""


def incidence_cut_name(source, amount):
    action = 'Quasitruncation' if amount > 0.5 else 'Rectification' if amount == 0.5 else 'Truncation'
    suffix = '' if amount == 0.5 else f' (edge fraction {amount:.8g})'
    return action + ' of ' + source.get('name', 'source') + suffix


def basic_construction_name(kind, parameters):
    if kind == 'block':
        dimensions = ' × '.join(f'{n:g}' for n in parameters['dimensions'])
        subdivisions = ' × '.join(str(n) for n in parameters['subdivisions'])
        return f'Subdivided block {dimensions} ({subdivisions} subdivisions)'
    if kind == 'triangular-grid':
        shape = 'Hexagonal' if parameters.get('shape') == 'hexagon' else 'Triangular'
        fold = parameters.get('fold_angle', 0)
        suffix = f', fold {fold:g}°' if fold else ''
        return f'{shape} grid ({parameters["subdivisions"]} subdivisions{suffix})'
    return {'edge-tetrahedron': 'Edge-defined tetrahedron', 'triangular-prism': 'Irregular triangular prism'}[kind]
