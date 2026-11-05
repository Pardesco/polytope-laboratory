// SPDX-License-Identifier: GPL-3.0-only
// Search phrases use existing actions/controls; these are not new accelerators.
export const FEATURE_ACTION_INDEX=[
  {label:'Uniform compound parameters',query:'Uniform compounds',topic:'uniform-compounds'},
  {label:'4D frame and vertex links',query:'Check literal vertex links',topic:'polychoron-relationships'},
  {label:'Native star cell inventory',query:'star uniform polychora',topic:'star-polychora'},
  {label:'Video format and render size',query:'Export format',topic:'media-export'},
  {label:'Present and record a playlist',query:'Start presentation',topic:'presentation'},
  {label:'What’s new',query:'whatsnew',topic:'whats-new'},
  {label:'Welcome and walkthroughs',query:'Welcome',topic:'welcome'},
  {label:'Library geometry filters and related models',query:'Geometry properties',topic:'library'},
  {label:'Near-miss Johnson solids',query:'Near-miss Johnson',topic:'near-miss'},
  {label:'Multiple independent views',query:'Multiple views',topic:'views'},
  {label:'Element types, visibility and coloring',query:'Element types',topic:'visibility'},
  {label:'Measurements by element type',query:'Measurements by element type',topic:'information'},
  {label:'Orient to symmetry axis',query:'Orient to symmetry axis',topic:'symmetry-orientation'},
  {label:'Augment, excavate and drill',query:'Augment excavate',topic:'augmentation'},
  {label:'Make faces regular',query:'Make faces regular',topic:'expansion'},
  {label:'Conway notation and subdivision',query:'Conway',topic:'conway'},
  {label:'Project vertices onto a sphere',query:'Project vertices onto sphere',topic:'sphere'},
  {label:'Symmetry-axis zones',query:'Symmetry-axis zones',topic:'zones'},
  {label:'Add Dual and compounds',query:'Add Dual',topic:'compounds'},
  {label:'Faceting diagram editor',query:'Faceting diagram',topic:'faceting-editor'},
  {label:'Automatic faceting search',query:'Automatic facets',topic:'faceting'},
  {label:'Interactive stellation diagrams',query:'Interactive stellation diagrams',topic:'stellation-diagrams'},
  {label:'Miller’s rules',query:'Miller',topic:'miller'},
  {label:'4D incidence truncation and vertex links',query:'Incidence truncation',topic:'generalized-4d'},
  {label:'Filled density sections',query:'Filled density',topic:'density-sections'},
  {label:'Visible surface paper models',query:'Visible surface',topic:'visible-surface'},
  {label:'Re-arrange paper pieces',query:'Re-arrange pieces',topic:'paper-assembly'},
  {label:'Assembly sheets',query:'Export assembly sheet SVG',topic:'paper-assembly'},
  {label:'Printable struts, panels and solids',query:'Printable model',topic:'printing'},
  {label:'Hollow solid printing',query:'Hollow shell',topic:'solid-printing'},
  {label:'4D dual morphs and offline video',query:'Dual morph',topic:'animation-4d'},
  {label:'Presentation styles',query:'Style',topic:'appearance'},
  {label:'Transparent or larger PNG',query:'Transparent background',topic:'images'},
  {label:'Stereo eye separation and convergence',query:'Stereo settings',topic:'stereo'},
  {label:'Colored/displayed geometry export',query:'Displayed geometry',topic:'interchange'},
  {label:'Blocks, folded grids and generator variants',query:'Basic geometric constructions',topic:'generator-options'},
  {label:'Recent files',query:'Open Recent',topic:'desktop-files'},
  {label:'Edit model information',query:'Edit model information',topic:'metadata'}
];
export const GUIDE_COMMAND_METADATA={
  'uc-create':{keywords:'uniform compound Skilling UC rotation parameters'},
  'uc-apply':{keywords:'uniform compound Skilling UC rotation parameters'},
  'polychoron-check-links':{keywords:'4D compound scaliform fissary vertex links frame'},
  'presentation-start':{keywords:'F5 fullscreen showcase playlist presentation'},
  'presentation-record':{keywords:'record presentation MP4 GIF WebM PNG playlist'},
  whatsnew:{keywords:'whatsnew whats new tonight additions release notes'},
  export:{keywords:'Printable model strut panels solid hollow shell STL 3MF OBJ GLB displayed geometry colored X3D interchange'},
  open:{keywords:'Open Recent files DXF OFF polyproj import'},
  'section-density-mode':{keywords:'Filled density winding section'},
  'incidence-truncation-settings':{keywords:'Incidence truncation 4D vertex links rectification'},
  'presentation-style':{keywords:'Style Studio Dark gallery Glass Metal Neon edges Paper Geomag'},
  'png-transparent':{keywords:'Transparent background PNG alpha'},
  'surgery-piece':{keywords:'Augment excavate drill face surgery'},
  'information-panel':{keywords:'Measurements by element type radii genus density'},
  'basic-solid-settings':{keywords:'Basic geometric constructions block hexagonal folded grid'},
  'waterman-settings':{keywords:'Waterman SC FCC BCC origin lattice squared radius'},
  'step-prism-settings':{keywords:'step prism gyrochoron previous next'},
  'torus-settings':{keywords:'torus twist arm step'}
};
export const guideCommandKeywords=id=>GUIDE_COMMAND_METADATA[id]?.keywords??'';
export function appendFeatureActionIndex(doc,host,onSearch){
  const heading=doc.createElement('h3');heading.textContent='Find new actions with Ctrl+K';
  const hint=doc.createElement('p');hint.textContent='These tasks use command search. Choose one to search the live controls and Guide; availability follows the current model.';
  const list=doc.createElement('ul');list.id='shortcut-action-index';
  for(const item of FEATURE_ACTION_INDEX){const row=doc.createElement('li'),button=doc.createElement('button');button.type='button';button.textContent=item.label;button.dataset.commandQuery=item.query;button.onclick=()=>onSearch(item.query);row.append(button);list.append(row);}
  host.append(heading,hint,list);
}
