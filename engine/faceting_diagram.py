"""Unmounted FAC-04 projective/plane diagram receipts and safe SVG.

Source incidence is never replaced by paint intersections, sorting or a Hull.
The finite chart convention is explicitly derived, not executed Stella output.
"""
from collections import defaultdict
from copy import deepcopy
from fractions import Fraction
import html
import json
import math

from engine.automatic_faceting import (VERSION as CANDIDATE_VERSION, candidate_facets,
    _source, _hash, _fraction, _plane, _value, _edges)
from engine.automatic_faceting_workflow import dispatch_faceting
from engine.compounds import _colors
from engine.geometry import GeometryError, identity
from engine.history import _json_bytes

VERSION='0.1.0'
LIMITS={'sourceBytes':16*1024*1024,'receiptBytes':64*1024*1024,'selectedFacets':128,
        'work':250000,'paintMagnitude':1e100,'svgBytes':32*1024*1024}
PARAMETER_KEYS={'kind','vertex_id','plane_id','center','seed_ids','reflections','fill_rule',
    'hide_diagram_when_selected','hide_vertices_when_selected','search','result_id','max_work'}


def _bytes(value,limit=LIMITS['receiptBytes']):
    try:return _json_bytes(value,limit)
    except (TypeError,ValueError,UnicodeError,RecursionError,OverflowError) as exc:
        raise GeometryError('Faceting diagram requires finite bounded UTF-8 JSON.') from exc


def _f(value):
    if type(value) not in (int,float,str,Fraction) or type(value) is str and len(value)>256:
        raise GeometryError('Diagram ratios require bounded finite numbers or rational literals.')
    try:return _fraction(value)
    except (ArithmeticError,TypeError,ValueError) as exc:
        raise GeometryError('Diagram ratio is not finite within its 4096-bit domain.') from exc


def _dot(a,b):return _f(sum(x*y for x,y in zip(a,b)))
def _sub(a,b):return [_f(x-y) for x,y in zip(a,b)]
def _cross(a,b):return [_f(a[1]*b[2]-a[2]*b[1]),_f(a[2]*b[0]-a[0]*b[2]),_f(a[0]*b[1]-a[1]*b[0])]
def _cross2(a,b):return _f(a[0]*b[1]-a[1]*b[0])


def _normalise(values):
    pivot=next((x for x in values if x),None)
    return [str(_f(x/pivot)) for x in values] if pivot is not None else [str(x) for x in values]


def _unit(vector):
    maximum=max(abs(x) for x in vector)
    values=[float(_f(x/maximum)) for x in vector];length=math.hypot(*values)
    return [x/length for x in values]


def _params(value):
    _bytes(value,LIMITS['sourceBytes'])
    if type(value) is not dict or set(value)-PARAMETER_KEYS:raise GeometryError('Diagram requires exact supported parameter keys.')
    p={'kind':'vertex','vertex_id':None,'plane_id':None,'center':None,'seed_ids':None,
       'reflections':True,'fill_rule':'nonzero','hide_diagram_when_selected':False,
       'hide_vertices_when_selected':False,'search':None,'result_id':None,'max_work':LIMITS['work']}
    p.update(deepcopy(value))
    if p['kind'] not in ('vertex','plane') or p['fill_rule'] not in ('nonzero','evenodd','none'):
        raise GeometryError('Choose vertex/plane diagram and nonzero/evenodd/none fill.')
    for key in ('reflections','hide_diagram_when_selected','hide_vertices_when_selected'):
        if type(p[key]) is not bool:raise GeometryError('Diagram switches must be booleans.')
    if type(p['max_work']) is not int or not 1<=p['max_work']<=LIMITS['work']:raise GeometryError('Diagram work limit must be 1 to250000.')
    if p['kind']=='vertex':
        if type(p['vertex_id']) is not int or p['plane_id'] is not None:raise GeometryError('Vertex diagram requires only a literal vertex_id.')
    elif type(p['plane_id']) is not str or not 1<=len(p['plane_id'])<=128 or p['vertex_id'] is not None:
        raise GeometryError('Plane diagram requires only a bounded plane_id.')
    if p['center'] is not None:
        if p['kind']!='vertex':raise GeometryError('An explicit center applies only to the vertex projective chart.')
        if type(p['center']) is not list or len(p['center'])!=3:raise GeometryError('Diagram center requires three exact numeric/ratio coordinates.')
        for x in p['center']:_f(x)
    if p['seed_ids'] is not None and (type(p['seed_ids']) is not list or len(p['seed_ids'])>LIMITS['selectedFacets'] or
        any(type(x) is not str or not 1<=len(x)<=128 for x in p['seed_ids']) or len(set(p['seed_ids']))!=len(p['seed_ids'])):
        raise GeometryError('Diagram seeds require distinct bounded literal candidate IDs.')
    if (p['search'] is None)!=(p['result_id'] is None) or p['search'] is not None and (
        type(p['search']) is not dict or type(p['result_id']) is not str or not 1<=len(p['result_id'])<=128):
        raise GeometryError('Diagram adoption binding needs both search and literal result_id.')
    return p


