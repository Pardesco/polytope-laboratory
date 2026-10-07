import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {ExpressionEntry,splitExpressionVector} from '../ui/expression-entry.mjs';
import {NetEditor} from '../ui/net-editor.js';
import {CellNetEditor} from '../ui/cell-net-editor.js';

const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const values={'25.4/2':12.7,'210 - 2*5':200,'297 / 3':99,'10/2':5,'2 + 3':5,'3 + 4':7,
  'sqrt(4)':2,'min(1, 2)':1,'max(3, min(4, 5))':4,'sind(90) * 45':45,'-sqrt(9)':-3,'1 / 2':.5};
const cube=()=>({id:'literal-cube',fingerprint:'source-binding',dimension:3,embeddingDimension:3,
  vertices:[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]],
  edges:[[0,1],[0,3],[0,4],[1,2],[1,5],[2,3],[2,6],[3,7],[4,5],[4,7],[5,6],[6,7]],
  faces:[[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]],cells:[],
  metadata:{coordinateUnits:'mm',offColors:{faces:[{encoding:'unit',values:[.1,.2,.3,.4]},null,null,null,null,null],cells:[]}}});
function fixture(){
  const state={model:cube(),view:{angles:[0,0,0,0,0,0],coordinateUnit:'mm'},notes:'Keep source notes'},
    document={id:'source-document',cursor:0,states:[state]};
  let project={active:0,documents:[document]},exporting=false,busy=false;
  const calls=[];
  const context={getProject:()=>project,getDocument:()=>project.documents[project.active],
    getState:()=>context.getDocument()?.states[context.getDocument().cursor],getModel:()=>context.getState()?.model,
    isExporting:()=>exporting,isBusy:()=>busy,
    number:async text=>{calls.push(['number',text]);if(text==='bad')throw Error('Unknown expression.');return values[text]??Number(text);},
    guard:fn=>fn,markDirty:()=>calls.push(['dirty']),refresh:()=>calls.push(['refresh']),viewer:{},api:{},setStatus:()=>{},onSourceSelection:()=>{},
    run:async(op,params,model)=>{calls.push(['run',op,params,model]);return {root:0,tabs:true,referenceEdgeLengthMm:25,hinges:[],connections:[],placements:[],components:[{root:0}]};}};
  return {context,state,document,calls,setProject:value=>project=value,setExport:value=>exporting=value,setBusy:value=>busy=value,get project(){return project;}};
}

// Small DOM fixture exercises the production constructors and their actual
// registered button handlers. Geometry/expression evaluation remain injected APIs.
function dom(){
  const nodes=new Map();
  class Element{
    constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.dataset={};this.value='';this.disabled=false;this.checked=false;this.type='text';this.hidden=false;}
    set id(id){this._id=id;nodes.set(id,this);}get id(){return this._id;}
    get firstChild(){return this.children[0]??null;}
    append(...elements){for(const e of elements){if(e.parent)e.parent.children.splice(e.parent.children.indexOf(e),1);e.parent=this;this.children.push(e);}}
    prepend(e){this.append(e);this.children.splice(this.children.indexOf(e),1);this.children.unshift(e);}
    after(e){if(this.parent){this.parent.append(e);this.parent.children.splice(this.parent.children.indexOf(e),1);this.parent.children.splice(this.parent.children.indexOf(this)+1,0,e);}}
    insertBefore(e,reference){this.append(e);const i=this.children.indexOf(reference);if(i>=0){this.children.splice(this.children.indexOf(e),1);this.children.splice(i,0,e);}}
    set innerHTML(html){this.children=[];for(const match of html.matchAll(/<(input|select|button|div|label|output)\b([^>]*\bid="([^"]+)"[^>]*)>/g)){
      const e=new Element(match[1]);e.id=match[3];e.type=/\btype="([^"]+)"/.exec(match[2])?.[1]??'text';
      e.value=/\bvalue="([^"]*)"/.exec(match[2])?.[1]??'';e.checked=/\bchecked\b/.test(match[2]);this.append(e);
    }}
    querySelector(selector){return selector==='.inspector-tabs'?tabs:nodes.get(selector.slice(1));}
    replaceChildren(...elements){this.children=[];this.append(...elements);}
  }
  const inspector=new Element(),tabs=new Element();inspector.append(tabs);
  for(const id of ['derived-mode','net-preview','derived-canvas','derived-status']){const e=new Element();e.id=id;}
  const previous=globalThis.document;
  globalThis.document={createElement:tag=>new Element(tag),getElementById:id=>nodes.get(id),querySelector:()=>inspector};
  return {nodes,restore:()=>globalThis.document=previous};
}
function editors(){
  const d=dom(),f=fixture();
  try{f.net=new NetEditor(f.context);f.cell=new CellNetEditor(f.context);}
  finally{d.restore();}
  f.nodes=d.nodes;
  // The browser's document persists; retain the same DOM lookup for this
  // isolated fixture after restoring the test runner's global document.
  f.net.$=f.cell.$=id=>d.nodes.get(id);
  f.state.view.net={root:0,length:25,tabs:true,display:'layout',fraction:0,action:'move',component:0};
  f.state.view.cellNet={root:0,shrink:1,component:0,selection:null};
  for(const [id,value] of Object.entries({'net-paper':'a4','net-paper-orientation':'portrait','net-component':'0','cell-net-component':'0'}))f.nodes.get(id).value=value;
  return f;
}
const clicked=(f,id)=>f.nodes.get(id).onclick();
const runs=f=>f.calls.filter(row=>row[0]==='run');
const netRecord=()=>({root:0,tabs:true,referenceEdgeLengthMm:25,hinges:[],connections:[],placements:[],components:[{root:0}]});

