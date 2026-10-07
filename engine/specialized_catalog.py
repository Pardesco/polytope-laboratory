# SPDX-License-Identifier: GPL-3.0-only
"""Bounded attributed specialized catalog, isolated from production registration."""
from collections import defaultdict, Counter
from copy import deepcopy
import hashlib
import json
import math
from pathlib import Path
import uuid

from .formats import parse_off
from .geometry import GeometryError, hull, identity, validate
from .symmetry import geometric_symmetry

DATA=Path(__file__).resolve().parent/'catalog_data/specialized'
KINDS=('vertices','edges','faces','cells')
NAMESPACE=uuid.UUID('d493be6b-31e0-4ce0-83db-51b8dd0bc0f8')
PAPER='https://arxiv.org/html/2607.28711v1#S4.SS1'


def boundary_parts(model):
    """Face-edge components. Coordinate coincidence never welds identities."""
    uses=defaultdict(list)
    for i,face in enumerate(model['faces']):
        for a,b in zip(face,face[1:]+face[:1]):uses[tuple(sorted((a,b)))].append(i)
    adjacency=defaultdict(set)
    for faces in uses.values():
        for i in faces:adjacency[i].update(faces)
    remaining=set(range(len(model['faces'])));parts=[]
    while remaining:
        pending=[min(remaining)];faces=set()
        while pending:
            i=pending.pop()
            if i in faces:continue
            faces.add(i);pending.extend(adjacency[i]-faces)
        remaining-=faces;parts.append(sorted(faces))
    return parts


def surface_topology(vertices,faces):
    """Genus only after edge manifold, connected vertex links and orientability."""
    uses=defaultdict(list);links=defaultdict(list)
    for i,face in enumerate(faces):
        for k,a in enumerate(face):
            b=face[(k+1)%len(face)];uses[tuple(sorted((a,b)))].append((i,1 if a<b else -1))
            links[a].append((face[k-1],b))
    manifold=bool(faces) and all(len(v)==2 for v in uses.values())
    for edges in links.values():
        adjacent=defaultdict(list)
        for a,b in edges:adjacent[a].append(b);adjacent[b].append(a)
        reached=set();pending=[next(iter(adjacent))]
        while pending:
            a=pending.pop()
            if a not in reached:reached.add(a);pending.extend(adjacent[a])
        manifold &= all(len(v)==2 for v in adjacent.values()) and len(reached)==len(adjacent)
    orientation={};orientable=manifold
    constraints=defaultdict(list)
    for edge in uses.values():
        if len(edge)==2:
            (a,sa),(b,sb)=edge;constraints[a].append((b,-sa*sb));constraints[b].append((a,-sa*sb))
    for i in range(len(faces)):
        if i in orientation:continue
        orientation[i]=1;pending=[i]
        while pending:
            a=pending.pop()
            for b,sign in constraints[a]:
                target=orientation[a]*sign
                if b in orientation:orientable &= orientation[b]==target
                else:orientation[b]=target;pending.append(b)
    count_vertices=len({v for f in faces for v in f});chi=count_vertices-len(uses)+len(faces)
    genus=(2-chi)//2 if manifold and orientable and chi<=2 and chi%2==0 else None
    return {'vertices':count_vertices,'edges':len(uses),'faces':len(faces),'eulerCharacteristic':chi,
            'closedVertexManifold':bool(manifold),'orientable':bool(orientable),'genus':genus,
            'genusScope':'Abstract supplied boundary; geometric self-intersection is not excluded.'}


