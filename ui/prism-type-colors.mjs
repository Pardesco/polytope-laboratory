// SPDX-License-Identifier: GPL-3.0-only
import {getElementTypes,elementTypesRevision} from './element-types.mjs';
// Viewer geometry belongs to one immutable source snapshot. Recheck the literal
// on publication/capture, not every rotation of its already prepared buffers.
export function prismDisplayTypes(viewer){
  const revision=elementTypesRevision(),cache=viewer.prismTypeCache;
  if(cache?.model===viewer.model&&cache.revision===revision)return cache.types;
  const types=getElementTypes(viewer.model);viewer.prismTypeCache={model:viewer.model,revision,types};return types;
}
