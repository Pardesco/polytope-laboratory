import {captureNativeSource,verifyNativeSource} from './native-source-binding.mjs';
import {publishBoundedExport} from './bounded-export.mjs';
import {currentFaceNet} from './net-presentation.mjs';
const printSignature=(state,currentPage)=>JSON.stringify([state.netLayout??null,state.netPages??null,state.view.netPrint??null,state.view.elementAnnotations??null,
  state.view.net?{root:state.view.net.root,length:state.view.net.length,tabs:state.view.net.tabs,tabOptions:state.view.net.tabOptions,page:currentPage?state.view.net.page:undefined}:null]);
/** Print the reviewed layout, with source ownership rechecked after the dialog. */
export class NetExportSession{
  constructor(context){this.context=context;this.busy=false;}
  async run(format,{packed=false,currentPage=false,isCurrent=()=>true}={}){
    if(this.busy)throw Error('Finish the current net export first.');
    if(!['svg','pdf'].includes(format))throw Error('Choose SVG or PDF net output.');
    const owner=captureNativeSource(this.context),state=owner.state,net=state.netLayout,pages=state.netPages;
    if(!currentFaceNet(state))throw Error('Generate a current 3D face net before exporting it.');
    if(packed&&!pages)throw Error('Pack and preview the paper pages first.');
    const pageIndex=state.view.net?.page??0;
    const svg=packed?currentPage?pages.pages[pageIndex]?.svg:pages.pages.map(page=>page.svg):net.svg;
    if(svg==null)throw Error('Choose an available paper page.');
    const signature=printSignature(state,currentPage),verify=()=>{if(!isCurrent())throw Object.assign(Error('Net export dialog changed or closed.'),{name:'AbortError'});verifyNativeSource(this.context,owner);if(printSignature(state,currentPage)!==signature)throw Error('The net layout, print settings or source content changed. Review the layout and export again.');};
    this.busy=true;this.controller=new AbortController();this.context.onState?.();
    try{
      const payload=format==='pdf'?(Array.isArray(svg)?svg:[svg]):svg;
      if(format==='svg'&&typeof payload!=='string')throw Error('Choose a single paper page for SVG output.');
      const result=await publishBoundedExport(this.context.api,format,payload,{verifyPublication:verify,signal:this.controller.signal,
        defaultName:packed?currentPage?`Net page ${pageIndex+1}`:'Packed net pages':'Net'});
      return isCurrent()?result:null;
    }finally{this.controller=null;this.busy=false;this.context.onState?.();}
  }
  cancel(){this.controller?.abort();}
}
