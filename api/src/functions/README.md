# Excalidraw AI Layer — Native Arrow Binding Fix

## Files

- `generate.js` — generation pipeline, native element normalization, arrow routing, and bidirectional bindings.
- `layout-patterns.js` — deterministic diagram layouts and composition grammars.
- `wireframe-kit.js` — dynamic UI wireframe composition.
- `test-layout-patterns.js` — local layout, binding, movement, and mocked endpoint tests.

## Why this fixes the binding contract

Current Excalidraw element bindings use `startBinding` / `endBinding` with `elementId`, normalized `fixedPoint`, and `mode` (`orbit`, `inside`, or `skip`). The connected shape must also list the arrow in its `boundElements`. The previous generator emitted only the older `focus` / `gap` fields, which is insufficient for current Excalidraw versions.

The updated generator now:

1. Emits `fixedPoint` and `mode: "orbit"` on both arrow ends.
2. Keeps legacy `focus` and `gap` aliases for older Excalidraw releases.
3. Adds reciprocal `{ id: arrowId, type: "arrow" }` entries to each bound shape.
4. Ensures shape `angle` and arrow `width`, `height`, `angle`, `elbowed`, arrowheads, and core native fields are present.
5. Recalculates dimensions whenever an arrow's points are rerouted.
6. Rebuilds reciprocal binding references after routing and on the generated scene's finalization path.

## Install

Keep `generate.js`, `layout-patterns.js`, and `wireframe-kit.js` in the same directory as the Azure Function. The test file is for local validation and is not required in deployment. Keep the existing `@azure/functions`, `openai`, and environment configuration.

## Validate

From the directory containing the files:

```bash
node --check generate.js
node --check layout-patterns.js
node --check wireframe-kit.js
node test-layout-patterns.js
```

Tests mock Azure Functions and OpenAI and do not make network calls. They check native `fixedPoint` / `mode`, reciprocal `boundElements`, non-missing linear dimensions, and backend rerouting after a node move.

## Frontend integration note

The frontend must pass the generated element objects to Excalidraw without stripping `startBinding`, `endBinding`, `boundElements`, `fixedPoint`, or `mode`. If the frontend serializes a custom reduced shape/arrow schema or rebuilds elements while appending generated results, the bindings can still be lost there. If the updated backend's output contains these fields but dragging still does not move arrows, inspect the frontend code that calls `updateScene` / appends elements; that adapter is the remaining integration boundary.
