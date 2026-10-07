"""Versioned numerical regularity evidence for the classical regular 16.

No hull, coordinate repair, guessed symbol, or interpretation promotion.
Identity expectations are fixed independently; all returned actions preserve the
complete literal edge / ordered face / cell incidence. Float64 is uncertified.
"""
from collections import Counter, deque
from copy import deepcopy
from fractions import Fraction
import hashlib
import json
import math
from pathlib import Path

import numpy as np

from engine.geometry import GeometryError, identity, validate
from engine.compounds import _colors

VERSION = '0.1.0'
TOLERANCE = 1e-8
MAX_FLAGS = 14400
MANIFEST_SHA256 = '8d790ea68f6f8ee53631840f4c26aeab776af75fadd8a6579bc45eb4f09d756f'
PRIMARY_TABLE = 'https://www.csun.edu/~ctoth/Handbook/chap18.pdf'
PRIMARY_NAMES = 'https://www.polytope.net/hedrondude/regulars.htm'

# Independent classical identity expectations, not generated from source counts.
# Schulte table18.1.1/18.2.1; Bowers names, cells, vertex figures and dual pairs.
_ROWS = [
    ('Pentachoron','Pen','3,3,3',(5,10,10,5),'Pentachoron'),
    ('Tesseract','Tes','4,3,3',(16,32,24,8),'Hexadecachoron'),
    ('Hexadecachoron','Hex','3,3,4',(8,24,32,16),'Tesseract'),
    ('Icositetrachoron','Ico','3,4,3',(24,96,96,24),'Icositetrachoron'),
    ('Hecatonicosachoron','Hi','5,3,3',(600,1200,720,120),'Hexacosichoron'),
    ('Hexacosichoron','Ex','3,3,5',(120,720,1200,600),'Hecatonicosachoron'),
    ('Icosahedral hecatonicosachoron','Fix','3,5,5/2',(120,720,1200,120),'Stellated hecatonicosachoron'),
    ('Great hecatonicosachoron','Gohi','5,5/2,5',(120,720,720,120),'Great hecatonicosachoron'),
    ('Grand hecatonicosachoron','Gahi','5,3,5/2',(120,720,720,120),'Great stellated hecatonicosachoron'),
    ('Stellated hecatonicosachoron','Sishi','5/2,5,3',(120,1200,720,120),'Icosahedral hecatonicosachoron'),
    ('Great grand hecatonicosachoron','Gaghi','5,5/2,3',(120,1200,720,120),'Great icosahedral hecatonicosachoron'),
    ('Great stellated hecatonicosachoron','Gishi','5/2,3,5',(120,720,720,120),'Grand hecatonicosachoron'),
    ('Grand stellated hecatonicosachoron','Gashi','5/2,5,5/2',(120,720,720,120),'Grand stellated hecatonicosachoron'),
    ('Great icosahedral hecatonicosachoron','Gofix','3,5/2,5',(120,720,1200,120),'Great grand hecatonicosachoron'),
    ('Grand hexacosichoron','Gax','3,3,5/2',(120,720,1200,600),'Great grand stellated hecatonicosachoron'),
    ('Great grand stellated hecatonicosachoron','Gogishi','5/2,3,3',(600,1200,720,120),'Grand hexacosichoron'),
]
CROSSWALK = {name:{'name':name,'alias':alias,'symbol':'{'+symbol+'}',
                   'parameters':symbol.split(','),'counts':list(counts),'dual':dual}
             for name,alias,symbol,counts,dual in _ROWS}
_POLYHEDRA = {
    ('3','3'):('tetrahedron',(4,6,4)), ('4','3'):('cube',(8,12,6)),
    ('3','4'):('octahedron',(6,12,8)), ('5','3'):('dodecahedron',(20,30,12)),
    ('3','5'):('icosahedron',(12,30,20)),
    ('5/2','5'):('small stellated dodecahedron',(12,30,12)),
    ('5','5/2'):('great dodecahedron',(12,30,12)),
    ('5/2','3'):('great stellated dodecahedron',(20,30,12)),
    ('3','5/2'):('great icosahedron',(12,30,20)),
}