test('vector delimiters preserve function arguments and arithmetic whitespace',()=>{
  assert.deepEqual(splitExpressionVector('min(1, 2), sqrt(4), 3 + 4'),['min(1, 2)','sqrt(4)','3 + 4']);
  assert.deepEqual(splitExpressionVector('max(3, min(4, 5)); -sqrt(9); 1 / 2'),['max(3, min(4, 5))','-sqrt(9)','1 / 2']);
  assert.deepEqual(splitExpressionVector('0 -2 +3e-2'),['0','-2','+3e-2']);
  for(const text of ['1 + 2 3','min(1,2) 3 4','1,,3','1,2,','(1,2,3','1),2,3','1,2,3,4'])assert.throws(()=>splitExpressionVector(text));
  assert.throws(()=>splitExpressionVector('('.repeat(65)+'1'+')'.repeat(65)+',2,3'),/nesting/);
});

test('expressions resolve as finite numbers without evaluating any IDs or symbols',async()=>{
  const f=fixture(),entry=new ExpressionEntry(f.context),before=structuredClone(f.project);
  assert.deepEqual(await entry.run({length:'25.4/2',xyz:splitExpressionVector('min(1, 2), sqrt(4), 3 + 4')},values=>values),{length:12.7,xyz:[1,2,7]});
  assert.deepEqual(f.project,before);assert.equal(entry.busy,false);
});

test('all values and bounded syntax validate before publication; failures release the busy lock',async()=>{
  for(const bad of ['bad','Infinity','NaN','', '1'.repeat(513)]){
    const f=fixture(),entry=new ExpressionEntry(f.context);let published=false;
    await assert.rejects(()=>entry.run({first:'2',last:bad},()=>published=true));assert.equal(published,false);assert.equal(entry.busy,false);
    assert.equal(await entry.run({value:'3'},v=>v.value),3);
  }
  for(const value of [true,null,1n,1e101]){
    const f=fixture(),entry=new ExpressionEntry(f.context);f.context.number=async()=>value;
    await assert.rejects(()=>entry.run({value:'1'},()=>assert.fail()),/finite real/);
  }
  const f=fixture(),entry=new ExpressionEntry(f.context);await assert.rejects(()=>entry.run({values:Array(33).fill('1')},()=>{}),/32-value/);
  assert.deepEqual(f.calls,[]);
  const hostile={};Object.defineProperty(hostile,'value',{get:()=>assert.fail('getter executed'),enumerable:true});
  await assert.rejects(()=>entry.run(hostile,()=>{}),/accessors/);
  await assert.rejects(()=>entry.run({values:Array(3)},()=>{}),/plain entries/);
});

test('every expression await rejects workspace/source/view/unit/notes/cache ownership changes',async()=>{
  const changes=[f=>f.setProject({...f.project}),f=>f.project.documents[0]={...f.document},f=>f.document.id='new-id',
    f=>f.document.states=[...f.document.states],f=>{f.document.states.push(structuredClone(f.state));f.document.cursor=1;},
    f=>f.state.model={...f.state.model},f=>f.state.model.vertices[0][0]=3,
    f=>f.state.model.metadata.offColors.faces[0].values[3]=.9,f=>f.state.view.coordinateUnit='in',
    f=>f.state.view.angles[0]=12,f=>f.state.view.camera={zoom:2},f=>f.state.view={...f.state.view},
    f=>f.state.notes='Changed',f=>f.state.netLayout={},f=>f.state.cellNetLayout={},f=>f.state.netPages={},
    f=>f.setExport(true),f=>f.setBusy(true)];
  for(let after=1;after<=3;after++)for(const change of changes){
    const f=fixture(),entry=new ExpressionEntry(f.context);let count=0,published=false;
    f.context.number=async()=>{if(++count===after)change(f);return 2;};
    await assert.rejects(()=>entry.run({values:['1','2','3']},()=>published=true),/changed|export|current operation/);
    assert.equal(published,false);assert.equal(count,after);assert.equal(entry.busy,false);
  }
});

