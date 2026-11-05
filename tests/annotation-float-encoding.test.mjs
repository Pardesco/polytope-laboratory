import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {pythonFloatHex,portableContentSource} from '../ui/element-content-source.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const buffer=new ArrayBuffer(8),bits=new DataView(buffer);
function value(high,low){bits.setUint32(0,high,false);bits.setUint32(4,low,false);return bits.getFloat64(0,false);}
function hex(value){bits.setFloat64(0,value,false);return bits.getUint32(0,false).toString(16).padStart(8,'0')+bits.getUint32(4,false).toString(16).padStart(8,'0');}

test('portable number spelling agrees with Python across exponent/fraction/sign boundaries and deterministic binary64 samples',()=>{
  const values=[0,-0,Number.MIN_VALUE,-Number.MIN_VALUE,Number.MAX_VALUE,-Number.MAX_VALUE,1,-1,2,Math.PI,2**53,2**53-1];
  for(const exponent of [0,1,2,1022,1023,1024,2045,2046])for(const fraction of [0,1,0x7ffff,0xfffff])for(const low of [0,1,0x80000000,0xffffffff])for(const sign of [0,0x80000000])values.push(value((sign|(exponent<<20)|fraction)>>>0,low));
  let seed=0x20261025;
  const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>0;};
  for(let i=0;i<4096;i++){
    const high=random(),low=random(),number=value(high,low);if(Number.isFinite(number))values.push(number);
  }
  const input=values.map(hex);
  const expected=JSON.parse(execFileSync(process.env.POLYTOPE_PYTHON||'python',['-B','-c',
    "import json,sys,struct;values=[struct.unpack('>d',bytes.fromhex(s))[0] for s in json.load(sys.stdin)];print(json.dumps(['0x0.0p+0' if x==0 else x.hex() for x in values]))"],
    {cwd:root,input:JSON.stringify(input),encoding:'utf8',windowsHide:true,maxBuffer:4*1024*1024}));
  assert.equal(expected.length,values.length);
  for(let i=0;i<values.length;i++)assert.equal(pythonFloatHex(values[i]),expected[i],input[i]);
  const portable=JSON.parse(portableContentSource({values}));
  assert.deepEqual(portable,['object',[['values',['array',expected.map(text=>['number',text])]]]]);
});

test('interleaved number encodings retain all fraction bits and canonical signed zero',()=>{
  const values=[5e-324,1.0000000000000002,-1.0000000000000002,1.7976931348623157e308,-0,Math.PI];
  const first=values.map(pythonFloatHex);
  for(let i=0;i<50;i++){values.toReversed().forEach(pythonFloatHex);assert.deepEqual(values.map(pythonFloatHex),first);}
  assert.equal(pythonFloatHex(-0),'0x0.0p+0');
  for(const invalid of [NaN,Infinity,-Infinity,'1',1n,null,undefined,{},new Number(1)])assert.throws(()=>pythonFloatHex(invalid),/finite binary64/);
});
