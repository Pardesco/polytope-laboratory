"""Rebuild the native convex manifest from retained published count facts."""
import json
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from engine.generators import CATALOG

# Olshevsky ordering; V/E/F/C transcribed independently of the native generator.
ROWS='''
1 A4 1000 pen 5-cell 5 10 10 5
2 A4 0100 rap Rectified_5-cell 10 30 30 10
3 A4 1100 tip Truncated_5-cell 20 40 30 10
4 A4 1010 srip Cantellated_5-cell 30 90 80 20
5 A4 1001 spid Runcinated_5-cell 20 60 70 30
6 A4 0110 deca Bitruncated_5-cell 30 60 40 10
7 A4 1110 grip Cantitruncated_5-cell 60 120 80 20
8 A4 1101 prip Runcitruncated_5-cell 60 150 120 30
9 A4 1111 gippid Omnitruncated_5-cell 120 240 150 30
10 B4 1000 tes Tesseract 16 32 24 8
11 B4 0100 rit Rectified_tesseract 32 96 88 24
12 B4 0001 hex 16-cell 8 24 32 16
13 B4 1100 tat Truncated_tesseract 64 128 88 24
14 B4 1010 srit Cantellated_tesseract 96 288 248 56
15 B4 1001 sidpith Runcinated_tesseract 64 192 208 80
16 B4 0110 tah Bitruncated_tesseract 96 192 120 24
17 B4 0011 thex Truncated_16-cell 48 120 96 24
18 B4 1110 grit Cantitruncated_tesseract 192 384 248 56
19 B4 1101 proh Runcitruncated_tesseract 192 480 368 80
20 B4 1011 prit Runcitruncated_16-cell 192 480 368 80
21 B4 1111 gidpith Omnitruncated_tesseract 384 768 464 80
22 F4 1000 ico 24-cell 24 96 96 24
23 F4 0100 rico Rectified_24-cell 96 288 240 48
24 F4 1100 tico Truncated_24-cell 192 384 240 48
25 F4 1010 srico Cantellated_24-cell 288 864 720 144
26 F4 1001 spic Runcinated_24-cell 144 576 672 240
27 F4 0110 cont Bitruncated_24-cell 288 576 336 48
28 F4 1110 grico Cantitruncated_24-cell 576 1152 720 144
29 F4 1101 prico Runcitruncated_24-cell 576 1440 1104 240
30 F4 1111 gippic Omnitruncated_24-cell 1152 2304 1392 240
31 F4 - sadi Snub_24-cell 96 432 480 144
32 H4 1000 hi 120-cell 600 1200 720 120
33 H4 0100 rahi Rectified_120-cell 1200 3600 3120 720
34 H4 0010 rox Rectified_600-cell 720 3600 3600 720
35 H4 0001 ex 600-cell 120 720 1200 600
36 H4 1100 thi Truncated_120-cell 2400 4800 3120 720
37 H4 1010 srahi Cantellated_120-cell 3600 10800 9120 1920
38 H4 1001 sidpixhi Runcinated_120-cell 2400 7200 7440 2640
39 H4 0110 xhi Bitruncated_120-cell 3600 7200 4320 720
40 H4 0101 srix Cantellated_600-cell 3600 10800 8640 1440
41 H4 0011 tex Truncated_600-cell 1440 4320 3600 720
42 H4 1110 grahi Cantitruncated_120-cell 7200 14400 9120 1920
43 H4 1101 prix Runcitruncated_120-cell 7200 18000 13440 2640
44 H4 1011 prahi Runcitruncated_600-cell 7200 18000 13440 2640
45 H4 0111 grix Cantitruncated_600-cell 7200 14400 8640 1440
46 H4 1111 gidpixhi Omnitruncated_120-cell 14400 28800 17040 2640
47 - - gap Grand_antiprism 100 500 720 320
'''

