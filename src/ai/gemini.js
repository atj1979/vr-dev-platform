import { commandNameFromTool, geminiTools } from '../commands/tools.js';

export function toGeminiContents(messages) {
  let system = '';
  const contents = [];
  for (const message of messages) {
    if (message.role === 'system') {
      system += `${message.content}\n`;
      continue;
    }
    if (message.role === 'tool') {
      contents.push({
        role: 'user',
        parts: [{
          functionResponse: {
            name: message.toolName,
            response: { result: message.content },
          },
        }],
      });
      continue;
    }
    if (message.role === 'assistant') {
      const parts = [];
      if (message.content) parts.push({ text: message.content });
      for (const call of message.toolCalls || []) {
        parts.push({ functionCall: { name: call.toolName, args: call.arguments || {} } });
      }
      if (parts.length) contents.push({ role: 'model', parts });
      continue;
    }
    contents.push({ role: 'user', parts: [{ text: message.content || '' }] });
  }
  return { system: system.trim(), contents };
}

export function geminiMessageFromResponse(json) {
  const parts = json.candidates?.[0]?.content?.parts || [];
  let content = '';
  const toolCalls = [];
  for (const part of parts) {
    if (part.text) content += part.text;
    if (part.functionCall) {
      toolCalls.push({
        id: `gem_${part.functionCall.name}_${toolCalls.length}`,
        toolName: part.functionCall.name,
        name: commandNameFromTool(part.functionCall.name),
        arguments: part.functionCall.args || {},
      });
    }
  }
  return { content, toolCalls };
}

export async function* streamGemini({ apiKey, baseUrl, model, messages, signal }) {
  const payload = toGeminiContents(messages);
  const root = baseUrl.replace(/\/$/, '');
  const url = `${root}/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;
  const response = await fetch(url, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      systemInstruction: payload.system ? { parts: [{ text: payload.system }] } : undefined,
      contents: payload.contents,
      tools: geminiTools(),
    }),
  });
  if (!response.ok) throw new Error(await response.text());
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  let content = '';
  const toolCalls = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    pending += decoder.decode(value, { stream: true });
    const blocks = pending.split('\n\n');
    pending = blocks.pop() || '';
    for (const block of blocks) {
      const data = block.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).join('\n');
      if (!data) continue;
      let json;
      try { json = JSON.parse(data); } catch { continue; }
      const message = geminiMessageFromResponse(json);
      if (message.content && message.content !== content) {
        const delta = message.content.startsWith(content) ? message.content.slice(content.length) : message.content;
        content = message.content;
        if (delta) yield { type: 'text', delta };
      }
      for (const call of message.toolCalls) {
        if (!toolCalls.some((existing) => existing.toolName === call.toolName && JSON.stringify(existing.arguments) === JSON.stringify(call.arguments))) {
          toolCalls.push(call);
        }
      }
    }
  }
  yield { type: 'done', message: { content, toolCalls } };
}
