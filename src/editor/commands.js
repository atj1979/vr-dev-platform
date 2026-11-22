import { getAppContext } from '../app/context.js';
import { register } from '../commands/registry.js';
import { EDITOR_STATE, EMPTY_PARAMS } from './template.js';

const KEYS = [
  'Backspace', 'Delete', 'Enter', 'Tab',
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
  'Home', 'End', 'Undo', 'Redo', 'SelectAll',
];

export function registerEditorCommands() {
  const editor = () => getAppContext().editor;

  register({
    name: 'editor.get',
    description: 'Read the scene module source and the caret position.',
    params: EMPTY_PARAMS,
    result: EDITOR_STATE,
    run() { return editor().snapshot(); },
  });

  register({
    name: 'editor.insert',
    description: 'Insert text at the caret, replacing any selection.',
    params: {
      type: 'object',
      additionalProperties: false,
      required: ['text'],
      properties: { text: { type: 'string', description: 'Text to insert. Newlines are allowed.' } },
    },
    result: EDITOR_STATE,
    run(params) { return editor().insert(params.text); },
  });

  register({
    name: 'editor.replace',
    description: 'Replace the entire scene module source.',
    destructive: true,
    params: {
      type: 'object',
      additionalProperties: false,
      required: ['text'],
      properties: { text: { type: 'string' } },
    },
    result: EDITOR_STATE,
    run(params) { return editor().replace(params.text); },
  });

  register({
    name: 'editor.input',
    description: 'Type one key into the scene module. A single character inserts that character. Named keys edit the caret.',
    params: {
      type: 'object',
      additionalProperties: false,
      required: ['key'],
      properties: {
        key: { type: 'string', minLength: 1, maxLength: 32, description: `One character, or one of ${KEYS.join(', ')}.` },
        extend: { type: 'boolean', description: 'Extend the selection when moving the caret.' },
      },
    },
    result: EDITOR_STATE,
    run(params) { return editor().input(params.key, params.extend); },
  });

  register({
    name: 'editor.moveCursor',
    description: 'Move the caret by a line and column delta.',
    params: {
      type: 'object',
      additionalProperties: false,
      properties: {
        lineDelta: { type: 'integer' },
        columnDelta: { type: 'integer' },
        extend: { type: 'boolean' },
      },
    },
    result: EDITOR_STATE,
    run(params) { return editor().move(params.lineDelta || 0, params.columnDelta || 0, params.extend); },
  });

  register({
    name: 'editor.setCursor',
    description: 'Place the caret on a line and column.',
    params: {
      type: 'object',
      additionalProperties: false,
      required: ['line', 'column'],
      properties: {
        line: { type: 'integer', minimum: 0 },
        column: { type: 'integer', minimum: 0 },
        extend: { type: 'boolean' },
      },
    },
    result: EDITOR_STATE,
    run(params) { return editor().setCursor(params.line, params.column, params.extend); },
  });

  register({
    name: 'editor.selectAll',
    description: 'Select the whole scene module.',
    params: EMPTY_PARAMS,
    result: EDITOR_STATE,
    run() { return editor().selectAll(); },
  });

  register({
    name: 'editor.undo',
    description: 'Undo the last edit.',
    params: EMPTY_PARAMS,
    result: EDITOR_STATE,
    run() { return editor().undo(); },
  });

  register({
    name: 'editor.redo',
    description: 'Redo an undone edit.',
    params: EMPTY_PARAMS,
    result: EDITOR_STATE,
    run() { return editor().redo(); },
  });

  register({
    name: 'editor.scroll',
    description: 'Scroll the editor by a number of lines.',
    params: {
      type: 'object',
      additionalProperties: false,
      required: ['delta'],
      properties: { delta: { type: 'integer' } },
    },
    result: EDITOR_STATE,
    run(params) { return editor().scroll(params.delta); },
  });
}
