"""Colored surface interchange; displayed coordinates are approximate, never solids."""
import base64
import json
import math
import struct
from pathlib import Path
import uuid
import xml.etree.ElementTree as ET
import numpy as np
from .geometry import GeometryError, identity, validate
from .printable_export import _points

MAX_BYTES = 64 * 1024 * 1024
VIEW_FORMATS = ('glb', 'obj', 'x3d', 'off', 'json', 'stl', 'dxf', 'vrml', 'pov')


def face_colors(model):
    table = model.get('metadata', {}).get('offColors', {}).get('faces')
    if table is None: table=[None]*len(model['faces'])
    if type(table) is not list or len(table)!=len(model['faces']): raise GeometryError('Source face color count does not match incidence.')
    colors = []
    for i in range(len(model['faces'])):
        color = table[i] if i < len(table) else None
        values = [0.6, 0.7, 0.8, 1.0]
        if color is not None:
            if type(color) is not dict or color.get('encoding') not in ('byte', 'unit'):
                raise GeometryError('Invalid source face color encoding.')
            channels = color.get('values')
            maximum = 255 if color['encoding'] == 'byte' else 1
            if type(channels) is not list or len(channels) not in (3, 4) or any(type(x) not in (int, float) or color['encoding']=='byte' and type(x) is not int or not math.isfinite(x) or not 0 <= x <= maximum for x in channels):
                raise GeometryError('Source face colors require bounded RGB/RGBA channels.')
            values = [x/maximum for x in channels]
            if len(values) == 3: values.append(1)
        colors.append(values)
    return colors


def colored_obj(model, material_name='materials.mtl'):
    colors = face_colors(model)
    unique = list(dict.fromkeys(tuple(c) for c in colors))
    materials = {color: i for i, color in enumerate(unique)}
    lines = ['# Polytope Laboratory colored boundary geometry', 'mtllib '+material_name]
    lines += ['v '+' '.join(format(x, '.17g') for x in list(v)+([0] if len(v)==2 else [])) for v in model['vertices']]
    for face, color in zip(model['faces'], colors):
        lines += ['usemtl color_'+str(materials[tuple(color)]), 'f '+' '.join(str(v+1) for v in face)]
    lines += ['l '+' '.join(str(v+1) for v in edge) for edge in model['edges']]
    mtl = []
    for i, color in enumerate(unique):
        mtl += ['newmtl color_'+str(i), 'Kd '+' '.join(format(x, '.17g') for x in color[:3]), 'd '+format(color[3], '.17g'), 'illum 1', '']
    return '\n'.join(lines)+'\n', '\n'.join(mtl)+'\n'


def export_obj_result(model, path=None):
    if not validate(model)['passed']: raise GeometryError('Cannot export invalid incidence.')
    if not path:
        text, materials=colored_obj(model)
        return {'text':text,'materials':materials}
    from .formats import atomic_write
    target=Path(path); target.parent.mkdir(parents=True,exist_ok=True)
    name='polytope-materials-'+str(uuid.uuid4())+'.mtl'
    text, materials=colored_obj(model,name);sidecar=target.parent/name
    published=False;created=False
    try:
        with sidecar.open('x',encoding='utf-8',newline='\n') as stream:
            created=True;stream.write(materials);stream.flush()
            import os
            os.fsync(stream.fileno())
        atomic_write(target,text);published=True
        return {'path':str(target),'materialPath':str(sidecar),'bytes':len(text.encode('utf-8'))}
    finally:
        if created and not published:sidecar.unlink(missing_ok=True)


