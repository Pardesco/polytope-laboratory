"""Rebuild offline overview prose from curated text and pinned catalog inventories."""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from engine.generators import CATALOG, CATALAN_SOURCES
from engine.regular4d_validation import CATALOG_IDENTITIES, CROSSWALK, regular4d_metadata
from engine.compound_catalog import ENTRIES


def joined(items):
    return items[0] if len(items) == 1 else ', '.join(items[:-1]) + ' and ' + items[-1]


def polygon(n, count):
    single, plural = {
        3: ('equilateral triangle', 'equilateral triangles'),
        4: ('square', 'squares'),
        5: ('regular pentagon', 'regular pentagons'),
        6: ('regular hexagon', 'regular hexagons'),
        8: ('regular octagon', 'regular octagons'),
        10: ('regular decagon', 'regular decagons'),
    }.get(n, (f'regular {n}-gon', f'regular {n}-gons'))
    return str(count) + ' ' + (single if count == 1 else plural)


def cell_name(key, count):
    name = key.replace('-', ' ')
    if key.startswith('uniform-'):
        _, kind, n = key.split('-')
        name = f'{n}-gonal {kind}'
    plurals = {
        'tetrahedron': 'tetrahedra',
        'cube': 'cubes',
        'octahedron': 'octahedra',
        'dodecahedron': 'dodecahedra',
        'icosahedron': 'icosahedra',
        'cuboctahedron': 'cuboctahedra',
        'icosidodecahedron': 'icosidodecahedra',
    }
    if count != 1:
        name = plurals.get(name, name[:-6] + 'hedra' if name.endswith('hedron') else name + 's')
    return f'{count:,} {name}'


