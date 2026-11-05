"""Small dispatch adapter; standard native recipes own history and replay."""
from .geometry import GeometryError
from .face_subdivision import subdivide_faces
from .conway import conway
from .zonohedron_extensions import axis_zonohedron, add_zones, symmetry_axes

OPERATIONS={'subdivide-faces':(subdivide_faces,{'method','height'}),
    'conway':(conway,{'notation','height'}),'axis-zonohedron':(axis_zonohedron,{'fold','axis_ids','edge_length'}),
    'add-zones':(add_zones,{'directions','edge_length'}),'symmetry-axes':(symmetry_axes,{'fold'})}


def dispatch_w12(request):
    if request.get('algorithmVersion','0.1.0')!='0.1.0':raise GeometryError('Unsupported construction algorithm version.')
    fn,allowed=OPERATIONS[request['op']];params=request.get('params',{})
    if type(params) is not dict or set(params)-allowed:raise GeometryError('Unsupported construction controls.')
    try:return fn(request.get('model'),**params)
    except GeometryError:raise
    except (ValueError,TypeError,KeyError,IndexError,OverflowError,AttributeError) as error:
        raise GeometryError('Malformed construction source or controls: '+str(error)) from error
