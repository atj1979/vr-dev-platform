import { listAiTools, listCommandSpecs } from './registry.js';

export function toolNameFor(commandName) {
  return commandName.replaceAll('.', '_');
}

export function commandNameFromTool(toolName) {
  const match = listAiTools().find((spec) => toolNameFor(spec.name) === toolName);
  return match?.name || null;
}

function modelDescription(spec) {
  return spec.destructive
    ? `${spec.description} Requires user confirmation before it runs.`
    : spec.description;
}

export function openAiTools() {
  return listAiTools().map((spec) => ({
    type: 'function',
    function: {
      name: toolNameFor(spec.name),
      description: modelDescription(spec),
      parameters: spec.params,
    },
  }));
}

export function anthropicTools() {
  return listAiTools().map((spec) => ({
    name: toolNameFor(spec.name),
    description: modelDescription(spec),
    input_schema: spec.params,
  }));
}

function geminiSchema(schema) {
  if (!schema || typeof schema !== 'object') return schema;
  const next = {};
  for (const key of ['type', 'description', 'enum', 'minimum', 'maximum', 'minLength', 'maxLength']) {
    if (schema[key] !== undefined) next[key] = schema[key];
  }
  if (schema.properties) {
    next.properties = {};
    for (const [key, value] of Object.entries(schema.properties)) {
      next.properties[key] = geminiSchema(value);
    }
  }
  if (schema.required) next.required = schema.required;
  if (schema.items) next.items = geminiSchema(schema.items);
  return next;
}

export function geminiTools() {
  return [{
    functionDeclarations: listAiTools().map((spec) => ({
      name: toolNameFor(spec.name),
      description: modelDescription(spec),
      parameters: geminiSchema(spec.params),
    })),
  }];
}

export function mcpTools() {
  return listCommandSpecs().map((spec) => ({
    name: spec.name,
    description: spec.description,
    inputSchema: spec.params,
    destructive: Boolean(spec.destructive),
    aiVisible: spec.aiVisible !== false,
  }));
}