def build():
    old={1:'simplex4',10:'tesseract',12:'cross4',22:'cell24',32:'cell120',35:'cell600'}
    entries=[]
    for row in ROWS.strip().splitlines():
        index,family,mask,acronym,name,*counts=row.split();index=int(index);rings=list(map(int,mask)) if mask!='-' else None
        diagram={'A4':'3,3,3','B4':'4,3,3','F4':'3,4,3','H4':'5,3,3'}.get(family)
        notation=''.join(('x' if ring else 'o')+(diagram.split(',')[i] if i<3 else '') for i,ring in enumerate(rings)) if rings else 's{3,4,3}' if index==31 else 'Non-Wythoffian (no ring diagram)'
        entry={'key':old.get(index,'uniform4-'+acronym),'name':name.replace('_',' '),'dimension':4,
            'family':'Convex uniform 4D','uniformIndex':index,'bowers':acronym,'counts':list(map(int,counts)),
            'aliases':[acronym,'O'+str(index)],'symbol':notation,'coxeterDiagram':notation,
            'convex':True,'uniform':True,'vertexTransitive':True,'regular':index in old,'chiral':False,
            'classificationVerified':True,'numericContract':'Native float64 construction; no exact certificate'}
        if rings:entry.update(coxeterFamily=family,rings=rings,symmetryGroup='['+diagram+']')
        elif index==31:entry['symmetryGroup']='[3+,4,3]'
        else:entry['symmetryGroup']='[[10,2+,10]]'
        entries.append(entry)
    prisms='''
48 tepe tetrahedron 8 16 14 6
49 tuttip truncated-tetrahedron 24 48 34 10
50 cope cuboctahedron 24 60 52 16
51 ope octahedron 12 30 28 10
52 sircope rhombicuboctahedron 48 120 100 28
53 ticcup truncated-cube 48 96 64 16
54 tope truncated-octahedron 48 96 64 16
55 gircope truncated-cuboctahedron 96 192 124 28
56 sniccup snub-cube 48 144 136 40
57 dope dodecahedron 40 80 54 14
58 iddip icosidodecahedron 60 150 124 34
59 ipe icosahedron 24 72 70 22
60 tiddip truncated-dodecahedron 120 240 154 34
61 sriddip rhombicosidodecahedron 120 300 244 64
62 tipe truncated-icosahedron 120 240 154 34
63 griddip truncated-icosidodecahedron 240 480 304 64
64 sniddip snub-dodecahedron 120 360 334 94
10 tes cube 16 32 24 8
'''
    for row in prisms.strip().splitlines():
        index,acronym,base,*counts=row.split();source=next(r for r in CATALOG if r['key']==base)
        group='[3,3,2]' if 'tetrahedron' in base else '[5,3,2]' if any(s in base for s in ('dodeca','icosa')) else '[4,3,2]'
        mask={'tetrahedron':'100','truncated-tetrahedron':'110','cube':'100','octahedron':'001',
            'cuboctahedron':'010','truncated-cube':'110','truncated-octahedron':'011',
            'rhombicuboctahedron':'101','truncated-cuboctahedron':'111','dodecahedron':'100',
            'icosahedron':'001','icosidodecahedron':'010','truncated-dodecahedron':'110',
            'truncated-icosahedron':'011','rhombicosidodecahedron':'101','truncated-icosidodecahedron':'111'}.get(base)
        diagram=group[1:-1].split(',')
        notation=''.join(('x' if ring=='1' else 'o')+(diagram[i] if i<3 else '') for i,ring in enumerate(mask+'1')) if mask else ('s{4,3}' if base=='snub-cube' else 's{5,3}')+' × { }'
        entries.append({'key':'uniform4-prism-'+base,'name':base.replace('-',' ').capitalize()+' prism',
            'dimension':4,'family':'Convex uniform polyhedral prisms','baseKey':base,'uniformIndex':int(index),
            'bowers':acronym,'aliases':[acronym,'O'+index,source['name']+' × interval'],
            'counts':list(map(int,counts)),'symbol':(source.get('symbol') or base)+' × { }',
            'coxeterDiagram':notation,
            'symmetryGroup':group,'convex':True,'uniform':True,'regular':base=='cube',
            'vertexTransitive':True,'chiral':False,'classificationVerified':True,
            'numericContract':'Native equal-edge polyhedron × interval; float64, no exact certificate'})
        if source.get('chiral'):entries[-1]['symmetryGroup']=('O' if base=='snub-cube' else 'I')+' × A1'
    return entries

if __name__=='__main__':
    path=Path('engine/catalog_data/convex_uniform4.json')
    data={'schemaVersion':1,'countSource':'https://en.wikipedia.org/wiki/Uniform_4-polytope',
        'indexConvention':'Olshevsky convex uniform indices O1–O64; U numbers are reserved for polyhedra.',
        'entries':build()}
    path.write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
    from engine.uniform4 import load_uniform4,manifest
    from engine.generators import regular
    from engine.library_navigation import cell_inventory
    manifest.cache_clear()
    for entry in data['entries']:
        model=load_uniform4(entry['key']) if entry['key'].startswith('uniform4-') else regular(entry['key'])
        assert [len(model[k]) for k in ('vertices','edges','faces','cells')]==entry['counts'],entry['key']
        entry['cellTypes']=cell_inventory(model)
        assert all(c['key']!='unresolved' for c in entry['cellTypes']),entry
        entry['cellTypeBasis']='Native cell boundary signature (V/E/F and polygon multiplicities), convex uniform cell domain.'
    path.write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