# Existing public keys are retained; this map never guesses identity by counts.
CATALOG_IDENTITIES = dict(zip(
    ('simplex4','tesseract','cross4','cell24','cell120','cell600'),
    list(CROSSWALK)[:6]))
CATALOG_IDENTITIES.update({'miratope-'+name.lower().replace(' ','-'):name
                           for name in list(CROSSWALK)[6:]})

def regular4d_metadata(key):
    """Detached public mathematical labels; no claimed validation receipt."""
    if type(key) is not str or key not in CATALOG_IDENTITIES:
        return None
    row=CROSSWALK[CATALOG_IDENTITIES[key]];p,q,r=row['parameters']
    aliases=[row['name'],row['alias']]
    conventional={'simplex4':['5-cell','4-simplex','Pentatope'],
                  'tesseract':['8-cell','Hypercube'], 'cross4':['16-cell','4-orthoplex'],
                  'cell24':['24-cell'], 'cell120':['120-cell'], 'cell600':['600-cell']}
    aliases+=conventional.get(key,[row['name'].replace('hecatonicosachoron','120-cell')
                                       .replace('hexacosichoron','600-cell')])
    if row['alias']=='Sishi':aliases+=['Small stellated 120-cell','Small stellated hecatonicosachoron']
    dual_key=next(k for k,n in CATALOG_IDENTITIES.items() if n==row['dual'])
    return {'regular4dIdentity':row['name'],'aliases':aliases,'symbol':row['symbol'],
            'cellType':_POLYHEDRA[(p,q)][0], 'cellSymbol':'{'+p+','+q+'}',
            'vertexFigureType':_POLYHEDRA[(q,r)][0],'vertexFigureSymbol':'{'+q+','+r+'}',
            'dualKey':dual_key,'dualName':row['dual'],
            'identityReferences':[PRIMARY_TABLE,PRIMARY_NAMES],
            'regular4dValidationVersion':VERSION}

def validate_catalog_regular4d(model, key):
    """Read-only numerical evidence for an explicitly selected registered key.

    Source file identity is not inferred from editable provenance. The complete
    current snapshot, including source attributes, is bound independently.
    """
    _require(type(key) is str and key in CATALOG_IDENTITIES,
             'Regular4D validation requires one of the sixteen registered keys.')
    receipt=analyze_regular4d(model,CATALOG_IDENTITIES[key])
    receipt['catalogKey']=key
    return receipt

def verify_catalog_model_receipt(model, receipt):
    clean=_detached(receipt)
    _require(type(clean) is dict,'Regular4D catalog model receipt must be an object.')
    rebuilt=validate_catalog_regular4d(model,clean.get('catalogKey'))
    _require(snapshot_hash(rebuilt)==snapshot_hash(clean),
             'Regular4D catalog model receipt differs from the complete current source.')
    return True


def _require(ok, message):
    if not ok:
        raise GeometryError(message)


def _detached(value):
    """Budget JSON before copying; reject nonportable/unbounded values."""
    pending=[(value,0)];count=0
    while pending:
        v,depth=pending.pop();count+=1
        _require(count<=200000 and depth<=64,'Regular4D snapshot exceeds JSON resource bounds.')
        if type(v) is dict:
            _require(all(type(k) is str for k in v),'Regular4D JSON object keys must be strings.')
            pending.extend((x,depth+1) for x in v.values())
        elif type(v) is list:
            pending.extend((x,depth+1) for x in v)
        elif type(v) is int:
            _require(abs(v)<=9007199254740991,'Regular4D snapshot contains an unsafe JSON integer.')
        elif type(v) in (float,np.float64):
            _require(math.isfinite(v),'Regular4D snapshot requires finite JSON numbers.')
            _require(not (v.is_integer() and 9007199254740991<abs(v)<1e21),
                     'Regular4D integral float would become an unsafe integer token in JavaScript JSON.')
        elif type(v) is str:
            _require(len(v)<=8*1024*1024,'Regular4D JSON string exceeds resource bounds.')
        else:
            _require(v is None or type(v) in (str,bool),'Regular4D snapshot must contain ordinary JSON values.')
    try:
        raw=json.dumps(value,ensure_ascii=False,allow_nan=False,separators=(',',':')).encode('utf-8')
        _require(len(raw)<=32*1024*1024,'Regular4D snapshot exceeds 32MiB.')
        return json.loads(raw)
    except (UnicodeError,RecursionError,OverflowError,ValueError,TypeError) as error:
        raise GeometryError('Regular4D snapshot is not bounded UTF-8 JSON.') from error


