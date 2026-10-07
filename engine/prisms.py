"""Closed intrinsic 3D face-shell × interval, with literal 4D incidence.

Formal generalized cap cells retain whole closed source shells; no ball-shaped
interior, convexity, union volume, hull or coordinate weld is inferred.
"""
from collections import Counter
from copy import deepcopy
import hashlib
import json
import math
import uuid

import numpy as np

from .compounds import (_check_source, _colors, _payload_size, KINDS,
                        MAX_COMPONENTS, MAX_COORDINATE, MAX_ELEMENTS,
                        MAX_FACE_VERTICES, MAX_INCIDENCES, MAX_PAYLOAD_BYTES)
from .geometry import GeometryError, TOLERANCE, identity, validate

VERSION = '0.1.0'
MAX_PRISM_VERTICES = 4000


def _hash(source):
    def numbers(value):
        if type(value) is dict:return {key:numbers(item) for key,item in value.items()}
        if type(value) is list:return [numbers(item) for item in value]
        if type(value) is float and value.is_integer():return int(value)
        return value
    try:
        encoded=json.dumps(numbers(source),allow_nan=False,sort_keys=True,separators=(',',':')).encode()
    except (ValueError,TypeError,OverflowError,RecursionError,UnicodeEncodeError) as exc:
        raise GeometryError('Prism source must contain finite bounded JSON attributes.') from exc
    return hashlib.sha256(encoded).hexdigest()


def _shells(source):
    dimension,embedding,_,components=_check_source(source)
    if dimension!=3 or embedding!=3 or source.get('cells'):
        raise GeometryError('Polyhedron prisms require intrinsic 3D closed face shells embedded in three coordinates, without existing 3D cells.')
    if not source['faces']:
        raise GeometryError('A prism source requires a nonempty closed face shell.')
    edge_lookup={tuple(sorted(edge)):i for i,edge in enumerate(source['edges'])}
    if any(source['vertices'][a]==source['vertices'][b] for a,b in source['edges']):
        raise GeometryError('Source shell has a zero-length coordinate edge; numeric degeneracy is unsupported.')
    edge_faces=[[] for _ in source['edges']]
    vertex_links=[[] for _ in source['vertices']]
    boundaries=[]
    for face_id,face in enumerate(source['faces']):
        boundary=[]
        for index,a in enumerate(face):
            b=face[(index+1)%len(face)]
            edge_id=edge_lookup[tuple(sorted((a,b)))]
            boundary.append(edge_id);edge_faces[edge_id].append(face_id)
            vertex_links[a].append((face[index-1],b))
        boundaries.append(boundary)
    if any(len(faces)!=2 for faces in edge_faces):
        raise GeometryError('Source shell is open or nonmanifold: every source edge must have exactly two face incidences; wire leftovers are unsupported.')
    for links in vertex_links:
        degree=Counter(v for edge in links for v in edge)
        # A legitimate subdivision point on a source edge has a two-edge
        # (parallel-link) circle. Keep its two distinct face incidences rather
        # than rejecting the refined source or simplifying its coordinates.
        if len(degree)<2 or any(n!=2 for n in degree.values()):
            raise GeometryError('Source vertex link is isolated or degenerate; one closed polygonal link is required.')
        adjacency={v:set() for v in degree}
        for a,b in links:adjacency[a].add(b);adjacency[b].add(a)
        pending=[next(iter(adjacency))];visited=set()
        while pending:
            vertex=pending.pop()
            if vertex not in visited:visited.add(vertex);pending.extend(adjacency[vertex]-visited)
        if len(visited)!=len(adjacency):
            raise GeometryError('Source vertex has disconnected face fans; one closed vertex link is required.')
    shells=[];unvisited=set(range(len(source['faces'])));owned_vertices=set()
    owner={face:component.get('id') for component in components for face in component['maps']['faces']}
    cloud=np.asarray(source['vertices'],dtype=float)
    scale=float(np.max(np.ptp(cloud,axis=0)))
    normalized=(cloud-cloud[0])/scale if scale else cloud-cloud[0]
    while unvisited:
        pending=[min(unvisited)];face_ids=set()
        while pending:
            face_id=pending.pop()
            if face_id not in unvisited:continue
            unvisited.remove(face_id);face_ids.add(face_id)
            pending.extend(neighbor for edge in boundaries[face_id] for neighbor in edge_faces[edge] if neighbor in unvisited)
        vertices={v for face in face_ids for v in source['faces'][face]}
        edges={e for face in face_ids for e in boundaries[face]}
        if vertices & owned_vertices:
            raise GeometryError('Closed source shells must be incidence-disjoint, including their vertices.')
        owned_vertices.update(vertices)
        if np.linalg.matrix_rank(normalized[sorted(vertices)]-normalized[min(vertices)],TOLERANCE)!=3:
            raise GeometryError('Source shell numeric degeneracy: full 3D affine rank is unresolved.')
        shells.append({'vertices':sorted(vertices),'edges':sorted(edges),'faces':sorted(face_ids),
                       'sourceComponentId':owner[min(face_ids)],'eulerCharacteristic':len(vertices)-len(edges)+len(face_ids)})
    if len(shells)>MAX_COMPONENTS:
        raise GeometryError('Prism shell component resource limit exceeded.')
    return shells,boundaries


