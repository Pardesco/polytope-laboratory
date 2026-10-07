import test from 'node:test';
import assert from 'node:assert/strict';
import {MEMORY_LIMITS,createMemories,normalizeMemories,storeMemory,retrieveMemory,retrieveMemoryEntry,swapMemory,clearMemory,clearMemories} from '../ui/model-memories.mjs';
import {MemoryControls} from '../ui/memory-controls.mjs';

// Explicit incidence fixture, independent of kernel generators and memory code.
const cube=()=>({model:{name:'Cube',dimension:3,embeddingDimension:3,interpretation:'convex-polytope',
  vertices:[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]],
  edges:[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]],
  faces:[[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]],cells:[],metadata:{units:'model',references:['analytic Cartesian cube']}},
  view:{angles:[0,0,0,0,0,0],sectionOffset:0,cameraProjection:'orthographic',camera:{position:[3,2,4],target:[0,0,0]},surfaceOpacity:1},notes:'Cube notes'});
const section=()=>{const state=cube();state.model.name='Central tesseract section';state.model.metadata={sourceDimension:4,sourceCoordinates:'Cartesian {-1,1}^4',sourceNormal:[0,0,0,1],sourceDepth:0};state.model.provenance={operation:'section',sourceFingerprint:'independent-tesseract-fixture',convexified:false};state.view.angles=[15,0,0,0,0,0];state.notes='At w=0 the section is the Cartesian cube.';return state;};
const star=()=>({model:{name:'Ordered pentagram face',dimension:3,embeddingDimension:3,interpretation:'generalized-complex',
  vertices:[[1,0,0],[0.30901699437494745,0.9510565162951535,0],[-0.8090169943749473,0.5877852522924732,0],[-0.8090169943749476,-0.587785252292473,0],[0.30901699437494723,-0.9510565162951536,0]],
  edges:[[0,2],[2,4],[4,1],[1,3],[3,0]],faces:[[0,2,4,1,3]],cells:[],
  metadata:{offColors:{faces:[{encoding:'byte',values:[15,80,200,128]}],cells:[]},fillRule:'even-odd',sourceFaceReferences:[{face:12,cells:[2,5]}]},
  provenance:{operation:'source OFF',sourceSha256:'hand-authored',convexified:false}},view:{angles:[0,0,0,0,0,0],fillRule:'even-odd'},notes:'Self-crossing source face'});

test('legacy absent memories create nine explicit empty slots and useful errors',()=>{
  const memories=normalizeMemories(undefined);assert.deepEqual(memories,{version:1,slots:Array(9).fill(null)});
  assert.ok(Object.isFrozen(memories)&&Object.isFrozen(memories.slots));
  for(const slot of [0,10,1.5,'1',NaN,null])assert.throws(()=>retrieveMemory(memories,slot),/integer from 1 to 9/);
  assert.throws(()=>retrieveMemory(memories,1),/Memory 1 is empty/);
  assert.throws(()=>swapMemory(memories,9,cube()),/Memory 9 is empty/);
});

test('stored and retrieved geometry, view, notes and provenance never alias caller state',()=>{
  const current=cube(),source={documentId:'doc-A',stateId:'state-A',nested:{derivedMode:'base'}};
  const empty=createMemories(),memories=storeMemory(empty,1,current,source);
  current.model.vertices[0][0]=900;current.view.camera.target[0]=88;current.notes='changed';source.nested.derivedMode='section';
  const first=retrieveMemoryEntry(memories,1);assert.equal(first.state.model.vertices[0][0],-1);assert.equal(first.state.view.camera.target[0],0);assert.equal(first.state.notes,'Cube notes');assert.equal(first.source.nested.derivedMode,'base');
  first.state.model.faces[0].reverse();first.state.view.camera.position[0]=-99;first.source.documentId='other';
  assert.deepEqual(retrieveMemory(memories,1),cube());assert.equal(retrieveMemoryEntry(memories,1).source.documentId,'doc-A');assert.equal(empty.slots[0],null);
  assert.throws(()=>{memories.slots[0].state.model.vertices[0][0]=7;},TypeError);
});

