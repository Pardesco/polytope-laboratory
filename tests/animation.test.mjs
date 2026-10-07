import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createSequence,evaluateSequence,normalizeSequence,resizeSequence,sequenceFrameTimes,setSequenceKeyframe} from '../ui/animation.mjs';
import {AnimationControls} from '../ui/animation-controls.mjs';
import {WebmFrameCounter} from '../ui/webm-frames.mjs';
const require=createRequire(import.meta.url);
const {createAnimationExportManager,validateExportOptions,decodeChunk}=require('../desktop/animation-export.cjs');
const view={angles:[10,20,30,40,50,60],sectionOffset:-2};
const PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';

test('animation endpoints and full turns preserve all six angle tracks',()=>{
  const sequence=createSequence(view,2,24);sequence.keyframes[1].sectionOffset=2;
  const start=evaluateSequence(sequence,0),end=evaluateSequence(sequence,2),middle=evaluateSequence(sequence,1);
  assert.deepEqual(start.angles,view.angles);assert.deepEqual(end.angles,[370,20,30,40,50,60]);
  assert.equal(middle.angles[0],190);assert.equal(middle.sectionOffset,0);
  assert.deepEqual(evaluateSequence(sequence,99),end);assert.deepEqual(evaluateSequence(sequence,-1),start);
  start.angles[0]=1000;assert.equal(sequence.keyframes[0].angles[0],10);
});

test('captured interior keyframes retain time interpolation after resizing',()=>{
  let sequence=setSequenceKeyframe(createSequence(view,2),1,{angles:Array(6).fill(90),sectionOffset:10});
  assert.equal(evaluateSequence(sequence,.5).sectionOffset,4);
  sequence=resizeSequence(sequence,4);assert.equal(sequence.keyframes[1].time,2);
  assert.equal(evaluateSequence(sequence,1).sectionOffset,4);
  sequence=setSequenceKeyframe(sequence,2,{angles:Array(6).fill(0),sectionOffset:3});
  assert.equal(sequence.keyframes.length,3);assert.equal(evaluateSequence(sequence,2).sectionOffset,3);
});

test('frame sampling uses fps timestamps and retains exact fractional endpoint',()=>{
  assert.deepEqual(sequenceFrameTimes(createSequence(view,.13,24)),[0,1/24,2/24,3/24,.13]);
  assert.equal(sequenceFrameTimes(createSequence(view,300,60)).length,18001);
});

test('finite extreme section depths interpolate without subtraction overflow',()=>{
  const sequence=createSequence({...view,sectionOffset:-1e308},2);sequence.keyframes[1].sectionOffset=1e308;
  assert.equal(evaluateSequence(sequence,1).sectionOffset,0);assert.ok(Number.isFinite(evaluateSequence(sequence,.5).sectionOffset));
});

test('invalid and unbounded saved sequences are rejected',()=>{
  const sequence=createSequence(view);
  for(const invalid of [{...sequence,version:2},{...sequence,duration:301},{...sequence,duration:0},{...sequence,fps:61},{...sequence,fps:1.2},{...sequence,loop:'yes'},{...sequence,keyframes:[sequence.keyframes[0]]},{...sequence,keyframes:[sequence.keyframes[1],sequence.keyframes[0]]},{...sequence,keyframes:[{...sequence.keyframes[0],angles:[1]},sequence.keyframes[1]]},{...sequence,keyframes:[{...sequence.keyframes[0],sectionOffset:Infinity},sequence.keyframes[1]]}])assert.throws(()=>normalizeSequence(invalid));
  assert.throws(()=>evaluateSequence(sequence,NaN));assert.throws(()=>setSequenceKeyframe(sequence,9,view));
  assert.throws(()=>resizeSequence(sequence,-3));
});

test('editing duration, fps and loop retains user values while playback pauses',async()=>{
  const source={model:{id:'source',dimension:3,embeddingDimension:3,vertices:[[0,0,0],[1,0,0],[0,1,0]],edges:[[0,1],[1,2],[2,0]],faces:[[0,1,2]],cells:[]},view:{...view,animation:createSequence(view)}};
  const controls=Object.create(AnimationControls.prototype);
  const doc={id:'doc',states:[source],cursor:0},project={documents:[doc]};controls.context={getState:()=>source,getDocument:()=>doc,getProject:()=>project,evaluateMany:async entries=>entries.map(Number)};controls.time=0;controls.generation=0;controls.playing=false;
  controls.nodes={duration:{value:'.25'},fps:{value:'8'},loop:{checked:true}};
  // A normal UI refresh reflects the saved state back into the form fields.
  controls.update=()=>{if(controls.editing)return;const sequence=controls.sequence();controls.nodes.duration.value=String(sequence.duration);controls.nodes.fps.value=String(sequence.fps);controls.nodes.loop.checked=sequence.loop;};
  await controls.configure();assert.equal(source.view.animation.duration,.25);assert.equal(source.view.animation.fps,8);assert.equal(source.view.animation.loop,true);
});

