"""Source classification and bounded literal vertex-link connectivity."""
from collections import defaultdict
from copy import deepcopy
from .geometry import GeometryError, identity, validate
from .history import _json_bytes

REGIMENT_REFERENCE='https://polytope.net/hedrondude/regiments.html'
# Exact published acronyms only. A shared regiment or directory is not a flag.
FISSARIES={'dupapadi','nadupti','dupti','nadupapdi','affic','affidhi',
           'sitpodady','gitpodady','ditsop','tipsop','sitphi','gitphi',
           'saquid paxhi','sadtaf dapixhi','sadtaf dipdy','sadtifady',
           'quadippady','datfodippady','dittanfodipdy','dittafady',
           'quad pagaxhi','gadtaf dapixhi','gadtaf dipdy','gadtafady'}


def classification_metadata(record):
    if record.get('dimension')!=4:return {}
    aliases=record.get('aliases');aliases=aliases if type(aliases) is list else []
    candidates=[record.get('bowers'),record.get('name'),*aliases]
    if any(type(v) is str and v.lower().strip() in FISSARIES for v in candidates):
        return {'fissary':True,'classificationReference':REGIMENT_REFERENCE,
                'fissaryDefinition':'Source-classified fissary: a compound/disconnected figure at some rank; not a mere coincident vertex set.'}
    return {}


def relationships(model):
    _json_bytes(model,16*1024*1024)
    if type(model) is not dict or model.get('dimension')!=4 or model.get('embeddingDimension',4)!=4:
        raise GeometryError('Polychoron relationships require an intrinsic XYZW 4D source.')
    if model.get('interpretation') not in ('convex-polytope','generalized-complex'):
        raise GeometryError('Relationships support convex or literal generalized 4D incidence only.')
    if type(model.get('metadata',{})) is not dict or type(model.get('numeric',{})) is not dict:
        raise GeometryError('Relationship source metadata and numeric settings must be objects.')
    if any(type(model.get(k)) is not list or len(model[k])>cap for k,cap in
           (('vertices',2048),('edges',10000),('faces',10000),('cells',4096))):
        raise GeometryError('Relationship analysis supports at most 2048 vertices, 10000 edges/faces and 4096 cells.')
    if any(type(r) is not list for k in ('vertices','edges','faces','cells') for r in model[k]):
        raise GeometryError('Relationship coordinates and incidence must be arrays.')
    if sum(len(r) for k in ('vertices','edges','faces','cells') for r in model[k])>100000:
        raise GeometryError('Relationship incidence work limit exceeded.')
    if not validate(model)['passed']:raise GeometryError('Relationship source incidence is invalid.')
    face_cells=[[] for _ in model['faces']];at_vertex=[set() for _ in model['vertices']]
    for i,cell in enumerate(model['cells']):
        for f in cell:
            face_cells[f].append(i)
            for v in model['faces'][f]:at_vertex[v].add(i)
    parents=[{c:c for c in cells} for cells in at_vertex]
    def root(parent,i):
        while parent[i]!=i:parent[i]=parent[parent[i]];i=parent[i]
        return i
    for face,cells in zip(model['faces'],face_cells):
        if not cells:continue
        for v in face:
            parent=parents[v]
            for c in cells[1:]:parent[root(parent,c)]=root(parent,cells[0])
    links=[]
    for v,parent in enumerate(parents):
        groups=defaultdict(list)
        for c in sorted(parent):groups[root(parent,c)].append(c)
        links.append({'vertexId':v,'componentCount':len(groups),'cellComponents':list(groups.values())})
    metadata=model.get('metadata',{});classification=classification_metadata({**metadata,'dimension':4})
    if not classification and metadata.get('key') in ('scaliform4-tuta','scaliform4-koho'):
        classification={'fissary':False,'classificationReference':'https://polytope.net/hedrondude/simplesc.htm'}
    fingerprint=identity(model);evidence={}
    for field in ('compound4Evidence','scaliform4Evidence'):
        item=metadata.get(field)
        if type(item) is dict and item.get('resultFingerprint')==fingerprint:evidence[field]=deepcopy(item)
    return {'sourceFingerprint':fingerprint,'dimension':4,'componentCount':len(model.get('components',[])) or 1,
        'classification':classification,'vertexLinks':links,
        'disconnectedVertexIds':[r['vertexId'] for r in links if r['componentCount']>1],
        'scope':'Literal source vertex links: incident cells joined through shared source faces containing that vertex. Coincident coordinates are not welded. Connectivity alone does not classify all fissary ranks.',
        'evidence':evidence,'certified':False}


def dispatch_relationships(request):
    if type(request.get('params',{})) is not dict or request.get('params',{}):
        raise GeometryError('Polychoron relationships take no parameters.')
    return relationships(request.get('model'))
