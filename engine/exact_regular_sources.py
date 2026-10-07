# SPDX-License-Identifier: GPL-3.0-only
"""Original integer-coordinate regular sources with supplied outward incidence.

Explicit alternate realizations, never replacement or snapping of a model.
Exact arithmetic proves the source metric and complete bounded convex boundary;
native display/measure and downstream transforms remain approximate.
"""
from collections import Counter
from copy import deepcopy
from fractions import Fraction
from itertools import combinations
from math import gcd

from engine.faceting_source_symmetry import discover_source_symmetry
from engine.geometry import GeometryError, identity, validate
from engine.history import _source_hash

VERSION='0.1.0'
PROVIDER='Original GPLv3 independent regular realization'
_SOURCES={
    'exact-source-tetrahedron':{
        'name':'Tetrahedron · exact integer source','sourceChoiceOf':'tetrahedron','symbol':'{3,3}',
        'vertices':((1,1,1),(1,-1,-1),(-1,1,-1),(-1,-1,1)),
        'faces':((0,1,2),(0,3,1),(1,3,2),(2,3,0)),
        'counts':(4,6,4,0),'edgeSquared':8,'radiusSquared':3,'valence':3,'groupOrder':24,'properOrder':12,
        'derivation':'One product-positive parity class of the cube vertices (±1,±1,±1). Every pair differs in exactly two signs.'},
    'exact-source-cube':{
        'name':'Cube · exact integer source','sourceChoiceOf':'cube','symbol':'{4,3}',
        'vertices':((-1,-1,-1),(-1,-1,1),(-1,1,-1),(-1,1,1),(1,-1,-1),(1,-1,1),(1,1,-1),(1,1,1)),
        'faces':((0,1,3,2),(4,6,7,5),(0,4,5,1),(2,3,7,6),(0,2,6,4),(1,5,7,3)),
        'counts':(8,12,6,0),'edgeSquared':4,'radiusSquared':3,'valence':3,'groupOrder':48,'properOrder':24,
        'derivation':'Cartesian product of three two-endpoint integer segments. Each coordinate support ±x, ±y, ±z = 1 owns one ordered square.'},
    'exact-source-octahedron':{
        'name':'Octahedron · exact integer source','sourceChoiceOf':'octahedron','symbol':'{3,4}',
        'vertices':((-1,0,0),(1,0,0),(0,-1,0),(0,1,0),(0,0,-1),(0,0,1)),
        'faces':((0,4,2),(0,2,5),(0,3,4),(0,5,3),(1,2,4),(1,5,2),(1,4,3),(1,3,5)),
        'counts':(6,12,8,0),'edgeSquared':2,'radiusSquared':1,'valence':4,'groupOrder':48,'properOrder':24,
        'derivation':'The six signed unit coordinate vectors. Each independent sign choice ±x ±y ±z = 1 owns one outward equilateral triangle.'}}


def exact_regular_catalog():
    return [{'key':key,'name':row['name'],'dimension':3,'family':'Exact regular source',
        'symbol':row['symbol'],'counts':list(row['counts']),'provider':PROVIDER,
        'sourceChoiceOf':row['sourceChoiceOf'],'coverageRole':'alternate realization of existing regular solid',
        'aliases':[row['sourceChoiceOf'],'rational regular','integer coordinates','exact faceting source',
            'full source symmetry','original GPLv3 realization'],
        'sourceClassification':'Independent exact-coordinate alternate realization; existing regular model preserved',
        'numericContract':'Exact integer source coordinates/metric/incidence; float64 display and measures',
        'classificationVerified':True,'componentCount':1,'genus':0,'chirality':'achiral',
        'exactGroupOrder':row['groupOrder'],'properGroupOrder':row['properOrder']}
        for key,row in _SOURCES.items()]


def _sub(a,b):return tuple(x-y for x,y in zip(a,b))
def _dot(a,b):return sum(x*y for x,y in zip(a,b))
def _cross(a,b):return (a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])


