export function updateExportFormatLabels(
  options,
  original,
  { printable = false, displayed = false, ascii = false } = {}
) {
  const labels = printable
    ? {
        stl: `STL · ${ascii ? 'ASCII' : 'binary'} printable mesh`,
        obj: 'OBJ · grouped printable mesh',
        '3mf': '3MF · printable shells (mm)',
        glb: 'GLB · printable solid (meters)',
      }
    : displayed
      ? { obj: 'OBJ · displayed mesh', vrml: 'VRML · displayed mesh (meters)', x3d: 'X3D · displayed faces and lines' }
      : {};
  for (const option of options) option.textContent = labels[option.value] ?? original.get(option.value);
}
