import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

/**
 * Movies relay: TMDB data, poster images, and streaming-source embed pages all
 * load through Astra's own server, so the browser only ever talks to Astra's
 * domain. Requires a signed-in user (bearer header or ?token= for iframes/images).
 */
const TMDB_API_KEY = "0ea74aa80d71c4dc484c0a58f26ea7b8";
const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMG = "https://image.tmdb.org/t/p";

const DROP_RES = new Set([
  "content-encoding", "content-length", "transfer-encoding", "connection",
  "keep-alive", "x-frame-options", "content-security-policy",
  "content-security-policy-report-only", "frame-options",
]);

function blockedHost(host: string) {
  const h = host.toLowerCase();
  return h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h === "0.0.0.0" || h === "[::1]" ||
    /^(127|10|0)\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h);
}

async function authorizedUser(request: Request, url: URL): Promise<boolean> {
  const token =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    url.searchParams.get("token") ||
    "";
  if (!token) return false;
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  const supabase = createClient(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: { Authorization: `Bearer ${token}` },
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
  const { data } = await supabase.auth.getClaims(token);
  return Boolean(data?.claims?.sub);
}

function proxied(self: string, target: string, token: string) {
  return `${self}?embed=${encodeURIComponent(target)}&token=${encodeURIComponent(token)}`;
}

/** Rewrite HTML so every resource and network call routes back through this relay. */
function rewriteHtml(html: string, base: string, self: string, token: string): string {
  const prox = (u: string) => {
    const t = u.trim();
    if (!t || /^(data:|javascript:|mailto:|blob:|#)/i.test(t)) return u;
    try {
      return proxied(self, new URL(t, base).toString(), token);
    } catch {
      return u;
    }
  };

  let out = html
    .replace(/(\s(?:src|href|action|poster)\s*=\s*)(["'])([^"']+)\2/gi, (m, attr, q, u) => `${attr}${q}${prox(u)}${q}`)
    .replace(/url\(\s*(["']?)([^)"']+)\1\s*\)/gi, (m, q, u) => {
      const t = String(u).trim();
      return /^(data:|blob:)/i.test(t) ? m : `url(${q}${prox(u)}${q})`;
    });

  const inject = `<script>(function(){var P=${JSON.stringify(self)}+"?embed=",T=${JSON.stringify(token)},B=${JSON.stringify(base)};` +
    `function w(u){try{if(typeof u!=="string")return u;if(/^(data:|blob:|javascript:|about:)/i.test(u))return u;var a=new URL(u,B).toString();if(a.indexOf(P)===0)return a;return P+encodeURIComponent(a)+"&token="+encodeURIComponent(T);}catch(e){return u;}}` +
    `var of=window.fetch;window.fetch=function(i,n){try{if(typeof i==="string")i=w(i);else if(i&&i.url)i=new Request(w(i.url),i);}catch(e){}return of.call(this,i,n);};` +
    `var oo=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){arguments[1]=w(u);return oo.apply(this,arguments);};` +
    `var op=window.open;window.open=function(u,t,f){return op.call(this,w(u),t,f);};` +
    `if(navigator.sendBeacon){var sb=navigator.sendBeacon.bind(navigator);navigator.sendBeacon=function(u,d){return sb(w(u),d);};}` +
    `})();</script>`;

  if (/<head[^>]*>/i.test(out)) out = out.replace(/<head[^>]*>/i, (m) => m + inject);
  else out = inject + out;
  return out;
}

async function handle({ request }: { request: Request }) {
  const url = new URL(request.url);
  if (!(await authorizedUser(request, url))) return new Response("Unauthorized", { status: 401 });
  const token = url.searchParams.get("token") || "";
  const self = `${url.origin}/api/movies`;

  // --- TMDB API data ---
  const tmdbPath = url.searchParams.get("tmdb");
  if (tmdbPath) {
    if (!tmdbPath.startsWith("/") || tmdbPath.includes("..")) return new Response("Bad path", { status: 400 });
    const target = new URL(`${TMDB_BASE}${tmdbPath}`);
    target.searchParams.set("api_key", TMDB_API_KEY);
    url.searchParams.forEach((v, k) => {
      if (k !== "tmdb" && k !== "token") target.searchParams.set(k, v);
    });
    const upstream = await fetch(target.toString());
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { "content-type": upstream.headers.get("content-type") ?? "application/json", "cache-control": "public, max-age=300" },
    });
  }

  // --- TMDB images ---
  const imgPath = url.searchParams.get("img");
  if (imgPath) {
    if (!/^\/[a-z0-9]+\/[-\w./]+$/i.test(imgPath)) return new Response("Bad path", { status: 400 });
    const upstream = await fetch(`${TMDB_IMG}${imgPath}`);
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { "content-type": upstream.headers.get("content-type") ?? "image/jpeg", "cache-control": "public, max-age=86400" },
    });
  }

  // --- Streaming-source embed pages (and their subresources) ---
  const embed = url.searchParams.get("embed");
  if (embed) {
    let target: URL;
    try {
      target = new URL(embed);
    } catch {
      return new Response("Bad url", { status: 400 });
    }
    if (!/^https?:$/.test(target.protocol) || blockedHost(target.hostname)) return new Response("Blocked url", { status: 400 });

    let upstream: Response;
    try {
      upstream = await fetch(target.toString(), {
        redirect: "follow",
        headers: {
          "user-agent": request.headers.get("user-agent") ?? "Mozilla/5.0",
          accept: request.headers.get("accept") ?? "*/*",
          "accept-language": request.headers.get("accept-language") ?? "en-US,en;q=0.9",
          referer: target.origin + "/",
        },
      });
    } catch (e) {
      return new Response(`Could not reach ${target.hostname}: ${e instanceof Error ? e.message : String(e)}`, { status: 502 });
    }

    const headers = new Headers();
    upstream.headers.forEach((v, k) => {
      if (!DROP_RES.has(k.toLowerCase()) && k.toLowerCase() !== "set-cookie") headers.set(k, v);
    });
    headers.set("cache-control", "no-store");

    const type = upstream.headers.get("content-type") ?? "";
    if (type.includes("text/html")) {
      const html = rewriteHtml(await upstream.text(), target.toString(), self, token);
      headers.set("content-type", "text/html; charset=utf-8");
      return new Response(html, { status: 200, headers });
    }
    return new Response(upstream.body, { status: upstream.status, headers });
  }

  return new Response("Missing tmdb, img, or embed parameter", { status: 400 });
}

export const Route = createFileRoute("/api/movies")({
  server: { handlers: { GET: handle, HEAD: handle } },
});
