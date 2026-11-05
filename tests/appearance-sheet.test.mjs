import test from 'node:test';
import assert from 'node:assert/strict';
import {RADIUS_SLIDERS,sliderToRadius,radiusToSlider,AppearanceSheet} from '../ui/appearance-sheet.mjs';
import {PresentationControls} from '../ui/presentation-controls.mjs';

for(const [id,spec] of Object.entries(RADIUS_SLIDERS)){
  test(`${id}: logarithmic slider covers its window and round-trips existing and preset radii`,()=>{
    assert.equal(sliderToRadius(0,spec),spec.min);assert.equal(sliderToRadius(1000,spec),spec.max);
    for(const radius of [spec.min,.0035,.006,.012,.015,.02,.1,spec.max]){
      const position=radiusToSlider(radius,spec),result=sliderToRadius(position,spec);
      assert.ok(position>=0&&position<=1000);assert.ok(Math.abs(result-radius)<1e-8);
    }
    assert.ok(Math.abs(sliderToRadius(500,spec)-Math.sqrt(spec.min*spec.max))<1e-8);
  });
  test(`${id}: slider is monotone, bounded and keeps typed radii outside its window valid`,()=>{
    let last=0;
    for(let position=0;position<=1000;position++){
      const radius=sliderToRadius(position,spec);assert.ok(radius>last&&radius>0&&radius<=.5);last=radius;
    }
    assert.equal(sliderToRadius(-100,spec),spec.min);assert.equal(sliderToRadius(1100,spec),spec.max);
    assert.equal(radiusToSlider(spec.min/10,spec),0);assert.equal(radiusToSlider(1,spec),1000);
    for(const value of [NaN,Infinity,-Infinity])assert.throws(()=>sliderToRadius(value,spec));
    for(const value of [NaN,Infinity,0,-1])assert.throws(()=>radiusToSlider(value,spec));
  });
}

test('live radius publication shares the numeric path, preserves other view fields, and respects export and native bounds',()=>{
  const state={view:{vertexRadius:.012,edgeRadius:.0035,camera:{zoom:2},angles:[1,2,3],vertexStyle:'sphere'}},calls=[];
  const inputs={'vertex-radius':{},'edge-radius':{}};let exporting=false;
  const controls=Object.assign(Object.create(PresentationControls.prototype),{
    context:{getState:()=>state,isExporting:()=>exporting,display:()=>calls.push('display'),markDirty:()=>calls.push('dirty')},
    panel:{querySelector:selector=>inputs[selector.slice(1)]}
  });
  controls.applyRadius('vertex-radius',.02);assert.equal(inputs['vertex-radius'].value,'0.02');
  assert.deepEqual(state.view,{vertexRadius:.02,edgeRadius:.0035,camera:{zoom:2},angles:[1,2,3],vertexStyle:'sphere'});
  assert.deepEqual(calls,['display','dirty']);
  const before=structuredClone(state);
  for(const value of [NaN,Infinity,0,-1,.50001])assert.throws(()=>controls.applyRadius('edge-radius',value));
  assert.throws(()=>controls.applyRadius('unknown',.01));exporting=true;
  assert.throws(()=>controls.applyRadius('edge-radius',.01),/export/);assert.deepEqual(state,before);
});

test('radius slider previews select visible-size primitives while retaining the explicit Show switches',()=>{
  const state={view:{vertexStyle:'point',edgeStyle:'line',vertices:false,edges:false}},input={};
  const controls=Object.assign(Object.create(PresentationControls.prototype),{
    context:{getState:()=>state,isExporting:()=>false,display(){},markDirty(){}},panel:{querySelector:()=>input}
  });
  controls.applyRadius('vertex-radius',.012,{preview:true});controls.applyRadius('edge-radius',.0035,{preview:true});
  assert.deepEqual(state.view,{vertexStyle:'sphere',edgeStyle:'cylinder',vertices:false,edges:false,vertexRadius:.012,edgeRadius:.0035});
});

function layoutFixture(){
  let exporting=false,width=1000,refits=0;
  const stage={clientWidth:width,clientHeight:600,classList:{toggle(){}}},slot={hidden:true,getBoundingClientRect:()=>({left:width-320,top:150,width:slot.hidden?0:320,height:600})};
  const sheet=Object.assign(Object.create(AppearanceSheet.prototype),{
    context:{isExporting:()=>exporting,refit:()=>refits++},drawer:{open:false},stage,slot,body:{style:{}},open:false
  });
  return {sheet,refits:()=>refits,export:value=>exporting=value,resize:value=>{width=value;stage.clientWidth=value;}};
}
test('sheet reserves space and fits on open, viewport resize and close, without observer feedback loops',()=>{
  const f=layoutFixture(),s=f.sheet;s.layout();assert.equal(f.refits(),0);
  s.drawer.open=true;s.layout();assert.equal(s.slot.hidden,false);assert.equal(f.refits(),1);
  assert.deepEqual(s.body.style,{left:'680px',top:'150px',width:'320px',height:'600px'});
  s.layout();assert.equal(f.refits(),1);f.resize(800);s.layout();assert.equal(f.refits(),2);assert.equal(s.body.style.left,'480px');
  s.drawer.open=false;s.layout();assert.equal(s.slot.hidden,true);assert.equal(f.refits(),3);
  s.layout();f.resize(1100);s.layout();assert.equal(f.refits(),3);
});
test('active export freezes the sheet layout in either its open or closed state',()=>{
  const f=layoutFixture(),s=f.sheet;s.layout();f.export(true);s.drawer.open=true;s.layout();
  assert.equal(s.drawer.open,false);assert.equal(s.slot.hidden,true);assert.equal(f.refits(),0);
  f.export(false);s.drawer.open=true;s.layout();f.export(true);s.drawer.open=false;s.layout();
  assert.equal(s.drawer.open,true);assert.equal(s.slot.hidden,false);assert.equal(f.refits(),1);
});
