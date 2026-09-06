import { useEffect, useRef, useState } from "react";
import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import "./App.css";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

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

function EditorPage() {
  const [excalidrawAPI, setExcalidrawAPI] =
    useState<ExcalidrawImperativeAPI | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const topic = new URLSearchParams(window.location.search).get("topic")?.trim() || "Untitled";
  const sceneLoaded = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!excalidrawAPI) return;

    sceneLoaded.current = false;

    fetch(`/api/getScene?topic=${encodeURIComponent(topic)}`)
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
        }

        if (scene?.appState?.theme === "light" || scene?.appState?.theme === "dark") {
          setTheme(scene.appState.theme);
        }
      })
      .catch((error) => console.error("Unable to load workspace:", error))
      .finally(() => {
        sceneLoaded.current = true;
      });

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [excalidrawAPI, topic]);

  const logout = () => {
    window.location.assign(
      "/.auth/logout?post_logout_redirect_uri=/",
    );
  };

  return (
    <div className={`editor-shell theme--${theme}`}>
      <Excalidraw
        excalidrawAPI={(api) => setExcalidrawAPI(api)}
        onChange={(_elements, appState) => {
          if (appState.theme === "light" || appState.theme === "dark") {
            setTheme(appState.theme);
          }

          if (!excalidrawAPI || !sceneLoaded.current) return;

          if (saveTimer.current) clearTimeout(saveTimer.current);
          saveTimer.current = setTimeout(() => {
            const currentAppState = excalidrawAPI.getAppState();

            fetch("/api/saveScene", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                topic,
                elements: excalidrawAPI.getSceneElements(),
                appState: {
                  viewBackgroundColor: currentAppState.viewBackgroundColor,
                  gridSize: currentAppState.gridSize,
                  theme: currentAppState.theme,
                },
              }),
            }).catch((error) => console.error("Unable to save workspace:", error));
          }, 1000);
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