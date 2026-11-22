# Architecture

VR Dev Platform is one Vite page. three.js renders a workshop room, WebXR supplies the headset session, and a command registry is the only way to change a project. The panels, the in-app assistant, and an external agent all call that registry.

## Boot

`src/main.js` installs the commands, then `startPlatform` creates the renderer, room, preview group, and build plate. `VRButton` from `three/addons/webxr/VRButton.js` requests an immersive session. Optional features are `local-floor` and `hand-tracking`. The reference space is `local-floor`, so the floor in the room is the floor in the headset.

Desktop mode keeps the same camera. Right-drag changes yaw and pitch. WASD moves on the horizontal plane while focus is `walk`. Focus moves to the editor, the assistant, or a settings field when you aim at them. Esc returns to `walk`, which is what keeps WASD from typing into the module.

Controller target rays and hand pinch rays are the same three.js target-ray objects. Grip is the squeeze button. There is no downloaded controller model. The ray is a line, drawn in the scene.

## Command layer

`src/commands/registry.js` holds every operation. A command has a name, a description, a JSON Schema for its params, a JSON Schema for its result, a `destructive` flag, an `aiVisible` flag, and a `run` function. `dispatch(name, params, { source, confirmed })` validates the params with the small schema checker in `src/commands/validate.js` (objects, arrays, enums, required fields, numeric bounds). It does not pull in a schema library.

Sources:

| Source | Confirmation |
| --- | --- |
| `ui` | The click is the confirmation. |
| `ai` | Destructive commands return `confirmation_required` until the panel allows them. |
| `mcp` | Same as `ai`, unless the caller passes `confirmed: true`. |

`docs/API.md` is produced by `npm run docs:api` from this registry. `test/docs.test.js` fails if a command is missing from that file.

Handlers live next to the feature they change (`src/editor/commands.js`, `src/workshop/commands.js`, and the preview, project, export, and AI command modules). They call the app context set in `src/app/context.js`. The context is filled when the platform boots, so the registry can be imported in Node to generate docs without starting WebGL.

## Editor and preview

The scene module is a text buffer (`src/core/buffer.js`) with a caret, a selection, undo, and scrolling. The in-world panel is a canvas texture (`src/editor/view.js`). The highlighter (`src/core/highlight.js`) is a single-pass scanner. It stays in JavaScript on purpose: a module is a few dozen lines, and a WASM tokenizer would cost more to load than it would save. A WASM tokenizer is not planned unless modules get large enough that scanning them shows up in a frame.

The virtual keyboard is another canvas. Hit targets are about five centimeters wide. Keys call `editor.input`, `ai` draft edits, or `settings.set`, depending on focus.

`preview.run` builds a blob URL and `import()`s it. The default export is called as `fn(THREE, group, ctx)`. The group is emptied first. Returned `update` / `dispose` hooks, and `ctx.onFrame`, run inside the frame loop and are detached after the first throw. This is a scene-graph sandbox in the page's own realm, not a separate origin. The user's code can still reach `globalThis`. That is acceptable because the code is their own, in their browser. It is not a security boundary.

Hot reload debounces edits by half a second when Auto is on.

Projects are `{ id, name, code, workshop }` documents. IndexedDB is the store. `localStorage` keeps the open project so a reload can restore it if IndexedDB is slow. `.vrproj.json` is the file form (`format: "vr-dev-platform/project"`).

## Workshop

`src/workshop/model.js` owns the build-plate graph. Primitives are `MeshStandardMaterial` meshes (metallic-roughness). Selection, grouping, attachments, and clips are plain scene state. The gizmo (`src/workshop/gizmo.js`) maps a ray to a world axis and writes back through `workshop.setLocalTransform`, which is the same command a model calls.

Attachment markers are helper meshes parented to empty `Object3D`s named `muzzle`, `carry`, or `selection_ring`. Export strips the helpers and leaves the empties. The sidecar stores those empties in the exported model's local space.

Clip data is `{ t, nodes: { uid: { p, q, s } } }`. Playback builds a `THREE.AnimationClip` of position, quaternion, and scale tracks. Export runs the same data through `finalizeClipKeys`. Loopable names (`idle`, `walk`, `run`, `build`, `gather`, `work`) get a final key that copies the first pose. `attack` and `death` do not, unless the user turns looping on, and even then only the loopable set is forced closed. These tracks are node transforms. There is no skeleton, no skin weights, and no plan to pretend otherwise in v1. A skinned authoring tool would be a later tool registered the same way.

