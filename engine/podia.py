"""Literal unequal-radius podium and antipodium boundaries; no convexification.

The four geometric sizing modes follow the published podium/antipodium manuals.
The signed ring alignment and incidence below are our explicit definition, not
an assertion of undocumented Stella conventions or its vertex-figure mode.
"""
from collections import Counter
from copy import deepcopy
import math
import uuid

import numpy as np

from .antiprisms import _positive, _snapshot_hash
from .compounds import (_colors, _payload_size, KINDS, MAX_COMPONENTS,
                        MAX_COORDINATE, MAX_ELEMENTS, MAX_FACE_VERTICES,
                        MAX_INCIDENCES, MAX_PAYLOAD_BYTES)
from .geometry import GeometryError, TOLERANCE, identity, validate
from .star_polygons import _pair, parse_polygon_symbol, regular_star_polygon

VERSION = '0.1.0'
MAX_PODIA_VERTICES = 4000


def rational_podium(n=None, d=None, *, symbol=None, base_radius=None,
                    top_radius=None, base_edge=None, top_edge=None,
                    height=None, side_edge=None, cap_colors=None):
    """Aligned rings with planar literal quadrilateral walls.

    Supply a complete radius pair OR edge-length pair, and height OR side_edge.
    Default polygon is 3/1. cap_colors is one RGB/RGBA record or null per cycle,
    copied independently to both source rings and caps; walls are uncolored.
    """
    return _construct(False, n, d, symbol, base_radius, top_radius, base_edge,
                      top_edge, height, side_edge, cap_colors)


def rational_antipodium(n=None, d=None, *, symbol=None, base_radius=None,
                        top_radius=None, base_edge=None, top_edge=None,
                        height=None, side_edge=None, cap_colors=None):
    """Raw signed pi*d/n top rotation with two connecting triangles per step."""
    return _construct(True, n, d, symbol, base_radius, top_radius, base_edge,
                      top_edge, height, side_edge, cap_colors)