def export_x3d(model):
    colors = face_colors(model)
    root = ET.Element('X3D', profile='Interchange', version='3.3')
    from .export_context import METERS
    unit=model.get('metadata',{}).get('coordinateUnits','model')
    if unit in METERS:
        ET.SubElement(ET.SubElement(root,'head'),'unit',category='length',name=unit,conversionFactor=format(float(METERS[unit]),'.17g'))
    scene = ET.SubElement(root, 'Scene')
    points = ' '.join(' '.join(format(x, '.17g') for x in list(v)+([0] if len(v)==2 else [])) for v in model['vertices'])
    if model['faces']:
        shape = ET.SubElement(scene, 'Shape')
        mesh = ET.SubElement(shape, 'IndexedFaceSet', solid='false', colorPerVertex='false',
                             coordIndex=' '.join(' '.join(map(str, f))+' -1' for f in model['faces']))
        ET.SubElement(mesh, 'Coordinate', point=points)
        ET.SubElement(mesh, 'ColorRGBA', color=' '.join(' '.join(format(x, '.17g') for x in c) for c in colors))
    if model['edges']:
        lines = ET.SubElement(ET.SubElement(scene, 'Shape'), 'IndexedLineSet', coordIndex=' '.join(f'{a} {b} -1' for a, b in model['edges']))
        ET.SubElement(lines, 'Coordinate', point=points)
    return ET.tostring(root, encoding='unicode', xml_declaration=True)+'\n'


def export_glb(display, scale, metadata, name):
    """Nonindexed flat face colors and independent LINES, with component nodes."""
    doc = {'asset': {'version':'2.0', 'generator':'Polytope Laboratory', 'extras':metadata},
           'scene':0, 'scenes':[{'nodes':[0]}], 'nodes':[{'name':name, 'children':[]}],
           'meshes':[], 'buffers':[], 'bufferViews':[], 'accessors':[],
           'materials':[{'doubleSided':True, 'alphaMode':'BLEND',
                         'pbrMetallicRoughness':{'baseColorFactor':[1,1,1,1], 'metallicFactor':0, 'roughnessFactor':1}}]}
    binary = bytearray()
    def accessor(rows, kind, bounds=False):
        array = np.asarray(rows, dtype='<f4')
        if not np.isfinite(array).all(): raise GeometryError('GLB coordinates overflow float32.')
        offset = len(binary); binary.extend(array.tobytes())
        view = len(doc['bufferViews'])
        doc['bufferViews'].append({'buffer':0, 'byteOffset':offset, 'byteLength':array.nbytes, 'target':34962})
        record = {'bufferView':view, 'componentType':5126, 'count':len(array), 'type':kind}
        if bounds: record.update(min=array.min(axis=0).tolist(), max=array.max(axis=0).tolist())
        doc['accessors'].append(record)
        return len(doc['accessors'])-1
    for component, label in enumerate(display['components']):
        primitives = []
        for key, width, mode in [('triangles',3,4), ('edges',2,1), ('nodes',1,0)]:
            indices = [i for i, c in enumerate(display[key+'_components']) if c==component]
            if not indices: continue
            positions = np.asarray(display[key])[indices].reshape((-1,3))*scale
            attributes = {'POSITION':accessor(positions, 'VEC3', True)}
            if key=='triangles':
                attributes['COLOR_0'] = accessor(np.repeat(np.asarray(display['colors'])[indices], 3, axis=0), 'VEC4')
            else:
                attributes['COLOR_0'] = accessor(np.tile(display['edge_color'] if key=='edges' else display['node_color'], (len(positions),1)), 'VEC4')
            primitives.append({'attributes':attributes, 'mode':mode, 'material':0})
        if primitives:
            index = len(doc['nodes']); doc['nodes'][0]['children'].append(index)
            doc['nodes'].append({'name':label, 'mesh':len(doc['meshes'])})
            doc['meshes'].append({'name':label, 'primitives':primitives})
    doc['buffers'] = [{'byteLength':len(binary)}]
    data = json.dumps(doc, ensure_ascii=False, allow_nan=False, separators=(',', ':')).encode('utf-8')
    data += b' '*(-len(data)%4); binary.extend(b'\0'*(-len(binary)%4))
    result = struct.pack('<III',0x46546c67,2,28+len(data)+len(binary))+struct.pack('<II',len(data),0x4e4f534a)+data+struct.pack('<II',len(binary),0x004e4942)+binary
    validate_glb(result)
    return result


