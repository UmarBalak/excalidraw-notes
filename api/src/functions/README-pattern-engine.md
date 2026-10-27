# Excalidraw AI Layer — Dynamic Layout and Binding Package

## Included files

- `generate.js` — pattern-first generation path, fallback to the original Canvas IR prompt, arrow routing, and Excalidraw binding synchronization.
- `layout-patterns.js` — reusable technical diagram grammars, dynamic multi-region composition, node sizing, validation and geometry.
- `wireframe-kit.js` — UI composition from reusable primitives arranged in user-defined regions.

## Install

Put `generate.js`, `layout-patterns.js`, and `wireframe-kit.js` in the same directory as your existing Azure Function entry point. Retain your existing `@azure/functions` and `openai` dependencies and Azure OpenAI environment variables. README is for local verification/reference and do not need to be deployed.

## How generation works

1. Creation asks the model for a semantic pattern specification before falling back to the original full Canvas IR prompt.
2. The model selects a reusable diagram grammar. `composite` supports arbitrary semantic regions, relative row/column placement, local direction, region membership, and cross-region edges.
3. UI requests can compose arbitrary regions from reusable UI primitives instead of requiring a dedicated layout for every screen or subject.
4. Deterministic code computes positions and sizes. The edge router uses planned sides/anchors when they are provided.
5. Unsupported or malformed plans use the legacy full-IR generator. Existing surgical edit mode is preserved.

## Excalidraw arrow bindings

- Arrows contain `startBinding` and `endBinding` records with `elementId`, `focus`, and `gap`.
- Each endpoint shape lists the arrow in `boundElements` as `{ id: arrowId, type: "arrow" }`.
- Reciprocal bindings are synchronized after routing. Routing metadata such as `fromSide`, `toSide`, `fromAnchor`, `toAnchor`, and `route` is carried across sanitization and rendering.
- The gap is set to 2 canvas pixels.

The frontend must pass through `startBinding`, `endBinding`, and `boundElements` when it receives/saves scene elements. If it strips these fields, connectors may appear visually close to a shape without behaving as bound connectors.

## Local checks

From the package directory:

```bash
node --check generate.js
node --check layout-patterns.js
node --check wireframe-kit.js
```

The tests use mocked Azure Functions and OpenAI, so they make no network calls. They cover ten diagram grammars/layout examples, dynamic UI composition, malformed-spec validation, reciprocal arrow bindings, node-move rerouting, and mocked pattern-first/fallback generation. These checks validate code contracts; they do not guarantee perfect output from a live model or verify the user's deployed frontend.