class _Stop(Exception):
    def __init__(self,status,reason):self.status=status;self.reason=reason


class _Job:
    def __init__(self,source,catalogue,params,cancelled):
        _bytes(source,LIMITS['sourceBytes']);_bytes(catalogue);self.params=_params(params)
        if cancelled is not None and not callable(cancelled):raise GeometryError('Diagram cancel requires an injected callable.')
        self.originals=(source,catalogue,params);self.hashes=[_hash(value) for value in self.originals]
        self.source=deepcopy(source);self.catalogue=deepcopy(catalogue);self.points=_source(self.source)
        self.cancelled=cancelled;self.work=0
        self.receipt={'version':VERSION,'candidateVersion':CANDIDATE_VERSION,'sourceSnapshot':deepcopy(source),
            'sourceSnapshotHash':self.hashes[0],'sourceId':source['id'],'sourceFingerprint':identity(source),
            'catalogue':deepcopy(catalogue),'parameters':deepcopy(self.params),'status':'complete','diagnostics':[],
            'numeric':{'predicates':'exact supplied integer/binary64-ratio source coordinates',
                'paint':'float64 metric basis and finite SVG viewport clipping','certifiedModel':False,
                'rationalCoordinatesRetained':source.get('rationalCoordinates') is not None,
                'rationalCoordinatesReinterpreted':False},'sourceGeometryChanged':False,
            'intersectionVerticesInsertedIntoSource':False,'enumerationComplete':False,
            'adoption':None,'workUsed':0,'limits':deepcopy(LIMITS),'presentationComplete':True}

    def step(self,amount=1):
        if self.cancelled is not None and self.cancelled():raise _Stop('user-cancelled','Diagram canceled; no construction or adoption changed.')
        if self.work+amount>self.params['max_work']:raise _Stop('resource-limited','Diagram work budget reached; geometry is not partially adopted.')
        self.work+=amount

    def candidate_callback(self):self.step();return False

    def finish(self):
        if any(_hash(value)!=expected for value,expected in zip(self.originals,self.hashes)):
            raise GeometryError('Diagram full source/catalogue/parameter ownership changed during evaluation.')
        self.receipt['workUsed']=self.work;self.receipt['id']='faceting-diagram-'+_hash(self.receipt)
        _bytes(self.receipt);return self.receipt


def _verify_catalogue(job):
    c=job.catalogue
    if type(c) is not dict or c.get('version')!=CANDIDATE_VERSION or c.get('generationStatus')=='user-cancelled':
        raise GeometryError('Diagram requires a reconstructible supported candidate receipt, not a canceled pool.')
    try:
        d=c['domain'];perms=c['symmetry']['group']['permutations']
        args={'max_face_vertices':d['maximumFaceVertices'],'max_candidates':d['maximumCandidates'],
              'max_cycles_per_plane':d['maximumCyclesPerPlane'],'symmetry_permutations':perms}
        fresh=candidate_facets(job.source,**args,cancelled=job.candidate_callback)
    except (KeyError,TypeError) as exc:raise GeometryError('Diagram candidate receipt is malformed.') from exc
    if _hash(fresh)!=_hash(c):raise GeometryError('Diagram candidate planes/cycles/subgroup/source evidence failed reconstruction.')
    job.receipt['candidateDomainStatus']=c['status']
    job.receipt['candidateDomainExhausted']=c['generationStatus']=='complete'


def _frame(origin,normal):
    axis=min(range(3),key=lambda i:abs(normal[i]));e=[Fraction(int(i==axis)) for i in range(3)]
    u=_cross(e,normal);v=_cross(normal,u)
    return {'origin':origin,'normal':normal,'u':u,'v':v,'axis':axis,'unitU':_unit(u),'unitV':_unit(v),'unitNormal':_unit(normal)}


