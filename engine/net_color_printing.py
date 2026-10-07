"""Detached color-separated print forests: full ordered source faces, mm scale.

Stella Build 7.1.2 documents auto/mixed/one-color-per-net-and-page policies.
Four-face pinched-edge assembly is deliberately outside this two-face domain.
"""
from copy import deepcopy
import hashlib
import json
import math
import xml.etree.ElementTree as ET
import numpy as np
from .geometry import GeometryError,identity

SVG='http://www.w3.org/2000/svg'


def face_colors(source):
    colors=source.get('metadata',{}).get('offColors',{}).get('faces')
    if colors is None:return [None]*len(source['faces'])
    if type(colors) is not list or len(colors)!=len(source['faces']):raise GeometryError('Source face colors must match every source face slot.')
    result=[]
    for color in colors:
        if color is None:result.append(None);continue
        if type(color) is not dict or set(color)!={'encoding','values'} or color['encoding'] not in ('byte','unit'):
            raise GeometryError('Printing requires literal source OFF byte/unit RGB or RGBA records.')
        values=color['values'];maximum=255 if color['encoding']=='byte' else 1
        if type(values) is not list or len(values) not in (3,4) or any(type(v) not in (int,float) or not math.isfinite(v) or not 0<=v<=maximum for v in values):
            raise GeometryError('Source print colors require finite bounded RGB/RGBA channels.')
        if maximum==255 and any(type(v) is not int for v in values):raise GeometryError('Source byte colors require integer channels.')
        rgba=tuple(v/maximum if v else 0. for v in values)+( (1.,) if len(values)==3 else () )
        result.append(rgba)
    return result


def attach_print_source(net,model):
    """Small native source snapshot only for color-bearing sources.

    Cached layouts regenerate this snapshot from the actual project model.
    Annotated sources already have a complete source snapshot in their document.
    """
    net['sourceInterpretation']=model.get('interpretation')
    if model.get('metadata',{}).get('offColors',{}).get('faces') is None:return
    source={k:deepcopy(model[k]) for k in ('id','name','dimension','embeddingDimension','interpretation','vertices','edges','faces','cells','numeric','rationalCoordinates','convexPieces') if k in model}
    source['metadata']={'offColors':{'faces':deepcopy(model['metadata']['offColors']['faces'])}}
    source['fingerprint']=identity(source);net['printSource']=source


def legacy_tab_records(source,net):
    """Source-owned automatic single tabs for sanitized page subsets.

    No saved tab buffers are trusted. Source ID ordering selects the same owner
    before and after splitting paper pages, including concave source faces.
    """
    if not net['tabs']:return []
    lookup={tuple(sorted(e)):i for i,e in enumerate(source['edges'])};owners={}
    for fi,cycle in enumerate(source['faces']):
        for a,b in zip(cycle,cycle[1:]+cycle[:1]):owners.setdefault(lookup[tuple(sorted((a,b)))],[]).append(fi)
    result=[]
    for face in net['faces']:
        p=np.asarray(face['points']);signed=float(np.sum(p[:,0]*np.roll(p[:,1],-1)-p[:,1]*np.roll(p[:,0],-1)))
        for i,edge in enumerate(face['edges']):
            if edge['hinge'] or face['id']!=min(owners[edge['id']]):continue
            a,b=p[i],p[(i+1)%len(p)];length=float(np.linalg.norm(b-a));u=(b-a)/length;outward=np.sign(signed)*np.array([u[1],-u[0]])
            depth=min(4,length/5)
            result.append({'face':face['id'],'edge':edge['id'],'points':np.array([a,a+u*depth+outward*depth,b-u*depth+outward*depth,b]).tolist()})
    return result


def _color_id(color):
    return 'uncolored' if color is None else 'rgba-'+hashlib.sha256(json.dumps(color,separators=(',',':')).encode()).hexdigest()


def _label(color):
    return 'Uncolored source faces' if color is None else 'RGBA '+', '.join(format(v,'.6g') for v in color)


