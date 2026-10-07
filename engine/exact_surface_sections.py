"""Exact bounded rational source-face sections, displayed in world XYZ.

This constructs curves and coplanar ordered faces, never a filled solid section.
Exact equality is used for intersections; no tolerance weld or Hull is used.
"""
from copy import deepcopy
from fractions import Fraction
import hashlib
import json
import math

from engine.geometry import GeometryError, identity, validate
from engine.dual_morph_expansion import _clone

VERSION='0.1.0'
LIMITS={'vertices':256,'edges':1024,'faces':256,'faceVertices':64,'incidences':8192,
        'outputVertices':4096,'outputEdges':8192,'inputBits':4096,'arithmeticBits':8192,'sourceBytes':8*1024*1024}


def _bound(value):
    if value.numerator.bit_length()>LIMITS['arithmeticBits'] or value.denominator.bit_length()>LIMITS['arithmeticBits']:
        raise GeometryError('Exact section arithmetic exceeds the 8192-bit work bound.')
    return value


def _fraction(value):
    if type(value) not in (int,float,str) or type(value) is bool or len(str(value))>256:
        raise GeometryError('Exact section literals must be bounded rational numbers.')
    if type(value) is float and not math.isfinite(value):raise GeometryError('Exact section literals must be finite.')
    try:result=Fraction(str(value))
    except (ValueError,ZeroDivisionError,OverflowError) as error:raise GeometryError('Use integer, decimal, or numerator/denominator literals.') from error
    if result.numerator.bit_length()>LIMITS['inputBits'] or result.denominator.bit_length()>LIMITS['inputBits']:
        raise GeometryError('Exact section inputs exceed 4096 bits.')
    return result


def _sub(a,b):return [_bound(x-y) for x,y in zip(a,b)]
def _dot(a,b):return _bound(sum((x*y for x,y in zip(a,b)),Fraction(0)))
def _cross(a,b):return [_bound(a[1]*b[2]-a[2]*b[1]),_bound(a[2]*b[0]-a[0]*b[2]),_bound(a[0]*b[1]-a[1]*b[0])]


def _face_normal(points):
    for i in range(1,len(points)):
        for j in range(i+1,len(points)):
            normal=_cross(_sub(points[i],points[0]),_sub(points[j],points[0]))
            if any(normal):
                if any(_dot(normal,_sub(p,points[0])) for p in points):
                    raise GeometryError('A source face is not exactly planar under the declared rational interpretation; use the numerical section tool.')
                return normal
    raise GeometryError('A source face has no exact planar area.')


def _inside(point,cycle,rule):
    winding=0;x,y=point
    for a,b in zip(cycle,cycle[1:]+cycle[:1]):
        cross=_bound((b[0]-a[0])*(y-a[1])-(b[1]-a[1])*(x-a[0]))
        if a[1]<=y<b[1] and cross>0:winding+=1
        elif b[1]<=y<a[1] and cross<0:winding-=1
    return winding!=0 if rule=='nonzero' else winding%2!=0


