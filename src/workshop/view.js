import { CATEGORIES, CLIP_NAMES } from '../core/assetSpec.js';
import { createPanel, paintButton, roundRect } from '../scene/canvas.js';

const WIDTH = 1024;
const HEIGHT = 1280;
const COLORS = ['#f4f1ea', '#c4b39a', '#8c6a4a', '#4f6f64', '#6ec8c0', '#e0a15a', '#d2644a', '#7aa2d6', '#2f3438'];

export function createWorkshopPanel() {
  const panel = createPanel(WIDTH, HEIGHT, 0.9, 1.12);
  let hover = null;

  function button(regions, label, command, params, x, y, w, h, active = false) {
    const region = { id: `${command}:${label}`, label, command, params, x, y, w, h };
    regions.push(region);
    paintButton(panel.ctx, region, label, { active, hover: hover === region.id, small: w < 90 });
  }

  function draw(workshop) {
    const { ctx } = panel;
    const { state } = workshop;
    const list = workshop.listParts();
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    roundRect(ctx, 0, 0, WIDTH, HEIGHT, 18);
    ctx.fillStyle = '#1b2126';
    ctx.fill();
    ctx.fillStyle = '#f4efe6';
    ctx.font = '28px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('Asset workshop', 24, 18);
    ctx.font = '16px system-ui, sans-serif';
    ctx.fillStyle = '#9aa59f';
    ctx.fillText(`${state.modelId}  ·  ${state.category}  ·  ${list.parts.length} parts`, 24, 52);
    const regions = [];
    let y = 84;
    const primitives = ['box', 'sphere', 'cylinder', 'cone'];
    primitives.forEach((type, index) => button(regions, type, 'workshop.spawn', { type }, 20 + index * 246, y, 232, 46));
    y += 58;
    ['move', 'rotate', 'scale'].forEach((mode, index) => {
      button(regions, mode, 'workshop.setMode', { mode }, 20 + index * 330, y, 316, 46, state.mode === mode);
    });
    y += 58;
    COLORS.forEach((color, index) => {
      const region = { id: color, command: 'workshop.setColor', params: { color }, x: 20 + index * 110, y, w: 100, h: 40 };
      regions.push(region);
      ctx.fillStyle = color;
      roundRect(ctx, region.x, region.y, region.w, region.h, 8);
      ctx.fill();
    });
    y += 52;
    button(regions, 'Team color', 'workshop.setColor', { color: '#ffffff', teamColor: true }, 20, y, 220, 44);
    button(regions, 'Grain', 'workshop.setGrain', { enabled: true }, 252, y, 140, 44);
    button(regions, 'No grain', 'workshop.setGrain', { enabled: false }, 404, y, 160, 44);
    button(regions, 'Center', 'workshop.center', {}, 576, y, 160, 44);
    button(regions, 'LOD', 'workshop.markLod', {}, 748, y, 250, 44);
    y += 56;
    button(regions, 'Duplicate', 'workshop.duplicate', {}, 20, y, 180, 44);
    button(regions, 'Delete', 'workshop.delete', {}, 212, y, 150, 44);
    button(regions, 'Group', 'workshop.group', {}, 374, y, 140, 44);
    button(regions, 'Ungroup', 'workshop.ungroup', {}, 526, y, 160, 44);
    button(regions, 'Parent', 'workshop.selectParent', {}, 698, y, 150, 44);
    button(regions, 'Clear', 'workshop.clear', {}, 860, y, 140, 44);
    y += 56;
    ['muzzle', 'carry', 'selection_ring'].forEach((name, index) => {
      button(regions, name === 'selection_ring' ? 'ring' : name, 'workshop.addAttachment', { name }, 20 + index * 250, y, 236, 44);
    });
    y += 56;
    ['union', 'subtract', 'intersect'].forEach((op, index) => {
      button(regions, op, 'workshop.boolean', { op }, 20 + index * 330, y, 316, 44);
    });
    y += 64;
    ctx.fillStyle = '#d5ddd8';
    ctx.font = '18px system-ui, sans-serif';
    ctx.fillText(`id ${state.modelId}`, 24, y);
    button(regions, 'Edit id', 'focus', { field: 'modelId' }, 700, y - 8, 140, 36);
    CATEGORIES.forEach((category, index) => {
      button(regions, category, 'workshop.setCategory', { category }, 20 + (index % 5) * 198, y + 28, 186, 40, state.category === category);
    });
    y += 80;
    CLIP_NAMES.forEach((name, index) => {
      button(regions, name, 'animation.setClip', { name }, 20 + (index % 4) * 248, y + Math.floor(index / 4) * 48, 236, 40, state.activeClip === name);
    });
    y += 110;
    const clip = state.clips[state.activeClip];
    button(regions, 'Set key', 'animation.setKey', { time: state.time }, 20, y, 160, 44);
    button(regions, state.playing ? 'Stop' : 'Play', state.playing ? 'animation.stop' : 'animation.play', {}, 192, y, 140, 44);
    button(regions, clip.loop ? 'Loop on' : 'Loop', 'animation.setLoop', { loop: !clip.loop }, 344, y, 150, 44);
    button(regions, 'Time -', 'animation.setTime', { time: Math.max(0, state.time - 0.1) }, 506, y, 140, 44);
    button(regions, 'Time +', 'animation.setTime', { time: state.time + 0.1 }, 658, y, 140, 44);
    button(regions, `${clip.keys.length} keys`, 'animation.setDuration', { duration: clip.duration }, 810, y, 190, 44);
    y += 58;
    button(regions, 'Export zip', 'export.asset', { meshopt: false }, 20, y, 480, 52);
    button(regions, 'Export meshopt', 'export.asset', { meshopt: true }, 516, y, 484, 52);
    y += 64;
    ctx.fillStyle = '#9aa59f';
    ctx.font = '16px system-ui, sans-serif';
    wrap(ctx, state.status || '', 24, y, WIDTH - 48, 22);
    ctx.fillText('Plate center is the origin. Blue arrow is +Z. Grip grabs. Stick yaws and scales.', 24, HEIGHT - 36);
    panel.regions = regions;
    panel.refresh();
  }

  return { panel, draw, setHover(id) { hover = id; } };
}

function wrap(ctx, text, x, y, width, lineHeight) {
  const words = text.split(' ');
  let line = '';
  let cursor = y;
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > width) {
      ctx.fillText(line, x, cursor);
      line = word;
      cursor += lineHeight;
    } else line = next;
  }
  if (line) ctx.fillText(line, x, cursor);
}