def _chart(frame,point):
    delta=_sub(point,frame['origin'])
    return [_f(_dot(delta,frame['u'])/_dot(frame['u'],frame['u'])),
            _f(_dot(delta,frame['v'])/_dot(frame['v'],frame['v']))]


def _metric(frame,point):
    try:
        delta=[float(x) for x in _sub(point,frame['origin'])]
        xy=[sum(x*y for x,y in zip(delta,frame[axis])) for axis in ('unitU','unitV')]
        if all(math.isfinite(x) and abs(x)<=LIMITS['paintMagnitude'] for x in xy):return xy
    except (OverflowError,ValueError):pass
    return None


def _frame_receipt(frame):
    return {'origin':[str(x) for x in frame['origin']],'normal':[str(x) for x in frame['normal']],
        'rationalBasis':[[str(x) for x in frame[key]] for key in ('u','v')],
        'metricBasis':[frame['unitU'],frame['unitV']],'metricNormal':frame['unitNormal'],
        'deterministicReferenceAxis':frame['axis'],'basisConvention':'e_axis cross normal, then normal cross u; minimum absolute normal component with axis-index ties'}


def _winding(points):
    winding=0;area=Fraction(0)
    for a,b in zip(points,points[1:]+points[:1]):
        area=_f(area+_cross2(a,b))
        side=_cross2(_sub(b,a),[-a[0],-a[1]])
        if not side and all(min(a[i],b[i])<=0<=max(a[i],b[i]) for i in range(2)):
            return {'algebraicAreaChart':str(_f(sum(_cross2(a,b) for a,b in zip(points,points[1:]+points[:1]))/2)),
                    'originWinding':None,'originOnBoundary':True}
        if a[1]<=0<b[1] and side>0:winding+=1
        if b[1]<=0<a[1] and side<0:winding-=1
    return {'algebraicAreaChart':str(_f(area/2)),'originWinding':winding,'originOnBoundary':False}


def _selection(job):
    c=job.catalogue;rows=c['candidates'];lookup={row['id']:i for i,row in enumerate(rows)}
    p=job.params;adopted=None
    if p['search'] is not None:
        job.step()
        adopted=dispatch_faceting({'op':'facet-adopt','model':job.source,
            'params':{'search':p['search'],'result_id':p['result_id']}},cancelled=job.candidate_callback)
        selected=next(row for row in p['search']['results'] if row['id']==p['result_id'])
        seeds=selected['candidateIds'] if p['seed_ids'] is None else p['seed_ids']
    else:seeds=[] if p['seed_ids'] is None else p['seed_ids']
    if any(seed not in lookup for seed in seeds):raise GeometryError('Diagram seed is not a source-bound candidate ID.')
    sym=c['symmetry'];group=sym['group'];action_ids=[i for i,sign in enumerate(group['orientationSigns']) if p['reflections'] or sign==1]
    if seeds and sym['status']!='complete':raise _Stop('unsupported','Selected facet replication requires complete verified candidate actions.')
    indices=set()
    for seed in seeds:
        for g in action_ids:job.step();indices.add(sym['candidateActionIndices'][g][lookup[seed]])
    ids=sorted(rows[i]['id'] for i in indices)
    job.receipt['selection']={'seedCandidateIds':deepcopy(seeds),'expandedCandidateIds':ids,
        'expandedCycles':[deepcopy(rows[lookup[i]]['cycle']) for i in ids],
        'sourceSubgroupId':group['id'],'actionIndices':action_ids,'reflections':p['reflections'],
        'maximalSymmetryClaim':False,'sourceAttributeSymmetryRequired':False}
    if len(ids)>LIMITS['selectedFacets']:raise _Stop('resource-limited','Expanded selected-facet paint/ownership cap reached.')
    if adopted is not None:
        desired=sorted(selected['candidateIds'])
        if ids!=desired:raise GeometryError('Diagram replicated selection differs from the retained adoption result.')
        if adopted['faces']!=selected['cycles']:raise GeometryError('Adoption ordered cycles differ from selected diagram incidence.')
        job.receipt['adoption']={'parameters':{'search':deepcopy(p['search']),'result_id':p['result_id']},
            'model':adopted,'modelId':adopted['id'],'fingerprint':identity(adopted),
            'candidateIds':desired,'diagramSelectionMatches':True,'criterionPolicyNotExpanded':True}
    colors=_colors(job.source,'faces');selected_records=[]
    for candidate_id in ids:
        row=rows[lookup[candidate_id]];owners=row['sourceFaceIds'];values=[colors[i] for i in owners]
        if values and any(value!=values[0] for value in values):raise GeometryError('Diagram matching source-cycle RGBA ownership is ambiguous.')
        selected_records.append({'candidateId':candidate_id,'planeId':row['planeId'],'cycle':deepcopy(row['cycle']),
            'sourceFaceIds':deepcopy(owners),'sourceOrderedCycles':[deepcopy(job.source['faces'][i]) for i in owners],
            'sourceColor':deepcopy(values[0]) if values else None})
    job.receipt['selection']['facets']=selected_records
    warnings=defaultdict(list)
    for row in selected_records:
        for edge in _edges(row['cycle']):warnings[edge].append(row)
    edge_rows=[]
    for edge,owners in sorted(warnings.items()):
        number=len(owners);kind='open' if number==1 else 'odd' if number%2 else 'overfull' if number>2 else 'coplanar' if owners[0]['planeId']==owners[1]['planeId'] else 'ordinary'
        edge_rows.append({'sourceVertexIds':list(edge),'candidateIds':[row['candidateId'] for row in owners],
            'incidentFacetCount':number,'kind':kind,'highlight':{'open':'green','odd':'orange','overfull':'red','coplanar':'purple','ordinary':None}[kind]})
    job.receipt['selection']['edgeDiagnostics']=edge_rows
    job.receipt['selection']['nativeAdoptionValidated']=adopted is not None
    return {row['candidateId']:row for row in selected_records}


