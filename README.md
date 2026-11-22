# VR Dev Platform

A WebXR workshop for building VR scenes and game assets without taking the headset off. Open it in a headset browser (Quest Browser and other WebXR browsers), or use the desktop controls in a normal browser.

**Pages:** https://atj1979.github.io/vr-dev-platform/

The app is three.js with its built-in WebXR support, built with Vite. The site base path is `/vr-dev-platform/`.

## Run it locally

```bash
npm install
npm run dev
```

Open `http://localhost:5173/vr-dev-platform/`. `localhost` is a secure context, so WebXR can start there. A headset on your LAN needs HTTPS; use the Pages URL for that.

```bash
npm test
npm run build
```

## Headset

1. Open the Pages URL in the headset browser.
2. Press **Enter VR**. The button asks for an `immersive-vr` session with `local-floor` and hand tracking as optional features.
3. Aim a controller ray, or a hand-tracking pinch ray, and pull the trigger to press a panel. Grip grabs a part. The thumbstick yaws and scales the selection while you are not pointing at the editor; on the editor it scrolls.
4. The virtual keyboard types into whichever field is focused: the scene module, the assistant draft, an API key, or the asset id.

Web Speech voice input appears on the AI panel when the browser provides `SpeechRecognition`. Quest Browser often does not. The keyboard still works.

## Desktop

- Left click presses panels, places the caret, and selects parts.
- Right-drag looks around. WASD walks while focus is on the room. Shift moves faster.
- Esc leaves the editor, the assistant draft, or a settings field.
- Ctrl+Enter runs the scene module. Ctrl+S saves the project in this browser.
- Delete removes the selected part. `[` and `]` yaw it. `-` and `=` scale it.
- Reset view puts the camera back at the desk. Import reads a `.vrproj.json` or a raw scene module.

## Scene modules

The editor holds one JavaScript module:

```js
export default function (THREE, scene, ctx) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x6ec8c0 })
  );
  mesh.position.y = 0.5;
  scene.add(mesh);
  return { update(dt, time) {} };
}
```

`scene` is a group that is cleared on every run. Use the `THREE` argument. Do not `import 'three'` from the module. `ctx.onFrame((dt, time) => {})` runs each frame. Return `{ update, dispose }` or a dispose function.

Run rebuilds that group without reloading the page. Auto reruns a moment after you stop typing. Errors stay on the editor footer. Projects are stored in IndexedDB, with a localStorage copy of the open project. Import and export use a `.vrproj.json` file (`format: "vr-dev-platform/project"`).

## Assets for the RTS

The build plate on the right is the asset tool. Its center is the model origin. The blue arrow is **+Z**, which is forward. Units are meters, Y is up, and one grid cell is one meter.

Spawn a box, sphere, cylinder, or cone. Move, rotate, and scale it with the gizmo, or grip it. Color it, or name the material `team_color` so the game can tint it. Group parts, add `muzzle`, `carry`, and `selection_ring` empties, and center the model on the origin.

**Union / Subtract / Intersect** run in Manifold (WebAssembly), loaded the first time you use them. **LOD** simplifies the selected mesh with meshoptimizer and names it `<id>_lodN`. **Grain** adds an original procedural texture; export encodes that image to KTX2. Parts without grain stay plain PBR factors, which need no texture.

**Export zip** downloads:

```text
public/assets/<category>/<id>/<id>.glb
public/assets/<category>/<id>/<id>.json
public/assets/manifest.json
```

Unzip it at the root of [vr-rts](https://github.com/atj1979/vr-rts) and merge the manifest entry into that repo's `public/assets/manifest.json` if one already exists. The glTF is 2.0, binary, Y-up, meters, facing +Z, with metallic-roughness materials. The sidecar records the id, footprint in grid cells, bounding radius, attachment positions, `_lodN` node names, clip names, and material names.

**Export meshopt** adds `EXT_meshopt_compression`. The game must then decode that extension. The default zip does not, so it loads in a stock glTF loader.

The animation row records node transform clips named `idle`, `walk`, `run`, `attack`, `death`, `build`, `gather`, or `work`. Loopable clips are exported so the last pose matches the first. These are transform clips on the part nodes, not skinned skeletons.

Every mesh in the app is generated here or built from those primitives. Nothing is downloaded, and nothing is meant to look like a particular commercial RTS.

## AI assistant

The panel above the desk chats with a model you choose. Keys and the base URL stay in `localStorage` and are sent only to that provider. The model cannot read the key. It calls the same commands the panels call. Destructive commands wait until you press Allow.

OpenAI-compatible endpoints cover OpenAI, Ollama (`http://localhost:11434/v1`), and LM Studio (`http://localhost:1234/v1`). Anthropic and Gemini have adapters too. Ollama must allow this origin (`OLLAMA_ORIGINS`).

An external agent can drive the page with `tools/list` and `tools/call` over `postMessage` or a WebSocket. See [docs/AI-INTEGRATION.md](docs/AI-INTEGRATION.md). The command list is [docs/API.md](docs/API.md), generated from the registry.

## GitHub Pages

Pushes to `main` run `.github/workflows/pages.yml`, which tests, builds, and deploys with `actions/deploy-pages`. The first time, the repository has to use GitHub Actions as the Pages source:

**Settings → Pages → Build and deployment → Source: GitHub Actions.**

The workflow cannot switch that setting by itself. After it is on, merging to `main` publishes `https://atj1979.github.io/vr-dev-platform/`.
