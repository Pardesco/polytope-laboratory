// SPDX-License-Identifier: GPL-3.0-only
export const METADATA_FIELDS={title:['Title',512],author:['Author',512],description:['Description / notes',16000],reference:['References / URLs',4096],license:['License',2048],source:['Source',4096]};
export function metadataFromFields(previous,fields,customText='{}'){
  if(new TextEncoder().encode(customText).length>65536)throw Error('Additional metadata exceeds 64 KiB.');
  let custom;try{custom=JSON.parse(customText||'{}',(key,value)=>{if(typeof value==='number'&&!Number.isFinite(value))throw Error('Nonfinite number.');return value;});}catch{throw Error('Additional fields must contain valid finite JSON.');}
  if(custom===null||Array.isArray(custom)||typeof custom!=='object')throw Error('Additional metadata needs a JSON object.');
  const result={...previous,custom};for(const [key,[,max]] of Object.entries(METADATA_FIELDS)){const value=fields[key]??'';if(typeof value!=='string'||value.length>max)throw Error('Model information '+key+' exceeds its text limit.');result[key]=value;}
  result.tags=[...new Set(String(fields.tags??'').split(',').map(s=>s.trim()).filter(Boolean))];
  if(result.tags.length>128||result.tags.some(tag=>tag.length>128))throw Error('Use at most 128 tags, each up to 128 characters.');
  if(new TextEncoder().encode(JSON.stringify(result)).length>131072)throw Error('Model information exceeds 128 KiB.');return result;
}
