import { createFileRoute } from "@tanstack/react-router";

/** Shared clock so party members on different devices start playback at the same instant. */
export const Route = createFileRoute("/api/time")({
  server: { handlers: { GET: () => Response.json({ now: Date.now() }, { headers: { "cache-control": "no-store" } }) } },
});
