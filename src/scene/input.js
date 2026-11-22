import * as THREE from 'three';

export function createInput(renderer, camera, dom) {
  const mouse = {
    nx: 0,
    ny: 0,
    left: false,
    leftEdge: false,
    leftUp: false,
    right: false,
    dx: 0,
    dy: 0,
  };
  const keys = new Set();
  const raycasters = [new THREE.Raycaster(), new THREE.Raycaster(), new THREE.Raycaster()];
  const xrState = [0, 1].map(() => ({
    selecting: false,
    selectEdge: false,
    selectUp: false,
    squeezing: false,
    squeezeEdge: false,
    squeezeUp: false,
  }));
  const controllers = [0, 1].map((index) => {
    const controller = renderer.xr.getController(index);
    const state = xrState[index];
    controller.addEventListener('selectstart', () => { state.selecting = true; state.selectEdge = true; });
    controller.addEventListener('selectend', () => { state.selecting = false; state.selectUp = true; });
    controller.addEventListener('squeezestart', () => { state.squeezing = true; state.squeezeEdge = true; });
    controller.addEventListener('squeezeend', () => { state.squeezing = false; state.squeezeUp = true; });
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -1),
    ]);
    const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xffe1b0 }));
    line.scale.z = 2.2;
    line.name = 'ray';
    controller.add(line);
    return controller;
  });

  dom.addEventListener('pointermove', (event) => {
    const rect = dom.getBoundingClientRect();
    mouse.nx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.ny = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    if (mouse.right) {
      mouse.dx += event.movementX;
      mouse.dy += event.movementY;
    }
  });
  dom.addEventListener('pointerdown', (event) => {
    if (event.button === 0) {
      mouse.left = true;
      mouse.leftEdge = true;
    }
    if (event.button === 2) mouse.right = true;
  });
  dom.addEventListener('pointerup', (event) => {
    if (event.button === 0) {
      mouse.left = false;
      mouse.leftUp = true;
    }
    if (event.button === 2) mouse.right = false;
  });
  dom.addEventListener('contextmenu', (event) => event.preventDefault());
  window.addEventListener('keydown', (event) => keys.add(event.key));
  window.addEventListener('keyup', (event) => keys.delete(event.key));
  window.addEventListener('blur', () => keys.clear());

  function poll() {
    const session = renderer.xr.getSession();
    if (session) {
      const pointers = [];
      session.inputSources.forEach((source, index) => {
        if (index > 1) return;
        const controller = controllers[index];
        const state = xrState[index];
        const origin = new THREE.Vector3().setFromMatrixPosition(controller.matrixWorld);
        const direction = new THREE.Vector3(0, 0, -1).transformDirection(controller.matrixWorld);
        if (direction.lengthSq() < 1e-6) return;
        const raycaster = raycasters[index];
        raycaster.set(origin, direction);
        const gamepad = source.gamepad;
        const axes = gamepad?.axes?.length >= 4
          ? [gamepad.axes[2] || 0, gamepad.axes[3] || 0]
          : [gamepad?.axes?.[0] || 0, gamepad?.axes?.[1] || 0];
        pointers.push({
          id: index,
          xr: true,
          raycaster,
          controller,
          selectEdge: state.selectEdge,
          selectHeld: state.selecting,
          selectUp: state.selectUp,
          squeezeEdge: state.squeezeEdge,
          squeezeHeld: state.squeezing,
          squeezeUp: state.squeezeUp,
          axes,
        });
        state.selectEdge = false;
        state.selectUp = false;
        state.squeezeEdge = false;
        state.squeezeUp = false;
      });
      return pointers;
    }
    const raycaster = raycasters[2];
    raycaster.setFromCamera(new THREE.Vector2(mouse.nx, mouse.ny), camera);
    const pointer = {
      id: 'mouse',
      xr: false,
      raycaster,
      selectEdge: mouse.leftEdge,
      selectHeld: mouse.left,
      selectUp: mouse.leftUp,
      squeezeEdge: false,
      squeezeHeld: keys.has('Shift') && mouse.left,
      squeezeUp: false,
      axes: [0, 0],
      dx: mouse.dx,
      dy: mouse.dy,
    };
    mouse.leftEdge = false;
    mouse.leftUp = false;
    mouse.dx = 0;
    mouse.dy = 0;
    return [pointer];
  }

  return { poll, controllers, keys, mouse };
}