def _forest(source,net,colors):
    from .generalized_nets import unfold_source
    incidence={i:[] for i in range(len(source['edges']))}
    lookup={tuple(sorted(e)):i for i,e in enumerate(source['edges'])}
    for fi,face in enumerate(source['faces']):
        for a,b in zip(face,face[1:]+face[:1]):incidence[lookup[tuple(sorted((a,b)))]].append(fi)
    cuts=[e for e in net['hinges'] if len(incidence[e])==2 and colors[incidence[e][0]]!=colors[incidence[e][1]]]
    if not cuts:return deepcopy(net),cuts
    params={'root':net['root'],'edge_length_mm':net['referenceEdgeLengthMm'],'tabs':net['tabs'],
            'hinges':[e for e in net['hinges'] if e not in cuts],'element_annotations':net.get('elementAnnotations')}
    if net.get('tabOptions') is not None:params['tab_options']=net['tabOptions']
    base=unfold_source(source,**params);targets={f['id']:np.asarray(f['points']) for f in net['faces']};placements=[]
    for item in base['components']:
        fi=item['root'];p=np.asarray(base['faces'][fi]['points']);q=targets[fi];u,v=p[1]-p[0],q[1]-q[0]
        theta=math.atan2(float(u[0]*v[1]-u[1]*v[0]),float(u@v));rotation=np.array([[math.cos(theta),-math.sin(theta)],[math.sin(theta),math.cos(theta)]])
        placements.append({'root':fi,'angle':math.degrees(theta),'translation':(q[0]-rotation@p[0]).tolist()})
    result=unfold_source(source,placements=placements,**params)
    if any(not np.allclose(f['points'],targets[f['id']],atol=net['referenceEdgeLengthMm']*1e-7,rtol=0) for f in result['faces']):
        raise GeometryError('Color separation failed to retain the existing physical face layout.')
    return result,cuts


def _decorate(page,colors,group,print_fill):
    root=ET.fromstring(page['svg']);root.set('data-paper-color',group['id'])
    for owner in root.iter('{'+SVG+'}g'):
        if 'data-net-face' not in owner.attrib:continue
        polygon=owner.find('{'+SVG+'}polygon');color=colors[int(owner.attrib['data-net-face'])]
        if polygon is None:continue
        if not print_fill or color is None:polygon.set('fill','none');polygon.attrib.pop('fill-opacity',None)
        elif color is not None:
            polygon.set('fill','rgb('+','.join(format(v*255,'.12g') for v in color[:3])+')');polygon.set('fill-opacity',format(color[3],'.12g'))
    ET.SubElement(root,'{'+SVG+'}metadata').text='Paper color batch: '+group['label']+'. Source RGBA retained; print at 100%.'
    page['svg']=ET.tostring(root,encoding='unicode');page['paperColorId']=group['id'];page['paperColorLabel']=group['label'];page['paperColorFaceIds']=group['faceIds'];page['sourceFaceIds']=sorted(i for part in page['parts'] for i in part['faceIds'])


