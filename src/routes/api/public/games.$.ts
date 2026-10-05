import { createFileRoute } from "@tanstack/react-router";

/**
 * Game library relay. Pulls the GN Math catalog and individual game files from
 * GitHub (jsDelivr blocks that account) and serves them from Astra's domain.
 * Public on purpose: it only relays a fixed, public game catalog — no user data.
 *   /api/public/games/list            → [{ id, name, cover, file, author }]
 *   /api/public/games/play/<file>     → the game's HTML page
 *   /api/public/games/cover/<file>    → the cover image
 */
const RAW = "https://raw.githubusercontent.com/gn-math";
const SAFE = /^[A-Za-z0-9._-]{1,80}$/;

// Games run in a sandboxed (opaque-origin) frame, where touching localStorage
// throws. This shim gives them an in-memory store so they still boot.
const SHIM = `<script>(function(){function m(){var d={};return{getItem:function(k){return k in d?d[k]:null},setItem:function(k,v){d[k]=String(v)},removeItem:function(k){delete d[k]},clear:function(){d={}},key:function(i){return Object.keys(d)[i]||null},get length(){return Object.keys(d).length}}}
["localStorage","sessionStorage"].forEach(function(n){try{window[n].length}catch(e){try{Object.defineProperty(window,n,{value:m(),configurable:true})}catch(_){}}});
try{document.cookie}catch(e){Object.defineProperty(document,"cookie",{get:function(){return""},set:function(){},configurable:true})}
window.open=function(u){if(u){try{location.href=u}catch(e){}}return null};})();</script>`;

export const Route = createFileRoute("/api/public/games/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const parts = (params._splat ?? "").split("/");
        const [kind, file] = parts;

        if (kind === "list") {
          const res = await fetch(`${RAW}/assets/main/zones.json`);
          if (!res.ok) return new Response("Game list unavailable", { status: 502 });
          const zones = (await res.json()) as Array<{ id: number; name: string; cover: string; url: string; author?: string }>;
          const games = zones
            .filter((z) => z.id >= 0 && z.url.startsWith("{HTML_URL}/"))
            .map((z) => ({
              id: z.id,
              name: z.name,
              author: z.author ?? "",
              file: z.url.replace("{HTML_URL}/", ""),
              cover: z.cover.replace("{COVER_URL}/", ""),
            }));
          return Response.json(games, { headers: { "cache-control": "public, max-age=1800" } });
        }

        if (!file || !SAFE.test(file)) return new Response("Not found", { status: 404 });

        if (kind === "cover") {
          const res = await fetch(`${RAW}/covers/main/${file}`);
          if (!res.ok) return new Response("Not found", { status: 404 });
          return new Response(res.body, {
            headers: { "content-type": "image/png", "cache-control": "public, max-age=86400" },
          });
        }

        if (kind === "play") {
          const res = await fetch(`${RAW}/html/main/${file}`);
          if (!res.ok) return new Response("Game not found", { status: 404 });
          let html = await res.text();
          html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + SHIM) : SHIM + html;
          return new Response(html, {
            headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=3600" },
          });
        }

        return new Response("Not found", { status: 404 });
      },
    },
  },
});
