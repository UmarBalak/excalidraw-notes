import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import "./Landing.css";

type Provider = "github" | "aad";

// Static Web Apps built-in providers. "aad" is Microsoft Entra ID.
const PROVIDERS: Record<Provider, { name: string; url: string }> = {
  github: { name: "GitHub", url: "/.auth/login/github?post_login_redirect_uri=/editor" },
  aad: { name: "Microsoft", url: "/.auth/login/aad?post_login_redirect_uri=/editor" },
};

type Theme = "light" | "dark";
const THEME_KEY = "ai-diagram-landing-theme";

function initialTheme(): Theme {
  try {
    const saved = window.localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* storage can be unavailable; fall through to the system setting */
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

const delay = (seconds: number) => ({ "--d": `${seconds}s` }) as CSSProperties;

function GitHubIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.04-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a10.9 10.9 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.42-2.7 5.4-5.27 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" />
    </svg>
  );
}

function BrandMark() {
  return (
    <svg width="30" height="30" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="3" width="10" height="8" rx="2" />
      <rect x="16" y="17" width="10" height="8" rx="2" />
      <path d="M12 7h6a3 3 0 0 1 3 3v7" />
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#f25022" d="M2 2h9.5v9.5H2z" />
      <path fill="#7fba00" d="M12.5 2H22v9.5h-9.5z" />
      <path fill="#00a4ef" d="M2 12.5h9.5V22H2z" />
      <path fill="#ffb900" d="M12.5 12.5H22V22h-9.5z" />
    </svg>
  );
}

function SignInButton({
  provider,
  loggingIn,
  onSignIn,
  large,
  ghost,
}: {
  provider: Provider;
  loggingIn: Provider | null;
  onSignIn: (provider: Provider) => void;
  large?: boolean;
  ghost?: boolean;
}) {
  const busy = loggingIn === provider;
  const classes = ["lp-btn", large && "lp-btn--lg", ghost && "lp-btn--ghost"]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      type="button"
      className={classes}
      onClick={() => onSignIn(provider)}
      disabled={loggingIn !== null}
      aria-busy={busy}
    >
      {busy ? (
        <span className="lp-spinner" aria-hidden="true" />
      ) : provider === "github" ? (
        <GitHubIcon />
      ) : (
        <MicrosoftIcon />
      )}
      {busy ? `Opening ${PROVIDERS[provider].name}…` : `Sign in with ${PROVIDERS[provider].name}`}
    </button>
  );
}

const TOOLS = [
  "M5 3l14 7-6 2-2 6z",
  "M4 6h16v12H4z",
  "M12 3l9 9-9 9-9-9z",
  "M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16z",
  "M5 19L19 5M10 5h9v9",
  "M5 19L19 5",
  "M4 20l4-1 11-11-3-3L5 16z",
  "M6 6h12M12 6v13",
];

type Box = { key: string; label: string; x: number; y: number; w: number; h: number; color: string; t: number; diamond?: boolean };

// Two flows sharing one vector store: ingestion (top) and query (bottom).
const BOXES: Box[] = [
  { key: "docs", label: "Docs", x: 44, y: 62, w: 124, h: 56, color: "c-white", t: 2.5 },
  { key: "chunk", label: "Chunker", x: 200, y: 62, w: 124, h: 56, color: "c-blue", t: 2.9 },
  { key: "embed", label: "Embedder", x: 356, y: 62, w: 124, h: 56, color: "c-blue", t: 3.3 },
  { key: "user", label: "User", x: 44, y: 306, w: 124, h: 56, color: "c-white", t: 4.2 },
  { key: "api", label: "API", x: 200, y: 306, w: 124, h: 56, color: "c-red", t: 4.6 },
  { key: "retr", label: "Retriever", x: 356, y: 306, w: 124, h: 56, color: "c-blue", t: 5.0 },
  { key: "rank", label: "Reranker", x: 512, y: 296, w: 124, h: 76, color: "c-orange", t: 6.0, diamond: true },
  { key: "llm", label: "LLM", x: 668, y: 306, w: 124, h: 56, color: "c-violet", t: 6.4 },
  { key: "ans", label: "Answer", x: 824, y: 306, w: 100, h: 56, color: "c-yellow", t: 6.8 },
];