def validate_glb(data):
    """Validate our bounded float32, nonindexed GLB profile, including stored bounds."""
    def require(ok, message):
        if not ok: raise GeometryError('Invalid GLB: '+message)
    require(isinstance(data, (bytes, bytearray)) and 28 <= len(data) <= MAX_BYTES, 'size')
    require(struct.unpack_from('<III', data)==(0x46546c67,2,len(data)), 'header')
    size, kind = struct.unpack_from('<II',data,12)
    end = 20+size
    require(kind==0x4e4f534a and size%4==0 and end+8<=len(data), 'JSON chunk alignment/bounds')
    try: doc = json.loads(data[20:end])
    except (ValueError, UnicodeError) as exc: raise GeometryError('Invalid GLB JSON.') from exc
    size, kind = struct.unpack_from('<II',data,end)
    require(kind==0x004e4942 and size%4==0 and end+8+size==len(data), 'BIN chunk alignment/bounds')
    binary = memoryview(data)[end+8:]
    require(doc.get('asset',{}).get('version')=='2.0' and len(doc.get('buffers',[]))==1, 'asset/buffer')
    declared = doc['buffers'][0].get('byteLength',-1)
    require(type(declared) is int and 0<=size-declared<=3 and 'uri' not in doc['buffers'][0], 'buffer length')
    arrays = []
    try:
        for view in doc['bufferViews']:
            offset, length = view.get('byteOffset',0), view['byteLength']
            require(view['buffer']==0 and type(offset) is int and type(length) is int and offset%4==0 and length>0 and 0<=offset<=declared-length, 'buffer view')
        for acc in doc['accessors']:
            require(type(acc['bufferView']) is int and 0<=acc['bufferView']<len(doc['bufferViews']), 'accessor view index')
            view = doc['bufferViews'][acc['bufferView']]; width = {'VEC3':3,'VEC4':4}[acc['type']]
            count, offset = acc['count'], acc.get('byteOffset',0)
            require(acc['componentType']==5126 and type(count) is int and count>0 and type(offset) is int and offset%4==0 and 0<=offset<=view['byteLength']-count*width*4, 'accessor bounds')
            array = np.frombuffer(binary, '<f4', count*width, view.get('byteOffset',0)+offset).reshape((-1,width))
            require(np.isfinite(array).all(), 'finite values')
            for field, fn in [('min',np.min), ('max',np.max)]:
                if field in acc: require(np.array_equal(acc[field],fn(array,axis=0)), 'accessor '+field)
            arrays.append(array)
        for mesh in doc['meshes']:
            for prim in mesh['primitives']:
                position = prim['attributes']['POSITION']; count = len(arrays[position]); mode = prim['mode']
                require(type(position) is int and 0<=position<len(arrays), 'POSITION index')
                require(mode in (0,1,4) and count%{0:1,1:2,4:3}[mode]==0 and arrays[position].shape[1]==3, 'primitive count')
                require('min' in doc['accessors'][position] and 'max' in doc['accessors'][position], 'POSITION bounds')
                color_index=prim['attributes']['COLOR_0']
                require(type(color_index) is int and 0<=color_index<len(arrays), 'COLOR index')
                color = arrays[color_index]
                require(color.shape==(count,4) and np.all((color>=0)&(color<=1)), 'color values/count')
        seen = set()
        def node(index):
            require(type(index) is int and 0<=index<len(doc['nodes']) and index not in seen, 'node hierarchy')
            seen.add(index); record=doc['nodes'][index]
            if 'mesh' in record: require(0<=record['mesh']<len(doc['meshes']), 'node mesh')
            for child in record.get('children',[]): node(child)
        for root in doc['scenes'][doc['scene']]['nodes']: node(root)
    except (KeyError, IndexError, TypeError, ValueError, OverflowError, RecursionError) as exc:
        raise GeometryError('Invalid GLB structure.') from exc
    return doc


