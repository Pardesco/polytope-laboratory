"""Pinned, numerical specialized-corpus receipts; no release coverage promotion."""
from collections import Counter, defaultdict
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import numpy as np
from .geometry import GeometryError, identity, validate, canonical_cycle

VERSION='0.1.0'
DATA=Path(__file__).resolve().parent/'catalog_data/classification'
KINDS=('vertices','edges','faces','cells')
TOL=1e-7


def digest(value):
    return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':'),allow_nan=False).encode()).hexdigest()


def binding(model):
    return {'fingerprint':identity(model),'coordinatesSha256':digest(model['vertices']),
        'incidenceSha256':digest({k:model[k] for k in KINDS[1:]}),
        'counts':[len(model[k]) for k in KINDS]}


def require(ok,message):
    if not ok:raise GeometryError('Classification qualification: '+message)


def checked(model):
    require(type(model) is dict and model.get('dimension') in (3,4),'intrinsic 3D/4D geometry required.')
    require(model.get('embeddingDimension')==model['dimension'],'embedded lower-dimensional sources unsupported.')
    require(all(type(model.get(k)) is list and len(model[k])<=10000 for k in KINDS),'source exceeds entity bounds.')
    require(4<=len(model['vertices'])<=2048,'source requires 4..2048 vertices.')
    require(sum(len(r) for k in KINDS for r in model[k])<=150000,'source exceeds incidence bound.')
    require(validate(model)['passed'],'source incidence/geometry is invalid.')
    return np.asarray(model['vertices'],dtype=float)


def metric_checks(model):
    p=checked(model);lengths=np.asarray([np.linalg.norm(p[a]-p[b]) for a,b in model['edges']])
    scale=float(lengths.mean());require(scale>0,'zero mean edge length.')
    edge=float(np.max(abs(lengths/scale-1)));planarity=0.;regularity=0.;sphere=0.
    for f in model['faces']:
        q=p[f]/scale;delta=q-q.mean(axis=0);_,s,vt=np.linalg.svd(delta,full_matrices=False)
        planarity=max(planarity,float(s[2]) if len(s)>2 else 0.)
        xy=delta@vt[:2].T;r=np.linalg.norm(xy,axis=1)
        angles=np.arctan2(xy[:,1],xy[:,0]);steps=(np.roll(angles,-1)-angles+np.pi)%(2*np.pi)-np.pi
        # Common signed angular step admits ordinary polygons and ordered stars.
        regularity=max(regularity,float(np.ptp(r)/max(r.mean(),1e-100)),float(np.ptp(steps)))
    for ids in model['faces']+[sorted({v for f in c for v in model['faces'][f]}) for c in model['cells']]:
        q=p[ids]/scale;delta=q-q.mean(axis=0)
        center=np.linalg.lstsq(2*delta,np.sum(delta*delta,axis=1),rcond=None)[0]
        radii=np.linalg.norm(delta-center,axis=1)
        sphere=max(sphere,float(np.ptp(radii)/max(radii.mean(),1e-100)))
    return {'maximumRelativeEdgeDeviation':edge,'maximumFacePlanarity':planarity,
        'maximumFaceRegularityResidual':regularity,'maximumElementSphereRelativeSpread':sphere,
        'tolerance':TOL,'certified':False}


def symmetry_checks(model):
    from .symmetry import geometric_symmetry
    s=geometric_symmetry(model)
    require(s['complete'] and s['closureVerified'],'complete numerical symmetry traversal required.')
    return {'order':s['order'],'properOrder':s['properOrder'],'vertexOrbits':len(s['entityOrbits']['vertex']),
        'closureVerified':True,'chirality':'numerically chiral' if s['order']==s['properOrder'] else 'numerically achiral',
        'convention':'Supplied coordinates retained; no absolute left/right designation.','certified':False}


def surface_checks(model):
    from .specialized_catalog import boundary_parts, surface_topology
    parts=boundary_parts(model)
    return [surface_topology(model['vertices'],[model['faces'][f] for f in ids]) for ids in parts]