const EDGES: { d: string; head: string; t: number }[] = [
  { d: "M172 90 H196", head: "M189 84 L196 90 L189 96", t: 2.7 },
  { d: "M328 90 H352", head: "M345 84 L352 90 L345 96", t: 3.1 },
  { d: "M484 90 H820 V148", head: "M813 141 L820 149 L827 141", t: 3.5 },
  { d: "M172 334 H196", head: "M189 328 L196 334 L189 340", t: 4.4 },
  { d: "M328 334 H352", head: "M345 328 L352 334 L345 340", t: 4.8 },
  { d: "M418 304 V200 H724", head: "M717 194 L725 200 L717 206", t: 5.2 },
  { d: "M724 226 H574 V294", head: "M567 287 L574 295 L581 287", t: 5.7 },
  { d: "M640 334 H664", head: "M657 328 L664 334 L657 340", t: 6.2 },
  { d: "M796 334 H820", head: "M813 328 L820 334 L813 340", t: 6.6 },
  { d: "M874 366 V392 H106 V368", head: "M99 375 L106 367 L113 375", t: 7.1 },
];

/* A scripted, CSS-only preview of the real flow: prompt -> diagram -> insert. */
function HeroDemo() {
  return (
    <div
      className="lp-demo"
      role="img"
      aria-label="Example: the prompt “RAG system with ingestion and query flows” becomes an editable diagram with an ingestion flow, a shared vector database and a query flow, ready to insert on the canvas."
    >
      <div className="lp-demo-top" aria-hidden="true">
        <span className="lp-dots"><i /><i /><i /></span>
        <div className="lp-tools">
          {TOOLS.map((d, i) => (
            <span key={d} className={i === 0 ? "lp-tool is-on" : "lp-tool"}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
            </span>
          ))}
          <span className="lp-tool-ai">✦ AI</span>
        </div>
        <span className="lp-insert">Insert on canvas</span>
      </div>

      <div className="lp-canvas" aria-hidden="true">
        <svg viewBox="0 0 960 424">
          <defs>
            <filter id="lp-rough" x="-3%" y="-5%" width="106%" height="110%">
              <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="2" seed="7" result="n" />
              <feDisplacementMap in="SourceGraphic" in2="n" scale="2.4" />
            </filter>
          </defs>

          <g filter="url(#lp-rough)">
            <g className="lp-lane-g" style={delay(2.2)}>
              <rect className="lp-lane" x="20" y="20" width="680" height="122" rx="18" />
            </g>
            <g className="lp-lane-g" style={delay(2.3)}>
              <rect className="lp-lane" x="20" y="270" width="920" height="140" rx="18" />
            </g>

            {EDGES.map((edge) => (
              <g key={edge.d}>
                <path className="lp-edge" pathLength="1" d={edge.d} style={delay(edge.t)} />
                <path className="lp-head" d={edge.head} style={delay(edge.t)} />
              </g>
            ))}

            {BOXES.map((box) => (
              <g key={box.key} className="lp-node" style={delay(box.t)}>
                {box.diamond ? (
                  <polygon
                    className={`lp-shape ${box.color}`}
                    points={`${box.x + box.w / 2},${box.y} ${box.x + box.w},${box.y + box.h / 2} ${box.x + box.w / 2},${box.y + box.h} ${box.x},${box.y + box.h / 2}`}
                  />
                ) : (
                  <rect className={`lp-shape ${box.color}`} x={box.x} y={box.y} width={box.w} height={box.h} rx="12" />
                )}
              </g>
            ))}

            <g className="lp-node" style={delay(3.9)}>
              <path className="lp-shape c-green" d="M730 162 A90 12 0 0 1 910 162 V238 A90 12 0 0 1 730 238 Z" />
              <path className="lp-rim" d="M730 162 A90 12 0 0 0 910 162" />
            </g>
          </g>

          <text className="lp-lane-label lp-lane-g" style={delay(2.2)} x="40" y="48">Ingestion</text>
          <text className="lp-lane-label lp-lane-g" style={delay(2.3)} x="40" y="296">Query</text>

          {BOXES.map((box) => (
            <text key={box.key} className="lp-label lp-node" style={delay(box.t)} x={box.x + box.w / 2} y={box.y + box.h / 2 + 7}>
              {box.label}
            </text>
          ))}
          <text className="lp-label lp-node" style={delay(3.9)} x="820" y="212">Vector DB</text>

          <text className="lp-elabel" style={delay(5.2)} x="570" y="190">query embedding</text>
          <text className="lp-elabel" style={delay(5.7)} x="650" y="248">top-k chunks</text>
          <text className="lp-elabel" style={delay(7.1)} x="480" y="386">feedback</text>

          <g className="lp-sticky" style={delay(7.4)} transform="rotate(-2 160 192)">
            <rect className="lp-sticky-shape" x="60" y="162" width="200" height="60" rx="4" />
            <text className="lp-sticky-text" x="160" y="187">chunk + embed once,</text>
            <text className="lp-sticky-text" x="160" y="207">runs offline</text>
          </g>
        </svg>
      </div>

      <div className="lp-prompt" aria-hidden="true">
        <span className="lp-prompt-text">
          <span className="lp-typed">RAG system with ingestion and query flows</span>
          <span className="lp-caret" />
        </span>
        <span className="lp-prompt-btn">Generate</span>
      </div>
    </div>
  );
}