def _source_proof(points,faces,row):
    if len(set(map(tuple,points)))!=len(points) or any(sum(p[k] for p in points) for k in range(3)):
        raise GeometryError('Exact regular source must have distinct integer vertices centered at the origin.')
    equations=[];edge_owners=Counter();directions=Counter();face_metric=[]
    for face in faces:
        if len(face) not in (3,4) or len(set(face))!=len(face):raise GeometryError('Exact regular source has an invalid face owner cycle.')
        a,b,c=(points[v] for v in face[:3]);normal=_cross(_sub(b,a),_sub(c,a))
        divisor=gcd(gcd(abs(normal[0]),abs(normal[1])),abs(normal[2]))
        if not divisor:raise GeometryError('Exact regular source has a degenerate supporting plane.')
        normal=tuple(x//divisor for x in normal);offset=-_dot(normal,a)
        values=[_dot(normal,p)+offset for p in points]
        if offset>=0 or max(values)>0 or {i for i,x in enumerate(values) if not x}!=set(face):
            raise GeometryError('Exact source face is not its complete outward support facet.')
        equations.append(tuple(normal)+(offset,))
        lengths=[];angles=[]
        for i,vertex in enumerate(face):
            previous=face[i-1];next_vertex=face[(i+1)%len(face)]
            lengths.append(_dot(_sub(points[next_vertex],points[vertex]),_sub(points[next_vertex],points[vertex])))
            angles.append(_dot(_sub(points[previous],points[vertex]),_sub(points[next_vertex],points[vertex])))
            edge=tuple(sorted((vertex,next_vertex)));edge_owners[edge]+=1
            directions[edge]+=1 if vertex<next_vertex else -1
        expected_angle=Fraction(row['edgeSquared'],2) if len(face)==3 else Fraction(0)
        if set(lengths)!={row['edgeSquared']} or set(angles)!={expected_angle}:
            raise GeometryError('Exact source face is not its claimed regular triangle/square metric.')
        face_metric.append({'edgeSquared':[str(x) for x in lengths],
            'cornerVectorDot':[str(x) for x in angles]})
    if any(n!=2 for n in edge_owners.values()) or any(directions.values()):
        raise GeometryError('Exact regular source edge lacks two oppositely oriented owners.')
    valence=Counter(v for edge in edge_owners for v in edge)
    if any(valence[v]!=row['valence'] for v in range(len(points))):raise GeometryError('Exact source vertex links have the wrong regular valence.')
    if {_dot(p,p) for p in points}!={row['radiusSquared']}:
        raise GeometryError('Exact regular source lacks its claimed origin-centered circumsphere.')
    if any(sum(eq[k] for eq in equations) for k in range(3)):
        raise GeometryError('Exact source support normals do not positively balance.')
    # All support normals sum to zero and span3; hence every recession vector
    # orthogonal to all normals is zero. Enumerate every independent triple of
    # support planes to independently recover the entire bounded vertex set.
    recovered=set();triples=0;rank_three=False
    for selected in combinations(equations,3):
        triples+=1;a,b,c=(eq[:3] for eq in selected);determinant=_dot(a,_cross(b,c))
        if not determinant:continue
        rank_three=True
        intersections=tuple(Fraction(-selected[0][3]*_cross(b,c)[k]-selected[1][3]*_cross(c,a)[k]-selected[2][3]*_cross(a,b)[k],determinant) for k in range(3))
        if all(_dot(eq[:3],intersections)+eq[3]<=0 for eq in equations):recovered.add(intersections)
    if not rank_three or recovered!=set(map(tuple,points)):
        raise GeometryError('Exact source support intersections do not recover its complete bounded convex vertex set.')
    if len(points)-len(edge_owners)+len(faces)!=2:raise GeometryError('Exact regular source does not have a sphere boundary.')
    proof={'version':VERSION,'passed':True,'scope':'Exact integer coordinates, complete bounded convex boundary and regular face metrics only',
        'derivation':row['derivation'],'coordinateArithmetic':'exact integers and Fraction plane intersections',
        'coordinatesHash':_source_hash(points),'orderedFacesHash':_source_hash(faces),
        'sourceIdsRetained':True,'sourceGeometryChanged':False,'implicitHullReplacement':False,
        'supportEquations':[[str(x) for x in eq] for eq in equations],
        'supportNormalsPositiveBalance':True,'supportNormalsRank':3,'boundedRecessionCone':True,
        'supportTriplesEnumerated':triples,'completeVertexIntersections':[[str(x) for x in p] for p in sorted(recovered)],
        'twoDistinctOppositeFaceOwnersPerEdge':True,'edgeSquaredLength':str(row['edgeSquared']),
        'circumradiusSquared':str(row['radiusSquared']),'vertexValence':row['valence'],'faceMetrics':face_metric,
        'eulerCharacteristic':2,'componentCount':1,'genus':0,'fullProgramExactCertification':False}
    return [list(e) for e in sorted(edge_owners)],equations,proof


def load_exact_regular_model(key):
    if type(key) is not str or len(key)>128:raise GeometryError('Exact regular source key requires a bounded string.')
    if key not in _SOURCES:return None
    row=_SOURCES[key];points=[list(p) for p in row['vertices']];faces=[list(f) for f in row['faces']]
    edges,equations,proof=_source_proof(points,faces,row)
    record=next(record for record in exact_regular_catalog() if record['key']==key)
    model={'id':key+'-v1','name':row['name'],'dimension':3,'embeddingDimension':3,'interpretation':'convex-polytope',
        'vertices':points,'edges':edges,'faces':faces,'cells':[],
        'rationalCoordinates':[[str(x) for x in p] for p in points],
        'rationalFacetEquations':[[str(x) for x in eq] for eq in equations],
        'facetEquations':[list(eq) for eq in equations],'facetVertices':deepcopy(faces),
        'numeric':{'mode':'float64-approximate','tolerance':1e-8,'certified':False,
            'sourceCoordinates':'exact integers also represented exactly in binary64',
            'sourceProofScope':'Independent exact regular-source metric/incidence/support proof; display and measures are approximate'},
        'metadata':{**record,'coordinateUnits':'model','source':PROVIDER,'exactRegularSourceEvidence':proof},
        'provenance':{'operation':'independent-exact-regular-source','algorithmVersion':VERSION,
            'parameters':{'key':key},'catalogSource':{'provider':PROVIDER,'key':key,'license':'GPL-3.0-only',
                'authorship':'Independent original construction for this project; no redistributed third-party geometry assets',
                'coverageRole':'alternate realization; not an additional regular polyhedron type'},
            'construction':row['derivation'],'sourceGeometryChanged':False,'implicitWeld':False,'implicitHullReplacement':False}}
    if [len(model[field]) for field in ('vertices','edges','faces','cells')]!=list(row['counts']):
        raise GeometryError('Exact regular source differs from its explicit incidence table.')
    model['validation']=validate(model)
    if not model['validation']['passed']:raise GeometryError('Native regular source gate failed: '+'; '.join(model['validation']['errors']))
    model['fingerprint']=identity(model)
    group=discover_source_symmetry(model)
    if not group['complete'] or group['selectedGroup']['order']!=row['groupOrder'] or sum(a['determinant']==1 for a in group['actions'])!=row['properOrder']:
        raise GeometryError('Exact regular source failed exhaustive metric/incidence source symmetry.')
    # Bind the proof without a recursive ownership hash: discovery owns the
    # completed source proof above; only its compact result is attached afterward.
    proof['sourceSymmetry']={k:deepcopy(group[k]) for k in ('version','method','numericPredicate','anchorVertexIds','center','actions','workUsed','workLimit','nodesVisited','completeBijectionsChecked','maximalSourceSymmetryClaim')}
    proof['sourceSymmetry'].update(fullOrder=row['groupOrder'],properOrder=row['properOrder'],complete=True,
        distanceAndIncidenceVerified=True,sourceInitialProofSnapshotHash=group['sourceSnapshotHash'],
        sourceGeometryFingerprint=model['fingerprint'])
    return model
