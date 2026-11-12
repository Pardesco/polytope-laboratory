const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]
  );
const palette = ['#176b79', '#99431e', '#62469b', '#27703c', '#9c3167', '#695213'];
const outline = (color) =>
  [1, 3, 5].reduce((sum, i) => sum + parseInt(color.slice(i, i + 2), 16), 0) > 510 ? '#243942' : 'white';
export function assemblyParts(net, pages) {
  const packed = pages?.pages?.flatMap((page) => page.parts) ?? null;
  const parts = packed?.length
    ? packed.map((p) => ({ number: p.pieceNumber, root: p.component, faces: p.faceIds }))
    : [...net.components]
        .sort((a, b) => a.root - b.root)
        .map((p, i) => ({ number: i + 1, root: p.root, faces: p.faces }));
  const colors =
    net.printSource?.metadata?.offColors?.faces ?? net.elementAnnotations?.source?.metadata?.offColors?.faces;
  return parts
    .map((p) => ({
      ...p,
      colors: [
        ...new Set(
          p.faces.map((face) => {
            const row = colors?.[face];
            if (!row) return 'Uncolored';
            const factor = row.encoding === 'byte' ? 255 : 1;
            return (
              '#' +
              row.values
                .slice(0, 3)
                .map((v) =>
                  Math.round((v / factor) * 255)
                    .toString(16)
                    .padStart(2, '0')
                )
                .join('')
            );
          })
        ),
      ],
    }))
    .sort((a, b) => a.number - b.number);
}
export function pieceColor(part, mode = 'source') {
  if (!['source', 'piece', 'black'].includes(mode)) throw Error('Choose source, piece palette or black numbering.');
  return mode === 'black'
    ? '#243942'
    : mode === 'piece'
      ? palette[(part.number - 1) % palette.length]
      : (part.colors.find((c) => c !== 'Uncolored') ?? '#243942');
}
export function numberNetSvg(svg, parts, mode = 'source') {
  return svg.replace(/(<(?:\w+:)?text\b[^>]*data-piece-number="(\d+)"[^>]*)(>)/g, (match, tag, number, end) => {
    const part = parts.find((p) => p.number === Number(number));
    if (!part) return match;
    const color = pieceColor(part, mode);
    return (
      tag.replace(/\sfill="[^"]*"/, '') +
      ` fill="${color}" stroke="${outline(color)}" stroke-width=".2" paint-order="stroke"` +
      end
    );
  });
}
export function assemblySheets(
  net,
  { thumbnail, widthMm = 210, heightMm = 297, pages, color = 'source', title = 'Polytope assembly' } = {}
) {
  if (
    typeof thumbnail !== 'string' ||
    !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(thumbnail) ||
    thumbnail.length > 12 * 1024 * 1024
  )
    throw Error('Assembly sheets require a captured PNG thumbnail (up to 12 MB).');
  if (![widthMm, heightMm].every((v) => Number.isFinite(v) && v >= 20 && v <= 2000))
    throw Error('Use finite paper dimensions in 20–2,000 mm.');
  const parts = assemblyParts(net, pages),
    w = 210,
    h = (heightMm / widthMm) * w;
  if (h < 100) throw Error('Assembly sheet needs a paper height of at least half its width. Choose portrait paper.');
  const capacity = Math.max(1, Math.floor((h - 104) / 6)),
    count = Math.ceil(parts.length / capacity),
    result = [];
  for (let page = 0; page < count; page++) {
    const rows = parts.slice(page * capacity, (page + 1) * capacity);
    const text = (x, y, value, size = 3.1) => `<text x="${x}" y="${y}" font-size="${size}">${escape(value)}</text>`;
    const out = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${widthMm}mm" height="${heightMm}mm" viewBox="0 0 ${w} ${h}">`,
      '<rect width="100%" height="100%" fill="white"/><g font-family="sans-serif" fill="#243942" data-assembly-sheet="true">',
      text(10, 14, title.slice(0, 90), 5),
      text(10, 21, `Assembly / parts ${page + 1} of ${count} · E0 = ${net.referenceEdgeLengthMm} mm`),
      `<image data-finished-model="true" x="10" y="26" width="52" height="43" preserveAspectRatio="xMidYMid meet" href="${thumbnail}"/>`,
      text(68, 30, 'Match identical E labels; each names one source edge.'),
      text(68, 37, 'P1…Pn identify connected paper pieces; F = source face.'),
      '<path d="M 68 43 h 12" stroke="#359da6" stroke-dasharray="1.5 1"/>',
      text(84, 44, 'Valley / glue tab: fold away from printed side.'),
      '<path d="M 68 50 h 12" stroke="#359da6" stroke-dasharray="3 .8 .5 .8"/>',
      text(84, 51, 'Mountain: fold toward printed side.'),
      text(68, 58, 'Solid = cut; dotted = flat / unresolved crease.'),
      text(68, 65, 'Score first. Dry-fit matching labels, then glue in stages.'),
      text(10, 77, 'Print nets at 100%. Thumbnail is a view reference; fold collisions are not checked.'),
      text(10, 85, 'Piece', 3.5),
      text(31, 85, 'Source faces (zero-based IDs)', 3.5),
      text(153, 85, 'Source color', 3.5),
    ];
    rows.forEach((part, i) => {
      const y = 93 + i * 6,
        faces = part.faces.map((f) => 'F' + f).join(', '),
        description = `${part.faces.length} faces: ${faces}`,
        clipped = description.length > 64 ? description.slice(0, 60) + '…' : description;
      const ink = pieceColor(part, color);
      out.push(
        `<g data-assembly-part="P${part.number}"><title>${escape(faces + ' / ' + part.colors.join(', '))}</title><text x="10" y="${y}" font-size="3.4" fill="${ink}" stroke="${outline(ink)}" stroke-width=".15" paint-order="stroke">P${part.number}</text>`,
        text(31, y, clipped)
      );
      part.colors
        .slice(0, 6)
        .forEach((c, j) =>
          out.push(
            `<rect x="${153 + j * 6}" y="${y - 3}" width="4" height="4" stroke="#555" stroke-width=".2" fill="${c === 'Uncolored' ? 'white' : c}"/>`
          )
        );
      out.push('</g>');
    });
    out.push(
      text(10, h - 8, `${parts.length} pieces · ${net.faces.length} source faces · colors may repeat; use P/E labels.`),
      '</g></svg>'
    );
    result.push(out.join(''));
  }
  return result;
}
