/** Shared headless source/DOM/native-provider fixture; never mounts a browser. */
import {exactRational} from '../ui/numeric-entry.mjs';
export const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
export const flush=()=>new Promise(resolve=>setImmediate(resolve));
const realValues={'sqrt(4)':2,'sqrt(9)':3,'1/2':.5,'2+3':5,'2 + 3':5,'3+3':6,'2/1':2,'128/2':64,
  '-(1+1)':-2,'3/2':1.5,'1+1':2,'32/2':16};
const exactValues={'2+3':'5','2 + 3':'5','1+1':'2','4 - 1/10^40':'39999999999999999999999999999999999999999/10000000000000000000000000000000000000000'};
export function rationalFixtureValue(text){
  if(text in exactValues)return exactValues[text];
  if(!/^[+-]?\d+(?:\/\d+)?$/.test(text))throw Error('An exact rational expression is required.');
  const [top,bottom='1']=text.split('/');let n=BigInt(top),d=BigInt(bottom);if(d===0n)throw Error('Division by zero.');
  let a=n<0n?-n:n,b=d;while(b){const next=a%b;a=b;b=next;}n/=a;d/=a;
  const result=d===1n?String(n):`${n}/${d}`;exactRational(result);return result;
}
export function numericControlFixture(Prototype,values){
  const nodes=Object.fromEntries(Object.entries(values).map(([id,value])=>[id,{value,disabled:false,hidden:false}]));
  const state={model:{id:'literal-source',dimension:3,embeddingDimension:3,name:'Literal tetrahedron',
    vertices:[[0,0,0],[1,0,0],[0,1,0],[0,0,1]],edges:[[0,1],[0,2],[0,3],[1,2],[1,3],[2,3]],
    faces:[[0,2,1],[0,1,3],[0,3,2],[1,2,3]],cells:[],metadata:{coordinateUnits:'mm',offColors:{
      faces:[{encoding:'unit',values:[.2,.4,.6,.8]},null,null,null],cells:[]}}},
    view:{coordinateUnit:'mm',angles:[0,0,0,0,0,0]},notes:'Keep source notes'},
    document={id:'source-document',cursor:0,states:[state]};
  let project={active:0,documents:[document]},exporting=false;
  const calls=[],expressionCalls=[],result={id:'generated-model'},options=[];
  const context={getProject:()=>project,getDocument:()=>project.documents[project.active],
    getState:()=>context.getDocument().states[context.getDocument().cursor],isExporting:()=>exporting,guard:fn=>fn,
    evaluateMany:async(parts,{mode,signal})=>{
      expressionCalls.push({parts:[...parts],mode,signal});return parts.map(text=>mode==='rational'?rationalFixtureValue(text):realValues[text]??Number(text));
    },generate:async(kind,params,opts)=>{opts.verifyPublication();calls.push([kind,params]);options.push(opts);return result;},
    commit:async(op,params,label,opts)=>{opts.verifyPublication();calls.push([op,params,label]);options.push(opts);return result;}};
  const button=Object.keys(values).find(key=>/^(generate-|make-|subdivide-)/.test(key));
  const panel={querySelector:selector=>nodes[selector==='button'?button:selector.slice(1)],querySelectorAll:()=>Object.values(nodes),remove(){this.removed=true;}};
  const control=Object.assign(Object.create(Prototype),{context,panel,busy:false});
  return {control,context,nodes,state,document,calls,options,expressionCalls,result,panel,
    setExport:value=>exporting=value,setProject:value=>project=value,get project(){return project;}};
}
