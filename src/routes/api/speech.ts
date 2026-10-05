import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { authenticateRequest } from "@/lib/astra/api-user.server";
import { GATEWAY_BASE_URL, TTS_MODEL, TTS_VOICE, requestSpeech } from "@/lib/astra/speech.server";

const Body = z.object({ text: z.string().min(1).max(6000) });

export const Route = createFileRoute("/api/speech")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const userId = await authenticateRequest(request);
        if (!userId) return new Response("Please sign in again.", { status: 401 });

        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) return new Response("Speech is not available right now.", { status: 503 });

        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return new Response("Nothing to read aloud.", { status: 400 });

        try {
          const up = await requestSpeech(
            { baseURL: GATEWAY_BASE_URL, apiKey, model: TTS_MODEL, format: "gemini", voice: TTS_VOICE },
            parsed.data.text,
            false,
            request.signal,
          );
          if (!up.body) return new Response("Speech service unavailable.", { status: up.ok ? 502 : up.status });
          return new Response(up.body, {
            status: up.status,
            headers: {
              "content-type": up.headers.get("content-type") ?? "text/event-stream",
              "cache-control": "no-cache",
            },
          });
        } catch (e) {
          if (e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError")) {
            return new Response(null, { status: 499 });
          }
          return new Response("Could not synthesize speech.", { status: 502 });
        }
      },
    },
  },
});
