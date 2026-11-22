import { validate } from './validate.js';

const commands = new Map();

export class CommandError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'CommandError';
    this.code = code;
    this.details = details;
  }
}

export function register(spec) {
  if (!spec?.name || !spec.description || !spec.params || !spec.result || typeof spec.run !== 'function') {
    throw new Error(`Incomplete command spec: ${spec?.name || '(unnamed)'}`);
  }
  if (commands.has(spec.name)) throw new Error(`Duplicate command ${spec.name}`);
  commands.set(spec.name, {
    aiVisible: true,
    destructive: false,
    ...spec,
  });
}

export function resetCommands() {
  commands.clear();
}

export function getCommand(name) {
  return commands.get(name) || null;
}

export function listCommandSpecs() {
  return [...commands.values()]
    .map(({ run, ...spec }) => spec)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function listAiTools() {
  return listCommandSpecs().filter((spec) => spec.aiVisible);
}

/**
 * Run a command. UI clicks pass source "ui", which counts as confirmation.
 * AI and external agents must pass confirmed: true for destructive commands.
 */
export async function dispatch(name, params = {}, options = {}) {
  const spec = commands.get(name);
  if (!spec) throw new CommandError('unknown_command', `Unknown command "${name}"`);
  const paramsMessage = validate(spec.params, params);
  if (paramsMessage) throw new CommandError('invalid_params', paramsMessage, { name });
  const source = options.source ?? 'api';
  const confirmed = options.confirmed === true || source === 'ui';
  if (spec.destructive && !confirmed) {
    return {
      status: 'confirmation_required',
      command: name,
      params,
      description: spec.description,
    };
  }
  try {
    const result = await spec.run(params, { source, confirmed });
    return { status: 'ok', result };
  } catch (error) {
    return {
      status: 'error',
      error: error?.message || String(error),
    };
  }
}

export function run(name, params) {
  return dispatch(name, params, { source: 'ui', confirmed: true });
}