def pack_colors(net,color_mode,paper_color,print_fill,color_source_id,color_source_fingerprint,**physical):
    from .net_printing import pack_net
    from .generalized_nets import reconstruct_source_net
    from .nets import fold_net,tab_geometry
    if color_mode not in ('auto','mixed','separate') or type(print_fill) is not bool:raise GeometryError('Choose auto, mixed or separate net printing and a Boolean color-fill policy.')
    if color_source_id is not None and color_source_id!=net.get('sourceId') or color_source_fingerprint is not None and color_source_fingerprint!=net.get('sourceFingerprint'):
        raise GeometryError('Paper-color selection belongs to another source.')
    source=net.get('elementAnnotations',{}).get('source') or net.get('printSource')
    if source is not None:
        if source.get('id')!=net.get('sourceId') or identity(source)!=net.get('sourceFingerprint'):raise GeometryError('Color print source ownership changed.')
        net=reconstruct_source_net(source,net);colors=face_colors(source)
    else:colors=[None]*net['sourceFaceCount']
    images=any(e.get('texture') is not None for e in net.get('elementAnnotations',{}).get('entries',[]))
    interpretation=source.get('interpretation') if source is not None else net.get('sourceInterpretation')
    effective='mixed' if color_mode=='auto' and (interpretation=='convex-polytope' or images) else 'separate' if color_mode=='auto' else color_mode
    if paper_color!='all' and (type(paper_color) is not int or not 0<=paper_color<len(colors)):raise GeometryError('Paper color must be all or an existing representative source face ID.')
    if effective=='mixed' and paper_color!='all':raise GeometryError('A paper-color batch requires separate-color printing; use all for mixed printing.')
    print_net,cuts=_forest(source,net,colors) if effective=='separate' and source is not None else (deepcopy(net),[])
    groups={}
    if effective=='mixed':groups['mixed']={'id':'mixed','label':'Mixed source colors','rgba':None,'faceIds':[f['id'] for f in print_net['faces']]}
    else:
        for f in print_net['faces']:
            color=colors[f['id']];key=_color_id(color);group=groups.setdefault(key,{'id':key,'label':_label(color),'rgba':None if color is None else list(color),'faceIds':[]});group['faceIds'].append(f['id'])
    selected=list(groups.values()) if paper_color=='all' else [groups[_color_id(colors[paper_color])]]
    pages=[];selected_ids=[];tabs=tab_geometry(print_net)
    for group in selected:
        ids=set(group['faceIds']);partial=deepcopy(print_net);partial['faces']=[f for f in partial['faces'] if f['id'] in ids]
        partial['components']=[c for c in partial['components'] if set(c['faces'])<=ids]
        if {i for c in partial['components'] for i in c['faces']}!=ids:raise GeometryError('A print component contains more than one paper color.')
        partial['tabRecords']=[t for t in tabs if t['face'] in ids]
        packed=pack_net(partial,**physical)
        for page in packed['pages']:
            page['id']=len(pages);_decorate(page,colors,group,print_fill);pages.append(page)
        selected_ids.extend(group['faceIds'])
    parameters={**physical,'color_mode':color_mode,'paper_color':paper_color,'print_fill':print_fill,'color_source_id':net['sourceId'],'color_source_fingerprint':net['sourceFingerprint']}
    validation=fold_net(print_net,1)['validation']
    return {'pages':pages,'pageCount':len(pages),'units':'mm','contentScale':1,'sourceFingerprint':net['sourceFingerprint'],'sourceId':net['sourceId'],
            'referenceEdgeLengthMm':net['referenceEdgeLengthMm'],'parameters':parameters,'algorithm':'source RGBA batches; explicit color cuts in a detached rigid print forest',
            'colorPrinting':{'requestedMode':color_mode,'effectiveMode':effective,'printFill':print_fill,'groups':list(groups.values()),'selectedSourceFaceIds':sorted(selected_ids),
                'crossColorCuts':cuts,'originalHinges':net['hinges'],'printHinges':print_net['hinges'],'sourceFaceMap':[{ 'face':f['id'],'sourceVertices':f['sourceVertices'],'component':f['component'],'edges':f['edges']} for f in print_net['faces']]},
            'validation':{'allSourceFacesRepresented':sorted(selected_ids)==list(range(len(colors))),'selectedSourceFacesRepresented':len(selected_ids)==len(set(selected_ids)),
                'scalePreserved':True,'originalNetChanged':False,'printFoldEndpointReconstructed':validation['endpointReconstructed'],'sourceFaceOverlapPairs':len(print_net['overlapPairs']),
                'sourceTabOverlapPairs':len(print_net['tabOverlapPairs']),'partBoundsInsideMargins':True,'packingOptimalityClaimed':False,'hardwarePrinterCalibrationEstablished':False}}
