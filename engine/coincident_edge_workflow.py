"""Read-only source assembly jobs with strict source/parameter ownership."""
from .coincident_edge_assembly import (VERSION,public_qualification,build_assembly_net,edit_assembly,assembly_pages,validate_assembly_state)
from .nets import fold_net
from .geometry import GeometryError
from .automatic_faceting_workflow import _portable,_structured
from .automatic_faceting import _hash

@_structured
def dispatch_assembly(request,*,cancelled=None):
    original=request;ownership=_hash(request);request=_portable(request,32*1024*1024)
    if type(request) is not dict or set(request)-{'op','model','params','id','algorithmVersion'} or not {'op','model','params'}<=set(request) or request.get('algorithmVersion',VERSION)!=VERSION:raise GeometryError('Source assembly requires exact bounded op/model/params and supported version.')
    if type(request['params']) is not dict:raise GeometryError('Assembly parameters require a literal record.')
    source=request['model'];p=request['params'];op=request['op']
    def publish(result):
        if _hash(original)!=ownership:raise GeometryError('Assembly source request changed before publication.')
        if cancelled is not None and cancelled():raise GeometryError('Assembly canceled before publication.')
        return _portable(result,64*1024*1024)
    if op=='coincident-edge-qualify':
        if p:raise GeometryError('Source qualification takes no inferred pairing parameters.')
        return publish(public_qualification(source,cancelled=cancelled))
    if op=='coincident-edge-net':
        if not {'recipe'}<=set(p) or set(p)-{'recipe','element_annotations'}:raise GeometryError('Assembly net requires a literal recipe and optional source annotations.')
        return publish(build_assembly_net(source,p['recipe'],element_annotations=p.get('element_annotations'),cancelled=cancelled))
    if op=='coincident-edge-edit':
        if not {'recipe','action'}<=set(p) or set(p)-{'recipe','action','connection','component','translation','angle','element_annotations'}:raise GeometryError('Assembly edit requires exact recipe/action and matching edit fields.')
        return publish(edit_assembly(source,p['recipe'],p['action'],element_annotations=p.get('element_annotations'),connection=p.get('connection'),component=p.get('component'),translation=p.get('translation'),angle=p.get('angle',0),cancelled=cancelled))
    if op=='coincident-edge-pages':
        if not {'recipe'}<=set(p) or set(p)-{'recipe','element_annotations','paper'}:raise GeometryError('Assembly pages require literal recipe and optional annotations/paper.')
        paper=p.get('paper',{})
        if type(paper) is not dict or set(paper)-{'paper','orientation','width_mm','height_mm','margin_mm','gap_mm','allow_rotation'}:raise GeometryError('Choose bounded physical paper parameters; assembly does not invent color-separated source topology.')
        return publish(assembly_pages(source,p['recipe'],element_annotations=p.get('element_annotations'),paper=paper,cancelled=cancelled))
    if op=='coincident-edge-fold':
        if set(p) not in ({'recipe','fraction'},{'recipe','fraction','element_annotations'}):raise GeometryError('Assembly folding requires a reconstructed literal recipe and fraction.')
        if type(p['fraction']) not in (int,float):raise GeometryError('Assembly fold fraction requires a literal finite number.')
        net=build_assembly_net(source,p['recipe'],element_annotations=p.get('element_annotations'),cancelled=cancelled);return publish(fold_net(net,p['fraction']))
    if op=='coincident-edge-restore':
        if set(p) not in ({'state'},{'state','element_annotations'}):raise GeometryError('Assembly restore requires a compact saved state.')
        state=validate_assembly_state(source,p['state'],element_annotations=p.get('element_annotations'),cancelled=cancelled)
        return publish(build_assembly_net(source,state['states'][state['cursor']],element_annotations=p.get('element_annotations'),cancelled=cancelled))
    raise GeometryError('Unsupported coincident-edge assembly operation.')