test('native export rejects bad formats, timestamps, bytes and frame dimensions',()=>{
  assert.throws(()=>validateExportOptions({format:'mp4',fps:24,frameCount:2}));
  assert.throws(()=>validateExportOptions({format:'png',fps:24,frameCount:999999}));
  assert.throws(()=>validateExportOptions({format:'png',fps:24,frameCount:2,duration:8}));
  assert.throws(()=>decodeChunk('data:image/png;base64,bm90YXBuZw==','png'));
  assert.throws(()=>decodeChunk('../filename.png','png'));
  const bytes=Buffer.from(PNG.slice(22),'base64');bytes.writeUInt32BE(9000,16);
  assert.throws(()=>decodeChunk('data:image/png;base64,'+bytes.toString('base64'),'png'));
  assert.throws(()=>decodeChunk(new Uint8Array(32*1024*1024+1),'webm'));
});

test('PNG export publishes consecutive exact frames atomically with timestamp manifest',async()=>{
  const folder=await mkdtemp(path.join(tmpdir(),'polytope-export-test-')),manager=createAnimationExportManager();
  try{
    const destination=path.join(folder,'rotation.frames'),session=await manager.begin({format:'png',name:'Test',fps:1,frameCount:2,duration:1},destination);
    assert.deepEqual((await readdir(folder)).filter(file=>file==='rotation.frames'),[]);
    await assert.rejects(()=>manager.write(session.id,1,PNG),/consecutive/);
    await manager.write(session.id,0,PNG);await assert.rejects(()=>manager.finish(session.id),/incomplete/);
    await manager.write(session.id,1,PNG);const result=await manager.finish(session.id);
    assert.equal(result.path,destination);assert.deepEqual(await readdir(destination),['frame-000000.png','frame-000001.png','sequence.json']);
    const manifest=JSON.parse(await readFile(path.join(destination,'sequence.json'),'utf8'));assert.deepEqual(manifest.frameTimes,[0,1]);
    assert.equal(manifest.duration,1);await assert.rejects(()=>manager.write(session.id,2,PNG),/Unknown/);
  }finally{await manager.abortAll();await rm(folder,{recursive:true,force:true});}
});

test('cancel removes only its own temporary directory and preserves existing destination',async()=>{
  const folder=await mkdtemp(path.join(tmpdir(),'polytope-export-test-')),manager=createAnimationExportManager();
  try{
    const destination=path.join(folder,'existing.frames');await mkdir(destination);await writeFile(path.join(destination,'source.txt'),'preserve');
    await assert.rejects(()=>manager.begin({format:'png',fps:1,frameCount:2},destination),/existing folders/);
    await assert.rejects(()=>manager.begin({format:'png',fps:1,frameCount:2},'relative.frames'),/absolute/);
    const session=await manager.begin({format:'webm',fps:24,frameCount:25},path.join(folder,'movie.webm'));
    await assert.rejects(()=>manager.write(session.id,0,new Uint8Array([1,2,3,4])),/WebM header/);
    await manager.write(session.id,0,new Uint8Array([0x1a,0x45,0xdf,0xa3,1]));assert.equal(await manager.abort(session.id),true);
    assert.equal(await manager.abort(session.id),false);assert.deepEqual(await readdir(folder),['existing.frames']);
    assert.equal(await readFile(path.join(destination,'source.txt'),'utf8'),'preserve');
  }finally{await manager.abortAll();await rm(folder,{recursive:true,force:true});}
});

