// Search supplied catalog metadata without guessing absent properties.
const fields={v:0,vertices:0,e:1,edges:1,f:2,faces:2,c:3,cells:3};
const numeric=(entry,key)=>key in fields?entry.counts?.[fields[key]]:key==='d'||key==='dim'||key==='dimension'?entry.dimension:key==='genus'?entry.genus:key==='parts'||key==='components'?entry.componentCount:undefined;
export function catalogMatches(entry,query){
  const haystack=[entry.name,entry.relativePath,entry.category,entry.key,entry.family,entry.symbol,entry.status,entry.diagnostic,entry.auditStatus,entry.auditDiagnostic,entry.coxeterFamily,entry.rings?.join(''),entry.coxeterFamily&&entry.rings?entry.coxeterFamily+' '+entry.rings.join(''):'',...(entry.counts??[]),...(entry.aliases??[])].join(' ').toLowerCase();
  const tokens=String(query??'').toLowerCase().match(/"[^"]*"|\S+/g)??[];
  return tokens.every(token=>{
    const match=token.match(/^(v|vertices|e|edges|f|faces|c|cells|d|dim|dimension|genus|parts|components)(:|=|>=|<=|>|<)(\d+)$/);
    if(!match)return haystack.includes(token.replace(/^"|"$/g,''));
    const value=numeric(entry,match[1]),target=Number(match[3]);if(!Number.isFinite(value))return false;
    return {':':()=>value===target,'=':()=>value===target,'>=':()=>value>=target,'<=':()=>value<=target,'>':()=>value>target,'<':()=>value<target}[match[2]]();
  });
}
