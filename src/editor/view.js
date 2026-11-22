import { caretFromPixel, orderedSelection } from '../core/buffer.js';
import { TOKEN_COLORS, highlightLines } from '../core/highlight.js';
import { createPanel, paintButton, roundRect } from '../scene/canvas.js';

const WIDTH = 1280;
const HEIGHT = 960;

export function createEditorPanel() {
  const panel = createPanel(WIDTH, HEIGHT, 1.22, 0.92);
  const metrics = {
    padX: 18,
    padY: 86,
    lineHeight: 28,
    gutter: 58,
    bottom: 48,
    charW: 14,
  };
  let hover = null;
  let projectsOpen = false;
  let projectRows = [];

  function toolbar() {
    const labels = [
      ['Run', 'preview.run', {}],
      ['Auto', 'preview.setAuto', null],
      ['Save', 'project.save', {}],
      ['New', 'project.new', {}],
      ['Export', 'project.export', {}],
      ['Projects', 'editor.projects', {}],
    ];
    const regions = [];
    let x = 16;
    for (const [label, command, params] of labels) {
      regions.push({ id: command, label, command, params, x, y: 16, w: label.length > 6 ? 150 : 118, h: 48 });
      x += regions[regions.length - 1].w + 10;
    }
    return regions;
  }

  function draw(editor, status, auto) {
    const { ctx } = panel;
    const buf = editor.buffer;
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    roundRect(ctx, 0, 0, WIDTH, HEIGHT, 18);
    ctx.fillStyle = '#1a1f24';
    ctx.fill();
    panel.regions = toolbar();
    for (const region of panel.regions) {
      const active = region.command === 'preview.setAuto' && auto;
      paintButton(ctx, region, region.command === 'preview.setAuto' ? (auto ? 'Auto on' : 'Auto') : region.label, { active, hover: hover === region.id });
    }
    if (projectsOpen) {
      drawProjects(ctx);
      panel.refresh();
      return;
    }
    const textTop = metrics.padY;
    const textHeight = HEIGHT - metrics.padY - metrics.bottom;
    const visible = Math.max(1, Math.floor(textHeight / metrics.lineHeight));
    buf.visibleLines = visible;
    buf.visibleCols = Math.max(8, Math.floor((WIDTH - metrics.padX - metrics.gutter - 28) / metrics.charW));
    ctx.save();
    ctx.beginPath();
    ctx.rect(8, textTop - 8, WIDTH - 16, textHeight + 8);
    ctx.clip();
    const tokens = highlightLines(buf.lines);
    const selection = orderedSelection(buf);
    ctx.font = '22px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    metrics.charW = ctx.measureText('M').width || 13;
    for (let i = 0; i < visible; i += 1) {
      const lineIndex = buf.scroll + i;
      if (lineIndex >= buf.lines.length) break;
      const y = textTop + i * metrics.lineHeight;
      if (lineIndex === buf.line) {
        ctx.fillStyle = '#243036';
        ctx.fillRect(12, y, WIDTH - 36, metrics.lineHeight);
      }
      ctx.fillStyle = '#66716c';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText(String(lineIndex + 1), metrics.padX + metrics.gutter - 12, y + 3);
      const span = selectionOnLine(selection, lineIndex, buf.lines[lineIndex].length);
      if (span) {
        const start = Math.max(0, span[0] - buf.scrollX);
        const end = Math.max(start, span[1] - buf.scrollX);
        ctx.fillStyle = '#3d5c66';
        ctx.fillRect(metrics.padX + metrics.gutter + start * metrics.charW, y, (end - start) * metrics.charW, metrics.lineHeight);
      }
      let x = metrics.padX + metrics.gutter - buf.scrollX * metrics.charW;
      ctx.textAlign = 'left';
      for (const token of tokens[lineIndex]) {
        ctx.fillStyle = TOKEN_COLORS[token.type] || TOKEN_COLORS.plain;
        ctx.fillText(token.text, x, y + 3);
        x += token.text.length * metrics.charW;
      }
      if (lineIndex === buf.line) {
        const caretX = metrics.padX + metrics.gutter + (buf.col - buf.scrollX) * metrics.charW;
        ctx.fillStyle = '#f4efe6';
        ctx.fillRect(caretX, y + 3, 2, metrics.lineHeight - 6);
      }
    }
    ctx.restore();
    ctx.fillStyle = status?.error ? '#e7a0a0' : '#9aa59f';
    ctx.font = '18px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const footer = status?.error || status?.message || 'Aim and trigger. Esc walks. Ctrl+Enter runs.';
    ctx.fillText(footer.slice(0, 110), 18, HEIGHT - 24);
    panel.refresh();
  }

  function selectionOnLine(selection, lineIndex, length) {
  if (!selection) return null;
  if (lineIndex < selection.start.line || lineIndex > selection.end.line) return null;
  const start = lineIndex === selection.start.line ? selection.start.col : 0;
  const end = lineIndex === selection.end.line ? selection.end.col : length;
  return [start, end];
}

function drawProjects(ctx) {
    ctx.fillStyle = '#d5ddd8';
    ctx.font = '22px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Saved projects', 24, 90);
    panel.regions.push({ id: 'close-projects', command: 'editor.projects', params: {}, x: 1080, y: 16, w: 160, h: 48, label: 'Close' });
    paintButton(ctx, panel.regions[panel.regions.length - 1], 'Close', { hover: hover === 'close-projects' });
    projectRows.forEach((project, index) => {
      const region = { id: project.id, command: 'project.load', params: { id: project.id }, x: 24, y: 120 + index * 64, w: 900, h: 52, label: project.name };
      panel.regions.push(region);
      paintButton(ctx, region, project.name || project.id, { hover: hover === project.id });
    });
    if (!projectRows.length) {
      ctx.fillStyle = '#9aa59f';
      ctx.fillText('No saved projects yet. Save stores one in this browser.', 24, 140);
    }
  }

  function pointer(px, py, phase, editor) {
    if (projectsOpen && phase === 'down') {
      const region = panel.hit(px, py);
      return region;
    }
    const region = panel.hit(px, py);
    if (region) return region;
    if (py < metrics.padY || py > HEIGHT - metrics.bottom) return null;
    const caret = caretFromPixel(editor.buffer, px, py, metrics);
    return { id: 'text', caret };
  }

  return {
    panel,
    metrics,
    draw,
    pointer,
    setHover(id) { hover = id; },
    setProjects(open, rows) {
      projectsOpen = open;
      projectRows = rows || [];
    },
    get projectsOpen() { return projectsOpen; },
  };
}