const ICON_PROPS = {
  width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
  strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true,
} as const;

const FEATURES = [
  {
    title: "Text to diagram",
    body: "Describe an architecture, comparison, or process. The AI picks a layout and shows a preview before anything touches your canvas.",
    icon: <svg {...ICON_PROPS}><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" /></svg>,
  },
  {
    title: "Edit by selection",
    body: "Select a generated diagram and ask for a change. Only that diagram is replaced. The rest of your canvas stays as it is.",
    icon: <svg {...ICON_PROPS}><path d="M4 4h10v10H4z" /><path d="M13 13l7 3-3 1-1 3z" /></svg>,
  },
  {
    title: "Saved workspaces",
    body: "Name a workspace, save it, and reopen it from the editor. Generated diagrams stay editable by prompt.",
    icon: <svg {...ICON_PROPS}><path d="M5 4h11l3 3v13H5z" /><path d="M8 4v5h7V4M8 20v-6h8v6" /></svg>,
  },
  {
    title: "Still just Excalidraw",
    body: "Every element is a normal Excalidraw element. Draw, move, restyle, and export the way you already do.",
    icon: <svg {...ICON_PROPS}><path d="M4 20l4-1 11-11-3-3L5 16z" /><path d="M14 6l3 3" /></svg>,
  },
];

