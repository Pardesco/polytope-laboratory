// SPDX-License-Identifier: GPL-3.0-only
import {stylePreset} from './style-presets.mjs';
export const legacyDocumentView=d=>({angles:d===4?[0,0,24,0,18,0]:Array(6).fill(0),projection:'orthographic',cameraProjection:'orthographic',viewportLayout:'single',pickKind:'edge',presentation:d===4?'translucent':'solid',faces:true,edges:true,vertices:false,fillRule:'nonzero',surfaceOpacity:d===4?.22:1,surfaceColors:'source',hiddenCells:[],isolatedCell:null,rotationPlane:d===4?2:1,rotationSpeed:12,derivedMode:d<3?'dual':'section',sectionNormal:Array(d).fill(0).map((_,i)=>i===d-1?1:0),sectionOffset:0,entity:0});
// New 4D views use a dramatic Schlegel-like 4D perspective; saved projects keep their stored distance.
export const DEFAULT_PERSPECTIVE_DISTANCE_4D=1.5;
export const defaultDocumentView=d=>{const view=stylePreset('prism',legacyDocumentView(d),d);if(d===4)view.perspectiveDistance4D=DEFAULT_PERSPECTIVE_DISTANCE_4D;return view;};
