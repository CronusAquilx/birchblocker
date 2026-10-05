import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Gamepad2, Globe, Maximize, RotateCw, Search } from "lucide-react";
import { MobileMenuButton } from "@/components/astra/AppShell";
import { usePrefs } from "@/lib/astra/prefs";
import { openProxied } from "@/lib/astra/proxy";

export const Route = createFileRoute("/_authenticated/games")({
  head: () => ({ meta: [{ title: "Games — Astra" }] }),
  component: Games,
});

const SERVERS = [
  { name: "GN Math", url: "https://gn-math-t.github.io/" },
  { name: "Lumin", url: "https://lumin-game.github.io/" },
  { name: "Cloud", url: "https://web.cloudmoonapp.com/" },
  { name: "Emulator", url: "https://demo.emulatorjs.org/" },
  { name: "Arcade", url: "https://www.crazygames.com/" },
  { name: "CKV", url: "https://wanocapy.github.io/ChickenKingsVault/" },
  { name: "Seraph", url: "https://seraph.reveriestudios.online/" },
  { name: "Truffled", url: "https://truffled.lol/" },
  { name: "UGS", url: "https://0288007.github.io/ugs/" },
] as const;

type Mode = "games" | "sites";
type Game = { id: number; name: string; author: string; file: string; cover: string };

function Games() {
  const [mode, setMode] = useState<Mode | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const m = localStorage.getItem("astra-games-mode");
    if (m === "games" || m === "sites") setMode(m);
    setReady(true);
  }, []);
  const choose = (m: Mode) => { localStorage.setItem("astra-games-mode", m); setMode(m); };

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <MobileMenuButton />
        <h1 className="font-display text-xl">Games</h1>
        {mode && (
          <div className="ml-3 flex rounded-md border p-0.5 text-xs">
            <button onClick={() => choose("games")} className={`rounded px-2 py-1 ${mode === "games" ? "bg-accent" : ""}`}>Just games</button>
            <button onClick={() => choose("sites")} className={`rounded px-2 py-1 ${mode === "sites" ? "bg-accent" : ""}`}>Actual website</button>
          </div>
        )}
      </header>
      {!ready ? null : mode === null ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
          <p className="text-lg font-medium">How do you want to play?</p>
          <div className="grid w-full max-w-lg gap-3 sm:grid-cols-2">
            <button onClick={() => choose("games")} className="flex flex-col items-center gap-2 rounded-xl border p-6 hover:bg-accent">
              <Gamepad2 className="size-8" /><span className="font-medium">Just view games</span>
              <span className="text-xs text-muted-foreground">Pick a game and play it here, full screen</span>
            </button>
            <button onClick={() => choose("sites")} className="flex flex-col items-center gap-2 rounded-xl border p-6 hover:bg-accent">
              <Globe className="size-8" /><span className="font-medium">View actual website</span>
              <span className="text-xs text-muted-foreground">Browse the original game sites inside Astra</span>
            </button>
          </div>
        </div>
      ) : mode === "games" ? <Library /> : <Sites />}
    </div>
  );
}

