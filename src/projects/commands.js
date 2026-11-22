import { getAppContext } from '../app/context.js';
import { register } from '../commands/registry.js';
import { EMPTY_PARAMS } from '../editor/template.js';

const PROJECT = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'name'],
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    saved: { type: 'boolean' },
  },
};

export function registerProjectCommands() {
  const project = () => getAppContext().project;

  register({
    name: 'project.get',
    description: 'Read the open project id and name.',
    params: EMPTY_PARAMS,
    result: PROJECT,
    run() { return project().get(); },
  });

  register({
    name: 'project.save',
    description: 'Save the scene module and the build plate to local storage.',
    params: EMPTY_PARAMS,
    result: PROJECT,
    run() { return project().save(); },
  });

  register({
    name: 'project.new',
    description: 'Start a new project from the starter scene and the sample signal post.',
    destructive: true,
    params: {
      type: 'object',
      additionalProperties: false,
      properties: { name: { type: 'string' } },
    },
    result: PROJECT,
    run(params) { return project().create(params.name); },
  });

  register({
    name: 'project.rename',
    description: 'Rename the open project.',
    params: {
      type: 'object',
      additionalProperties: false,
      required: ['name'],
      properties: { name: { type: 'string', minLength: 1, maxLength: 64 } },
    },
    result: PROJECT,
    run(params) { return project().rename(params.name); },
  });

  register({
    name: 'project.list',
    description: 'List projects saved in this browser.',
    params: EMPTY_PARAMS,
    result: {
      type: 'object',
      additionalProperties: false,
      required: ['projects'],
      properties: {
        projects: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'name'],
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              updated: { type: 'number' },
            },
          },
        },
      },
    },
    run() { return project().list(); },
  });

  register({
    name: 'project.load',
    description: 'Load a saved project, replacing the editor and the build plate.',
    destructive: true,
    params: {
      type: 'object',
      additionalProperties: false,
      required: ['id'],
      properties: { id: { type: 'string', minLength: 1 } },
    },
    result: PROJECT,
    run(params) { return project().load(params.id); },
  });

  register({
    name: 'project.export',
    description: 'Download the open project as a .vrproj.json file.',
    params: EMPTY_PARAMS,
    result: {
      type: 'object',
      additionalProperties: false,
      required: ['filename', 'byteLength'],
      properties: {
        filename: { type: 'string' },
        byteLength: { type: 'integer' },
        downloaded: { type: 'boolean' },
      },
    },
    run() { return project().exportFile(); },
  });

  register({
    name: 'project.import',
    description: 'Import a .vrproj.json document or a raw scene module, replacing the open project.',
    destructive: true,
    params: {
      type: 'object',
      additionalProperties: false,
      required: ['text'],
      properties: { text: { type: 'string', minLength: 1 } },
    },
    result: PROJECT,
    run(params) { return project().importText(params.text); },
  });
}
