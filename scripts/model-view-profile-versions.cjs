const assert=require('node:assert/strict');

// Keep the original 0.27.19/0.27.20 commands reproducible. Later comparisons
// must opt into their version pair, and always write a new candidate receipt.
function profileVersions(options=[]){
  const versions=['0.27.19','0.27.20'],seen=new Set();
  for(const option of options){
    const match=/^--(baseline|candidate)-version=(\d+\.\d+\.\d+)$/.exec(option);
    assert.ok(match,'Use --baseline-version=x.y.z and --candidate-version=x.y.z');
    assert.ok(!seen.has(match[1]),'Version option repeated');seen.add(match[1]);
    versions[match[1]==='baseline'?0:1]=match[2];
  }
  assert.notEqual(versions[0],versions[1],'Baseline and candidate versions must differ');
  return versions;
}
module.exports={profileVersions};
