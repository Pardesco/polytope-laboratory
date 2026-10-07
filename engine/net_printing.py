"""Deterministic rectangle packing of intact net components, in millimeters.

No implicit scaling, splitting of connected pieces, or removal of overlaps.
Bounds include tabs and label padding. Source face/connection identities and
the global one-tab-per-cut policy are retained across all pages.
"""
from copy import deepcopy
import math
import numpy as np
from .geometry import GeometryError
from .nets import tab_geometry,net_svg

PAPERS={'a4':[210,297],'a3':[297,420],'letter':[215.9,279.4],'legal':[215.9,355.6]}


def pack_net(net,paper='a4',orientation='portrait',width_mm=None,height_mm=None,margin_mm=10,gap_mm=5,allow_rotation=True,color_mode=None,paper_color='all',print_fill=True,color_source_id=None,color_source_fingerprint=None):
    if color_mode is not None:
        from .net_color_printing import pack_colors
        return pack_colors(net,color_mode,paper_color,print_fill,color_source_id,color_source_fingerprint,paper=paper,orientation=orientation,width_mm=width_mm,height_mm=height_mm,margin_mm=margin_mm,gap_mm=gap_mm,allow_rotation=allow_rotation)
    if paper not in (*PAPERS,'custom') or orientation not in ('portrait','landscape'):
        raise GeometryError('Paper must be a4, a3, letter, legal or custom; orientation is portrait or landscape.')
    width,height=PAPERS[paper] if paper!='custom' else [width_mm,height_mm]
    if any(not isinstance(x,(int,float)) or not math.isfinite(x) or not 20<=x<=2000 for x in (width,height)):
        raise GeometryError('Paper width/height must be finite dimensions in 20–2,000 mm.')
    if orientation=='landscape':width,height=height,width
    if not isinstance(margin_mm,(int,float)) or not isinstance(gap_mm,(int,float)) or not math.isfinite(margin_mm) or not math.isfinite(gap_mm) or not 0<=margin_mm<min(width,height)/2 or not 0<=gap_mm<=100:
        raise GeometryError('Use nonnegative finite margins below half the page size, and gaps in 0–100 mm.')
    tabs=tab_geometry(net);faces={f['id']:f for f in net['faces']};parts=[];padding=4
    for component in net['components']:
        ids=set(component['faces']);cloud=np.concatenate([faces[i]['points'] for i in ids]+[t['points'] for t in tabs if t['face'] in ids])
        low,high=cloud.min(axis=0)-padding,cloud.max(axis=0)+padding
        parts.append({'root':component['root'],'faceIds':sorted(ids),'low':low,'high':high,'size':high-low})
    available=np.array([width,height])-2*margin_mm
    for part in parts:
        size=part['size']
        if not np.all(size<=available+1e-8) and not (allow_rotation and np.all(size[::-1]<=available+1e-8)):
            raise GeometryError(f'Connected piece C{part["root"]} needs {size[0]:.2f} × {size[1]:.2f} mm including tabs/labels, exceeding the {available[0]:.2f} × {available[1]:.2f} mm printable area. Change E0, cut more connections, or choose larger paper. No scaling was applied.')
    pages=[]
    for part in sorted(parts,key=lambda item:(-float(np.prod(item['size'])),-float(max(item['size'])),item['root'])):
        best=None
        for page_index,page in enumerate(pages):
            for slot_index,(x,y,w,h) in enumerate(page['free']):
                for quarter in (0,1) if allow_rotation else (0,):
                    pw,ph=part['size'][::1 if quarter==0 else -1]
                    if pw<=w+1e-8 and ph<=h+1e-8:
                        score=(w*h-pw*ph,min(w-pw,h-ph),page_index,slot_index,quarter)
                        if best is None or score<best[0]:best=(score,page_index,slot_index,quarter,pw,ph)
        if best is None:
            pages.append({'free':[(margin_mm,margin_mm,*available)],'parts':[]});page_index=len(pages)-1
            quarter=0 if np.all(part['size']<=available+1e-8) else 1;pw,ph=part['size'][::1 if quarter==0 else -1];best=(None,page_index,0,quarter,pw,ph)
        _,page_index,slot_index,quarter,pw,ph=best;page=pages[page_index];x,y,w,h=page['free'].pop(slot_index)
        # Disjoint guillotine rectangles leave a physical gap between parts.
        if w-pw-gap_mm>1e-8:page['free'].append((x+pw+gap_mm,y,w-pw-gap_mm,ph))
        if h-ph-gap_mm>1e-8:page['free'].append((x,y+ph+gap_mm,w,h-ph-gap_mm))
        rotation=np.array([[0,-1],[1,0]]) if quarter else np.eye(2)
        corners=np.asarray([[part['low'][0],part['low'][1]],[part['low'][0],part['high'][1]],[part['high'][0],part['low'][1]],[part['high'][0],part['high'][1]]])@rotation.T
        translation=np.asarray([x,y])-corners.min(axis=0)
        page['parts'].append({'component':part['root'],'faceIds':part['faceIds'],'angle':quarter*90,'translation':translation.tolist(),'inkBounds':[[x,y],[x+pw,y+ph]]})
    result_pages=[];all_ids=[]
    for index,page in enumerate(pages):
        page_faces=[];page_tabs=[]
        for placement in page['parts']:
            rotation=np.array([[0,-1],[1,0]]) if placement['angle'] else np.eye(2);translation=np.asarray(placement['translation'])
            for face_id in placement['faceIds']:
                record=deepcopy(faces[face_id]);record['points']=(np.asarray(record['points'])@rotation.T+translation-8).tolist();page_faces.append(record);all_ids.append(face_id)
            for tab in tabs:
                if tab['face'] in placement['faceIds']:
                    record=deepcopy(tab);record['points']=(np.asarray(tab['points'])@rotation.T+translation-8).tolist();page_tabs.append(record)
        printable={**net,'faces':page_faces,'bounds':[[0,0],[width-16,height-16]],'tabRecords':page_tabs,
                   'status':f'Packed page {index+1}/{len(pages)}; source scale retained; {len(net["overlapPairs"])} source face overlap pairs'}
        if net.get('elementAnnotations') is not None:
            printable['annotationFaceIds'] = sorted(face['id'] for face in page_faces)
        svg=net_svg(printable)
        result_pages.append({'id':index,'widthMm':width,'heightMm':height,'parts':page['parts'],'svg':svg})
    represented=sorted(all_ids)==sorted(faces)
    if not represented or len(all_ids)!=len(set(all_ids)):raise GeometryError('Page packing failed complete source-face representation.')
    return {'pages':result_pages,'pageCount':len(result_pages),'units':'mm','contentScale':1,'sourceFingerprint':net['sourceFingerprint'],
            'referenceEdgeLengthMm':net['referenceEdgeLengthMm'],'algorithm':'area-ordered guillotine rectangle packing with optional quarter turns','algorithmVersion':'0.4.0',
            'parameters':{'paper':paper,'orientation':orientation,'width_mm':width_mm,'height_mm':height_mm,'margin_mm':margin_mm,'gap_mm':gap_mm,'allow_rotation':allow_rotation},
            'validation':{'allSourceFacesRepresented':True,'scalePreserved':True,'labelPaddingMm':padding,'partBoundsInsideMargins':True,
                          'sourceFaceOverlapPairs':len(net['overlapPairs']),'sourceTabOverlapPairs':len(net['tabOverlapPairs']),
                          'packingOptimalityClaimed':False,'hardwarePrinterCalibrationEstablished':False}}
