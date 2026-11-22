import { createPanel, paintButton, roundRect } from '../scene/canvas.js';
import { PROVIDER_DEFAULTS } from './settings.js';

const WIDTH = 1100;
const HEIGHT = 720;

export function createAiPanel() {
  const panel = createPanel(WIDTH, HEIGHT, 1.05, 0.68);
  let hover = null;
  let page = 'chat';

  function draw(session, settings) {
    const { ctx } = panel;
    const view = session.view();
    const prefs = settings.get();
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    roundRect(ctx, 0, 0, WIDTH, HEIGHT, 18);
    ctx.fillStyle = '#171d22';
    ctx.fill();
    const regions = [];
    const header = [
      ['Chat', 'page', { page: 'chat' }],
      ['Setup', 'page', { page: 'setup' }],
      ['Mic', 'ai.voice', {}],
      ['Send', 'ai.send', {}],
    ];
    header.forEach((item, index) => {
      const region = { id: item[0], kind: item[1], params: item[2], x: 16 + index * 140, y: 14, w: 128, h: 42, label: item[0] };
      regions.push(region);
      paintButton(ctx, region, item[0], { active: item[0].toLowerCase() === page || (item[0] === 'Send' && view.busy), hover: hover === item[0] });
    });
    ctx.fillStyle = '#9aa59f';
    ctx.font = '16px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${prefs.provider} · ${prefs.model}${prefs.hasKey ? '' : ' · no key'}`, 590, 36);

    if (page === 'setup') drawSetup(ctx, regions, prefs);
    else drawChat(ctx, regions, view);
    panel.regions = regions;
    panel.refresh();
  }

  function drawChat(ctx, regions, view) {
    ctx.fillStyle = '#d5ddd8';
    ctx.font = '18px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    let y = 72;
    const lines = [];
    for (const message of view.messages) {
      const who = message.role === 'tool' ? 'tool' : message.role;
      const body = message.role === 'tool' ? `${message.name || 'tool'}: ${message.content}` : message.content;
      lines.push(`${who}: ${body || ''}`);
    }
    if (view.streaming) lines.push(`assistant: ${view.streaming}`);
    const visible = lines.slice(-8);
    for (const line of visible) {
      ctx.fillStyle = line.startsWith('tool') ? '#e0a15a' : '#d5ddd8';
      ctx.fillText(line.slice(0, 92), 20, y);
      y += 26;
    }
    if (view.pending) {
      ctx.fillStyle = '#e7c07b';
      ctx.fillText(`Confirm ${view.pending.command}?`, 20, 500);
      const allow = { id: 'allow', command: 'ai.confirm', params: { accepted: true }, x: 20, y: 530, w: 180, h: 46, label: 'Allow' };
      const deny = { id: 'deny', command: 'ai.confirm', params: { accepted: false }, x: 212, y: 530, w: 180, h: 46, label: 'Deny' };
      regions.push(allow, deny);
      paintButton(ctx, allow, 'Allow', { hover: hover === 'allow' });
      paintButton(ctx, deny, 'Deny', { hover: hover === 'deny' });
    }
    ctx.fillStyle = '#8ea29a';
    ctx.fillText((view.draft || 'Message the assistant…').slice(0, 80), 20, 640);
    if (view.error) {
      ctx.fillStyle = '#e7a0a0';
      ctx.fillText(view.error.slice(0, 100), 20, 672);
    } else if (view.log.length) {
      ctx.fillStyle = '#6ec8c0';
      const last = view.log[view.log.length - 1];
      ctx.fillText(`${last.name} → ${last.status}`, 20, 672);
    }
  }

  function drawSetup(ctx, regions, prefs) {
    ctx.fillStyle = '#d5ddd8';
    ctx.font = '18px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    let y = 80;
    Object.keys(PROVIDER_DEFAULTS).forEach((provider, index) => {
      const region = { id: provider, command: 'settings.set', params: { provider }, x: 20 + index * 200, y, w: 188, h: 44, label: provider };
      regions.push(region);
      paintButton(ctx, region, provider, { active: prefs.provider === provider, hover: hover === provider });
    });
    y += 70;
    ctx.fillText(`Model: ${prefs.model}`, 20, y);
    ctx.fillText(`Base: ${prefs.baseUrl}`, 20, y + 32);
    ctx.fillText(prefs.hasKey ? 'API key is stored on this device.' : 'No API key yet. Focus Key and type it.', 20, y + 64);
    ctx.fillText(`Agent socket: ${prefs.agentSocketUrl || '(none)'}`, 20, y + 96);
    const fields = [
      ['Model', 'model'],
      ['Base URL', 'baseUrl'],
      ['API key', 'apiKey'],
      ['Socket', 'agentSocketUrl'],
    ];
    fields.forEach((field, index) => {
      const region = { id: field[1], kind: 'field', field: field[1], x: 20 + (index % 2) * 360, y: y + 140 + Math.floor(index / 2) * 56, w: 340, h: 46, label: field[0] };
      regions.push(region);
      paintButton(ctx, region, field[0], { hover: hover === field[1] });
    });
    const connect = { id: 'connect', command: 'agent.connect', params: {}, x: 20, y: 470, w: 240, h: 46, label: 'Connect agent' };
    const disconnect = { id: 'disconnect', command: 'agent.disconnect', params: {}, x: 276, y: 470, w: 240, h: 46, label: 'Disconnect' };
    regions.push(connect, disconnect);
    paintButton(ctx, connect, 'Connect agent', { hover: hover === 'connect' });
    paintButton(ctx, disconnect, 'Disconnect', { hover: hover === 'disconnect' });
    ctx.fillStyle = '#9aa59f';
    ctx.font = '16px system-ui, sans-serif';
    wrap(ctx, 'The key stays in localStorage and is sent only to the base URL above. The model cannot read it. For Ollama use http://localhost:11434/v1 and allow this origin.', 20, 540, WIDTH - 40, 22);
  }

  return {
    panel,
    draw,
    setHover(id) { hover = id; },
    get page() { return page; },
    setPage(next) { page = next; },
  };
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