def polyhedron_prism(source,height=1.0):
    """Lift disjoint closed source 3D shells to a literal generalized 4D prism."""
    shells,boundaries=_shells(source)
    if type(height) not in (int,float) or not 0<height<=MAX_COORDINATE or not math.isfinite(height):
        raise GeometryError('Prism height must be finite, positive and at most 1e100.')
    height=float(height)
    v,e,f=(len(source[kind]) for kind in ('vertices','edges','faces'));g=len(shells)
    incidences=10*v+8*e+3*sum(map(len,source['faces']))+4*f
    if 2*v>MAX_PRISM_VERTICES or max(2*e+v,2*f+e,f+2*g)>MAX_ELEMENTS or incidences>MAX_INCIDENCES:
        raise GeometryError('Polyhedron prism vertex/incidence resource limit exceeded.')
    if max(max(map(len,source['faces'])),4)>MAX_FACE_VERTICES:
        raise GeometryError('Polyhedron prism face boundary resource limit exceeded.')
    vertices=[list(point)+[z] for z in (-height/2,height/2) for point in source['vertices']]
    edges=deepcopy(source['edges'])+[[a+v,b+v] for a,b in source['edges']]+[[i,i+v] for i in range(v)]
    faces=[list(reversed(face)) for face in source['faces']]+[[i+v for i in face] for face in source['faces']]
    faces.extend([[a,b,b+v,a+v] for a,b in source['edges']])
    cells=[list(shell['faces']) for shell in shells]+[[i+f for i in shell['faces']] for shell in shells]
    cells.extend([[i,i+f]+[2*f+edge for edge in boundary] for i,boundary in enumerate(boundaries)])
    maps={'vertices':[{'sourceVertexId':i%v,'intervalEndpoint':i//v} for i in range(2*v)],
          'edges':[{'role':'source-edge','sourceEdgeId':i%e,'intervalEndpoint':i//e} for i in range(2*e)] +
                  [{'role':'vertex×interval','sourceVertexId':i} for i in range(v)],
          'faces':[{'role':'source-face','sourceFaceId':i%f,'intervalEndpoint':i//f} for i in range(2*f)] +
                  [{'role':'edge×interval','sourceEdgeId':i} for i in range(e)],
          'cells':[{'role':'shell-cap','sourceShellId':i%g,'sourceFaceIds':shells[i%g]['faces'],'intervalEndpoint':i//g} for i in range(2*g)] +
                  [{'role':'face×interval','sourceFaceId':i} for i in range(f)]}
    partitions=[]
    for index,shell in enumerate(shells):
        partitions.append({'id':f'partition-{index}','sourceShellId':index,'sourceComponentId':shell['sourceComponentId'],
                           'sourceFaceIds':list(shell['faces']),'sourceEulerCharacteristic':shell['eulerCharacteristic'],
                           'maps':{'vertices':sorted({i+layer*v for i in shell['vertices'] for layer in (0,1)}),
                                   'edges':sorted({i+layer*e for i in shell['edges'] for layer in (0,1)} | {2*e+i for i in shell['vertices']}),
                                   'faces':sorted({i+layer*f for i in shell['faces'] for layer in (0,1)} | {2*f+i for i in shell['edges']}),
                                   'cells':sorted({index,index+g} | {2*g+i for i in shell['faces']})}})
    input_evidence={'sourceModelId':source.get('id'),'sourceFingerprint':identity(source),'sourceSnapshotSha256':_hash(source)}
    model={'id':str(uuid.uuid4()),'name':source.get('name','Polyhedron')+' × interval','dimension':4,'embeddingDimension':4,
           'interpretation':'generalized-complex','vertices':vertices,'edges':edges,'faces':faces,'cells':cells,
           'numeric':{'mode':'float64-approximate','certified':False,'tolerance':TOLERANCE,'algorithm':'direct closed face-shell and interval incidence'},
           'provenance':{'operation':'polyhedron-prism','algorithmVersion':VERSION,'parameters':{'height':height},'input':deepcopy(input_evidence),
                         'definition':'literal whole-shell caps and face×interval side cells; no hull, weld or inferred solid volume'},
           'metadata':{'polyhedronPrism':{'schemaVersion':1,'algorithmVersion':VERSION,**input_evidence,'sourceModel':deepcopy(source),
               'interval':{'height':height,'endCoordinates':[-height/2,height/2]},'maps':maps,
               'sourceMaps':{'vertices':[[i,i+v] for i in range(v)],'edges':[[i,i+e] for i in range(e)],
                             'faces':[[i,i+f] for i in range(f)],'cells':[]},'sourceFaceSideCells':[[2*g+i] for i in range(f)],
               'componentPartitions':partitions,'recoverableCompoundComponents':False,
               'componentDefinition':'metadata-only ordered disjoint current incidence; partition IDs are not compound Keep/Delete IDs',
               'capDefinition':'formal generalized cell bounded by the complete closed source face shell; ball topology and filled interior are not asserted',
               'colorPolicy':'Source faces retain RGB/RGBA in both endpoint copies; edge-wall faces and all cells are uncolored.'}}}
    source_colors=_colors(source,'faces');colors=deepcopy(source_colors)+deepcopy(source_colors)+[None]*e
    if any(color is not None for color in colors):model['metadata']['offColors']={'faces':colors,'cells':[None]*len(cells)}
    cloud=np.asarray(vertices,dtype=float);scale=float(np.max(np.ptp(cloud,axis=0)))
    normalized=(cloud-cloud[0])/scale if scale else cloud-cloud[0]
    if not scale or np.linalg.matrix_rank(normalized,TOLERANCE)!=4:
        raise GeometryError('4D prism numeric degeneracy: full affine rank is unresolved at relative float64 tolerance.')
    report=validate(model)
    if not report['passed']:raise GeometryError('4D prism numeric/incidence validation failed: '+'; '.join(report['errors']))
    incidence=Counter(face for cell in cells for face in cell)
    if set(incidence)!=set(range(len(faces))) or any(n!=2 for n in incidence.values()):
        raise GeometryError('Every source prism ridge must belong to exactly two cells.')
    for cell in cells:
        links=Counter(tuple(sorted((a,b))) for face_id in cell for a,b in zip(faces[face_id],faces[face_id][1:]+faces[face_id][:1]))
        if any(n!=2 for n in links.values()):raise GeometryError('Every prism cell edge must have exactly two incident faces.')
    for kind in KINDS:
        owned=Counter(i for part in partitions for i in part['maps'][kind])
        if set(owned)!=set(range(len(model[kind]))) or any(n!=1 for n in owned.values()):
            raise GeometryError('Prism component partitions must cover every source incidence exactly once.')
    model['validation'],model['fingerprint']=report,identity(model)
    evidence=model['metadata']['polyhedronPrism']
    evidence['resultSourceModelId'],evidence['resultSourceFingerprint']=model['id'],model['fingerprint']
    evidence['evidenceScope']='generated source only; output IDs/partitions apply while current geometry matches resultSourceFingerprint'
    if _payload_size(model)>MAX_PAYLOAD_BYTES:raise GeometryError('Prism payload resource limit exceeded, including complete preserved source and attributes.')
    return model
