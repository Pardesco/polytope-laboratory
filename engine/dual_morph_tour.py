"""Verify a tour target against an independently constructed finite polar."""
import numpy as np
from scipy.spatial import cKDTree
from .geometry import identity, canonical_cycle, validate
from .dual_morph_expansion import _clone, _require
from .dual_morph import prepare


def verify_dual_tour(source,target):
    target=_clone(target)
    _require(target.get('dimension')==source.get('dimension') and target.get('embeddingDimension',target.get('dimension'))==source.get('dimension') and validate(target)['passed'],'Morph-to-dual target has invalid dimension/incidence.')
    provenance=target.get('provenance',{})
    _require(type(provenance) is dict and provenance.get('operation') in ('dual','incidence-dual') and provenance.get('sourceFingerprint')==identity(source),
             'Morph to dual requires the next event to be a native dual of this source.')
    params=provenance.get('parameters',{})
    _require(type(params) is dict,'Native tour dual parameters must be a literal record.')
    settings={'version':1,'enabled':True,'method':'sizing','center':params.get('center'),'radius':params.get('radius',1),
              'ratio':0.,'duration':1.,'loop':False}
    _,prepared=prepare(source,settings,{'notes':'','unit':'model'});dual=prepared['descriptor']['dual']
    _require(all(len(target.get(k,[]))==len(dual[k]) for k in ('vertices','edges','faces','cells')),'Morph-to-dual target rank counts differ from the reciprocal.')
    P=np.asarray(dual['vertices']);Q=np.asarray(target['vertices'])
    scale=float(np.max(np.ptp(P,axis=0)));distance,mapping=cKDTree(Q).query(P)
    _require(np.max(distance)<=scale*1e-7 and len(set(mapping.tolist()))==len(P),'Morph-to-dual target coordinates differ from the finite reciprocal.')
    mapped_edges={tuple(sorted(mapping[e].tolist())) for e in dual['edges']}
    _require(mapped_edges=={tuple(sorted(e)) for e in target['edges']},'Morph-to-dual target edge incidence differs.')
    mapped_faces=[canonical_cycle(mapping[f].tolist()) for f in dual['faces']]
    target_faces=[canonical_cycle(f) for f in target['faces']]
    _require(set(mapped_faces)==set(target_faces) and len(set(target_faces))==len(target_faces),'Morph-to-dual target ordered face incidence differs.')
    lookup={f:i for i,f in enumerate(target_faces)};face_map=[lookup[f] for f in mapped_faces]
    _require({tuple(sorted(face_map[f] for f in c)) for c in dual['cells']}=={tuple(sorted(c)) for c in target['cells']},
             'Morph-to-dual target complete cell incidence differs.')
    return {'verified':True,'sourceFingerprint':identity(source),'targetFingerprint':identity(target),'settings':prepared['settings'],
            'maximumCoordinateResidual':float(np.max(distance)),'tolerance':scale*1e-7,'certified':False}


def dispatch_verify_dual_tour(request):
    _require(type(request) is dict and not set(request)-{'id','op','model','params'} and type(request.get('model')) is dict and
             type(request.get('params')) is dict and set(request['params'])=={'target'} and type(request['params']['target']) is dict,
             'Dual tour verification requires a native model and literal target model only.')
    return verify_dual_tour(request['model'],request['params']['target'])
