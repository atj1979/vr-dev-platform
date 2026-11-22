import { getAppContext } from '../app/context.js';
import { register } from '../commands/registry.js';
import { measureModel } from '../core/measure.js';
import { EMPTY_PARAMS } from '../editor/template.js';

export function registerExportCommands() {
  register({
    name: 'export.measure',
    description: 'Measure the build plate: footprint in 1 m cells, bounding radius, attachments, and material names.',
    params: EMPTY_PARAMS,
    result: {
      type: 'object',
      additionalProperties: true,
      required: ['footprint', 'boundingRadius'],
      properties: {
        footprint: { type: 'object' },
        boundingRadius: { type: 'number' },
      },
    },
    run() {
      const workshop = getAppContext().workshop;
      return measureModel(workshop.root);
    },
  });

  register({
    name: 'export.asset',
    description: 'Export the build plate as a glTF .glb zip with a sidecar JSON and a manifest entry for the RTS game. meshopt wraps buffers in EXT_meshopt_compression.',
    params: {
      type: 'object',
      additionalProperties: false,
      properties: {
        meshopt: { type: 'boolean', description: 'Compress buffer views with EXT_meshopt_compression. The game then needs a meshopt decoder.' },
      },
    },
    result: {
      type: 'object',
      additionalProperties: true,
      required: ['id', 'filename', 'byteLength', 'sidecar', 'manifest'],
      properties: {
        id: { type: 'string' },
        filename: { type: 'string' },
        byteLength: { type: 'integer' },
        downloaded: { type: 'boolean' },
        sidecar: { type: 'object' },
        manifest: { type: 'object' },
      },
    },
    run(params) { return getAppContext().exporter.exportAsset({ meshopt: Boolean(params.meshopt) }); },
  });
}