def _intersection(job,a,b,points):
    A,B=(points[i] for i in a);C,D=(points[i] for i in b)
    r=_sub(B,A);s=_sub(D,C);delta=_sub(C,A);den=_cross2(r,s)
    if den:
        t=_f(_cross2(delta,s)/den);u=_f(_cross2(delta,r)/den)
        if not (0<=t<=1 and 0<=u<=1):return None
        p=[_f(x+t*y) for x,y in zip(A,r)]
        return {'kind':'proper-crossing' if 0<t<1 and 0<u<1 else 'endpoint-incidence',
                'point':[str(x) for x in p],'edgeParameters':[str(t),str(u)],
                'sourceVertexIds':[i for i,q in points.items() if q==p]}
    if _cross2(delta,r):return None
    axis=next(i for i,x in enumerate(r) if x);start=_f((C[axis]-A[axis])/r[axis]);end=_f((D[axis]-A[axis])/r[axis])
    low=max(Fraction(0),min(start,end));high=min(Fraction(1),max(start,end))
    if low>high:return None
    p=[_f(x+low*y) for x,y in zip(A,r)];q=[_f(x+high*y) for x,y in zip(A,r)]
    return {'kind':'collinear-overlap' if low<high else 'endpoint-incidence',
        'interval':[str(low),str(high)],'points':[[str(x) for x in p],[str(x) for x in q]],
        'sourceVertexIds':[i for i,x in points.items() if x in (p,q)]}


def _plane_diagram(job,selection):
    row=next((row for row in job.catalogue['planes'] if row['id']==job.params['plane_id']),None)
    if row is None:raise GeometryError('Choose a reconstructed source plane ID.')
    plane=[_f(x) for x in row['exactPlane']];n=plane[:3];n2=_dot(n,n)
    origin=[_f(-plane[3]*x/n2) for x in n];frame=_frame(origin,n);ids=row['sourceVertexIds']
    chart={i:_chart(frame,job.points[i]) for i in ids};points=[]
    for i in ids:
        job.step();metric=_metric(frame,job.points[i])
        points.append({'sourceVertexId':i,'exactCoordinates':[str(x) for x in chart[i]],'metricCoordinates':metric})
        if metric is None:job.receipt['presentationComplete']=False
    candidates=[c for c in job.catalogue['candidates'] if c['planeId']==row['id']];paths=[];segments=defaultdict(list)
    for c in candidates:
        job.step();cycle=c['cycle']
        paths.append({'candidateId':c['id'],'cycle':deepcopy(cycle),'sourceFaceIds':deepcopy(c['sourceFaceIds']),
            'selected':c['id'] in selection,'winding':_winding([chart[i] for i in cycle]),
            'sourceOrderedWinding':[{'sourceFaceId':i,'cycle':deepcopy(job.source['faces'][i]),
                'winding':_winding([chart[v] for v in job.source['faces'][i]])} for i in c['sourceFaceIds']]})
        for edge in _edges(cycle):segments[edge].append(c['id'])
    source_edges=defaultdict(list)
    for i,edge in enumerate(job.source['edges']):source_edges[tuple(sorted(edge))].append(i)
    edge_rows=[{'id':'diagram-edge-'+_hash({'plane':row['id'],'vertices':list(edge)}),
        'sourceVertexIds':list(edge),'nativeSourceEdgeIds':source_edges.get(edge,[]),'candidateIds':owners}
        for edge,owners in sorted(segments.items())]
    intersections=[]
    for i,a in enumerate(edge_rows):
        for b in edge_rows[i+1:]:
            job.step();hit=_intersection(job,a['sourceVertexIds'],b['sourceVertexIds'],chart)
            if hit is None:continue
            hit['edgeIds']=[a['id'],b['id']];hit['paintOnly']=not hit['sourceVertexIds'] or hit['kind']=='collinear-overlap'
            if 'point' in hit:
                chart_point=[_f(x) for x in hit['point']]
                actual=[_f(origin[j]+sum(chart_point[k]*frame[key][j] for k,key in enumerate(('u','v')))) for j in range(3)]
                hit['metricCoordinates']=_metric(frame,actual)
                if hit['metricCoordinates'] is None:job.receipt['presentationComplete']=False
            hit['id']='diagram-intersection-'+_hash(hit);intersections.append(hit)
    job.receipt.update(frame=_frame_receipt(frame),planeId=row['id'],plane=deepcopy(row),
        vertices=points,candidates=paths,segments=edge_rows,intersections=intersections,
        diagramConvention='Supplemental Euclidean source-plane cycle chart; not the per-vertex baseline diagram')


