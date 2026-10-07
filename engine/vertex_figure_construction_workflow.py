"""Strict bounded dispatch for finite vertex-figure candidate construction."""
from .geometry import GeometryError
from .history import _json_bytes
from .vertex_figure_construction import vertex_figure_candidates,construct_from_vertex_figure,VERSION

OPERATIONS=('vertex-figure-candidates','construct-from-vertex-figure')


def dispatch_vertex_figure_construction(request):
    try:
        _json_bytes(request,16*1024*1024)
        if type(request) is not dict or not {'op','model','params'}<=set(request) or set(request)-{'op','model','params','id','algorithmVersion'}:
            raise GeometryError('Vertex-figure construction requires op/model/params and optional version/correlation.')
        if request.get('algorithmVersion',VERSION)!=VERSION:raise GeometryError('Unsupported vertex-figure construction version.')
        params=request['params']
        if type(params) is not dict:raise GeometryError('Vertex-figure construction parameters must be a literal object.')
        if request['op']=='vertex-figure-candidates':
            if set(params)-{'domain'}:raise GeometryError('Candidate search accepts only domain.')
            result=vertex_figure_candidates(request['model'],**params)
        elif request['op']=='construct-from-vertex-figure':
            if 'candidate' not in params or set(params)-{'candidate','edge_length'}:
                raise GeometryError('Construction requires candidate and optional output edge_length.')
            result=construct_from_vertex_figure(request['model'],**params)
        else:raise GeometryError('Unsupported vertex-figure construction operation.')
        _json_bytes(result,32*1024*1024)
        return result
    except GeometryError:raise
    except (ArithmeticError,TypeError,ValueError,KeyError,AttributeError,RecursionError) as exc:
        raise GeometryError('Malformed vertex-figure construction: '+str(exc)) from exc
