# Excalidraw AI — Modal Workspace UI Fix

This update fixes the AI workspace interaction and layout. The AI experience is now opened from a compact floating **AI** launcher instead of being rendered as a large inline section above the canvas.

## What changed

### 1. Toolbar-style launcher
- A compact sparkle/AI action is positioned near the top-left Excalidraw menu area.
- Clicking it opens the AI workspace modal.
- The Excalidraw canvas remains full-size behind the overlay; it is not pushed down or resized.

### 2. Viewport-bounded modal
- Centered overlay with a maximum width of 1,160 px and height of 780 px.
- Uses viewport-relative sizing and internal scrolling. It cannot extend past the viewport.
- Backdrop click and Escape close the modal (unless generation is in progress).
- Explicit close button; overlay content receives pointer events normally.
- Responsive stacked layout for narrow screens.

### 3. Two-pane workflow
- Left: create/edit mode, conversation messages, examples, prompt composer and character counter.
- Right: preview pane with an approximate SVG rendering of generated Excalidraw shapes, text and connectors.
- Workspace name, saved-workspace picker and save action are tucked into Workspace settings.
- New Chat resets the current draft and pending result.

### 4. Explicit Insert step
Generation no longer changes the canvas immediately. The result is staged in the modal first. The user can review it and choose **Insert on canvas**. Only then are elements added (or the explicitly selected diagram replaced in edit mode). This preserves the user's existing canvas until they confirm insertion.

### 5. Existing behavior retained
- Existing `/api/generate`, `/api/saveScene`, `/api/getScene` contracts are unchanged.
- 8,000-character prompt cap and short-prompt support remain.
- Create and edit semantics remain; edit still requires a selection from a tracked generated visual.
- Existing visual representation planner, layout grammars, renderer, theme logic and scene persistence are retained.

## Files

- `App.tsx` — modal launcher, dialog workflow, staged generation and Insert action.
- `AIWorkspacePanel.css` — isolated launcher/modal styling and responsive behavior.
- `generate.js`, `excalidraw-render.js`, `layout-patterns.js`, `wireframe-kit.js` — retained from the previous content-aware release.
- `saveScene.js`, `getScene.js` — retained scene persistence endpoints.
- `test-*.js`, `TEST_RESULTS.md` — automated checks.

## Integration

1. Replace your current `App.tsx` with this version.
2. Add `AIWorkspacePanel.css` beside `App.tsx`.
3. Keep your existing `App.css` file. It is intentionally not replaced by this patch because it contains the rest of your app and Excalidraw shell styling.
4. Keep the backend and renderer files from this package in their corresponding existing locations; do not create duplicate API routes.
5. Run the tests listed in `TEST_RESULTS.md`, then test the toolbar action and Insert flow in your deployed app.

The launcher is a fixed overlay action at `left: 64px`, `top: 14px` to sit beside Excalidraw's menu without covering the central tool dock. If your own top navigation occupies that exact area, adjust only `.ai-launcher` positioning in the CSS.

## Preview limitation
The modal preview is an approximate SVG rendering of the generated element geometry, not a second live Excalidraw editor. The inserted elements are the complete original editable Excalidraw elements. Some Excalidraw-specific details (rough strokes, bindings, custom fonts, image assets and frame clipping) may look different in the simplified preview.

## Not claimed
No live browser automation, deployed Azure Functions test, full project type-check, or visual regression test was run in this environment. See `TEST_RESULTS.md` for the checks that were actually executed.
