const families = [
  [/learn4d/, 'learn 4d four dimensions fourth dimension tutorial lessons chapters beginner'],
  [/dual|reciprocat/, 'dual polar reciprocal swap faces corners cells vertices'],
  [/truncat|rectif/, 'truncate truncation cut corners rectify rectification edge midpoints bevel'],
  [/stellat/, 'stellate stellation extend face planes star regions'],
  [/facet/, 'facet faceting draw new faces face boundaries'],
  [/net|unfold/, 'net unfold unfolding faces cells paper'],
  [/coxeter|wythoff|shape-builder|snub/, 'coxeter wythoff symmetry reflection diagram schlafli schläfli snub twist'],
  [/symmetry/, 'symmetry group rotations mirrors'],
  [
    /augment|face-surgery|face-placement|attach-faces/,
    'augment augmentation excavate excavation attach build on faces',
  ],
  [/extrud|prism/, 'prism antiprism extrude extrusion polygon layers'],
];
export function commandSynonyms(item) {
  if (/^(library|guide):/.test(item.id)) return '';
  const id = String(item.id ?? '').replace(/^(control|action):/, '');
  return families
    .filter(([pattern]) => pattern.test(id))
    .map(([, words]) => words)
    .join(' ');
}
