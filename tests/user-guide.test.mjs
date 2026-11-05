import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {GUIDE_TOPICS,GROUP_GUIDE_TOPICS,guideContext,searchGuide} from '../ui/user-guide.mjs';
import {GUIDE_GOALS,WHATS_NEW_LINKS} from '../ui/guide-refresh.mjs';
import {GUIDE_REFERENCES} from '../ui/guide-reference-index.mjs';
import {FEATURE_ACTION_INDEX,guideCommandKeywords} from '../ui/guide-action-index.mjs';
import {buildCommandIndex,rankCommands} from '../ui/command-index.mjs';
import {bindings,shortcutTable} from '../ui/shortcut-bindings.mjs';

const read=name=>readFile(new URL('../'+name,import.meta.url),'utf8');
const ids=new Set(GUIDE_TOPICS.map(t=>t.id));
test('Guide ids are unique, goal groups cover every topic, and all related/What’s new links resolve',()=>{
  assert.equal(ids.size,GUIDE_TOPICS.length);assert.equal(GUIDE_GOALS.length,10);
  for(const t of GUIDE_TOPICS){assert.match(t.id,/^[a-z0-9-]+$/);assert.ok(t.title&&t.where&&t.paragraphs.length);if(t.id!=='whats-new')assert.ok(GUIDE_GOALS.includes(t.goal),t.id);
    for(const id of [...(t.related??[]),...(t.links??[]).map(([id])=>id)])assert.ok(ids.has(id),t.id+' → '+id);
  }
  assert.equal(new Set(WHATS_NEW_LINKS.map(([id])=>id)).size,WHATS_NEW_LINKS.length);
  for(const [id] of WHATS_NEW_LINKS){const t=GUIDE_TOPICS.find(t=>t.id===id);assert.ok(t.steps?.length>=3&&t.steps.length<=6,id);assert.ok(t.tips,id);}
});

test('every named disclosure derived from UI modules and layout factories has an explicit valid help mapping',async()=>{
  const found=new Map(),add=(id,file)=>found.set(id,file);
  for(const file of await readdir(new URL('../ui',import.meta.url))){
    if(!/\.(?:mjs|js|html)$/.test(file))continue;const source=await read('ui/'+file);
    for(const match of source.matchAll(/<details\b[^>]*\bid=["']([^"']+)["']/g))add(match[1],file);
    for(const match of source.matchAll(/(?:const\s+|let\s+|this\.)?(\w+)=(?:document|doc)\.createElement\(['"]details['"]\)/g)){
      const tail=source.slice(match.index,match.index+300),assignment=new RegExp('(?:this\\.)?'+match[1]+'\\.id=([^;]+)').exec(tail);
      if(assignment)for(const literal of assignment[1].matchAll(/['"]([\w-]+)['"]/g))add(literal[1],file);
    }
    for(const match of source.matchAll(/disclosure\(doc,['"]([\w-]+)['"]/g))add(match[1],file);
    const wrappers=source.match(/for\(const \[id,wrapper,label\] of (.+)\)\{/);
    if(wrappers)for(const match of wrappers[1].matchAll(/\[['"][^'"]+['"],['"]([^'"]+)['"]/g))add(match[1],file);
  }
  assert.ok(found.size>=70,'scanner should cover both static and generated groups: '+found.size);
  for(const [id,file] of found){assert.ok(GROUP_GUIDE_TOPICS[id],file+': '+id);assert.ok(ids.has(GROUP_GUIDE_TOPICS[id]),id);}
  for(const id of Object.values(GROUP_GUIDE_TOPICS))assert.ok(ids.has(id),id);
});

test('new group and focused-field help uses task-specific contexts while anonymous children inherit',()=>{
  for(const [id,topic] of Object.entries({'information-panel':'information','density-section-settings':'density-sections','zone-extension-settings':'zones','faceting-diagram-settings':'faceting-editor','stellation-plane-settings':'stellation-diagrams','printable-solid-settings':'solid-printing','near-miss-catalog-evidence':'near-miss'})){
    assert.equal(guideContext({id}),topic);assert.equal(guideContext({id:'',parentElement:{id}}),topic);
  }
  assert.equal(guideContext({id:'section-density-rule'}),'density-sections');assert.equal(guideContext({id:'information-copy'}),'information');
  assert.equal(guideContext({id:'future-unknown',parentElement:{id:'construct-panel'}}),'construction');
});

test('all overnight feature notes exist and ship offline, including features after the original overnight table',async()=>{
  const bundled=await read('ui/guide-documents.mjs'),notes=new Set(Object.values(GUIDE_REFERENCES).flat());
  const required=['VIEWER_UX','FACE_SURGERY','ELEMENT_TYPES','CONDITION_FITTING','W12_FACE_CONWAY_ZONES','FACETING_DIAGRAM_EDITOR','COMPOUND_LIBRARY','PRINTABLE_EXPORT','SOLID_PRINTING','LIBRARY_COVERAGE','STELLATION_DIAGRAMS','MILLER_STELLATIONS','DISCOVERABILITY','MATERIAL_STYLES','FIRST_RUN','ELEMENT_VISIBILITY_LINKED_VIEWS','INTERCHANGE','NEAR_MISS_JOHNSON_SOLIDS','VISIBLE_SURFACE_NETS','NET_PAPER_UX','PERFORMANCE_DENSE','GENERALIZED_4D_CONSTRUCTIONS','FILLED_DENSITY_SECTIONS','W29_ANIMATION','DESKTOP_READINESS','INFORMATION_PANEL_STEREO','GENERATOR_PARITY','PRODUCT_POLISH'];
  for(const name of required)assert.ok(notes.has(name+'.md'),name);
  for(const [id,names] of Object.entries(GUIDE_REFERENCES)){assert.ok(ids.has(id));assert.equal(new Set(names).size,names.length);for(const name of names){assert.ok(bundled.includes(name.replace(/\.md$/,'')),name);assert.ok((await read('docs/'+name)).length,name);}}
});

test('search includes task steps/limits and the shortcut action index links valid topics without invented keys',()=>{
  assert.ok(searchGuide('threshold k').some(t=>t.id==='density-sections'));
  assert.ok(searchGuide('drain holes').some(t=>t.id==='solid-printing'));
  for(const item of FEATURE_ACTION_INDEX){assert.ok(ids.has(item.topic));assert.ok(item.query&&item.label);}
  assert.equal(bindings.whatsnew.scope,'Help');assert.deepEqual(bindings.whatsnew.keys,[]);
  assert.equal(shortcutTable().some(row=>row.id==='whatsnew'),false);
  const index=buildCommandIndex({actions:[{id:'export',label:bindings.export.label,keywords:guideCommandKeywords('export')},{id:'whatsnew',label:bindings.whatsnew.label,keywords:guideCommandKeywords('whatsnew')}]});
  for(const query of ['Printable model','Hollow shell','Displayed geometry'])assert.equal(rankCommands(index,query)[0].id,'export');
  assert.equal(rankCommands(index,'whatsnew')[0].id,'whatsnew');
});
