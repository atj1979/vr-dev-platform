import { dispatch } from '../commands/registry.js';
import { mcpTools } from '../commands/tools.js';

export const AGENT_CHANNEL = 'vr-dev-platform';

export async function handleAgentMessage(message) {
  const id = message?.id ?? null;
  if (!message || typeof message.method !== 'string') {
    return { id, error: { message: 'Expected a method' } };
  }
  if (message.method === 'ping' || message.method === 'initialize') {
    return { id, result: { name: 'vr-dev-platform', version: '0.1.0' } };
  }
  if (message.method === 'tools/list') {
    return { id, result: { tools: mcpTools() } };
  }
  if (message.method === 'tools/call') {
    const name = message.params?.name;
    const args = message.params?.arguments || {};
    try {
      const outcome = await dispatch(name, args, {
        source: 'mcp',
        confirmed: message.params?.confirmed === true,
      });
      return { id, result: outcome };
    } catch (error) {
      return { id, error: { message: error.message || String(error) } };
    }
  }
  return { id, error: { message: `Unknown method ${message.method}` } };
}

export function installPostMessageBridge() {
  if (typeof window === 'undefined') return () => {};
  const agentMode = new URLSearchParams(window.location.search).has('agent');
  const onMessage = async (event) => {
    const data = event.data;
    if (!data || data.channel !== AGENT_CHANNEL || data.reply) return;
    if (!agentMode && event.origin !== window.location.origin) return;
    const response = await handleAgentMessage(data);
    const target = event.source;
    if (!target?.postMessage) return;
    target.postMessage({ channel: AGENT_CHANNEL, reply: true, ...response }, event.origin || '*');
  };
  window.addEventListener('message', onMessage);
  return () => window.removeEventListener('message', onMessage);
}

export function connectAgentSocket(url, onStatus) {
  if (typeof WebSocket === 'undefined') throw new Error('WebSocket is not available');
  const socket = new WebSocket(url);
  socket.addEventListener('open', () => {
    onStatus?.('connected');
    socket.send(JSON.stringify({ method: 'ready', params: { name: 'vr-dev-platform' } }));
  });
  socket.addEventListener('close', () => onStatus?.('disconnected'));
  socket.addEventListener('error', () => onStatus?.('error'));
  socket.addEventListener('message', async (event) => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    if (!message.method) return;
    const response = await handleAgentMessage(message);
    socket.send(JSON.stringify(response));
  });
  return socket;
}