def _semantic(v):
    # JSON-spelling-independent finite binary64 numbers; booleans stay distinct.
    if type(v) in (int,float):
        number=float(v)
        return ['number',(0.0 if number==0 else number).hex()]
    if type(v) is dict:
        return ['object',[[k,_semantic(v[k])] for k in sorted(v)]]
    if type(v) is list:
        return ['array',[_semantic(x) for x in v]]
    return ['literal',v]


def snapshot_hash(value):
    clean=_detached(value)
    return hashlib.sha256(json.dumps(_semantic(clean),ensure_ascii=False,
                                    separators=(',',':')).encode('utf-8')).hexdigest()


def _cycle(row):
    row=tuple(row);i=row.index(min(row));a=row[i:]+row[:i]
    b=(a[0],)+tuple(reversed(a[1:]))
    return min(a,b)


def _boundaries(model,expected):
    _require(type(model.get('dimension')) is int and model['dimension']==4 and
             type(model.get('embeddingDimension')) is int and model['embeddingDimension']==4,
             'Regular4D verification requires intrinsic and embedding dimension four.')
    for key,cap in zip(('vertices','edges','faces','cells'),(600,1200,1200,600)):
        _require(type(model.get(key)) is list and 0<len(model[key])<=cap,
                 'Regular4D source entity count exceeds the bounded classical domain.')
    _require([len(model[k]) for k in ('vertices','edges','faces','cells')]==expected['counts'],
             'Regular4D source counts disagree with the selected identity.')
    for point in model['vertices']:
        _require(type(point) is list and len(point)==4 and
                 all(type(x) in (int,float) and abs(x)<=1e100 for x in point),
                 'Regular4D source requires finite bounded four-coordinate vertices.')
    n=len(model['vertices'])
    for key,size in (('edges',n),('faces',n),('cells',len(model['faces']))):
        for row in model[key]:
            _require(type(row) is list and len(row)>=({'edges':2,'faces':3,'cells':4}[key]) and
                     (key!='edges' or len(row)==2) and
                     all(type(x) is int and 0<=x<size for x in row) and len(set(row))==len(row),
                     'Regular4D source has malformed or repeated incidence IDs.')
    edge_lookup={tuple(sorted(row)):i for i,row in enumerate(model['edges'])}
    face_lookup={_cycle(row):i for i,row in enumerate(model['faces'])}
    cell_lookup={tuple(sorted(row)):i for i,row in enumerate(model['cells'])}
    _require(all(len(lookup)==len(model[key]) for lookup,key in
                 ((edge_lookup,'edges'),(face_lookup,'faces'),(cell_lookup,'cells'))),
             'Regular4D repeated entity ownership is unsupported.')
    face_edges=[]
    for face in model['faces']:
        edges=[edge_lookup.get(tuple(sorted((a,b)))) for a,b in zip(face,face[1:]+face[:1])]
        _require(None not in edges,'Regular4D face cycle includes a missing source edge.')
        face_edges.append(edges)
    _require(set(e for row in face_edges for e in row)==set(range(len(model['edges']))),
             'Regular4D source contains unowned edges.')
    face_cells=Counter(f for cell in model['cells'] for f in cell)
    _require(all(face_cells[f]==2 for f in range(len(model['faces']))),
             'Regular4D each source face must have two distinct cell owners.')
    cell_vertices=[]
    p,q,r=expected['parameters'];cell_name,cell_counts=_POLYHEDRA[p,q]
    for cell in model['cells']:
        ids=sorted({v for f in cell for v in model['faces'][f]})
        edges=Counter(e for f in cell for e in face_edges[f])
        _require(all(x==2 for x in edges.values()) and
                 [len(ids),len(edges),len(cell)]==list(cell_counts),
                 'Regular4D source cell incidence disagrees with its classical cell type.')
        cell_vertices.append(ids)
    vf_name,vf_counts=_POLYHEDRA[q,r]
    for v in range(n):
        vf=[sum(v in edge for edge in model['edges']),
            sum(v in face for face in model['faces']),sum(v in row for row in cell_vertices)]
        _require(vf==list(vf_counts),'Regular4D vertex-link ranks disagree with the selected vertex figure.')
    flags={(v,e,f,c) for c,cell in enumerate(model['cells']) for f in cell
           for e in face_edges[f] for v in model['edges'][e]}
    _require(len(flags)<=MAX_FLAGS and len(flags)==sum(2*len(model['faces'][f])
                 for cell in model['cells'] for f in cell),'Regular4D flags exceed bounds or repeat ownership.')
    return edge_lookup,face_lookup,cell_lookup,cell_vertices,flags,cell_name,vf_name