def exact_surface_section(model,normal=None,offset=0,fill_rule='nonzero'):
    source=_clone(model)
    if type(source) is not dict or source.get('dimension')!=3 or source.get('embeddingDimension',3)!=3 or source.get('interpretation') not in ('convex-polytope','generalized-complex') or source.get('cells',[])!=[]:
        raise GeometryError('Exact source-face sections require finite intrinsic XYZ3D faces or incidence complexes.')
    if len(json.dumps(source).encode())>LIMITS['sourceBytes']:raise GeometryError('Exact section source exceeds 8 MiB.')
    for key in ('vertices','edges','faces'):
        if type(source.get(key)) is not list or len(source[key])>LIMITS[key]:raise GeometryError('Exact section source '+key+' exceeds its bound.')
    if sum(map(len,source['faces']))>LIMITS['incidences'] or any(len(face)>LIMITS['faceVertices'] for face in source['faces']):
        raise GeometryError('Exact section face-incidence work exceeds its bound.')
    if not validate(source)['passed']:raise GeometryError('Exact section source incidence failed native validation.')
    if fill_rule not in ('nonzero','even-odd'):raise GeometryError('Choose nonzero or even-odd source-face winding.')
    normal=[0,0,1] if normal is None else normal
    if type(normal) not in (list,tuple) or len(normal)!=3:raise GeometryError('Exact plane needs three rational normal coefficients.')
    n=[_fraction(x) for x in normal];b=_fraction(offset)
    if not any(n):raise GeometryError('Exact plane normal must be nonzero.')
    raw=source['vertices'];policy='decimal-literal rational interpretation'
    if source.get('numeric',{}).get('mode')=='rational-exact' and source.get('rationalCoordinates') is not None:
        raw=source['rationalCoordinates'];policy='source rational coordinate table'
    if type(raw) is not list or len(raw)!=len(source['vertices']) or any(type(row) is not list or len(row)!=3 for row in raw):
        raise GeometryError('Exact source coordinate table is malformed.')
    points=[[_fraction(x) for x in row] for row in raw]
    if any(not math.isfinite(float(x)) or abs(float(x))>1e100 or
           not math.isclose(float(x),float(source['vertices'][i][k]),rel_tol=1e-14,abs_tol=0)
           for i,row in enumerate(points) for k,x in enumerate(row)):
        raise GeometryError('Exact source coordinates do not match the bounded display coordinates.')
    face_normals=[_face_normal([points[v] for v in face]) for face in source['faces']]
    distances=[_bound(_dot(p,n)-b) for p in points]
    vertices=[];references=[];keys={};edges=[];edge_refs=[];edge_map={};faces=[];face_refs=[]
    def point_id(key,point,reference):
        if key not in keys:
            if len(vertices)>=LIMITS['outputVertices']:raise GeometryError('Exact section vertex budget exceeded.')
            keys[key]=len(vertices);vertices.append(point);references.append([])
        index=keys[key]
        if reference not in references[index]:references[index].append(reference)
        return index
    def add_edge(a,c,reference):
        if a==c:return
        if vertices[a]==vertices[c]:raise GeometryError('A coplanar source edge has coincident distinct endpoints; change the plane or use numerical surface sections.')
        key=tuple(sorted((a,c)))
        if key not in edge_map:
            if len(edges)>=LIMITS['outputEdges']:raise GeometryError('Exact section edge budget exceeded.')
            edge_map[key]=len(edges);edges.append(list(key));edge_refs.append([])
        index=edge_map[key]
        if reference not in edge_refs[index]:edge_refs[index].append(reference)
    edge_ids={tuple(sorted(edge)):i for i,edge in enumerate(source['edges'])};edge_hits={}
    for ei,(a,c) in enumerate(source['edges']):
        da,dc=distances[a],distances[c];hits=[]
        for v,distance in ((a,da),(c,dc)):
            if distance==0:hits.append(point_id(('vertex',v),points[v],{'vertex':v,'edge':ei,'parameter':'0' if v==a else '1'}))
        if da*dc<0:
            t=_bound(da/(da-dc));point=[_bound(x+t*(y-x)) for x,y in zip(points[a],points[c])]
            hits.append(point_id(('edge',ei),point,{'edge':ei,'parameter':str(t)}))
        edge_hits[ei]=hits
        if da==dc==0:add_edge(*hits,{'edge':ei,'coplanar':True})
    for fi,face in enumerate(source['faces']):
        values=[distances[v] for v in face]
        if min(values)>0 or max(values)<0:continue
        if all(value==0 for value in values):
            ids=[point_id(('vertex',v),points[v],{'vertex':v,'face':fi,'coplanar':True}) for v in face]
            faces.append(ids);face_refs.append({'face':fi,'coplanar':True})
            for a,c in zip(ids,ids[1:]+ids[:1]):add_edge(a,c,{'face':fi,'coplanar':True})
            continue
        hits=set()
        for a,c in zip(face,face[1:]+face[:1]):
            ei=edge_ids[tuple(sorted((a,c)))];hits.update(edge_hits[ei])
            for index in edge_hits[ei]:
                reference={'face':fi,'edge':ei}
                if reference not in references[index]:references[index].append(reference)
            if distances[a]==distances[c]==0:add_edge(*edge_hits[ei],{'face':fi,'edge':ei,'coplanar':True})
        if len(hits)<2:continue
        direction=_cross(face_normals[fi],n)
        if not any(direction):raise GeometryError('Noncoplanar exact face/plane intersection is inconsistent.')
        axis=max(range(3),key=lambda k:abs(direction[k]));ordered=sorted(hits,key=lambda i:vertices[i][axis])
        if any(vertices[a]==vertices[c] for a,c in zip(ordered,ordered[1:])):
            raise GeometryError('Plane passes through coincident distinct source boundary hits; change the plane or use numerical surface sections.')
        dropped=max(range(3),key=lambda k:abs(face_normals[fi][k]));chart=[k for k in range(3) if k!=dropped]
        cycle=[[points[v][k] for k in chart] for v in face]
        for a,c in zip(ordered,ordered[1:]):
            midpoint=[_bound((vertices[a][k]+vertices[c][k])/2) for k in chart]
            if _inside(midpoint,cycle,fill_rule):add_edge(a,c,{'face':fi,'fillRule':fill_rule})
    equation={'normal':list(map(str,n)),'offset':str(b),'definition':'normal dot world XYZ = offset; coefficients are not normalized'}
    sha=hashlib.sha256(json.dumps(source,sort_keys=True,separators=(',',':')).encode()).hexdigest()
    exact={'algorithmVersion':VERSION,'coordinatePolicy':policy,'equation':equation,'sourceModelId':source.get('id'),
           'sourceFingerprint':identity(source),'sourceSnapshotSha256':sha,'sourceModel':source,'arithmetic':'bounded Python Fraction',
           'exactConstruction':True,'sourceReferences':references,'edgeSourceReferences':edge_refs,'faceSourceReferences':face_refs,
           'solidInteriorInferred':False,'toleranceWeld':False,'hullUsed':False,'limits':dict(LIMITS)}
    common={'exact':exact,'semantics':'source-face curves and coplanar winding faces; no filled-solid section','fillRule':fill_rule,
            'sourceReferences':references,'edgeSourceReferences':edge_refs,'faceSourceReferences':face_refs}
    if not vertices:return {'status':'empty','model':None,**common}
    rational=[list(map(str,p)) for p in vertices];approx=[[float(x) for x in p] for p in vertices]
    if any(not math.isfinite(x) or abs(x)>1e100 for p in approx for x in p):raise GeometryError('Exact section coordinates cannot be displayed within the numerical bounds.')
    displayed={}
    for exact_point,display_point in zip(vertices,approx):
        key=tuple(display_point)
        if key in displayed and displayed[key]!=exact_point:
            raise GeometryError('Float64 display would collapse distinct exact section points; change the plane.')
        displayed[key]=exact_point
    normal_scale=max(map(abs,n));scaled=[float(x/normal_scale) for x in n];length=math.hypot(*scaled)
    display_normal=[x/length for x in scaled];display_offset=float(b/normal_scale)/length
    colors=source.get('metadata',{}).get('offColors',{})
    def color(kind,index):
        values=colors.get(kind,[]);return deepcopy(values[index]) if index<len(values) else None
    metadata={'exactSurfaceSection':exact,'sourceMetadata':deepcopy(source.get('metadata',{})),'fillRule':fill_rule,'fillSemantics':'source-face-intersection',
              'sectionEmbedding':{'origin':[0,0,0],'basis':[[1,0,0],[0,1,0],[0,0,1]],'sourceId':source.get('id'),
                                  'normal':display_normal,'offset':display_offset,
                                  'coordinateSpace':'world XYZ','equation':equation},
              'sourceReferences':references,'edgeSourceReferences':edge_refs,'faceSourceReferences':face_refs,
              'offColors':{'faces':[color('faces',record['face']) for record in face_refs],
                           'vertices':[next((color('vertices',r['vertex']) for r in refs if 'vertex' in r),None) for refs in references]},
              'edgeSourceColors':[[{'face':fi,'color':color('faces',fi)} for fi in sorted({r['face'] for r in refs if 'face' in r})] for refs in edge_refs]}
    if 'coordinateUnits' in source.get('metadata',{}):metadata['coordinateUnits']=source['metadata']['coordinateUnits']
    result={'id':'exact-section-'+hashlib.sha256((sha+json.dumps(equation,sort_keys=True)+fill_rule).encode()).hexdigest(),
            'name':'Exact surface section of '+source.get('name','source'),'dimension':2,'embeddingDimension':3,
            'interpretation':'surface-section','vertices':approx,'rationalCoordinates':rational,'edges':edges,'faces':faces,'cells':[],
            # Protected project validation reserves rational-exact for Hull
            # certificates. Keep exact construction separate from display mode.
            'numeric':{'mode':'float64-approximate','certified':False,'exactConstruction':'rational source-face intersection'},
            'metadata':metadata,'provenance':{'operation':'exact-surface-section','algorithmVersion':VERSION,
                 'sourceModelId':source.get('id'),'sourceSnapshotSha256':sha,'parameters':{'normal':equation['normal'],'offset':str(b),'fill_rule':fill_rule},'convexified':False}}
    result['fingerprint']=identity(result);result['validation']=validate(result)
    if not result['validation']['passed']:raise GeometryError('Exact section display incidence failed validation: '+'; '.join(result['validation']['errors']))
    return {'status':'surface-intersection' if edges or faces else 'point-tangency','model':result,**common}


def dispatch_exact_section(request):
    if type(request) is not dict or set(request)-{'op','params','model','id','algorithmVersion'} or request.get('op') not in ('exact-surface-section','exact-surface-section-preview'):
        raise GeometryError('Exact section requires a supported source request.')
    if request.get('algorithmVersion',VERSION)!=VERSION:raise GeometryError('Unsupported exact section algorithm version.')
    params=request.get('params',{})
    if type(params) is not dict or set(params)-{'normal','offset','fill_rule'}:raise GeometryError('Exact sections accept rational normal, offset and source-face fill_rule only.')
    try:
        result=exact_surface_section(request.get('model'),**params)
        if request['op'].endswith('-preview'):return result
        if result['model'] is None:raise GeometryError('Empty exact section cannot be adopted.')
        return result['model']
    except GeometryError:raise
    except (TypeError,ValueError,KeyError,IndexError,ArithmeticError) as error:raise GeometryError('Malformed or unresolved exact section request.') from error
