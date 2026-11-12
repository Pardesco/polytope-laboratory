// SPDX-License-Identifier: GPL-3.0-only
import { appearanceOptions } from './appearance-config.mjs';
import { effectsOptions } from './effects-config.mjs';
import { PRISM_APPEARANCE, prismViewSettings } from './prism-look.mjs';
export const STYLE_LABELS = Object.freeze({
  prism: 'Prism',
  studio: 'Studio',
  'dark-gallery': 'Dark gallery',
  glass: 'Glass',
  metal: 'Metal',
  neon: 'Neon edges',
  paper: 'Paper',
  geomag: 'Geomag',
});
const styles = {
  prism: { appearance: PRISM_APPEARANCE },
  studio: {
    appearance: {
      background: '#e6e8eb',
      backgroundBottom: '#bec5cf',
      edgeColor: '#364252',
      vertexColor: '#687689',
      specular: '#657080',
      shininess: 65,
      ambient: 0.2,
      hemisphere: 1.1,
      keyIntensity: 1.1,
      fillIntensity: 0.6,
    },
  },
  'dark-gallery': {},
  glass: {
    appearance: { background: '#101c2a', specular: '#ffffff', shininess: 240, edgeColor: '#8ecbdf', tint: '#c4ecff' },
    effects: { reflection: 'studio', environmentMode: 'refraction', reflectivity: 0.65 },
    view: { surfaceOpacity: 0.24 },
  },
  metal: {
    appearance: { background: '#202833', specular: '#ffffff', shininess: 180, tint: '#b6c2d2', edgeColor: '#667788' },
    effects: { reflection: 'studio', reflectivity: 0.72 },
  },
  neon: {
    appearance: {
      background: '#060914',
      backgroundBottom: '#010207',
      edgeColor: '#25f4e8',
      edgeGlow: 2,
      specular: '#354080',
      tint: '#344a70',
      ambient: 0.18,
    },
    view: { surfaceOpacity: 0.16, edgeStyle: 'cylinder', edgeRadius: 0.005 },
  },
  paper: {
    appearance: {
      background: '#ffffff',
      backgroundBottom: '#ffffff',
      edgeColor: '#000000',
      vertexColor: '#000000',
      specular: '#000000',
      shininess: 0,
      ambient: 1,
      hemisphere: 0,
      keyIntensity: 0,
      fillIntensity: 0,
    },
  },
  geomag: {
    appearance: {
      background: '#e2e5eb',
      edgeColor: '#d83835',
      vertexColor: '#bfc8d2',
      specular: '#a8b5c5',
      shininess: 95,
      vertexMetal: true,
    },
    effects: { reflection: 'studio', reflectivity: 0.22 },
    view: {
      faces: false,
      vertices: true,
      vertexStyle: 'sphere',
      edgeStyle: 'cylinder',
      vertexRadius: 0.035,
      edgeRadius: 0.012,
    },
  },
};
export function stylePreset(name, view = {}, dimension = view.sectionNormal?.length ?? 3) {
  if (!Object.hasOwn(styles, name)) throw Error('Choose an implemented style.');
  const spec = styles[name];
  const settings = name === 'prism' ? prismViewSettings(dimension) : (spec.view ?? {}),
    presentation = settings.faces === false ? 'wireframe' : settings.surfaceOpacity < 1 ? 'translucent' : 'solid';
  return {
    ...view,
    faces: true,
    edges: true,
    vertices: false,
    presentation,
    surfaceOpacity: 1,
    vertexStyle: 'point',
    edgeStyle: 'line',
    vertexRadius: 0.015,
    edgeRadius: 0.006,
    edgeOpacity: 1,
    ...settings,
    appearance: appearanceOptions({ ...spec.appearance, style: name }),
    materialEffects: effectsOptions(spec.effects),
  };
}
