"""Reproduce attributed Johnson/uniform assets from pinned Antiprism 0.32.

The installer is hash-checked, never run. Extract it separately. This adapter
does not modify or loosen the application's strict OFF importer.
"""
import argparse
from collections import Counter,defaultdict
import hashlib
import json
import math
from pathlib import Path
import re
import subprocess
import sys

import numpy as np

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from engine.formats import parse_off
from engine.geometry import GeometryError
from engine.symmetry import geometric_symmetry

INSTALLER_SHA='a5318868fa6032923bd9acca945609d5bad0e88cbc8bc1ffec83df35a7d266cc'
TOOL_SHA='ecf4f858fcfcd5210a0211e97a2a9ac6c198328752d7e7b5f753dc4bf837f1b4'
SOURCE_URL='https://www.antiprism.com/files/antiprism-0.32_w64_install.exe'
SYMMETRY_SAMPLES=frozenset({'J84','U1','U6','U12','U29','U34','U75'})


def digest(data):
    return hashlib.sha256(data).hexdigest()


def run(tool,args):
    result=subprocess.run([str(tool),*args],capture_output=True,timeout=30)
    if result.returncode:
        raise RuntimeError(f'Antiprism {args}: '+result.stderr.decode('utf-8','replace'))
    return result.stdout,result.stderr


def names_from_help(text,family):
    entries={}
    for line in text.splitlines():
        if family=='J':
            match=re.fullmatch(r'J(\d+)\s+(.+?)\s*',line)
            if match:entries[int(match[1])]={'name':match[2]}
        else:
            match=re.fullmatch(r'U(\d+)\s+([\d/| ]+?)\s{2,}(.+?)\s*',line)
            if match:entries[int(match[1])]={'name':match[3],'wythoffSymbol':match[2].strip()}
    required=set(range(1,93 if family=='J' else 76))
    if not required<=set(entries):
        raise GeometryError(f'Incomplete official {family} help metadata: {sorted(required-set(entries))}')
    return {number:entries[number] for number in sorted(required)}


def adapt_off(raw):
    """Keep polygon rows byte-spelled; retain decorations/indexed colors.

    Antiprism OFF mixes 1/2-index drawing decorations with polygon boundaries.
    The application OFF dialect deliberately permits polygons only. For an
    indexed polygon color, its original index is retained as source metadata;
    a documented deterministic display palette resolves only that suffix.
    Supplied RGB/RGBA suffixes and their original decimal spelling survive.
    """
    if len(raw)>4*1024*1024:raise GeometryError('Antiprism source exceeds the 4 MiB asset bound.')
    text=raw.decode('utf-8-sig')
    lines=[line.split('#',1)[0].strip() for line in text.splitlines()]
    lines=[line for line in lines if line]
    if not lines or lines[0]!='OFF':raise GeometryError('Antiprism adapter expects OFF.')
    counts=[int(value) for value in lines[1].split()]
    if len(counts)!=3:raise GeometryError('Antiprism adapter requires V F E counts.')
    nv,nr,ne=counts
    if not 1<=nv<=20000 or not 0<=nr<=100000 or not 0<=ne<=1000000 or len(lines)!=2+nv+nr:
        raise GeometryError('Antiprism source count/resource mismatch.')
    vertices=lines[2:2+nv]
    for vertex in vertices:
        values=[float(value) for value in vertex.split()]
        if len(values)!=3 or not all(math.isfinite(value) for value in values):
            raise GeometryError('Antiprism source needs three finite coordinates; vertex attributes are unsupported.')
    polygons=[];faces=[];decorations=[];source_colors=[];edges=set()
    # Display-only palette for indexed suffixes, never a guessed source RGB.
    palette=['0.90196 0.45098 0.00000','0.05098 0.32157 0.50196',
             '0.70196 0.10196 0.20000','0.50196 0.48235 0.05098']
    for row_index,line in enumerate(lines[2+nv:]):
        tokens=line.split();size=int(tokens[0])
        if size<1 or len(tokens)<size+1:raise GeometryError('Invalid Antiprism boundary record.')
        indices=[int(token) for token in tokens[1:size+1]]
        if len(set(indices))!=size or any(not 0<=index<nv for index in indices):
            raise GeometryError('Invalid or repeated Antiprism source boundary index.')
        color=tokens[size+1:]
        if len(color)==1 and re.fullmatch(r'\d+',color[0]):
            source_color={'encoding':'index','index':int(color[0])}
            suffix=palette[int(color[0])%len(palette)]
            mapped=' '.join(tokens[:size+1])+' '+suffix
        elif not color:
            source_color=None;mapped=line
        elif len(color) in (3,4):
            byte=all(re.fullmatch(r'[+-]?\d+',token) for token in color)
            values=[int(token) if byte else float(token) for token in color]
            maximum=255 if byte else 1
            if any(not math.isfinite(value) or not 0<=value<=maximum for value in values):
                raise GeometryError('Invalid Antiprism source color channels.')
            source_color={'encoding':'byte' if byte else 'unit','values':values,'tokens':color};mapped=line
        else:raise GeometryError('Unsupported Antiprism source color suffix.')
        if size<3:
            decorations.append({'sourceRow':row_index,'kind':'vertex' if size==1 else 'edge','indices':indices,'color':source_color,'record':line})
        else:
            faces.append(indices);polygons.append(mapped);source_colors.append(source_color)
            edges.update(tuple(sorted((a,b))) for a,b in zip(indices,indices[1:]+indices[:1]))
    if not faces:raise GeometryError('Antiprism catalog source has no polygons.')
    source_edges=edges|{tuple(sorted(row['indices'])) for row in decorations if row['kind']=='edge'}
    if ne and ne!=len(source_edges):
        raise GeometryError('Antiprism declared edge count disagrees with source polygon/decorator edges.')
    # Original ne may count explicit decorators; adapted ne is independently
    # boundary-derived and documented, not an importer edge-count repair.
    adapted=('OFF\n'+f'{nv} {len(faces)} {len(edges)}\n'+'\n'.join(vertices+polygons)+'\n').encode('utf-8')
    return adapted,{'version':1,'sourceCounts':{'vertices':nv,'rows':nr,'declaredEdges':ne},
        'polygonSourceRows':[i for i,line in enumerate(lines[2+nv:]) if int(line.split()[0])>=3],
        'decorations':decorations,'polygonColors':source_colors,
        'indexedDisplayPalette':palette,'indexedDisplayPolicy':'index modulo four, display only; original indices retained',
        'transform':'Retain coordinates and ordered polygon rows; separate 1/2-index decorations; derive polygon edge count; map indexed color suffixes only.'}


