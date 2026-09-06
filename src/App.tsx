import { useEffect, useState } from "react";
import {
  Excalidraw,
  convertToExcalidrawElements,
} from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import "./App.css";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

type SceneSummary = {
  topic: string;
  updatedAt: string;
};

export default function App() {
  const currentPath = window.location.pathname;

  if (currentPath === "/editor" || currentPath.startsWith("/editor/")) {
    return <EditorPage />;
  }

  return <LandingPage />;
}

function LandingPage() {
  const [loggingIn, setLoggingIn] = useState(false);

  const signIn = () => {
    setLoggingIn(true);

    window.location.assign(
      "/.auth/login/github?post_login_redirect_uri=/editor",
    );
  };

  return (
    <main className="landing-page">
      <div className="landing-grid" />

      <nav className="landing-nav">
        <a className="brand" href="/" aria-label="AI Diagram home">
          <span className="brand-mark">✦</span>
          <span className="brand-text">AI Diagram</span>
        </a>

        <button
          type="button"
          className="nav-login"
          onClick={signIn}
          disabled={loggingIn}
        >
          {loggingIn ? "Opening GitHub..." : "Sign in"}
        </button>
      </nav>

      <section className="hero-section">
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="eyebrow-dot" />
            Your private visual workspace
          </div>

          <h1>
            Think clearly.
            <span> Draw freely.</span>
          </h1>

          <p className="hero-description">
            A private, distraction-free canvas for diagrams, system design,
            flowcharts, learning notes, and visual thinking.
          </p>

          <div className="hero-actions">
            <button
              type="button"
              className="primary-cta"
              onClick={signIn}
              disabled={loggingIn}
            >
              <span>{loggingIn ? "Opening GitHub..." : "Start creating"}</span>
              <span className="cta-arrow">→</span>
            </button>

            <span className="secure-note">
              <span>⌁</span>
              Private workspace · GitHub sign-in
            </span>
          </div>

          <div className="hero-stats">
            <div>
              <strong>∞</strong>
              <span>Infinite canvas</span>
            </div>

            <div>
              <strong>✎</strong>
              <span>Draw freely</span>
            </div>

            <div>
              <strong>🔒</strong>
              <span>Login protected</span>
            </div>
          </div>
        </div>

        <div className="hero-visual" aria-hidden="true">
          <div className="floating-tag tag-private">🔒 Private workspace</div>
          <div className="floating-tag tag-draw">✎ Start drawing</div>

          <div className="canvas-preview">
            <div className="preview-topbar">
              <div className="preview-logo">
                <span>✦</span>
                AI Diagram
              </div>

              <div className="preview-tools">
                <i />
                <i />
                <i />
                <i />
                <i />
              </div>

              <div className="preview-avatar">U</div>
            </div>

            <div className="preview-board">
              <div className="preview-board-title">
                <span className="title-sparkle">✦</span>
                System Design
              </div>

              <div className="diagram-line line-one" />
              <div className="diagram-line line-two" />
              <div className="diagram-line line-three" />

              <div className="diagram-node preview-client-node">
                <span className="node-icon">◉</span>
                <span>Client</span>
              </div>

              <div className="diagram-node preview-api-node">
                <span className="node-icon">◇</span>
                <span>API</span>
              </div>

              <div className="diagram-node preview-service-node">
                <span className="node-icon">⚙</span>
                <span>Service</span>
              </div>

              <div className="diagram-node preview-db-node">
                <span className="node-icon">▦</span>
                <span>Database</span>
              </div>

              <aside className="preview-notes">
                <div className="notes-heading">
                  <span>Notes</span>
                  <span className="notes-dot" />
                </div>

                <div className="note-line note-line-wide" />
                <div className="note-line" />
                <div className="note-line note-line-medium" />

                <div className="note-bullets">
                  <span>• Client sends a request</span>
                  <span>• API validates input</span>
                  <span>• Service handles logic</span>
                  <span>• Database stores data</span>
                </div>
              </aside>

              <div className="preview-cursor">
                <span>✦</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="feature-section">
        <article className="feature-card">
          <div className="feature-icon feature-icon-purple">∞</div>
          <h2>Infinite canvas</h2>
          <p>
            Brainstorm, sketch, connect ideas, and zoom out without running
            into page boundaries.
          </p>
        </article>

        <article className="feature-card">
          <div className="feature-icon feature-icon-blue">✎</div>
          <h2>Built for visual thought</h2>
          <p>
            Use Excalidraw’s familiar drawing tools for architecture diagrams,
            notes, and flowcharts.
          </p>
        </article>

        <article className="feature-card">
          <div className="feature-icon feature-icon-green">🔒</div>
          <h2>Private by default</h2>
          <p>
            The editor is behind your GitHub login. Visitors cannot open the
            workspace directly.
          </p>
        </article>
      </section>

      <footer className="landing-footer">
        <span>Your private Excalidraw workspace.</span>
        <span>AI generation and cloud sync coming next.</span>
      </footer>
    </main>
  );
}

