"""Source-vertex supporting facets at the authoritative convex net scale.

Detached, bounded prototype. Does not alter the polyhedron or infer stiffness.
"""
from copy import deepcopy
import csv
import io
import json
import math

import numpy as np

from engine.automatic_faceting import _hash
from engine.automatic_faceting_workflow import _portable
from engine.geometry import GeometryError
from engine.measurements import facet_normals, dihedrals
from engine.nets import unfold, net_svg

VERSION='0.1.0'
UNITS={'mm':1.,'cm':10.,'m':1000.,'in':25.4,'ft':304.8}
NET_KEYS={'root','edge_length_mm','tabs','hinges','cut_edges','placements'}
LIMIT=16*1024*1024


def _stop(cancelled):
    if cancelled is not None:
        if not callable(cancelled):raise GeometryError('Cancellation requires a callable.')
        if cancelled():raise GeometryError('Reinforcement canceled before publication.')


def _context(source,parameters,cancelled):
    _stop(cancelled)
    source=_portable(source,LIMIT);parameters=_portable(parameters,LIMIT)
    if type(source) is not dict:raise GeometryError('Supporting facets require a literal source model record.')
    if type(parameters) is not dict or set(parameters)-NET_KEYS:raise GeometryError('Use exact supported net construction parameters.')
    if 'edge_length_mm' in parameters and (type(parameters['edge_length_mm']) not in (int,float) or not 1<=parameters['edge_length_mm']<=1000):raise GeometryError('Physical E0 requires a number from 1 to 1000 mm.')
    if 'tabs' in parameters and type(parameters['tabs']) is not bool:raise GeometryError('Net tabs require a boolean.')
    if source.get('dimension')!=3 or source.get('embeddingDimension',3)!=3:raise GeometryError('Supporting facets require an intrinsic convex 3D source.')
    if len(source.get('faces',[]))>250 or len(source.get('vertices',[]))>512:raise GeometryError('Supporting facet domain is at most 250 source faces and 512 vertices.')
    net=unfold(source,**parameters)
    normals=facet_normals(source)
    points=np.asarray(net['targetVertices'],dtype=float)
    planes=[(normal,points[face[0]]) for normal,face in zip(normals,source['faces'])]
    _stop(cancelled)
    return source,parameters,net,points,planes


def _cycle(raw,count):
    if type(raw) is not list or not 3<=len(raw)<=128 or any(type(i) is not int or not 0<=i<count for i in raw) or len(set(raw))!=len(raw):
        raise GeometryError('A supporting facet requires 3 to 128 distinct literal source vertex IDs.')
    return raw[:]


