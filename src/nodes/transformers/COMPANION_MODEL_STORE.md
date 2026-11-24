# Companion model store

The Companion lives in `magnificus/pnp-companion-2`. This is the contract the
Transformers.js model node expects from it when its `Storage` input is set to
`Companion folder`. It is not implemented in the Companion yet. Until it is,
the node stores models in the browser and says so in `Status.message`.

The node turns the Companion into a Transformers.js `env.customCache`
(`companionModelCache.ts`). Transformers.js calls `match`, `put` and `delete`
with the file's Hugging Face URL as the key, for example
`https://huggingface.co/onnx-community/gemma-4-E2B-it-ONNX/resolve/main/onnx/model_q4f16.onnx_data`.

## Endpoints

All requests go to `http://localhost:6655`. In every path below, `<key>` is
`encodeURIComponent(key)`, so it is a single path segment.

| Request                | Response                                                                                                                                                                                                  |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /models`          | `200 { "folder": "/Users/…/Tailrmade models", "writable": true }`. The node calls this first to see whether the store is available. A `404` means an older Companion; the node falls back to the browser. |
| `GET /models/<key>`    | `200` with the file bytes, `Content-Length` and the stored `Content-Type`. `404` when the file isn't stored.                                                                                              |
| `PUT /models/<key>`    | The body is the file's bytes and `Content-Type` is the original type. Write it to a temporary file, then rename it into place, so a cancelled upload never leaves half a file. Reply `201` or `204`.      |
| `DELETE /models/<key>` | `204` when deleted, `404` when it wasn't there.                                                                                                                                                           |

Files reach several GB (Gemma 4 E2B q4f16 is about 3.1 GB in total), so
stream them to and from disk instead of buffering them in memory. Stop
cleanly when the client disconnects mid-download: Transformers.js sometimes
calls `match` only to check that a file exists, and doesn't read the body.

## Where files go

- The person picks the folder in the Companion's UI. Until they do, reply to
  `GET /models` with `"writable": false`, and the node falls back to the
  browser with a message.
- Map the key to a path under that folder by host and path, e.g.
  `<folder>/huggingface.co/onnx-community/gemma-4-E2B-it-ONNX/resolve/main/onnx/model_q4f16.onnx_data`,
  so the folder can be read and copied to another machine as-is.
- Reject keys that aren't `http(s)` URLs, and any key whose path leaves the
  folder (`..` segments after decoding).
- Store the `Content-Type` next to the file (for example in `<file>.meta.json`),
  or derive it from the extension.

## Browser access

- CORS: `Access-Control-Allow-Origin` for the Tailrmade origins the Companion
  already allows; `Access-Control-Allow-Methods: GET, PUT, DELETE, OPTIONS`;
  `Access-Control-Allow-Headers: Content-Type`;
  `Access-Control-Expose-Headers: Content-Length, Content-Type`.
- Private Network Access: Chrome sends a preflight with
  `Access-Control-Request-Private-Network: true` when a public page
  (https://tailrmade.app) reaches localhost. Answer it with
  `Access-Control-Allow-Private-Network: true`, as `/forward` must already do.
- The requests come from a dedicated Web Worker, not the page. That makes no
  difference to CORS.

## Fallback behaviour in the app

- `GET /models` fails, times out after 1.5 s, returns 404, or returns
  `writable: false`: the model loads into browser Cache Storage, and
  `Status.message` says "Stored in this browser instead of the Companion
  folder, because …".
- A `GET /models/<key>` that fails counts as a cache miss, so the file comes
  from Hugging Face.
- A `PUT` that fails is logged by Transformers.js and the load continues; the
  model works, but the file isn't kept.