def _vertex_diagram(job,selection):
    vertex=job.params['vertex_id']
    if not 0<=vertex<len(job.points):raise GeometryError('Diagram main vertex ID is out of range.')
    c=[_f(x) for x in job.params['center']] if job.params['center'] is not None else [
        _f(sum(point[i] for point in job.points)/len(job.points)) for i in range(3)]
    n=_sub(job.points[vertex],c);n2=_dot(n,n)
    if not n2:raise _Stop('unsupported','Main vertex equals the exact center; radial projective chart is undefined.')
    frame=_frame(c,n);points=[]
    for i,point in enumerate(job.points):
        if i==vertex:continue
        job.step();direction=_sub(point,job.points[vertex]);den=_dot(n,direction)
        numerators=[_f(-n2*_dot(direction,frame[key])/_dot(frame[key],frame[key])) for key in ('u','v')]
        record={'sourceVertexId':i,'homogeneous':_normalise(numerators+[den]),'metricCoordinates':None}
        if den:
            exact=[_f(x/den) for x in numerators];projected=[_f(x-n2*y/den) for x,y in zip(job.points[vertex],direction)]
            metric=_metric(frame,projected);record.update(status='finite' if metric is not None else 'finite-unrenderable',
                exactCoordinates=[str(x) for x in exact],metricCoordinates=metric,
                projectionParameter=str(_f(-n2/den)))
        else:record.update(status='at-infinity',exactCoordinates=None,projectionParameter=None)
        if record['status']=='finite-unrenderable':job.receipt['presentationComplete']=False
        points.append(record)
    lines=[]
    for row in job.catalogue['planes']:
        if vertex not in row['sourceVertexIds']:continue
        job.step();plane=[_f(x) for x in row['exactPlane']]
        coefficients=[_dot(plane[:3],frame['u']),_dot(plane[:3],frame['v']),_value(plane,c)]
        kind='finite' if any(coefficients[:2]) else 'at-infinity' if coefficients[2] else 'coincident-chart'
        candidates=[r for r in job.catalogue['candidates'] if r['planeId']==row['id'] and vertex in r['cycle']]
        selected=[r['id'] for r in candidates if r['id'] in selection]
        maximum=max(abs(x) for x in plane[:3]);unit_plane=[float(x/maximum) for x in plane[:3]]
        try:offset=float(_f(coefficients[2]/maximum))
        except OverflowError:offset=None
        metric=[sum(x*y for x,y in zip(unit_plane,frame[key])) for key in ('unitU','unitV')]+[offset]
        source_distance=(abs(offset)/math.hypot(*unit_plane) if offset is not None else None)
        projected_norm=math.hypot(*metric[:2])
        distance=(abs(offset)/projected_norm if offset is not None and projected_norm else None)
        if kind=='finite' and (not any(metric[:2]) or offset is None or not math.isfinite(offset) or
                abs(offset)>LIMITS['paintMagnitude'] or not math.isfinite(distance) or distance>LIMITS['paintMagnitude']):
            kind='finite-unrenderable';job.receipt['presentationComplete']=False;distance=None
        lines.append({'planeId':row['id'],'exactLine':_normalise(coefficients),'status':kind,
            'metricLine':metric if kind=='finite' else None,'sourceVertexIds':deepcopy(row['sourceVertexIds']),
            'candidateIds':[r['id'] for r in candidates],'selectedCandidateIds':selected,
            'sourceFaceIds':sorted(set(i for r in candidates for i in r['sourceFaceIds'])),
            'distanceFromCenter':distance if kind=='finite' else None,
            'sourcePlaneDistanceFromCenter':source_distance if source_distance is not None and math.isfinite(source_distance) else None,
            'distanceConvention':'metric distance from diagram center to projected line; separate source facial-plane distance retained'})
    group=job.catalogue['symmetry']['group'];orbit=sorted({action[vertex] for action in group['permutations']})
    job.receipt.update(frame=_frame_receipt(frame),mainVertexId=vertex,center=[str(x) for x in c],
        vertexOrbit={'sourceVertexIds':orbit,'representativeVertexId':orbit[0],'sourceSubgroupId':group['id'],
            'maximalSymmetryClaim':False},vertices=points,lines=lines,
        diagramConvention='Derived projective chart: projection from main vertex onto plane through center perpendicular to mainVertex-center; explicit signed homogeneous infinities')


