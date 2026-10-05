import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, PhoneOff, Volume2 } from "lucide-react";
import { useLiveVoice, type LiveEvent } from "@/hooks/use-live-voice";
import { recordWav, streamSpeech, transcribeAudio } from "@/lib/astra/voice";
import { supabase } from "@/integrations/supabase/client";
import { MobileMenuButton } from "@/components/astra/AppShell";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/voice")({
  head: () => ({
    meta: [
      { title: "Voice — BirchBlock" },
      { name: "description", content: "Talk with BirchBlock out loud in a live voice call." },
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

  const [simple, setSimple] = useState(false);
  const [simpleState, setSimpleState] = useState<"idle" | "listening" | "thinking" | "speaking">("idle");
  const [simpleErr, setSimpleErr] = useState("");
  const rec = useRef<{ stop: () => Promise<File> } | null>(null);

  async function talk() {
    setSimpleErr("");
    if (simpleState === "listening" && rec.current) {
      const r = rec.current; rec.current = null;
      setSimpleState("thinking");
      try {
        const said = await transcribeAudio(await r.stop());
        const history = [...lines, { role: "user" as const, text: said }];
        setLines(history);
        const { data } = await supabase.auth.getSession();
        const res = await fetch("/api/voice-reply", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${data.session?.access_token ?? ""}` },
          body: JSON.stringify({ history: history.slice(-20) }),
        });
        if (!res.ok) throw new Error(await res.text());
        const { text } = (await res.json()) as { text: string };
        setLines((p) => [...p, { role: "assistant", text }]);
        setSimpleState("speaking");
        await streamSpeech("/api/speech", text);
      } catch (e) { setSimpleErr(e instanceof Error ? e.message : "Something went wrong"); }
      setSimpleState("idle");
      return;
    }
    if (simpleState !== "idle") return;
    try { rec.current = await recordWav(); setSimpleState("listening"); }
    catch { setSimpleErr("Microphone access was blocked."); }
  }

  const on = v.status === "connecting" || v.status === "connected" || v.status === "stopping";
  const compact = lines.length > 0;
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" }); }, [lines]);

  const label = {
    idle: lines.length ? "Call ended" : "Tap to start a call with BirchBlock",
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
        <div className="ml-auto flex rounded-md border p-0.5 text-xs">
          <button onClick={() => setSimple(false)} className={cn("rounded px-2 py-1", !simple && "bg-accent")}>Live call</button>
          <button onClick={() => { if (on) v.stop(); setSimple(true); }} className={cn("rounded px-2 py-1", simple && "bg-accent")}>Tap to talk</button>
        </div>
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
          <p role="status" className="text-center text-sm text-muted-foreground">{simple ? "Works on any network — tap, speak, tap again" : label}</p>
          {!simple && v.error && (
            <div role="alert" className="max-w-md text-center text-sm text-destructive">
              {v.error}
              <button onClick={() => setSimple(true)} className="mt-2 block w-full text-foreground underline">Network blocking live calls? Use Tap to talk instead</button>
            </div>
          )}
          {simple && simpleErr && <p role="alert" className="max-w-md text-center text-sm text-destructive">{simpleErr}</p>}
          {v.playbackBlocked && (
            <button onClick={v.resumePlayback} className="flex items-center gap-2 rounded-full border px-4 py-2 text-sm">
              <Volume2 className="size-4" /> Tap to hear BirchBlock
            </button>
          )}
          {simple ? (
            <button onClick={talk} disabled={simpleState === "thinking" || simpleState === "speaking"}
              className={cn("flex items-center gap-2 rounded-full px-6 py-3 font-medium disabled:opacity-60", simpleState === "listening" ? "bg-destructive text-destructive-foreground" : "bg-star text-star-foreground")}>
              <Mic className="size-5" /> {{ idle: "Tap to talk", listening: "Tap when done", thinking: "Thinking…", speaking: "Speaking…" }[simpleState]}
            </button>
          ) : (
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
          )}
          {lines.length > 0 && (
            <div className="w-full space-y-2 rounded-lg border bg-card/60 p-3 text-sm">
              {lines.map((l, i) => (
                <p key={i} className={l.role === "user" ? "text-muted-foreground" : ""}><span className="font-medium">{l.role === "user" ? "You" : "BirchBlock"}:</span> {l.text}</p>
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
