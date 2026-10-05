import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Mic2, Pause, Play, Search, SkipBack, SkipForward } from "lucide-react";
import { usePrefs } from "@/lib/astra/prefs";
import { openProxied } from "@/lib/astra/proxy";
import { supabase } from "@/integrations/supabase/client";
import { MobileMenuButton } from "@/components/astra/AppShell";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/music")({
  head: () => ({ meta: [{ title: "Music — Astra" }, { name: "description", content: "Search songs, albums and artists in Astra." }] }),
  component: Music,
});

type Track = { id: string; title: string; artist: string; artistId: string; album: string; albumId: string; art: string; duration: number };
type Album = { id: string; title: string; artist: string; art: string; year?: string };
type Artist = { id: string; name: string; art: string; fans?: number };
type View =
  | { kind: "home" | "search"; title: string; tracks: Track[]; albums: Album[]; artists: Artist[] }
  | { kind: "album"; data: Album & { tracks: Track[] } }
  | { kind: "artist"; data: Artist & { tracks: Track[]; albums: Album[] } };

let TOKEN = "";
async function api<T>(params: Record<string, string>): Promise<T> {
  const { data } = await supabase.auth.getSession();
  TOKEN = data.session?.access_token ?? "";
  if (!TOKEN) throw new Error("Please sign in again");
  const res = await fetch(`/api/music?${new URLSearchParams(params)}`, { headers: { authorization: `Bearer ${TOKEN}` } });
  if (!res.ok) throw new Error(res.status === 401 ? "Session expired — sign in again" : `Music couldn't load (${res.status})`);
  return res.json();
}
const artUrl = (src: string) => (src && TOKEN ? `/api/music?op=art&src=${encodeURIComponent(src)}&token=${encodeURIComponent(TOKEN)}` : "");
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