test('swapping twice restores both states and both optional source identities',()=>{
  const a=cube(),b=section(),sourceA={documentId:'cube-document'},sourceB={documentId:'section-document',derivedMode:'section'};
  const original=storeMemory(createMemories(),4,a,sourceA);
  const first=swapMemory(original,4,b,sourceB);assert.deepEqual(first.state,a);assert.deepEqual(first.source,sourceA);assert.deepEqual(retrieveMemory(first.memories,4),b);
  const second=swapMemory(first.memories,4,first.state,first.source);assert.deepEqual(second.state,b);assert.deepEqual(second.source,sourceB);assert.deepEqual(second.memories,original);
  // Legacy models/states have no IDs; none are invented or required.
  assert.equal('id' in second.state,false);assert.equal('id' in second.state.model,false);
});

test('ordered generalized star incidence and source RGBA survive persisted JSON',()=>{
  const original=star(),stored=storeMemory(createMemories(),9,original,{derivedMode:'face',sourceFace:12});
  const persisted=normalizeMemories(JSON.parse(JSON.stringify(stored))),restored=retrieveMemory(persisted,9);
  assert.deepEqual(restored,original);assert.deepEqual(restored.model.faces,[[0,2,4,1,3]]);assert.deepEqual(restored.model.edges,original.model.edges);
  assert.equal(restored.model.interpretation,'generalized-complex');assert.deepEqual(restored.model.metadata.offColors.faces[0].values,[15,80,200,128]);assert.equal(restored.model.provenance.convexified,false);
});

test('tesseract-derived section snapshots retain intrinsic dimension and source context',()=>{
  const state=section(),memories=storeMemory(createMemories(),3,state,{documentId:'4D-source',derivedMode:'section'});
  const result=retrieveMemory(memories,3);assert.equal(result.model.dimension,3);assert.equal(result.model.vertices.length,8);assert.equal(result.model.faces.length,6);
  assert.deepEqual(result.model.metadata.sourceNormal,[0,0,0,1]);assert.equal(result.model.provenance.sourceFingerprint,'independent-tesseract-fixture');assert.deepEqual(result.view.angles,[15,0,0,0,0,0]);assert.deepEqual(result,state);
});

test('four-dimensional source cells and cell RGBA survive without projection',()=>{
  const state={model:{name:'Cartesian 4-simplex',dimension:4,embeddingDimension:4,interpretation:'convex-polytope',
    vertices:[[0,0,0,0],[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]],
    edges:[[0,1],[0,2],[0,3],[0,4],[1,2],[1,3],[1,4],[2,3],[2,4],[3,4]],
    faces:[[0,1,2],[0,1,3],[0,1,4],[0,2,3],[0,2,4],[0,3,4],[1,2,3],[1,2,4],[1,3,4],[2,3,4]],
    cells:[[6,7,8,9],[3,4,5,9],[1,2,5,8],[0,2,4,7],[0,1,3,6]],
    metadata:{offColors:{cells:Array.from({length:5},(_,index)=>({encoding:'unit',values:[index/5,.5,.8,.25]}))}}},
    view:{angles:[15,20,25,30,35,40],projection:'stereographic',hiddenCells:[2],sectionNormal:[0,0,0,1],sectionOffset:.25}};
  const bank=normalizeMemories(JSON.parse(JSON.stringify(storeMemory(createMemories(),8,state))));
  const restored=retrieveMemory(bank,8);assert.deepEqual(restored,state);assert.equal(restored.model.vertices[4].length,4);assert.deepEqual(restored.model.cells[0],[6,7,8,9]);assert.deepEqual(restored.view.hiddenCells,[2]);
});

test('all nine slots remain independent and clearing preserves earlier banks',()=>{
  let memories=createMemories();for(let slot=1;slot<=9;slot++){const state=cube();state.notes=`slot ${slot}`;memories=storeMemory(memories,slot,state);}
  for(let slot=1;slot<=9;slot++)assert.equal(retrieveMemory(memories,slot).notes,`slot ${slot}`);
  const cleared=clearMemory(memories,5);assert.throws(()=>retrieveMemory(cleared,5),/empty/);assert.equal(retrieveMemory(cleared,4).notes,'slot 4');assert.equal(retrieveMemory(memories,5).notes,'slot 5');
  assert.deepEqual(clearMemories(cleared),createMemories());assert.deepEqual(clearMemory(createMemories(),7),createMemories());
});

test('generalized surface-section lines preserve open incidence without solid inference',()=>{
  const state={model:{dimension:2,embeddingDimension:2,interpretation:'surface-section',name:'Disconnected face intersections',vertices:[[0,0],[1,0],[2,0],[3,0]],edges:[[0,1],[2,3]],faces:[],cells:[],metadata:{fillSemantics:'source-face-intersection',sourceReferences:[{edge:2},{edge:6}]}},view:{fillRule:'nonzero'}};
  assert.deepEqual(retrieveMemory(storeMemory(createMemories(),2,state),2),state);
});

