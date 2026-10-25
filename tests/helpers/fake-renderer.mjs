// Shared renderer surface for Viewer tests; method coverage is checked separately.
export function fakeRenderer({width=900,height=900}={}){
  return {
    domElement:{getBoundingClientRect:()=>({width,height})},
    setClearColor(){},setPixelRatio(){},setSize(w,h){width=w;height=h;},render(){},
  };
}
