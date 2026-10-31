# Excalidraw AI diagram lifecycle patch

## Changed files
- `App.tsx`
  - Adds explicit **Create** and **Edit selected diagram** actions.
  - Create requests send no existing diagram source and append to the current scene.
  - Edit requests require a selection belonging to a tracked generated diagram.
  - Edits replace only that diagram's tracked elements and preserve its approximate canvas position.
  - New diagram batches are positioned around the viewport centre and selected together.
  - Mermaid skeletons receive semantic styling using renderer-owned theme tokens returned by the API.
  - Sends `generatedDiagrams` metadata when saving, while retaining legacy `mermaid` fields.
- `generate.js`
  - Adds explicit operation handling. Create forcibly discards existing Mermaid/spec input.
  - Edit requires a source and uses only that selected diagram's Mermaid or spec.
  - Mermaid nodes receive semantic tone inference when the planner does not provide a tone.
  - Returns the renderer's theme tokens with Mermaid style metadata.
  - Removes the arbitrary three-tone limit from planner instructions.
- `excalidraw-render.js`
  - Adds semantic label/role tone inference to the IR rendering path.

- `saveScene.js`
  - Validates and persists the per-diagram metadata array in Cosmos DB.
  - Retains backwards compatibility with clients that omit the new field.
- `getScene.js`
  - Returns `generatedDiagrams` as an empty array for legacy records while
    preserving the legacy Mermaid fields used by the frontend fallback.

## Preserved files
- `layout-patterns.js` and `wireframe-kit.js` are included unchanged. The generic dynamic layout system is retained.

## Integration notes / limitations
1. The supplied files did not include the `/api/saveScene` and `/api/getScene` handlers. `App.tsx` now sends and reads a `generatedDiagrams` array, but those handlers must persist and return that property for diagram-level edit metadata to survive a reload. If the save handler uses a strict field allowlist, add `generatedDiagrams` to it.
2. This implementation targets diagrams created after this patch. Legacy saved workspaces are loaded using the previous `mermaid` + `mermaidElementIds` fields as a single editable Mermaid diagram.
3. Full TypeScript type-checking could not be completed in this file-only environment because React and Excalidraw packages/types are not installed here. The TSX syntax was checked independently. The two backend JavaScript files pass `node --check`.
4. The client styling helper consumes semantic tone assignments and the exact palette tokens exported by the renderer. It is intentionally colocated in `App.tsx` because the provided files do not establish a client-importable path to the backend CommonJS renderer module.

## Behaviour
- Create: independent, append-only, no canvas context sent to the model.
- Edit: selected generated diagram only.
- Selection: all newly generated elements selected as one batch; no permanent group is created. Native Ctrl+G remains available.
- Position: new diagrams are centred in the current viewport; edits are centred on the replaced diagram.
- Colour: semantic roles are resolved by the renderer's light/dark theme tokens; no user palette is introduced.
