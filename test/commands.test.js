import { beforeEach, describe, expect, it } from 'vitest';
import { setAppContext } from '../src/app/context.js';
import { installCommands } from '../src/commands/catalog.js';
import { dispatch } from '../src/commands/registry.js';
import { commandNameFromTool, mcpTools, openAiTools } from '../src/commands/tools.js';
import { createEditor } from '../src/editor/model.js';
import { handleAgentMessage } from '../src/mcp/bridge.js';
import { consumeOpenAiBlock, finishOpenAiState } from '../src/ai/openai.js';
import { consumeAnthropicEvent, finishAnthropicState } from '../src/ai/anthropic.js';
import { geminiMessageFromResponse } from '../src/ai/gemini.js';

installCommands();

describe('command layer', () => {
  beforeEach(() => {
    setAppContext({
      editor: createEditor(''),
      preview: {
        run: async () => ({ auto: true, error: '', running: false }),
        clear: () => ({ auto: true, error: '', running: false }),
        setAuto: (enabled) => ({ auto: enabled, error: '', running: false }),
        getStatus: () => ({ auto: true, error: '', running: false }),
      },
      help: { commands: () => ({ commands: [] }) },
    });
  });

  it('edits through the same command the headset uses', async () => {
    const inserted = await dispatch('editor.insert', { text: 'let ' }, { source: 'ui' });
    expect(inserted.status).toBe('ok');
    expect(inserted.result.text).toBe('let ');
    const blocked = await dispatch('editor.replace', { text: 'gone' }, { source: 'ai' });
    expect(blocked.status).toBe('confirmation_required');
    const replaced = await dispatch('editor.replace', { text: 'gone' }, { source: 'ai', confirmed: true });
    expect(replaced.result.text).toBe('gone');
  });

  it('rejects unknown params', async () => {
    await expect(dispatch('editor.insert', {}, { source: 'ui' })).rejects.toThrow(/required/);
  });

  it('publishes model tools and hides settings', () => {
    const names = openAiTools().map((tool) => tool.function.name);
    expect(names).toContain('editor_insert');
    expect(names).not.toContain('settings_set');
    expect(commandNameFromTool('workshop_spawn')).toBe('workshop.spawn');
    expect(mcpTools().some((tool) => tool.name === 'settings.set')).toBe(true);
  });
});

describe('agent bridge', () => {
  it('lists and calls tools', async () => {
    setAppContext({
      editor: createEditor(''),
      help: { commands: () => ({ commands: [] }) },
    });
    const listed = await handleAgentMessage({ id: 1, method: 'tools/list' });
    expect(listed.result.tools.length).toBeGreaterThan(10);
    const denied = await handleAgentMessage({
      id: 2,
      method: 'tools/call',
      params: { name: 'editor.replace', arguments: { text: 'nope' } },
    });
    expect(denied.result.status).toBe('confirmation_required');
    const allowed = await handleAgentMessage({
      id: 3,
      method: 'tools/call',
      params: { name: 'editor.insert', arguments: { text: 'ok' }, confirmed: true },
    });
    expect(allowed.result.result.text).toBe('ok');
  });
});

describe('provider streams', () => {
  it('assembles OpenAI tool calls', () => {
    const state = { content: '', tools: [], events: [] };
    consumeOpenAiBlock('data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n', state);
    consumeOpenAiBlock('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"editor_get","arguments":""}}]}}]}', state);
    consumeOpenAiBlock('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{}"}}]}}]}', state);
    const message = finishOpenAiState(state);
    expect(message.content).toBe('Hi');
    expect(message.toolCalls[0].name).toBe('editor.get');
    expect(message.toolCalls[0].arguments).toEqual({});
  });

  it('assembles Anthropic and Gemini tool calls', () => {
    const state = { content: '', tools: [], events: [] };
    consumeAnthropicEvent({ type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'tu_1', name: 'preview_run' } }, state);
    consumeAnthropicEvent({ type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{}' } }, state);
    consumeAnthropicEvent({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Running' } }, state);
    expect(finishAnthropicState(state).toolCalls[0].name).toBe('preview.run');
    const gemini = geminiMessageFromResponse({
      candidates: [{ content: { parts: [{ text: 'ok' }, { functionCall: { name: 'workshop_list', args: {} } }] } }],
    });
    expect(gemini.toolCalls[0].name).toBe('workshop.list');
  });
});

