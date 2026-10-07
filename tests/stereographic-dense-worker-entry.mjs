/** Node-only adapter executes the real copied browser worker entry. */
import {parentPort} from 'node:worker_threads';
globalThis.WorkerGlobalScope=class {static [Symbol.hasInstance](value){return value===globalThis;}};
globalThis.addEventListener=(type,listener)=>{if(type!=='message')throw Error('Unexpected worker event.');parentPort.on('message',data=>listener({data}));};
globalThis.postMessage=(value,transfer)=>parentPort.postMessage(value,transfer);
await import('../ui/stereographic-worker.mjs');
parentPort.postMessage({type:'worker-ready'});
