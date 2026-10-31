# Excalidraw visual-composition and AI-panel update

## What changed

### Visual representation selection
- The planner now distinguishes diagrams from non-sequential visual explanations.
- Two-way comparisons should use the existing `comparison` grammar: two aligned columns, comparable rows, concise text boxes, and no arrows unless a real relationship needs one.
- Concept summaries, pros/cons, key-point collections, and comparisons with more than two alternatives can use the new general-purpose `cards` grammar.
- `cards` lays out independent explanatory boxes in a 1–3 column grid. It is a reusable visual grammar, not a topic-specific template.
- Mermaid is no longer the universal fallback. It is used only when the planner explicitly selects Mermaid, or when editing an existing Mermaid diagram. If a specialised planner response is invalid or returns `freeform`, the backend asks for a text-card composition instead.

### AI panel UI
- Reworked the AI panel into a clearer visual workspace: workspace name, saved-workspace selector, create/edit switch, multiline prompt, character count, action buttons, examples, and contextual help.
- Added isolated styles in `AIWorkspacePanel.css`; the existing `App.css` remains part of the user's application and is not replaced.
- The UI explains that the AI chooses the representation and that new diagrams remain independent from existing canvas content.

### Prompt length
- Request cap remains **8,000 characters** in both UI and Azure Function.
- Short prompts (including fewer than 10 words) are explicitly valid. The planner is instructed to infer a focused, conventional intent rather than demand more words.
- Requests over the cap are rejected; they are not silently truncated.

## Files to integrate
- `App.tsx` — updated AI workspace UI.
- `AIWorkspacePanel.css` — new stylesheet; add alongside `App.tsx`.
- `generate.js` — planner intent rules, cards fallback, Mermaid selection policy, and 8,000-character API limit.
- `layout-patterns.js` — generic `cards` layout grammar and prompt schema updates.
- `excalidraw-render.js` — unchanged.
- `wireframe-kit.js` — unchanged.
- `saveScene.js`, `getScene.js` — unchanged persistence layer.

Keep the existing `App.css` and import it as before. Ensure the Azure Function deployment includes `generate.js`, `layout-patterns.js`, `excalidraw-render.js`, and `wireframe-kit.js` in the same module directory.

## Validation performed
- `node --check` passed for all JavaScript runtime files.
- `test-visual-representation.js` passed: comparison uses two aligned groups and no generated arrows; generic cards render as independent text boxes; 8,000-character cap is exported and checked.
- `test-layout-quality.js` passed: generic pipeline and composite layout smoke tests, relationship endpoint integrity, and unique IDs.
- `test-content-aware-prompts.js` passed: short-prompt and long-form guidance plus input-limit contract.
- `test-generate-api-contract.js` passed with mocked dependencies: 3-word prompt accepted, 8,000 characters accepted, 8,001 rejected before model call.
- `App.tsx` passed TypeScript TSX transpilation.

Not run: live Azure OpenAI calls, deployed Azure Functions integration, browser interaction, screenshot regression, or full project type-check/build. A legacy `test-layout-patterns.js` fixture from the earlier package was removed because it exercised an outdated wireframe schema; current-schema smoke coverage is in `test-layout-quality.js` and `test-visual-representation.js`.
