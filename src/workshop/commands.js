import { getAppContext } from '../app/context.js';
import { register } from '../commands/registry.js';
import { ATTACHMENT_NAMES, CATEGORIES, CLIP_NAMES } from '../core/assetSpec.js';
import { EMPTY_PARAMS } from '../editor/template.js';

const PARTS = {
  type: 'object',
  additionalProperties: true,
  required: ['modelId', 'parts'],
  properties: {
    modelId: { type: 'string' },
    category: { type: 'string' },
    mode: { type: 'string' },
    status: { type: 'string' },
    parts: { type: 'array' },
  },
};

const TRANSFORM = {
  type: 'object',
  additionalProperties: false,
  required: ['uid', 'position', 'quaternion', 'scale'],
  properties: {
    uid: { type: 'string' },
    position: { type: 'array', items: { type: 'number' } },
    quaternion: { type: 'array', items: { type: 'number' } },
    scale: { type: 'array', items: { type: 'number' } },
  },
};

const CLIP = {
  type: 'object',
  additionalProperties: false,
  required: ['clip', 'time', 'keyCount'],
  properties: {
    clip: { type: 'string' },
    time: { type: 'number' },
    duration: { type: 'number' },
    loop: { type: 'boolean' },
    playing: { type: 'boolean' },
    keyCount: { type: 'integer' },
  },
};

