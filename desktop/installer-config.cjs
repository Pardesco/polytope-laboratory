const {build}=require('../package.json');
module.exports={...build,extends:null,
  artifactName:'${productName} Setup ${version}.${ext}',
  copyright:'Copyright © 2026 Polytope Laboratory contributors',
  win:{...build.win,target:'nsis',icon:'desktop/assets/polytope.ico',signAndEditExecutable:true,signExecutable:false,requestedExecutionLevel:'asInvoker'},
  fileAssociations:[
    {ext:'polyproj',name:'Polytope Laboratory project',description:'Polytope Laboratory project',role:'Editor',icon:'desktop/assets/polytope.ico'},
    {ext:'off',name:'OFF polytope geometry',description:'OFF / 4OFF polytope geometry',role:'Editor',icon:'desktop/assets/polytope.ico'}
  ],
  nsis:{oneClick:false,perMachine:false,allowElevation:false,allowToChangeInstallationDirectory:true,
    createStartMenuShortcut:true,createDesktopShortcut:true,shortcutName:'Polytope Laboratory',include:'desktop/installer.nsh',
    installerIcon:'desktop/assets/polytope.ico',uninstallerIcon:'desktop/assets/polytope.ico',
    deleteAppDataOnUninstall:false,runAfterFinish:false}
};