def _maps(model,permutation,lookups):
    edges,faces,cells=lookups
    try:
        em=[edges[tuple(sorted(permutation[v] for v in edge))] for edge in model['edges']]
        fm=[faces[_cycle([permutation[v] for v in face])] for face in model['faces']]
        cm=[cells[tuple(sorted(fm[f] for f in cell))] for cell in model['cells']]
    except KeyError as error:
        raise GeometryError('Regular4D reflection fails full ordered source-incidence preservation.') from error
    out=[permutation,em,fm,cm]
    _require(all(len(set(row))==len(row) and all(row[row[i]]==i for i in range(len(row)))
                 for row in out),'Regular4D reflection must be a bijective involution at every source rank.')
    return out


def analyze_regular4d(model, identity_name, source_sha256=None):
    """Return recomputable approximate evidence; raises GeometryError on failure.

    identity_name is explicit, never inferred from model name/counts. Raw-file
    identity is supplied by an authorized reader; qualify_catalog hashes itself.
    Caller model, attributes, coordinates, cycles and caches remain unchanged.
    """
    _require(type(identity_name) is str and identity_name in CROSSWALK,
             'Regular4D requires an explicit classical identity from the 16-row crosswalk.')
    _require(source_sha256 is None or (type(source_sha256) is str and len(source_sha256)==64
             and all(x in '0123456789abcdef' for x in source_sha256)),
             'Regular4D source SHA-256 must be a lowercase hexadecimal digest.')
    _require(type(model) is dict,'Regular4D model must be a bounded JSON object.')
    clean=_detached(model);expected=CROSSWALK[identity_name]
    _require(clean.get('id') is None or (type(clean['id']) is str and 0<len(clean['id'])<=128),
             'Regular4D source ID must be a bounded string.')
    source_fingerprint=identity(clean)
    _require(clean.get('fingerprint') is None or clean['fingerprint']==source_fingerprint,
             'Regular4D source fingerprint disagrees with current literal geometry.')
    edge_lookup,face_lookup,cell_lookup,cell_vertices,flags,cell_name,vf_name=_boundaries(clean,expected)
    _require(type(clean.get('metadata',{})) is dict,'Regular4D source metadata must be an object.')
    units=clean.get('metadata',{}).get('coordinateUnits')
    _require(units is None or (type(units) is str and units in ('model','mm','cm','m','in','ft')),
             'Regular4D source coordinate units are unsupported.')
    _colors(clean,'faces');_colors(clean,'cells')
    _require(validate(clean)['passed'],'Regular4D source fails unchanged native geometry validation.')
    points=np.asarray(clean['vertices'],dtype=float);center=points.mean(axis=0);points=points-center
    radius=float(np.max(np.linalg.norm(points,axis=1)))
    _require(radius>0 and math.isfinite(radius),'Regular4D source radius is unresolved.')
    points/=radius
    _require(np.linalg.matrix_rank(points,tol=TOLERANCE)==4,'Regular4D source must have affine rank four.')
    separation=np.linalg.norm(points[:,None,:]-points[None,:,:],axis=2)
    np.fill_diagonal(separation,np.inf)
    _require(float(separation.min())>4*TOLERANCE,
             'Regular4D distinct source vertices are numerically unresolved; no welding is permitted.')
    lengths=np.array([np.linalg.norm(points[a]-points[b]) for a,b in clean['edges']])
    edge_spread=float(lengths.max()/lengths.min()-1) if lengths.min()>0 else math.inf
    radii=np.linalg.norm(points,axis=1)
    _require(edge_spread<=TOLERANCE and float(radii.max()-radii.min())<=TOLERANCE,
             'Regular4D source edges or vertex radii are not regular within tolerance.')
    face_step=Fraction(expected['parameters'][0]);face_residual=0.0
    for face in clean['faces']:
        _require(len(face)==face_step.numerator,'Regular4D ordered face size disagrees with its symbol.')
        cloud=points[face];shifted=cloud-cloud.mean(axis=0);rad=np.linalg.norm(shifted,axis=1)
        _require(rad.min()>TOLERANCE,'Regular4D face radius is unresolved.')
        scaled=shifted/rad.mean();u=scaled[0]/np.linalg.norm(scaled[0]);b=scaled[1]-(scaled[1]@u)*u
        _require(np.linalg.norm(b)>TOLERANCE,'Regular4D first face step is degenerate.')
        b/=np.linalg.norm(b);local=np.column_stack((scaled@u,scaled@b));angles=np.arctan2(local[:,1],local[:,0])
        delta=(np.roll(angles,-1)-angles+math.pi)%(2*math.pi)-math.pi
        target=2*math.pi*face_step.denominator/face_step.numerator
        error=max(float(np.max(np.abs(rad/rad.mean()-1))),
                  float(np.max(np.linalg.norm(scaled-np.outer(local[:,0],u)-np.outer(local[:,1],b),axis=1))),
                  min(float(np.max(np.abs(delta-target))),float(np.max(np.abs(delta+target)))))
        _require(error<=TOLERANCE,'Regular4D source face violates its ordered ordinary/star step.')
        face_residual=max(face_residual,error)
    initial=min(flags);v,e,f,c=initial
    anchors=np.array([points[v],points[clean['edges'][e]].mean(axis=0),
                     points[clean['faces'][f]].mean(axis=0),points[cell_vertices[c]].mean(axis=0)])
    _require(np.linalg.matrix_rank(anchors,tol=TOLERANCE)==4,'Regular4D flag barycenters are not a spanning chamber.')
    generators=[];normals=[];coordinate_residual=0.0
    for rank in range(4):
        _,s,vt=np.linalg.svd(np.delete(anchors,rank,axis=0));normal=vt[-1]
        _require(s.min()>TOLERANCE,'Regular4D reflection wall is singular.')
        matrix=np.eye(4)-2*np.outer(normal,normal)
        distances=np.linalg.norm((points@matrix.T)[:,None,:]-points[None,:,:],axis=2)
        permutation=distances.argmin(axis=1).tolist();res=float(np.max(distances[np.arange(len(points)),permutation]))
        _require(res<=TOLERANCE and len(set(permutation))==len(points),
                 'Regular4D reflection lacks a resolved full source-coordinate bijection.')
        maps=_maps(clean,permutation,(edge_lookup,face_lookup,cell_lookup))
        image=tuple(maps[r][initial[r]] for r in range(4))
        _require(image in flags and image[rank]!=initial[rank] and
                 all(image[r]==initial[r] for r in range(4) if r!=rank),
                 'Regular4D reflection is not the required adjacent-flag action.')
        _require(np.max(np.abs(matrix.T@matrix-np.eye(4)))<=TOLERANCE and
                 abs(np.linalg.det(matrix)+1)<=TOLERANCE,'Regular4D reflection fails its orthogonal metric check.')
        generators.append({'rank':rank,'matrix':matrix.tolist(),'maps':maps,
                           'normalizedCoordinateResidual':res,'adjacentFlag':list(image)})
        normals.append(normal);coordinate_residual=max(coordinate_residual,res)
    gram=[[float(abs(a@b)) for b in normals] for a in normals];mirror_residual=0.0
    for i in range(4):
        for j in range(i+1,4):
            target=abs(math.cos(math.pi/float(Fraction(expected['parameters'][i])))) if j==i+1 else 0
            error=abs(gram[i][j]-target);mirror_residual=max(mirror_residual,error)
            _require(error<=TOLERANCE,'Regular4D mirror Gram angles disagree with the classical symbol.')
    pending=deque([initial]);reached={initial}
    while pending:
        flag=pending.popleft()
        for generator in generators:
            image=tuple(generator['maps'][r][flag[r]] for r in range(4))
            _require(image in flags,'Regular4D action leaves the actual source flag set.')
            if image not in reached:
                reached.add(image);pending.append(image)
    _require(reached==flags,'Regular4D generated symmetries are not transitive on the full source flag set.')
    return {'format':'regular4d-numerical-evidence','version':VERSION,'status':'passed',
            'numericMode':'float64-approximate','certified':False,'tolerance':TOLERANCE,
            'identity':deepcopy(expected),'cellType':cell_name,'vertexFigureType':vf_name,
            'sourceId':clean.get('id'),'sourceFingerprint':identity(clean),
            'sourceSnapshotSha256':snapshot_hash(clean),'sourceRawSha256':source_sha256,
            'sourceGeometryChanged':False,'sourceAttributesChanged':False,'hullUsed':False,
            'flagCount':len(flags),'flagOrbitCount':1,'reachedFlags':len(reached),
            'flagChamberRank':4,'generatedSubgroupOrder':len(flags),
            'groupOrderReason':'A full-rank flag chamber has trivial orthogonal stabilizer; verified generators reach every flag.',
            'exhaustiveSpanningFrameSearch':False,
            'initialFlag':list(initial),'generators':generators,'absoluteMirrorGram':gram,
            'maxCoordinateResidual':coordinate_residual,'maxFaceResidual':face_residual,
            'maxMirrorResidual':mirror_residual,'relativeEdgeSpread':edge_spread,
            'definition':'Verified metric reflections preserve complete literal incidence and act transitively on every source flag.',
            'primarySymbolTable':PRIMARY_TABLE,'primaryNameCrosswalk':PRIMARY_NAMES,
            'limits':{'vertices':600,'edges':1200,'faces':1200,'cells':600,'flags':MAX_FLAGS,
                      'snapshotBytes':32*1024*1024,'jsonDepth':64}}


