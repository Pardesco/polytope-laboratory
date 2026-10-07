/** Dedicated module-worker entry; importing it outside a worker has no effects. */
import {runStereographicWorkerJob,stereographicWorkerTransferables} from './stereographic-worker-geometry.mjs';

if(typeof WorkerGlobalScope!=='undefined'&&globalThis instanceof WorkerGlobalScope){
  globalThis.addEventListener('message',event=>{
    const started=performance.now();
    const result=runStereographicWorkerJob(event.data);
    // Measure validation, tessellation and buffer preparation inside the real
    // worker. Transfer and renderer/GPU publication have separate costs.
    result.workerComputeMs=Math.max(0,performance.now()-started);
    globalThis.postMessage(result,stereographicWorkerTransferables(result));
  });
}
