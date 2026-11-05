const make=(doc,tag,id,text)=>{const node=doc.createElement(tag);if(id)node.id=id;if(text)node.textContent=text;return node;};
export function clearPrecisionValidation(doc){
  doc.getElementById('validation-precision-note')?.remove();doc.getElementById('validation-details')?.remove();
}
export function syncPrecisionContext(doc,model){
  const badge=doc.getElementById('numeric-badge');if(!badge)return;
  const rational=model.numeric?.mode==='rational-exact',context=badge.parentElement,precision=doc.getElementById('precision-details');
  badge.textContent=rational?'RATIONAL':'FLOAT64 · APPROX';
  if(context&&precision){if(rational)precision.before(context);else precision.querySelector('summary').after(context);}
}
export function organizePrecisionEvidence(doc){
  const checks=doc.getElementById('advanced-checks');if(!checks||doc.getElementById('precision-details'))return;
  const details=make(doc,'details','precision-details');details.className='inspector-group';
  details.append(make(doc,'summary',null,'Precision details'));
  const intro=doc.getElementById('advanced-intro');if(intro)details.append(intro);
  const badge=doc.getElementById('numeric-badge'),context=badge?.parentElement;
  if(context)details.append(context);
  const information=doc.getElementById('advanced-model-information');
  if(information){
    for(const node of [...information.children])if(node.tagName==='P'&&node.textContent.startsWith('Calculations use numerical coordinates'))node.remove();
    details.append(information);
  }
  const evidence=doc.getElementById('evidence');
  if(evidence)evidence.after(details);
  else checks.append(details);
}
export function renderPrecisionValidation(doc,model,validation,options={}){
  syncPrecisionContext(doc,model);
  const root=doc.getElementById('evidence'),open=options.open??doc.getElementById('validation-details')?.open??false;
  const title=make(doc,'p','validation-summary');title.className='validation-status';title.setAttribute('role','status');
  const certified=model.numeric?.certified===true;
  title.textContent=(validation.passed?'Checks passed.':'Geometry checks failed.')+' '+(certified?'A scoped exact certificate is included; display and measurements use double precision.':'Coordinates are double-precision floating point.');
  const raw=make(doc,'pre');raw.className='code-box';raw.textContent=JSON.stringify({numeric:model.numeric,certificate:model.certificate,provenance:model.provenance,validation},null,2);
  const details=make(doc,'details','validation-details');details.className='inspector-group';details.open=open;
  details.append(make(doc,'summary',null,'Checks, calculation method and source'),raw);
  const warnings=(validation.warnings??[]).filter(w=>w!=='Geometry is approximate. Structural checks are evidence, not an exact certificate.').map(w=>{const p=make(doc,'p',null,w);p.className='validation-warning';return p;});
  const precision=doc.getElementById('precision-details');
  const note=make(doc,'p','validation-precision-note',certified?
    'The certificate covers only its stated property of the supplied coordinates. Display and measurements remain numerical.':
    'Geometry and measurements use double-precision numerical calculations. Passing structural checks is not an exactness certificate.');note.className='muted';
  if(precision){
    clearPrecisionValidation(doc);
    precision.append(note);root.replaceChildren(title,...warnings,details);
  }else root.replaceChildren(title,...warnings,note,details);
}
