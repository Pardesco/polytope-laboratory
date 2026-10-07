export class HistoryControls {
  constructor(context) {
    this.context=context;
    const row=document.createElement('div');row.className='button-row';
    this.replay=document.createElement('button');this.replay.id='history-replay';this.replay.textContent='Replay';this.replay.title='Verify recorded source geometry and each operation, then open an independent document';
    this.branch=document.createElement('button');this.branch.id='history-branch';this.branch.textContent='Parameters';this.branch.title='Edit the selected operation parameters in a new document';
    row.append(this.replay,this.branch);document.getElementById('history-list').before(row);
    this.dialog=document.createElement('dialog');this.dialog.id='history-parameters-dialog';
    this.dialog.innerHTML='<div class="dialog-heading"><h2>Operation parameters</h2><button id="history-parameters-close" aria-label="Close">Ã—</button></div><p id="history-operation"></p><label>Parameters <textarea id="history-parameters" rows="8" spellcheck="false"></textarea></label><button id="history-parameters-apply">Create branch</button>';
    document.body.append(this.dialog);
    this.replay.onclick=context.guard(()=>context.replay());
    this.branch.onclick=()=>{const node=this.node();if(!node)return;this.source=context.getState();document.getElementById('history-operation').textContent=node.op;document.getElementById('history-parameters').value=JSON.stringify(node.params,null,2);this.dialog.showModal();};
    document.getElementById('history-parameters-close').onclick=()=>this.dialog.close();
    document.getElementById('history-parameters-apply').onclick=context.guard(async()=>{if(this.source!==context.getState())throw new Error('History selection changed. Reopen the parameter editor.');if(context.isExporting())throw new Error('Finish animation export before branching.');const params=JSON.parse(document.getElementById('history-parameters').value);if(!params||Array.isArray(params)||typeof params!=='object')throw new Error('Parameters require a JSON object.');await context.branch(params);this.dialog.close();});
  }
  node(){const s=this.context.getState();return this.context.getDocument()?.operationHistory?.nodes?.find(n=>n.id===s?.operationNode);}
  sync(){const node=this.node(),busy=this.context.isExporting();this.replay.disabled=busy||!node;this.branch.disabled=busy||!node||!['sphere-project','incidence-truncate','exact-surface-section','geometry-fit','expand-runcinate','element-content','transform','section','dual','incidence-dual','truncate','extrude','cell','facet','facet-adopt','scale-reference','remove-coincident-pairs','blend-faces','compound-component','compound-drop','subdivide-edges','polygon-prism','polyhedron-prism','convex-layer-join','fit-strict-layer-join','triangular-geodesic','convex-core','place-at-faces','convex-core-4d','source-zonohedron','spring-relaxation'].includes(node.op);}
}
