"""Rebuild the code-drawn tesseract application icon using the standard library."""
from pathlib import Path
import math
import struct
import zlib

OUT = Path(__file__).resolve().parents[1] / 'desktop' / 'assets'
POINTS = [(48, 48), (176, 48), (176, 176), (48, 176),
          (80, 80), (208, 80), (208, 208), (80, 208)]
EDGES = [(i, (i + 1) % 4) for i in range(4)] + [(i + 4, (i + 1) % 4 + 4) for i in range(4)] + [(i, i + 4) for i in range(4)]


def distance(x, y, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    t = max(0, min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy)))
    return math.hypot(x - a[0] - t * dx, y - a[1] - t * dy)


def chunk(tag, data):
    return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data))


def png(size):
    rows = bytearray()
    for j in range(size):
        rows.append(0)
        for i in range(size):
            x, y = (i + .5) * 256 / size, (j + .5) * 256 / size
            d = min(distance(x, y, POINTS[a], POINTS[b]) for a, b in EDGES)
            coverage = max(0, min(1, (4 - d) * size / 256 + .5))
            color = (244, 187, 91) if x + y > 250 else (109, 211, 238)
            rows.extend(round(bg + (fg - bg) * coverage) for bg, fg in zip((16, 23, 34), color))
            rows.append(255)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(rows, 9)) + chunk(b'IEND', b'')


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    sizes = [16, 32, 48, 64, 128, 256]
    images = [png(size) for size in sizes]
    offset = 6 + 16 * len(sizes)
    header = bytearray(struct.pack('<HHH', 0, 1, len(sizes)))
    for size, data in zip(sizes, images):
        header.extend(struct.pack('<BBBBHHII', size % 256, size % 256, 0, 0, 1, 32, len(data), offset))
        offset += len(data)
    (OUT / 'polytope.ico').write_bytes(header + b''.join(images))
    lines = ''.join(f'<path d="M{POINTS[a][0]} {POINTS[a][1]}L{POINTS[b][0]} {POINTS[b][1]}"/>' for a, b in EDGES)
    (OUT / 'polytope.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><rect width="256" height="256" fill="#101722"/><g fill="none" stroke="#6dd3ee" stroke-width="7" stroke-linecap="round">' + lines + '</g></svg>\n', encoding='utf8')