def build_diagram(source,catalogue,params,*,cancelled=None):
    job=_Job(source,catalogue,params,cancelled)
    try:
        job.step();_verify_catalogue(job);selection=_selection(job)
        if job.params['kind']=='plane':_plane_diagram(job,selection)
        else:_vertex_diagram(job,selection)
        unit=job.source.get('metadata',{}).get('coordinateUnits','model')
        if type(unit) is not str or not 1<=len(unit)<=64:raise GeometryError('Diagram source coordinate units need a bounded literal label.')
        job.receipt['unitLabel']=unit
        if not job.receipt['presentationComplete']:job.receipt['diagnostics'].append('Exact finite chart records exceed paint readiness; omitted paint is explicit, not infinite geometry.')
    except _Stop as stop:
        job.receipt.update(status=stop.status,adoption=None,presentationComplete=False)
        job.receipt['diagnostics'].append(stop.reason)
    except (ArithmeticError,KeyError,TypeError,ValueError) as exc:
        raise GeometryError('Diagram numeric/incidence data could not be resolved: '+str(exc)) from exc
    return job.finish()


def verify_diagram(source,diagram):
    _bytes(diagram)
    if type(diagram) is not dict or diagram.get('version')!=VERSION:raise GeometryError('Unsupported faceting diagram receipt.')
    if diagram.get('status')=='user-cancelled':raise GeometryError('Canceled diagram has no deterministic publishable receipt.')
    if diagram.get('sourceSnapshotHash')!=_hash(source) or _hash(diagram.get('sourceSnapshot'))!=_hash(source):
        raise GeometryError('Diagram full source identity/attributes do not match.')
    fresh=build_diagram(source,diagram.get('catalogue'),diagram.get('parameters'))
    if _hash(fresh)!=_hash(diagram):raise GeometryError('Diagram exact projection/selection/color/accounting evidence changed.')
    return fresh


def adoption_parameters(source,diagram):
    checked=verify_diagram(source,diagram)
    if checked['status']!='complete' or checked.get('adoption') is None:
        raise GeometryError('Draft/limited diagram has no independently validated adoption binding.')
    return deepcopy(checked['adoption']['parameters'])


def save_state(diagram):
    if type(diagram) is not dict:raise GeometryError('Diagram requires a bounded receipt object.')
    checked=verify_diagram(diagram.get('sourceSnapshot'),diagram)
    return {'format':'faceting-diagram','version':1,'kernelVersion':VERSION,'source':deepcopy(checked['sourceSnapshot']),
        'catalogue':deepcopy(checked['catalogue']),'parameters':deepcopy(checked['parameters'])}


def restore_state(value,*,cancelled=None):
    _bytes(value)
    if (type(value) is not dict or set(value)!={'format','version','kernelVersion','source','catalogue','parameters'} or
        value.get('format')!='faceting-diagram' or type(value.get('version')) is not int or value['version']!=1 or value['kernelVersion']!=VERSION):
        raise GeometryError('Diagram state requires its exact versioned envelope.')
    return build_diagram(value['source'],value['catalogue'],value['parameters'],cancelled=cancelled)


