import { anthropicTools, commandNameFromTool } from '../commands/tools.js';

export function toAnthropicMessages(messages) {
  const system = messages.filter((message) => message.role === 'system').map((message) => message.content).join('\n');
  const converted = [];
  for (const message of messages) {
    if (message.role === 'system') continue;
    if (message.role === 'tool') {
      converted.push({
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: message.toolCallId,
          content: message.content,
        }],
      });
      continue;
    }
    if (message.role === 'assistant') {
      const content = [];
      if (message.content) content.push({ type: 'text', text: message.content });
      for (const call of message.toolCalls || []) {
        content.push({
          type: 'tool_use',
          id: call.id,
          name: call.toolName,
          input: call.arguments || {},
        });
      }
      if (content.length) converted.push({ role: 'assistant', content });
      continue;
    }
    converted.push({ role: 'user', content: message.content || '' });
  }
  return { system, messages: converted };
}

export function consumeAnthropicEvent(json, state) {
  if (json.type === 'content_block_start' && json.content_block?.type === 'tool_use') {
    state.tools[json.index] = {
      id: json.content_block.id,
      toolName: json.content_block.name,
      arguments: '',
    };
  }
  if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta') {
    state.content += json.delta.text || '';
    state.events.push({ type: 'text', delta: json.delta.text || '' });
  }
  if (json.type === 'content_block_delta' && json.delta?.type === 'input_json_delta') {
    const tool = state.tools[json.index];
    if (tool) tool.arguments += json.delta.partial_json || '';
  }
}

export function finishAnthropicState(state) {
  return {
    content: state.content,
    toolCalls: state.tools.filter(Boolean).map((tool) => {
      let args = {};
      try { args = tool.arguments ? JSON.parse(tool.arguments) : {}; } catch { args = {}; }
      return {
        id: tool.id,
        toolName: tool.toolName,
        name: commandNameFromTool(tool.toolName),
        arguments: args,
      };
    }),
  };
}

export async function* streamAnthropic({ apiKey, baseUrl, model, messages, signal }) {
  const payload = toAnthropicMessages(messages);
  const root = baseUrl.replace(/\/$/, '');
  const url = root.endsWith('/v1') ? `${root}/messages` : `${root}/v1/messages`;
  const response = await fetch(url, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: payload.system,
      messages: payload.messages,
      tools: anthropicTools(),
      stream: true,
    }),
  });
  if (!response.ok) throw new Error(await response.text());
  const state = { content: '', tools: [], events: [] };
  yield* readSse(response, (json) => consumeAnthropicEvent(json, state), state);
  yield { type: 'done', message: finishAnthropicState(state) };
}

export async function* readSse(response, onEvent, state) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    pending += decoder.decode(value, { stream: true });
    const blocks = pending.split('\n\n');
    pending = blocks.pop() || '';
    for (const block of blocks) {
      const data = block.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).join('\n');
      if (!data || data === '[DONE]') continue;
      try { onEvent(JSON.parse(data)); } catch { /* ignore keepalives */ }
    }
  }
  for (const event of state.events) yield event;
  state.events.length = 0;
}
