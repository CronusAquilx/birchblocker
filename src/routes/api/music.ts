import { createFileRoute } from "@tanstack/react-router";
import { authenticateRequest } from "@/lib/astra/api-user.server";

/** Music relay: Deezer catalog (songs, albums, artists), artwork, lyrics and YouTube lookups load through Astra's server. */
const YT_KEY = "AIzaSyCc5PPxKMk7-hqMK284HwnMISd13wIF15Y";
const DZ = "https://api.deezer.com";

async function authed(request: Request, url: URL) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || url.searchParams.get("token") || "";
  if (!token) return false;
  return Boolean(await authenticateRequest(new Request(request.url, { headers: { authorization: `Bearer ${token}` } })));
}

function json(data: unknown, cache = 300) {
  return Response.json(data, { headers: { "cache-control": `private, max-age=${cache}` } });
}

async function dz(path: string): Promise<any> {
  const r = await fetch(`${DZ}${path}`, { headers: { "user-agent": "Mozilla/5.0 Astra" } }).catch(() => null);
  if (!r?.ok) return {};
  return r.json().catch(() => ({}));
}

const track = (t: any, album?: any) => ({
  id: String(t.id), title: t.title ?? "", artist: t.artist?.name ?? "", artistId: String(t.artist?.id ?? ""),
  album: t.album?.title ?? album?.title ?? "", albumId: String(t.album?.id ?? album?.id ?? ""),
  art: t.album?.cover_big ?? album?.cover_big ?? "", duration: t.duration ?? 0, preview: t.preview ?? "",
});

const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36" };
let scId: { id: string; at: number } | null = null;
async function soundcloudId(): Promise<string> {
  if (scId && Date.now() - scId.at < 6 * 3600_000) return scId.id;
  const html = await (await fetch("https://soundcloud.com", { headers: UA })).text();
  const scripts = [...html.matchAll(/https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+\.js/g)].map((m) => m[0]).reverse();
  for (const src of scripts) {
    const m = (await (await fetch(src)).text()).match(/client_id:"([A-Za-z0-9]{32})"/);
    if (m) { scId = { id: m[1]!, at: Date.now() }; return m[1]!; }
  }
  throw new Error("SoundCloud unavailable");
}

/** Finds a playable audio URL for a song on the chosen server. */
async function resolveAudio(server: string, q: string, preview: string): Promise<string | null> {
  if (server === "deezer") return /^https:\/\/[a-z0-9-]+\.dzcdn\.net\//i.test(preview) ? preview : null;
  if (server === "audius") {
    const r: any = await fetch(`https://api.audius.co/v1/tracks/search?query=${encodeURIComponent(q)}&app_name=birchblock`).then((x) => x.json()).catch(() => ({}));
    const t = (r.data ?? []).find((x: any) => x?.is_streamable !== false);
    return t ? `https://api.audius.co/v1/tracks/${encodeURIComponent(t.id)}/stream?app_name=birchblock` : null;
  }
  if (server === "soundcloud") {
    const cid = await soundcloudId();
    const r: any = await fetch(`https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(q)}&limit=10&client_id=${cid}`, { headers: UA }).then((x) => x.json()).catch(() => ({}));
    for (const t of r.collection ?? []) {
      const prog = (t.media?.transcodings ?? []).find((x: any) => x.format?.protocol === "progressive");
      if (!prog || t.policy === "BLOCK" || t.policy === "SNIP") continue;
      const j: any = await fetch(`${prog.url}?client_id=${cid}`, { headers: UA }).then((x) => x.json()).catch(() => ({}));
      if (j.url) return j.url;
    }
    return null;
  }
  return null;
}
const AUDIO_HOST = /^https:\/\/(([a-z0-9-]+\.)*(dzcdn\.net|sndcdn\.com)\/|api\.audius\.co\/v1\/tracks\/)/i;
const albumOf = (a: any) => ({ id: String(a.id), title: a.title ?? "", artist: a.artist?.name ?? "", art: a.cover_big ?? "", year: (a.release_date ?? "").slice(0, 4) });
const artistOf = (a: any) => ({ id: String(a.id), name: a.name ?? "", art: a.picture_big ?? "", fans: a.nb_fan ?? 0 });
const id = (v: string | null) => (/^\d{1,15}$/.test(v ?? "") ? v : null);

