"""Read-only bounded numerical verification of a literal convex boundary.

The hull is a reference, never a replacement model. Ordered source incidence
must match in full. Hyperplane convention follows SciPy's primary documentation:
https://docs.scipy.org/doc/scipy/reference/spatial.html
"""
from collections import Counter
from copy import deepcopy
import math

import numpy as np

from .compounds import _check_source, MAX_PAYLOAD_BYTES
from .geometry import GeometryError, TOLERANCE, hull, identity

VERSION = '0.1.0'
# Four-dimensional reference reconstruction forms facet pairs. The upper bound
# is deliberately smaller than the 3D bound to limit its worst-case memory.
MAX_REFERENCE_VERTICES = {2:2048, 3:2048, 4:64}


def _cycle(face):
    """Exact rotation/reversal key in linear space; validated IDs are unique."""
    forward=tuple(face);reverse=forward[::-1]
    first=forward.index(min(forward));last=reverse.index(min(reverse))
    return min(forward[first:]+forward[:first],reverse[last:]+reverse[:last])


def analyze_convex_boundary(model):
    """Return numerical support evidence or explicit rejection diagnostics.

    Status is passed, non-convex, invalid, unsupported or unresolved. Convex is
    true only for passed. No source arrays, attributes, caches or flags change.
    Collinear subdivisions, triangulated coplanar facets, duplicate coordinate
    IDs and nonextreme source points are unsupported in this initial domain.
    """
    result={'status':'invalid','convex':False,'sourceModelId':None,'sourceFingerprint':None,
            'algorithmVersion':VERSION,'numeric':{'mode':'float64-approximate','certified':False,'tolerance':TOLERANCE},
            'checks':[],'diagnostics':[],'facetSupports':[],
            'resourceBounds':{'referenceVerticesByDimension':dict(MAX_REFERENCE_VERTICES),'sourcePayloadBytes':MAX_PAYLOAD_BYTES},
            'evidenceScope':'literal source geometry only; verify sourceFingerprint before applying support evidence'}
    def fail(status,message,**details):
        result['status']=status;result['diagnostics'].append({'message':message,**details});return result
    try:
        dimension,embedding,_,_=_check_source(model)
    except (GeometryError,TypeError,ValueError,KeyError,ArithmeticError,AttributeError,RecursionError) as exc:
        return fail('invalid','Source model validation failed: '+str(exc))
    result['sourceModelId']=deepcopy(model.get('id'));result['sourceFingerprint']=identity(model)
    result['checks'].append('source validation and finite bounded JSON coordinates/incidence')
    if embedding!=dimension:
        return fail('unsupported','Classification requires intrinsic coordinates: embedding dimension must equal source dimension.')
    if dimension<4 and model.get('cells'):
        return fail('unsupported','A lower-dimensional convex boundary cannot include a source cell table.')
    count=len(model['vertices']);limit=MAX_REFERENCE_VERTICES[dimension]
    if count>limit:
        return fail('unsupported','Reference hull vertex budget exceeded; no boundary promotion is asserted.',sourceVertices=count,limit=limit)
    points=np.asarray(model['vertices'],dtype=float)
    if len(set(map(tuple,points)))!=count:
        return fail('unsupported','Duplicate or unresolved coordinate IDs require welding; classification never welds source vertices.')
    scale=float(np.max(np.ptp(points,axis=0)));origin=points[0].copy()
    normalized=(points-origin)/scale if scale else points-origin
    if not scale or np.linalg.matrix_rank(normalized,TOLERANCE)!=dimension:
        return fail('invalid','Coordinates do not resolve the full intrinsic affine dimension at relative float64 tolerance.')
    # Unit-size verification prevents an unused hull-volume calculation from
    # overflowing/underflowing on otherwise valid literal source scales.
    try:
        reference=hull(normalized.tolist(),'Convex boundary verification reference')
    except (GeometryError,ValueError,OverflowError,np.linalg.LinAlgError) as exc:
        return fail('unresolved','Reference hull predicates could not resolve this boundary: '+str(exc))
    retained=reference['provenance']['extremeInputIndices']
    if retained!=list(range(count)):
        return fail('unsupported','The hull does not retain every source vertex; nonextreme/collinear refinements are outside this verification domain.',
                    omittedSourceVertexIds=sorted(set(range(count))-set(retained)))
    if reference['vertices']!=normalized.tolist():
        return fail('unresolved','Reference hull changed retained coordinates or ordering; source vertices cannot be substituted.')
    result['checks'].append('every original vertex retained with exact normalized coordinate and ID correspondence')
    source_faces=Counter(_cycle(face) for face in model['faces'])
    reference_faces=Counter(_cycle(face) for face in reference['faces'])
    if source_faces!=reference_faces:
        # Genuine facet triangulation is deliberately unsupported. Never label
        # a bow-tie/star permutation as refinement merely from its point set.
        source_sets=[set(face) for face in model['faces']]
        reference_sets=[set(face) for face in reference['faces']]
        ordinary_refinement=(len(source_sets)>len(reference_sets)
            and all(any(vertices<=facet for facet in reference_sets) for vertices in source_sets)
            and all(any(_cycle(face)==_cycle(reference_face) for reference_face in reference['faces'])
                    or len(face)==3 for face in model['faces']))
        if ordinary_refinement:
            return fail('unsupported','Coplanar facet subdivisions/triangulations differ from the unsplit hull boundary; source incidence is not simplified.')
        return fail('non-convex','Ordered source face cycles do not match the convex reference boundary, including multiplicity; star or bow-tie order is not replaced.',
                    sourceFaces=len(model['faces']),referenceFaces=len(reference['faces']))
    result['checks'].append('complete ordered face cycles match exactly up to cyclic rotation and reversal')
    source_edges={tuple(sorted(edge)) for edge in model['edges']}
    reference_edges={tuple(sorted(edge)) for edge in reference['edges']}
    if source_edges!=reference_edges:
        return fail('non-convex','Source edge set differs from the complete convex reference boundary.',
                    missingEdges=[list(edge) for edge in sorted(reference_edges-source_edges)],
                    extraEdges=[list(edge) for edge in sorted(source_edges-reference_edges)])
    result['checks'].append('complete source edge set matches exactly')
    source_face_ids={_cycle(face):i for i,face in enumerate(model['faces'])}
    reference_face_to_source=[source_face_ids[_cycle(face)] for face in reference['faces']]
    reference_cells=[tuple(sorted(reference_face_to_source[f] for f in cell)) for cell in reference['cells']]
    if dimension==4:
        if Counter(tuple(sorted(cell)) for cell in model['cells'])!=Counter(reference_cells):
            return fail('non-convex','Complete source cell face-membership differs from the convex boundary; matching cell vertex sets alone is insufficient.')
        result['checks'].append('every 4D cell matches complete source face-membership exactly')
    elif model.get('cells'):
        return fail('unsupported','Unexpected cells in a lower-dimensional boundary.')
    facet_kind={2:'edges',3:'faces',4:'cells'}[dimension]
    if dimension==2:
        facet_ids={frozenset(edge):i for i,edge in enumerate(model['edges'])}
        reference_facet_ids=[facet_ids[frozenset(vertices)] for vertices in reference['facetVertices']]
    elif dimension==3:
        reference_facet_ids=reference_face_to_source
    else:
        cell_ids={tuple(sorted(cell)):i for i,cell in enumerate(model['cells'])}
        reference_facet_ids=[cell_ids[cell] for cell in reference_cells]
    supports=[];world_tolerance=4*TOLERANCE*scale
    for source_facet_id,vertices,equation in zip(reference_facet_ids,reference['facetVertices'],reference['facetEquations']):
        normal=np.asarray(equation[:-1],dtype=float);length=float(np.linalg.norm(normal))
        normal=normal/length;offset=float(equation[-1])/length
        world_offset=float(offset*scale-np.dot(normal,origin))
        world_equation=[float(x) for x in normal]+[world_offset]
        stable_residual=normalized@normal+offset
        world_residual=points@normal+world_offset
        incident=max(float(abs(world_residual[i])) for i in vertices)
        maximum=float(np.max(world_residual))
        if not all(math.isfinite(value) for value in world_equation) or maximum>world_tolerance or incident>world_tolerance:
            return fail('unresolved','Mapped source supporting plane is unresolved at the relative float64 tolerance; no support table is published.',sourceFacetId=source_facet_id)
        if float(np.max(stable_residual))>4*TOLERANCE or max(float(abs(stable_residual[i])) for i in vertices)>4*TOLERANCE:
            return fail('unresolved','Reference supporting plane agreement is unresolved.')
        supports.append({'sourceFacetKind':facet_kind,'sourceFacetId':source_facet_id,'vertexIds':list(vertices),
                         'equation':world_equation,'normalizedEquation':[float(x) for x in normal]+[offset],
                         'maximumSourceResidual':maximum,'maximumIncidentAbsoluteResidual':incident,'tolerance':world_tolerance})
    if len(supports)!=len(model[facet_kind]) or {record['sourceFacetId'] for record in supports}!=set(range(len(model[facet_kind]))):
        return fail('unresolved','Reference supports do not cover all source facets exactly once.')
    result['checks'].append('finite supporting planes cover every source facet and enclose every source vertex within tolerance')
    result.update(status='passed',convex=True,facetSupports=sorted(supports,key=lambda record:record['sourceFacetId']))
    result['normalization']={'origin':origin.tolist(),'scale':scale}
    result['reference']={'algorithm':'Qhull + complete supporting incidence','algorithmVersion':reference['provenance']['algorithmVersion'],
                         'fingerprint':identity(reference),'counts':{kind:len(reference[kind]) for kind in ('vertices','edges','faces','cells')}}
    return result
