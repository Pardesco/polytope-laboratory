import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DesktopFiles,reviewProjectOpen} from '../ui/desktop-files.mjs';
import {ProjectOpening} from '../ui/project-workflow.mjs';
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('unsaved replacement review prompts only for projects and preserves a declined workspace',async()=>{
  const project={project:{documents:[{}]}},geometry={model:{}};let prompted=0;
  const decline=async()=>{prompted++;return false;};
  assert.equal(await reviewProjectOpen(geometry,true,decline),geometry);assert.equal(await reviewProjectOpen(project,false,decline),project);assert.equal(await reviewProjectOpen(null,true,decline),null);
  assert.equal(await reviewProjectOpen(project,true,decline),null);assert.equal(prompted,1);assert.equal(await reviewProjectOpen(project,true,async()=>true),project);
});
test('edits during replacement confirmation retain the existing ProjectOpening publication fence',async()=>{
  const opening=new ProjectOpening(),project={};let revision=0,confirm;const published=[];
  const pending=opening.open({getProject:()=>project,getRevision:()=>revision,isExporting:()=>false,
    load:()=>reviewProjectOpen({project:{}},true,()=>new Promise(resolve=>confirm=resolve)),publish:value=>published.push(value)});
  await tick();revision++;opening.sync();confirm(true);await assert.rejects(pending,{name:'AbortError'});assert.deepEqual(published,[]);
});
test('external launch files drain in order, continue after refusal and discard every token',async()=>{
  const queue=['one','two','three'],opened=[],discarded=[],errors=[];let available,changed,finish;
  const files=new DesktopFiles({api:{takeOpenRequest:async()=>queue.shift(),discardOpenRequest:async token=>discarded.push(token),onOpenAvailable:fn=>available=fn,onRecentFilesChanged:fn=>changed=fn,recentFiles:async()=>({files:[]})},
    isOpening:()=>false,open:async token=>{opened.push(token);if(token==='one')await new Promise(resolve=>finish=resolve);if(token==='two')throw Error('invalid project');},notify(){},onError:error=>errors.push(error)});
  const pending=files.start();await tick();available();changed();assert.deepEqual(opened,['one']);finish();await pending;
  assert.deepEqual(opened,['one','two','three']);assert.deepEqual(discarded,opened);assert.equal(errors.length,1);
  queue.push('four');await available();await files.pending;assert.equal(opened.at(-1),'four');
});
test('queued OS opens wait for an ordinary Open or Save to settle',async()=>{
  let busy=true;const opened=[],queue=['token'];
  const files=new DesktopFiles({api:{takeOpenRequest:async()=>queue.shift()},isOpening:()=>busy,open:async token=>opened.push(token),notify(){},onError:error=>{throw error;}});
  const pending=files.start();await tick();assert.deepEqual(opened,[]);busy=false;await pending;assert.deepEqual(opened,['token']);
});
test('Welcome recent buttons show escaped DOM text and send only opaque IDs; missing-file notice is visible',async()=>{
  const nodes=[],calls=[],notices=[];let section;
  const dom={createElement:tag=>{const node={tag,children:[],setAttribute(){},append(...items){this.children.push(...items);},replaceChildren(){this.children=[];}};nodes.push(node);return node;}};
  const files=new DesktopFiles({document:dom,host:{after:node=>section=node},api:{recentFiles:async()=>({files:[{id:'opaque',label:'<model>.off',path:'C:\\<model>.off'}],message:'Removed 1 missing file'}),requestRecent:async id=>calls.push(id)},open(){},isOpening:()=>false,notify:value=>notices.push(value),onError:error=>{throw error;}});
  await files.refresh();assert.equal(section.id,'welcome-recent-section');const button=nodes.find(node=>node.id==='welcome-recent-0');assert.equal(button.textContent,'<model>.off');assert.equal(button.innerHTML,undefined);await button.onclick();assert.deepEqual(calls,['opaque']);assert.equal(files.message.textContent,notices[0]);
});
test('actual app mounts recents and starts the launch queue before catalog auto-open',async()=>{
  const app=await readFile(new URL('../ui/app.js',import.meta.url),'utf8');
  assert.match(app,/const desktopFiles=new DesktopFiles\(/);assert.match(app,/await desktopFiles.start\(\);await catalogDiscovery.load\(\)/);
  assert.match(app,/requestId\?api.openRequested\(requestId,id\):api.open\(id\)/);assert.match(app,/dirty,\(\)=>api.confirmProjectOpen\(\)/);
});
test('a pruning notice survives concurrent list refreshes even when an older file list is discarded',async()=>{
  const pending=[],notices=[];
  const files=new DesktopFiles({api:{recentFiles:()=>new Promise(resolve=>pending.push(resolve))},isOpening:()=>false,open(){},notify:value=>notices.push(value),onError:error=>{throw error;}});
  const first=files.refresh(),second=files.refresh();pending[0]({files:[],message:'Removed 1 missing file'});await first;pending[1]({files:[],message:''});await second;
  assert.deepEqual(notices,['Removed 1 missing file']);assert.equal(files.notice,'Removed 1 missing file');
});
