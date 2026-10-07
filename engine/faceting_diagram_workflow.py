"""Strict candidate read-only diagram jobs; geometry adoption stays facet-adopt."""
from copy import deepcopy

from .automatic_faceting import _hash
from .automatic_faceting_workflow import _portable, _structured, INPUT_BYTES, OUTPUT_BYTES, MAX_SAFE_INTEGER
from .augmentation_workflow import bounded_bytes
from .faceting_diagram import (VERSION, build_diagram, restore_state, verify_diagram,
    to_svg, save_state, adoption_parameters)
from .geometry import GeometryError

OPERATION='facet-diagram'


@_structured
def dispatch_diagram(request,*,cancelled=None):
    bounded_bytes(request,OUTPUT_BYTES)
    ownership=_hash(request)
    if (type(request) is not dict or not {'op','model','params'}<=set(request) or
        set(request)-{'op','model','params','id','algorithmVersion'} or request['op']!=OPERATION):
        raise GeometryError('Faceting diagram requires exact op/model/params and optional version/correlation.')
    if request.get('algorithmVersion',VERSION)!=VERSION:raise GeometryError('Unsupported faceting diagram version.')
    correlation=request.get('id')
    if not (correlation is None or type(correlation) is str and 1<=len(correlation)<=128 or
            type(correlation) is int and 0<=correlation<=MAX_SAFE_INTEGER):
        raise GeometryError('Diagram correlation requires a bounded literal ID.')
    source=_portable(request['model'],INPUT_BYTES);params=_portable(request['params'],OUTPUT_BYTES)
    if type(params) is not dict or set(params) not in ({'catalogue','parameters'},{'state'}):
        raise GeometryError('Diagram params require exactly catalogue/parameters or saved state.')
    if 'state' in params:
        bounded_bytes(params['state'],OUTPUT_BYTES)
        state=params['state']
        if type(state) is not dict or _hash(state.get('source'))!=_hash(source):
            raise GeometryError('Saved diagram source attributes/units/incidence changed; rebuild explicitly.')
        diagram=restore_state(state,cancelled=cancelled)
    else:diagram=build_diagram(source,params['catalogue'],params['parameters'],cancelled=cancelled)
    if cancelled is not None and cancelled():
        return {'diagram':{'status':'user-cancelled','diagnostics':['Diagram canceled before publication.'],
                          'sourceGeometryChanged':False},'svg':None,'state':None,'adoptionParameters':None}
    complete=diagram['status']=='complete'
    if complete:
        verify_diagram(source,diagram)
    result={'diagram':diagram,'svg':to_svg(diagram) if complete else None,
        'state':save_state(diagram) if complete else None,
        'adoptionParameters':adoption_parameters(source,diagram) if complete and diagram['adoption'] is not None else None}
    # Native normalized numbers and genuine source attributes remain detached.
    result=_portable(result,OUTPUT_BYTES)
    bounded_bytes(result,OUTPUT_BYTES-1024)
    if _hash(request)!=ownership:raise GeometryError('Diagram request/source ownership changed during evaluation.')
    if cancelled is not None and cancelled():
        return {'diagram':{'status':'user-cancelled','diagnostics':['Diagram canceled before publication.'],
                          'sourceGeometryChanged':False},'svg':None,'state':None,'adoptionParameters':None}
    return deepcopy(result)