test('invalid coordinates, references, views and known-invalid models are rejected',()=>{
  const invalid=[];
  const coord=cube();coord.model.vertices[0][0]=Infinity;invalid.push(coord);
  const edge=cube();edge.model.edges[0]=[0,99];invalid.push(edge);
  const face=cube();face.model.faces[0]=[0,3,2,99];invalid.push(face);
  const missing=cube();missing.model.edges.pop();invalid.push(missing);
  const duplicate=cube();duplicate.model.edges.push([1,0]);invalid.push(duplicate);
  const cell=cube();cell.model.cells=[[77]];invalid.push(cell);
  const dimension=cube();dimension.model.dimension=5;invalid.push(dimension);
  const view=cube();view.view=null;invalid.push(view);
  const failed=cube();failed.model.validation={passed:false};invalid.push(failed);
  const nested=cube();nested.model.metadata.unknownNumeric=NaN;invalid.push(nested);
  for(const state of invalid)assert.throws(()=>storeMemory(createMemories(),1,state));
  for(const value of [null,{version:2,slots:Array(9).fill(null)},{version:1,slots:[]},{version:1,slots:Array(9)},{version:1,slots:Array(9).fill(undefined)}])assert.throws(()=>normalizeMemories(value));
});

test('cycles, getters and non-JSON data cannot enter snapshots or execute on load',()=>{
  const circular=cube();circular.view.loop=circular;assert.throws(()=>storeMemory(createMemories(),1,circular),/circular/);
  for(const value of [()=>{},new Date(),new Uint8Array([1]),1n]){const state=cube();state.view.extra=value;assert.throws(()=>storeMemory(createMemories(),1,state),/plain JSON/);}
  let invoked=0;const getter=cube();Object.defineProperty(getter.view,'trap',{enumerable:true,get(){invoked++;return 1;}});assert.throws(()=>storeMemory(createMemories(),1,getter),/accessors/);
  const bank={slots:Array(9).fill(null)};Object.defineProperty(bank,'version',{enumerable:true,get(){invoked++;return 1;}});assert.throws(()=>normalizeMemories(bank),/Unsupported/);assert.equal(invoked,0);
  const sparse=cube();sparse.view.extra=Array(2);assert.throws(()=>storeMemory(createMemories(),1,sparse),/sparse/);
  const arrayProperty=cube();arrayProperty.view.extra=[1];arrayProperty.view.extra[-1]=2;assert.throws(()=>storeMemory(createMemories(),1,arrayProperty),/custom array/);
});

test('JSON normalization preserves prototype-looking metadata as harmless own data',()=>{
  const state=cube();state.model.metadata=JSON.parse('{"__proto__":{"fixture":true},"constructor":"source constructor label"}');state.view.optional=undefined;
  const stored=storeMemory(createMemories(),1,state),restored=retrieveMemory(stored,1);
  assert.equal(Object.getPrototypeOf(restored.model.metadata),Object.prototype);assert.equal(Object.hasOwn(restored.model.metadata,'__proto__'),true);assert.equal(restored.model.metadata.__proto__.fixture,true);assert.equal({}.fixture,undefined);assert.equal('optional' in restored.view,false);
});

test('nesting and serialized slot/total byte limits are enforced before publication',()=>{
  const deep=cube();let current=deep.view;for(let index=0;index<=MEMORY_LIMITS.depth;index++)current=current.child={};assert.throws(()=>storeMemory(createMemories(),1,deep),/nesting/);
  const oversized=cube();oversized.notes='x'.repeat(MEMORY_LIMITS.slotBytes+1);assert.throws(()=>storeMemory(createMemories(),1,oversized),/32 MiB/);
  const unicode=cube();unicode.notes='\u20ac'.repeat(Math.ceil(MEMORY_LIMITS.slotBytes/3));assert.throws(()=>storeMemory(createMemories(),1,unicode),/32 MiB/);
  const large=cube();large.notes='x'.repeat(16*1024*1024);let memories=createMemories();for(let slot=1;slot<=7;slot++)memories=storeMemory(memories,slot,large);
  assert.throws(()=>storeMemory(memories,8,large),/128 MiB total/);assert.equal(memories.slots[7],null);assert.equal(memories.slots[0].state.model.vertices[0][0],-1);
  assert.throws(()=>normalizeMemories({version:1,slots:Array(9).fill({state:large,source:{}})}),/128 MiB total/);
});

