import * as THREE from 'three';
import { fitView } from './view-camera.mjs';
import { TargetLines } from './target-lines.mjs';

export function targetRenderSize(
  width,
  height,
  { supersample = 1, maxTextureSize = 8192, maxPixels = 32 * 1024 * 1024 } = {}
) {
  if (
    ![width, height, maxTextureSize, maxPixels].every((n) => Number.isSafeInteger(n) && n > 0) ||
    ![1, 2].includes(supersample)
  )
    throw Error('Invalid target render dimensions or supersampling.');
  if (width > maxTextureSize || height > maxTextureSize || width * height > maxPixels)
    throw Error(
      'Target resolution exceeds the GPU texture limit or 32 megapixel render bound. Choose a smaller export size.'
    );
  const scale =
    width * supersample <= maxTextureSize &&
    height * supersample <= maxTextureSize &&
    width * height * supersample ** 2 <= maxPixels
      ? supersample
      : 1;
  return {
    width: width * scale,
    height: height * scale,
    scale,
    diagnostic:
      scale === supersample
        ? null
        : 'Supersampling reduced to ×1 to respect the GPU texture / 32 megapixel limit; output dimensions are unchanged.',
  };
}

export function targetCamera(viewer, width, height, { framing = 'fit', margin = 0.1, points } = {}) {
  if (
    !['fit', 'viewport', 'crop', 'letterbox'].includes(framing) ||
    !Number.isFinite(margin) ||
    margin < 0 ||
    margin > 0.4
  )
    throw Error('Export framing requires Fit model or Match viewport and a margin between 0 and 40%.');
  const source = viewer.camera,
    camera = source.clone(),
    aspect = width / height;
  if (!camera.isOrthographicCamera && !camera.isPerspectiveCamera)
    throw Error('Target capture supports orthographic and perspective observer cameras.');
  if (camera.isPerspectiveCamera) camera.aspect = aspect;
  else {
    const half = (source.top - source.bottom) / 2;
    camera.left = -half * aspect;
    camera.right = half * aspect;
  }
  if (framing === 'fit') {
    const target = viewer.controls.target,
      direction = source.position.clone().sub(target);
    if (!direction.lengthSq()) direction.set(1, 1, 1);
    const cloud = points ?? viewer.observationCloud(),
      fit = fitView(cloud, {
        aspect,
        direction: direction.toArray(),
        up: source.up.toArray(),
        fov: camera.fov ?? 38,
        padding: 1 / (1 - 2 * margin),
      });
    if (fit) {
      const center = new THREE.Vector3(...fit.center),
        backward = new THREE.Vector3(...fit.direction);
      camera.zoom = 1;
      camera.up.fromArray(fit.up);
      let distance = fit.distance;
      if (camera.isPerspectiveCamera) {
        const right = new THREE.Vector3().crossVectors(camera.up, backward).normalize(),
          vertical = new THREE.Vector3().crossVectors(backward, right),
          tan = Math.tan((camera.fov * Math.PI) / 360) * (1 - 2 * margin);
        distance = 0.1;
        for (const p of cloud) {
          const v = new THREE.Vector3(...p).sub(center);
          distance = Math.max(
            distance,
            v.dot(backward) +
              Math.max(Math.abs(v.dot(right)) / (tan * aspect), Math.abs(v.dot(vertical)) / tan) +
              camera.near
          );
        }
      } else {
        camera.left = -fit.halfHeight * aspect;
        camera.right = fit.halfHeight * aspect;
        camera.top = fit.halfHeight;
        camera.bottom = -fit.halfHeight;
      }
      camera.position.copy(center).addScaledVector(backward, distance);
      camera.lookAt(center);
      camera.far = Math.max(camera.far, distance + fit.radius * 2 + 1);
    }
  }
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

export function requireTargetStereo(viewer) {
  if (viewer.view?.stereoMode && viewer.view.stereoMode !== 'none')
    throw Error('Target-resolution export is unavailable for stereo / anaglyph. Choose Stereo: None before exporting.');
}

// Own only GPU targets and staging pixels. Never resize or draw into the visible canvas.
export function createTargetSurface(
  viewer,
  {
    width,
    height,
    supersample = 1,
    framing = 'fit',
    margin = 0.1,
    transparent = false,
    onDiagnostic = () => {},
    points,
    referenceSize,
  } = {},
  {
    createCanvas = () => document.createElement('canvas'),
    createTarget = (w, h) => new THREE.WebGLRenderTarget(w, h),
  } = {}
) {
  requireTargetStereo(viewer);
  const renderer = viewer.renderer,
    plan = targetRenderSize(width, height, {
      supersample,
      maxTextureSize: renderer.capabilities?.maxTextureSize ?? 8192,
    });
  const sourceWidth = renderer.domElement.width,
    sourceHeight = renderer.domElement.height;
  const canvas = createCanvas(),
    scratch = createCanvas();
  Object.assign(canvas, { width, height });
  Object.assign(scratch, { width: plan.width, height: plan.height });
  const context = canvas.getContext('2d'),
    pixels = scratch.getContext('2d');
  if (!context || !pixels) throw Error('Target capture staging canvas is unavailable.');
  let target = createTarget(plan.width, plan.height),
    closed = false;
  const lines = new TargetLines();
  target.texture.colorSpace = THREE.SRGBColorSpace;
  target.samples = plan.scale === 2 ? 0 : Math.min(4, renderer.capabilities?.maxSamples ?? 0);
  const buffer = new Uint8Array(plan.width * plan.height * 4),
    image = pixels.createImageData(plan.width, plan.height);
  if (plan.diagnostic) onDiagnostic(plan.diagnostic);
  const copy = () => {
    if (closed) throw Error('Target capture surface is closed.');
    requireTargetStereo(viewer);
    if (renderer.domElement.width !== sourceWidth || renderer.domElement.height !== sourceHeight)
      throw Error('Export viewport dimensions changed during capture.');
    const camera = targetCamera(viewer, width, height, { framing, margin, points }),
      previous = renderer.getRenderTarget(),
      face = renderer.getActiveCubeFace(),
      mip = renderer.getActiveMipmapLevel(),
      viewport = renderer.getViewport(new THREE.Vector4()),
      scissor = renderer.getScissor(new THREE.Vector4()),
      scissorTest = renderer.getScissorTest(),
      alpha = renderer.getClearAlpha(),
      background = viewer.scene.background;
    const ratio = renderer.getPixelRatio(),
      css = renderer.getSize(new THREE.Vector2()),
      reference = referenceSize ?? { width: css.x, height: css.y },
      thickness = Math.min(plan.width, plan.height) / Math.min(reference.width, reference.height),
      materials = new Map();
    viewer.scene.traverse((object) => {
      for (const material of [object.material].flat().filter(Boolean))
        if (!materials.has(material)) {
          materials.set(material, {
            size: material.size,
            linewidth: material.linewidth,
            resolution: material.resolution?.clone(),
          });
          if (material.isPointsMaterial)
            material.size *= material.sizeAttenuation ? plan.height / css.y / ratio : thickness / ratio;
          if (material.isLineMaterial && !material.worldUnits) material.linewidth *= thickness;
        }
    });
    try {
      lines.prepare(viewer.scene, thickness);
      // LineSegments2 reads getViewport(), while setRenderTarget uses target.viewport.
      renderer.setViewport(0, 0, plan.width, plan.height);
      renderer.setRenderTarget(target);
      renderer.setScissorTest(false);
      if (transparent) {
        viewer.scene.background = null;
        renderer.setClearAlpha(0);
      }
      renderer.clear();
      renderer.render(viewer.scene, camera);
      renderer.readRenderTargetPixels(target, 0, 0, plan.width, plan.height, buffer);
      for (let i = 0; i < buffer.length; i += 4) {
        const a = buffer[i + 3];
        if (a > 0 && a < 255)
          for (let c = 0; c < 3; c++) buffer[i + c] = Math.min(255, Math.round((buffer[i + c] * 255) / a));
      }
      const row = plan.width * 4;
      for (let y = 0; y < plan.height; y++)
        image.data.set(buffer.subarray(y * row, (y + 1) * row), (plan.height - y - 1) * row);
      pixels.putImageData(image, 0, 0);
      context.clearRect(0, 0, width, height);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(scratch, 0, 0, width, height);
    } finally {
      lines.restore();
      for (const [material, saved] of materials) {
        if (saved.size !== undefined) material.size = saved.size;
        if (saved.linewidth !== undefined) material.linewidth = saved.linewidth;
        if (saved.resolution) material.resolution.copy(saved.resolution);
      }
      viewer.scene.background = background;
      renderer.setClearAlpha(alpha);
      renderer.setViewport(viewport);
      renderer.setScissor(scissor);
      renderer.setScissorTest(scissorTest);
      renderer.setRenderTarget(previous, face, mip);
    }
  };
  return {
    canvas,
    copy,
    plan,
    dispose() {
      if (closed) return;
      closed = true;
      lines.dispose();
      target.dispose();
      target = null;
    },
  };
}
