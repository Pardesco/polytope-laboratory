"""Straight lightweight polylines and ordered rectangular polygon meshes."""
import numpy as np
import math
from .geometry import GeometryError


def lightweight(fields, info, builder, source_id):
    from .dxf import _int, _float, _one, _number, MAX_SOURCE_VERTICES
    count = _int(fields,90)
    if not 2<=count<=MAX_SOURCE_VERTICES:
        raise GeometryError('DXF unsupported entity LWPOLYLINE without a valid bounded vertex table (group 90).')
    flags=_int(fields,70)
    if flags & ~(1|128): raise GeometryError('DXF LWPOLYLINE flags support closed/plinegen only.')
    if _float(fields,43)!=0: raise GeometryError('DXF widened LWPOLYLINE is unsupported; export its boundary as faces.')
    rows=[]
    for code,value in fields:
        if code==10: rows.append([(10,value)])
        elif code in (20,40,41,42,91):
            if not rows: raise GeometryError('DXF LWPOLYLINE vertex field precedes its X coordinate.')
            rows[-1].append((code,value))
    if len(rows)!=count: raise GeometryError('DXF LWPOLYLINE group 90 does not match its vertex count.')
    normal=np.asarray(info['extrusionDirection']); normal=normal/math.hypot(*normal)
    axis=np.array([0.,1.,0.]) if abs(normal[0])<1/64 and abs(normal[1])<1/64 else np.array([0.,0.,1.])
    x=np.cross(axis,normal); x/=np.linalg.norm(x); y=np.cross(normal,x)
    elevation=_float(fields,38)
    mapped=[]
    for i,row in enumerate(rows):
        if any(_float(row,c)!=0 for c in (40,41,42)):
            raise GeometryError('DXF bulged/widened LWPOLYLINE is unsupported; tessellate curves into straight segments first.')
        if _one(row,20) is None: raise GeometryError('DXF LWPOLYLINE requires an X/Y pair for every vertex.')
        if _one(row,91) is not None: _int(row,91)
        p=_float(row,10)*x+_float(row,20)*y+elevation*normal
        # Apply the same finite coordinate bounds after OCS conversion.
        point=[_number(format(v,'.17g'),'LWPOLYLINE WCS coordinate') for v in p]
        mapped.append(builder.vertex(point,source_id,i))
    ids=[v for v,s in mapped]
    # Some writers repeat the initial point as well as setting Closed.
    if flags&1 and len(ids)>2 and ids[0]==ids[-1]: ids=ids[:-1]; mapped=mapped[:-1]
    info.update(modelVertices=ids,closed=bool(flags&1),coordinateSystem='OCS transformed to WCS')
    if flags&1:
        if len(ids)<3: raise GeometryError('DXF closed LWPOLYLINE needs at least three distinct corners.')
        info['modelFaces']=[builder.face(ids,source_id,[],[s for v,s in mapped])]
    else:
        info['modelEdges']=[builder.edge(a,b,{'entity':source_id,'kind':'LWPOLYLINE'}) for a,b in zip(ids,ids[1:])]


def polygon_mesh(records, index, info, builder, source_id):
    from .dxf import _int, _point, _float, _style, MAX_SOURCE_VERTICES
    fields=records[index]['fields']; flags=_int(fields,70)
    if flags & ~(16|1|32|128): raise GeometryError('DXF fitted polygon meshes are unsupported; export an unfitted polygon mesh.')
    m,n=_int(fields,71),_int(fields,72)
    if min(m,n)<2 or m*n>MAX_SOURCE_VERTICES: raise GeometryError('DXF polygon mesh M/N counts exceed supported bounds.')
    if flags&1 and m<3 or flags&32 and n<3: raise GeometryError('DXF closed polygon mesh dimensions need at least three vertices.')
    if any(_int(fields,c) for c in (73,74,75)): raise GeometryError('DXF smooth/fitted polygon meshes are unsupported.')
    mapped=[]; index+=1
    while index<len(records) and records[index]['type']=='VERTEX':
        vf=records[index]['fields']; _style(records[index],{})
        if _int(vf,70)!=64 or any(_float(vf,c) for c in (40,41,42,50)):
            raise GeometryError('DXF polygon mesh requires unfitted coordinate VERTEX records (flag 64).')
        if len(mapped)>=m*n: raise GeometryError('DXF polygon mesh has more vertices than declared M times N.')
        mapped.append(builder.vertex(_point(vf),source_id,len(mapped))); index+=1
    if index>=len(records) or records[index]['type']!='SEQEND': raise GeometryError('DXF polygon mesh requires a terminating SEQEND.')
    if len(mapped)!=m*n: raise GeometryError('DXF polygon mesh vertex count differs from declared M times N.')
    info.update(modelVertices=[v for v,s in mapped],modelFaces=[],meshDimensions=[m,n])
    for i in range(m if flags&1 else m-1):
        for j in range(n if flags&32 else n-1):
            corners=[mapped[a*n+b] for a,b in [(i,j),((i+1)%m,j),((i+1)%m,(j+1)%n),(i,(j+1)%n)]]
            info['modelFaces'].append(builder.face([v for v,s in corners],source_id,[],[s for v,s in corners]))
    return index


def layer_components(builder, entities):
    """Independent layer incidence partitions; coordinates are never welded across layers."""
    layers={}
    for source in builder.sources:
        layer=entities[source['entity']]['layer']
        maps=layers.setdefault(layer,{k:set() for k in ('vertices','edges','faces','cells')})
        maps['vertices'].add(source['modelVertex'])
    for i,sources in enumerate(builder.edge_sources):
        layers[entities[sources[0]['entity']]['layer']]['edges'].add(i)
    for i,source in enumerate(builder.face_sources):
        layers[entities[source['entity']]['layer']]['faces'].add(i)
    return [{'id':'dxf-layer-'+str(i),'name':name,'sourcePath':[],
             'maps':{key:sorted(ids) for key,ids in maps.items()}} for i,(name,maps) in enumerate(layers.items())]