`export.asset` clones the plate, drops helpers, reorders vertices with meshoptimizer, and writes a `.glb` with `GLTFExporter` (`binary: true`). `src/core/measure.js` computes the footprint (ceil of the local X/Z size, in 1 m cells, minimum 1), the bounding radius, attachment positions, `_lodN` names, and material names. `src/core/zipStore.js` packs an uncompressed zip so the browser can download the `public/assets/<category>/<id>/` layout plus `public/assets/manifest.json` without another dependency.

## WebAssembly

WASM is loaded only when a command needs it. The first page load does not fetch it. Nothing here uses `SharedArrayBuffer`, pthreads, or `instantiateStreaming`, because GitHub Pages cannot set COOP/COEP and has historically been picky about WASM MIME types. Bytes are fetched and passed to `WebAssembly.instantiate` (or the library's `wasmBinary` option).

| Piece | When it loads | What it does |
| --- | --- | --- |
| `manifold-3d` | First boolean (union, subtract, intersect) | Welds the selected solids and builds one mesh. Normals come from Manifold's `calculateNormals` when that call succeeds, otherwise from `computeVertexNormals`. |
| `meshoptimizer` encoder | Every export, and the optional meshopt zip | `reorderMesh` rewrites index and vertex order in the plain glTF so the game needs no decoder. `EXT_meshopt_compression` is only added for **Export meshopt**. |
| `meshoptimizer` simplifier | **LOD** | Builds an `<id>_lodN` mesh. Compacted LODs keep positions and recompute normals. They do not keep UVs, because primitives do not have a texture atlas yet. |
| `ktx2-encoder` (Basis) | Export, and only if a material has the procedural grain map | Encodes the embedded PNG to KTX2 (`ETC1S`, no Zstd supercompression) and marks the texture with `KHR_texture_basisu`. If encoding throws, the PNG stays. PNG at power-of-two size is still within the asset spec. |

The grain image is a 128×128 canvas filled by a hash in `createGrainTexture`. It is not a downloaded texture.

Copies of the WASM files are placed in `public/wasm/` by the Vite plugin in `vite.config.js`, and the app requests them under the Pages base path.

Not wired, and not a silent fallback pretending to be:

- A Draco encoder. meshopt covers buffer compression. Adding Draco would be a second codec the game would also have to decode.
- A WASM tokenizer. The JS scanner is enough.
- KTX2 for materials that have no texture. Those stay `baseColorFactor` / roughness / metalness.

## AI and external agents

`src/ai/session.js` loops a provider stream, appends tool calls, and runs them through `dispatch` with `source: 'ai'`. The provider interface is `streamX({ apiKey, baseUrl, model, messages, signal })`, yielding `{ type: 'text', delta }` and finally `{ type: 'done', message }`. Adapters:

- `src/ai/openai.js` speaks Server-Sent Events to `{baseUrl}/chat/completions`. That is the OpenAI-compatible shape used by Ollama and LM Studio as well.
- `src/ai/anthropic.js` speaks to `/v1/messages` and sends `anthropic-dangerous-direct-browser-access: true`, which is what lets a page call Anthropic without a proxy.
- `src/ai/gemini.js` speaks to `streamGenerateContent` on the Generative Language API.

Tool schemas are converted in `src/commands/tools.js`. Dots in command names become underscores (`editor.insert` → `editor_insert`) because provider tool names cannot contain dots. The map is reversed from the registry, not by string replace, so a name cannot be guessed wrong.

Settings live in `localStorage` under `vrdev.ai.settings`. `settings.get` returns `hasKey` and never the key. Commands that read or write the key are `aiVisible: false`, so they are not offered to the model. They remain available to the UI and to an external agent.

`src/mcp/bridge.js` answers `initialize`, `ping`, `tools/list`, and `tools/call`. `postMessage` uses the channel `vr-dev-platform` and accepts other origins only when the page was opened with `?agent`. The WebSocket path is outbound: the page connects to a URL the user typed, because a browser cannot listen. Details and a minimal bridge are in `docs/AI-INTEGRATION.md`.

## What v1 does not do

- Import a glTF back onto the plate.
- Skin a skeleton or author bone weights.
- Paint an arbitrary texture. Grain is the only texture, and it is procedural.
- Run user modules in a cross-origin iframe.
- Host the model call on a server. Keys go from the browser to the provider.
- Turn on GitHub Pages by itself. The workflow deploys once Source is GitHub Actions. See the README.