def qualify_dual(source,dual):
    p=checked(source);q=checked(dual);center=p.mean(axis=0)
    require([len(dual[k]) for k in KINDS[:3]]==[len(source['faces']),len(source['edges']),len(p)],'dual rank counts differ.')
    require(all(set(dual['faces'][v])=={f for f,cycle in enumerate(source['faces']) if v in cycle} for v in range(len(p))),
        'dual faces must retain all incident source face IDs.')
    edge_faces=defaultdict(list)
    for f,cycle in enumerate(source['faces']):
        for a,b in zip(cycle,cycle[1:]+cycle[:1]):edge_faces[tuple(sorted((a,b)))].append(f)
    expected=Counter(tuple(sorted(fs)) for fs in edge_faces.values())
    require(expected==Counter(tuple(sorted(e)) for e in dual['edges']),'dual edge correspondence differs.')
    residual=max(abs(float((q[f]-center)@(p[v]-center))-1) for f,face in enumerate(source['faces']) for v in face)
    from .incidence_dual import incidence_dual
    reverse=incidence_dual(dual,center=center.tolist(),radius=1)
    involution=float(np.max(np.abs(np.asarray(reverse['vertices'])-p)))
    require(residual<=TOL and involution<=TOL*max(1,float(np.max(np.ptp(p,axis=0)))),'polarity/involution residual exceeds tolerance.')
    return {'maximumPolarityResidual':residual,'maximumInvolutionCoordinateResidual':involution,
        'edgeCorrespondence':True,'allVertexFaceIncidences':True,'sourceTopology':surface_checks(source),
        'dualTopology':surface_checks(dual),'center':center.tolist(),'radius':1,'tolerance':TOL,
        'uniquenessScope':'Unique plane reciprocal for the declared source center/radius and literal incidence; up to the chosen reciprocal scale.',
        'certified':False}


def component_checks(model,expected):
    checked(model);components=model.get('components',[])
    require(len(components)==expected,'constituent count differs.')
    from .geometry import hull
    for kind in KINDS:
        require(sorted(i for c in components for i in c['maps'][kind])==list(range(len(model[kind]))),'constituent ownership is not a partition.')
    for c in components:
        vs=c['maps']['vertices'];reverse={v:i for i,v in enumerate(vs)}
        ref=hull(np.asarray(model['vertices'])[vs])
        fs=[canonical_cycle([reverse[v] for v in model['faces'][f]]) for f in c['maps']['faces']]
        require(Counter(fs)==Counter(canonical_cycle(f) for f in ref['faces']),'constituent differs from independent convex boundary.')
        if model['dimension']==4:
            keys={f:canonical_cycle([reverse[v] for v in model['faces'][f]]) for f in c['maps']['faces']}
            actual=Counter(tuple(sorted(keys[f] for f in model['cells'][i])) for i in c['maps']['cells'])
            wanted=Counter(tuple(sorted(canonical_cycle(ref['faces'][f]) for f in cell)) for cell in ref['cells'])
            require(actual==wanted,'constituent cell incidence differs from independent convex boundary.')
    counts=Counter(tuple(float(x) for x in p) for p in model['vertices'])
    return {'componentCount':len(components),'ownershipPartition':True,'independentConstituentHulls':True,
        'literalVertexCount':len(model['vertices']),'distinctCoordinateCount':len(counts),
        'coordinateMultiplicityHistogram':{str(k):n for k,n in sorted(Counter(counts.values()).items())},
        'coordinateComparison':'Literal binary64 tuples only; near-coincident coordinates remain distinct. No vertices are welded.',
        'welded':False,'certified':False}


def qualify(row):
    from .generators import regular
    if row['kind']=='missing-source':raise GeometryError(row['reason'])
    model=regular(row['sourceKey']);result={'source':binding(model),'certified':False,'releaseQualified':False}
    require(result['source']['counts']==row['counts'],'source differs from named incidence counts.')
    if row['kind']=='dual':
        metrics=metric_checks(model);symmetry=symmetry_checks(model)
        require(metrics['maximumRelativeEdgeDeviation']<=TOL and metrics['maximumFaceRegularityResidual']<=TOL
                and metrics['maximumFacePlanarity']<=TOL and symmetry['vertexOrbits']==1,'U source uniformity checks failed.')
        from .incidence_dual import incidence_dual
        dual=incidence_dual(model)
        result.update(sourceMetrics=metrics,sourceSymmetry=symmetry,relationship=qualify_dual(model,dual),generated=binding(dual))
    elif row['kind']=='near-miss':
        from .near_miss_catalog import deviation_metrics
        metrics=metric_checks(model);symmetry=symmetry_checks(model)
        require(metrics['maximumFacePlanarity']<=TOL,'near-miss source faces are nonplanar.')
        require(max(metrics['maximumRelativeEdgeDeviation'],metrics['maximumFaceRegularityResidual'])>TOL,'near-miss deviation not detected.')
        require(model['interpretation']=='convex-polytope','near-miss source is not a verified convex boundary.')
        result.update(metrics=metrics,deviations=deviation_metrics(model),symmetry=symmetry,topology=surface_checks(model),
            conclusion='This fitted realization deviates from regular faces/equal edges; no impossibility or global optimum is proved.')
    elif row['kind']=='stewart':
        from .stewart_checks import stewart_report
        report=stewart_report(model);require(report['classified'],'numerical Stewart R/A/Q/T/D checks failed.')
        require(report['T']['topology']['genus']==row['genus'],'source genus differs.')
        result.update(stewart=report,symmetry=symmetry_checks(model))
    elif row['kind']=='compound':
        result['components']=component_checks(model,row['componentCount'])
    elif row['kind']=='scaliform':
        metrics=metric_checks(model);symmetry=symmetry_checks(model)
        require(max(metrics[k] for k in ('maximumRelativeEdgeDeviation','maximumFacePlanarity','maximumElementSphereRelativeSpread'))<=TOL
                and symmetry['vertexOrbits']==1,'equal-edge, element-sphere or transitivity check failed.')
        uses=Counter(f for c in model['cells'] for f in c)
        require(set(uses)==set(range(len(model['faces']))) and set(uses.values())=={2},'ridge closure failed.')
        for cell in model['cells']:
            topology=surface_checks({**model,'faces':[model['faces'][f] for f in cell]})
            require(len(topology)==1 and topology[0]['closedVertexManifold'],'cell boundary closure failed.')
        inventory=Counter((len({v for f in c for v in model['faces'][f]}),len(c)) for c in model['cells'])
        require(sorted([list(key)+[n] for key,n in inventory.items()])==row['cellInventory'],'scaliform cell inventory differs.')
        result.update(metrics=metrics,symmetry=symmetry,cellInventory=row['cellInventory'],ridgeClosure=True,
            classificationScope='Equal edges, circumscribable elements and one vertex orbit; uniform cells and filled generalized interior are not asserted.')
    elif row['kind']=='regiment':
        from .operations import transform
        from .coincidic_regiments import compare_models
        other_source=regular(row['otherKey']);other_source['id']='classification:'+row['otherKey']
        other=transform(other_source,scale=row['otherScale'])
        other['id']='classification:'+row['id']+':comparison'
        report=compare_models(model,other)
        require(report['sameVertexArrangement'] and report['sameEdgeArrangement'] and not report['sameFaceArrangement']
                and not report['sameCellArrangement'],'named common skeleton/distinct topology relation failed.')
        result.update(other=binding(other),comparison=report)
    else:raise GeometryError('Unknown classification kind.')
    result['status']='numerical-pass'
    return result


