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

type GeneratedDiagram = {
  id: string;
  kind: "mermaid" | "scene";
  source: string;
  spec?: Record<string, unknown> | null;
  elementIds: string[];
  createdAt: number;
};


type SemanticTone = {
  stroke: string;
  fill: string;
  text: string;
};

function applyMermaidSemanticStyles(
  skeletons: any[],
  styles: Array<{ id: string; label?: string; tone: string }>,
  themeTones: Record<string, SemanticTone>,
  themeEdges: { edge: string; text: string },
) {
  const byId = new Map(styles.map((style) => [style.id, style.tone]));
  const byLabel = new Map(
    styles
      .filter((style) => style.label)
      .map((style) => [style.label!.trim().toLowerCase(), style.tone]),
  );

  return skeletons.map((element) => {
    const next: any = {
      ...element,
      roughness: 1,
      fontFamily: 5,
      strokeColor: element.strokeColor || themeEdges.text,
    };

    if (["rectangle", "ellipse", "diamond"].includes(element.type)) {
      const label = (element.label?.text || element.text || "").trim().toLowerCase();
      const toneName = byId.get(element.id) || byLabel.get(label) || "default";
      const tone = themeTones[toneName] || themeTones.default;
      if (tone) {
        next.strokeColor = tone.stroke;
        next.backgroundColor = tone.fill;
        next.fillStyle = "solid";
        if (element.type === "rectangle") next.roundness = { type: 3 };
        if (element.label) {
          next.label = { ...element.label, fontFamily: 5, strokeColor: tone.text };
        }
      }
    } else if (element.type === "arrow") {
      next.strokeColor = themeEdges.edge;
    }
    return next;
  });
}

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
  const initialTopic =
    new URLSearchParams(window.location.search).get("topic")?.trim() ||
    "Untitled";
  const [topic, setTopic] = useState(initialTopic);
  // Independent from `topic` (the workspace's save/load name) — this is
  // only ever what you type into the "ask for a change" box. Must start
  // empty, never pre-filled with the topic, or the topic name itself gets
  // sent to the AI as an instruction the moment you hit Generate.
  const [instruction, setInstruction] = useState("");
  // Each generated diagram owns its source and element IDs. A canvas may
  // contain many independent AI diagrams alongside ordinary Excalidraw work.
  const [diagrams, setDiagrams] = useState<GeneratedDiagram[]>([]);
  const [operation, setOperation] = useState<"create" | "edit">("create");
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

          const loadedIds = Array.isArray(scene.mermaidElementIds)
            ? scene.mermaidElementIds.filter(
                (id: unknown): id is string => typeof id === "string",
              )
            : [];
          const savedDiagrams = Array.isArray(scene.generatedDiagrams)
            ? scene.generatedDiagrams.filter(
                (item: any) =>
                  item && typeof item.id === "string" &&
                  Array.isArray(item.elementIds),
              )
            : [];
          setDiagrams(
            savedDiagrams.length
              ? savedDiagrams
              : loadedIds.length
                ? [{
                    id: `legacy-${Date.now()}`,
                    kind: "mermaid",
                    source: typeof scene.mermaid === "string" ? scene.mermaid : "",
                    elementIds: loadedIds,
                    createdAt: Date.now(),
                  }]
                : [],
          );
        } else {
          excalidrawAPI.resetScene();
          setDiagrams([]);
        }

        setTopic(selectedTopic);
        setInstruction("");
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
    if (targetInstruction.length > 8000) {
      setError("Your request is too long. Keep it within 8,000 characters.");
      return;
    }

    const sceneElements = excalidrawAPI.getSceneElements();
    const appState = excalidrawAPI.getAppState();
    const selectedIds = new Set(
      Object.entries(appState.selectedElementIds || {})
        .filter(([, selected]) => selected)
        .map(([id]) => id),
    );
    const targetDiagram =
      operation === "edit"
        ? [...diagrams].reverse().find((diagram) =>
            diagram.elementIds.some((id) => selectedIds.has(id)),
          )
        : undefined;

    if (operation === "edit" && !targetDiagram) {
      setError("Select an element from the diagram you want to edit.");
      return;
    }

    setGenerating(true);
    setError("");

    try {
      const requestBody: Record<string, unknown> = {
        operation,
        topic: targetInstruction,
        theme: appState.theme === "light" ? "light" : "dark",
      };

      if (operation === "edit" && targetDiagram) {
        if (targetDiagram.kind === "mermaid") {
          requestBody.existingMermaid = targetDiagram.source;
        } else if (targetDiagram.spec) {
          requestBody.existingSpec = targetDiagram.spec;
        } else {
          throw new Error("This saved diagram has no editable source. Create a new diagram instead.");
        }
        requestBody.targetDiagramId = targetDiagram.id;
      }

      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      const responseText = await response.text();
      let responseBody: any = responseText;
      try {
        responseBody = responseText ? JSON.parse(responseText) : null;
      } catch (parseError) {
        console.error("[API] POST /api/generate returned invalid JSON", {
          status: response.status, parseError,
          responseText: responseText.slice(0, 1000),
        });
      }

      if (!response.ok) {
        throw new Error(
          responseBody && typeof responseBody === "object" && "error" in responseBody
            ? String(responseBody.error)
            : `Generation failed (${response.status})`,
        );
      }

      let skeletons: any[] = [];
      let nextDiagram: GeneratedDiagram;

      if (responseBody?.kind === "scene" && Array.isArray(responseBody.elements)) {
        skeletons = responseBody.elements;
        nextDiagram = {
          id: targetDiagram?.id || crypto.randomUUID(),
          kind: "scene",
          source: "",
          spec: responseBody.spec || null,
          elementIds: [],
          createdAt: Date.now(),
        };
      } else if (
        responseBody?.kind === "mermaid" &&
        typeof responseBody.mermaid === "string"
      ) {
        const nextMermaid = responseBody.mermaid.trim();
        if (!nextMermaid) throw new Error("Generation returned an empty Mermaid diagram.");

        const { parseMermaidToExcalidraw } = await import(
          "@excalidraw/mermaid-to-excalidraw"
        );
        const parsed = await parseMermaidToExcalidraw(nextMermaid);
        if (!parsed.elements.length) throw new Error("Mermaid did not produce any diagram elements.");

        // Apply the server's semantic tone assignments before conversion.
        skeletons = applyMermaidSemanticStyles(
          parsed.elements,
          Array.isArray(responseBody.styles) ? responseBody.styles : [],
          responseBody.themeTones || {},
          responseBody.themeEdges || { edge: "#343a40", text: "#1e1e1e" },
        );
        nextDiagram = {
          id: targetDiagram?.id || crypto.randomUUID(),
          kind: "mermaid",
          source: nextMermaid,
          elementIds: [],
          createdAt: targetDiagram?.createdAt || Date.now(),
        };
      } else {
        throw new Error("Generation returned an unsupported diagram format.");
      }

      const converted = convertToExcalidrawElements(skeletons, {
        regenerateIds: true,
      });

      if (!converted.length) throw new Error("The diagram conversion produced no Excalidraw elements.");

      // Place the complete generated batch around the current viewport centre.
      const zoom = typeof appState.zoom === "object" ? appState.zoom.value : 1;
      const viewportCenter = {
        x: -appState.scrollX + appState.width / (2 * zoom),
        y: -appState.scrollY + appState.height / (2 * zoom),
      };
      const minX = Math.min(...converted.map((el: any) => el.x));
      const minY = Math.min(...converted.map((el: any) => el.y));
      const maxX = Math.max(...converted.map((el: any) => el.x + (el.width || 0)));
      const maxY = Math.max(...converted.map((el: any) => el.y + (el.height || 0)));
      const previousTargetElements = targetDiagram
        ? sceneElements.filter((el) => targetDiagram.elementIds.includes(el.id) && !el.isDeleted)
        : [];
      const targetCenter = previousTargetElements.length
        ? {
            x: (Math.min(...previousTargetElements.map((el) => el.x)) +
                Math.max(...previousTargetElements.map((el) => el.x + (el.width || 0)))) / 2,
            y: (Math.min(...previousTargetElements.map((el) => el.y)) +
                Math.max(...previousTargetElements.map((el) => el.y + (el.height || 0)))) / 2,
          }
        : viewportCenter;
      const dx = targetCenter.x - (minX + maxX) / 2;
      const dy = targetCenter.y - (minY + maxY) / 2;
      const positioned = converted.map((el: any) => ({
        ...el,
        x: el.x + dx,
        y: el.y + dy,
      }));

      const newIds = positioned.map((el: any) => el.id);
      nextDiagram.elementIds = newIds;

      // Create appends. Edit replaces only the explicitly selected diagram.
      const replacedIds = operation === "edit" && targetDiagram
        ? new Set(targetDiagram.elementIds)
        : new Set<string>();
      const preserved = sceneElements.filter(
        (el) => !el.isDeleted && !replacedIds.has(el.id),
      );

      const nextDiagrams = operation === "edit" && targetDiagram
        ? diagrams.map((diagram) => diagram.id === targetDiagram.id ? nextDiagram : diagram)
        : [...diagrams, nextDiagram];

      excalidrawAPI.updateScene({
        elements: [...preserved, ...positioned],
        appState: {
          selectedElementIds: Object.fromEntries(newIds.map((id) => [id, true])),
        },
      });
      setDiagrams(nextDiagrams);
      setSaveMessage(
        operation === "edit"
          ? "Updated diagram — click Save to keep this"
          : "Added a new diagram — click Save to keep this",
      );
      setInstruction("");
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
          generatedDiagrams: diagrams,
          // Legacy compatibility for existing saved workspaces.
          mermaid: diagrams.slice().reverse().find((d) => d.kind === "mermaid")?.source || "",
          mermaidElementIds: diagrams.flatMap((d) => d.elementIds),
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

        <span style={{ fontSize: 11, opacity: 0.6 }}>Diagram action</span>
        <select
          className="editor-scene-picker"
          value={operation}
          onChange={(event) => setOperation(event.target.value as "create" | "edit")}
          disabled={generating}
          aria-label="Diagram action"
        >
          <option value="create">Create a new independent diagram</option>
          <option value="edit">Edit selected generated diagram</option>
        </select>
        <span style={{ fontSize: 11, opacity: 0.6 }}>
          {operation === "edit"
            ? "Select an element in the diagram you want to change"
            : "New diagrams are added independently; existing canvas content is preserved"}
        </span>
        <form
          className="editor-ai-form"
          onSubmit={(event) => {
            event.preventDefault();
            void generateDiagram();
          }}
        >
          <textarea
            className="editor-topic-input editor-instruction-input"
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            placeholder="Describe what you want to understand or create. Short prompts work too..."
            maxLength={8000}
            rows={4}
            disabled={generating}
            aria-label="Diagram or visual document request"
            aria-describedby="instruction-limit-hint"
            style={{ minHeight: 96, resize: "vertical", lineHeight: 1.45 }}
          />
          <div
            id="instruction-limit-hint"
            style={{ fontSize: 11, opacity: 0.65, textAlign: "right", marginTop: 4 }}
          >
            {instruction.length.toLocaleString()} / 8,000 characters · Short prompts are welcome
          </div>
          <button
            className="editor-generate-button"
            type="submit"
            disabled={generating || !instruction.trim() || instruction.length > 8000}
            title={operation === "create" ? "Create a new diagram" : "Edit selected diagram"}
          >
            {generating ? "..." : operation === "create" ? "Create" : "Edit"}
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
