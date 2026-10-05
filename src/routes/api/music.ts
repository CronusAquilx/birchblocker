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
  art: t.album?.cover_big ?? album?.cover_big ?? "", duration: t.duration ?? 0,
});
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