def manifest(tranche):
    require(tranche in ('3d','4d'),'unknown tranche.')
    path=DATA/(tranche+'.json');require(path.stat().st_size<=4*1024*1024,'manifest exceeds 4 MiB.')
    value=json.loads(path.read_text(encoding='utf-8'))
    require(value.get('schemaVersion')==1 and value.get('tranche')==tranche and type(value.get('entries')) is list,'unsupported manifest.')
    require(len(value['entries'])<=256 and len({r['id'] for r in value['entries']})==len(value['entries']),'invalid entry IDs.')
    return value


def source_pins_current(value):
    root=DATA.parents[2]
    if value.get('algorithmVersion')!=VERSION:return False
    if not all((root/p).is_file() and hashlib.sha256((root/p).read_bytes()).hexdigest()==sha for p,sha in value['sourcePins'].items()):return False
    from .compound_catalog import compound_catalog
    from .scaliform4 import scaliform4_catalog
    from .compound4 import compound4_catalog
    from .polychoron_relationships import FISSARIES
    tables={'compound3':compound_catalog,'scaliform4':scaliform4_catalog,'compound4':compound4_catalog,'fissaryAcronyms':lambda:sorted(FISSARIES)}
    return all(key in tables and digest(tables[key]())==sha for key,sha in value['definitionPins'].items())


def report(params=None):
    params={} if params is None else params
    require(type(params) is dict and not set(params)-{'tranche','id','verify'},'options are tranche, id and verify only.')
    require(type(params.get('verify',False)) is bool,'verify must be boolean.')
    tranche=params.get('tranche','3d');value=manifest(tranche);current=source_pins_current(value)
    rows=deepcopy(value['entries'])
    for row in rows:
        row['recordedStatus']=row['receipt']['status'];row['status']='recorded-unchecked' if current else 'stale-provider'
        row['releaseQualified']=False
        if row['recordedStatus']!='numerical-pass':row['status']=row['recordedStatus']
    result={'schemaVersion':1,'tranche':tranche,'label':value['label'],'sourcePinsCurrent':current,'entries':rows,
        'scope':value['scope'],'unresolved':value['unresolved'],'releaseQualified':False}
    if 'id' in params:
        require(type(params['id']) is str,'id must be a named string.')
        row=next((r for r in rows if r['id']==params['id']),None);require(row is not None,'unknown named relationship.')
        result['entry']=row
        if params.get('verify'):
            require(current,'provider manifests changed; regenerate the qualification tranche.')
            try:
                receipt=qualify(row)
                for key in ('source','generated','other'):
                    if key in receipt:require(receipt[key]==row['receipt'].get(key),key+' geometry changed since the recorded receipt.')
                row['status']='numerical-pass';result['verification']=receipt
            except GeometryError as error:
                row['status']='unresolved';result['verification']={'status':'unresolved','reason':str(error),'certified':False}
    else:require(not params.get('verify'),'select a named relationship before verification.')
    return result


def dispatch_qualification(request):
    require(request.get('model') is None,'catalog qualification takes no model input.')
    return report(request.get('params',{}))
