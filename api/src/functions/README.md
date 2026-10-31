# Excalidraw content-aware generation update

## What changed

- Raised the generation request cap from 400 to **8,000 characters** in the Azure Function.
- Replaced the single-line instruction input with a multiline textarea and a live character counter. The workspace name remains capped separately at 180 characters.
- Added an explicit client-side length guard and matching server-side validation. Requests over the cap are rejected with a clear message; they are never silently truncated.
- Strengthened planner and Mermaid instructions for short prompts (including prompts under 10 words), long prompts, semantic intent inference, content-to-visual composition, section hierarchy, concise explanatory units, and relationship quality.
- Kept topic selection dynamic. No RAG, Transformer, Kubernetes, or other topic-specific layout templates were added.
- Preserved the existing renderer, theme tokens, layout engines, wireframe primitives, and scene persistence implementation.

## Prompt behavior

The model is instructed to treat prompt length independently from output quality. A short prompt such as `Transformers`, `RAG architecture`, or `compare SQL and NoSQL` should infer a sensible deliverable from the intent words. A long prompt should preserve explicit constraints and organise content before drawing. For article/tutorial requests, the planner is instructed to compose a visual document with a small number of meaningful sections rather than forcing all content into one flowchart.

These are model instructions, not deterministic guarantees. Evaluate with the same prompt set against your configured model.

## Limits

- Instruction cap: 8,000 JavaScript characters (same UI/API limit).
- Workspace name cap: 180 characters (unchanged).
- Existing Mermaid source cap: 24,000 characters (unchanged).
- Existing spec cap: 40,000 characters (unchanged).

## Files

- `App.tsx` — multiline prompt UI, counter, client validation.
- `generate.js` — 8,000-character API cap and strengthened planning/Mermaid prompts.
- `layout-patterns.js` — shared composition rules for intent inference and content-aware visual planning.
- `excalidraw-render.js` — unchanged renderer.
- `wireframe-kit.js` — unchanged generic UI primitives.
- `saveScene.js`, `getScene.js` — unchanged persistence functions.

## Validation performed

- JavaScript syntax checks for backend and layout modules.
- Prompt contract tests for short prompts, long article prompts, and the 8,000-character boundary.
- Frontend TSX transpilation/syntax check where the local TypeScript compiler is available.

No live Azure OpenAI call, deployed API test, full TypeScript project type-check, or browser interaction test is claimed. The TSX file was syntax-transpiled with the installed TypeScript compiler.
