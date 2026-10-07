"""Bounded read-only reinforcement and construction measurement jobs."""
from .net_reinforcement import build_reinforcements, restore_reinforcements, measurements, print_pages, VERSION
from engine.geometry import GeometryError
from engine.automatic_faceting_workflow import _portable, _structured, MAX_SAFE_INTEGER
from engine.automatic_faceting import _hash


@_structured
def dispatch_reinforcement(request,*,cancelled=None):
    original=request
    request=_portable(request,32*1024*1024)
    ownership=_hash(original)
    def publish(result):
        if _hash(original)!=ownership:raise GeometryError('Reinforcement request ownership changed during evaluation.')
        if cancelled is not None and cancelled():raise GeometryError('Reinforcement canceled before publication.')
        return _portable(result,64*1024*1024)
    if type(request) is not dict or not {'op','model','params'}<=set(request) or set(request)-{'op','model','params','id','algorithmVersion'}:
        raise GeometryError('Reinforcement jobs require exact op/model/params plus optional ID/version.')
    if request.get('algorithmVersion',VERSION)!=VERSION:raise GeometryError('Unsupported reinforcement algorithm version.')
    correlation=request.get('id')
    if not (correlation is None or type(correlation) is str and 1<=len(correlation)<=128 or type(correlation) is int and 0<=correlation<=MAX_SAFE_INTEGER):raise GeometryError('Use a bounded literal correlation ID.')
    p=request['params'];source=request['model']
    if type(p) is not dict:raise GeometryError('Reinforcement parameters require a record.')
    if request['op']=='net-reinforcement':
        if set(p)=={'state'}:return publish(restore_reinforcements(source,p['state'],cancelled=cancelled))
        if set(p)=={'netParameters','cycles'}:return publish(build_reinforcements(source,p['netParameters'],p['cycles'],cancelled=cancelled))
        raise GeometryError('Reinforcement requires exact netParameters/cycles or saved state.')
    if request['op']=='net-measurements':
        if 'netParameters' not in p or set(p)-{'netParameters','cycles','unit','angle_unit'}:raise GeometryError('Measurements require netParameters and optional cycles/unit/angle_unit.')
        return publish(measurements(source,p['netParameters'],cycles=p.get('cycles'),unit=p.get('unit','mm'),angle_unit=p.get('angle_unit','degrees'),cancelled=cancelled))
    if request['op']=='net-reinforcement-pages':
        if not {'state'}<=set(p) or set(p)-{'state','paper'}:raise GeometryError('Support pages require saved state and optional paper dimensions.')
        paper=p.get('paper',{})
        if type(paper) is not dict or set(paper)-{'width_mm','height_mm','margin_mm'}:raise GeometryError('Support paper accepts only width_mm/height_mm/margin_mm.')
        verified=restore_reinforcements(source,p['state'],cancelled=cancelled)
        result=print_pages(verified,**paper)
        if cancelled is not None and cancelled():raise GeometryError('Support page export canceled before publication.')
        return publish(result)
    raise GeometryError('Unsupported reinforcement operation.')
