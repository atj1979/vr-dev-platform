import { getAppContext } from '../app/context.js';
import { register } from '../commands/registry.js';
import { PROVIDER_DEFAULTS } from './settings.js';
import { EMPTY_PARAMS } from '../editor/template.js';

const PUBLIC = {
  type: 'object',
  additionalProperties: true,
  properties: {
    provider: { type: 'string' },
    baseUrl: { type: 'string' },
    model: { type: 'string' },
    hasKey: { type: 'boolean' },
    agentSocketUrl: { type: 'string' },
    connected: { type: 'boolean' },
  },
};

export function registerAiCommands() {
  const ai = () => getAppContext().ai;
  const settings = () => getAppContext().settings;

  register({
    name: 'ai.send',
    description: 'Send a chat message to the configured model. The model can call tools.',
    aiVisible: false,
    params: {
      type: 'object',
      additionalProperties: false,
      required: ['text'],
      properties: { text: { type: 'string', minLength: 1 } },
    },
    result: { type: 'object', additionalProperties: true },
    run(params) { return ai().send(params.text); },
  });

  register({
    name: 'ai.confirm',
    description: 'Allow or deny the destructive tool call the assistant is waiting on.',
    aiVisible: false,
    params: {
      type: 'object',
      additionalProperties: false,
      required: ['accepted'],
      properties: { accepted: { type: 'boolean' } },
    },
    result: {
      type: 'object',
      additionalProperties: false,
      required: ['accepted'],
      properties: { accepted: { type: 'boolean' } },
    },
    run(params) { return ai().confirm(params.accepted); },
  });

  register({
    name: 'ai.stop',
    description: 'Stop the assistant response that is currently streaming.',
    aiVisible: false,
    params: EMPTY_PARAMS,
    result: { type: 'object', additionalProperties: true },
    run() { return ai().stop(); },
  });

  register({
    name: 'settings.get',
    description: 'Read the AI provider, model, and whether a key is stored. The key itself is never returned.',
    aiVisible: false,
    params: EMPTY_PARAMS,
    result: PUBLIC,
    run() { return settings().get(); },
  });

  register({
    name: 'settings.set',
    description: 'Store the provider, base URL, model, or API key locally. The key is sent only to that provider.',
    aiVisible: false,
    params: {
      type: 'object',
      additionalProperties: false,
      properties: {
        provider: { type: 'string', enum: Object.keys(PROVIDER_DEFAULTS) },
        baseUrl: { type: 'string' },
        model: { type: 'string' },
        apiKey: { type: 'string' },
        clearKey: { type: 'boolean' },
        agentSocketUrl: { type: 'string' },
      },
    },
    result: PUBLIC,
    run(params) { return settings().set(params); },
  });

  register({
    name: 'agent.connect',
    description: 'Open a WebSocket to an external agent bridge and serve tools/list and tools/call.',
    aiVisible: false,
    params: {
      type: 'object',
      additionalProperties: false,
      properties: { url: { type: 'string' } },
    },
    result: PUBLIC,
    run(params) { return settings().connect(params.url); },
  });

  register({
    name: 'agent.disconnect',
    description: 'Close the external agent WebSocket.',
    aiVisible: false,
    params: EMPTY_PARAMS,
    result: PUBLIC,
    run() { return settings().disconnect(); },
  });

  register({
    name: 'help.commands',
    description: 'List every command name, whether it is destructive, and whether the in-app model can call it.',
    params: EMPTY_PARAMS,
    result: {
      type: 'object',
      additionalProperties: false,
      required: ['commands'],
      properties: {
        commands: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['name', 'description', 'destructive'],
            properties: {
              name: { type: 'string' },
              description: { type: 'string' },
              destructive: { type: 'boolean' },
              aiVisible: { type: 'boolean' },
            },
          },
        },
      },
    },
    run() { return getAppContext().help.commands(); },
  });
}