def build():
    descriptions = {
        'tetrahedron': 'Four equilateral triangles form the simplest solid. Three faces meet at each of its four corners.',
        'cube': 'Six squares form this familiar solid. Three faces meet at every corner.',
        'octahedron': 'Eight equilateral triangles form two square pyramids joined at their bases. Four faces meet at every corner.',
        'dodecahedron': 'Twelve regular pentagons form this solid. Three faces meet at every corner.',
        'icosahedron': 'Twenty equilateral triangles form this solid. Five faces meet at every corner.',
        'simplex4': 'The simplest four-dimensional polytope has five tetrahedral cells. Every pair of its five vertices is joined by an edge.',
        'tesseract': 'The four-dimensional counterpart of a cube has eight cubic cells. Imagine a cube extended in a fourth, perpendicular direction.',
        'cross4': 'Sixteen tetrahedra form this regular four-dimensional polytope. Its eight vertices lie in opposite pairs along four perpendicular axes.',
        'cell24': 'Twenty-four octahedral cells form this regular four-dimensional polytope. It is its own dual.',
        'cell120': 'One hundred and twenty dodecahedral cells form this regular four-dimensional polytope. It is dual to the 600-cell.',
        'cell600': 'Six hundred tetrahedral cells form this regular four-dimensional polytope. It is dual to the 120-cell.',
        'cuboctahedron': 'Eight triangles and six squares meet in an alternating pattern at every corner. Its vertices sit at the edge midpoints of a cube.',
        'icosidodecahedron': 'Twenty triangles and twelve pentagons meet in an alternating pattern at every corner. Its vertices sit at the edge midpoints of an icosahedron.',
        'truncated-tetrahedron': 'Cutting off the corners of a tetrahedron produces four equilateral triangles and four regular hexagons.',
        'truncated-cube': 'Cutting off the corners of a cube produces eight equilateral triangles and six regular octagons.',
        'truncated-octahedron': 'Cutting off the corners of an octahedron produces six squares and eight regular hexagons.',
        'truncated-dodecahedron': 'Cutting off the corners of a dodecahedron produces twenty equilateral triangles and twelve regular decagons.',
        'truncated-icosahedron': 'Cutting off the corners of an icosahedron produces twelve regular pentagons and twenty regular hexagons, the familiar football pattern.',
        'rhombicuboctahedron': 'Eight equilateral triangles and eighteen squares form this solid. One triangle and three squares meet at every corner.',
        'truncated-cuboctahedron': 'Twelve squares, eight regular hexagons and six regular octagons form this solid. One of each meets at every corner.',
        'rhombicosidodecahedron': 'Twenty equilateral triangles, thirty squares and twelve regular pentagons form this solid. A triangle, two squares and a pentagon meet at every corner.',
        'truncated-icosidodecahedron': 'Thirty squares, twenty regular hexagons and twelve regular decagons form this solid. One of each meets at every corner.',
        'snub-cube': 'Thirty-two equilateral triangles and six squares form this solid. Four triangles and one square meet at every corner; its two mirror forms cannot be superimposed by rotation.',
        'snub-dodecahedron': 'Eighty equilateral triangles and twelve regular pentagons form this solid. Four triangles and one pentagon meet at every corner; its two mirror forms cannot be superimposed by rotation.',
        'small-stellated-dodecahedron': 'Twelve pentagram faces form this regular star polyhedron. Five faces meet at each vertex.',
        'great-dodecahedron': 'Twelve regular pentagons intersect to form this regular star polyhedron. Five faces meet in a star-shaped arrangement around each vertex.',
        'great-stellated-dodecahedron': 'Twelve pentagram faces form this regular star polyhedron. Three faces meet at each vertex.',
        'great-icosahedron': 'Twenty equilateral triangles intersect to form this regular star polyhedron. Five faces meet in a star-shaped arrangement around each vertex.',
    }
    faces = {
        'triakis-tetrahedron': '12 matching isosceles triangles',
        'rhombic-dodecahedron': '12 matching rhombi',
        'triakis-octahedron': '24 matching isosceles triangles',
        'tetrakis-hexahedron': '24 matching isosceles triangles',
        'pentakis-dodecahedron': '60 matching isosceles triangles',
        'triakis-icosahedron': '60 matching isosceles triangles',
        'rhombic-triacontahedron': '30 matching rhombi',
        'deltoidal-icositetrahedron': '24 matching kites',
        'disdyakis-dodecahedron': '48 matching scalene triangles',
        'pentagonal-icositetrahedron': '24 matching irregular pentagons',
        'deltoidal-hexecontahedron': '60 matching kites',
        'disdyakis-triacontahedron': '120 matching scalene triangles',
        'pentagonal-hexecontahedron': '60 matching irregular pentagons',
    }
    names = {row['key']: row['name'] for row in CATALOG}
    for key, source in CATALAN_SOURCES.items():
        descriptions[key] = (
            f"The dual of the {names[source].removesuffix(' (A)').removesuffix(' (B)').lower()}, with {faces[key.removesuffix('-mirror')]}. Each face corresponds to a corner of its dual."
        )
    for key in ('snub-cube', 'snub-dodecahedron'):
        descriptions[key + '-mirror'] = descriptions[key]
    antiprism = json.loads((ROOT / 'engine/catalog_data/antiprism/manifest.json').read_text(encoding='utf-8'))[
        'entries'
    ]
    for row in antiprism:
        if row['family'] == 'Johnson':
            inventory = row['quality']['facePolygonWindingCounts']
            assert all(k.endswith('/1') for k in inventory)
            parts = [
                polygon(int(k.split('/')[0]), count)
                for k, count in sorted(inventory.items(), key=lambda item: int(item[0].split('/')[0]))
            ]
            descriptions[row['key']] = (
                f"The {row['name']} (J{int(row['id'][1:])}) is a convex solid with {joined(parts)}."
            )
        else:
            key = row['name'].lower().removesuffix(' (reflected)').replace(' ', '-')
            if key in descriptions:
                descriptions[row['key']] = descriptions[key]
    uniform = json.loads((ROOT / 'engine/catalog_data/convex_uniform4.json').read_text(encoding='utf-8'))['entries']
    for row in uniform:
        if row['key'] in descriptions:
            continue
        inventory = [cell_name(cell['key'], cell['count']) for cell in row['cellTypes']]
        descriptions[row['key']] = (
            'A convex four-dimensional shape with the same arrangement of cells at every vertex. Its boundary contains '
            + joined(inventory)
            + '.'
        )
    for n in range(3, 13):
        descriptions[f'uniform-prism-{n}'] = f'Two parallel regular {n}-gons are joined by a belt of {n} squares.'
        descriptions[f'uniform-antiprism-{n}'] = (
            f'Two parallel regular {n}-gons are turned relative to one another and joined by a belt of {2 * n} equilateral triangles.'
        )
    for key in list(CATALOG_IDENTITIES)[6:]:
        data = regular4d_metadata(key)
        count = CROSSWALK[data['regular4dIdentity']]['counts'][3]
        descriptions[key] = (
            f"A regular four-dimensional star polytope with {cell_name(data['cellType'].replace(' ', '-'), count)} as cells. Its recorded faces and cells describe an intersecting boundary."
        )
    descriptions['compound-stella-octangula'] = (
        'Two tetrahedra point in opposite directions, forming an eight-pointed star. Their combined vertices are the eight corners of a cube.'
    )
    for key, name, seed, orbit, count, uc, chirality in ENTRIES:
        catalog_key = 'compound-' + key
        descriptions.setdefault(
            catalog_key,
            f"A symmetric arrangement of {cell_name(seed, count)}, sharing a center while retaining their separate faces and edges.",
        )
    descriptions.update(
        {
            'compound-cube-octahedron': 'A cube and its dual octahedron share a center, with both sets of faces and edges shown.',
            'compound-dodecahedron-icosahedron': 'A dodecahedron and its dual icosahedron share a center, with both sets of faces and edges shown.',
            'compound-tesseract-16-cell': 'A tesseract and its dual 16-cell share a center in four dimensions.',
            'compound-two-24-cells': 'Two mutually dual 24-cells share a center in four dimensions.',
            'compound-five-24-cells': 'Five 24-cells occupy the vertex set of a 600-cell, retaining each component separately.',
            'compound-great-dodecahedron-small-stellated': 'A great dodecahedron and its dual small stellated dodecahedron share a center.',
        }
    )
    return dict(sorted(descriptions.items()))


if __name__ == '__main__':
    path = ROOT / 'ui/model-descriptions.json'
    path.write_text(json.dumps(build(), ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Wrote {len(build())} catalog descriptions to {path.relative_to(ROOT)}')
