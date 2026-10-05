import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { authenticateRequest } from "@/lib/astra/api-user.server";

/** Plain-HTTPS voice reply for networks that block live calls (e.g. school Wi-Fi). */
const Body = z.object({
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(4000) })).max(20),
});

export const Route = createFileRoute("/api/voice-reply")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await authenticateRequest(request))) return new Response("Please sign in again.", { status: 401 });
        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) return new Response("Voice is not available right now.", { status: 503 });
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return new Response("Bad request", { status: 400 });
        const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              { role: "system", content: "You are BirchBlock, a friendly voice assistant. Reply conversationally in 1-3 short spoken sentences. No markdown, lists or emojis." },
              ...parsed.data.history.map((m) => ({ role: m.role, content: m.text })),
            ],
          }),
        });
        if (r.status === 429) return new Response("Too many requests — wait a moment.", { status: 429 });
        if (r.status === 402) return new Response("AI credits ran out.", { status: 402 });
        if (!r.ok) return new Response("The assistant couldn't answer.", { status: 502 });
        const d: any = await r.json();
        return Response.json({ text: String(d.choices?.[0]?.message?.content ?? "").trim() });
      },
    },
  },
});