async function handle({ request }: { request: Request }) {
  const url = new URL(request.url);
  if (!(await authed(request, url))) return new Response("Unauthorized", { status: 401 });
  const q = encodeURIComponent((url.searchParams.get("q") ?? "").slice(0, 200));

  switch (url.searchParams.get("op")) {
    case "home": {
      const d = await dz("/chart/0?limit=30");
      return json({
        tracks: (d.tracks?.data ?? []).map((t: any) => track(t)),
        albums: (d.albums?.data ?? []).map(albumOf),
        artists: (d.artists?.data ?? []).map(artistOf),
      }, 1800);
    }
    case "search": {
      const [t, al, ar] = await Promise.all([dz(`/search?q=${q}&limit=30`), dz(`/search/album?q=${q}&limit=20`), dz(`/search/artist?q=${q}&limit=12`)]);
      return json({ tracks: (t.data ?? []).map((x: any) => track(x)), albums: (al.data ?? []).map(albumOf), artists: (ar.data ?? []).map(artistOf) });
    }
    case "album": {
      const i = id(url.searchParams.get("id"));
      if (!i) return new Response("Bad id", { status: 400 });
      const a = await dz(`/album/${i}`);
      return json({ ...albumOf(a), tracks: (a.tracks?.data ?? []).map((t: any) => track(t, a)) }, 3600);
    }
    case "artist": {
      const i = id(url.searchParams.get("id"));
      if (!i) return new Response("Bad id", { status: 400 });
      const [a, top, albums] = await Promise.all([dz(`/artist/${i}`), dz(`/artist/${i}/top?limit=20`), dz(`/artist/${i}/albums?limit=40`)]);
      return json({ ...artistOf(a), tracks: (top.data ?? []).map((t: any) => track(t)), albums: (albums.data ?? []).map((x: any) => albumOf({ ...x, artist: a })) }, 3600);
    }
    case "art": {
      const src = url.searchParams.get("src") ?? "";
      if (!/^https:\/\/([a-z0-9-]+\.)*(dzcdn\.net|deezer\.com|mzstatic\.com)\//i.test(src)) return new Response("Bad url", { status: 400 });
      const r = await fetch(src);
      return new Response(r.body, { status: r.status, headers: { "content-type": r.headers.get("content-type") ?? "image/jpeg", "cache-control": "private, max-age=86400" } });
    }
    case "resolve": {
      const raw = (url.searchParams.get("q") ?? "").slice(0, 200);
      try {
        const audio = await resolveAudio(url.searchParams.get("server") ?? "", raw, url.searchParams.get("preview") ?? "");
        return json({ url: audio }, 0);
      } catch (e) { return json({ url: null, error: e instanceof Error ? e.message : "failed" }, 0); }
    }
    case "audio": {
      const src = url.searchParams.get("u") ?? "";
      if (!AUDIO_HOST.test(src)) return new Response("Bad url", { status: 400 });
      const range = request.headers.get("range");
      const r = await fetch(src, { headers: { ...UA, ...(range ? { range } : {}) }, redirect: "follow" });
      const h = new Headers({ "content-type": r.headers.get("content-type") ?? "audio/mpeg", "cache-control": "private, max-age=3600", "accept-ranges": "bytes" });
      for (const k of ["content-length", "content-range"]) { const v = r.headers.get(k); if (v) h.set(k, v); }
      return new Response(r.body, { status: r.status, headers: h });
    }
    case "lyrics": {
      const artist = url.searchParams.get("artist") ?? "";
      const r = await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${q}`).catch(() => null);
      const d: any = r?.ok ? await r.json().catch(() => ({})) : {};
      return json({ lyrics: d.lyrics ?? "" }, 86400);
    }
    case "video": {
      const r = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoCategoryId=10&maxResults=8&videoEmbeddable=true&q=${q}&key=${YT_KEY}`);
      if (!r.ok) return json({ ids: [], error: `YouTube ${r.status}` }, 0);
      const d: any = await r.json();
      const ids = (d.items ?? []).map((i: any) => i?.id?.videoId).filter((v: unknown) => typeof v === "string" && /^[\w-]{11}$/.test(v));
      return json({ ids }, 86400);
    }
  }
  return new Response("Unknown op", { status: 400 });
}

export const Route = createFileRoute("/api/music")({ server: { handlers: { GET: handle } } });
