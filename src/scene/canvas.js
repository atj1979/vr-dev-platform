import * as THREE from 'three';

export function roundRect(ctx, x, y, w, h, radius) {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function createPanel(pixelWidth, pixelHeight, worldWidth, worldHeight) {
  const canvas = document.createElement('canvas');
  canvas.width = pixelWidth;
  canvas.height = pixelHeight;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(worldWidth, worldHeight), material);
  mesh.userData.kind = 'ui';
  const panel = {
    canvas,
    ctx,
    texture,
    mesh,
    pixelWidth,
    pixelHeight,
    regions: [],
    uvToPx(uv) {
      return {
        x: uv.x * pixelWidth,
        y: (1 - uv.y) * pixelHeight,
      };
    },
    hit(px, py) {
      for (let i = panel.regions.length - 1; i >= 0; i -= 1) {
        const region = panel.regions[i];
        if (px >= region.x && py >= region.y && px < region.x + region.w && py < region.y + region.h) return region;
      }
      return null;
    },
    refresh() { texture.needsUpdate = true; },
  };
  mesh.userData.panel = panel;
  return panel;
}

export function paintButton(ctx, region, label, { active = false, hover = false, small = false } = {}) {
  ctx.fillStyle = active ? '#3d6a66' : hover ? '#3a4448' : '#2a3136';
  roundRect(ctx, region.x, region.y, region.w, region.h, 8);
  ctx.fill();
  ctx.fillStyle = '#f4efe6';
  ctx.font = `${small ? 16 : 20}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, region.x + region.w / 2, region.y + region.h / 2 + 1);
}
