# AI integration

The headset UI and any assistant share one command registry. A provider adapter only has to stream chat and report tool calls. It does not get its own way to edit the scene.

`docs/API.md` is generated from that registry (`npm run docs:api`). If you add a command, regenerate the doc. The test suite checks that every command heading is present.

## Call a command

```js
import { dispatch } from './src/commands/registry.js';

const outcome = await dispatch('workshop.spawn', { type: 'box' }, {
  source: 'mcp',
  confirmed: true,
});
```

`outcome.status` is `ok`, `error`, or `confirmation_required`. UI code uses `run(name, params)` from the same module, which sets `source: 'ui'` and therefore counts as confirmation.

From the running page, the desktop console exposes the UI entry point:

```js
await window.__vrdev.dispatch('editor.get');
```

Do not build a second editor API beside this. Add a command instead.

## Add a command

Register it from a feature module, then call that registrar from `src/commands/catalog.js`.

```js
import { register } from '../commands/registry.js';

register({
  name: 'workshop.example',
  description: 'One sentence the model will see.',
  destructive: false,
  aiVisible: true,
  params: {
    type: 'object',
    additionalProperties: false,
    required: ['amount'],
    properties: { amount: { type: 'number', minimum: 0 } },
  },
  result: {
    type: 'object',
    additionalProperties: false,
    required: ['amount'],
    properties: { amount: { type: 'number' } },
  },
  run(params) {
    return getAppContext().workshop.example(params.amount);
  },
});
```

Set `destructive: true` when the command deletes or replaces user work (the module source, the plate, a boolean that consumes the selection, loading another project). Set `aiVisible: false` when the model must not see the command. Settings and the chat send/confirm commands are hidden that way. External agents can still call them.

Then run `npm run docs:api`.

## Provider contract

An adapter is an async generator:

```js
async function* streamChat({ apiKey, baseUrl, model, messages, signal }) {
  yield { type: 'text', delta: 'Hello' };
  yield {
    type: 'done',
    message: {
      content: 'Hello',
      toolCalls: [{
        id: 'call_1',
        toolName: 'editor_get',
        name: 'editor.get',
        arguments: {},
      }],
    },
  };
}
```

`messages` use the app's shape:

| Field | Meaning |
| --- | --- |
| `role` | `system`, `user`, `assistant`, or `tool` |
| `content` | Text for that turn |
| `toolCalls` | Present on an assistant turn that called tools |
| `toolCallId`, `toolName` | Present on a `tool` result |

`toolName` is the provider-facing name (`editor_get`). `name` is the registry name (`editor.get`). `src/commands/tools.js` builds the provider schemas and reverses the name when a stream is parsed. The session in `src/ai/session.js` runs each call, waits for Allow/Deny on destructive ones, and appends the JSON outcome as the tool result. It stops after six model rounds so a loop cannot spin forever.

To add a provider:

1. Add `src/ai/<id>.js` that implements the generator and converts messages.
2. Add a branch in `STREAMS` inside `src/ai/session.js`.
3. Add defaults (label, base URL, model id) in `PROVIDER_DEFAULTS` in `src/ai/settings.js`.
4. Expose tools with a function next to `openAiTools`, `anthropicTools`, and `geminiTools` if the provider's schema is not one of those three.

The in-app panel already cycles every id in `PROVIDER_DEFAULTS`.

### OpenAI-compatible

`POST {baseUrl}/chat/completions` with `Authorization: Bearer <key>`, `stream: true`, and `tools` in the Chat Completions shape. The default base URL is `https://api.openai.com/v1` and the default model is `gpt-4o-mini`. Change both in the AI panel.

Ollama: base URL `http://localhost:11434/v1`, model such as `llama3.2`. The Ollama process must allow the page origin (`OLLAMA_ORIGINS=https://atj1979.github.io` or `*` for a local experiment). A headset cannot call `localhost` on your computer. Point the base URL at a machine the headset can reach.

LM Studio: base URL `http://localhost:1234/v1`, same constraint.

The parser lives in `consumeOpenAiBlock` / `finishOpenAiState` and is covered by unit tests, including split tool-call deltas.

### Anthropic

