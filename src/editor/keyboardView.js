import { createPanel, roundRect } from '../scene/canvas.js';
import { KEYBOARD_SIZE, keyboardLayout } from './keyLayout.js';

export function createKeyboardPanel() {
  const panel = createPanel(KEYBOARD_SIZE.width, KEYBOARD_SIZE.height, 1.22, 0.48);
  let symbols = false;
  let shift = false;
  let hover = null;

  function layout() {
    return keyboardLayout({ symbols, shift });
  }

  function draw() {
    const { ctx } = panel;
    const keys = layout().keys;
    ctx.clearRect(0, 0, KEYBOARD_SIZE.width, KEYBOARD_SIZE.height);
    roundRect(ctx, 0, 0, KEYBOARD_SIZE.width, KEYBOARD_SIZE.height, 16);
    ctx.fillStyle = '#171c20';
    ctx.fill();
    panel.regions = keys.map((key) => ({ ...key }));
    ctx.font = '22px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const key of keys) {
      const active = (key.id === 'shift' && shift) || (key.id === 'sym' && symbols);
      ctx.fillStyle = key.id === hover ? '#3d6a66' : active ? '#3d5a54' : '#2c3438';
      roundRect(ctx, key.x, key.y, key.w, key.h, 8);
      ctx.fill();
      ctx.fillStyle = '#f4efe6';
      ctx.fillText(key.label, key.x + key.w / 2, key.y + key.h / 2 + 1);
    }
    panel.refresh();
  }

  function toggle(which) {
    if (which === 'shift') shift = !shift;
    if (which === 'sym') symbols = !symbols;
    if (which === 'shift-once') shift = false;
    draw();
  }

  return {
    panel,
    draw,
    toggle,
    consumeShift() {
      if (shift) {
        shift = false;
        draw();
      }
    },
    setHover(id) {
      if (hover === id) return;
      hover = id;
      draw();
    },
  };
}
