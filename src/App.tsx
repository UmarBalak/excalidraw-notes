import { useEffect, useState } from "react";
import {
  Excalidraw,
  convertToExcalidrawElements,
} from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import "./App.css";
import "./AIWorkspacePanel.css";
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


type PendingVisual = {
  elements: any[];
  diagram: GeneratedDiagram;
  replacedIds: string[];
  operation: "create" | "edit";
};

type ChatMessage = { role: "user" | "assistant"; text: string };

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

function DiagramPreview({ elements }: { elements: any[] }) {
  const visible = elements.filter((element) => !element.isDeleted);
  if (!visible.length) return null;
  const minX = Math.min(...visible.map((element) => element.x || 0));
  const minY = Math.min(...visible.map((element) => element.y || 0));
  const maxX = Math.max(...visible.map((element) => (element.x || 0) + Math.max(element.width || 0, 1)));
  const maxY = Math.max(...visible.map((element) => (element.y || 0) + Math.max(element.height || 0, 1)));
  const width = Math.max(maxX - minX, 1);
  const height = Math.max(maxY - minY, 1);
  const pad = Math.max(Math.max(width, height) * 0.035, 18);
  const wrapText = (value: string, maxChars: number) => {
    const words = value.split(/\s+/);
    const lines: string[] = [];
    let line = "";
    words.forEach((word) => {
      const next = line ? `${line} ${word}` : word;
      if (line && next.length > maxChars) { lines.push(line); line = word; }
      else line = next;
    });
    if (line) lines.push(line);
    return lines.slice(0, 8);
  };

  return (
    <svg className="ai-preview-svg" viewBox={`${minX - pad} ${minY - pad} ${width + pad * 2} ${height + pad * 2}`} role="img" aria-label="Approximate preview of the generated Excalidraw visual">
      <defs><marker id="ai-preview-arrowhead" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6" fill="none" stroke="#737783" strokeWidth="1" /></marker></defs>
      {visible.filter((element) => element.type === "arrow" || element.type === "line").map((element) => {
        const points = Array.isArray(element.points) && element.points.length > 1
          ? element.points.map((point: number[]) => `${(element.x || 0) + point[0]},${(element.y || 0) + point[1]}`).join(" ")
          : `${element.x || 0},${element.y || 0} ${(element.x || 0) + (element.width || 0)},${(element.y || 0) + (element.height || 0)}`;
        return <polyline key={element.id} points={points} fill="none" stroke={element.strokeColor || "#737783"} strokeWidth={Math.max(element.strokeWidth || 1.5, 1)} markerEnd={element.type === "arrow" ? "url(#ai-preview-arrowhead)" : undefined} />;
      })}
      {visible.filter((element) => ["rectangle", "ellipse", "diamond"].includes(element.type)).map((element) => {
        const x = element.x || 0, y = element.y || 0, w = Math.max(element.width || 1, 1), h = Math.max(element.height || 1, 1);
        const fill = element.backgroundColor && element.backgroundColor !== "transparent" ? element.backgroundColor : "#ffffff";
        const stroke = element.strokeColor || "#555966";
        if (element.type === "ellipse") return <ellipse key={element.id} cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} fill={fill} stroke={stroke} strokeWidth={Math.max(element.strokeWidth || 1.5, 1)} />;
        if (element.type === "diamond") return <polygon key={element.id} points={`${x + w / 2},${y} ${x + w},${y + h / 2} ${x + w / 2},${y + h} ${x},${y + h / 2}`} fill={fill} stroke={stroke} strokeWidth={Math.max(element.strokeWidth || 1.5, 1)} />;
        return <rect key={element.id} x={x} y={y} width={w} height={h} rx="8" fill={fill} stroke={stroke} strokeWidth={Math.max(element.strokeWidth || 1.5, 1)} />;
      })}
      {visible.filter((element) => element.type === "text" && typeof element.text === "string").map((element) => {
        const fontSize = Math.max(Math.min(element.fontSize || 16, 30), 8);
        const lines = wrapText(element.text, Math.max(8, Math.floor((element.width || 120) / (fontSize * 0.58))));
        return <text key={element.id} x={element.x || 0} y={(element.y || 0) + fontSize} fill={element.strokeColor || "#343741"} fontSize={fontSize} fontFamily="Arial, sans-serif" textAnchor={element.textAlign === "center" ? "middle" : "start"}>{lines.map((line, index) => <tspan key={index} x={element.textAlign === "center" ? (element.x || 0) + (element.width || 0) / 2 : element.x || 0} dy={index === 0 ? 0 : fontSize * 1.25}>{line}</tspan>)}</text>;
      })}
    </svg>
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
  const [aiOpen, setAiOpen] = useState(false);
  const [pendingVisual, setPendingVisual] = useState<PendingVisual | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [showWorkspaceSettings, setShowWorkspaceSettings] = useState(false);

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

  useEffect(() => {
    if (!aiOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !generating) setAiOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [aiOpen, generating]);

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
    setPendingVisual(null);
    setChatMessages((messages) => [...messages, { role: "user", text: targetInstruction }]);

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
        ? targetDiagram.elementIds
        : [];

      setPendingVisual({
        elements: positioned,
        diagram: nextDiagram,
        replacedIds,
        operation,
      });
      setChatMessages((messages) => [...messages, {
        role: "assistant",
        text: `${positioned.length} elements generated. Review the preview, then insert it onto your canvas.`,
      }]);
      setInstruction("");
    } catch (generationError) {
      console.error("[API] POST /api/generate failed", generationError);
      const message = generationError instanceof Error
        ? generationError.message
        : "Unable to generate diagram.";
      setError(message);
      setChatMessages((messages) => [...messages, { role: "assistant", text: `Generation failed: ${message}` }]);
    } finally {
      setGenerating(false);
    }
  };

  const insertPendingVisual = () => {
    if (!excalidrawAPI || !pendingVisual) return;
    const sceneElements = excalidrawAPI.getSceneElements();
    const replacedIds = new Set(pendingVisual.replacedIds);
    const preserved = sceneElements.filter((element) => !element.isDeleted && !replacedIds.has(element.id));
    const nextDiagrams = pendingVisual.operation === "edit"
      ? diagrams.map((diagram) => diagram.id === pendingVisual.diagram.id ? pendingVisual.diagram : diagram)
      : [...diagrams, pendingVisual.diagram];
    const ids = pendingVisual.elements.map((element) => element.id);
    excalidrawAPI.updateScene({
      elements: [...preserved, ...pendingVisual.elements],
      appState: { selectedElementIds: Object.fromEntries(ids.map((id) => [id, true])) },
    });
    setDiagrams(nextDiagrams);
    setSaveMessage(pendingVisual.operation === "edit" ? "Updated visual — save to keep it" : "Visual added — save to keep it");
    setPendingVisual(null);
    setAiOpen(false);
  };

  const startNewChat = () => {
    setInstruction("");
    setError("");
    setPendingVisual(null);
    setChatMessages([]);
    setOperation("create");
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
      <button
        type="button"
        className="ai-launcher"
        onClick={() => setAiOpen(true)}
        aria-label="Open AI visual workspace"
        title="Create with AI"
      >
        <span aria-hidden="true">✦</span><span>AI</span>
      </button>

      {aiOpen && (
        <div className="ai-modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !generating) setAiOpen(false);
        }}>
          <section className="ai-modal" role="dialog" aria-modal="true" aria-labelledby="ai-modal-title">
            <header className="ai-modal-header">
              <div className="ai-modal-heading">
                <span className="ai-panel-mark" aria-hidden="true">✦</span>
                <div>
                  <h2 id="ai-modal-title">Text to visual</h2>
                  <p>Describe an idea. The AI chooses the right visual format.</p>
                </div>
              </div>
              <div className="ai-modal-header-actions">
                <button type="button" className="ai-secondary-button" onClick={startNewChat} disabled={generating}>＋ New chat</button>
                <button type="button" className="ai-icon-button" onClick={() => setShowWorkspaceSettings((value) => !value)} aria-label="Workspace settings" title="Workspace settings">⚙</button>
                <button type="button" className="ai-icon-button" onClick={() => setAiOpen(false)} disabled={generating} aria-label="Close AI workspace" title="Close">×</button>
              </div>
            </header>

            {showWorkspaceSettings && (
              <div className="ai-workspace-settings">
                <label className="ai-field">
                  <span className="ai-field-label">Workspace name</span>
                  <input className="ai-text-input" value={topic} onChange={(event) => setTopic(event.target.value)} maxLength={180} />
                </label>
                <label className="ai-field">
                  <span className="ai-field-label">Open saved workspace</span>
                  <select className="ai-select" value={scenes.some((scene) => scene.topic === topic) ? topic : ""}
                    onChange={(event) => { if (event.target.value) { loadScene(event.target.value); setAiOpen(false); } }} disabled={loadingScene || generating}>
                    <option value="">Choose a workspace…</option>
                    {scenes.map((scene) => <option key={scene.topic} value={scene.topic}>{scene.topic}</option>)}
                  </select>
                </label>
                <button className="ai-secondary-button" type="button" onClick={() => void saveScene()} disabled={saving || !topic.trim()}>{saving ? "Saving…" : "Save workspace"}</button>
              </div>
            )}

            <div className="ai-modal-body">
              <div className="ai-chat-pane">
                <div className="ai-chat-toolbar">
                  <div className="ai-operation-switch" role="group" aria-label="Generation action">
                    <button type="button" className={operation === "create" ? "ai-operation-option is-active" : "ai-operation-option"} onClick={() => setOperation("create")} disabled={generating}>Create new</button>
                    <button type="button" className={operation === "edit" ? "ai-operation-option is-active" : "ai-operation-option"} onClick={() => setOperation("edit")} disabled={generating}>Edit selection</button>
                  </div>
                  <span className="ai-usage-status">{saveMessage}</span>
                </div>
                <div className="ai-chat-messages" aria-live="polite">
                  {chatMessages.length === 0 ? (
                    <div className="ai-empty-state">
                      <div className="ai-empty-icon">✦</div>
                      <h3>What are we creating today?</h3>
                      <p>Try a short idea or describe exactly what you need. Comparisons, diagrams, explanations and visual documents are all supported.</p>
                      <div className="ai-prompt-examples">
                        {["Compare LLMs and SLMs", "Explain transformers", "RAG architecture", "Write an article on inference engineering"].map((example) => (
                          <button key={example} type="button" className="ai-example-chip" disabled={generating} onClick={() => setInstruction(example)}>{example}</button>
                        ))}
                      </div>
                    </div>
                  ) : chatMessages.map((message, index) => (
                    <div key={`${index}-${message.role}`} className={`ai-chat-message is-${message.role}`}>
                      <span className="ai-message-avatar">{message.role === "user" ? "You" : "✦ AI"}</span>
                      <p>{message.text}</p>
                    </div>
                  ))}
                  {generating && <div className="ai-generating-line"><span className="ai-button-spinner" /> Thinking through the best visual structure…</div>}
                  {error && <div className="ai-inline-error" role="alert">{error}</div>}
                </div>
                <form className="ai-composer" onSubmit={(event) => { event.preventDefault(); void generateDiagram(); }}>
                  <textarea value={instruction} onChange={(event) => setInstruction(event.target.value)}
                    placeholder={operation === "edit" ? "Describe what to change in the selected visual…" : "Describe the visual you want to create…"}
                    maxLength={8000} rows={3} disabled={generating} aria-label="Describe what you want to create" />
                  <div className="ai-composer-footer">
                    <span>{instruction.length.toLocaleString()} / 8,000</span>
                    <button type="submit" className="ai-send-button" disabled={generating || !instruction.trim()}>{generating ? "Generating…" : "Generate ↗"}</button>
                  </div>
                </form>
              </div>

              <aside className="ai-preview-pane">
                <div className="ai-preview-heading">
                  <div><h3>Canvas preview</h3><p>{pendingVisual ? "Review before inserting" : "Your generated visual will appear here"}</p></div>
                  {pendingVisual && <span className="ai-ready-pill">Ready</span>}
                </div>
                {pendingVisual ? (
                  <div className="ai-preview-content">
                    <div className="ai-preview-artboard">
                      <div className="ai-preview-mini-title">{pendingVisual.diagram.kind === "mermaid" ? "Diagram preview" : "Visual composition"}</div>
                      <DiagramPreview elements={pendingVisual.elements} />
                    </div>
                    <div className="ai-preview-stats"><span>{pendingVisual.elements.length} elements</span><span>{pendingVisual.elements.filter((element) => element.type === "arrow").length} connectors</span></div>
                    <p className="ai-preview-note">Preview is an approximate rendering for review. Insert to place the complete editable Excalidraw elements on your canvas.</p>
                  </div>
                ) : (
                  <div className="ai-preview-placeholder"><div className="ai-placeholder-sparkle">✧</div><strong>Nothing generated yet</strong><span>Enter a prompt and generate. You can review the result here before adding it to the canvas.</span></div>
                )}
              </aside>
            </div>
            <footer className="ai-modal-footer">
              <span className="ai-footer-hint">{pendingVisual ? "Your existing canvas stays untouched until you insert." : "Short prompts welcome · Maximum 8,000 characters"}</span>
              <div className="ai-footer-actions">
                <button type="button" className="ai-secondary-button" onClick={() => setAiOpen(false)} disabled={generating}>Close</button>
                <button type="button" className="ai-insert-button" onClick={insertPendingVisual} disabled={!pendingVisual || generating}>Insert on canvas <span>→</span></button>
              </div>
            </footer>
          </section>
        </div>
      )}

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