def verify_regular4d_receipt(model, receipt, source_sha256=None):
    """Recompute every field; fabricated summaries or attribute edits fail."""
    checked=_detached(receipt)
    try:
        rebuilt=analyze_regular4d(model,checked['identity']['name'],source_sha256)
    except (KeyError,TypeError) as error:
        raise GeometryError('Regular4D evidence has no valid identity envelope.') from error
    _require(snapshot_hash(rebuilt)==snapshot_hash(checked),
             'Regular4D receipt differs from independently recomputed source evidence.')
    return True


def _dual_reference_maps(source, target):
    """Reference comparison only: transpose source ownership, never Hull.

    Already qualified classical sources have distinct noncentral cell planes.
    Compare reciprocal cell centers against the actual partner coordinates and
    complete reversed incidence. This does not expose a general star-dual op.
    """
    def normalized(m):
        p=np.asarray(m['vertices'],float);p-=p.mean(axis=0)
        return p/np.max(np.linalg.norm(p,axis=1))
    a=normalized(source);b=normalized(target)
    cell_vertices=[sorted({v for f in cell for v in source['faces'][f]}) for cell in source['cells']]
    centers=np.array([a[ids].mean(axis=0) for ids in cell_vertices])
    squared=np.sum(centers*centers,axis=1)
    _require(float(squared.min())>TOLERANCE,'Regular4D dual reference has a central cell plane.')
    dual=centers/squared[:,None];dual/=max(np.linalg.norm(dual,axis=1))
    edge_lookup={tuple(sorted(row)):i for i,row in enumerate(source['edges'])}
    edge_faces=[[] for _ in source['edges']];face_cells=[[] for _ in source['faces']]
    for f,face in enumerate(source['faces']):
        for x,y in zip(face,face[1:]+face[:1]):edge_faces[edge_lookup[tuple(sorted((x,y)))]].append(f)
    for c,cell in enumerate(source['cells']):
        for f in cell:face_cells[f].append(c)
    sc=0;sf=source['cells'][sc][0];sv=source['faces'][sf][0]
    se=edge_lookup[tuple(sorted(source['faces'][sf][:2]))]
    edge_cells=sorted({c for f in edge_faces[se] for c in face_cells[f]})
    vertex_cells=[c for c,ids in enumerate(cell_vertices) if sv in ids]
    da=np.array([dual[sc],dual[face_cells[sf]].mean(axis=0),
                 dual[edge_cells].mean(axis=0),dual[vertex_cells].mean(axis=0)])
    tc=0;tf=target['cells'][tc][0];tv=target['faces'][tf][0]
    tcell=sorted({v for f in target['cells'][tc] for v in target['faces'][f]})
    tb=np.array([b[tv],b[target['faces'][tf][:2]].mean(axis=0),
                 b[target['faces'][tf]].mean(axis=0),b[tcell].mean(axis=0)])
    _require(np.linalg.matrix_rank(da,tol=TOLERANCE)==4,'Regular4D dual reference chamber is singular.')
    matrix=np.linalg.solve(da,tb)
    _require(float(np.max(np.abs(matrix.T@matrix-np.eye(4))))<=TOLERANCE,
             'Regular4D dual reference needs a non-rigid partner alignment.')
    distances=np.linalg.norm((dual@matrix)[:,None,:]-b[None,:,:],axis=2)
    cmap=distances.argmin(axis=1).tolist();res=float(max(distances[np.arange(len(dual)),cmap]))
    _require(res<=TOLERANCE and len(set(cmap))==len(b)==len(dual),
             'Regular4D dual reference lacks a complete reciprocal-coordinate bijection.')
    te={tuple(sorted(row)):i for i,row in enumerate(target['edges'])}
    tf_lookup={_cycle(row):i for i,row in enumerate(target['faces'])}
    tc_lookup={tuple(sorted(row)):i for i,row in enumerate(target['cells'])}
    try:
        fmap=[te[tuple(sorted(cmap[c] for c in owners))] for owners in face_cells]
        emap=[]
        for faces in edge_faces:
            adjacency={}
            for f in faces:
                x,y=face_cells[f];adjacency.setdefault(x,[]).append(y);adjacency.setdefault(y,[]).append(x)
            _require(all(len(row)==2 and len(set(row))==2 for row in adjacency.values()),
                     'Regular4D dual edge link is not a single simple cycle.')
            first=min(adjacency);cycle=[first];previous=first;current=min(adjacency[first])
            while current!=first:
                _require(current not in cycle,'Regular4D dual edge link repeats ownership.')
                cycle.append(current);previous,current=current,next(x for x in adjacency[current] if x!=previous)
            _require(set(cycle)==set(adjacency),'Regular4D dual edge link has disconnected components.')
            emap.append(tf_lookup[_cycle([cmap[c] for c in cycle])])
        vmap=[tc_lookup[tuple(sorted(emap[e] for e,row in enumerate(source['edges']) if v in row))]
              for v in range(len(a))]
    except KeyError as error:
        raise GeometryError('Regular4D dual partner disagrees with transposed ordered source incidence.') from error
    maps=[vmap,emap,fmap,cmap]
    _require(all(len(set(row))==len(row) for row in maps),'Regular4D dual ownership map is not bijective.')
    return {'sourceId':source.get('id'),'targetId':target.get('id'),
            'sourceSnapshotSha256':snapshot_hash(source),'targetSnapshotSha256':snapshot_hash(target),
            'sourceVertexToTargetCell':vmap,'sourceEdgeToTargetFace':emap,
            'sourceFaceToTargetEdge':fmap,'sourceCellToTargetVertex':cmap,
            'normalizedReciprocalCoordinateResidual':res,'certified':False,'hullUsed':False}


