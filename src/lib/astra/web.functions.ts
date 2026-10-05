import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const strip = (h: string) =>
  h.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();

export const webSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ q: z.string().min(1).max(300) }).parse(d))
  .handler(async ({ data }) => {
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(data.q)}`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AstraBrowser/1.0)" },
    });
    if (!res.ok) return { results: [] as { title: string; url: string; snippet: string }[] };
    const html = await res.text();
    const results: { title: string; url: string; snippet: string }[] = [];
    const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) && results.length < 20) {
      let url = m[1]!;
      const u = /uddg=([^&]+)/.exec(url);
      if (u) url = decodeURIComponent(u[1]!);
      if (url.includes("duckduckgo.com/y.js")) continue;
      results.push({ title: strip(m[2]!), url, snippet: strip(m[3]!) });
    }
    return { results };
  });