def owned_compound(model,key):
    """Give each closed face-edge constituent separate incidence ownership.

    A shared source vertex index is replicated per constituent, retaining its
    exact coordinates and source index. No spatial welding or hull is applied.
    """
    parts=boundary_parts(model);out=deepcopy(model)
    out.update({kind:[] for kind in KINDS});out['components']=[];reports=[]
    source_colors=model.get('metadata',{}).get('offColors',{}).get('faces')
    colors=[];vertex_map=[];face_map=[]
    for number,face_ids in enumerate(parts):
        vs=sorted({v for i in face_ids for v in model['faces'][i]});offset=len(out['vertices']);mapping={v:offset+j for j,v in enumerate(vs)}
        fs=[[mapping[v] for v in model['faces'][i]] for i in face_ids]
        es=sorted({tuple(sorted((a,b))) for f in fs for a,b in zip(f,f[1:]+f[:1])})
        maps={kind:list(range(len(out[kind]),len(out[kind])+len(values))) for kind,values in [('vertices',vs),('edges',es),('faces',fs),('cells',[])]}
        out['vertices'].extend(deepcopy([model['vertices'][v] for v in vs]));out['edges'].extend(map(list,es));out['faces'].extend(fs)
        if source_colors:colors.extend(deepcopy([source_colors[i] for i in face_ids]))
        vertex_map.extend(vs);face_map.extend(face_ids)
        cid=str(uuid.uuid5(NAMESPACE,key+':'+model['fingerprint']+':'+str(number)))
        report=surface_topology(model['vertices'],[model['faces'][i] for i in face_ids]);report.update({'componentId':cid,'sourceVertexIds':vs,'sourceFaceIds':face_ids})
        reports.append(report)
        out['components'].append({'id':cid,'name':f'{model["name"]}: component {number+1}','sourceModelId':model['id'],'sourceFingerprint':model['fingerprint'],'sourcePath':[],'maps':maps})
    out['interpretation']='generalized-complex';out['metadata']['specializedBoundary']={'schemaVersion':1,'componentCount':len(parts),'components':reports,'sourceVertexIds':vertex_map,'sourceFaceIds':face_map,'welded':False,'classification':'Attributed upstream compound; component extraction is incidence based.'}
    if source_colors:out['metadata']['offColors']={'faces':colors,'cells':[]}
    out['validation']=validate(out)
    if not out['validation']['passed']:raise GeometryError('Owned compound fails source incidence validation.')
    out['fingerprint']=identity(out)
    return out


def noble_disphenoid(a=1.,b=2.,c=3.,hand='A'):
    """Positive axis half-lengths define congruent acute triangular faces."""
    if any(type(x) not in (int,float) or not math.isfinite(x) or not 1e-4<=x<=1e4 for x in (a,b,c)):
        raise GeometryError('Disphenoid half-lengths must be finite numbers from0.0001 to10000.')
    if hand not in ('A','B'):raise GeometryError('Disphenoid mirror is A or B.')
    mirror=1 if hand=='A' else -1
    vertices=[[mirror*a,b,c],[mirror*a,-b,-c],[-mirror*a,b,-c],[-mirror*a,-b,c]]
    result=hull(vertices,name=f'Noble disphenoid {a:g}:{b:g}:{c:g} ({hand})')
    symmetry=geometric_symmetry(result)
    if not symmetry['complete'] or len(symmetry['entityOrbits']['vertex'])!=1 or len(symmetry['entityOrbits']['face'])!=1:
        raise GeometryError('Disphenoid transitive action verification failed.')
    chirality={'status':'numerically chiral' if symmetry['order']==symmetry['properOrder'] else 'numerically achiral','enantiomorph':hand,'mirrorDefinition':'Reflect first coordinate; A/B are coordinate labels, not chemical handedness.','improperActionCount':symmetry['order']-symmetry['properOrder']}
    result['metadata'].update({'family':'Noble','specializedBoundary':{'schemaVersion':1,'componentCount':1,'components':[surface_topology(vertices,result['faces'])]},'noble':{'definitionSource':PAPER,'vertexTransitive':True,'faceTransitive':True,'actionOrder':symmetry['order'],'properOrder':symmetry['properOrder'],'certified':False},'chirality':chirality})
    result['provenance'].update({'operation':'noble-disphenoid','parameters':{'a':a,'b':b,'c':c,'hand':hand},'definitionSource':PAPER})
    return result