function controlsFixture({restoreState,getDerivedState,isExporting}={}){
  let current=cube(),dirty=0;const project={memories:storeMemory(createMemories(),1,section(),{documentId:'section-source'})};
  const controls=Object.create(MemoryControls.prototype);controls.busy=false;controls.nodes={slot:{value:'1'},source:{value:'base'}};controls.sync=()=>{};
  controls.context={getProject:()=>project,getState:()=>current,getSource:()=>({documentId:'current-source'}),getDerivedState,isExporting:isExporting||(()=>false),restoreState:restoreState||((state)=>{current=state;}),markDirty:()=>{dirty++;},setStatus:()=>{}};
  return {controls,project,current:()=>current,setCurrent:state=>{current=state;},dirty:()=>dirty};
}

test('UI swap keeps original memory when authoritative restore validation rejects',async()=>{
  const fixture=controlsFixture({restoreState:async()=>{throw new Error('Independent certificate validation failed.');}}),before=fixture.project.memories,current=fixture.current();
  await assert.rejects(()=>fixture.controls.swap(1),/certificate validation failed/);
  assert.equal(fixture.project.memories,before);assert.equal(fixture.current(),current);assert.equal(fixture.dirty(),0);assert.equal(fixture.controls.busy,false);
});

test('UI swap publishes only after successful restore and retains original current geometry',async()=>{
  const fixture=controlsFixture(),before=fixture.project.memories,current=fixture.current();let observed;
  fixture.controls.context.restoreState=async(state)=>{observed=fixture.project.memories;fixture.setCurrent(state);};
  await fixture.controls.swap(1);assert.equal(observed,before);assert.deepEqual(fixture.current(),section());assert.deepEqual(retrieveMemory(fixture.project.memories,1),current);assert.equal(fixture.dirty(),1);
});

test('UI derived capture discards a result after its source document changes',async()=>{
  let resolve;const pending=new Promise(done=>{resolve=done;});const fixture=controlsFixture({getDerivedState:()=>pending}),before=fixture.project.memories;
  fixture.controls.nodes.source.value='derived';const action=fixture.controls.store(3);fixture.setCurrent(section());resolve(section());
  await assert.rejects(()=>action,/Source document changed/);assert.equal(fixture.project.memories,before);assert.equal(fixture.project.memories.slots[2],null);assert.equal(fixture.dirty(),0);
});

test('UI memory actions refuse changes during animation export',async()=>{
  const fixture=controlsFixture({isExporting:()=>true}),before=fixture.project.memories;
  for(const action of ['store','open','swap','clear','add'])await assert.rejects(()=>fixture.controls[action](1),/animation export/);
  assert.equal(fixture.project.memories,before);assert.equal(fixture.dirty(),0);
});

test('UI Add supplies detached Model and memory inputs without changing the slot',async()=>{
  const fixture=controlsFixture(),before=fixture.project.memories,original=structuredClone(fixture.current());let called=0;
  fixture.controls.context.addStates=async(current,stored,label)=>{called++;assert.deepEqual(current,original);assert.deepEqual(stored,section());assert.equal(label,'Add memory 1');current.model.vertices[0][0]=88;stored.model.vertices[0][0]=99;};
  await fixture.controls.add(1);assert.equal(called,1);assert.deepEqual(fixture.current(),original);assert.equal(fixture.project.memories,before);assert.deepEqual(retrieveMemory(before,1),section());assert.equal(fixture.dirty(),0);
});

test('UI Add uses the selected Derived source and preserves bank on native failure',async()=>{
  const derived=section(),fixture=controlsFixture({getDerivedState:()=>derived}),before=fixture.project.memories,current=fixture.current();
  fixture.controls.nodes.source.value='derived';fixture.controls.context.addStates=async(source,stored)=>{assert.deepEqual(source,derived);assert.deepEqual(stored,section());source.model.vertices[0][0]=123;throw new Error('Component dimensionality rejected.');};
  await assert.rejects(()=>fixture.controls.add(1),/dimensionality rejected/);assert.equal(fixture.current(),current);assert.equal(fixture.project.memories,before);assert.deepEqual(derived,section());assert.equal(fixture.controls.busy,false);
  await assert.rejects(()=>fixture.controls.add(9),/empty/);
});
