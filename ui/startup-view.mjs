export function startupView(view){return {...view,angles:[...(view.angles||Array(6).fill(0))],projection:'perspective',rotationPlane:2,rotationSpeed:4};}
