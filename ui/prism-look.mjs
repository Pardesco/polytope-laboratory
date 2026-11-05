// SPDX-License-Identifier: GPL-3.0-only
// Alternating cool/warm hues with separated luminance; colors repeat after eight types.
export const PRISM_PALETTE=Object.freeze(['#36b6b0','#eeab52','#718fe2','#d879ac','#9bc875','#c187df','#57bce0','#e87e68']);
export const PRISM_FALLBACK=PRISM_PALETTE[0];
export const PRISM_LIMITS=Object.freeze({tubes:512,edges:10000,vertices:256});
export const isPrism=view=>view?.appearance?.style==='prism';
export const PRISM_APPEARANCE=Object.freeze({background:'#202c43',backgroundBottom:'#090f1c',backgroundMode:'radial',
  edgeColor:'#d9e8f2',vertexColor:'#e1edf7',specular:'#526e84',shininess:55,ambient:.16,
  hemisphere:1.05,keyIntensity:1.35,fillIntensity:.65,keyDirection:[4,7,6],fillDirection:[-5,2,-4]});
export function prismViewSettings(dimension=3){return {faces:true,edges:true,vertices:true,vertexStyle:'sphere',edgeStyle:'cylinder',
  vertexRadius:.012,edgeRadius:.0035,edgeOpacity:1,surfaceColors:dimension===4?'cell-type':'face-type',surfaceOpacity:dimension===4?.28:1};}
export function prismPrimitives(view,{edges=0,vertices=0}={}){
  const prism=isPrism(view),edgeFallback=prism&&view.edgeStyle==='cylinder'&&edges>PRISM_LIMITS.edges,
    quadEdges=prism&&view.edgeStyle==='cylinder'&&edges>PRISM_LIMITS.tubes&&!edgeFallback,
    vertexFallback=prism&&(vertices>PRISM_LIMITS.vertices||edges>PRISM_LIMITS.tubes);
  return {edgeFallback,quadEdges,vertexFallback,diagnostic:[edgeFallback?'Prism uses density-tinted lines above 10,000 edge segments.':null,
    vertexFallback?'Prism hides vertex markers on dense displays; selection highlights remain available.':null].filter(Boolean).join(' ')};
}
export function prismEdgeDensity(edges){return {opacity:Math.min(1,Math.max(.08,22/Math.sqrt(Math.max(1,edges)))),width:Math.max(1.6,2.2*Math.sqrt(512/Math.max(512,edges)))};}
export function prismSurfaceOpacity(view,model){
  const requested=Number.isFinite(view.surfaceOpacity)?view.surfaceOpacity:(model.dimension===4?.22:.86);
  if(!isPrism(view)||model.dimension!==4||requested!==.28||(model.edges?.length??0)<=PRISM_LIMITS.tubes)return Math.max(0,Math.min(1,requested));
  return Math.max(.025,requested*Math.sqrt(256/Math.max(model.edges.length,model.faces?.length??0)));
}
