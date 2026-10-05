import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { handleLiveRequest } from "./lib/live-relay.server";
import { authenticateRequest } from "./lib/astra/api-user.server";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

type WS = WebSocket & { accept(): void };
declare const WebSocketPair: { new (): { 0: WS; 1: WS } };

/** Relays a live (WebSocket) connection for proxied sites like Discord. */
async function proxyWebSocket(url: URL): Promise<Response> {
  const target = url.searchParams.get("url") ?? "";
  if (!/^wss?:\/\//i.test(target)) return new Response("Bad url", { status: 400 });
  const protocols = url.searchParams.get("protocols") ?? "";
  const headers: Record<string, string> = { Upgrade: "websocket", origin: url.searchParams.get("origin") ?? new URL(target.replace(/^ws/, "http")).origin, "user-agent": "Mozilla/5.0" };
  if (protocols) headers["sec-websocket-protocol"] = protocols;
  const res = await fetch(target.replace(/^ws/, "http"), { headers });
  const up = (res as Response & { webSocket?: WS | null }).webSocket;
  if (!up) return new Response("Upstream refused", { status: 502 });
  up.accept();
  const pair = new WebSocketPair();
  const browser = pair[1];
  browser.accept();
  browser.send(JSON.stringify({ __astra: "open", protocol: res.headers.get("sec-websocket-protocol") ?? "" }));
  const safe = (c: number) => (c >= 1000 && c < 5000 && c !== 1005 && c !== 1006 ? c : 1000);
  browser.addEventListener("message", (e) => { try { up.send(e.data); } catch {} });
  up.addEventListener("message", (e) => { try { browser.send(e.data); } catch {} });
  browser.addEventListener("close", (e) => { try { up.close(safe(e.code), e.reason); } catch {} });
  up.addEventListener("close", (e) => { try { browser.close(safe(e.code), e.reason); } catch {} });
  up.addEventListener("error", () => { try { browser.close(1011, "upstream error"); } catch {} });
  return new Response(null, { status: 101, webSocket: pair[0] } as ResponseInit & { webSocket: WebSocket });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const url = new URL(request.url);
      if (url.pathname === "/api/live") {
        const token = url.searchParams.get("token") ?? "";
        const user = await authenticateRequest(new Request(request.url, { headers: { authorization: `Bearer ${token}` } }));
        if (!user) return new Response("Please sign in again.", { status: 401 });
        return handleLiveRequest(request, token);
      }
      if (url.pathname === "/api/proxy-ws") {
        const user = await authenticateRequest(new Request(request.url, { headers: { authorization: `Bearer ${url.searchParams.get("token") ?? ""}` } }));
        if (!user) return new Response("Unauthorized", { status: 401 });
        return proxyWebSocket(url);
      }
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
