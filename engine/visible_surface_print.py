"""Source RGBA and face provenance on the ordinary visible-surface SVG path."""

import xml.etree.ElementTree as ET
from .net_color_printing import face_colors, SVG


def decorate(net, svg):
    colors = face_colors(net['printSource'])
    root = ET.fromstring(svg)
    source_ids = net['visibleSurface']['sourceFaceIds']
    for group in root.iter('{' + SVG + '}g'):
        if 'data-net-face' not in group.attrib:
            continue
        fi = int(group.attrib['data-net-face'])
        group.set('data-visible-source-face', str(source_ids[fi]))
        polygon = group.find('{' + SVG + '}polygon')
        color = colors[fi]
        if polygon is not None and color is not None:
            polygon.set('fill', 'rgb(' + ','.join(format(v * 255, '.12g') for v in color[:3]) + ')')
            polygon.set('fill-opacity', format(color[3], '.12g'))
    return ET.tostring(root, encoding='unicode')
