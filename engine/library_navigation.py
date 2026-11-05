"""Explicit library crosswalks; absent properties stay unknown."""
from collections import Counter
from copy import deepcopy
from functools import lru_cache
import json
import math
from pathlib import Path
import re

DATA=Path(__file__).resolve().parent/'catalog_data'
CONVEX_U={1,2,5,6,7,8,9,10,11,12,22,23,24,25,26,27,28,29}
REGULAR_U={1,5,6,22,23,34,35,52,53}
DUALS={'tetrahedron':'tetrahedron','cube':'octahedron','octahedron':'cube','dodecahedron':'icosahedron','icosahedron':'dodecahedron'}
DUALS.update(simplex4='simplex4',tesseract='cross4',cross4='tesseract',cell24='cell24',cell120='cell600',cell600='cell120')
FIGURES={'simplex4':'tetrahedron','tesseract':'tetrahedron','cross4':'octahedron','cell24':'cube','cell120':'tetrahedron','cell600':'icosahedron'}
RELATIVES={
    'tetrahedron':('octahedron','truncated-tetrahedron'),
    'cube':('cuboctahedron','truncated-cube'),'octahedron':('cuboctahedron','truncated-octahedron'),
    'dodecahedron':('icosidodecahedron','truncated-dodecahedron'),'icosahedron':('icosidodecahedron','truncated-icosahedron'),
    'simplex4':('uniform4-rap','uniform4-tip'),'tesseract':('uniform4-rit','uniform4-tat'),
    'cross4':('cell24','uniform4-thex'),'cell24':('uniform4-rico','uniform4-tico'),
    'cell120':('uniform4-rahi','uniform4-thi'),'cell600':('uniform4-rox','uniform4-tex')}

@lru_cache(maxsize=1)
def crosswalk():
    return {row['u']:row for row in json.loads((DATA/'uniform_crosswalk.json').read_text(encoding='utf-8'))['entries']}

def navigation_metadata(record):
    key=record['key'];relation_key=key;labels={}
    from .polychoron_relationships import classification_metadata
    labels.update(classification_metadata(record))
    from .generators import CATALAN_SOURCES,CATALOG
    from .uniform4 import manifest
    native=next((r for r in manifest()['entries'] if r['key']==key),None)
    if native:
        labels.update({k:deepcopy(v) for k,v in native.items() if k not in ('key','name','family','counts','symbol','aliases')})
        labels['aliases']=list(dict.fromkeys(record.get('aliases',[])+native['aliases']))
        if native.get('symmetryGroup')=='[5,3,3]':labels['symmetryGroups']=['[5,3,3]','[3,3,5]','H4']
        if native.get('symmetryGroup')=='[4,3,3]':labels['symmetryGroups']=['[4,3,3]','[3,3,4]','B4']
    match=re.fullmatch(r'antiprism-u(\d+)(-mirror)?',key)
    if match and int(match[1]) in crosswalk():
        u=int(match[1]);row=crosswalk()[u]
        aliases=record.get('aliases',[])+[f'{letter.upper()}{row[letter]}' for letter in ('u','c','w','k')]
        labels.update(aliases=list(dict.fromkeys(aliases)),uniformNumber=u,coxeterNumber=row['c'],wenningerNumber=row['w'],
            wythoffSymbol=row['wythoff'],uniform=True,vertexTransitive=True,regular=u in REGULAR_U,convex=u in CONVEX_U)
        chiral=record.get('chiral')
        if chiral is None and u not in (12,29,32,40,46,57,60,64,69,72,74,75):chiral=False
        if chiral is not None:labels['chiral']=chiral
        labels['symmetryGroup']=('T' if chiral else 'Td') if u<=4 else ('O' if chiral else 'Oh') if u<=21 else ('I' if chiral else 'Ih')
        # Hemiforms U3/U4 retain the full octahedral / tetrahedral actions respectively.
        if u==3:labels['symmetryGroup']='Oh'
        candidate=record['name'].lower().removesuffix(' (reflected)').replace(' ','-')+('-mirror' if match[2] else '')
        reference=next((r for r in CATALOG if r['key']==candidate),None)
        if reference:
            relation_key=candidate
            if reference.get('dualKey'):labels['dualKey']=reference['dualKey']
    if record.get('family') in ('Platonic','Archimedean','Catalan','Kepler-Poinsot'):
        family=record['family'];labels.update(convex=family!='Kepler-Poinsot',uniform=family!='Catalan',
            regular=family in ('Platonic','Kepler-Poinsot'),vertexTransitive=family!='Catalan')
        if family=='Catalan':labels.pop('vertexTransitive')
        if 'chiral' not in record:labels['chiral']=False
        base=CATALAN_SOURCES.get(key,key).removesuffix('-mirror');chiral=record.get('chiral',False)
        labels['symmetryGroup']=('T' if chiral else 'Td') if base in ('tetrahedron','truncated-tetrahedron','triakis-tetrahedron') else ('I' if chiral else 'Ih') if any(t in base for t in ('icos','dodeca','hexecont','hexacont')) and base not in ('rhombic-dodecahedron','disdyakis-dodecahedron') else ('O' if chiral else 'Oh')
    if record.get('regular4dIdentity'):
        labels.update(regular=True,uniform=True,vertexTransitive=True,convex=key in ('simplex4','tesseract','cross4','cell24','cell120','cell600'),chiral=False)
        for field,target in (('cellType','cellTypes'),('vertexFigureType','vertexFigureKey')):
            if record.get(field):labels[target]=[{'key':record[field].replace(' ','-'),'count':record['counts'][3]}] if target=='cellTypes' else record[field].replace(' ','-')
    if relation_key in DUALS:labels['dualKey']=DUALS[relation_key]
    if key in FIGURES:labels['vertexFigureKey']=FIGURES[key]
    if record.get('dualOf'):labels['dualKey']=record['dualOf']
    for dual,primal in CATALAN_SOURCES.items():
        if relation_key==primal:labels['dualKey']=dual
    if relation_key in RELATIVES:labels['rectifiedKey'],labels['truncatedKey']=RELATIVES[relation_key]
    if key=='simplex4':labels['vertexFigureKey']='tetrahedron'
    if key=='uniform4-rap':labels['vertexFigureKey']='uniform-prism-3'
    return labels