function Music() {
  const prefs = usePrefs();
  const [q, setQ] = useState("");
  const [view, setView] = useState<View | null>(null);
  const [stack, setStack] = useState<View[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [queue, setQueue] = useState<Track[]>([]);
  const [cur, setCur] = useState(-1);
  const [status, setStatus] = useState("");
  const [lyrics, setLyrics] = useState<string | null>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const track = cur >= 0 ? queue[cur] : undefined;

  async function go(load: () => Promise<View>, push = true) {
    setLoading(true); setError("");
    try {
      const next = await load();
      if (push && view) setStack((s) => [...s, view]);
      setView(next);
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't load music"); }
    setLoading(false);
  }

  useEffect(() => { go(async () => ({ kind: "home", title: "Top charts", ...(await api<any>({ op: "home" })) }), false); }, []);

  const search = (e: React.FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    if (term) go(async () => ({ kind: "search", title: `Results for "${term}"`, ...(await api<any>({ op: "search", q: term })) }));
  };
  const openAlbum = (id: string) => go(async () => ({ kind: "album", data: await api<any>({ op: "album", id }) }));
  const openArtist = (id: string) => go(async () => ({ kind: "artist", data: await api<any>({ op: "artist", id }) }));
  const back = () => { const prev = stack.at(-1); if (prev) { setView(prev); setStack((s) => s.slice(0, -1)); } };

  async function play(list: Track[], i: number) {
    const t = list[i];
    if (!t || !frameRef.current) return;
    setQueue(list); setCur(i); setLyrics(null); setStatus("Finding song…");
    try {
      const { ids } = await api<{ ids: string[] }>({ op: "video", q: `${t.artist} ${t.title}` });
      if (!ids[0]) { setStatus("Couldn't find a playable version"); return; }
      setStatus("Loading…");
      await openProxied(frameRef.current, `https://www.youtube.com/embed/${ids[0]}?autoplay=1&playsinline=1&rel=0`, prefs);
      setStatus("");
    } catch (e) { setStatus(e instanceof Error ? e.message : "Playback failed"); }
  }

  async function showLyrics() {
    if (!track) return;
    if (lyrics !== null) return setLyrics(null);
    setLyrics("Loading…");
    const r = await api<{ lyrics: string }>({ op: "lyrics", q: track.title, artist: track.artist }).catch(() => ({ lyrics: "" }));
    setLyrics(r.lyrics || "No lyrics found.");
  }

  const Tracks = ({ list }: { list: Track[] }) => (
    <ol className="mt-3 divide-y divide-border rounded-lg border bg-card">
      {list.map((t, i) => (
        <li key={`${t.id}-${i}`} className={cn("flex items-center gap-3 px-3 py-2", track?.id === t.id && "bg-accent")}>
          <button onClick={() => play(list, i)} className="group relative size-10 shrink-0 overflow-hidden rounded bg-muted" aria-label={`Play ${t.title}`}>
            {t.art && <img src={artUrl(t.art)} alt="" loading="lazy" className="size-full object-cover" />}
            <span className="absolute inset-0 grid place-items-center bg-background/60 opacity-0 transition group-hover:opacity-100"><Play className="size-4" /></span>
          </button>
          <div className="min-w-0 flex-1">
            <button onClick={() => play(list, i)} className="block max-w-full truncate text-left text-sm font-medium">{t.title}</button>
            <div className="truncate text-xs text-muted-foreground">
              <button onClick={() => openArtist(t.artistId)} className="hover:underline">{t.artist}</button>
              {t.album && <> · <button onClick={() => openAlbum(t.albumId)} className="hover:underline">{t.album}</button></>}
            </div>
          </div>
          <span className="text-xs tabular-nums text-muted-foreground">{t.duration ? fmt(t.duration) : ""}</span>
        </li>
      ))}
      {list.length === 0 && <li className="px-3 py-4 text-sm text-muted-foreground">No songs.</li>}
    </ol>
  );
  const Albums = ({ list }: { list: Album[] }) => (
    <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
      {list.map((a) => (
        <button key={a.id} onClick={() => openAlbum(a.id)} className="rounded-lg border bg-card p-2 text-left transition hover:bg-accent">
          <div className="aspect-square overflow-hidden rounded-md bg-muted">{a.art && <img src={artUrl(a.art)} alt="" loading="lazy" className="size-full object-cover" />}</div>
          <div className="mt-2 truncate text-sm font-medium">{a.title}</div>
          <div className="truncate text-xs text-muted-foreground">{a.artist}{a.year ? ` · ${a.year}` : ""}</div>
        </button>
      ))}
    </div>
  );
  const Artists = ({ list }: { list: Artist[] }) => (
    <div className="mt-3 flex gap-4 overflow-x-auto pb-2">
      {list.map((a) => (
        <button key={a.id} onClick={() => openArtist(a.id)} className="w-24 shrink-0 text-center">
          <div className="mx-auto size-24 overflow-hidden rounded-full bg-muted">{a.art && <img src={artUrl(a.art)} alt="" loading="lazy" className="size-full object-cover" />}</div>
          <div className="mt-2 truncate text-sm">{a.name}</div>
        </button>
      ))}
    </div>
  );
  const H = ({ children }: { children: React.ReactNode }) => <h2 className="mt-8 font-display text-2xl">{children}</h2>;

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <MobileMenuButton />
        {stack.length > 0 && <button onClick={back} className="rounded-md p-1.5 hover:bg-accent" aria-label="Back"><ArrowLeft className="size-4" /></button>}
        <form onSubmit={search} className="flex flex-1 items-center gap-2 rounded-md border bg-card px-2.5 py-1.5">
          <Search className="size-4 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search songs, albums, artists" className="w-full bg-transparent text-sm outline-none" />
        </form>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-4 py-6">
          {error && <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">{error} <button onClick={() => location.reload()} className="ml-2 underline">Retry</button></div>}
          {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!loading && view && (view.kind === "home" || view.kind === "search") && <>
            <h1 className="font-display text-4xl">Music</h1>
            <p className="mt-1 text-sm text-muted-foreground">{view.title}</p>
            {view.artists.length > 0 && <><H>Artists</H><Artists list={view.artists} /></>}
            <H>Songs</H><Tracks list={view.tracks} />
            {view.albums.length > 0 && <><H>Albums</H><Albums list={view.albums} /></>}
          </>}
          {!loading && view?.kind === "album" && <>
            <div className="flex items-end gap-4">
              <div className="size-32 shrink-0 overflow-hidden rounded-md bg-muted sm:size-44">{view.data.art && <img src={artUrl(view.data.art)} alt="" className="size-full object-cover" />}</div>
              <div className="min-w-0"><div className="label-mono">Album</div><h1 className="font-display text-3xl sm:text-4xl">{view.data.title}</h1><p className="text-sm text-muted-foreground">{view.data.artist}{view.data.year ? ` · ${view.data.year}` : ""} · {view.data.tracks.length} songs</p>
                <button onClick={() => play(view.data.tracks, 0)} className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-sm text-primary-foreground"><Play className="size-4" /> Play</button></div>
            </div>
            <Tracks list={view.data.tracks} />
          </>}
          {!loading && view?.kind === "artist" && <>
            <div className="flex items-end gap-4">
              <div className="size-32 shrink-0 overflow-hidden rounded-full bg-muted sm:size-44">{view.data.art && <img src={artUrl(view.data.art)} alt="" className="size-full object-cover" />}</div>
              <div className="min-w-0"><div className="label-mono">Artist</div><h1 className="font-display text-3xl sm:text-4xl">{view.data.name}</h1>{view.data.fans ? <p className="text-sm text-muted-foreground">{view.data.fans.toLocaleString()} fans</p> : null}
                <button onClick={() => play(view.data.tracks, 0)} className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-sm text-primary-foreground"><Play className="size-4" /> Play</button></div>
            </div>
            <H>Popular</H><Tracks list={view.data.tracks} />
            <H>Albums</H><Albums list={view.data.albums} />
          </>}
          {lyrics !== null && <pre className="mt-6 whitespace-pre-wrap rounded-lg border bg-card p-4 font-sans text-sm leading-relaxed">{lyrics}</pre>}
        </div>
      </div>

      <div className={cn("shrink-0 border-t bg-card", !track && "hidden")}>
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-3 py-2">
          {track?.art && <img src={artUrl(track.art)} alt="" className="size-11 rounded-md object-cover" />}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{track?.title}</div>
            <div className="truncate text-xs text-muted-foreground">{status || track?.artist}</div>
          </div>
          <button onClick={() => play(queue, Math.max(0, cur - 1))} className="rounded-md p-2 hover:bg-accent" aria-label="Previous"><SkipBack className="size-4" /></button>
          <button onClick={() => { setCur(-1); if (frameRef.current) frameRef.current.src = "about:blank"; }} className="rounded-full bg-primary p-2 text-primary-foreground" aria-label="Stop"><Pause className="size-4" /></button>
          <button onClick={() => play(queue, Math.min(queue.length - 1, cur + 1))} className="rounded-md p-2 hover:bg-accent" aria-label="Next"><SkipForward className="size-4" /></button>
          <button onClick={showLyrics} className={cn("rounded-md p-2 hover:bg-accent", lyrics !== null && "bg-accent")} aria-label="Lyrics"><Mic2 className="size-4" /></button>
          <iframe ref={frameRef} title="Player" className="h-11 w-20 rounded-md border-0" allow="autoplay; encrypted-media" />
        </div>
      </div>
    </div>
  );
}
