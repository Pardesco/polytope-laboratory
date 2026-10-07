"""Source-bound glue-tab preferences; complete source faces remain unchanged.

Width is physical millimetres, independent of model E0. Bevel consumes at most
one fifth of the edge at each end. Coincident/pinched source edges remain outside
the ordinary two-face shell domain; no hull or incident-face pairing is invented.
"""
from copy import deepcopy
import math
import numpy as np
from .geometry import GeometryError, identity


def validate_options(model, options):
    if not isinstance(options, dict) or set(options)-{'version','sourceId','sourceFingerprint','mode','widthMm','edges'}:
        raise GeometryError('Tab preferences require a source-bound version 1 object.')
    if type(options.get('version')) is not int or options['version']!=1 or options.get('sourceId')!=model['id'] or options.get('sourceFingerprint')!=identity(model):
        raise GeometryError('Tab preferences belong to another source; reset them for this source.')
    if options.get('mode') not in ('none','single','double'):
        raise GeometryError('Default tabs must be none, single, or double.')
    width=options.get('widthMm')
    if type(width) not in (int,float) or not math.isfinite(width) or not .1<=width<=100:
        raise GeometryError('Tab width must be between 0.1 and 100 physical mm.')
    edges=options.get('edges',[])
    if not isinstance(edges,list) or len(edges)>len(model['edges']):
        raise GeometryError('Tab overrides must be a list of distinct source edges.')
    seen=set()
    for item in edges:
        if not isinstance(item,dict) or set(item)-{'edge','mode','face'}:
            raise GeometryError('Each tab override requires a source edge, mode, and optional single-tab face.')
        edge=item.get('edge')
        if type(edge) is not int or not 0<=edge<len(model['edges']) or edge in seen or item.get('mode') not in ('none','single','double'):
            raise GeometryError('Tab overrides require distinct existing source edges and none/single/double modes.')
        seen.add(edge)
        if 'face' in item:
            f=item['face'];a,b=model['edges'][edge]
            if item['mode']!='single' or type(f) is not int or not 0<=f<len(model['faces']) or not any({u,v}=={a,b} for u,v in zip(model['faces'][f],model['faces'][f][1:]+model['faces'][f][:1])):
                raise GeometryError('A single tab must belong to a source face incident on that source edge.')
    result=deepcopy(options);result['edges']=sorted(edges,key=lambda e:e['edge'])
    return result


def tab_records_for_faces(model, net, options):
    """Regenerate even page subsets using the full source's owner selection.

    Annotation SVG sanitization uses this function instead of trusting saved
    tab point buffers. Page transforms remain rigid physical-mm face charts.
    """
    options=validate_options(model,options);records=[];incidence={}
    for fi,face in enumerate(model['faces']):
        for a,b in zip(face,face[1:]+face[:1]):incidence.setdefault(tuple(sorted((a,b))),[]).append(fi)
    if any(len(owners)!=2 for owners in incidence.values()):raise GeometryError('Glue tabs require exactly two incident source faces per edge.')
    overrides={item['edge']:item for item in options['edges']}
    if not net['tabs']:return records
    for face in net['faces']:
        for i,edge in enumerate(face['edges']):
            if edge['hinge']:continue
            item=overrides.get(edge['id'],{});mode=item.get('mode',options['mode'])
            if mode=='none':continue
            owners=incidence[tuple(sorted(model['edges'][edge['id']]))]
            if mode=='single' and face['id']!=item.get('face',min(owners)):continue
            p=np.asarray(face['points'],dtype=float);a,b=p[i],p[(i+1)%len(p)];length=float(np.linalg.norm(b-a));u=(b-a)/length
            signed=float(np.sum(p[:,0]*np.roll(p[:,1],-1)-p[:,1]*np.roll(p[:,0],-1)))
            outward=np.sign(signed)*np.array([u[1],-u[0]])
            depth=options['widthMm'];bevel=min(depth,length/5)
            points=np.array([a,a+u*bevel+outward*depth,b-u*bevel+outward*depth,b])
            records.append({'edge':edge['id'],'face':face['id'],'points':points.tolist(),'widthMm':depth,'mode':mode})
    return records


def apply_options(model, net, options):
    from .generalized_nets import polygon_overlap
    options=validate_options(model,options);result=deepcopy(net);result.pop('svg',None)
    result['tabOptions']=options;records=tab_records_for_faces(model,result,options)
    result['tabRecords']=records;pairs=[];tol=result['referenceEdgeLengthMm']*1e-8
    for index,tab in enumerate(records):
        for face in result['faces']:
            if polygon_overlap(np.asarray(tab['points']),np.asarray(face['points']),tol):pairs.append({'edge':tab['edge'],'face':face['id']})
        for other in records[index+1:]:
            if polygon_overlap(np.asarray(tab['points']),np.asarray(other['points']),tol):pairs.append({'edge':tab['edge'],'otherTabEdge':other['edge']})
    result['tabOverlapPairs']=pairs;result['hasTabOverlap']=bool(pairs)
    points=np.concatenate([np.asarray(f['points']) for f in result['faces']]+[np.asarray(t['points']) for t in records])
    result['bounds']=[points.min(axis=0).tolist(),points.max(axis=0).tolist()]
    return result


def unfold_tabbed(model, tab_options, **params):
    from .generalized_nets import unfold_source
    options=validate_options(model,tab_options)
    return apply_options(model,unfold_source(model,**params),options)


def edit_tabbed(model, net, action, tab_options=None, **params):
    from .generalized_nets import edit_source_net,reconstruct_source_net
    if net.get('sourceId')!=model['id'] or net.get('sourceFingerprint')!=identity(model):
        raise GeometryError('Net source changed; generate a new net before editing tabs.')
    options=validate_options(model,tab_options if tab_options is not None else net.get('tabOptions'))
    plain=deepcopy(net);plain.pop('tabOptions',None)
    if action=='set-tab-options':
        rebuilt=reconstruct_source_net(model,plain)
    else:
        rebuilt=edit_source_net(model,plain,action,**params)
    return apply_options(model,rebuilt,options)
