# Excalidraw AI diagram quality update

This update improves diagram planning and general-purpose edge routing without adding topic-specific templates.

## Included files

- `generate.js` — stronger semantic planning instructions and Mermaid fallback instructions.
- `layout-patterns.js` — geometry-aware edge-port selection and improved fan-out anchors; removes the rigid 4–14 node target from the generated planner instructions.
- `excalidraw-render.js` — current renderer, included unchanged so the package is self-contained and retains native Excalidraw arrow bindings and elbow routing.
- `wireframe-kit.js` — current wireframe implementation, included unchanged.
- `test-diagram-quality.js` — focused regression/smoke test for the updated planner contract, composite topology, routing metadata, and rendered bound arrows.

## What changed

### 1. Semantic planner

The planner now has explicit instructions to:

- identify the purpose, audience, scope, components, and dependencies before emitting a spec;
- distinguish data flow, control/sequence flow, feedback, and bypass relationships;
- include important intermediate transformations, stores, joins, and outputs;
- select a general layout grammar based on graph topology rather than topic names;
- use composite regions for parallel subsystems and connect them through meaningful cross-region relationships;
- check for missing inputs/outputs, incorrect dependencies, redundant nodes, and confusing cross-region links before returning JSON.

The planner is explicitly told not to create RAG-, Transformer-, cloud-, or product-specific layout templates. Existing dynamic grammars remain in place.

### 2. Mermaid fallback

The Mermaid prompt now includes semantic decomposition, flow direction, meaningful subgraphs, edge-crossing avoidance, component accuracy, intermediate steps, and edit-preservation rules. Syntax restrictions and the existing JSON response contract remain unchanged.

### 3. General-purpose edge routing

`layout-patterns.js` now chooses connection sides from the actual geometry of each source/target pair rather than relying only on the diagram-wide direction. Candidate orthogonal paths are scored for length, directionality, and intersections with unrelated node rectangles. This is especially useful for composite diagrams where one region is horizontal and another region is vertically offset.

Fan-out anchors are distributed over a wider portion of the node side and use deterministic tie-breaking. Semantic edge labels up to 24 characters are retained.

### 4. Rendering and bindings

The renderer is intentionally unchanged in this iteration. It already emits native Excalidraw start/end bindings and marks orthogonal edges as elbowed. The layout engine now supplies better source/target ports for that native routing behaviour. No custom SVG arrows or unbound connector replacements were introduced.

## Integration

Replace the corresponding backend files with the included files. Keep the filenames exactly as shown because `generate.js` imports `./layout-patterns` and `./excalidraw-render`, and `layout-patterns.js` loads `./wireframe-kit`.

No frontend changes are required for this backend-only iteration. Existing create/edit request contracts and diagram metadata are not changed.

## Validation performed

- `node --check` passed for all included JavaScript files.
- `node test-diagram-quality.js` passed: 10-node / 9-edge composite RAG topology, no node overlaps, all semantic edges preserved, port/anchor metadata, and native bound elbow-arrow skeletons.
- Additional smoke tests passed for pipeline, flow, tiers, swimlane, comparison, layers-net, tree, hub, and cycle patterns.

## Known limitations

- No live Azure OpenAI request, browser rendering test, or end-to-end deployment test was run.
- Excalidraw's native elbow router still determines the final rendered path. The layout engine now makes better port choices and avoids node-obstructed candidate routes, but this is not a full global edge-crossing optimiser and does not compute custom waypoint paths.
- The previous `test-layout-patterns.js` in the Library was not reused as the acceptance test because its wireframe expectations do not match the current `wireframe-kit.js` output. A focused test for this update is included instead.