test('concurrent edit refuses without changing or cancelling the first captured request',async()=>{
  const f=fixture(),entry=new ExpressionEntry(f.context),hold=deferred();f.context.number=()=>hold.promise;
  const fields={length:'2'},running=entry.run(fields,v=>v);fields.length='99';
  await assert.rejects(()=>entry.run({length:'3'},()=>{}),/current expression edit/);hold.resolve(2);
  assert.deepEqual(await running,{length:2});assert.equal(entry.busy,false);
});

test('source/resource validation precedes serialization and native expression evaluation',async()=>{
  for(const mutate of [f=>f.state.notes='x'.repeat(32*1024*1024+1),
    f=>{let x={},p=x;for(let i=0;i<66;i++)p=p.next={};f.state.model.metadata.deep=x;},
    f=>Object.defineProperty(f.state.model.metadata,'invalid',{get:()=>assert.fail('getter executed'),enumerable:true})]){
    const f=fixture();mutate(f);await assert.rejects(()=>new ExpressionEntry(f.context).run({value:'1'},()=>{}));assert.deepEqual(f.calls,[]);
  }
});

test('production Generate/reset and Separate buttons accept E0 expressions without changing literal root IDs',async()=>{
  for(const id of ['net-rebuild','net-separate']){
    const f=editors(),source=structuredClone(f.state.model);f.nodes.get('net-root').value='2';f.nodes.get('net-length').value='25.4/2';
    await clicked(f,id);assert.deepEqual(f.calls,[['number','25.4/2'],['dirty'],['refresh']]);
    assert.equal(f.state.view.net.length,12.7);assert.equal(f.state.view.net.root,2);assert.equal(f.state.netSeparate,id==='net-separate');
    assert.equal(f.state.view.derivedMode,'net');assert.deepEqual(f.state.model,source);assert.equal(f.nodes.get('net-length').type,'text');
    assert.equal(f.nodes.get('net-root').type,'number');
  }
  for(const text of ['2/1','sqrt(4)','1.5','-1','6']){const f=editors();f.nodes.get('net-root').value=text;await assert.rejects(()=>clicked(f,'net-rebuild'));assert.deepEqual(f.calls,[]);}
});

test('invalid or stale E0 makes no partial config/layout/history mutations',async()=>{
  for(const text of ['1/2','1001','bad']){
    const f=editors();f.state.netLayout=netRecord();const before=structuredClone(f.state);f.nodes.get('net-length').value=text;
    await assert.rejects(()=>clicked(f,'net-rebuild'));assert.deepEqual(f.state,before);assert.ok(!f.calls.some(c=>c[0]==='dirty'));
  }
  const f=editors(),hold=deferred();f.context.number=()=>hold.promise;f.nodes.get('net-length').value='25.4/2';
  const running=clicked(f,'net-separate');f.state.view.coordinateUnit='in';const after=structuredClone(f.state);hold.resolve(12.7);
  await assert.rejects(running,/changed/);assert.deepEqual(f.state,after);assert.equal(f.net.expressionEntry.busy,false);
});

test('production paper Pack button evaluates all custom dimensions/margins/gaps atomically',async()=>{
  const f=editors(),source=structuredClone(f.state.model);f.nodes.get('net-paper').value='custom';
  for(const [id,text] of Object.entries({'net-paper-width':'210 - 2*5','net-paper-height':'297 / 3','net-paper-margin':'10/2','net-paper-gap':'2 + 3'}))f.nodes.get(id).value=text;
  await clicked(f,'net-pack');assert.deepEqual(f.state.view.netPrint,{paper:'custom',orientation:'portrait',width_mm:200,height_mm:99,margin_mm:5,gap_mm:5,allow_rotation:true});
  assert.equal(f.state.view.net.display,'pages');assert.deepEqual(f.state.model,source);
  for(const id of ['net-paper-width','net-paper-height','net-paper-margin','net-paper-gap'])assert.equal(f.nodes.get(id).type,'text');
  const preset=editors();preset.nodes.get('net-paper-width').value='bad';preset.nodes.get('net-paper-height').value='bad';
  await clicked(preset,'net-pack');assert.equal(preset.calls.filter(c=>c[0]==='number').length,2);
});

