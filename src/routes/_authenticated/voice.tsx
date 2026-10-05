import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, PhoneOff, Volume2 } from "lucide-react";
import { useLiveVoice, type LiveEvent } from "@/hooks/use-live-voice";
import { MobileMenuButton } from "@/components/astra/AppShell";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/voice")({
  head: () => ({
    meta: [
      { title: "Voice — Astra" },
      { name: "description", content: "Talk with Astra out loud in a live voice call." },
    ],
  }),
  component: VoicePage,
});

type Line = { role: "user" | "assistant"; text: string };

function VoicePage() {
  const [lines, setLines] = useState<Line[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  const v = useLiveVoice({
    onEvent(event: LiveEvent) {
      if (event.type === "session.input_transcript.delta" || event.type === "session.output_transcript.delta") {
        const role = event.type === "session.input_transcript.delta" ? "user" : "assistant";
        const delta = typeof event["delta"] === "string" ? (event["delta"] as string) : "";
        if (!delta.trim()) return;
        setLines((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.role === role) {
            return [...prev.slice(0, -1), { role, text: last.text + delta }];
          }
          return [...prev, { role, text: delta }];
        });
      }
      if (event.type === "app.closed") {
        // keep the transcript on screen after the call ends
      }
    },
  });

  const on = v.status === "connecting" || v.status === "connected" || v.status === "stopping";
  const compact = lines.length > 0;
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" }); }, [lines]);

  const label = {
    idle: lines.length ? "Call ended" : "Tap to start a call with Astra",
    connecting: "Connecting…",
    connected: "Live — just talk",
    stopping: "Ending call…",
    closed: "Call ended",
  }[v.status];

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3 md:px-6">
        <MobileMenuButton />
        <h1 className="text-sm font-medium">Voice</h1>
        <span className="ml-auto rounded-full border px-2 py-0.5 text-xs text-muted-foreground">Live call</span>
      </header>
      <div className="flex-1 overflow-y-auto">
        <div className={cn("mx-auto flex w-full max-w-2xl flex-col items-center px-4", compact ? "gap-4 py-4" : "min-h-full justify-center gap-8 py-8")}>
          <div className={cn("relative flex items-center justify-center transition-all", compact ? "size-28" : "size-48")}>
            <div className={cn("absolute inset-0 rounded-full bg-star/20 blur-2xl transition-opacity", on ? "animate-pulse opacity-100" : "opacity-40")} />
            <div className={cn("relative rounded-full bg-gradient-to-br from-star to-star/40 shadow-[0_0_60px_-10px_var(--star)] transition-transform duration-700",
              compact ? "size-20" : "size-36",
              v.status === "connected" && "scale-105",
              v.status === "connecting" && "animate-pulse")} />
          </div>
          <p role="status" className="text-center text-sm text-muted-foreground">{label}</p>
          {v.error && <p role="alert" className="max-w-md text-center text-sm text-destructive">{v.error}</p>}
          {v.playbackBlocked && (
            <button onClick={v.resumePlayback} className="flex items-center gap-2 rounded-full border px-4 py-2 text-sm">
              <Volume2 className="size-4" /> Tap to hear Astra
            </button>
          )}
          <div className="flex items-center gap-3">
            {on ? (
              <>
                <button
                  onClick={() => v.setMuted(!v.muted)}
                  aria-label={v.muted ? "Unmute microphone" : "Mute microphone"}
                  className="flex size-14 items-center justify-center rounded-full border"
                >
                  {v.muted ? <MicOff className="size-5" /> : <Mic className="size-5" />}
                </button>
                <button onClick={v.stop} aria-label="End call" className="flex size-14 items-center justify-center rounded-full bg-destructive text-destructive-foreground">
                  <PhoneOff className="size-5" />
                </button>
              </>
            ) : (
              <button onClick={v.start} className="flex items-center gap-2 rounded-full bg-star px-6 py-3 font-medium text-star-foreground">
                <Mic className="size-5" /> Start call
              </button>
            )}
          </div>
          {lines.length > 0 && (
            <div className="w-full space-y-2 rounded-lg border bg-card/60 p-3 text-sm">
              {lines.map((l, i) => (
                <p key={i} className={l.role === "user" ? "text-muted-foreground" : ""}><span className="font-medium">{l.role === "user" ? "You" : "Astra"}:</span> {l.text}</p>
              ))}
            </div>
          )}
          <div ref={endRef} />
        </div>
      </div>
      <audio ref={v.audioRef} autoPlay playsInline className="hidden" />
    </div>
  );
}
