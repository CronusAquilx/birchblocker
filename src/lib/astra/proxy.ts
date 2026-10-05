import type { Prefs } from "./prefs";

export const DEFAULT_WISP = "wss://wisp.mercurywork.shop/";
export const WISP_FALLBACKS = [DEFAULT_WISP, "wss://anura.pro/", "wss://definitelyscience.com/wisp/"];

function probe(url: string, ms = 5000): Promise<boolean> {
  return new Promise((resolve) => {
    let ws: WebSocket;
    try { ws = new WebSocket(url); } catch { return resolve(false); }
    const t = setTimeout(() => { try { ws.close(); } catch {} resolve(false); }, ms);
    ws.onopen = () => { clearTimeout(t); ws.close(); resolve(true); };
    ws.onerror = () => { clearTimeout(t); resolve(false); };
  });
}

async function pickWisp(custom: string): Promise<string> {
  const list = custom ? [custom, ...WISP_FALLBACKS] : WISP_FALLBACKS;
  const results = await Promise.all(list.map((u) => probe(u)));
  const i = results.findIndex(Boolean);
  if (i < 0) throw new Error("No Wisp server reachable from this network");
  return list[i]!;
}

type Controller = import("@mercuryworkshop/scramjet-controller").Controller;
type Frame = import("@mercuryworkshop/scramjet-controller").Frame;

let cache: { key: string; promise: Promise<Controller> } | null = null;
let scriptsPromise: Promise<void> | null = null;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

function loadProxyScripts(): Promise<void> {
  scriptsPromise ??= (async () => {
    await loadScript("/scramjet/scramjet.js");
    await loadScript("/scramjet/controller.api.js");
  })();
  return scriptsPromise;
}

function waitForActive(reg: ServiceWorkerRegistration): Promise<ServiceWorker> {
  if (reg.active) return Promise.resolve(reg.active);
  const sw = reg.installing ?? reg.waiting;
  if (!sw) return Promise.reject(new Error("Proxy worker failed to start"));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Proxy worker timed out")), 30000);
    sw.addEventListener("statechange", () => {
      if (sw.state === "activated") { clearTimeout(timer); resolve(sw); }
      if (sw.state === "redundant") { clearTimeout(timer); reject(new Error("Proxy worker was rejected")); }
    });
  });
}

async function makeTransport(transport: Prefs["transport"], custom: string): Promise<any> {
  if (transport !== "astra") {
    const wisp = await pickWisp(custom).catch(() => null);
    if (wisp) {
      try {
        const t = transport === "libcurl"
          ? new (await import("@mercuryworkshop/libcurl-transport")).default({ wisp })
          : new (await import("@mercuryworkshop/epoxy-transport")).default({ wisp });
        await t.init();
        return t;
      } catch { /* fall through to the Astra relay */ }
    }
  }
  const { AstraRelayTransport } = await import("./relay-transport");
  const t = new AstraRelayTransport();
  await t.init();
  return t;
}

async function buildController(transport: Prefs["transport"], custom: string): Promise<Controller> {
  await loadProxyScripts();
  const { Controller } = (globalThis as Record<string, any>)["$scramjetController"] as {
    Controller: new (init: any) => Controller;
  };

  const reg = await navigator.serviceWorker.register("/scramjet/sw.js", { scope: "/scramjet/p/" });
  const [sw, t] = await Promise.all([waitForActive(reg), makeTransport(transport, custom)]);

  return new Controller({
    serviceworker: sw,
    transport: t,
    config: {
      prefix: "/scramjet/p/",
      scramjetPath: "/scramjet/scramjet.js",
      injectPath: "/scramjet/controller.inject.js",
      wasmPath: "/scramjet/scramjet.wasm",
    },
  });
}

export function getProxyController(prefs: Prefs): Promise<Controller> {
  const key = `${prefs.transport}|${prefs.wisp}`;
  if (!cache || cache.key !== key) {
    cache = { key, promise: buildController(prefs.transport, prefs.wisp.trim()) };
    cache.promise.catch(() => { if (cache?.key === key) cache = null; });
  }
  return cache.promise;
}

export async function openProxied(iframe: HTMLIFrameElement, url: string, prefs: Prefs): Promise<Frame> {
  const controller = await getProxyController(prefs);
  // Re-attach to the proxy worker each time: the browser stops idle workers,
  // which wipes their routing table and makes proxied pages 404.
  const c = controller as any;
  c.guardServiceWorkerRevive = false;
  try { c.setupMessagePort?.(); } catch { /* ignore */ }
  await new Promise((r) => setTimeout(r, 150));
  const frame = controller.createFrame(iframe);
  frame.go(url);
  return frame;
}
