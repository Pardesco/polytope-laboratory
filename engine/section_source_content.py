"""Literal source occurrences for complete ordinary-cell section content.

This record does not transfer or change the source annotation document.
"""
import hashlib
from .element_annotations import _source, _json, MAX_SOURCE
from .geometry import GeometryError, identity

VERSION = 1
MAX_OCCURRENCES = 100000


def section_content_record(source, result, common):
    occurrences = []

    def add(kind, index, target, ids, **extra):
        if len(occurrences) >= MAX_OCCURRENCES:
            raise GeometryError('Section content correspondence exceeds 100000 occurrences.')
        occurrences.append({'sourceKind': kind, 'sourceIndex': index,
                            'targetKind': target, 'targetIds': list(ids), **extra})

    for v, references in enumerate(common['sourceReferences']):
        for e in sorted({r['edge'] for r in references}):
            add('edge', e, 'vertex', [v])
        for original in sorted({r['vertex'] for r in references if 'vertex' in r}):
            add('vertex', original, 'vertex', [v])
    for e, references in enumerate(common['edgeSourceReferences']):
        for f in sorted({r['face'] for r in references if 'face' in r}):
            add('face', f, 'edge', [e])
    for region in common['cellSectionRegions']:
        c = region['sourceCell']
        if region.get('coplanarCell'):
            for f in region['outputFaces']:
                add('cell', c, 'face', [f], component=f, coplanarCell=True)
        else:
            add('cell', c, 'face', region['outputFaces'],
                component=region['component'], hasHoles=bool(region['holes']))

    # Whole source face sheets only. All corners must be surviving original
    # vertices in the same cyclic order (up to start/reversal).
    sheets = []
    for f, reference in enumerate(common['faceSourceReferences']):
        original = reference.get('coplanarFace')
        if original is None or reference.get('holeTessellation'):
            continue
        corners = []
        for v in result['faces'][f]:
            owners = {r['vertex'] for r in common['sourceReferences'][v] if 'vertex' in r}
            if len(owners) != 1:
                raise GeometryError('Whole section face has ambiguous original corner identity.')
            corners.append(next(iter(owners)))
        expected = source['faces'][original]
        if len(corners) != len(expected) or corners[0] not in expected:
            raise GeometryError('Whole section face has incomplete original corner identity.')
        n = len(expected); start = expected.index(corners[0])
        if not any(corners == [expected[(start + direction*i) % n] for i in range(n)] for direction in (1,-1)):
            raise GeometryError('Whole section face differs from the literal original cycle.')
        sheets.append({'sourceFace': original, 'outputFace': f, 'sourceVertexIds': corners})
    record = {'version': VERSION, 'sourceId': source['id'],
              'sourceFingerprint': identity(source),
              'sourceSha256': hashlib.sha256(_source(source)).hexdigest(),
              'plane': {k: common[k] for k in ('normal','offset','origin','basis')},
              'occurrences': occurrences, 'wholeFaceSheets': sheets,
              'policy': 'literal source rank loss; complete regions; whole affine PNG sheets only'}
    _json(record, MAX_SOURCE)
    return record
