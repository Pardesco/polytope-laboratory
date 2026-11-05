"""Source triangle RGBA in printable 3MF, OBJ/MTL and meter-scaled GLB."""
import xml.etree.ElementTree as ET

MATERIAL = 'http://schemas.microsoft.com/3dmanufacturing/material/2015/02'


def color_group(root, resources, shells):
    ET.register_namespace('m', MATERIAL)
    root.set('requiredextensions', 'm')
    resource_id=len(shells)+2
    group=ET.SubElement(resources,'{'+MATERIAL+'}colorgroup',id=str(resource_id))
    unique=list(dict.fromkeys(tuple(c) for s in shells for c in s.get('colors',[])))
    for c in unique:
        rgba='#'+''.join(f'{round(x*255):02X}' for x in c)
        ET.SubElement(group,'{'+MATERIAL+'}color',color=rgba)
    return resource_id,{c:i for i,c in enumerate(unique)}


def obj(shells):
    unique=list(dict.fromkeys(tuple(c) for s in shells for c in s['colors']));indices={c:i for i,c in enumerate(unique)}
    rows=['# Polytope Laboratory colored boundary geometry','mtllib __POLYTOPE_MTL__'];offset=1
    for s in shells:
        rows.append('g '+s['name'])
        rows.extend('v '+' '.join(f'{x:.17g}' for x in p) for p in s['vertices'])
        for tri,color in zip(s['triangles'],s['colors']):
            rows.extend(('usemtl color_'+str(indices[tuple(color)]),'f '+' '.join(str(int(v)+offset) for v in tri)))
        offset+=len(s['vertices'])
    materials=[]
    for i,c in enumerate(unique):materials.extend(('newmtl color_'+str(i),'Kd '+' '.join(f'{x:.17g}' for x in c[:3]),f'd {c[3]:.17g}','illum 1',''))
    return '\n'.join(rows)+'\n','\n'.join(materials)+'\n'


def glb(shells):
    from .interchange import export_glb
    triangles=[];colors=[];owners=[]
    for i,s in enumerate(shells):
        triangles.extend(s['vertices'][s['triangles']].tolist());owners.extend([i]*len(s['triangles']))
        colors.extend(s.get('colors',[[.6,.7,.8,1]]*len(s['triangles'])))
    def linear(x):return x/12.92 if x<=.04045 else ((x+.055)/1.055)**2.4
    display={'components':[s['name'] for s in shells],'triangles':triangles,'colors':[[linear(x) for x in c[:3]]+[c[3]] for c in colors],
             'triangles_components':owners,'edges':[],'edges_components':[],'nodes':[],'nodes_components':[]}
    # GLB uses meters even though the printable review and dimensions use mm.
    return export_glb(display,.001,{'coordinateUnits':'m','printableUnits':'mm'},'Printable solid')
