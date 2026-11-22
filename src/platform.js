import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { setAppContext } from './app/context.js';
import { commandCatalog, createPreviewService, createProjectService, createSettingsService } from './app/services.js';
import { run } from './commands/registry.js';
import { createAiSession } from './ai/session.js';
import { createAiPanel } from './ai/view.js';
import { createEditor } from './editor/model.js';
import { createKeyboardPanel } from './editor/keyboardView.js';
import { STARTER_CODE } from './editor/template.js';
import { createEditorPanel } from './editor/view.js';
import { exportWorkshop } from './export/exportAsset.js';
import { installPostMessageBridge } from './mcp/bridge.js';
import { readLocalSnapshot } from './projects/store.js';
import { createInput } from './scene/input.js';
import { createPlate, createRoom } from './scene/room.js';
import { createGizmo } from './workshop/gizmo.js';
import { createWorkshop } from './workshop/model.js';
import { createWorkshopPanel } from './workshop/view.js';

export async function startPlatform(root) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local-floor');
  renderer.setClearColor(0x14181b, 1);
  root.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 40);
  camera.position.set(0.04, 1.58, 1.22);
  let yaw = 0;
  let pitch = -0.12;

  scene.add(createRoom());
  const previewAnchor = new THREE.Group();
  previewAnchor.position.set(-0.2, 0, -1.35);
  previewAnchor.add(createPlate(0x243430, false));
  const previewGroup = new THREE.Group();
  previewAnchor.add(previewGroup);
  scene.add(previewAnchor);

  const buildAnchor = new THREE.Group();
  buildAnchor.position.set(0.42, 0, -1.15);
  buildAnchor.add(createPlate(0x3a332c, true));
  scene.add(buildAnchor);

  const workshop = createWorkshop();
  buildAnchor.add(workshop.root);
  const gizmo = createGizmo();
  scene.add(gizmo.group);
  const selectionHelper = new THREE.BoxHelper(workshop.root, 0xe0a15a);
  selectionHelper.visible = false;
  scene.add(selectionHelper);

  const editor = createEditor(STARTER_CODE);
  const editorPanel = createEditorPanel();
  const keyboard = createKeyboardPanel();
  const workshopPanel = createWorkshopPanel();
  const aiPanel = createAiPanel();
  const ai = createAiSession();
  place(editorPanel.panel.mesh, -0.58, 1.38, 0.08, 0, 0.16);
  place(keyboard.panel.mesh, -0.58, 0.72, 0.55, 0.68, 0.16);
  place(workshopPanel.panel.mesh, 0.9, 1.18, 0.02, 0, -0.46);
  place(aiPanel.panel.mesh, 0.05, 1.78, -0.35, -0.42, 0);
  scene.add(editorPanel.panel.mesh, keyboard.panel.mesh, workshopPanel.panel.mesh, aiPanel.panel.mesh);

  const input = createInput(renderer, camera, renderer.domElement);
  for (const controller of input.controllers) scene.add(controller);

  const preview = createPreviewService(previewGroup, () => editor.snapshot().text);
  const project = createProjectService({ editor, workshop, preview });
  const settings = createSettingsService();
  const saved = readLocalSnapshot();
  if (saved?.code) project.adopt(saved);
  else workshop.addStarter();

  let footer = 'Aim and trigger. Right-drag looks. WASD walks when the editor is unfocused.';
  let focus = 'walk';
  let field = null;
  let fieldDraft = '';
  let projectsOpen = false;
  let editorDirty = true;
  let hold = null;
  const gestures = new Map();

  const sink = document.getElementById('editor-sink');
  const fileInput = document.getElementById('file-input');

  setAppContext({
    editor,
    preview,
    project,
    workshop,
    exporter: { exportAsset: (options) => exportWorkshop(workshop, options) },
    ai,
    settings,
    help: { commands: commandCatalog },
  });

  function refreshEditor() {
    editorPanel.draw(editor, { error: preview.getStatus().error, message: footer }, preview.isAuto());
    editorDirty = false;
  }
  function refreshWorkshop() { workshopPanel.draw(workshop); }
  function refreshAi() { aiPanel.draw(ai, settings); }

  editor.setListener(() => {
    editorDirty = true;
    if (!preview.isAuto()) return;
    window.clearTimeout(refreshEditor.timer);
    refreshEditor.timer = window.setTimeout(() => { run('preview.run'); }, 500);
  });

  function setFocus(next, nextField = null) {
    focus = next;
    field = nextField;
    if (next === 'walk') sink?.blur();
    else sink?.focus();
  }

  function routeText(text) {
    if (focus === 'editor') run('editor.input', { key: text.length === 1 ? text : text });
    if (text.length > 1 && focus === 'editor') run('editor.insert', { text });
    if (focus === 'ai') ai.appendDraft(text);
    if (focus === 'field') fieldDraft += text;
    editorDirty = true;
  }

  function routeKey(key) {
    if (focus === 'editor') run('editor.input', { key });
    else if (focus === 'ai') {
      if (key === 'Backspace') ai.backspaceDraft();
      if (key === 'Enter' && ai.view().draft.trim()) run('ai.send', { text: ai.view().draft });
    } else if (focus === 'field') {
      if (key === 'Backspace') fieldDraft = fieldDraft.slice(0, -1);
      if (key === 'Enter') commitField();
    }
    editorDirty = true;
  }

  function commitField() {
    if (field === 'modelId') run('workshop.setModelId', { id: fieldDraft || 'asset' });
    else if (field === 'apiKey') settings.set({ apiKey: fieldDraft });
    else if (field) settings.set({ [field]: fieldDraft });
    fieldDraft = '';
    setFocus('walk');
    footer = 'Saved that field on this device.';
  }

  function pressRegion(region) {
    if (!region) return;
    if (region.command === 'editor.projects' || region.command === 'focus' && region.params?.field == null && region.id === 'editor.projects') {
      projectsOpen = !projectsOpen;
      if (projectsOpen) project.list().then((result) => editorPanel.setProjects(true, result.projects));
      else editorPanel.setProjects(false, []);
      editorDirty = true;
      return;
    }
    if (region.kind === 'page') {
      aiPanel.setPage(region.params.page);
      refreshAi();
      return;
    }
    if (region.kind === 'field' || region.command === 'focus') {
      field = region.field || region.params?.field;
      fieldDraft = field === 'modelId' ? workshop.state.modelId : '';
      setFocus('field', field);
      footer = `Typing into ${field}. Enter commits.`;
      return;
    }
    if (region.command === 'ai.voice') {
      toggleVoice();
      return;
    }
    if (region.command === 'ai.send') {
      const text = ai.view().draft.trim();
      if (text) run('ai.send', { text });
      return;
    }
    if (region.command) run(region.command, region.params || {});
  }

  function toggleVoice() {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) {
      footer = 'This browser has no Web Speech API. Type instead.';
      editorDirty = true;
      return;
    }
    const recognition = new Ctor();
    recognition.lang = 'en-US';
    recognition.onresult = (event) => {
      const text = event.results[0][0].transcript;
      ai.setDraft(text);
      refreshAi();
    };
    recognition.start();
    footer = 'Listening…';
  }

  sink?.addEventListener('keydown', (event) => {
    if (focus === 'walk') return;
    const named = ['Backspace', 'Delete', 'Enter', 'Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      run('editor.selectAll');
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      run(event.shiftKey ? 'editor.redo' : 'editor.undo');
      return;
    }
    if (named.includes(event.key)) {
      event.preventDefault();
      routeKey(event.key);
    }
  });
  sink?.addEventListener('input', () => {
    const value = sink.value;
    sink.value = '';
    if (!value || focus === 'walk') return;
    if (focus === 'editor') run('editor.insert', { text: value });
    else routeText(value);
  });
  window.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      run('preview.run');
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      run('project.save');
    }
    if (event.key === 'Escape') setFocus('walk');
    if (focus !== 'walk') return;
    if (event.key === 'Delete' || event.key === 'Backspace') run('workshop.delete');
    if (event.key === '[') run('workshop.rotate', { y: 0.15 });
    if (event.key === ']') run('workshop.rotate', { y: -0.15 });
    if (event.key === '-') run('workshop.scale', { uniform: 0.9 });
    if (event.key === '=') run('workshop.scale', { uniform: 1.1 });
  });

  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    const text = await file.text();
    run('project.import', { text });
  });
  document.getElementById('import-btn')?.addEventListener('click', () => fileInput?.click());
  document.getElementById('home-btn')?.addEventListener('click', () => {
    camera.position.set(0.04, 1.58, 1.22);
    yaw = 0;
    pitch = -0.12;
  });

  const pickables = () => [
    editorPanel.panel.mesh,
    keyboard.panel.mesh,
    workshopPanel.panel.mesh,
    aiPanel.panel.mesh,
    gizmo.group,
    workshop.root,
  ];

  function classify(hit) {
    let node = hit.object;
    while (node) {
      if (node.userData?.kind === 'ui') return { type: 'ui', panel: node.userData.panel, hit };
      if (node.userData?.kind === 'gizmo') return { type: 'gizmo', handle: node, hit };
      if (node.userData?.helper) {
        node = node.parent;
        continue;
      }
      if (node.userData?.uid) return { type: 'part', object: node, hit };
      node = node.parent;
    }
    return null;
  }

  function firstHit(pointer) {
    const hits = pointer.raycaster.intersectObjects(pickables(), true);
    for (const hit of hits) {
      const found = classify(hit);
      if (found) return found;
    }
    return null;
  }

  function keyboardAction(region) {
    if (!region?.action) return;
    if (region.action.type === 'toggle') {
      keyboard.toggle(region.action.toggle);
      return;
    }
    if (focus === 'walk') setFocus('editor');
    if (region.action.type === 'text') routeText(region.action.text);
    if (region.action.type === 'key') routeKey(region.action.key);
    if (focus === 'editor' || focus === 'ai') keyboard.consumeShift();
    refreshAi();
    refreshWorkshop();
  }

  function onSelectDown(pointer, found) {
    if (!found) {
      run('workshop.clearSelection');
      setFocus('walk');
      gestures.set(pointer.id, { type: 'none' });
      return;
    }
    if (found.type === 'gizmo' && gizmo.begin(found.handle, pointer.raycaster, workshop.primary)) {
      gestures.set(pointer.id, { type: 'gizmo' });
      return;
    }
    if (found.type === 'ui') {
      const px = found.panel.uvToPx(found.hit.uv);
      if (found.panel === editorPanel.panel) {
        const target = editorPanel.pointer(px.x, px.y, 'down', editor);
        if (target?.caret) {
          run('editor.setCursor', { line: target.caret.line, column: target.caret.col, extend: input.keys.has('Shift') });
          setFocus('editor');
          gestures.set(pointer.id, { type: 'text' });
          return;
        }
        if (target?.command) {
          gestures.set(pointer.id, { type: 'button', region: target, panel: found.panel });
          return;
        }
      }
      const region = found.panel.hit(px.x, px.y);
      gestures.set(pointer.id, { type: 'button', region, panel: found.panel });
      if (found.panel === keyboard.panel) keyboardAction(region);
      else if (found.panel === aiPanel.panel && region?.kind !== 'field' && region?.command !== 'focus') setFocus('ai');
      return;
    }
    if (found.type === 'part') {
      run('workshop.select', { uid: found.object.userData.uid, additive: input.keys.has('Shift') });
      setFocus('walk');
      gestures.set(pointer.id, { type: 'part', object: found.object, moved: false });
    }
  }

  function onSelectMove(pointer) {
    const gesture = gestures.get(pointer.id);
    if (!gesture) return;
    if (gesture.type === 'gizmo') {
      const transform = gizmo.update(pointer.raycaster);
      if (transform) run('workshop.setLocalTransform', transform);
    }
    if (gesture.type === 'text') {
      const found = firstHit(pointer);
      if (found?.panel !== editorPanel.panel) return;
      const px = found.panel.uvToPx(found.hit.uv);
      const target = editorPanel.pointer(px.x, px.y, 'move', editor);
      if (target?.caret) {
        run('editor.setCursor', { line: target.caret.line, column: target.caret.col, extend: true });
      }
    }
  }

  function onSelectUp(pointer) {
    const gesture = gestures.get(pointer.id);
    gestures.delete(pointer.id);
    gizmo.end();
    if (gesture?.type !== 'button' || !gesture.region) return;
    const found = firstHit(pointer);
    if (found?.type !== 'ui' || found.panel !== gesture.panel) return;
    const px = found.panel.uvToPx(found.hit.uv);
    const region = found.panel.hit(px.x, px.y);
    if (region && region.id === gesture.region.id) pressRegion(region);
  }

  function grabUpdate(pointer, gesture) {
    const controller = pointer.controller;
    if (!controller) return;
    const object = gesture.object;
    const parent = object.parent;
    const controlPosition = new THREE.Vector3().setFromMatrixPosition(controller.matrixWorld);
    const controlQuat = new THREE.Quaternion().setFromRotationMatrix(controller.matrixWorld);
    const world = gesture.posOffset.clone().applyQuaternion(controlQuat).add(controlPosition);
    const worldQuat = controlQuat.multiply(gesture.quatOffset);
    parent.updateWorldMatrix(true, false);
    object.position.copy(parent.worldToLocal(world));
    const parentQuat = parent.getWorldQuaternion(new THREE.Quaternion());
    object.quaternion.copy(parentQuat.invert().multiply(worldQuat));
    run('workshop.setLocalTransform', {
      uid: object.userData.uid,
      position: object.position.toArray(),
      quaternion: object.quaternion.toArray(),
      scale: object.scale.toArray(),
    });
  }

  installPostMessageBridge();
  const vrButton = VRButton.createButton(renderer, { optionalFeatures: ['hand-tracking', 'local-floor'] });
  document.body.appendChild(vrButton);
  const hud = document.getElementById('hud');
  renderer.xr.addEventListener('sessionstart', () => { if (hud) hud.hidden = true; });
  renderer.xr.addEventListener('sessionend', () => { if (hud) hud.hidden = false; });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  keyboard.draw();
  refreshEditor();
  refreshWorkshop();
  refreshAi();
  run('preview.run');

  const timer = new THREE.Timer();
  let stickScroll = 0;
  let lastPreviewError = '';
  renderer.setAnimationLoop(() => {
    timer.update();
    const dt = Math.min(0.05, timer.getDelta());
    const presenting = renderer.xr.isPresenting;
    const pointers = input.poll();
    if (!presenting && focus === 'walk') {
      const look = pointers[0];
      if (look?.dx) {
        yaw -= look.dx * 0.003;
        pitch = Math.max(-1.2, Math.min(1.2, pitch - (look.dy || 0) * 0.003));
      }
      const speed = input.keys.has('Shift') ? 3.4 : 1.8;
      const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      if (input.keys.has('w') || input.keys.has('W')) camera.position.addScaledVector(forward, speed * dt);
      if (input.keys.has('s') || input.keys.has('S')) camera.position.addScaledVector(forward, -speed * dt);
      if (input.keys.has('d') || input.keys.has('D')) camera.position.addScaledVector(right, speed * dt);
      if (input.keys.has('a') || input.keys.has('A')) camera.position.addScaledVector(right, -speed * dt);
      camera.position.y = 1.58;
      camera.rotation.order = 'YXZ';
      camera.rotation.y = yaw;
      camera.rotation.x = pitch;
    }

    for (const pointer of pointers) {
      const found = firstHit(pointer);
      const hoverId = found?.type === 'ui' ? found.panel.hit(found.panel.uvToPx(found.hit.uv).x, found.panel.uvToPx(found.hit.uv).y)?.id : null;
      if (found?.panel === keyboard.panel) keyboard.setHover(hoverId);
      if (found?.type === 'ui' && Math.abs(pointer.axes[1] || 0) > 0.35 && found.panel === editorPanel.panel) {
        stickScroll += -pointer.axes[1] * dt * 6;
        if (Math.abs(stickScroll) > 1) {
          run('editor.scroll', { delta: Math.trunc(stickScroll) });
          stickScroll = 0;
          editorDirty = true;
        }
      }
      if (pointer.xr && workshop.primary && Math.abs(pointer.axes[0] || 0) > 0.45 && found?.type !== 'ui') {
        run('workshop.rotate', { y: -pointer.axes[0] * dt * 1.6 });
      }
      if (pointer.xr && workshop.primary && Math.abs(pointer.axes[1] || 0) > 0.45 && found?.type !== 'ui') {
        const factor = 1 + (-pointer.axes[1]) * dt * 0.8;
        run('workshop.scale', { uniform: Math.max(0.2, factor) });
      }
      if (pointer.selectEdge) onSelectDown(pointer, found);
      else if (pointer.selectHeld) onSelectMove(pointer);
      if (pointer.selectUp) onSelectUp(pointer);
      if (pointer.squeezeEdge && found?.type === 'part' && pointer.controller) {
        const object = found.object;
        const objPos = object.getWorldPosition(new THREE.Vector3());
        const objQuat = object.getWorldQuaternion(new THREE.Quaternion());
        const controlPosition = new THREE.Vector3().setFromMatrixPosition(pointer.controller.matrixWorld);
        const controlQuat = new THREE.Quaternion().setFromRotationMatrix(pointer.controller.matrixWorld);
        gestures.set(`grab-${pointer.id}`, {
          object,
          posOffset: objPos.sub(controlPosition).applyQuaternion(controlQuat.clone().invert()),
          quatOffset: controlQuat.clone().invert().multiply(objQuat),
        });
      }
      const grab = gestures.get(`grab-${pointer.id}`);
      if (grab && pointer.squeezeHeld) grabUpdate(pointer, grab);
      if (pointer.squeezeUp) gestures.delete(`grab-${pointer.id}`);

      if (pointer.selectHeld && gestures.get(pointer.id)?.type === 'button' && found?.panel === keyboard.panel) {
        const region = found.panel.hit(found.panel.uvToPx(found.hit.uv).x, found.panel.uvToPx(found.hit.uv).y);
        const now = performance.now();
        if (!hold || hold.id !== region?.id) hold = { id: region?.id, at: now, next: now + 420 };
        else if (region && now > hold.next) {
          keyboardAction(region);
          hold.next = now + 90;
        }
      }
    }

    workshop.update(dt);
    preview.update(dt, timer.getElapsed());
    gizmo.setMode(workshop.state.mode);
    gizmo.follow(workshop.primary);
    if (workshop.primary) {
      selectionHelper.visible = true;
      selectionHelper.setFromObject(workshop.primary);
    } else selectionHelper.visible = false;

    const previewError = preview.getStatus().error;
    if (previewError !== lastPreviewError) {
      lastPreviewError = previewError;
      editorDirty = true;
    }
    if (editorDirty) refreshEditor();
    if (workshopPanel.drawn !== workshop.revision) {
      refreshWorkshop();
      workshopPanel.drawn = workshop.revision;
    }
    if (aiPanel.drawn !== ai.revision) {
      refreshAi();
      aiPanel.drawn = ai.revision;
    }
    renderer.render(scene, camera);
  });

  window.__vrdev = {
    dispatch: run,
    getCode: () => editor.snapshot().text,
    workshop,
  };
}

function place(mesh, x, y, z, rotX, rotY) {
  mesh.position.set(x, y, z);
  mesh.rotation.x = rotX;
  mesh.rotation.y = rotY;
}