test('paper invalid dimensions/margins/gaps or export starting during any input never partially apply',async()=>{
  for(const [id,text] of [['net-paper-width','19'],['net-paper-height','2001'],['net-paper-margin','105'],['net-paper-gap','101'],['net-paper-gap','bad']]){
    const f=editors();f.nodes.get('net-paper').value='custom';f.nodes.get(id).value=text;const before=structuredClone(f.state);
    await assert.rejects(()=>clicked(f,'net-pack'));assert.deepEqual(f.state,before);
  }
  for(const after of [1,2,3,4]){const f=editors();f.nodes.get('net-paper').value='custom';let count=0;
    f.context.number=async text=>{if(++count===after)f.setExport(true);return Number(text);};const before=structuredClone(f.state);
    await assert.rejects(()=>clicked(f,'net-pack'),/export/);assert.deepEqual(f.state,before);assert.equal(count,after);
  }
});

test('production net Move button sends evaluated XY/angle and preserves full source',async()=>{
  const f=editors();f.state.netLayout=netRecord();const source=structuredClone(f.state.model);
  f.nodes.get('net-move-x').value='sqrt(4)';f.nodes.get('net-move-y').value='-sqrt(9)';f.nodes.get('net-angle').value='sind(90) * 45';
  await clicked(f,'net-move');const request=runs(f)[0];assert.equal(request[1],'net-edit');
  assert.deepEqual(request[2].translation,[2,-3]);assert.equal(request[2].angle,45);assert.equal(request[2].component,0);
  assert.deepEqual(f.state.model,source);assert.equal(f.state.netHistory.states.length,1);
});

test('production cell Move button evaluates six XYZ values with nested function commas',async()=>{
  const f=editors();f.state.cellNetLayout=netRecord();const source=structuredClone(f.state.model);
  f.nodes.get('cell-net-translation').value='min(1, 2), sqrt(4), 3 + 4';
  f.nodes.get('cell-net-angles').value='sind(90) * 45; max(3, min(4, 5)); -sqrt(9)';
  await clicked(f,'cell-net-move');const request=runs(f)[0];assert.equal(request[1],'cell-net-edit');
  assert.deepEqual(request[2].translation,[1,2,7]);assert.deepEqual(request[2].angles,[45,4,-3]);
  assert.deepEqual(f.state.model,source);assert.equal(f.state.cellNetHistory.states.length,1);
});

test('cell malformed vectors, expression failure, literal component refusal never invoke edit or mutate view',async()=>{
  for(const [id,text] of [['cell-net-translation','1,2,'],['cell-net-translation','min(1,2) 3 4'],
    ['cell-net-angles','0, bad, 0'],['cell-net-component','sqrt(4)']]){
    const f=editors();f.state.cellNetLayout=netRecord();f.nodes.get(id).value=text;const before=structuredClone(f.state);
    await assert.rejects(()=>clicked(f,'cell-net-move'));assert.deepEqual(f.state,before);assert.deepEqual(runs(f),[]);
  }
});

test('both placement editors fence source/view/export changes during expression and native awaits',async()=>{
  for(const kind of ['net','cell'])for(const phase of ['expression','native'])for(const change of [f=>f.state.view.coordinateUnit='cm',
    f=>f.state.model.metadata.offColors.faces[0].values[3]=.8,f=>f.state.view.angles[0]=30,f=>f.state.notes='New notes',f=>f.setExport(true)]){
    const f=editors(),key=kind==='net'?'netLayout':'cellNetLayout',id=kind==='net'?'net-move':'cell-net-move',hold=deferred();
    f.state[key]=netRecord();const old=f.state[key];
    if(phase==='expression')f.context.number=()=>hold.promise;else f.context.run=()=>hold.promise;
    // The constructor retains the original native run function, while the
    // expression context intentionally reads the supplied evaluator dynamically.
    if(phase==='native')f[kind].run=f.context.run;
    const running=clicked(f,id);await flush();change(f);const after=structuredClone(f.state);
    hold.resolve(phase==='expression'?0:netRecord());await assert.rejects(running,/changed|export/);
    assert.equal(f.state[key],old);assert.deepEqual(f.state,after);assert.equal(f[kind].expressionEntry.busy,false);
  }
});

