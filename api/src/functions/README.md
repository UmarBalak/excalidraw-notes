# Excalidraw AI Layer — Pattern-First Generation Update

## Files

- `generate.js` — updated Azure Functions handler and canvas generation pipeline.
- `layout-patterns.js` — deterministic technical-diagram pattern registry and geometry engine.
- `wireframe-kit.js` — deterministic low-fidelity UI layouts.
- `test-layout-patterns.js` — local smoke and mocked end-to-end tests.

## Installation

Place these three runtime files in the same directory as your existing Azure Function entry point, replacing the previous `generate.js` and adding the two companion modules. The existing `@azure/functions` and `openai` dependencies and Azure OpenAI environment variables are still required for deployment. No additional runtime package was added.

Do not deploy `generate.js` on its own. It imports `./layout-patterns`, and UI requests use `./wireframe-kit`.

## How generation now works

1. Creation mode asks the LLM for a semantic pattern specification first. The model selects the diagram grammar and supplies labels, relationships, groups, and content slots; it does not choose coordinates or sizes.
2. `layout-patterns.js` computes node dimensions, positions, group membership, edge ports, and anchors for supported patterns.
3. UI requests can select the `wireframe` pattern. `wireframe-kit.js` lays out dashboard, login, settings, form, Kanban, data-table, chat, and generic screens using fixed geometry and model-supplied content slots.
4. Invalid, unsupported, or freeform pattern specifications fall back to the original full Canvas IR prompt. Existing edit mode remains on the original surgical-edit path.
5. UI wireframes skip the generic missing-arrow repair pass; it should not invent arrows between unrelated controls.

## Routing changes

- Relationship sanitization and native rendering preserve `fromSide`, `toSide`, `fromAnchor`, `toAnchor`, `route`, and `edgeKind`.
- The native router honors pattern-selected ports and anchors.
- Orthogonal routes use an additional penalty for crossing or substantially overlapping previously routed orthogonal edges.
- Group containers are ignored as routing obstacles, and semantic group/note identity is preserved during native-to-IR conversion.

## Validation and tests

From the directory containing the files, run:

```bash
node --check generate.js
node --check layout-patterns.js
node --check wireframe-kit.js
node test-layout-patterns.js
```

The test script mocks Azure Functions and OpenAI, so it makes no network calls. It exercises the supported diagram patterns, UI layouts, invalid-spec guards, native arrow routing, and the legacy fallback path.

## Scope notes

The wireframe kit uses the native shapes currently supported by this canvas IR. It creates low-fidelity screen compositions, not production-ready UI or a full design-system renderer. The routing penalty reduces avoidable crossings; it does not guarantee a globally crossing-free drawing for every graph.