// Strips a live Excalidraw scene down to the same lightweight skeleton shape
// the AI itself produces, so it can be sent back as context for edits
// without wasting tokens on rendering internals it doesn't need.
function simplifySceneForPrompt(elements: readonly any[]) {
  const visible = elements.filter((el) => !el.isDeleted);
  const boundTextByContainer = new Map<string, string>();

  visible.forEach((el) => {
    if (el.type === "text" && el.containerId) {
      boundTextByContainer.set(el.containerId, el.text);
    }
  });

  return visible
    .filter((el) => !(el.type === "text" && el.containerId))
    .map((el) => {
      const item: Record<string, unknown> = {
        id: el.id,
        type: el.type,
        x: Math.round(el.x),
        y: Math.round(el.y),
      };

      if (el.width) item.width = Math.round(el.width);
      if (el.height) item.height = Math.round(el.height);
      if (el.type === "text") {
        item.text = el.text;
        if (el.fontSize) item.fontSize = el.fontSize;
      }

      if (el.type === "arrow") {
        const startId = el.startBinding?.elementId;
        const endId = el.endBinding?.elementId;
        if (startId) item.start = { id: startId };
        if (endId) item.end = { id: endId };
      }

      if (el.type === "line" && Array.isArray(el.points)) {
        item.points = el.points.map((point: { x: number; y: number }) => ({
          x: Math.round(point.x),
          y: Math.round(point.y),
        }));
      }

      const boundText = boundTextByContainer.get(el.id);
      if (boundText) item.label = { text: boundText };

      return item;
    });
}

