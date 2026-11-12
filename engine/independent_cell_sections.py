"""Bounded independent winding sections of closed oriented source 3-cells.

Cell sheets are kept separate. No global 4D interior or Boolean union is inferred.
"""

import hashlib
import math
import numpy as np
from .geometry import GeometryError, identity, validate, rank
from .filled_sections import filled_section, _Surface, EPS, COLORS

VERSION = '0.1.0-independent-cell-sections'
LIMITS = dict(
    vertices=2000,
    faces=512,
    cells=64,
    incidences=16000,
    outputVertices=30000,
    arrangementRegions=8192,
    densityTriangleVisits=5000000,
)


def _require(value, message):
    if not value:
        raise GeometryError('Independent winding cell section: ' + message)


def independent_cell_section(source, normal=None, offset=0, fill_rule='nonzero', density_threshold=1):
    _require(
        type(source) is dict
        and type(source.get('id')) is str
        and 1 <= len(source['id']) <= 128
        and type(source.get('name')) is str,
        'source needs a bounded native ID/name.',
    )
    _require(
        source.get('dimension') == 4
        and source.get('embeddingDimension', 4) == 4
        and source.get('interpretation') in ('generalized-complex', 'convex-polytope'),
        'requires intrinsic 4D source cells.',
    )
    _require(
        all(type(source.get(k)) is list for k in ('vertices', 'edges', 'faces', 'cells')),
        'source needs literal incidence arrays.',
    )
    _require(type(source.get('metadata', {})) is dict, 'source metadata must be an object.')
    _require(
        0 < len(source['cells']) <= LIMITS['cells']
        and len(source['vertices']) <= LIMITS['vertices']
        and len(source['faces']) <= LIMITS['faces'],
        'source exceeds the 2000-vertex / 512-face / 64-cell domain, or has no explicit cells.',
    )
    _require(
        all(type(F) is list for k in ('faces', 'cells') for F in source[k])
        and sum(map(len, source['faces'])) + sum(map(len, source['cells'])) <= LIMITS['incidences'],
        'source exceeds 16000 face/cell incidences.',
    )
    _require(
        all(
            type(P) is list and len(P) == 4 and all(type(x) in (int, float) and math.isfinite(x) for x in P)
            for P in source['vertices']
        ),
        'source needs finite literal 4D coordinates.',
    )
    _require(
        fill_rule in ('nonzero', 'even-odd', 'threshold')
        and type(density_threshold) is int
        and 1 <= density_threshold <= 100,
        'choose nonzero, even-odd, or threshold with integer k in 1–100.',
    )
    _require(validate(source)['passed'], 'source geometry/incidence failed native validation.')
    _require(
        source.get('fingerprint', identity(source)) == identity(source),
        'source fingerprint differs from literal geometry/incidence.',
    )
    _require(
        {f for C in source['cells'] for f in C} == set(range(len(source['faces']))),
        'unowned source faces are outside this cell-only domain.',
    )
    _require(
        {v for F in source['faces'] for v in F} == set(range(len(source['vertices']))),
        'unowned source vertices are outside this cell-only domain.',
    )
    normal = [0, 0, 0, 1] if normal is None else normal
    _require(
        type(normal) in (list, tuple)
        and len(normal) == 4
        and all(type(x) in (int, float) and math.isfinite(x) for x in normal)
        and any(normal),
        'plane normal needs four finite nonzero literal coefficients.',
    )
    _require(type(offset) in (int, float) and math.isfinite(offset), 'depth must be finite.')
    raw = np.asarray(source['vertices'], dtype=float)
    center = raw.mean(0)
    span = float(np.max(np.ptp(raw, axis=0)))
    _require(
        0 < span <= 1e90 and math.isfinite(span) and np.isfinite(center).all(),
        'source extent is unresolved or measures would overflow.',
    )
    p = (raw - center) / span
    n = np.asarray(normal, dtype=float)
    n /= max(abs(n))
    n /= np.linalg.norm(n)
    depth = (offset - float(center @ n)) / span
    distances = p @ n - depth
    _require(math.isfinite(depth), 'normalized depth is unresolved at this source scale.')
    _, _, vt = np.linalg.svd(n[None, :], full_matrices=True)
    basis = vt[1:].T
    origin = n * offset
    common = dict(
        normal=n.tolist(),
        offset=float(offset),
        origin=origin.tolist(),
        basis=basis.tolist(),
        sourceId=source['id'],
        semantics='independently positive-algebraic-volume oriented source cells; overlapping sheets remain separate; no global 4D interior',
        fillRule=fill_rule,
    )
    params = dict(
        normal=list(normal),
        offset=offset,
        fill_rule=fill_rule,
        density_threshold=density_threshold,
        section_domain='density',
        cell_orientation='independent',
    )
    vertices = []
    edges = []
    faces = []
    vertexRefs = []
    edgeRefs = []
    faceRefs = []
    densities = []
    boundary = []
    regions = []
    reports = []
    legend = []
    totals = dict(arrangementRegions=0, densityTriangleVisits=0)
    maxResidual = 0.0
    partitionResidual = 0.0
    usedEdges = set()
    contactEvents = []
    maxPlaneResidual = 0.0
    maxEmbeddingResidual = 0.0
    for c, C in enumerate(source['cells']):
        ids = sorted({v for f in C for v in source['faces'][f]})
        cloud = p[ids]
        cellCenter = cloud.mean(0)
        _, s, axes = np.linalg.svd(cloud - cellCenter, full_matrices=True)
        _require(len(s) >= 4 and s[2] > EPS * 16 and s[3] <= EPS * 16, f'cell {c} is not a planar full-rank 3-cell.')
        frame = axes[:3].T
        remap = {v: i for i, v in enumerate(ids)}
        cycles = [[remap[v] for v in source['faces'][f]] for f in C]
        localEdges = sorted({tuple(sorted((a, b))) for F in cycles for a, b in zip(F, F[1:] + F[:1])})
        usedEdges.update(tuple(sorted((ids[a], ids[b]))) for a, b in localEdges)
        local = dict(
            id='winding-cell-' + str(c),
            name='Source cell ' + str(c),
            dimension=3,
            embeddingDimension=3,
            interpretation='generalized-complex',
            vertices=((cloud - cellCenter) @ frame).tolist(),
            edges=list(map(list, localEdges)),
            faces=cycles,
            cells=[],
        )
        try:
            surface = _Surface(local)
        except GeometryError as error:
            raise GeometryError(
                f'Independent winding cell section: cell {c} orientation unavailable: {error}'
            ) from error
        _require(
            len(surface.report['components']) == 1,
            f'cell {c} has disconnected boundary sheets; this orientation domain requires one connected shell per cell.',
        )
        report = dict(
            sourceCell=c,
            sourceFaceIds=C[:],
            sourceVertexIds=ids,
            origin=(center + span * cellCenter).tolist(),
            basis=frame.tolist(),
            faceOrientationSigns=[r['orientationSign'] for r in surface.report['faces']],
            algebraicVolume=surface.report['measures']['orientedAlgebraicVolume'] * span**3,
        )
        reports.append(report)
        ds = distances[ids]
        if min(ds) > EPS * 16 or max(ds) < -EPS * 16:
            continue
        contacts = np.flatnonzero(abs(ds) <= EPS * 16)
        if not (min(ds) < -EPS * 16 and max(ds) > EPS * 16):
            _require(
                len(contacts) and rank(cloud[contacts]) <= 1,
                f'cell {c} has a coplanar face/cell contact; use Surface / convex for literal sheets, or move depth. No limiting fill is inferred.',
            )
            start = len(vertices)
            lookup = {int(v): start + i for i, v in enumerate(contacts)}
            _require(
                start + len(contacts) <= LIMITS['outputVertices'],
                'output exceeds 30000 vertices; no partial section is returned.',
            )
            tangentResidual = float(np.max(abs(raw[ids][contacts] @ n - offset)))
            maxPlaneResidual = max(maxPlaneResidual, tangentResidual)
            maxEmbeddingResidual = max(maxEmbeddingResidual, tangentResidual)
            vertices.extend(((raw[ids][contacts] - origin) @ basis).tolist())
            vertexRefs.extend([dict(cell=c, vertex=ids[v])] for v in contacts)
            tangentEdges = [[lookup[a], lookup[b]] for a, b in localEdges if a in lookup and b in lookup]
            edges.extend(tangentEdges)
            boundary.extend(tangentEdges)
            edgeRefs.extend([dict(cell=c)] for _ in tangentEdges)
            continue
        cut = frame.T @ n
        length = float(np.linalg.norm(cut))
        _require(length > EPS * 16, f'cell {c} cut is near parallel and unresolved.')
        if len(contacts):
            from .star_cell_contacts import transverse_cell_contact_section, VERSION as CONTACT_VERSION

            result = transverse_cell_contact_section(
                local, cut.tolist(), float((depth - cellCenter @ n) / length), fill_rule, density_threshold
            )
            contactIds = {ids[v] for v in contacts}
            contactEdges = {
                tuple(sorted((ids[a], ids[b]))) for a, b in localEdges if ids[a] in contactIds and ids[b] in contactIds
            }
            contactEvents.append(
                dict(
                    sourceCell=c,
                    sourceVertexIds=sorted(contactIds),
                    sourceEdgeIds=[i for i, E in enumerate(source['edges']) if tuple(sorted(E)) in contactEdges],
                    policy='transverse-open-region-fill',
                    algorithmVersion=CONTACT_VERSION,
                )
            )
        else:
            result = filled_section(
                local, cut.tolist(), float((depth - cellCenter @ n) / length), fill_rule, density_threshold
            )
        diagnostic = result['densityDiagnostics']
        maxResidual = max(maxResidual, diagnostic.get('maxIntegerResidual', 0))
        partitionResidual = max(partitionResidual, diagnostic.get('partitionResidual', 0))
        for key in totals:
            totals[key] += diagnostic.get(key, 0)
            _require(
                totals[key] <= LIMITS[key], f'aggregate {key} exceeds its work bound; no partial section is returned.'
            )
        legend.extend({**r, 'sourceCell': c, 'content': r['content'] * span**2} for r in result['densityLegend'])
        if not result.get('model'):
            continue
        model = result['model']
        embedding = model['metadata']['sectionEmbedding']
        localPoints = np.asarray(embedding['origin']) + np.asarray(model['vertices']) @ np.asarray(embedding['basis']).T
        world = center + span * (cellCenter + localPoints @ frame.T)
        start = len(vertices)
        firstFace = len(faces)
        maxPlaneResidual = max(maxPlaneResidual, float(np.max(abs(world @ n - offset))))
        maxEmbeddingResidual = max(
            maxEmbeddingResidual,
            float(np.max(np.linalg.norm(origin + ((world - origin) @ basis) @ basis.T - world, axis=1))),
        )
        _require(
            start + len(world) <= LIMITS['outputVertices'],
            'output exceeds 30000 vertices; no partial section is returned.',
        )
        vertices.extend(((world - origin) @ basis).tolist())
        vertexRefs.extend([dict(cell=c, cellCoordinates=(q * span).tolist())] for q in localPoints)
        edges.extend([[a + start, b + start] for a, b in model['edges']])
        faces.extend([[v + start for v in F] for F in model['faces']])
        edgeRefs.extend([dict(cell=c)] for _ in model['edges'])
        localDensity = model['metadata']['densitySection']
        densities.extend(localDensity['faceDensities'])
        boundary.extend([[a + start, b + start] for a, b in localDensity['boundaryEdges']])
        faceRefs.extend(dict(cell=c, cells=[c], density=w) for w in localDensity['faceDensities'])
        regions.append(
            dict(
                sourceCell=c,
                outputFaces=list(range(firstFace, len(faces))),
                area=sum(r['content'] * span**2 for r in result['densityLegend'] if r['selected']),
                boundaryLoops=[[v + start for v in L] for L in localDensity['boundaryLoops']],
            )
        )
    _require(
        usedEdges == {tuple(sorted(E)) for E in source['edges']},
        'unowned source edges are outside this cell-only domain.',
    )
    diagnostics = dict(
        algorithm='per-cell supporting-plane arrangements classified by signed source degree',
        numericMode='float64-approximate',
        certified=False,
        orientation='each connected source cell independently has positive algebraic 3-volume',
        maxIntegerResidual=maxResidual,
        partitionResidual=partitionResidual,
        **totals,
        limits=LIMITS,
        globalInteriorAsserted=False,
        contentMeaning='area summed over separate source-cell sheets; overlap is counted separately',
        contactPolicy='literal supporting vertex/edge strata; winding is undefined at contacts and no selected filled area is assigned',
    )
    packet = dict(
        densityLegend=legend,
        densityDiagnostics=diagnostics,
        intersection=vertices,
        sourceReferences=vertexRefs,
        edgeSourceReferences=edgeRefs,
        faceSourceReferences=faceRefs,
        cellSectionRegions=regions,
        **common,
    )
    if contactEvents:
        diagnostics.update(
            contactEvents=contactEvents,
            contactPolicy='transverse vertex/edge events fill open arrangement regions; supporting vertex/edge strata carry zero area; coplanar faces/cells refuse',
            maxPlaneResidual=maxPlaneResidual,
            maxCellEmbeddingResidual=maxEmbeddingResidual,
            maxSourceContactResidual=max(
                float(np.max(abs(raw[e['sourceVertexIds']] @ n - offset))) for e in contactEvents
            ),
        )
    if not vertices:
        return dict(status='empty', model=None, **packet)
    result = dict(
        id='winding-cell-section:' + hashlib.sha256(source['id'].encode()).hexdigest()[:32],
        name='Independent winding cell section of ' + source['name'],
        dimension=3,
        embeddingDimension=3,
        interpretation='generalized-complex',
        vertices=vertices,
        edges=edges,
        faces=faces,
        cells=[],
        numeric=dict(mode='float64-approximate', certified=False, tolerance=EPS * span * 16),
        metadata=dict(
            coordinateUnits=source.get('metadata', {}).get('coordinateUnits', 'model'),
            fillSemantics='independent-winding-cell-sheets',
            sectionEmbedding={k: common[k] for k in ('normal', 'offset', 'origin', 'basis', 'sourceId')},
            sourceReferences=vertexRefs,
            edgeSourceReferences=edgeRefs,
            faceSourceReferences=faceRefs,
            elementSourceMaps={
                'vertices': [{'owners': [{'sourceRank': 3, 'sourceElement': R[0]['cell']}]} for R in vertexRefs],
                'edges': [{'owners': [{'sourceRank': 3, 'sourceElement': R[0]['cell']}]} for R in edgeRefs],
                'faces': [{'owners': [{'sourceRank': 3, 'sourceElement': R['cell']}]} for R in faceRefs],
                'cells': [],
            },
            independentCellSection=dict(
                version=VERSION,
                sourceFingerprint=identity(source),
                cells=reports,
                regions=regions,
                globalInteriorAsserted=False,
            ),
            densitySection=dict(
                version=VERSION,
                fillRule=fill_rule,
                threshold=density_threshold,
                faceDensities=densities,
                boundaryEdges=boundary,
                legend=legend,
                diagnostics=diagnostics,
            ),
            offColors={
                'faces': [{'encoding': 'unit', 'values': list(COLORS[(abs(w) - 1) % len(COLORS)])} for w in densities]
            },
        ),
        provenance=dict(
            operation='section',
            algorithmVersion=VERSION,
            sourceId=source['id'],
            sourceFingerprint=identity(source),
            parameters=params,
            convexified=False,
        ),
    )
    result['validation'] = validate(result)
    _require(
        result['validation']['passed'], 'result failed native validation: ' + '; '.join(result['validation']['errors'])
    )
    result['fingerprint'] = identity(result)
    return dict(
        status='independent-cell-section' if faces else 'degenerate',
        model=result,
        affineDimension=rank(np.asarray(vertices) / span),
        **packet,
    )