def resolve_pick(source,diagram,kind,identifier):
    checked=verify_diagram(source,diagram)
    if checked['status']!='complete':raise GeometryError('Incomplete diagram cannot publish a pick.')
    if kind=='source-vertex':
        if type(identifier) is not int or not any(r['sourceVertexId']==identifier for r in checked['vertices']):raise GeometryError('Choose a retained diagram source vertex.')
        return {'sourceVertexIds':[identifier],'geometryInserted':False}
    if kind=='plane':
        rows=checked.get('lines',[checked.get('plane',{})]);row=next((r for r in rows if r.get('planeId',r.get('id'))==identifier),None)
        if row is None:raise GeometryError('Choose a retained diagram plane.')
        ids=row.get('candidateIds',[c['candidateId'] for c in checked.get('candidates',[])])
        return {'planeId':identifier,'candidateIds':deepcopy(ids),'requiresCandidateDisambiguation':len(ids)!=1,'geometryInserted':False}
    if kind=='candidate':
        row=next((r for r in checked['catalogue']['candidates'] if r['id']==identifier),None)
        visible=([r['candidateId'] for r in checked.get('candidates',[])] if checked['parameters']['kind']=='plane'
                 else [i for r in checked.get('lines',[]) for i in r['candidateIds']])
        if row is None or identifier not in visible:raise GeometryError('Choose a retained diagram candidate ID.')
        return {'candidateId':identifier,'sourceVertexCycle':deepcopy(row['cycle']),'sourceFaceIds':deepcopy(row['sourceFaceIds']),'geometryInserted':False}
    if kind=='intersection':
        row=next((r for r in checked.get('intersections',[]) if r['id']==identifier),None)
        if row is None:raise GeometryError('Choose a retained paint intersection.')
        return {'paintIntersectionId':identifier,'sourceVertexIds':deepcopy(row['sourceVertexIds']),
                'edgeIds':deepcopy(row['edgeIds']),'geometryInserted':False,'virtualSourceVertexId':None}
    raise GeometryError('Unsupported diagram pick kind.')


def _paint_color(color):
    if color is None:return '#5ba9f2',.22
    scale=255 if color['encoding']=='unit' else 1
    channels=color['values'];rgb=[round(x*scale) for x in channels[:3]]
    alpha=channels[3]/(255 if color['encoding']=='byte' else 1) if len(channels)==4 else 1
    return f'rgb({rgb[0]},{rgb[1]},{rgb[2]})',alpha