def _panel(points,cycle,index,planes,source_edge_list):
    p=points[cycle];origin=p[0];span=float(np.max(np.ptp(points,axis=0)));tolerance=span*1e-8
    vectors=p-origin;_,singular,basis=np.linalg.svd(vectors,full_matrices=True)
    if singular[1]<=tolerance:raise GeometryError('Supporting facet has no nonzero area.')
    if singular[2]>tolerance:raise GeometryError('Supporting facet vertices must be coplanar.')
    x=(p[1]-origin)/np.linalg.norm(p[1]-origin)
    normal=basis[-1];y=np.cross(normal,x);flat=np.column_stack((vectors@x,vectors@y))
    signed=float(sum(np.cross(a,b) for a,b in zip(flat,np.roll(flat,-1,axis=0))))/2
    if signed<0:normal=-normal;y=-y;flat[:,1]*=-1;signed=-signed
    # Every other polygon vertex must lie strictly to the left of each directed
    # edge. This rejects concavity, self crossings, collinear corners and unordered
    # vertex sets without replacing the supplied cycle by a hull or angle sort.
    for a,b in zip(flat,np.roll(flat,-1,axis=0)):
        edge=b-a;cross=np.cross(edge,flat-a);nonend=[value for value in cross if abs(value)>tolerance*np.linalg.norm(edge)]
        if len(nonend)!=len(cycle)-2 or min(nonend)<=0:raise GeometryError('Supporting facet must be a strictly convex simple ordered polygon.')
    centroid=p.mean(axis=0)
    if any(float(normal@(centroid-anchor))>=-tolerance for normal,anchor in planes):
        raise GeometryError('Supporting facet must lie internally; exterior source faces cannot serve as internal panels.')
    source_edges={tuple(sorted(edge)):i for i,edge in enumerate(source_edge_list)}
    edges=[];corners=[]
    for j,(a,b) in enumerate(zip(cycle,cycle[1:]+cycle[:1])):
        edges.append({'index':j,'sourceVertexIds':[a,b],'sourceEdgeId':source_edges.get(tuple(sorted((a,b)))),'lengthMm':float(np.linalg.norm(points[b]-points[a]))})
        previous=p[j-1]-p[j];following=p[(j+1)%len(p)]-p[j]
        angle=math.degrees(math.acos(float(np.clip(previous@following/np.linalg.norm(previous)/np.linalg.norm(following),-1,1))))
        corners.append({'index':j,'sourceVertexId':a,'angleDegrees':angle})
    return {'id':index,'sourceVertexIds':cycle,'pointsMm':flat.tolist(),'sourcePointsMm':p.tolist(),
        'frame':{'originMm':origin.tolist(),'x':x.tolist(),'y':y.tolist(),'normal':normal.tolist()},
        'areaMm2':signed,'perimeterMm':sum(edge['lengthMm'] for edge in edges),'edges':edges,'corners':corners,
        'attachment':'Glue internally to existing assembled double tabs; no independent attachment/stiffness guarantee.'}


def build_reinforcements(source,net_parameters,cycles,*,cancelled=None):
    before=_hash([source,net_parameters,cycles])
    src,params,net,points,planes=_context(source,net_parameters,cancelled)
    if type(cycles) is not list or not 1<=len(cycles)<=32:raise GeometryError('Choose 1 to 32 supporting facets.')
    panels=[];seen=set()
    # Source-edge lookup is kept local to avoid any cross-job mutable state.
    for index,raw in enumerate(cycles):
        _stop(cancelled);cycle=_cycle(raw,len(points));canonical=min(tuple(row[i:]+row[:i]) for row in (cycle,cycle[::-1]) for i in range(len(cycle)))
        if canonical in seen:raise GeometryError('Repeated supporting facet cycle.')
        seen.add(canonical)
        panel=_panel(points,cycle,index,planes,src['edges']);panels.append(panel)
    result={'format':'net-reinforcement','version':1,'kernelVersion':VERSION,'source':src,'sourceHash':_hash(src),
        'netParameters':params,'cycles':deepcopy(cycles),'panels':panels,'units':'mm',
        'referenceEdgeId':0,'referenceEdgeLengthMm':net['referenceEdgeLengthMm'],'modelMmPerUnit':net['scale'],
        'baseNetSvg':net_svg(net),'sourceGeometryChanged':False,'numericMode':'float64-approximate',
        'sourceNetOverlap':net['hasOverlap'],'sourceNetTabOverlap':net['hasTabOverlap'],
        'validation':{'allPanelsPlanar':True,'allPanelsInternallyContained':True,'sourceIdsPreserved':True,
            'scalePreserved':True,'materialThicknessCompensated':False,'structuralRigidityProved':False}}
    result['panelSvg']=panels_svg(panels)
    if _hash([source,net_parameters,cycles])!=before:raise GeometryError('Source construction ownership changed.')
    _stop(cancelled)
    return _portable(result,64*1024*1024)


def restore_reinforcements(source,state,*,cancelled=None):
    normalized=_portable(source,LIMIT)
    if type(state) is not dict or not {'source','sourceHash','netParameters','cycles'}<=set(state) or state.get('format')!='net-reinforcement' or state.get('version')!=1 or state.get('kernelVersion')!=VERSION:
        raise GeometryError('Unsupported saved reinforcement state.')
    if _hash(normalized)!=state.get('sourceHash') or _hash(state.get('source'))!=state.get('sourceHash'):
        raise GeometryError('Saved reinforcement source/attributes/units changed; reconstruct explicitly.')
    # Derived SVG, points and measurements are never trusted during restoration.
    return build_reinforcements(normalized,state['netParameters'],state['cycles'],cancelled=cancelled)