function EditorPage() {
  const [excalidrawAPI, setExcalidrawAPI] =
    useState<ExcalidrawImperativeAPI | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const initialTopic =
    new URLSearchParams(window.location.search).get("topic")?.trim() ||
    "Untitled";
  const [topic, setTopic] = useState(initialTopic);
  // Separate from `topic` — this is what gets sent to the AI. `topic` stays
  // the workspace's save/load name so an edit instruction never renames it.
  const [instruction, setInstruction] = useState(initialTopic);
  const [scenes, setScenes] = useState<SceneSummary[]>([]);
  const [loadingScene, setLoadingScene] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("Click Save to sync");
  const [error, setError] = useState("");

  const refreshScenes = () => {
    fetch("/api/listScenes")
      .then((response) => (response.ok ? response.json() : []))
      .then((sceneList) => {
        setScenes(Array.isArray(sceneList) ? sceneList : []);
      })
      .catch((error) => console.error("Unable to list workspaces:", error));
  };

  const loadScene = (selectedTopic: string) => {
    if (!excalidrawAPI) return;

    setLoadingScene(true);
    setError("");

    fetch(`/api/getScene?topic=${encodeURIComponent(selectedTopic)}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((scene) => {
        if (scene?.elements) {
          const savedAppState = scene.appState || {};

          excalidrawAPI.updateScene({
            elements: scene.elements,
            appState: {
              viewBackgroundColor: savedAppState.viewBackgroundColor,
              gridSize: savedAppState.gridSize,
              theme: savedAppState.theme,
            },
          });
        } else {
          excalidrawAPI.resetScene();
        }

        setTopic(selectedTopic);
        setInstruction(""); // ready for a fresh "add/remove ..." instruction
        setSaveMessage("Click Save to sync");
        window.history.replaceState(
          null,
          "",
          `/editor?topic=${encodeURIComponent(selectedTopic)}`,
        );

        if (scene?.appState?.theme === "light" || scene?.appState?.theme === "dark") {
          setTheme(scene.appState.theme);
        }
      })
      .catch((error) => {
        console.error("Unable to load workspace:", error);
        setError("Unable to load that workspace.");
      })
      .finally(() => {
        setLoadingScene(false);
      });
  };

  useEffect(() => {
    if (!excalidrawAPI) return;

    loadScene(initialTopic);
    refreshScenes();
  }, [excalidrawAPI, initialTopic]);

  const generateDiagram = async () => {
    const targetInstruction = instruction.trim();
    if (!targetInstruction || !excalidrawAPI) return;

    setGenerating(true);
    setError("");

    try {
      const existingElements = simplifySceneForPrompt(
        excalidrawAPI.getSceneElements(),
      );

      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ topic: targetInstruction, existingElements }),
      });

      const responseText = await response.text();
      let responseBody: unknown = responseText;

      try {
        responseBody = responseText ? JSON.parse(responseText) : null;
      } catch (parseError) {
        console.error("[API] POST /api/generate returned invalid JSON", {
          status: response.status,
          parseError,
          responseText: responseText.slice(0, 1000),
        });
      }

      console.info("[API] POST /api/generate", {
        status: response.status,
        ok: response.ok,
        body: responseBody,
      });

      if (!response.ok) {
        const message =
          typeof responseBody === "object" && responseBody !== null &&
          "error" in responseBody
            ? String(responseBody.error)
            : `Generation failed (${response.status})`;
        throw new Error(message);
      }

      if (!Array.isArray(responseBody)) {
        throw new Error("Generation returned an invalid element list.");
      }

      const skeleton = responseBody as Parameters<
        typeof convertToExcalidrawElements
      >[0];
      excalidrawAPI.updateScene({
        elements: convertToExcalidrawElements(skeleton, {
          regenerateIds: false,
        }),
      });
      setSaveMessage(
        existingElements.length
          ? "Edited — click Save to keep this"
          : "Generated — click Save to keep this",
      );

    } catch (generationError) {
      console.error("[API] POST /api/generate failed", generationError);
      setError(
        generationError instanceof Error
          ? generationError.message
          : "Unable to generate diagram.",
      );
    } finally {
      setGenerating(false);
    }
  };

  const saveScene = async () => {
    if (!excalidrawAPI || !topic.trim()) return;

    setSaving(true);
    setSaveMessage("Saving...");

    try {
      const currentAppState = excalidrawAPI.getAppState();
      const response = await fetch("/api/saveScene", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          topic: topic.trim(),
          elements: excalidrawAPI.getSceneElements(),
          appState: {
            viewBackgroundColor: currentAppState.viewBackgroundColor,
            gridSize: currentAppState.gridSize,
            theme: currentAppState.theme,
          },
        }),
      });

      if (!response.ok) throw new Error(`Save failed (${response.status})`);

      setSaveMessage("Saved");
      refreshScenes();
    } catch (saveError) {
      console.error("Unable to save workspace:", saveError);
      setSaveMessage("Save failed");
    } finally {
      setSaving(false);
    }
  };

  const logout = () => {
    window.location.assign(
      "/.auth/logout?post_logout_redirect_uri=/",
    );
  };

  return (
    <div className={`editor-shell theme--${theme}`}>
      <section className="editor-ai-panel" aria-label="AI diagram generator">
        <div className="editor-ai-heading">
          <span className="editor-ai-title">AI Diagram</span>
          <span className="editor-save-state">{saveMessage}</span>
        </div>

        <select
          className="editor-scene-picker"
          value={scenes.some((scene) => scene.topic === topic) ? topic : ""}
          onChange={(event) => {
            if (event.target.value) loadScene(event.target.value);
          }}
          disabled={loadingScene || generating}
          aria-label="Open saved canvas"
        >
          <option value="">
            {scenes.length ? "Open saved canvas..." : "No saved canvases yet"}
          </option>
          {scenes.map((scene) => (
            <option key={scene.topic} value={scene.topic}>
              {scene.topic}
            </option>
          ))}
        </select>

        <span style={{ fontSize: 11, opacity: 0.6 }}>Workspace name</span>
        <input
          className="editor-topic-input"
          value={topic}
          onChange={(event) => setTopic(event.target.value)}
          placeholder="Workspace name..."
          maxLength={180}
          disabled={generating}
        />

        <span style={{ fontSize: 11, opacity: 0.6 }}>
          {excalidrawAPI && excalidrawAPI.getSceneElements().length > 0
            ? "Ask for a change (e.g. remove the arrow to Database)"
            : "Describe the diagram to generate"}
        </span>
        <form
          className="editor-ai-form"
          onSubmit={(event) => {
            event.preventDefault();
            void generateDiagram();
          }}
        >
          <input
            className="editor-topic-input"
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            placeholder="Describe a diagram or a change..."
            maxLength={180}
            disabled={generating}
          />
          <button
            className="editor-generate-button"
            type="submit"
            disabled={generating || !instruction.trim()}
            title="Generate or edit diagram"
          >
            {generating ? "..." : "Generate"}
          </button>
          <button
            className="editor-save-button"
            type="button"
            onClick={() => void saveScene()}
            disabled={saving || loadingScene || !topic.trim()}
            title="Save canvas"
          >
            {saving ? "..." : "Save"}
          </button>
        </form>

        {error && <p className="editor-ai-error">{error}</p>}
      </section>

      <Excalidraw
        excalidrawAPI={(api) => setExcalidrawAPI(api)}
        onChange={(_elements, appState) => {
          if (appState.theme === "light" || appState.theme === "dark") {
            setTheme(appState.theme);
          }
        }}
      />

      <div className="editor-floating-actions">
        <a href="/" className="editor-home-link" title="Back to home">
          <span className="editor-home-mark">✦</span>
          <span>AI Diagram</span>
        </a>

        <button
          type="button"
          className="platform-logout"
          onClick={logout}
          title="Log out of this workspace"
        >
          <span className="logout-icon">↪</span>
          Log out
        </button>
      </div>
    </div>
  );
}