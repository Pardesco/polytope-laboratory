import test from 'node:test';
import assert from 'node:assert/strict';
import {netSourceSurfaces} from '../ui/net-source-triangles.mjs';
import {foldPositions} from '../ui/net-motion.mjs';

test('concave source triangles retain physical source corners throughout folding',()=>{
  const points=[[0,0],[3,0],[3,1],[1,1],[1,3],[0,3]],ids=[12,5,6,10,7,8];
  const net={faces:[{id:0,points,sourceVertices:ids,parent:null,component:0}],components:[{root:0,targetQuaternion:[Math.SQRT1_2,0,0,Math.SQRT1_2],targetTranslation:[2,4,6]}],traversalOrder:[0],faceTriangles:[[0,1,2],[0,2,3],[0,3,5],[3,4,5]].map(t=>({face:0,sourceVertices:t.map(i=>ids[i])}))};
  const surface=netSourceSurfaces(net);assert.equal(surface.triangles.length,4);assert.equal(surface.filledFaces,1);
  const area=surface.triangles.reduce((s,t)=>{const [a,b,c]=t.points;return s+Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))/2;},0);assert.equal(area,5);
  for(const fraction of [0,.5,1]){
    const folded=foldPositions(net,fraction)[0].points,angle=Math.PI/2*fraction;
    for(const t of surface.triangles)for(const corner of t.vertices){const [x,y]=points[corner],expected=[x+2*fraction,y*Math.cos(angle)+4*fraction,y*Math.sin(angle)+6*fraction];folded[corner].forEach((v,i)=>assert.ok(Math.abs(v-expected[i])<1e-12));}
  }
  assert.equal(netSourceSurfaces(net,{faceIds:[]}).triangles.length,0);
  assert.throws(()=>netSourceSurfaces({...net,faceTriangles:[{face:0,sourceVertices:[12,5,99]}]}),/source corner/);
});

test('each disconnected face uses its own duplicated Viewer vertex offset',()=>{
  const net={faces:[{id:0,points:[[0,0],[1,0],[0,1]],sourceVertices:[0,1,2]},{id:1,points:[[9,0],[10,0],[9,1]],sourceVertices:[0,1,3]}],faceTriangles:[{face:0,sourceVertices:[0,1,2]},{face:1,sourceVertices:[0,1,3]}]};
  const triangles=netSourceSurfaces(net,{faceIds:[1]}).triangles;assert.deepEqual(triangles[0].vertices,[3,4,5]);assert.deepEqual(triangles[0].points,[[9,0,0],[10,0,0],[9,1,0]]);
});
