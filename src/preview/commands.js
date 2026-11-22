import { getAppContext } from '../app/context.js';
import { register } from '../commands/registry.js';
import { EMPTY_PARAMS } from '../editor/template.js';

const STATUS = {
  type: 'object',
  additionalProperties: false,
  required: ['auto', 'error', 'running'],
  properties: {
    auto: { type: 'boolean' },
    error: { type: 'string' },
    running: { type: 'boolean' },
  },
};

export function registerPreviewCommands() {
  const preview = () => getAppContext().preview;

  register({
    name: 'preview.run',
    description: 'Run the scene module and rebuild the sandboxed preview group.',
    params: EMPTY_PARAMS,
    result: STATUS,
    run() { return preview().run(); },
  });

  register({
    name: 'preview.clear',
    description: 'Remove every object from the preview group and stop its update loop.',
    destructive: true,
    params: EMPTY_PARAMS,
    result: STATUS,
    run() { return preview().clear(); },
  });

  register({
    name: 'preview.setAuto',
    description: 'Turn hot reload on or off. When on, edits rerun the module after a short pause.',
    params: {
      type: 'object',
      additionalProperties: false,
      required: ['enabled'],
      properties: { enabled: { type: 'boolean' } },
    },
    result: STATUS,
    run(params) { return preview().setAuto(params.enabled); },
  });

  register({
    name: 'preview.status',
    description: 'Read whether hot reload is on and the last preview error.',
    params: EMPTY_PARAMS,
    result: STATUS,
    run() { return preview().getStatus(); },
  });
}
