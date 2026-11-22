import { commandNameFromTool, openAiTools } from '../commands/tools.js';

export function toOpenAiMessages(messages) {
  return messages.map((message) => {
    if (message.role === 'tool') {
      return { role: 'tool', tool_call_id: message.toolCallId, content: message.content };
    }
    if (message.role === 'assistant' && message.toolCalls?.length) {
      return {
        role: 'assistant',
        content: message.content || null,
        tool_calls: message.toolCalls.map((call) => ({
          id: call.id,
          type: 'function',
          function: { name: call.toolName, arguments: JSON.stringify(call.arguments ?? {}) },
        })),
      };
    }
    return { role: message.role, content: message.content || '' };
  });
}

export function consumeOpenAiBlock(block, state) {
  const lines = block.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    const data = trimmed.slice(5).trim();
    if (!data || data === '[DONE]') continue;
    let json;
    try { json = JSON.parse(data); } catch { continue; }
    const delta = json.choices?.[0]?.delta;
    if (!delta) continue;
    if (delta.content) {
      state.content += delta.content;
      state.events.push({ type: 'text', delta: delta.content });
    }
    for (const tool of delta.tool_calls || []) {
      const index = tool.index ?? 0;
      const current = state.tools[index] || { id: '', toolName: '', arguments: '' };
      if (tool.id) current.id = tool.id;
      if (tool.function?.name) current.toolName += tool.function.name;
      if (tool.function?.arguments) current.arguments += tool.function.arguments;
      state.tools[index] = current;
    }
  }
}

export function finishOpenAiState(state) {
  const toolCalls = state.tools.filter(Boolean).map((tool) => {
    let args = {};
    try { args = tool.arguments ? JSON.parse(tool.arguments) : {}; } catch { args = {}; }
    return {
      id: tool.id || `call_${tool.toolName}`,
      toolName: tool.toolName,
      name: commandNameFromTool(tool.toolName),
      arguments: args,
    };
  });
  return { content: state.content, toolCalls };
}

export async function* streamOpenAI({ apiKey, baseUrl, model, messages, signal }) {
  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
  const response = await fetch(url, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: toOpenAiMessages(messages),
      tools: openAiTools(),
      stream: true,
    }),
  });
  if (!response.ok) throw new Error(await response.text());
  const state = { content: '', tools: [], events: [] };
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    pending += decoder.decode(value, { stream: true });
    const blocks = pending.split('\n\n');
    pending = blocks.pop() || '';
    for (const block of blocks) consumeOpenAiBlock(block, state);
  }
  if (pending) consumeOpenAiBlock(pending, state);
  for (const event of state.events) yield event;
  yield { type: 'done', message: finishOpenAiState(state) };
}