def torus_sweep(major=2.,minor=1.,meridians=12,sides=6):
    """Regular polygon revolved around an exterior axis, closed planar quads.

    Implements the documented untwisted Antiprism polygon sweep definition;
    this toroidal surface is not asserted to satisfy Stewart regular faces.
    """
    if any(type(x) not in (int,float) or not math.isfinite(x) for x in (major,minor)) or not 1e-4<=minor<major<=1e4 or major-minor<1e-4:
        raise GeometryError('Torus requires finite0.0001<=minor<major<=10000 and radial clearance>=0.0001.')
    if type(meridians) is not int or type(sides) is not int or not 3<=meridians<=64 or not 3<=sides<=32:
        raise GeometryError('Torus sweep uses3..64meridians and3..32cross-section sides.')
    vertices=[]
    for i in range(meridians):
        t=math.tau*i/meridians
        for j in range(sides):
            u=math.tau*j/sides;r=major+minor*math.cos(u)
            vertices.append([r*math.cos(t),minor*math.sin(u),-r*math.sin(t)])
    index=lambda i,j:(i%meridians)*sides+j%sides
    faces=[[index(i,j),index(i+1,j),index(i+1,j+1),index(i,j+1)] for i in range(meridians) for j in range(sides)]
    edges={tuple(sorted((a,b))) for f in faces for a,b in zip(f,f[1:]+f[:1])}
    text='OFF\n'+f'{len(vertices)} {len(faces)} {len(edges)}\n'+'\n'.join(' '.join(format(x,'.17g') for x in p) for p in vertices)+'\n'+'\n'.join('4 '+' '.join(map(str,f)) for f in faces)+'\n'
    result=parse_off(text,f'Polygonal torus {meridians}Ã—{sides}');topology=surface_topology(vertices,faces)
    if topology['genus']!=1:raise GeometryError('Torus closed orientable genus verification failed.')
    result['metadata'].update({'family':'Toroidal','specializedBoundary':{'schemaVersion':1,'componentCount':1,'components':[topology]},'stewart':{'classified':False,'reason':'Regular-faced R condition is not asserted; this is a polygonal sweep torus.'},'chirality':{'status':'numerically achiral','evidence':'Reflection in the cross-section y=0 plane preserves this untwisted ordered quad complex.'}})
    result['provenance'].update({'operation':'polygonal-torus-sweep','parameters':{'major':major,'minor':minor,'meridians':meridians,'sides':sides},'definitionSource':'https://www.antiprism.com/programs/sweep_edges.html','numericContract':'Float64 analytic sampled polygon sweep; planar ordered quadrilaterals, no hull.'})
    return result


def specialized_catalog():
    manifest=json.loads((DATA/'manifest.json').read_text(encoding='utf-8'))
    records=[]
    for entry in manifest['entries']:
        if not entry.get('available'):continue
        records.append({k:deepcopy(entry[k]) for k in ('key','name','dimension','family','counts','aliases','componentCount','genus','chirality','sourceClassification') if k in entry})
    for a,b,c in ((1.,2.,3.),(1.,1.,2.)):
        for hand in ('A','B'):
            model=noble_disphenoid(a,b,c,hand);key=f'noble-disphenoid-{a:g}-{b:g}-{c:g}-{hand.lower()}'
            records.append({'key':key,'name':model['name'],'dimension':3,'family':'Noble','counts':[4,6,4,0],'aliases':['disphenoid','noble tetrahedron'],'componentCount':1,'genus':[0],'chirality':model['metadata']['chirality']})
    records.append({'key':'polygonal-torus-12-6','name':'Polygonal torus 12Ã—6','dimension':3,'family':'Toroidal','counts':[72,144,72,0],'aliases':['torus','polygon sweep torus'],'componentCount':1,'genus':[1],'sourceClassification':'Documented regular-polygon sweep; Stewart conditions not asserted.'})
    return records


def load_specialized_model(key):
    if type(key) is not str or len(key)>128:raise GeometryError('Specialized catalog key must be a bounded string.')
    if not key.startswith(('antiprism-uc','noble-disphenoid-')) and key!='polygonal-torus-12-6':return None
    for record in specialized_catalog():
        if record['key']!=key:continue
        if key=='polygonal-torus-12-6':model=torus_sweep()
        elif key.startswith('noble-disphenoid-'):
            a,b,c,hand=key.removeprefix('noble-disphenoid-').split('-');model=noble_disphenoid(float(a),float(b),float(c),hand.upper())
        else:
            manifest=json.loads((DATA/'manifest.json').read_text(encoding='utf-8'));entry=next(e for e in manifest['entries'] if e['key']==key)
            asset=(DATA/entry['file']).resolve()
            if not asset.is_relative_to(DATA.resolve()):raise GeometryError('Specialized asset escapes its provider directory.')
            raw=asset.read_bytes()
            if hashlib.sha256(raw).hexdigest()!=entry['sha256']:raise GeometryError('Specialized catalog source hash mismatch.')
            model=owned_compound(parse_off(raw.decode('utf-8'),entry['name']),key)
            model['metadata']['sourceAsset']={k:deepcopy(entry[k]) for k in ('sourceSha256','adapter','parameters','chirality')}
            model['provenance']['catalogSource']={'provider':'Antiprism','version':'0.32','key':key,'sha256':entry['sha256'],'license':'COPYING'}
        model['metadata'].update(deepcopy(record));return model
    return None
