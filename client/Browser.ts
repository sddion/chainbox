import { configure } from "./Config";
import { Http } from "../transport/Http";

const envMap = new Map<string, string>();

/**
 * Public Call for Browser (No Local transport fallback to avoid server-side deps)
 */
export async function Call(fnName: string, input?: any, options: { headers?: Record<string, string> } = {}) {
  const result = await Http.Call(fnName, input, options.headers);
  
  if (result && result.trace) {
    Inspector.push(fnName, result.trace);
  }
  
  return result;
}

/**
 * Public browser interface.
 */
const Chainbox = {
  Call,
  configure,
  env: {
    /**
     * Get an environment variable value defined in meta tags.
     */
    get: (name: string) => envMap.get(name),
    /**
     * Get all environment variables.
     */
    all: () => Object.fromEntries(envMap.entries()),
  }
};

/**
 * Robust .env parser.
 */
function parseEnv(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = text.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = trimmed.match(/^([^=:#]+)[:=](.*)$/);
    if (match) {
      const key = match[1].trim();
      let value = match[2].trim();

      // Remove quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      result[key] = value;
    }
  }
  return result;
}

/**
 * Initialize the browser client by scanning meta tags and fetching .env.
 */
async function init() {
  if (typeof document === "undefined") return;

  const metas = document.getElementsByTagName("meta");
  let envPath = "/.env";

  for (let i = 0; i < metas.length; i++) {
    const meta = metas[i];
    const name = meta.getAttribute("name");
    const content = meta.getAttribute("content");

    if (!name || !content) continue;

    if (name === "chainbox:url") {
      configure({ apiUrl: content });
    } else if (name === "chainbox:token") {
      configure({ token: content });
    } else if (name === "chainbox:env-path") {
      envPath = content;
    } else if (name.startsWith("env:")) {
      const varName = name.slice(4);
      // Meta tags are considered explicit public intent, but we still prefer PUBLIC_ prefix for consistency
      setEnv(varName, content, true);
    }
  }

  // Set up attribute-driven calls
  setupAttributes();

  // Attempt to fetch .env file
  try {
    const res = await fetch(envPath);
    if (res.ok) {
      const text = await res.text();
      const vars = parseEnv(text);
      for (const [key, val] of Object.entries(vars)) {
        // Enforce PUBLIC_ prefix for .env files to prevent secret leakage
        if (key.startsWith("PUBLIC_")) {
          setEnv(key, val);
        }
      }
    }
  } catch (err) {
    // Silent fail if .env is missing or blocked (security)
  }
}

/**
 * Helper to set env in map and CSS variables.
 */
function setEnv(name: string, value: string, force: boolean = false) {
  if (!force && !name.startsWith("PUBLIC_")) return;

  envMap.set(name, value);
  if (typeof document !== "undefined") {
    // Inject into CSS as variables: --cb-env-VAR_NAME
    document.documentElement.style.setProperty(`--cb-env-${name}`, value);
  }
}

/**
 * Declarative Attribute-Driven Calls.
 */
function setupAttributes() {
  if (typeof document === "undefined") return;

  document.addEventListener("click", async (e) => {
    const target = (e.target as HTMLElement).closest("[cb-call]") as HTMLElement;
    if (!target) return;

    e.preventDefault();

    const fnName = target.getAttribute("cb-call");
    if (!fnName) return;

    // Build input
    let input: any = {};
    const inputAttr = target.getAttribute("cb-input");
    if (inputAttr) {
      if (inputAttr.startsWith("{") || inputAttr.startsWith("[")) {
        try { input = JSON.parse(inputAttr); } catch (e) {}
      } else {
        // Assume CSS selector (e.g. form or input)
        const element = document.querySelector(inputAttr);
        if (element instanceof HTMLFormElement) {
          const formData = new FormData(element);
          input = Object.fromEntries((formData as any).entries());
        } else if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
          input = element.value;
        }
      }
    }

    // Call and handle
    const successCb = target.getAttribute("cb-on-success");
    const errorCb = target.getAttribute("cb-on-error");

    target.setAttribute("disabled", "true");
    target.classList.add("cb-loading");

    try {
      const result = await Call(fnName, input);
      if (successCb && (window as any)[successCb]) {
        (window as any)[successCb](result);
      }
      // Trigger event
      target.dispatchEvent(new CustomEvent("cb-success", { detail: result, bubbles: true }));
    } catch (err) {
      if (errorCb && (window as any)[errorCb]) {
        (window as any)[errorCb](err);
      }
      target.dispatchEvent(new CustomEvent("cb-error", { detail: err, bubbles: true }));
    } finally {
      target.removeAttribute("disabled");
      target.classList.remove("cb-loading");
    }
  });
}

/**
 * The Chainbox Inspector UI.
 * Lightweight, non-intrusive overlay for logical tracing.
 */
class ChainboxInspector {
  private container?: HTMLElement;
  private shadow?: ShadowRoot;
  private visible = false;
  private traces: { fn: string; data: any[] }[] = [];

  public init() {
    if (typeof document === "undefined") return;
    
    // Only show in dev or if explicitly enabled
    const enabled = envMap.get("CHAINBOX_INSPECTOR") === "true";
    if (!enabled && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") return;

    this.container = document.createElement("div");
    this.container.id = "chainbox-inspector";
    this.shadow = this.container.attachShadow({ mode: "open" });
    
    this.render();
    document.body.appendChild(this.container);
  }

  public push(fn: string, trace: any[]) {
    this.traces.unshift({ fn, data: trace });
    if (this.visible) this.update();
  }

  private toggle() {
    this.visible = !this.visible;
    this.update();
  }

  private render() {
    if (!this.shadow) return;
    this.shadow.innerHTML = `
      <style>
        :host {
          position: fixed;
          bottom: 20px;
          right: 20px;
          z-index: 100000;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        }
        .bubble {
          width: 40px;
          height: 40px;
          background: #111;
          color: #fff;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          font-weight: bold;
          font-size: 18px;
          transition: transform 0.2s;
        }
        .bubble:hover { transform: scale(1.1); }
        .panel {
          position: absolute;
          bottom: 50px;
          right: 0;
          width: 350px;
          max-height: 500px;
          background: #fff;
          border: 1px solid #ddd;
          border-radius: 8px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.15);
          display: none;
          flex-direction: column;
          overflow: hidden;
        }
        .panel.open { display: flex; }
        .header {
          padding: 12px;
          background: #f8f8f8;
          border-bottom: 1px solid #ddd;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .title { font-weight: bold; font-size: 14px; margin: 0; }
        .content {
          padding: 0;
          overflow-y: auto;
          flex: 1;
        }
        .trace-item {
          padding: 10px 12px;
          border-bottom: 1px solid #eee;
          cursor: pointer;
        }
        .trace-item:hover { background: #fcfcfc; }
        .fn-name { font-weight: bold; font-size: 13px; color: #333; }
        .fn-meta { font-size: 11px; color: #888; margin-top: 2px; }
        .details {
          padding: 8px;
          background: #fafafa;
          font-family: monospace;
          font-size: 11px;
          display: none;
          border-radius: 4px;
          margin-top: 8px;
        }
        .details.open { display: block; }
      </style>
      <div class="bubble" id="toggle">C</div>
      <div class="panel" id="panel">
        <div class="header">
          <h3 class="title">Chainbox Inspector</h3>
        </div>
        <div class="content" id="content">
          <div style="padding: 20px; text-align: center; color: #888; font-size: 13px;">No traces yet. Trigger a cb-call to see logs.</div>
        </div>
      </div>
    `;

    this.shadow.getElementById("toggle")?.addEventListener("click", () => this.toggle());
  }

  private update() {
    if (!this.shadow) return;
    const panel = this.shadow.getElementById("panel");
    const content = this.shadow.getElementById("content");
    if (!panel || !content) return;

    if (this.visible) panel.classList.add("open");
    else panel.classList.remove("open");

    if (this.traces.length > 0) {
      content.innerHTML = this.traces.map((t, i) => `
        <div class="trace-item" data-index="${i}">
          <div class="fn-name">${t.fn}</div>
          <div class="fn-meta">${t.data[0].durationMs}ms • status: ${t.data[0].status}</div>
          <div class="details" id="details-${i}">${JSON.stringify(t.data[0], null, 2)}</div>
        </div>
      `).join("");

      content.querySelectorAll(".trace-item").forEach(item => {
        item.addEventListener("click", () => {
          const index = item.getAttribute("data-index");
          const details = this.shadow?.getElementById(`details-${index}`);
          details?.classList.toggle("open");
        });
      });
    }
  }
}

const Inspector = new ChainboxInspector();

// Auto-init on script load
init();

// Also listen for DOMContentLoaded to capture late meta tags
if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", () => {
      init();
      Inspector.init();
    });
}

// Expose globally
if (typeof window !== "undefined") {
  (window as any).Chainbox = Chainbox;
}

export default Chainbox;
export { Chainbox };
