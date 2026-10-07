# SPDX-License-Identifier: GPL-3.0-only
"""Source-owned automatic labels, applied by the existing content-list recipe."""
from copy import deepcopy
import hashlib
import html
import math
from .geometry import GeometryError,identity
from . import element_annotations as content

VERSION='0.1.0'
MAX_TARGETS=256
NAMES={'vertex':'vertices','edge':'edges','face':'faces','cell':'cells'}
PREFIXES={'vertex':'V','edge':'E','face':'F','cell':'C'}


def prepare_element_labels(model,kind='vertex',preset='ids',target_ids=None,
                           document=None,overwrite=False,index_base=0,decimals=3,prefix='',color='auto'):
    """Preview deterministic labels; never change geometry or existing content."""
    raw=content._source(model)
    if type(kind) is not str or kind not in NAMES or preset not in ('ids','lengths','coordinates','incidence'):
        raise GeometryError('Choose a source element kind and supported label preset.')
    if preset=='lengths' and kind!='edge' or preset=='coordinates' and kind!='vertex':
        raise GeometryError('Lengths label source edges; coordinates label source vertices.')
    if type(overwrite) is not bool or type(index_base) is not int or index_base not in (0,1) or type(decimals) is not int or not 0<=decimals<=8:
        raise GeometryError('Label overwrite/base/decimals require explicit bounded values.')
    if type(prefix) is not str or len(prefix)>64:
        raise GeometryError('Label prefix must be literal text of at most 64 characters.')
    if color not in ('auto','black','white','yellow','cyan','red'):
        raise GeometryError('Choose a supported label color.')
    ink=('black' if kind=='face' else 'white') if color=='auto' else color
    count=len(model[NAMES[kind]])
    ids=list(range(count)) if target_ids is None else deepcopy(target_ids)
    if type(ids) is not list or not 1<=len(ids)<=MAX_TARGETS or any(type(i) is not int or not 0<=i<count for i in ids) or len(ids)!=len(set(ids)):
        raise GeometryError('Choose 1..256 distinct ordered source IDs; use Shown or explicit IDs for larger models.')
    current=content.new_document(model) if document is None else document
    content.validate_document(current,model)
    existing={entry['index']:entry for entry in current['entries'] if entry['kind']==kind}
    def occupied(index):
        text=existing.get(index,{}).get('text')
        return text is not None and any(run['text'].strip() for run in content.compile_text(text['markup']))
    skipped=[index for index in ids if not overwrite and occupied(index)]
    selected=[index for index in ids if index not in skipped]
    extra=sum(index not in existing for index in selected)
    if len(current['entries'])+extra>content.MAX_ENTRIES:
        raise GeometryError('Preset would exceed the source annotation entry limit.')
    literal=html.escape(prefix or PREFIXES[kind],quote=False)
    units=model.get('metadata',{}).get('coordinateUnits','model')
    units=units if units in ('mm','cm','m','in','ft') else 'model units'
    def number(value):
        if not math.isfinite(value):raise GeometryError('Source metric is outside finite label range.')
        return format(0.0 if value==0 else value,f'.{decimals}f')
    rows=[]
    for index in selected:
        label=f'{literal}<sub>{index+index_base}</sub>'
        if preset=='lengths':
            a,b=model['edges'][index];label+=f' = {number(math.dist(model["vertices"][a],model["vertices"][b]))} {units}'
        elif preset=='coordinates':
            point=model['vertices'][index];label+=' = ('+', '.join(number(x) for x in point)+') '+units
        elif preset=='incidence':
            if kind=='vertex':detail=f'{sum(index in edge for edge in model["edges"])} incident edges'
            elif kind=='edge':
                a,b=model['edges'][index]
                detail=f'{sum(any({a,b}=={x,y} for x,y in zip(face,face[1:]+face[:1])) for face in model["faces"])} incident faces'
            elif kind=='face':detail=f'{len(model["faces"][index])} vertices'
            else:
                faces=model['cells'][index];vertices={v for f in faces for v in model['faces'][f]}
                detail=f'{len(faces)} faces / {len(vertices)} vertices'
            label+=': '+detail
        label=f'<font color="{ink}">{label}</font>'
        runs=content.compile_text(label)
        rows.append({'sourceIndex':index,'markup':label,'text':''.join(run['text'] for run in runs)})
    if sum(len(row['markup']) for row in rows)>128*1024:
        raise GeometryError('Preset text exceeds the ordered-list character bound.')
    return {'algorithmVersion':VERSION,'sourceId':model['id'],'sourceFingerprint':identity(model),
        'sourceSha256':hashlib.sha256(raw).hexdigest(),'kind':kind,'preset':preset,
        'requestedTargetIds':ids,'skippedExistingIds':skipped,'rows':rows,
        'status':'ready' if rows else 'unchanged','coordinateUnits':units,
        'parameters':{'action':'list','kind':kind,'targetIds':selected,'lines':[row['markup'] for row in rows]},
        'definition':'Literal source IDs and intrinsic source metrics/incidence; display projection and units do not rescale coordinates.',
        'numericMode':'float64-approximate','certified':False}


def dispatch_element_labels(request):
    try:
        content._json(request,16*1024*1024)
        if type(request) is not dict or not {'op','model','params'}<=set(request) or set(request)-{'op','model','params','id','algorithmVersion'} or request['op']!='element-label-presets':
            raise GeometryError('Label preview requires op/model/params and optional version/correlation.')
        if request.get('algorithmVersion',VERSION)!=VERSION:raise GeometryError('Unsupported source label preset version.')
        params=request['params']
        if type(params) is not dict or set(params)-{'kind','preset','target_ids','document','overwrite','index_base','decimals','prefix','color'}:
            raise GeometryError('Unsupported source label preset parameters.')
        result=prepare_element_labels(request['model'],**params);content._json(result,1024*1024);return result
    except (content.AnnotationError,ArithmeticError,TypeError,ValueError,KeyError,AttributeError) as exc:
        raise GeometryError('Invalid source label preset: '+str(exc)) from exc