test('native refusal releases placement lock and later expression placement succeeds',async()=>{
  const f=editors();f.state.netLayout=netRecord();const before=structuredClone(f.state);let count=0;
  f.net.run=async()=>{if(!count++)throw Error('Native placement validation failed.');return netRecord();};
  await assert.rejects(()=>clicked(f,'net-move'),/Native placement/);assert.deepEqual(f.state,before);
  assert.equal(f.net.expressionEntry.busy,false);await clicked(f,'net-move');assert.equal(f.state.netHistory.states.length,1);
});

test('real native parser and net kernel accept production button expressions with rigid distances preserved',async()=>{
  const execute=promisify(execFile),script=`import json,sys\nfrom engine.server import dispatch\np=json.load(sys.stdin)\nresult=dispatch(p)\nprint(json.dumps(result,allow_nan=False))`;
  async function native(request){
    // execFile has no stdin option: use the JSON request as a bounded argument.
    const program=script.replace('p=json.load(sys.stdin)','p=json.loads(sys.argv[1])');
    const {stdout}=await execute(process.env.POLYTOPE_TEST_PYTHON||'python',['-B','-c',program,JSON.stringify(request)],
      {cwd:new URL('..',import.meta.url),windowsHide:true,maxBuffer:8*1024*1024});
    return JSON.parse(stdout);
  }
  const f=editors();
  // Native generator establishes the existing convex cache from the literal
  // cube's independently checked coordinate/edge/face fixture.
  const generated=await native({op:'generate',params:{kind:'regular',key:'cube'}});
  assert.equal(generated.vertices.length,8);assert.equal(generated.edges.length,12);assert.equal(generated.faces.length,6);
  f.state.model=generated;f.context.number=async expression=>(await native({op:'expression',params:{expression}})).value;
  f.net.run=(op,params,model)=>native({op,params,model});
  f.nodes.get('net-length').value='25.4/2';await clicked(f,'net-rebuild');
  f.state.netLayout=await native({op:'net',model:generated,params:{edge_length_mm:f.state.view.net.length,tabs:true}});
  f.nodes.get('net-move-x').value='min(1, 2)';f.nodes.get('net-move-y').value='sqrt(4)';f.nodes.get('net-angle').value='sind(90) * 45';
  const coordinates=structuredClone(f.state.model.vertices);await clicked(f,'net-move');
  assert.equal(f.state.netLayout.referenceEdgeLengthMm,12.7);assert.deepEqual(f.state.model.vertices,coordinates);
  const face=f.state.netLayout.faces[0],points=face.points;
  assert.ok(points?.length===4);for(let i=0;i<4;i++)assert.ok(Math.abs(Math.hypot(...points[i].map((x,j)=>x-points[(i+1)%4][j]))-12.7)<1e-8);

  const c=editors(),tesseract=await native({op:'generate',params:{kind:'regular',key:'tesseract'}});
  assert.deepEqual([tesseract.vertices.length,tesseract.edges.length,tesseract.faces.length,tesseract.cells.length],[16,32,24,8]);
  tesseract.metadata.coordinateUnits='mm';tesseract.metadata.offColors={
    faces:Array.from({length:24},(_,i)=>({encoding:'unit',values:[i/24,.2,.3,.4]})),
    cells:Array.from({length:8},(_,i)=>({encoding:'unit',values:[i/8,.3,.4,.5]}))};
  c.state.model=tesseract;c.context.number=f.context.number;c.cell.run=(op,params,model)=>native({op,params,model});
  c.state.cellNetLayout=await native({op:'cell-net',model:tesseract,params:{root:0}});
  const original=structuredClone(c.state.model);
  c.nodes.get('cell-net-translation').value='min(1, 2), sqrt(4), 3 + 4';
  c.nodes.get('cell-net-angles').value='sind(90) * 45; max(3, min(4, 5)); -sqrt(9)';
  await clicked(c,'cell-net-move');assert.deepEqual(c.state.model,original);assert.equal(c.state.cellNetLayout.cells.length,8);
  for(const cell of c.state.cellNetLayout.cells)for(let a=0;a<cell.sourceVertices.length;a++)for(let b=a+1;b<cell.sourceVertices.length;b++){
    const v=original.vertices[cell.sourceVertices[a]],w=original.vertices[cell.sourceVertices[b]];
    const before=Math.hypot(...v.map((x,i)=>x-w[i])),after=Math.hypot(...cell.points[a].map((x,i)=>x-cell.points[b][i]));
    assert.ok(Math.abs(before-after)<1e-8,'every retained 4D source-cell pair distance remains rigid in XYZ');
  }
});