function ThemeToggle({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  const dark = theme === "dark";
  return (
    <button
      type="button"
      className="lp-theme"
      onClick={onToggle}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      title={dark ? "Light theme" : "Dark theme"}
    >
      {dark ? (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" />
        </svg>
      )}
    </button>
  );
}

const CREDIT_FROM = [
  "The infinite canvas and drawing tools",
  "The hand-drawn look and shape library",
  "The element format, import and export",
  "Mermaid to Excalidraw conversion",
];
const CREDIT_ADDED = [
  "Text to diagram, with a preview step",
  "Select a generated diagram to edit it",
  "Workspaces saved to our own database",
  "GitHub sign-in around the editor",
];

export default function LandingPage() {
  const [loggingIn, setLoggingIn] = useState<Provider | null>(null);
  const [theme, setTheme] = useState<Theme>(initialTheme);

  const toggleTheme = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      /* ignore: the choice just won't persist */
    }
  };

  // Coming back via the browser's back button restores this page from cache
  // with loggingIn still true. Reset it so the button works again.
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) setLoggingIn(null);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  const signIn = (provider: Provider) => {
    if (loggingIn) return;
    setLoggingIn(provider);
    window.location.assign(PROVIDERS[provider].url);
  };

  return (
    <main className="lp" data-theme={theme}>
      <div className="lp-wrap">
        <nav className="lp-nav" aria-label="Main">
          <a className="lp-brand" href="/" aria-label="Layr home">
            <BrandMark />
            Layr
          </a>
          <div className="lp-nav-right">
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
            <a className="lp-btn lp-btn--ghost" href="#signin">Sign in</a>
          </div>
        </nav>

        <section className="lp-hero">
          <h1>
            <span className="lp-hand">Describe a system.</span>
            <span className="lp-sans">
              Get a diagram you can{" "}
              <span className="lp-sel">
                edit
                <i aria-hidden="true" /><i aria-hidden="true" /><i aria-hidden="true" /><i aria-hidden="true" />
              </span>
            </span>
          </h1>
          <p className="lp-lede">
            Type what you want to see. AI draws it on an Excalidraw canvas,
            you review the preview, then insert it as normal, editable shapes.
          </p>
          <div className="lp-actions" id="signin">
            <SignInButton provider="github" loggingIn={loggingIn} onSignIn={signIn} large />
            <SignInButton provider="aad" loggingIn={loggingIn} onSignIn={signIn} large ghost />
          </div>
          <br />
          <p className="lp-note">
            Access is limited to invited accounts. <a href="#how">See how it works</a>
          </p>
        </section>

        <section className="lp-stage" id="how">
          <HeroDemo />
        </section>

        <section className="lp-features" aria-labelledby="lp-features-title">
          <h2 id="lp-features-title">Excalidraw, with an AI layer on top</h2>
          <br />
          <ul className="lp-list">
            {FEATURES.map((feature) => (
              <li key={feature.title}>
                <span className="lp-icon">{feature.icon}</span>
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="lp-credit" aria-labelledby="lp-credit-title">
          <div className="lp-credit-card">
            <div className="lp-credit-intro">
              <h2 id="lp-credit-title">Built on open source</h2>
              <p>
                This is an independent project built on the open-source
                Excalidraw library (MIT License). The canvas, tools and
                hand-drawn look are Excalidraw’s. Looking for the official,
                hosted product with AI features? That is Excalidraw+, made by
                the Excalidraw team.
              </p>
              <div className="lp-credit-links">
                <a href="https://github.com/excalidraw/excalidraw" target="_blank" rel="noopener noreferrer">Excalidraw on GitHub</a>
                <a href="https://plus.excalidraw.com" target="_blank" rel="noopener noreferrer">Excalidraw+</a>
                <a href="https://github.com/excalidraw/excalidraw/blob/master/LICENSE" target="_blank" rel="noopener noreferrer">MIT License</a>
              </div>
            </div>
            <div className="lp-credit-col">
              <h3>From Excalidraw</h3>
              <ul>
                {CREDIT_FROM.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
            <div className="lp-credit-col is-added">
              <h3>Built in this project</h3>
              <ul>
                {CREDIT_ADDED.map((item) => <li key={item}>{item}</li>)}
              </ul>
              <p className="lp-credit-note">
                Excalidraw+ offers similar features. These are our own
                implementations on the open-source library.
              </p>
            </div>
          </div>
        </section>

        <section className="lp-cta">
          <h2>Open your canvas.</h2>
          <div className="lp-actions">
            <SignInButton provider="github" loggingIn={loggingIn} onSignIn={signIn} large />
            <SignInButton provider="aad" loggingIn={loggingIn} onSignIn={signIn} large ghost />
          </div>
        </section>

        <footer className="lp-foot">
          Layr is an independent project built on{" "}
          <a href="https://github.com/excalidraw/excalidraw" target="_blank" rel="noopener noreferrer">Excalidraw</a>{" "}
          (MIT License). Not affiliated with or endorsed by Excalidraw.
        </footer>
      </div>
    </main>
  );
}