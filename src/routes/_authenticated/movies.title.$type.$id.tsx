import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Check, Play, Plus, Share2 } from "lucide-react";
import { toast } from "sonner";
import ContentRow from "@/components/movies/ContentRow";
import { useMovieDetail, useTVDetail } from "@/lib/movies/hooks";
import { backdrop, img } from "@/lib/movies/tmdb";
import { useWatchlist } from "@/lib/movies/watchlist";

export const Route = createFileRoute("/_authenticated/movies/title/$type/$id")({
  head: () => ({ meta: [{ title: "Details — Astra Movies" }] }),
  component: Detail,
});

function Detail() {
  const { type, id } = Route.useParams();
  const n = Number(id);
  const isTV = type === "tv";
  const movie = useMovieDetail(isTV ? 0 : n);
  const tv = useTVDetail(isTV ? n : 0);
  const d = isTV ? tv.data : movie.data;
  const wl = useWatchlist();
  const saved = wl.isInWatchlist(n, type);
  if (!d) return <div className="h-full animate-pulse bg-muted" />;
  const title = d.title || d.name || "Untitled";

  return (
    <div className="h-full overflow-y-auto">
      <div className="relative h-[55vh] min-h-80">
        <img src={backdrop(d.backdrop_path)} alt="" className="absolute inset-0 size-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
        <Link to="/movies" className="absolute left-3 top-3 rounded-full bg-background/70 p-2"><ArrowLeft className="size-5" /></Link>
        <div className="absolute bottom-0 left-0 right-0 flex gap-5 p-5">
          <img src={img(d.poster_path)} alt={title} className="hidden w-36 rounded-lg shadow-xl sm:block" />
          <div className="min-w-0 self-end">
            <h1 className="font-display text-3xl sm:text-5xl">{title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {(d.release_date || d.first_air_date || "").slice(0, 4)} · ★ {d.vote_average?.toFixed(1)}
              {d.runtime ? ` · ${d.runtime} min` : ""}{d.number_of_seasons ? ` · ${d.number_of_seasons} seasons` : ""}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link to="/movies/watch/$type/$id" params={{ type, id }} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"><Play className="size-4" /> Play</Link>
              <button
                onClick={() => (saved ? wl.remove.mutate({ tmdb_id: n, media_type: type }) : wl.add.mutate({ tmdb_id: n, media_type: type, title, ...(d.poster_path ? { poster_path: d.poster_path } : {}) }))}
                className="inline-flex items-center gap-2 rounded-md border border-border bg-background/60 px-4 py-2 text-sm"
              >
                {saved ? <Check className="size-4" /> : <Plus className="size-4" />} My List
              </button>
              <button
                onClick={async () => {
                  const url = window.location.href;
                  if (navigator.share) {
                    try {
                      await navigator.share({ title, url });
                    } catch {
                      /* user dismissed */
                    }
                  } else {
                    await navigator.clipboard.writeText(url);
                    toast.success("Link copied");
                  }
                }}
                className="inline-flex items-center gap-2 rounded-md border border-border bg-background/60 px-4 py-2 text-sm"
              >
                <Share2 className="size-4" /> Share
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-4xl space-y-4 p-5">
        {d.tagline && <p className="italic text-muted-foreground">{d.tagline}</p>}
        <p className="leading-relaxed">{d.overview}</p>
        <div className="flex flex-wrap gap-1.5">{d.genres?.map((g) => <span key={g.id} className="rounded-full border border-border px-2.5 py-0.5 text-xs">{g.name}</span>)}</div>
        {!!d.credits?.cast.length && (
          <div className="flex flex-wrap gap-1.5">
            {d.credits.cast.slice(0, 8).map((c) => (
              <Link
                key={c.id}
                to="/movies/person/$id"
                params={{ id: String(c.id) }}
                className="rounded-full border border-border px-2.5 py-1 text-xs hover:bg-accent"
              >
                {c.name}
              </Link>
            ))}
          </div>
        )}
      </div>
      <div className="pb-10"><ContentRow title="More like this" movies={(d.recommendations?.results.length ? d.recommendations.results : d.similar?.results)?.map((m) => ({ ...m, media_type: m.media_type ?? type }))} /></div>
    </div>
  );
}
