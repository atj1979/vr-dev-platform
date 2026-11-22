import { dispatch } from '../commands/registry.js';
import { streamAnthropic } from './anthropic.js';
import { streamGemini } from './gemini.js';
import { streamOpenAI } from './openai.js';
import { secretSettings } from './settings.js';

const STREAMS = {
  openai: streamOpenAI,
  anthropic: streamAnthropic,
  gemini: streamGemini,
};

const SYSTEM = `You are the in-headset assistant for VR Dev Platform, a WebXR tool for building original VR scenes and game assets.
Use the provided tools to edit the scene module, run it, and build assets. The scene module is JavaScript: export default function (THREE, scene, ctx). Add meshes to scene. Return { update(dt, time) } if something should animate.
Read the module with editor.get before rewriting it. Prefer editor.insert and editor.input for small edits. editor.replace replaces the whole file and asks the user to confirm.
Assets are original primitives on the build plate. Export is Y-up, meters, facing +Z. A material named team_color is tinted by the game. Do not invent downloaded models.
Destructive tools return confirmation_required until the user allows them. When that happens, stop and wait; the app will send the tool result after the user chooses.
Keep replies short enough to read in a headset.`;

export function createAiSession() {
  const messages = [{ role: 'system', content: SYSTEM }];
  let draft = '';
  let streaming = '';
  let busy = false;
  let error = '';
  let pending = null;
  let revision = 1;
  let abort = null;
  const log = [];

  const touch = () => { revision += 1; };

  function view() {
    return {
      messages: messages.filter((message) => message.role !== 'system').slice(-14),
      streaming,
      draft,
      busy,
      error,
      pending: pending ? { command: pending.call.name, description: pending.description, arguments: pending.call.arguments } : null,
      log: log.slice(-6),
      revision,
    };
  }

  function confirm(accepted) {
    if (!pending) return { accepted: false };
    pending.resolve(Boolean(accepted));
    return { accepted: Boolean(accepted) };
  }

  async function executeCall(call) {
    if (!call.name) {
      return { status: 'error', error: `Unknown tool ${call.toolName}` };
    }
    let outcome = await dispatch(call.name, call.arguments || {}, { source: 'ai', confirmed: false });
    if (outcome.status === 'confirmation_required') {
      const accepted = await new Promise((resolve) => {
        pending = { call, description: outcome.description, resolve };
        touch();
      });
      pending = null;
      touch();
      outcome = accepted
        ? await dispatch(call.name, call.arguments || {}, { source: 'ai', confirmed: true })
        : { status: 'error', error: 'The user denied this command.' };
    }
    log.push({ name: call.name, status: outcome.status });
    return outcome;
  }

  async function send(text) {
    const content = (text ?? draft).trim();
    if (!content || busy) return view();
    const settings = secretSettings();
    if (!settings.apiKey) {
      error = 'Add an API key in the AI panel. It stays in this browser.';
      touch();
      return view();
    }
    const stream = STREAMS[settings.provider] || STREAMS.openai;
    draft = '';
    error = '';
    busy = true;
    messages.push({ role: 'user', content });
    abort = new AbortController();
    touch();
    try {
      for (let round = 0; round < 6; round += 1) {
        streaming = '';
        let finished = null;
        for await (const event of stream({
          apiKey: settings.apiKey,
          baseUrl: settings.baseUrl,
          model: settings.model,
          messages,
          signal: abort.signal,
        })) {
          if (event.type === 'text') {
            streaming += event.delta;
            touch();
          }
          if (event.type === 'done') finished = event.message;
        }
        const assistant = finished || { content: streaming, toolCalls: [] };
        messages.push({
          role: 'assistant',
          content: assistant.content || '',
          toolCalls: assistant.toolCalls || [],
        });
        streaming = '';
        if (!assistant.toolCalls?.length) break;
        for (const call of assistant.toolCalls) {
          const outcome = await executeCall(call);
          messages.push({
            role: 'tool',
            toolCallId: call.id,
            toolName: call.toolName,
            name: call.name,
            content: JSON.stringify(outcome),
          });
          touch();
        }
      }
    } catch (err) {
      if (err?.name !== 'AbortError') error = err.message || String(err);
    } finally {
      busy = false;
      streaming = '';
      abort = null;
      touch();
    }
    return view();
  }

  function stop() {
    abort?.abort();
    return view();
  }

  return {
    get revision() { return revision; },
    view,
    send,
    confirm,
    stop,
    setDraft(text) { draft = text; touch(); return draft; },
    appendDraft(text) { draft += text; touch(); return draft; },
    backspaceDraft() { draft = draft.slice(0, -1); touch(); return draft; },
  };
}
