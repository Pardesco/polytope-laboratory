// SPDX-License-Identifier: GPL-3.0-only
import bindings from '../desktop/command-bindings.json' with {type:'json'};
export {bindings};
export function shortcutTable(source=bindings){return Object.entries(source).filter(([,item])=>item.keys.length).map(([id,item])=>({id,label:item.label,keys:(item.keys.length===9?[item.keys[0]+' … '+item.keys[8]]:item.keys).map(key=>key.replaceAll('CmdOrCtrl','Ctrl / ⌘')).join(' or '),scope:item.scope}));}
export function matchesShortcut(event,binding){
  const parts=binding.split('+'),key=parts.pop(),primary=parts.includes('CmdOrCtrl');
  const matchesKey=key==='/'&&event.shiftKey?['?','/'].includes(event.key):String(event.key).toLowerCase()===(key==='Space'?' ':key.toLowerCase());
  return !event.repeat&&!event.getModifierState?.('AltGraph')&&!!event.shiftKey===parts.includes('Shift')&&!!event.altKey===parts.includes('Alt')&&(primary?!!(event.ctrlKey||event.metaKey):!!event.ctrlKey===parts.includes('Ctrl')&&!event.metaKey)&&matchesKey;
}
