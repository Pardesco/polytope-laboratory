// SPDX-License-Identifier: GPL-3.0-only
// Apostrophes and quotes are ignored so "what's", "what’s" and "whats" all match.
const normalized=value=>String(value??'').normalize('NFKC').toLocaleLowerCase().replace(/['‘’‛ʼ`"“”]/g,'');
export function buildCommandIndex({actions=[],controls=[],library=[],topics=[]}={}){
  const seen=new Set();return [...actions,...controls,...library,...topics].filter(item=>{
    if(!item.id||!item.label||seen.has(item.id))return false;seen.add(item.id);return true;
  }).map(item=>({...item,path:Array.isArray(item.path)?item.path.join(' › '):item.path||'',search:normalized([item.label,...(Array.isArray(item.path)?item.path:[item.path]),item.keywords].filter(Boolean).join(' '))}));
}
export function fuzzyScore(query,item){
  const words=normalized(query).trim().split(/\s+/).filter(Boolean),label=normalized(item.label),text=item.search??normalized(item.label+' '+item.path);let score=0;
  for(const word of words){
    const exact=label.indexOf(word),inText=text.indexOf(word);
    if(exact>=0){score+=120+(exact===0?60:0)+word.length;continue;}
    if(inText>=0){score+=50+word.length;continue;}
    let last=-1,first=-1,gaps=0;
    for(const char of word){const next=text.indexOf(char,last+1);if(next<0)return -Infinity;if(first<0)first=next;else gaps+=next-last-1;last=next;}
    score+=10-gapPenalty(gaps)-first*.01;
  }
  return score;
}
const gapPenalty=gaps=>Math.min(30,gaps*.5);
export function rankCommands(index,query,limit=80){return index.map((item,order)=>({item,order,score:fuzzyScore(query,item)})).filter(row=>Number.isFinite(row.score)).sort((a,b)=>b.score-a.score||a.order-b.order).slice(0,limit).map(row=>row.item);}
export function moveCommandSelection(current,delta,count){return count?((current+delta)%count+count)%count:-1;}
export function revealCommand(target,{showRegion=()=>{},activatePanel=()=>{}}={}){
  target.dispatchEvent?.(new Event('app-chrome-reveal',{bubbles:true}));
  const ancestors=[];for(let node=target;node;node=node.parentElement)ancestors.unshift(node);
  if(ancestors.some(n=>n.id==='inspector-region'))showRegion('inspector');
  if(ancestors.some(n=>n.id==='library-region'))showRegion('library');
  const panel=ancestors.find(n=>n.classList?.contains('inspector-panel'));if(panel)activatePanel(panel.id.replace(/-panel$/,''));
  target.ownerDocument?.defaultView?.openConstructTool?.(target,{focus:false});
  for(const node of ancestors)if(node.tagName==='DETAILS')node.open=true;
  target.scrollIntoView?.({block:'center'});target.focus?.({preventScroll:true});
  target.classList?.add('command-highlight');return target;
}
