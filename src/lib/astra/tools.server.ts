import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { evaluate } from "mathjs";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * Astra tool registry. Each entry: id (matches `tools` table row, which holds
 * enabled state + permission), description, input schema, and handler.
 */
type Ctx = { supabase: SupabaseClient<Database>; userId: string };

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function isPublicHttpUrl(raw: string) {
  try {
    const u = new URL(raw);
    if (!/^https?:$/.test(u.protocol)) return false;
    const h = u.hostname;
    return !(h === "localhost" || /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h));
  } catch {
    return false;
  }
}

const builders: Record<string, (ctx: Ctx) => ToolSet[string]> = {
  calculator: () =>
    tool({
      description: "Evaluate a math expression exactly, e.g. '12.5% * 3400' or 'sqrt(2)^3'. Use for any arithmetic.",
      inputSchema: z.object({ expression: z.string() }),
      execute: async ({ expression }) => {
        try {
          return { expression, result: String(evaluate(expression)) };
        } catch (e) {
          return { expression, error: e instanceof Error ? e.message : "Invalid expression" };
        }
      },
    }),
  datetime: () =>
    tool({
      description: "Get the current date and time, optionally in an IANA timezone like 'America/Chicago'.",
      inputSchema: z.object({ timezone: z.string().nullable() }),
      execute: async ({ timezone }) => {
        const now = new Date();
        try {
          return {
            iso: now.toISOString(),
            local: now.toLocaleString("en-US", { timeZone: timezone ?? "UTC", dateStyle: "full", timeStyle: "long" }),
            timezone: timezone ?? "UTC",
          };
        } catch {
          return { iso: now.toISOString(), error: `Unknown timezone ${timezone}` };
        }
      },
    }),
  web_search: () =>
    tool({
      description: "Search the web. Returns titles, URLs and snippets. Cite sources as markdown links.",
      inputSchema: z.object({ query: z.string() }),
      execute: async ({ query }) => {
        const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; AstraAgent/1.0)" },
        });
        if (!res.ok) return { query, error: `Search failed (${res.status})`, results: [] };
        const html = await res.text();
        const results: { title: string; url: string; snippet: string }[] = [];
        const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(html)) && results.length < 6) {
          let url = m[1]!;
          const uddg = /uddg=([^&]+)/.exec(url);
          if (uddg) url = decodeURIComponent(uddg[1]!);
          results.push({ title: stripHtml(m[2]!), url, snippet: stripHtml(m[3]!) });
        }
        return { query, results, ...(results.length ? {} : { error: "No results found" }) };
      },
    }),
  url_fetch: () =>
    tool({
      description: "Fetch a public web page and return its readable text (truncated).",
      inputSchema: z.object({ url: z.string() }),
      execute: async ({ url }) => {
        if (!isPublicHttpUrl(url)) return { url, error: "Only public http(s) URLs are allowed" };
        try {
          const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; AstraAgent/1.0)" }, redirect: "follow" });
          if (!res.ok) return { url, error: `Page answered ${res.status}` };
          const text = stripHtml(await res.text());
          return { url, text: text.slice(0, 12000), truncated: text.length > 12000 };
        } catch {
          return { url, error: "Could not fetch that page" };
        }
      },
    }),
  remember: ({ supabase, userId }) =>
    tool({
      description: "Save a durable fact or preference about the user to long-term memory. Only when the user shares something worth remembering.",
      inputSchema: z.object({ fact: z.string() }),
      execute: async ({ fact }) => {
        const { error } = await supabase.from("memories").insert({ user_id: userId, content: fact.slice(0, 500) });
        return error ? { saved: false, error: "Could not save" } : { saved: true, fact };
      },
    }),
  html_preview: () =>
    tool({
      description:
        "Create a complete, self-contained single-file web page (HTML with inline CSS and JS) and show it to the user as a live preview. Use for websites, demos, games, visualizations.",
      inputSchema: z.object({ title: z.string(), html: z.string() }),
      execute: async ({ title, html }) => ({ title, bytes: html.length, rendered: true }),
    }),
  generate_image: ({ supabase, userId }) =>
    tool({
      description:
        "Generate an image from a detailed visual description and show it to the user. Write a rich prompt covering subject, setting, style, lighting and composition. Never name real people, brands or copyrighted characters — describe them instead.",
      inputSchema: z.object({ prompt: z.string() }),
      execute: async ({ prompt }, { abortSignal }) => {
        try {
          const apiKey = process.env["LOVABLE_API_KEY"];
          if (!apiKey) return { error: "Image generation isn't available right now." };
          const { generateImagePng } = await import("./image.server");
          const result = await generateImagePng(
            { baseURL: "https://ai.gateway.lovable.dev", apiKey, model: "openai/gpt-image-2.5-sunburst" },
            prompt,
            abortSignal,
          );
          if (!result.ok) return { error: result.error };
          const path = `${userId}/${crypto.randomUUID()}.png`;
          const { error: upErr } = await supabase.storage
            .from("astra-images")
            .upload(path, result.bytes, { contentType: "image/png" });
          if (upErr) {
            console.error("save image", upErr);
            return { error: "The image was created but couldn't be saved." };
          }
          const { data: signed } = await supabase.storage.from("astra-images").createSignedUrl(path, 60 * 60 * 24 * 365);
          return signed ? { prompt, url: signed.signedUrl } : { error: "The image was created but couldn't be saved." };
        } catch (e) {
          return { error: e instanceof Error && e.name === "AbortError" ? "Cancelled" : "Image generation failed" };
        }
      },
    }),
};

export async function buildTools(ctx: Ctx): Promise<ToolSet> {
  const { data } = await ctx.supabase.from("tools").select("id, enabled").eq("enabled", true);
  const set: ToolSet = {};
  for (const row of data ?? []) {
    const b = builders[row.id];
    if (b) set[row.id] = b(ctx);
  }
  return set;
}