`POST {baseUrl}/v1/messages` with headers `x-api-key`, `anthropic-version: 2023-06-01`, and `anthropic-dangerous-direct-browser-access: true`. That last header is required for a browser call without a backend. Tool results are sent back as `tool_result` blocks on a user message. The default model id is `claude-sonnet-4-5`. Replace it if your account uses a different id.

### Gemini

`POST {baseUrl}/v1beta/models/{model}:streamGenerateContent?alt=sse` with `x-goog-api-key`. Function declarations are a trimmed JSON Schema (Gemini rejects some keywords such as `additionalProperties`). The default model id is `gemini-2.5-flash`.

## Keys

The key is written to `localStorage` (`vrdev.ai.settings`) and read only when starting a request. The request URL is the base URL stored next to it. `settings.get` and the panel show whether a key exists, not the key. The model tool list does not include `settings.set` or `settings.get`.

Clear it with `settings.set` `{ "clearKey": true }`.

Anyone who can run scripts in the page can still read `localStorage`. That is true of any browser-only key. Do not use a key you cannot rotate, and do not open the page with `?agent` on a shared machine unless you trust the frames that can message it.

## postMessage

The page listens for:

```js
{
  channel: 'vr-dev-platform',
  id: 1,
  method: 'tools/list'
}
```

and replies to `event.source`:

```js
{
  channel: 'vr-dev-platform',
  reply: true,
  id: 1,
  result: { tools: [/* name, description, inputSchema, destructive */] }
}
```

`tools/call`:

```js
{
  channel: 'vr-dev-platform',
  id: 2,
  method: 'tools/call',
  params: {
    name: 'editor.insert',
    arguments: { text: 'const n = 1;\n' },
    confirmed: false
  }
}
```

Same-origin frames are accepted. Other origins are accepted only when the page URL contains `?agent`, so a local helper can iframe or open the app on purpose. Without that flag, a random page cannot drive a headset session that happens to be open.

A parent page can connect like this:

```html
<iframe id="vr" src="https://atj1979.github.io/vr-dev-platform/?agent"></iframe>
<script>
  const frame = document.getElementById('vr');
  frame.onload = () => {
    frame.contentWindow.postMessage({
      channel: 'vr-dev-platform',
      id: 'list',
      method: 'tools/list',
    }, '*');
  };
  window.addEventListener('message', (event) => {
    if (event.data?.channel !== 'vr-dev-platform' || !event.data.reply) return;
    console.log(event.data);
  });
</script>
```

`confirmed` must be `true` or a destructive call returns `confirmation_required` and does not run. The in-VR assistant cannot set that flag. The panel's Allow button does.

## WebSocket bridge

The browser connects out. Run a small server on a machine the headset can reach, put its URL in the AI panel (**Socket**, then **Connect agent**), or call `agent.connect` with `{ "url": "ws://192.168.1.20:8787" }`.

```js
import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ port: 8787 });
wss.on('connection', (socket) => {
  socket.on('message', async (raw) => {
    const message = JSON.parse(raw.toString());
    if (message.method === 'ready') {
      socket.send(JSON.stringify({ id: 1, method: 'tools/list' }));
      return;
    }
    if (message.id === 1) {
      socket.send(JSON.stringify({
        id: 2,
        method: 'tools/call',
        params: { name: 'preview.status', arguments: {} },
      }));
    }
    if (message.id === 2) console.log(message.result);
  });
});
```

The page answers with `{ id, result }` or `{ id, error }`. It does not speak the full MCP transport (no stdio, no SSE). The methods match the MCP tool surface: `tools/list` and `tools/call`. A desktop MCP client can sit in front of this socket and translate.

`agent.disconnect` closes the socket. The URL is stored locally with the other settings and is not sent to the model.

## In the headset

The AI panel is the wide panel above the desk.

- **Chat** shows the last turns, the streaming text, the latest tool name and status, and Allow / Deny when a destructive call is waiting.
- **Mic** starts `SpeechRecognition` when the browser has it. The transcript fills the draft. Send it with **Send** or the keyboard's Enter key.
- **Setup** picks the provider, then focuses Model, Base URL, API key, or Socket. The keyboard types into that field. Enter commits it. The key is stored as bullets' worth of "a key exists" on the panel. It is not drawn back out.

Destructive calls from the model do not run until Allow. Deny sends the model `The user denied this command.` and it can continue.