def enrich_catalog(records):
    for record in records:record.update(navigation_metadata(record))
    # Catalan reciprocity and existing source identities are explicit, not count guesses.
    by_key={r['key']:r for r in records}
    for record in records:
        primal=record.get('dualOf')
        if primal in by_key:by_key[primal]['dualKey']=record['key']
    return records

def family_catalog():
    entries=[]
    for kind in ('prism','antiprism'):
        for n in range(3,13):
            entries.append({'key':f'uniform-{kind}-{n}','name':f'{n}-gonal uniform {kind}','dimension':3,
                'family':'Uniform polygonal '+kind+'s','counts':[2*n,3*n if kind=='prism' else 4*n,n+2 if kind=='prism' else 2*n+2,0],
                'symbol':f'2 {n}|2' if kind=='prism' else f'|2 2 {n}',
                'aliases':[f'{n}-gonal {kind}',('triangular' if n==3 else 'pentagonal' if n==5 else str(n)+'-gonal')+' '+kind],
                'symmetryGroup':f'D{n}h' if kind=='prism' else f'D{n}d','uniform':True,'vertexTransitive':True,
                'regular':kind=='prism' and n==4 or kind=='antiprism' and n==3,'convex':True,'chiral':False,
                'generatorFamily':{'kind':kind,'n':n,'parameterized':True}})
            if kind=='prism' and n==4 or kind=='antiprism' and n==3:entries[-1]['symmetryGroup']='Oh'
    return entries

def load_family(key):
    entry=next((e for e in family_catalog() if e['key']==key),None)
    if entry is None:return None
    from .generators import generate
    from .geometry import hull
    kind=entry['generatorFamily']['kind'];n=entry['generatorFamily']['n']
    if kind=='prism':model=generate('prism',n=n,height=2*math.sin(math.pi/n))
    else:
        from .antiprisms import rational_antiprism
        model=hull(rational_antiprism(n=n,d=1,base_edge=1)['vertices'])
    model['name']=entry['name'];model['metadata'].update(entry)
    return model

def cell_signature(model,cell):
    faces=[model['faces'][i] for i in cell]
    vertices={v for f in faces for v in f}
    edges={tuple(sorted((a,b))) for f in faces for a,b in zip(f,f[1:]+f[:1])}
    return len(vertices),len(edges),len(faces),tuple(sorted(Counter(map(len,faces)).items()))

@lru_cache(maxsize=1)
def cell_types():
    from .generators import CATALOG
    source=json.loads((DATA/'antiprism/manifest.json').read_text(encoding='utf-8'))['entries']
    result={}
    for entry in source:
        if entry['id'].startswith('U') and int(entry['id'][1:]) in CONVEX_U:
            key=entry['name'].replace(' ','-');native=next((e['key'] for e in CATALOG if e['key']==key),None)
            if native is None:continue
            c=entry['counts'];polygons=entry['quality']['facePolygonWindingCounts']
            signature=(c['vertices'],c['edges'],c['faces'],tuple(sorted((int(p.split('/')[0]),count) for p,count in polygons.items())))
            result[signature]=native
    for n in range(3,13):
        for kind in ('prism','antiprism'):
            sides=Counter({4:n} if kind=='prism' else {3:2*n});sides[n]+=2
            result.setdefault((2*n,3*n if kind=='prism' else 4*n,n+2 if kind=='prism' else 2*n+2,tuple(sorted(sides.items()))),f'uniform-{kind}-{n}')
    return result

def cell_inventory(model):
    counts=Counter(cell_types().get(cell_signature(model,cell),'unresolved') for cell in model['cells'])
    return [{'key':key,'count':n} for key,n in sorted(counts.items())]