def quality(model):
    """Independent numerical regular-polygon checks, no name classification."""
    points=np.asarray(model['vertices'],dtype=float)
    lengths=np.array([np.linalg.norm(points[a]-points[b]) for a,b in model['edges']])
    mean=float(lengths.mean());span=max(float(np.max(np.ptp(points,axis=0))),np.finfo(float).tiny)
    worst={'planarityRelative':0.,'edgeRelative':0.,'circumradiusRelative':0.,'angleStepRadians':0.}
    winds=Counter()
    for face in model['faces']:
        polygon=points[face];centered=polygon-polygon.mean(axis=0)
        _,_,vt=np.linalg.svd(centered,full_matrices=False)
        local=centered@vt[:2].T
        radii=np.linalg.norm(local,axis=1);radius=float(radii.mean())
        edge_lengths=np.linalg.norm(polygon-np.roll(polygon,-1,axis=0),axis=1)
        angles=np.arctan2(local[:,1],local[:,0]);turns=(np.roll(angles,-1)-angles+math.pi)%(2*math.pi)-math.pi
        step=float(turns.mean())
        residuals={'planarityRelative':float(np.max(np.abs(centered@vt[-1])))/span,
            'edgeRelative':float(np.ptp(edge_lengths))/max(float(edge_lengths.mean()),np.finfo(float).tiny),
            'circumradiusRelative':float(np.ptp(radii))/max(radius,np.finfo(float).tiny),
            'angleStepRadians':float(np.max(np.abs(turns-step)))}
        for key,value in residuals.items():worst[key]=max(worst[key],value)
        winding=abs(round(step*len(face)/(2*math.pi)))
        winds[f'{len(face)}/{winding}']+=1
    edge_residual=float(np.ptp(lengths))/mean
    tolerance=1e-7
    regular=max(worst.values())<=tolerance and edge_residual<=tolerance
    adjacency=defaultdict(set);edge_use=Counter()
    for a,b in model['edges']:adjacency[a].add(b);adjacency[b].add(a)
    for face in model['faces']:edge_use.update(tuple(sorted((a,b))) for a,b in zip(face,face[1:]+face[:1]))
    remaining=set(range(len(points)));components=[]
    while remaining:
        pending=[min(remaining)];component=set()
        while pending:
            vertex=pending.pop()
            if vertex in component:continue
            component.add(vertex);pending.extend(adjacency[vertex]-component)
        remaining-=component;components.append(sorted(component))
    return {'mode':'float64-approximate','certified':False,'regularFaceTolerance':tolerance,
        'regularFacesAndEqualEdgesPassed':regular,'maximumRegularFaceResiduals':worst,
        'globalEdgeRelativeSpread':edge_residual,'meanEdgeLength':mean,'facePolygonWindingCounts':dict(sorted(winds.items())),
        'edgeFaceIncidenceHistogram':dict(sorted(Counter(edge_use.values()).items())),
        'sourceConnectedComponents':components,'boundaryConnectedComponentCount':len(components),
        'interpretation':model['interpretation'],'classificationBasis':'Strict source incidence validation; convexity only when supplied full cycles match hull; regular-face residuals do not alone prove uniformity.'}