def _display(display):
    if type(display) is not dict: raise GeometryError('Displayed export requires a finite display snapshot.')
    diagnostics=display.get('diagnostics',[])
    if type(diagnostics) is not list or len(diagnostics)>128 or any(type(x) is not str or len(x)>4096 for x in diagnostics):
        raise GeometryError('Display diagnostics exceed supported limits.')
    if display.get('complete') is False or any(any(word in x.lower() for word in ('resource limit','omitted','unresolved','unsupported','undefined')) for x in diagnostics):
        raise GeometryError('Displayed export requires complete finite geometry; resolve display diagnostics first.')
    result = {key:_points(display.get(key,[]),width,key).tolist() for key,width in [('nodes',1),('edges',2),('triangles',3)]}
    result['diagnostics']=diagnostics
    labels = display.get('components',['Model'])
    if type(labels) is not list or not 1<=len(labels)<=1024 or any(type(x) is not str or len(x)>512 for x in labels):
        raise GeometryError('Display component names exceed supported limits.')
    result['components'] = labels
    for key in ('nodes','edges','triangles'):
        ids=display.get(key+'_components',[0]*len(result[key]))
        if type(ids) is not list or len(ids)!=len(result[key]) or any(type(i) is not int or not 0<=i<len(labels) for i in ids):
            raise GeometryError('Display component ownership does not match geometry.')
        result[key+'_components']=ids
    colors=display.get('colors',[[.6,.7,.8,1]]*len(result['triangles']))
    def rgba(c): return type(c) is list and len(c)==4 and all(type(x) in (int,float) and math.isfinite(x) and 0<=x<=1 for x in c)
    if type(colors) is not list or len(colors)!=len(result['triangles']) or not all(rgba(c) for c in colors):
        raise GeometryError('Display face colors must be finite linear RGBA values.')
    result['colors']=colors
    for key, fallback in [('edge_color',[.35,.4,.45,1]),('node_color',[.7,.75,.8,1])]:
        result[key]=display.get(key,fallback)
        if not rgba(result[key]): raise GeometryError('Display line/point colors require linear RGBA.')
    if not any(result[key] for key in ('nodes','edges','triangles')): raise GeometryError('The displayed geometry is empty.')
    return result