def _construct(anti, n, d, symbol, base_radius, top_radius, base_edge,
               top_edge, height, side_edge, cap_colors):
    if symbol is not None:
        if n is not None or d is not None:
            raise GeometryError('Use a literal polygon symbol or integer n/d parameters, not both.')
        parsed = parse_polygon_symbol(symbol)
        n, d = parsed['n'], parsed['d']
    else:
        n, d = _pair(3 if n is None else n, 1 if d is None else d)
    radii = base_radius is not None or top_radius is not None
    lengths = base_edge is not None or top_edge is not None
    if radii == lengths or (radii and (base_radius is None or top_radius is None)) or (lengths and (base_edge is None or top_edge is None)):
        raise GeometryError('Specify exactly one complete base/top radius pair or base/top edge-length pair.')
    if (height is None) == (side_edge is None):
        raise GeometryError('Specify exactly one height or side edge length.')
    theta = math.pi*d/n if anti else 0.0
    edge_unit = 2*abs(math.sin(math.pi*d/n))
    if radii:
        rb, rt = _positive(base_radius, 'Base radius'), _positive(top_radius, 'Top radius')
    else:
        rb = _positive(_positive(base_edge, 'Base edge length')/edge_unit, 'Computed base radius')
        rt = _positive(_positive(top_edge, 'Top edge length')/edge_unit, 'Computed top radius')
    eb, et = _positive(rb*edge_unit, 'Resolved base edge length'), _positive(rt*edge_unit, 'Resolved top edge length')
    # Evaluate q/scale without squaring large radii or multiplying tiny ones.
    scale = max(rb, rt)
    br, tr = rb/scale, rt/scale
    q = scale*math.hypot(br-tr, 2*math.sqrt(br)*math.sqrt(tr)*abs(math.sin(theta/2))) if anti else abs(rb-rt)
    if height is not None:
        h = _positive(height, 'Height')
        side = _positive(math.hypot(q, h), 'Resolved side edge length')
    else:
        side = _positive(side_edge, 'Side edge length')
        if side-q <= 4*max(math.ulp(side), math.ulp(q)):
            raise GeometryError('Side edge must resolvably exceed horizontal ring separation; no real positive height can be resolved.')
        ratio = q/side
        h = _positive(side*math.sqrt((1-ratio)*(1+ratio)), 'Computed height')
    g = math.gcd(n, abs(d))
    edge_count, face_count = (4*n, 2*n+2*g) if anti else (3*n, n+2*g)
    refs = 6*n+2*edge_count+2*n+(6*n if anti else 4*n)
    if 2*n > MAX_PODIA_VERTICES or max(edge_count, face_count) > MAX_ELEMENTS or refs > MAX_INCIDENCES or g > MAX_COMPONENTS or n//g > MAX_FACE_VERTICES:
        raise GeometryError('Podia vertex/incidence/component resource limit exceeded.')
    if cap_colors is not None:
        if type(cap_colors) is not list or len(cap_colors) != g:
            raise GeometryError('Cap colors require one OFF color record or null per source cycle.')
        # Bound traversal before deepcopy/serialization of optional attributes.
        from .history import _json_bytes
        try:
            _json_bytes(cap_colors, MAX_PAYLOAD_BYTES)
        except (UnicodeError, OverflowError) as exc:
            raise GeometryError('Podia cap attributes require bounded finite UTF-8 JSON data.') from exc
        # Native internal tuples are accepted by the shared JSON guard, but
        # public attributes must already be plain JSON: retaining a tuple or
        # numeric subclass would change the complete snapshot after reopening.
        pending = [cap_colors]
        while pending:
            item = pending.pop()
            if type(item) is dict:
                pending.extend(item.values())
            elif type(item) is list:
                pending.extend(item)
            elif type(item) not in (str, int, float, bool, type(None)):
                raise GeometryError('Podia cap attributes require plain JSON values.')
    sources = [regular_star_polygon(n, d, radius) for radius in (rb, rt)]
    if cap_colors is not None:
        for source in sources:
            source['metadata']['offColors'] = {'faces': deepcopy(cap_colors), 'cells': []}
    source_colors = [_colors(source, 'faces') for source in sources]
    source_bytes = sum(_payload_size(source) for source in sources)
    # Two preserved factors, two current cap color tables, one parameter copy.
    # Reject an already impossible aggregate before constructing/copying output.
    if source_bytes+3*_payload_size(cap_colors)>MAX_PAYLOAD_BYTES:
        raise GeometryError('Podia source snapshot payload resource limit exceeded.')
    base, top = sources
    cosine, sine = math.cos(theta), math.sin(theta)
    vertices = [list(p)+[-h/2] for p in base['vertices']]+[[cosine*x-sine*y, sine*x+cosine*y, h/2] for x,y in top['vertices']]
    if any(not math.isfinite(x) or abs(x)>MAX_COORDINATE for point in vertices for x in point):
        raise GeometryError('Podia coordinates exceed the finite 1e100 bound.')
    edges = deepcopy(base['edges'])+[[a+n,b+n] for a,b in top['edges']]
    faces = [list(reversed(face)) for face in base['faces']]+[[v+n for v in face] for face in top['faces']]
    colors = deepcopy(source_colors[0])+deepcopy(source_colors[1])
    maps = {'vertices': [{'role':'ring-vertex','sourceIndex':i//n,'sourceVertexId':i%n} for i in range(2*n)],
            'edges':[{'role':'ring-edge','sourceIndex':i//n,'sourceEdgeId':i%n} for i in range(2*n)],
            'faces':[{'role':'cap','sourceIndex':i//g,'sourceFaceId':i%g} for i in range(2*g)],'cells':[]}
    edge_lookup = {tuple(sorted(edge)):i for i,edge in enumerate(base['edges'])}
    owners = {v:i for i,face in enumerate(base['faces']) for v in face}
    lateral_edges = [[] for _ in range(g)]
    lateral_faces = [[] for _ in range(g)]
    if anti:
        for i in range(n):
            following = (i+d)%n
            eid, owner = edge_lookup[tuple(sorted((i,following)))], owners[i]
            lateral_edges[owner].extend([len(edges),len(edges)+1])
            edges.extend([[i,i+n],[following,i+n]])
            maps['edges'].extend([{'role':'connecting-edge','baseSourceVertexId':i,'topSourceVertexId':i},
                                  {'role':'connecting-edge','baseSourceVertexId':following,'topSourceVertexId':i}])
            lateral_faces[owner].extend([len(faces),len(faces)+1])
            faces.extend([[i,following,i+n],[i+n,following,following+n]])
            maps['faces'].extend([{'role':'connecting-triangle','sourceEdgeId':eid,'sourceFaceId':owner,'baseLayer':0,'oppositeSourceVertexId':i},
                                  {'role':'connecting-triangle','sourceEdgeId':eid,'sourceFaceId':owner,'baseLayer':1,'oppositeSourceVertexId':following}])
            colors.extend([None,None])
    else:
        for i in range(n):
            lateral_edges[owners[i]].append(len(edges))
            edges.append([i,i+n])
            maps['edges'].append({'role':'connecting-edge','baseSourceVertexId':i,'topSourceVertexId':i})
        for owner,cycle in enumerate(base['faces']):
            for a,b in zip(cycle,cycle[1:]+cycle[:1]):
                lateral_faces[owner].append(len(faces))
                faces.append([a,b,b+n,a+n])
                maps['faces'].append({'role':'connecting-quad','sourceEdgeId':edge_lookup[tuple(sorted((a,b)))],'sourceFaceId':owner})
                colors.append(None)
    partitions = []
    for owner,cycle in enumerate(base['faces']):
        owned = set(cycle)
        source_edges = [i for i,(a,b) in enumerate(base['edges']) if a in owned and b in owned]
        partitions.append({'id':f'partition-{owner}','sourceFaceIds':[owner,owner],
            'sourceComponentIds':[s.get('components',[{}]*g)[owner].get('id') for s in sources],
            'maps':{'vertices':sorted(owned|{i+n for i in owned}),
                    'edges':sorted(source_edges+[i+n for i in source_edges]+lateral_edges[owner]),
                    'faces':sorted([owner,owner+g]+lateral_faces[owner]),'cells':[]}})
    operation, key = ('rational-antipodium','rationalAntipodium') if anti else ('rational-podium','rationalPodium')
    inputs = {'n':n,'d':d,'base_radius':base_radius,'top_radius':top_radius,'base_edge':base_edge,'top_edge':top_edge,'height':height,'side_edge':side_edge,'cap_colors':deepcopy(cap_colors)}
    if symbol is not None:
        inputs.pop('n');inputs.pop('d');inputs['symbol']=symbol
    info = {'schemaVersion':1,'algorithmVersion':VERSION,'symbol':f'{n}/{d}','n':n,'d':d,
            'upperRotationRadians':theta,'rotationDefinition':'raw signed pi*d/n, not principal winding' if anti else 'aligned angular source IDs; zero rotation',
            'baseRadius':rb,'topRadius':rt,'baseEdgeLength':eb,'topEdgeLength':et,'height':h,'sideEdgeLength':side,'horizontalSideSeparation':q,
            'ringSizing':'radii' if radii else 'edge-lengths','sideSizing':'height' if height is not None else 'side-edge',
            'sourceModels':deepcopy(sources),
            'sourceEmbedding':[{'rotationRadians':0.0,'axialCoordinate':-h/2},
                               {'rotationRadians':theta,'axialCoordinate':h/2}],
            'inputs':[{'sourceModelId':s['id'],'sourceFingerprint':identity(s),'sourceSnapshotSha256':_snapshot_hash(s)} for s in sources],
            'orderedSourceCycles':deepcopy(base['faces']),'maps':maps,
            'sourceMaps':[{'vertices':[[i+layer*n] for i in range(n)],'edges':[[i+layer*n] for i in range(n)],'faces':[[i+layer*g] for i in range(g)],'cells':[]} for layer in (0,1)],
            'componentPartitions':partitions,'recoverableCompoundComponents':False,
            'componentDefinition':'metadata-only disjoint current incidence; full 3D leaf snapshots required before compound Keep/Delete',
            'colorPolicy':'Source-cycle RGB/RGBA copied independently to both caps; lateral faces uncolored.',
            'sideEdgeFeasibilityRule':'side-q > 4*max(ulp(side),ulp(q)); all normalized faces and full rank must remain resolved',
            'sizingEquations':{'ringEdge':'2*radius*abs(sin(pi*d/n))','horizontalSideSeparation':'hypot(Rb-Rt,2*sqrt(Rb*Rt)*abs(sin(pi*d/(2*n))))' if anti else 'abs(Rb-Rt)','sideEdge':'hypot(horizontalSideSeparation,height)'},
            'measureDefinition':'Literal boundary only; no solid, star filled volume, hull, weld or union inference.'}
    model = {'id':str(uuid.uuid4()),'name':f'{"Antipodium" if anti else "Podium"} {n}/{d}',
        'dimension':3,'embeddingDimension':3,'interpretation':'generalized-complex',
        'vertices':vertices,'edges':edges,'faces':faces,'cells':[],
        'numeric':{'mode':'float64-approximate','certified':False,'tolerance':TOLERANCE,'algorithm':'literal unequal-radius angular rings and ordered direct incidence'},
        'provenance':{'operation':operation,'algorithmVersion':VERSION,'parameters':inputs,'definition':info['rotationDefinition']+'; no convexification'},
        'metadata':{'family':'Antipodium' if anti else 'Podium',key:info}}
    if any(color is not None for color in colors):
        model['metadata']['offColors'] = {'faces':colors,'cells':[]}
    p = np.asarray(vertices,dtype=float)
    extent = float(np.max(np.ptp(p,axis=0)))
    normalized = (p-p[0])/extent if extent else p-p[0]
    model['numeric']['predicateScale'] = extent
    if not extent or np.linalg.matrix_rank(normalized,TOLERANCE)!=3:
        raise GeometryError('Podia numeric degeneracy: full 3D rank is unresolved at relative float64 tolerance.')
    report = validate(model)
    if not report['passed']:
        raise GeometryError('Podia numeric/incidence validation failed: '+'; '.join(report['errors']))
    boundary = Counter(tuple(sorted((a,b))) for face in faces for a,b in zip(face,face[1:]+face[:1]))
    if set(boundary)!={tuple(sorted(edge)) for edge in edges} or any(count!=2 for count in boundary.values()):
        raise GeometryError('Podia boundary edges require exactly two source face incidences.')
    for kind in KINDS:
        ownership = Counter(i for part in partitions for i in part['maps'][kind])
        if set(ownership)!=set(range(len(model[kind]))) or any(count!=1 for count in ownership.values()):
            raise GeometryError('Podia component partitions must cover current incidence exactly once.')
    for part in partitions:
        if len(part['maps']['vertices'])-len(part['maps']['edges'])+len(part['maps']['faces'])!=2:
            raise GeometryError('Podia boundary partition Euler relation failed.')
    for i,(a,b) in enumerate(edges):
        expected = eb if i<n else et if i<2*n else side
        if not math.isclose(math.dist(vertices[a],vertices[b]),expected,rel_tol=TOLERANCE,abs_tol=0):
            raise GeometryError('Podia edge metric agreement is unresolved at float64 tolerance.')
    model['validation'],model['fingerprint'] = report,identity(model)
    info['resultSourceModelId'],info['resultSourceFingerprint'] = model['id'],model['fingerprint']
    info['evidenceScope'] = 'generated source only; current incidence and metrics bound to resultSourceFingerprint'
    if _payload_size(model)>MAX_PAYLOAD_BYTES:
        raise GeometryError('Podia payload resource limit exceeded, including both source snapshots and maps.')
    return model