def qualify_catalog(directory):
    """Hash and parse the pinned authorized catalog; compact, no GUI/import scan."""
    from engine.formats import parse_off
    directory=Path(directory).resolve();raw=(directory/'manifest.json').read_bytes()
    _require(hashlib.sha256(raw).hexdigest()==MANIFEST_SHA256,'Regular4D pinned catalog manifest changed.')
    manifest=json.loads(raw);receipts=[];models={}
    for entry in manifest['entries']:
        path=(directory/entry['file']).resolve()
        _require(path.is_relative_to(directory),'Regular4D source path escapes its authorized catalog.')
        source=path.read_bytes();digest=hashlib.sha256(source).hexdigest()
        _require(digest==entry['rawSha256'],'Regular4D raw source differs from its retained acquisition hash.')
        model=parse_off(source.decode('utf-8-sig'),entry['name'])
        # OFF has no top-level Model ID. This reader owns the newly parsed
        # snapshot; stable identity makes catalog receipts reproducible. The
        # public analyze API never changes an existing caller's Model ID.
        model['id']='regular4d-reference:'+entry['key']
        models[entry['name']]=model
        receipts.append(analyze_regular4d(model,entry['name'],digest))
    _require({r['identity']['name'] for r in receipts}==set(CROSSWALK),
             'Regular4D catalog does not cover all sixteen independent identities.')
    by_name={r['identity']['name']:r for r in receipts}
    dual_receipts=[];visited=set()
    for row in receipts:
        a=row['identity'];b=by_name[a['dual']]['identity']
        _require(a['parameters']==list(reversed(b['parameters'])) and
                 a['counts']==list(reversed(b['counts'])),'Regular4D dual-pair crosswalk is inconsistent.')
        pair=tuple(sorted((a['name'],b['name'])))
        if pair not in visited:
            visited.add(pair);proof=_dual_reference_maps(models[a['name']],models[b['name']])
            proof['sourceIdentity']=a['name'];proof['targetIdentity']=b['name'];dual_receipts.append(proof)
    for entry in manifest['entries']:
        _require(hashlib.sha256((directory/entry['file']).read_bytes()).hexdigest()==entry['rawSha256'],
                 'Regular4D source changed during verification.')
    _require(hashlib.sha256((directory/'manifest.json').read_bytes()).hexdigest()==MANIFEST_SHA256,
             'Regular4D source manifest changed during verification.')
    root=Path(__file__).resolve().parents[1]
    return {'format':'regular4d-catalog-qualification','version':VERSION,
            'sourceManifestSha256':MANIFEST_SHA256,'passed':True,'sourceCount':16,
            'convexCount':6,'starCount':10,'certified':False,'receipts':receipts,
            'dualPairReceipts':dual_receipts,
            'sourceIntegrityBeforeAfter':True,'numpyVersion':np.__version__,
            'verifierSourceSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            'nativeSourceSha256':{name:hashlib.sha256((root/'engine'/name).read_bytes()).hexdigest()
                                  for name in ('__init__.py','formats.py','geometry.py')},
            'baseline6Executed':False,'installedLicensedContentsCopied':False}


def verify_catalog_receipt(directory, receipt):
    """Recompute source hashes, actions, dual maps, versions and all summaries."""
    _require(snapshot_hash(qualify_catalog(directory))==snapshot_hash(receipt),
             'Regular4D catalog receipt differs from recomputed source qualification.')
    return True