function Library() {
  const [games, setGames] = useState<Game[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [playing, setPlaying] = useState<Game | null>(null);

  useEffect(() => {
    fetch("/api/public/games/list")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`status ${r.status}`))))
      .then(setGames)
      .catch((e) => setError(String(e?.message ?? e)));
  }, []);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (games ?? []).filter((g) => !s || g.name.toLowerCase().includes(s));
  }, [games, q]);

  if (playing) return <Player game={playing} onBack={() => setPlaying(null)} />;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Search className="size-4 text-muted-foreground" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={games ? `Search ${games.length} games` : "Loading games…"}
          className="flex-1 bg-transparent text-sm outline-none" />
      </div>
      {error && <p className="p-4 text-sm text-destructive">Couldn't load the game list ({error}). Try again later or use "Actual website".</p>}
      <div className="grid flex-1 auto-rows-min grid-cols-2 gap-3 overflow-y-auto p-3 sm:grid-cols-4 lg:grid-cols-6">
        {shown.slice(0, 300).map((g) => (
          <button key={g.id} onClick={() => setPlaying(g)} className="group overflow-hidden rounded-lg border text-left hover:bg-accent">
            <img src={`/api/public/games/cover/${g.cover}`} alt={g.name} loading="lazy" className="aspect-square w-full bg-muted object-cover" />
            <p className="truncate px-2 py-1.5 text-sm">{g.name}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function Player({ game, onBack }: { game: Game; onBack: () => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [nonce, setNonce] = useState(0);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <button onClick={onBack} className="rounded-md border p-1.5" aria-label="Back"><ArrowLeft className="size-4" /></button>
        <p className="truncate font-medium">{game.name}</p>
        <div className="ml-auto flex gap-2">
          <button onClick={() => setNonce((n) => n + 1)} className="rounded-md border p-1.5" aria-label="Reload"><RotateCw className="size-4" /></button>
          <button onClick={() => wrap.current?.requestFullscreen?.()} className="flex items-center gap-1 rounded-md border px-2 py-1.5 text-sm" aria-label="Fullscreen">
            <Maximize className="size-4" /> Fullscreen
          </button>
        </div>
      </div>
      <div ref={wrap} className="flex-1 bg-background">
        <iframe key={nonce} title={game.name} src={`/api/public/games/play/${game.file}`}
          sandbox="allow-scripts allow-pointer-lock allow-forms allow-modals allow-orientation-lock"
          allow="fullscreen; autoplay; gamepad" allowFullScreen className="h-full w-full border-0" />
      </div>
    </div>
  );
}

function Sites() {
  const prefs = usePrefs();
  const ref = useRef<HTMLIFrameElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [server, setServer] = useState<string>("GN Math");
  const [nonce, setNonce] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const current = SERVERS.find((s) => s.name === server) ?? SERVERS[0];

  useEffect(() => {
    const s = localStorage.getItem("astra-game-server");
    if (s) setServer(s);
  }, []);

  useEffect(() => {
    localStorage.setItem("astra-game-server", current.name);
    setError(null);
    const iframe = ref.current;
    if (!iframe) return;
    // Keep pop-ups ("open in new tab") inside this frame: a new tab has no proxy
    // attached and shows 404.
    const keepInside = () => {
      try {
        const w = iframe.contentWindow as (Window & { open: typeof window.open }) | null;
        if (w) w.open = ((u?: string | URL) => { if (u) w.location.href = String(u); return null; }) as typeof window.open;
      } catch { /* cross-origin, ignore */ }
    };
    iframe.addEventListener("load", keepInside);
    openProxied(iframe, current.url, prefs).catch((e) => setError(e instanceof Error ? e.message : String(e)));
    return () => iframe.removeEventListener("load", keepInside);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current.name, nonce, prefs.transport, prefs.wisp]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <select value={current.name} onChange={(e) => setServer(e.target.value)} className="rounded-md border bg-background px-2 py-1 text-sm" aria-label="Site">
          {SERVERS.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
        </select>
        <div className="ml-auto flex gap-2">
          <button onClick={() => setNonce((n) => n + 1)} className="rounded-md border p-1.5" aria-label="Reload"><RotateCw className="size-4" /></button>
          <button onClick={() => wrap.current?.requestFullscreen?.()} className="rounded-md border p-1.5" aria-label="Fullscreen"><Maximize className="size-4" /></button>
        </div>
      </div>
      {error && <p className="px-4 py-2 text-sm text-destructive">Couldn't load {current.name}: {error}. Try another site.</p>}
      <div ref={wrap} className="flex-1">
        <iframe key={`${current.name}-${nonce}`} ref={ref} title={current.name} className="h-full w-full border-0 bg-background" allow="fullscreen; autoplay; gamepad" allowFullScreen />
      </div>
    </div>
  );
}
