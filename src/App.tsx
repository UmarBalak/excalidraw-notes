import { useEffect, useRef, useState } from "react";
import { Excalidraw, convertToExcalidrawElements } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import "./App.css";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

const SUGGESTIONS = ["Architecture", "Flowchart", "Database schema"];

export default function App() {
  const [excalidrawAPI, setExcalidrawAPI] =
    useState<ExcalidrawImperativeAPI | null>(null);
  const [topic, setTopic] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [panelOpen, setPanelOpen] = useState(true);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!excalidrawAPI || !topic) return;
    fetch(`/api/getScene?topic=${encodeURIComponent(topic)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.elements) {
          excalidrawAPI.updateScene({ elements: data.elements });
        } else {
          excalidrawAPI.resetScene();
        }
      });
  }, [topic, excalidrawAPI]);

  const generate = async (selectedTopic?: string) => {
    const targetTopic = (selectedTopic ?? topic).trim();
    if (!targetTopic || !excalidrawAPI) return;

    if (selectedTopic) setTopic(selectedTopic);
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: targetTopic }),
      });
      if (!res.ok) throw new Error(`Generation failed (${res.status})`);
      const skeleton = await res.json();
      const elements = convertToExcalidrawElements(skeleton);
      excalidrawAPI.updateScene({ elements });
    } catch (e) {
      setError("Failed to generate diagram.");
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const onChange = (
    _elements: readonly any[],
    appState: any,
  ) => {
    // Keep panel theme in sync with Excalidraw
    if (appState.theme && appState.theme !== theme) {
      setTheme(appState.theme);
    }

    if (!excalidrawAPI || !topic) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const elements = excalidrawAPI.getSceneElements();
      fetch("/api/saveScene", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, elements }),
      });
    }, 1500);
  };

  return (
    <div className={`app-shell theme--${theme}`}>
      <a className="platform-logout" href="/.auth/logout">
        Log out
      </a>
      <section className={`exc-panel ${panelOpen ? "" : "is-collapsed"}`}>
        {panelOpen ? (
          <>
            <div className="exc-header">
              <span className="exc-title">AI Diagram</span>
              <button
                className="exc-icon-btn"
                onClick={() => setPanelOpen(false)}
                title="Collapse panel"
              >
                ×
              </button>
            </div>

            <form
              className="exc-form"
              onSubmit={(e) => {
                e.preventDefault();
                generate();
              }}
            >
              <input
                className="exc-input"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Topic..."
                disabled={loading}
              />
              <button
                type="submit"
                className="exc-btn-primary"
                disabled={loading || !topic.trim()}
                aria-label="Generate diagram"
                title="Generate diagram"
              >
                {loading ? "..." : "↵"}
              </button>
            </form>

            <div className="exc-chips">
              {SUGGESTIONS.map((item) => (
                <button
                  key={item}
                  type="button"
                  className="exc-chip"
                  disabled={loading}
                  onClick={() => generate(item)}
                >
                  {item}
                </button>
              ))}
            </div>

            {error && <div className="exc-error">{error}</div>}
          </>
        ) : (
          <button
            className="exc-trigger"
            onClick={() => setPanelOpen(true)}
            title="Expand AI generator"
          >
            ✦ AI
          </button>
        )}
      </section>

      <Excalidraw
        excalidrawAPI={(api) => setExcalidrawAPI(api)}
        onChange={onChange}
      />
    </div>
  );
}