test('WebM chunks stream in order and replace a selected file only at finish',async()=>{
  const folder=await mkdtemp(path.join(tmpdir(),'polytope-export-test-')),manager=createAnimationExportManager();
  try{
    const destination=path.join(folder,'movie.webm');await writeFile(destination,'old video');
    const session=await manager.begin({format:'webm',fps:24,frameCount:25},destination);
    await manager.write(session.id,0,new Uint8Array([0x1a,0x45,0xdf,0xa3,1]));await manager.write(session.id,1,new Uint8Array([2,3]));
    assert.equal(await readFile(destination,'utf8'),'old video');await manager.finish(session.id);
    assert.deepEqual([...await readFile(destination)],[0x1a,0x45,0xdf,0xa3,1,2,3]);assert.deepEqual(await readdir(folder),['movie.webm']);
  }finally{await manager.abortAll();await rm(folder,{recursive:true,force:true});}
});

test('concurrent session creation respects resource limits and preserves a newly occupied destination',async()=>{
  const folder=await mkdtemp(path.join(tmpdir(),'polytope-export-test-')),manager=createAnimationExportManager();
  try{
    const attempts=await Promise.allSettled([0,1,2].map(index=>manager.begin({format:'png',fps:1,frameCount:2},path.join(folder,`rotation-${index}.frames`))));
    assert.equal(attempts.filter(result=>result.status==='fulfilled').length,2);
    const first=attempts[0].value;await manager.write(first.id,0,PNG);await manager.write(first.id,1,PNG);
    const destination=path.join(folder,'rotation-0.frames');await mkdir(destination);await writeFile(path.join(destination,'new-source.txt'),'preserved');
    await assert.rejects(()=>manager.finish(first.id),/already exists/);await manager.abortAll();
    assert.deepEqual(await readdir(folder),['rotation-0.frames']);assert.equal(await readFile(path.join(destination,'new-source.txt'),'utf8'),'preserved');
  }finally{await manager.abortAll();await rm(folder,{recursive:true,force:true});}
});

test('WebM signature validation accepts split stream headers and refuses truncated headers',async()=>{
  const folder=await mkdtemp(path.join(tmpdir(),'polytope-export-test-')),manager=createAnimationExportManager();
  try{
    const destination=path.join(folder,'movie.webm'),session=await manager.begin({format:'webm',fps:1,frameCount:2},destination);
    await manager.write(session.id,0,new Uint8Array([0x1a,0x45]));await assert.rejects(()=>manager.finish(session.id),/incomplete/);
    await manager.write(session.id,1,new Uint8Array([0xdf]));await manager.write(session.id,2,new Uint8Array([0xa3,1,2,3]));await manager.finish(session.id);
    assert.deepEqual([...await readFile(destination)],[0x1a,0x45,0xdf,0xa3,1,2,3]);
  }finally{await manager.abortAll();await rm(folder,{recursive:true,force:true});}
});

const WEBM_META=[0x1a,0x45,0xdf,0xa3,0x80,0x18,0x53,0x80,0x67,0xff];
const WEBM_FIRST=[0x1f,0x43,0xb6,0x75,0xff,0xe7,0x81,0,0xa3,0x85,0x81,0,0,0x80,1];
const WEBM_SECOND=[0xa3,0x85,0x81,0,100,0,2];

test('WebM readiness counts complete blocks across arbitrary chunk boundaries, excluding metadata payload signatures',()=>{
  const counter=new WebmFrameCounter();
  assert.equal(counter.feed(new Uint8Array(WEBM_META)),0);
  // A complete-looking cluster inside opaque metadata is not a video frame.
  assert.equal(counter.feed(new Uint8Array([0xec,0x80|WEBM_FIRST.length,...WEBM_FIRST])),0);
  for(const byte of WEBM_FIRST)counter.feed(new Uint8Array([byte]));assert.equal(counter.frames,1);
  for(const byte of WEBM_SECOND)counter.feed(new Uint8Array([byte]));assert.equal(counter.frames,2);
});

test('finite WebM cluster boundaries and truncated blocks cannot claim encoded frames',()=>{
  const counter=new WebmFrameCounter(),children=[0xe7,0x81,0,...WEBM_SECOND];
  counter.feed(new Uint8Array([...WEBM_META,0x1f,0x43,0xb6,0x75,0x80|children.length,...children]));assert.equal(counter.frames,1);
  counter.feed(new Uint8Array(WEBM_SECOND));assert.equal(counter.frames,1,'block outside a cluster is excluded');
  const truncated=new WebmFrameCounter();truncated.feed(new Uint8Array([...WEBM_META,...WEBM_FIRST.slice(0,-1)]));assert.equal(truncated.frames,0);
});
