import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { convertToModelMessages, createUIMessageStream, createUIMessageStreamResponse, stepCountIs, streamText, type UIMessage } from "ai";
import { think } from "@/lib/astra/mini-brain";
import { buildTools } from "@/lib/astra/tools.server";
import { z } from "zod";
import type { Database, Json } from "@/integrations/supabase/types";
import { hostedFallback, resolveProvider } from "@/lib/astra/provider.server";

const Body = z.object({
  threadId: z.string().uuid(),
  message: z.object({ id: z.string(), role: z.literal("user"), parts: z.array(z.any()) }),
  modelId: z.string().min(1),
  reasoning: z.string().min(1),
});

const HISTORY_LIMIT = 40;
/** Daily usage cap in units (tokens/1000 x model multiplier x reasoning multiplier). */
const DAILY_UNIT_LIMIT = 500;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function userClient(token: string) {
  const url = process.env["SUPABASE_URL"]!;
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient<Database>(url, key, {
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
}

function textOf(parts: unknown): string {
  if (!Array.isArray(parts)) return "";
  return parts
    .filter((p): p is { type: "text"; text: string } => p?.type === "text" && typeof p.text === "string")
    .map((p) => p.text)
    .join("\n");
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        if (!token) return json(401, { error: "Please sign in again." });
        const supabase = userClient(token);
        const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
        const userId = claims?.claims?.sub;
        if (claimsErr || !userId) return json(401, { error: "Please sign in again." });

        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return json(400, { error: "Invalid request." });
        const { threadId, message, modelId, reasoning } = parsed.data;

        const { data: thread } = await supabase.from("threads").select("id, title").eq("id", threadId).maybeSingle();
        if (!thread) return json(404, { error: "Conversation not found." });

        const { data: model } = await supabase
          .from("models")
          .select("id, provider, config, display_name, enabled, usage_multiplier")
          .eq("id", modelId)
          .maybeSingle();
        if (!model || !model.enabled) return json(400, { error: "That model is not available." });

        const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
        const cfg = (model.config ?? {}) as { providerKeyId?: string };
        let override: { baseUrl: string; apiKey?: string } | undefined;
        if (cfg.providerKeyId) {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: pk } = await supabaseAdmin.from("provider_keys").select("base_url, api_key").eq("id", cfg.providerKeyId).maybeSingle();
          if (pk) override = { baseUrl: pk.base_url, ...(pk.api_key ? { apiKey: pk.api_key } : {}) };
        }
        const builtin = model.provider === "builtin";
        const resolved = builtin ? null : model.provider === "lovable" ? hostedFallback() : resolveProvider(model, override);
        if (!builtin && !resolved) return json(503, { error: `${model.display_name} isn't connected: the hosted AI key is missing.` });
        if (resolved && !resolved.ok) return json(503, { error: `${model.display_name} isn't connected: ${resolved.reason}` });

        const { data: level } = await supabase.from("reasoning_levels").select("*").eq("id", reasoning).maybeSingle();

        const since = new Date();
        since.setUTCHours(0, 0, 0, 0);
        const { data: todays } = await supabase
          .from("usage_events")
          .select("units")
          .eq("user_id", userId)
          .gte("created_at", since.toISOString());
        const used = (todays ?? []).reduce((a, r) => a + Number(r.units), 0);
        if (!builtin && !isAdmin && used >= DAILY_UNIT_LIMIT) return json(429, { error: "You've reached today's usage limit. It resets at midnight UTC." });

        const { error: insertErr } = await supabase.from("messages").insert({
          thread_id: threadId,
          user_id: userId,
          ui_id: message.id,
          role: "user",
          parts: message.parts as Json,
        });
        if (insertErr) {
          console.error("save user message", insertErr);
          return json(500, { error: "Could not save your message." });
        }

        const [{ data: rows }, { data: memories }] = await Promise.all([
          supabase
            .from("messages")
            .select("ui_id, id, role, parts")
            .eq("thread_id", threadId)
            .order("created_at", { ascending: false })
            .limit(HISTORY_LIMIT),
          supabase.from("memories").select("content").order("created_at", { ascending: false }).limit(50),
        ]);

        const history: UIMessage[] = (rows ?? []).reverse().map((r) => ({
          id: r.ui_id ?? r.id,
          role: r.role as UIMessage["role"],
          parts: (r.parts as UIMessage["parts"]) ?? [],
        }));

        if (thread.title === "New chat") {
          const title = textOf(message.parts).replace(/\s+/g, " ").trim().slice(0, 60) || "New chat";
          await supabase.from("threads").update({ title, updated_at: new Date().toISOString() }).eq("id", threadId);
          thread.title = title;
        }

        if (builtin) {
          const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", userId).maybeSingle();
          const out = think({ text: textOf(message.parts), memories: (memories ?? []).map((m) => m.content), name: profile?.display_name });
          if (out.remember) await supabase.from("memories").insert({ user_id: userId, content: out.remember });
          if (out.forgetAll) await supabase.from("memories").delete().eq("user_id", userId);
          const stream = createUIMessageStream({
            originalMessages: history,
            execute: async ({ writer }) => {
              const id = crypto.randomUUID();
              writer.write({ type: "text-start", id });
              for (const chunk of out.reply.match(/\S+\s*/g) ?? [out.reply]) {
                writer.write({ type: "text-delta", id, delta: chunk });
                await new Promise((r) => setTimeout(r, 15));
              }
              writer.write({ type: "text-end", id });
            },
            onFinish: async ({ responseMessage }) => {
              await supabase.from("messages").insert({
                thread_id: threadId,
                user_id: userId,
                ui_id: responseMessage.id,
                role: "assistant",
                parts: responseMessage.parts as Json,
              });
              await supabase.from("threads").update({ updated_at: new Date().toISOString() }).eq("id", threadId);
            },
          });
          return createUIMessageStreamResponse({ stream });
        }
        if (!resolved?.ok) return json(503, { error: "Model unavailable." });

        const memoryBlock = memories?.length
          ? `\n\nThings the user asked you to remember:\n${memories.map((m) => `- ${m.content}`).join("\n")}`
          : "";
        const effort = level
          ? `\n\nEffort level: ${level.label}. ${
              level.multiplier >= 4
                ? "Think carefully and be thorough before answering."
                : "Be direct and efficient."
            }`
          : "";

        const system = `You are Astra, a helpful, precise AI agent. Today is ${new Date().toUTCString()}.
Answer in clear Markdown. Use code blocks with language tags for code. If you don't know something, say so plainly.
You have tools. Use web_search for current events or facts you're unsure of, then cite sources as markdown links. Use url_fetch to read a page. Use calculator for arithmetic. Use remember when the user shares a lasting preference or fact. When asked to build a website, page, demo, or visual, call html_preview with a complete single-file HTML document (inline CSS/JS) instead of pasting the code, then briefly describe it.${effort}${memoryBlock}`;


        const result = streamText({
          model: resolved.model,
          system,
          messages: await convertToModelMessages(history),
          abortSignal: request.signal,
          tools: await buildTools({ supabase, userId }),
          stopWhen: stepCountIs(Math.max(50, level?.max_steps ?? 0)),
          onFinish: async ({ totalUsage }) => {
            const input = totalUsage.inputTokens ?? 0;
            const output = totalUsage.outputTokens ?? 0;
            const units = ((input + output) / 1000) * Number(model.usage_multiplier) * Number(level?.multiplier ?? 1);
            const { error } = await supabase.from("usage_events").insert({
              user_id: userId,
              thread_id: threadId,
              model_id: model.id,
              reasoning,
              input_tokens: input,
              output_tokens: output,
              units: Math.round(units * 1000) / 1000,
            });
            if (error) console.error("save usage", error);
          },
          ...(resolved.providerOptions ? { providerOptions: resolved.providerOptions } : {}),
        });
        result.consumeStream();

        return result.toUIMessageStreamResponse({
          originalMessages: history,
          sendReasoning: false,
          onError: (err) => {
            console.error("model stream error", err);
            return "Astra couldn't get a reply from the model server. Check that it's running and reachable.";
          },
          onFinish: async ({ responseMessage }) => {
            if (!responseMessage.parts.length) return;
            const { error } = await supabase.from("messages").insert({
              thread_id: threadId,
              user_id: userId,
              ui_id: responseMessage.id,
              role: "assistant",
              parts: responseMessage.parts as Json,
            });
            if (error) console.error("save assistant message", error);
            await supabase.from("threads").update({ updated_at: new Date().toISOString() }).eq("id", threadId);
          },
        });
      },
    },
  },
});