export function registerWorkshopCommands() {
  const shop = () => getAppContext().workshop;

  register({
    name: 'workshop.spawn',
    description: 'Add a box, sphere, cylinder, or cone to the build plate, sitting on the ground.',
    params: {
      type: 'object',
      additionalProperties: false,
      required: ['type'],
      properties: { type: { type: 'string', enum: ['box', 'sphere', 'cylinder', 'cone'] } },
    },
    result: PARTS,
    run(params) { return shop().spawn(params.type); },
  });

  register({
    name: 'workshop.select',
    description: 'Select a part by uid. Pass additive to toggle it in a multi-selection.',
    params: {
      type: 'object',
      additionalProperties: false,
      properties: {
        uid: { type: 'string' },
        additive: { type: 'boolean' },
      },
    },
    result: PARTS,
    run(params) { return shop().select(params.uid || '', Boolean(params.additive)); },
  });

  register({
    name: 'workshop.clearSelection',
    description: 'Clear the part selection.',
    params: EMPTY_PARAMS,
    result: PARTS,
    run() { return shop().select('', false); },
  });

  register({
    name: 'workshop.delete',
    description: 'Delete the selected parts.',
    destructive: true,
    params: EMPTY_PARAMS,
    result: PARTS,
    run() { return shop().deleteSelection(); },
  });

  register({
    name: 'workshop.duplicate',
    description: 'Duplicate the primary selection.',
    params: EMPTY_PARAMS,
    result: PARTS,
    run() { return shop().duplicate(); },
  });

  register({
    name: 'workshop.group',
    description: 'Parent the selected top-level parts under a new group.',
    params: EMPTY_PARAMS,
    result: PARTS,
    run() { return shop().group(); },
  });

  register({
    name: 'workshop.ungroup',
    description: 'Move the selected group children back onto the build plate.',
    params: EMPTY_PARAMS,
    result: PARTS,
    run() { return shop().ungroup(); },
  });

  register({
    name: 'workshop.selectParent',
    description: 'Select the group that contains the primary part.',
    params: EMPTY_PARAMS,
    result: PARTS,
    run() { return shop().selectParent(); },
  });

  register({
    name: 'workshop.setColor',
    description: 'Color the selected mesh. teamColor names the material team_color so the game can tint it.',
    params: {
      type: 'object',
      additionalProperties: false,
      required: ['color'],
      properties: {
        color: { type: 'string', minLength: 4, maxLength: 16 },
        teamColor: { type: 'boolean' },
      },
    },
    result: PARTS,
    run(params) { return shop().setColor(params.color, Boolean(params.teamColor)); },
  });

  register({
    name: 'workshop.setGrain',
    description: 'Toggle an original procedural grain texture on the selected mesh. Export encodes it as KTX2.',
    params: {
      type: 'object',
      additionalProperties: false,
      required: ['enabled'],
      properties: { enabled: { type: 'boolean' } },
    },
    result: PARTS,
    run(params) { return shop().setGrain(params.enabled); },
  });

  register({
    name: 'workshop.setMode',
    description: 'Choose the gizmo: move, rotate, or scale.',
    params: {
      type: 'object',
      additionalProperties: false,
      required: ['mode'],
      properties: { mode: { type: 'string', enum: ['move', 'rotate', 'scale'] } },
    },
    result: PARTS,
    run(params) { return shop().setMode(params.mode); },
  });

  register({
    name: 'workshop.setLocalTransform',
    description: 'Set the local position, quaternion, or scale of a part. Omitted channels stay as they are.',
    params: {
      type: 'object',
      additionalProperties: false,
      properties: {
        uid: { type: 'string' },
        position: { type: 'array', items: { type: 'number' } },
        quaternion: { type: 'array', items: { type: 'number' } },
        scale: { type: 'array', items: { type: 'number' } },
      },
    },
    result: TRANSFORM,
    run(params) {
      return shop().setLocalTransform(params.uid, {
        position: params.position,
        quaternion: params.quaternion,
        scale: params.scale,
      });
    },
  });

  register({
    name: 'workshop.translate',
    description: 'Move the primary selection by a local offset in meters.',
    params: {
      type: 'object',
      additionalProperties: false,
      properties: {
        x: { type: 'number' },
        y: { type: 'number' },
        z: { type: 'number' },
      },
    },
    result: TRANSFORM,
    run(params) { return shop().translate(params); },
  });

  register({
    name: 'workshop.rotate',
    description: 'Rotate the primary selection around world axes, in radians.',
    params: {
      type: 'object',
      additionalProperties: false,
      properties: {
        x: { type: 'number' },
        y: { type: 'number' },
        z: { type: 'number' },
      },
    },
    result: TRANSFORM,
    run(params) { return shop().rotate(params); },
  });

  register({
    name: 'workshop.scale',
    description: 'Multiply the primary selection scale. Pass uniform, or x, y, and z.',
    params: {
      type: 'object',
      additionalProperties: false,
      properties: {
        uniform: { type: 'number', minimum: 0.01 },
        x: { type: 'number', minimum: 0.01 },
        y: { type: 'number', minimum: 0.01 },
        z: { type: 'number', minimum: 0.01 },
      },
    },
    result: TRANSFORM,
    run(params) { return shop().scaleBy(params); },
  });

  register({
    name: 'workshop.addAttachment',
    description: 'Add a muzzle, carry, or selection_ring empty. Extras are stripped to empty nodes on export.',
    params: {
      type: 'object',
      additionalProperties: false,
      required: ['name'],
      properties: { name: { type: 'string', enum: [...ATTACHMENT_NAMES] } },
    },
    result: PARTS,
    run(params) { return shop().addAttachment(params.name); },
  });

  register({
    name: 'workshop.markLod',
    description: 'Simplify the selected mesh with meshoptimizer and add it as an id_lodN sibling.',
    params: EMPTY_PARAMS,
    result: PARTS,
    run() { return shop().markLod(); },
  });

  register({
    name: 'workshop.center',
    description: 'Move the build so its bottom sits on y=0 and its footprint is centered on the origin.',
    params: EMPTY_PARAMS,
    result: PARTS,
    run() { return shop().center(); },
  });

  register({
    name: 'workshop.boolean',
    description: 'Weld the selected solids with a Manifold boolean: union, subtract, or intersect.',
    destructive: true,
    params: {
      type: 'object',
      additionalProperties: false,
      required: ['op'],
      properties: { op: { type: 'string', enum: ['union', 'subtract', 'intersect'] } },
    },
    result: PARTS,
    run(params) { return shop().booleanOp(params.op); },
  });

  register({
    name: 'workshop.setModelId',
    description: 'Set the exported asset id. Letters, digits, and underscores only.',
    params: {
      type: 'object',
      additionalProperties: false,
      required: ['id'],
      properties: { id: { type: 'string', minLength: 1, maxLength: 48 } },
    },
    result: {
      type: 'object',
      additionalProperties: false,
      required: ['modelId'],
      properties: { modelId: { type: 'string' } },
    },
    run(params) { return shop().setModelId(params.id); },
  });

  register({
    name: 'workshop.setCategory',
    description: 'Set the asset category used in the export path.',
    params: {
      type: 'object',
      additionalProperties: false,
      required: ['category'],
      properties: { category: { type: 'string', enum: [...CATEGORIES] } },
    },
    result: {
      type: 'object',
      additionalProperties: false,
      required: ['category'],
      properties: { category: { type: 'string' } },
    },
    run(params) { return shop().setCategory(params.category); },
  });

  register({
    name: 'workshop.list',
    description: 'List parts on the build plate, including selection and material names.',
    params: EMPTY_PARAMS,
    result: PARTS,
    run() { return shop().listParts(); },
  });

  register({
    name: 'workshop.clear',
    description: 'Remove every part from the build plate.',
    destructive: true,
    params: EMPTY_PARAMS,
    result: PARTS,
    run() { return shop().clear(); },
  });

  register({
    name: 'animation.setClip',
    description: 'Choose the clip being keyed. Names match the game: idle, walk, run, attack, death, build, gather, work.',
    params: {
      type: 'object',
      additionalProperties: false,
      required: ['name'],
      properties: { name: { type: 'string', enum: [...CLIP_NAMES] } },
    },
    result: CLIP,
    run(params) { return shop().setClip(params.name); },
  });

  register({
    name: 'animation.setKey',
    description: 'Store the current pose of every part as a key on the active clip.',
    params: {
      type: 'object',
      additionalProperties: false,
      properties: { time: { type: 'number', minimum: 0 } },
    },
    result: CLIP,
    run(params) { return shop().setKey(params.time); },
  });

  register({
    name: 'animation.play',
    description: 'Play the active clip on the build plate.',
    params: EMPTY_PARAMS,
    result: CLIP,
    run() { return shop().play(); },
  });

  register({
    name: 'animation.stop',
    description: 'Stop clip playback.',
    params: EMPTY_PARAMS,
    result: CLIP,
    run() { return shop().stop(); },
  });

  register({
    name: 'animation.setLoop',
    description: 'Mark the active clip loopable. Loopable clips export with the end pose matching the start.',
    params: {
      type: 'object',
      additionalProperties: false,
      required: ['loop'],
      properties: { loop: { type: 'boolean' } },
    },
    result: CLIP,
    run(params) { return shop().setLoop(params.loop); },
  });

  register({
    name: 'animation.setTime',
    description: 'Move the clip playhead, in seconds.',
    params: {
      type: 'object',
      additionalProperties: false,
      required: ['time'],
      properties: { time: { type: 'number', minimum: 0 } },
    },
    result: CLIP,
    run(params) { return shop().setTime(params.time); },
  });

  register({
    name: 'animation.setDuration',
    description: 'Set the active clip duration in seconds.',
    params: {
      type: 'object',
      additionalProperties: false,
      required: ['duration'],
      properties: { duration: { type: 'number', minimum: 0.1 } },
    },
    result: CLIP,
    run(params) { return shop().setDuration(params.duration); },
  });
}
