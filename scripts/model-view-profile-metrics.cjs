// V8 sampling time is not OS CPU utilization or isolated GPU time.
const assert=require('node:assert/strict');
function quantile(values,p){
  assert.ok(values.length);const sorted=[...values].sort((a,b)=>a-b),index=(sorted.length-1)*p,lo=Math.floor(index);
  return sorted[lo]+(sorted[Math.ceil(index)]-sorted[lo])*(index-lo);
}
function distribution(values){
  return {samples:values,median:quantile(values,.5),q1:quantile(values,.25),q3:quantile(values,.75),iqr:quantile(values,.75)-quantile(values,.25)};
}
function cpuTime(cpu){
  assert.equal(cpu.samples.length,cpu.timeDeltas.length);
  const nodes=new Map(cpu.nodes.map(n=>[n.id,n]));let sampledTotalMs=0,sampledIdleMs=0;
  cpu.samples.forEach((id,i)=>{const ms=cpu.timeDeltas[i]/1000;sampledTotalMs+=ms;if(nodes.get(id).callFrame.functionName==='(idle)')sampledIdleMs+=ms;});
  return {sampledTotalMs,sampledIdleMs,sampledNonIdleMs:sampledTotalMs-sampledIdleMs};
}
module.exports={quantile,distribution,cpuTime};
