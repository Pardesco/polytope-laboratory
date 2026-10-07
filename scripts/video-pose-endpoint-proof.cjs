// Compare decoded endpoint poses against independently rendered PNG samples.
// A loose codec-error threshold alone can accept an earlier animation pose.
const assert=require('node:assert/strict');
function provePoseEndpoints({first,last,references,maximumMeanRgbError=5}){
  assert.ok(Array.isArray(references)&&references.length>=2&&references.length<=64,'Provide 2..64 distinct pose references.');
  assert.ok(Number.isFinite(maximumMeanRgbError)&&maximumMeanRgbError>0);
  const inputs=[first,last,...references];let totalBytes=0;
  for(const pixels of inputs){
    assert.ok(pixels instanceof Uint8Array&&pixels.byteLength>0&&pixels.byteLength%3===0&&pixels.byteLength<=32*1024*1024,'Expected bounded RGB24 bytes.');
    assert.equal(pixels.byteLength,first.byteLength,'Pose reference dimensions differ.');totalBytes+=pixels.byteLength;
  }
  assert.ok(totalBytes<=128*1024*1024,'Endpoint reference work exceeds 128 MiB.');
  function compare(pixels,target){
    const errors=references.map(reference=>{let total=0;for(let i=0;i<pixels.length;i++)total+=Math.abs(pixels[i]-reference[i]);return total/pixels.length;});
    const ordered=errors.map((error,index)=>({error,index})).sort((a,b)=>a.error-b.error);
    const result={targetReference:target,closestReference:ordered[0].index,meanRgbError:errors[target],runnerUpMeanRgbError:ordered[1].error,allReferenceMeanRgbErrors:errors};
    assert.equal(result.closestReference,target,'Decoded endpoint is closer to an earlier/different PNG pose: '+JSON.stringify(result));
    assert.ok(ordered[1].error-ordered[0].error>1e-12,'Endpoint identity is ambiguous between reference poses.');
    assert.ok(result.meanRgbError<maximumMeanRgbError,'Endpoint exceeds declared codec error: '+JSON.stringify(result));
    return result;
  }
  return {first:compare(first,0),last:compare(last,references.length-1),referenceCount:references.length,maximumMeanRgbError,distinctEndpointPoses:true};
}
module.exports={provePoseEndpoints};
