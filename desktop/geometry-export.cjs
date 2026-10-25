const {createTextExport}=require('./text-export.cjs');
const GEOMETRY_EXPORT_FORMATS=Object.freeze(['off','json','obj','stl','dxf','vrml','pov']);
function createGeometryExport(options){
  return createTextExport({...options,formats:GEOMETRY_EXPORT_FORMATS,maxBytes:128*1024*1024,maxSessions:1});
}
module.exports={createGeometryExport,GEOMETRY_EXPORT_FORMATS};