def panels_svg(panels):
    cursor=8.;placed=[];height=16.
    for panel in panels:
        points=np.asarray(panel['pointsMm']);low=points.min(axis=0);high=points.max(axis=0);placed.append((panel,points-low+[cursor,8.]));cursor+=float(high[0]-low[0])+16.;height=max(height,float(high[1]-low[1])+24.)
    out=[f'<svg xmlns="http://www.w3.org/2000/svg" width="{cursor:.12g}mm" height="{height:.12g}mm" viewBox="0 0 {cursor:.12g} {height:.12g}">','<title>Source-vertex internal support panels at net scale</title>']
    for panel,points in placed:
        coords=' '.join(f'{a:.12g},{b:.12g}' for a,b in points);ids=' '.join(map(str,panel['sourceVertexIds']))
        out.append(f'<polygon data-panel-id="{panel["id"]}" data-source-vertex-ids="{ids}" points="{coords}" fill="white" stroke="black" stroke-width="0.2"/>')
        for vertex,point in zip(panel['sourceVertexIds'],points):out.append(f'<text x="{point[0]:.12g}" y="{point[1]:.12g}" font-size="2.5">V{vertex}</text>')
        center=points.mean(axis=0);out.append(f'<text x="{center[0]:.12g}" y="{center[1]:.12g}" font-size="3">R{panel["id"]}</text>')
    out.append('</svg>');return ''.join(out)


def print_pages(receipt,*,width_mm=210,height_mm=297,margin_mm=10):
    """One complete support panel per paper page; never rescales or splits.

    This simple layout is intentionally separate from the existing base-net
    component packing heuristic. Assembly ordering/optimal packing are unproved.
    """
    for value in (width_mm,height_mm,margin_mm):
        if type(value) not in (int,float) or not math.isfinite(value):raise GeometryError('Paper dimensions require finite numbers.')
    if not 20<=width_mm<=2000 or not 20<=height_mm<=2000 or not 0<=margin_mm<min(width_mm,height_mm)/2:
        raise GeometryError('Choose paper dimensions from20 to2000 mm and usable margins.')
    # Reconstruct each panel from owned source evidence before any export.
    if type(receipt) is not dict or 'source' not in receipt:raise GeometryError('Printing requires a complete source-owned support receipt.')
    verified=restore_reinforcements(receipt['source'],receipt);pages=[]
    for panel in verified['panels']:
        points=np.asarray(panel['pointsMm']);size=np.ptp(points,axis=0)+16.;available=np.array([width_mm,height_mm])-2*margin_mm
        if np.all(size<=available):angle=0
        elif np.all(size[::-1]<=available):angle=90
        else:raise GeometryError(f'Support R{panel["id"]} does not fit the printable paper area. No scaling was applied.')
        if angle:points=points@np.array([[0,1],[-1,0]])
        points=points-points.min(axis=0)+margin_mm+8.;ids=' '.join(map(str,panel['sourceVertexIds']))
        coordinates=' '.join(f'{x:.12g},{y:.12g}' for x,y in points)
        svg=f'<svg xmlns="http://www.w3.org/2000/svg" width="{width_mm:.12g}mm" height="{height_mm:.12g}mm" viewBox="0 0 {width_mm:.12g} {height_mm:.12g}"><title>Internal support R{panel["id"]}</title><polygon data-panel-id="{panel["id"]}" data-source-vertex-ids="{ids}" points="{coordinates}" fill="white" stroke="black" stroke-width="0.2"/>'
        for vertex,point in zip(panel['sourceVertexIds'],points):svg+=f'<text x="{point[0]:.12g}" y="{point[1]:.12g}" font-size="2.5">V{vertex}</text>'
        svg+='</svg>';pages.append({'panelId':panel['id'],'angle':angle,'pointsMm':points.tolist(),'svg':svg,'units':'mm'})
    return {'pages':pages,'widthMm':width_mm,'heightMm':height_mm,'marginMm':margin_mm,'scale':1,
        'sourceHash':verified['sourceHash'],'allPanelsRepresented':True,'optimalityClaimed':False}


