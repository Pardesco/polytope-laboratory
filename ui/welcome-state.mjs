// SPDX-License-Identifier: GPL-3.0-only
import {stylePreset} from './style-presets.mjs';
export const WELCOME_SETTING='polytope-welcome-v1';
export function shouldShowWelcome({dismissed=false,hidden=false,opened=false,recovered=false,recoveryAvailable=false}={}){return !dismissed&&!hidden&&!opened&&!recovered&&!recoveryAvailable;}
export function readWelcomeSetting(storage){try{return storage.getItem(WELCOME_SETTING)==='dismissed';}catch{return false;}}
export function writeWelcomeSetting(storage,dismissed){try{if(dismissed)storage.setItem(WELCOME_SETTING,'dismissed');else storage.removeItem(WELCOME_SETTING);}catch{}}
export function featuredView(dimension){return stylePreset('prism',{angles:dimension===4?[8,0,28,0,18,0]:[12,20,0,0,0,0],projection:dimension===4?'perspective':'orthographic',rotationPlane:dimension===4?2:1,rotationSpeed:4},dimension);}