def build(extracted,output):
    installer=extracted.parent/'antiprism-0.32_w64_install.exe'
    tool=extracted/'off_util.exe'
    if digest(installer.read_bytes())!=INSTALLER_SHA or digest(tool.read_bytes())!=TOOL_SHA:
        raise GeometryError('Pinned Antiprism installer/tool SHA-256 mismatch; no assets generated.')
    copying=(extracted/'doc/COPYING').read_bytes()
    resources=(extracted/'doc/resources.html').read_bytes()
    if b'MIT-and-similar' not in copying or b'check the begining of each resource file' not in resources:
        raise GeometryError('Expected upstream attribution/resource notices unavailable.')
    help_data={}
    for family,topic in [('J','johnson'),('U','uniform')]:
        stdout,stderr=run(tool,['-H',topic]);help_data[family]=stdout+stderr
    output.mkdir(parents=True,exist_ok=True)
    (output/'models').mkdir(exist_ok=True);(output/'sources').mkdir(exist_ok=True)
    entries=[];failures=[]
    for family in ('J','U'):
        for number,metadata in names_from_help(help_data[family].decode('utf-8'),family).items():
            model_id=f'{family}{number}';stem=model_id.lower();args=['-d','17',stem]
            raw,stderr=run(tool,args)
            adapted,adapter=adapt_off(raw)
            (output/f'sources/{stem}.off').write_bytes(raw)
            (output/f'models/{stem}.off').write_bytes(adapted)
            entry={'id':model_id,'key':f'antiprism-{stem}','family':'Johnson' if family=='J' else 'Uniform',**metadata,
                'file':f'models/{stem}.off','sourceFile':f'sources/{stem}.off','sourceSha256':digest(raw),
                'sha256':digest(adapted),'command':['off_util.exe',*args],'stderr':stderr.decode('utf-8'),
                'adapter':adapter,'chirality':{'status':'not independently classified','construction':'Pinned upstream default coordinate orientation; no reflected counterpart synthesized.'}}
            try:
                model=parse_off(adapted.decode('utf-8'),metadata['name'])
                entry['counts']={key:len(model[key]) for key in ('vertices','edges','faces','cells')}
                entry['fingerprint']=model['fingerprint'];entry['quality']=quality(model);entry['strictImportPassed']=True
                if model_id in SYMMETRY_SAMPLES:
                    symmetry=geometric_symmetry(model)
                    entry['vertexTransitivitySample']={key:symmetry[key] for key in ('order','properOrder','complete','closureVerified','method','algorithmVersion','tolerance','entityOrbits')}
                    if symmetry['complete'] and symmetry['closureVerified']:
                        improper=symmetry['order']-symmetry['properOrder']
                        entry['chirality']={'status':'numerically achiral' if improper else 'numerically chiral','improperActionCount':improper,'construction':'Pinned upstream default coordinate orientation; no reflected counterpart synthesized.','scope':'Exhausted incidence-preserving Euclidean symmetry search for supplied approximate coordinates.'}
            except GeometryError as error:
                entry['strictImportPassed']=False;entry['diagnostic']=str(error);failures.append(model_id)
            entries.append(entry)
    manifest={'version':1,'provider':'Antiprism','providerVersion':'0.32','sourceUrl':SOURCE_URL,
        'installerSha256':INSTALLER_SHA,'toolSha256':TOOL_SHA,'license':'MIT-and-similar; upstream COPYING retained',
        'copyingSha256':digest(copying),'resourceNoticeSha256':digest(resources),
        'helpSha256':{family:digest(data) for family,data in help_data.items()},
        'requiredCoverage':{'Johnson':92,'Uniform':75},'entries':entries,
        'strictImportFailures':failures,'numericContract':'Supplied approximate decimals, no exact algebraic certificates. Source family labels are upstream classifications, not inferred from names or face regularity alone.'}
    (output/'COPYING').write_bytes(copying)
    (output/'RESOURCE_NOTICE.html').write_bytes(resources)
    (output/'johnson-help.txt').write_bytes(help_data['J']);(output/'uniform-help.txt').write_bytes(help_data['U'])
    manifest_file=output/'manifest.json';temporary=output/'manifest.json.tmp'
    temporary.write_text(json.dumps(manifest,ensure_ascii=False,allow_nan=False,indent=2)+'\n',encoding='utf-8')
    temporary.replace(manifest_file)
    print(f'Generated {len(entries)} attributed assets; strict importer failures: {failures}',flush=True)
    return manifest


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--extracted',type=Path,default=ROOT/'artifacts/antiprism-0.32/extracted')
    parser.add_argument('--output',type=Path,default=ROOT/'engine/catalog_data/antiprism')
    args=parser.parse_args()
    allowed=(ROOT/'engine/catalog_data/antiprism').resolve();target=args.output.resolve()
    if target!=allowed:parser.error('Output must be the owned engine/catalog_data/antiprism directory.')
    manifest=build(args.extracted.resolve(),target)
    if manifest['strictImportFailures']:sys.exit(1)
