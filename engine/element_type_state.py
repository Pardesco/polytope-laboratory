"""Saved orbit colors are preferences; computed type tables are never trusted."""

from .geometry import GeometryError


def validate_element_type_view(model, view):
    if 'surfaceColors' in view and view['surfaceColors'] not in ('source', 'face', 'cell', 'face-type', 'cell-type'):
        raise GeometryError('Saved surface color mode is unsupported.')
    selection = view.get('entitySelection')
    if not isinstance(selection, dict) or 'ids' not in selection:
        return
    field = {'vertex': 'vertices', 'edge': 'edges', 'face': 'faces', 'cell': 'cells'}.get(selection.get('kind'))
    ids = selection['ids']
    if (
        not field
        or not isinstance(ids, list)
        or not ids
        or len(ids) > 8192
        or any(type(i) is not int or not 0 <= i < len(model[field]) for i in ids)
        or len(set(ids)) != len(ids)
    ):
        raise GeometryError('Saved element set requires distinct existing source IDs.')
    if type(selection.get('typeLabel')) is not str or len(selection['typeLabel']) > 256:
        raise GeometryError('Saved element type label requires bounded text.')