def measurements(source,net_parameters,*,cycles=None,unit='mm',angle_unit='degrees',cancelled=None):
    if unit not in UNITS or angle_unit not in ('degrees','radians'):raise GeometryError('Choose mm/cm/m/in/ft and degrees/radians.')
    before=_hash([source,net_parameters,cycles]);src,params,net,points,planes=_context(source,net_parameters,cancelled)
    angle_factor=1. if angle_unit=='degrees' else math.pi/180.;distance_factor=UNITS[unit];rows=[]
    def add(kind,index,owner,vertices,value,units):rows.append({'kind':kind,'sourceIndex':index,'ownerIndex':owner,'sourceVertexIds':vertices,'value':value,'units':units})
    angles=dihedrals(src)['records']
    for row in angles:
        _stop(cancelled);edge=src['edges'][row['ridge']]
        add('edge-length',row['ridge'],None,edge,float(np.linalg.norm(points[edge[1]]-points[edge[0]]))/distance_factor,unit)
        add('interior-dihedral',row['ridge'],None,edge,row['value']*angle_factor,angle_unit)
    for face_index,face in enumerate(src['faces']):
        p=points[face]
        for j,vertex in enumerate(face):
            left=p[j-1]-p[j];right=p[(j+1)%len(face)]-p[j]
            angle=math.acos(float(np.clip(left@right/np.linalg.norm(left)/np.linalg.norm(right),-1,1)))
            add('face-corner',j,face_index,[face[j-1],vertex,face[(j+1)%len(face)]],angle if angle_unit=='radians' else math.degrees(angle),angle_unit)
    if cycles is not None:
        reinforcement=build_reinforcements(src,params,cycles,cancelled=cancelled)
        for panel in reinforcement['panels']:
            for edge in panel['edges']:add('panel-edge',edge['index'],panel['id'],edge['sourceVertexIds'],edge['lengthMm']/distance_factor,unit)
            for corner in panel['corners']:add('panel-corner',corner['index'],panel['id'],[corner['sourceVertexId']],corner['angleDegrees']*angle_factor,angle_unit)
            add('panel-area',panel['id'],panel['id'],panel['sourceVertexIds'],panel['areaMm2']/distance_factor**2,unit+'^2')
    report={'format':'net-measurements','version':1,'kernelVersion':VERSION,'sourceId':src['id'],'sourceHash':_hash(src),
        'sourceUnits':src.get('metadata',{}).get('coordinateUnits','model'),'distanceUnit':unit,'angleUnit':angle_unit,
        'referenceEdgeId':0,'referenceEdgeLengthMm':net['referenceEdgeLengthMm'],'netParameters':params,'rows':rows,
        'dihedralDefinition':'Unsigned convex interior angle; 180 degrees minus angle between outward normals.',
        'numericMode':'float64-approximate','unitsOrigin':'Physical E0 net scale, independent of raw model coordinate unit labels.'}
    buffer=io.StringIO(newline='');writer=csv.writer(buffer);writer.writerow(['kind','source_index','owner_index','source_vertex_ids','value','units','source_hash'])
    for row in rows:writer.writerow([row['kind'],row['sourceIndex'],row['ownerIndex'],' '.join(map(str,row['sourceVertexIds'])),format(row['value'],'.17g'),row['units'],report['sourceHash']])
    if _hash([source,net_parameters,cycles])!=before:raise GeometryError('Source measurement ownership changed.')
    _stop(cancelled)
    return _portable({'report':report,'json':json.dumps(report,ensure_ascii=True,allow_nan=False,indent=2)+'\n','csv':buffer.getvalue()},64*1024*1024)