def to_svg(diagram,*,width=640,height=480):
    if type(diagram) is not dict:raise GeometryError('Diagram requires a bounded receipt object.')
    if type(width) is not int or type(height) is not int or not 80<=width<=4096 or not 80<=height<=4096:
        raise GeometryError('SVG diagram dimensions must be bounded integer pixels.')
    checked=verify_diagram(diagram.get('sourceSnapshot'),diagram)
    if checked['status']!='complete':raise GeometryError('Incomplete diagram cannot be painted as complete.')
    points={r['sourceVertexId']:r['metricCoordinates'] for r in checked['vertices'] if r['metricCoordinates'] is not None}
    all_xy=list(points.values())+([[0,0]] if checked['parameters']['kind']=='vertex' else [])
    if not all_xy:raise GeometryError('Diagram has no finite paintable chart points.')
    lo=[min(p[i] for p in all_xy) for i in range(2)];hi=[max(p[i] for p in all_xy) for i in range(2)]
    span=max(hi[i]-lo[i] for i in range(2)) or 1
    center=[lo[i]/2+hi[i]/2 for i in range(2)];size=min(width-60,height-70)
    def xy(point):return [width/2+(point[0]-center[0])/span*size,height/2-(point[1]-center[1])/span*size]
    def esc(value):return html.escape(str(value),quote=True)
    def line(a,b,attrs):
        p,q=xy(a),xy(b);return f'<line x1="{p[0]:.12g}" y1="{p[1]:.12g}" x2="{q[0]:.12g}" y2="{q[1]:.12g}" {attrs}/>'
    output=[f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img">',
        '<title>Source-bound faceting diagram; development chart</title>',
        '<metadata>'+html.escape(json.dumps({'diagramId':checked['id'],'sourceSnapshotHash':checked['sourceSnapshotHash'],
            'parameters':checked['parameters'],'presentationComplete':checked['presentationComplete']},allow_nan=False))+'</metadata>',
        f'<text x="12" y="20" font-size="12">Source coordinates ({esc(checked["unitLabel"])}) · {esc(checked["parameters"]["kind"])} chart</text>']
    p=checked['parameters'];selected={r['candidateId']:r for r in checked['selection']['facets']}
    hide=p['hide_diagram_when_selected'] and bool(selected)
    if p['kind']=='plane':
        if not hide:
            for edge in checked['segments']:
                a,b=edge['sourceVertexIds']
                if a in points and b in points:output.append(line(points[a],points[b],f'data-edge-id="{esc(edge["id"])}" stroke="#9aa4b5" stroke-width=".7" fill="none"'))
        for row in checked['candidates']:
            if not row['selected'] or any(v not in points for v in row['cycle']):continue
            color,alpha=_paint_color(selected[row['candidateId']]['sourceColor']);coords=[xy(points[v]) for v in row['cycle']]
            d='M '+' L '.join(f'{x:.12g},{y:.12g}' for x,y in coords)+' Z'
            fill='none' if p['fill_rule']=='none' else color
            output.append(f'<path data-candidate-id="{esc(row["candidateId"])}" d="{d}" fill="{fill}" fill-rule="{p["fill_rule"] if p["fill_rule"]!="none" else "nonzero"}" fill-opacity="{alpha:.12g}" stroke="{color}" stroke-opacity="{alpha:.12g}" stroke-width="2"/>')
        if not hide:
            for crossing in checked['intersections']:
                if crossing['kind']!='proper-crossing':continue
                metric=crossing['metricCoordinates']
                if metric is None:continue
                x,y=xy(metric)
                output.append(f'<circle data-paint-intersection-id="{esc(crossing["id"])}" cx="{x:.12g}" cy="{y:.12g}" r="1.6" fill="#d946ef"/>')
    else:
        distances=[row['distanceFromCenter'] for row in checked['lines'] if row['distanceFromCenter'] is not None];maximum=max(distances,default=1) or 1
        for row in checked['lines']:
            if row['status']!='finite' or hide and not row['selectedCandidateIds']:continue
            a,b,c=row['metricLine'];hits=[]
            bounds=[(center[0]-span,center[0]+span),(center[1]-span,center[1]+span)]
            if b:
                for x in bounds[0]:
                    y=-(a*x+c)/b
                    if bounds[1][0]<=y<=bounds[1][1]:hits.append([x,y])
            if a:
                for y in bounds[1]:
                    x=-(b*y+c)/a
                    if bounds[0][0]<=x<=bounds[0][1]:hits.append([x,y])
            distinct=[]
            for hit in hits:
                if hit not in distinct:distinct.append(hit)
            if len(distinct)<2:continue
            t=row['distanceFromCenter']/maximum;unselected=f'rgb({round(255*(1-t))},255,{round(255*t)})'
            if not hide:output.append(line(distinct[0],distinct[-1],f'data-plane-id="{esc(row["planeId"])}" stroke="{unselected}" stroke-width=".8"'))
            for candidate_id in row['selectedCandidateIds']:
                color,alpha=_paint_color(selected[candidate_id]['sourceColor'])
                output.append(line(distinct[0],distinct[-1],f'data-plane-id="{esc(row["planeId"])}" data-candidate-id="{esc(candidate_id)}" stroke="{color}" stroke-opacity="{alpha:.12g}" stroke-width="2.5"'))
        cx,cy=xy([0,0]);output.append(f'<circle data-role="source-center" cx="{cx:.12g}" cy="{cy:.12g}" r="5" fill="#318bd8"/>')
    if not (p['hide_vertices_when_selected'] and selected):
        for vertex,point in points.items():
            x,y=xy(point);output.append(f'<circle data-source-vertex-id="{vertex}" cx="{x:.12g}" cy="{y:.12g}" r="3" fill="#fff" stroke="#344054"/>')
    infinite=[r['sourceVertexId'] for r in checked['vertices'] if r.get('status')=='at-infinity']
    warning='At infinity: '+','.join(map(str,infinite)) if infinite else ''
    if not checked['presentationComplete']:warning+='; finite paint omissions: see exact receipt'
    output.append(f'<text data-role="projection-diagnostics" x="12" y="{height-12}" font-size="11">{esc(warning)}</text></svg>')
    svg='\n'.join(output)
    if len(svg.encode('utf-8'))>LIMITS['svgBytes']:raise GeometryError('SVG diagram exceeds its output bound.')
    return svg