def prepare_view_export(model, display, format='glb', size_m=.1, source_unit='model', target_unit='m', document_metadata=None, notes=None, include_text=True):
    if not validate(model)['passed']: raise GeometryError('Displayed export requires valid source geometry.')
    if format not in VIEW_FORMATS: raise GeometryError('Choose a supported displayed geometry format.')
    if type(size_m) not in (int,float) or not math.isfinite(size_m) or not 1e-6<=size_m<=1000:
        raise GeometryError('Displayed longest dimension must be between 0.000001 and 1000 meters.')
    from .export_context import METERS, UNIT_NAMES
    from .document_metadata import validate_metadata
    if source_unit not in UNIT_NAMES or target_unit not in METERS: raise GeometryError('Displayed export needs physical output units.')
    if format in ('glb','vrml') and target_unit!='m': raise GeometryError('GLB and displayed VRML use meters.')
    metadata = document_metadata if document_metadata is not None else model.get('metadata',{}).get('documentMetadata',{})
    validate_metadata(metadata)
    if notes is not None and (type(notes) is not str or len(notes.encode('utf-8'))>1024*1024): raise GeometryError('Export notes exceed the text limit.')
    data=_display(display)
    points=np.concatenate([np.asarray(data[k]).reshape((-1,3)) for k in ('nodes','edges','triangles')])
    span=float(np.ptp(points,axis=0).max())
    if not math.isfinite(span) or span<=0: raise GeometryError('Displayed geometry has no nonzero finite extent.')
    scale=size_m/span
    losses=['Displayed tessellation replaces intrinsic incidence; 4D cells, construction history, annotations and lighting are omitted.']+data['diagnostics']
    if format not in ('json','off') and notes: losses.append('Document notes are omitted; save a project to retain them.')
    if format not in ('glb','json','off') and metadata: losses.append('Document metadata is omitted by this format.')
    report={'sourceFingerprint':identity(model),'sourceUnit':source_unit,'targetUnit':target_unit,
            'coordinateDomain':'displayed 3D geometry','scaleFactor':scale/float(METERS[target_unit]),
            'sizeMeters':size_m,'triangleCount':len(data['triangles']),'lineCount':len(data['edges']),
            'losses':losses,'precision':'float32 GLB; float64 decimal text', 'encoding':'base64' if format=='glb' else 'utf8'}
    if format=='glb':
        blob=export_glb(data,scale,{**metadata,'coordinateUnits':'m','sizeMeters':size_m},model['name'])
        decoded=validate_glb(blob)
        arrays=[a for a in decoded['accessors'] if 'min' in a]
        low=np.min([a['min'] for a in arrays],axis=0); high=np.max([a['max'] for a in arrays],axis=0)
        report.update(boundsMeters={'min':low.tolist(),'max':high.tolist()},encodedSizeResidualMeters=abs(float(max(high-low))-size_m))
        return {'text':base64.b64encode(blob).decode('ascii'),'report':report}
    # Coordinate welding is literal and face triangles are not a solid assertion.
    vertices, lookup, faces, edges, edge_set, colors = [], {}, [], [], set(), []
    factor=scale/float(METERS[target_unit])
    def vertex(p):
        key=tuple(p)
        if key not in lookup: lookup[key]=len(vertices); vertices.append([x*factor for x in p])
        return lookup[key]
    def edge(a,b):
        pair=tuple(sorted((a,b)))
        if a!=b and pair not in edge_set: edges.append(list(pair)); edge_set.add(pair)
    for p in data['nodes']: vertex(p)
    for a,b in data['edges']: edge(vertex(a),vertex(b))
    srgb=lambda x:12.92*x if x<=.0031308 else 1.055*x**(1/2.4)-.055
    for triangle,color in zip(data['triangles'],data['colors']):
        face=[vertex(p) for p in triangle]
        if len(set(face))<3 or np.linalg.norm(np.cross(np.subtract(triangle[1],triangle[0]),np.subtract(triangle[2],triangle[0])))<=0:
            raise GeometryError('Displayed face collapses; hide faces to export the remaining lines or adjust the projection.')
        faces.append(face); colors.append({'encoding':'unit','values':[srgb(x) for x in color[:3]]+[color[3]]})
        for a,b in zip(face,face[1:]+face[:1]): edge(a,b)
    surface={'id':model['id']+'-display','name':model['name']+' (displayed)', 'dimension':3,'embeddingDimension':3,
             'interpretation':'generalized-complex','vertices':vertices,'faces':faces,'edges':edges,'cells':[],
             'metadata':{'coordinateUnits':target_unit,'offColors':{'faces':colors},'documentMetadata':metadata,'documentNotes':notes or ''}}
    if not validate(surface)['passed']: raise GeometryError('Displayed surface cannot be represented as valid triangle incidence.')
    if format=='obj': text, mtl=colored_obj(surface,'__POLYTOPE_MTL__')
    elif format in ('stl','pov'):
        rows=['solid displayed_surface'] if format=='stl' else ['mesh {']
        for face in faces:
            p=np.asarray(vertices)[face]; n=np.cross(p[1]-p[0],p[2]-p[0]); n/=np.linalg.norm(n)
            if format=='stl': rows+=['facet normal '+' '.join(map(str,n)),'outer loop']+['vertex '+' '.join(map(str,v)) for v in p]+['endloop','endfacet']
            else: rows+=['triangle { '+', '.join('<'+','.join(map(str,v))+'>' for v in p)+' }']
        if not faces: raise GeometryError('STL/POV surface export needs visible nondegenerate faces.')
        rows+=['endsolid displayed_surface'] if format=='stl' else ['pigment { color rgb <0.6,0.7,0.8> }','}']
        text='\n'.join(rows)+'\n'; losses.append('Triangle surface only; closedness, outward orientation and a printable solid are not asserted. Colors and lines are omitted.')
    else:
        from .formats import export_model
        if format=='off':
            boundary={tuple(sorted((a,b))) for face in faces for a,b in zip(face,face[1:]+face[:1])}
            surface['edges']=[list(e) for e in sorted(boundary)]
        text=export_model(surface,format)
        if format in ('off','vrml'): losses.append('Standalone lines and points are omitted; face boundary edges remain.')
        if format=='vrml': losses.append('Face colors are omitted by the legacy VRML codec.')
        if format=='dxf': losses.append('DXF retains edges only; filled faces and colors are omitted.')
    if len(text.encode('utf-8'))>MAX_BYTES: raise GeometryError('Displayed export exceeds 64 MiB.')
    prepared={'text':text,'report':report}
    if format=='obj': prepared['materials']=mtl
    return prepared
