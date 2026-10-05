import { createFileRoute } from "@tanstack/react-router";
import { authenticateRequest } from "@/lib/astra/api-user.server";

/**
 * Astra relay: the browser proxy engine sends each page request here and Astra's
 * own server fetches it, so the browser only ever talks to Astra's domain.
 */
const NULL_BODY = new Set([101, 103, 204, 205, 304]);
const DROP_REQ = new Set(["host", "connection", "content-length", "accept-encoding", "transfer-encoding", "upgrade", "keep-alive", "proxy-connection", "te", "trailer"]);
const DROP_RES = new Set(["content-encoding", "content-length", "transfer-encoding", "connection", "keep-alive"]);
const tokenCache = new Map<string, number>();

function blockedHost(host: string) {
  const h = host.toLowerCase();
  return h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h === "0.0.0.0" || h === "[::1]" ||
    /^(127|10|0)\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h);
}

async function authorized(request: Request) {
  const token = request.headers.get("authorization") ?? "";
  const exp = tokenCache.get(token);
  if (exp && exp > Date.now()) return true;
  const user = await authenticateRequest(request);
  if (!user) return false;
  if (tokenCache.size > 500) tokenCache.clear();
  tokenCache.set(token, Date.now() + 60_000);
  return true;
}

async function handle(request: Request) {
  if (!(await authorized(request))) return new Response("Unauthorized", { status: 401 });
  const target = request.headers.get("x-astra-url");
  const method = (request.headers.get("x-astra-method") || "GET").toUpperCase();
  let url: URL;
  try { url = new URL(target ?? ""); } catch { return new Response("Bad url", { status: 400 }); }
  if (!/^https?:$/.test(url.protocol) || blockedHost(url.hostname)) return new Response("Blocked url", { status: 400 });

  let raw: [string, string][] = [];
  try { raw = JSON.parse(decodeURIComponent(request.headers.get("x-astra-headers") || "%5B%5D")); } catch { /* ignore */ }
  const headers = new Headers();
  for (const [k, v] of raw) {
    if (typeof k !== "string" || typeof v !== "string" || DROP_REQ.has(k.toLowerCase())) continue;
    try { headers.append(k, v); } catch { /* invalid header */ }
  }
  const body = method === "GET" || method === "HEAD" ? null : await request.arrayBuffer();

  let upstream: Response;
  try {
    upstream = await fetch(url.toString(), { method, headers, body, redirect: "manual" });
  } catch (e) {
    return new Response(`Could not reach ${url.hostname}: ${e instanceof Error ? e.message : String(e)}`, { status: 502 });
  }

  const out: [string, string][] = [];
  upstream.headers.forEach((v, k) => { if (k !== "set-cookie" && !DROP_RES.has(k)) out.push([k, v]); });
  for (const c of upstream.headers.getSetCookie?.() ?? []) out.push(["set-cookie", c]);

  return new Response(NULL_BODY.has(upstream.status) || method === "HEAD" ? null : upstream.body, {
    status: 200,
    headers: {
      "x-astra-status": String(upstream.status),
      "x-astra-status-text": encodeURIComponent(upstream.statusText || ""),
      "x-astra-headers": encodeURIComponent(JSON.stringify(out)),
      "cache-control": "no-store",
    },
  });
}

export const Route = createFileRoute("/api/proxy")({
  server: { handlers: { POST: ({ request }) => handle(request) } },
});
