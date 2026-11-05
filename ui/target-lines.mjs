import {LineSegments2} from 'three/addons/lines/LineSegments2.js';
import {LineSegmentsGeometry} from 'three/addons/lines/LineSegmentsGeometry.js';
import {LineMaterial} from 'three/addons/lines/LineMaterial.js';
import {edgeDepthFade} from './prism-edge-fade.mjs';

// Native GL lines are commonly clamped to one pixel. Use the existing wide-line
// shader for export so supersampling does not make ordinary edges disappear.
export class TargetLines{
  constructor(){this.cache=new Map();this.active=[];}
  prepare(scene,thickness){
    const sources=[];scene.traverseVisible(object=>{if(object.isLineSegments&&object.material?.isLineBasicMaterial&&!object.material.isLineDashedMaterial&&!object.geometry.index)sources.push(object);});
    for(const [source,{line}] of this.cache)if(!sources.includes(source)){line.geometry.dispose();line.material.dispose();this.cache.delete(source);}
    scene.updateMatrixWorld(true);
    for(const source of sources){
      const position=source.geometry.getAttribute('position'),range=source.geometry.drawRange,start=range.start,count=Math.min(position.count-start,range.count);
      if(!count)continue;
      let entry=this.cache.get(source);
      if(!entry){entry={line:new LineSegments2(new LineSegmentsGeometry(),new LineMaterial())};this.cache.set(source,entry);}
      const {line}=entry,key=[position.version,start,count].join(':');
      if(entry.array!==position.array||entry.key!==key){
        const array=start===0&&count===position.count?position.array:position.array.slice(start*3,(start+count)*3);
        if(entry.positions!==array){line.geometry.dispose();line.geometry.setPositions(array);entry.positions=array;}
        else {line.geometry.computeBoundingBox();line.geometry.computeBoundingSphere();}
        line.geometry.getAttribute('instanceStart').data.needsUpdate=true;
        const color=source.geometry.getAttribute('color');if(color){
          const colors=color.array.slice(start*3,(start+count)*3),previousColors=line.geometry.getAttribute('instanceColorStart')?.data;
          if(previousColors?.array.length===colors.length){previousColors.array.set(colors);previousColors.needsUpdate=true;}else line.geometry.setColors(colors);
        }
        entry.array=position.array;entry.key=key;
      }
      const from=source.material,to=line.material;
      if(from.userData.prismDepthFade)edgeDepthFade(line,from.userData.prismDepthFade.prismDepthStrength.value);
      to.color.copy(from.color);to.linewidth=(from.linewidth||1)*thickness;
      for(const key of ['opacity','transparent','depthTest','depthWrite','vertexColors','blending','colorWrite','toneMapped','visible'])if(to[key]!==from[key]){to[key]=from[key];to.needsUpdate=true;}
      line.renderOrder=source.renderOrder;line.layers.mask=source.layers.mask;line.matrixAutoUpdate=false;line.matrix.copy(source.matrix);
      line.visible=true;source.parent.add(line);source.visible=false;this.active.push({source,line});
    }
  }
  restore(){for(const {source,line} of this.active){source.visible=true;line.removeFromParent();}this.active=[];}
  dispose(){this.restore();for(const {line} of this.cache.values()){line.geometry.dispose();line.material.dispose();}this.cache.clear();}
}
