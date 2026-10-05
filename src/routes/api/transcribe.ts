import { createFileRoute } from "@tanstack/react-router";
import { authenticateRequest } from "@/lib/astra/api-user.server";
import { GATEWAY_BASE_URL, STT_MODEL, transcribe } from "@/lib/astra/speech.server";

export const Route = createFileRoute("/api/transcribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const userId = await authenticateRequest(request);
        if (!userId) return new Response("Please sign in again.", { status: 401 });

        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) return new Response("Transcription is not available right now.", { status: 503 });

        const file = (await request.formData().catch(() => null))?.get("file");
        if (!(file instanceof File) || !file.size) return new Response("The recording is missing or empty.", { status: 400 });
        if (file.type && !file.type.startsWith("audio/")) return new Response("Only audio can be transcribed.", { status: 400 });

        try {
          const up = await transcribe(
            { baseURL: GATEWAY_BASE_URL, apiKey, model: STT_MODEL, maxFileBytes: 14 * 1024 * 1024, audioOnly: true },
            file,
          );
          if (!up.body) return new Response("Transcription service unavailable.", { status: up.ok ? 502 : up.status });
          return new Response(up.body, {
            status: up.status,
            headers: {
              "content-type": up.headers.get("content-type") ?? "text/event-stream",
              "cache-control": "no-cache",
            },
          });
        } catch (e) {
          const message = e instanceof Error ? e.message : "Could not transcribe that recording";
          const status = message.includes("size") || message.includes("MIME") ? 400 : 502;
          return new Response(message, { status });
        }
      },
    },
  },
});
