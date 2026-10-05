import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Clock, Search } from "lucide-react";
import { MobileMenuButton } from "@/components/astra/AppShell";
import HeroBanner from "@/components/movies/HeroBanner";
import ContentRow from "@/components/movies/ContentRow";
import ChannelsRow from "@/components/movies/ChannelsRow";
import FreeContentRow from "@/components/movies/FreeContentRow";
import MovieCard from "@/components/movies/MovieCard";
import { useAnime, useKDrama, useNowPlaying, usePopular, useSearch, useTopRatedMovies, useTopRatedTV, useTrending } from "@/lib/movies/hooks";
import { YOUTUBE_MOVIES } from "@/lib/movies/tmdb";
import { useWatchlist } from "@/lib/movies/watchlist";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/** Asks once per visit whether the user is at home or school; school locks the player to APIPlayer. */
function WatchModePrompt() {
  const [open, setOpen] = useState(false);
  useEffect(() => { if (!sessionStorage.getItem("astra-watch-mode-asked")) setOpen(true); }, []);
  const pick = (mode: "home" | "school") => {
    localStorage.setItem("astra-watch-mode", mode);
    sessionStorage.setItem("astra-watch-mode-asked", "1");
    setOpen(false);
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && pick((localStorage.getItem("astra-watch-mode") as "home" | "school") || "home")}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Where are you watching?</DialogTitle>
          <DialogDescription>At school, Astra only uses the source that isn't blocked on school networks.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          <Button size="lg" variant="secondary" onClick={() => pick("home")}>At home</Button>
          <Button size="lg" onClick={() => pick("school")}>At school</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const RECENT_KEY = "astra-movie-searches";

export const Route = createFileRoute("/_authenticated/movies/")({
  head: () => ({ meta: [{ title: "Movies — Astra" }] }),
  component: Movies,
});

function Movies() {
  const [q, setQ] = useState("");
  const [recents, setRecents] = useState<string[]>([]);
  const trending = useTrending();
  const popular = usePopular();
  const nowPlaying = useNowPlaying();
  const topMovies = useTopRatedMovies();
  const topTV = useTopRatedTV();
  const anime = useAnime();
  const kdrama = useKDrama();
  const results = useSearch(q.trim());
  const watchlist = useWatchlist();

  useEffect(() => {
    try {
      setRecents(JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]"));
    } catch {
      setRecents([]);
    }
  }, []);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 3) return;
    const timer = setTimeout(() => {
      setRecents((prev) => {
        const next = [term, ...prev.filter((x) => x.toLowerCase() !== term.toLowerCase())].slice(0, 8);
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
        return next;
      });
    }, 900);
    return () => clearTimeout(timer);
  }, [q]);

  return (
    <div className="h-full overflow-y-auto">
      <WatchModePrompt />
      <header className="sticky top-0 z-20 grid h-16 grid-cols-[auto_minmax(0,1fr)] items-center gap-2 border-b border-border bg-background/90 px-3 backdrop-blur sm:px-6">
        <MobileMenuButton />
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search movies & shows" className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
        </div>
      </header>
      {q.trim().length > 1 ? (
        <div className="grid grid-cols-3 gap-3 p-4 sm:grid-cols-4 lg:grid-cols-6">
          {results.data?.map((m) => <MovieCard key={`${m.media_type}-${m.id}`} movie={m} compact />)}
          {results.data?.length === 0 && <p className="col-span-full text-sm text-muted-foreground">No results.</p>}
        </div>
      ) : (
        <>
          {recents.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto px-4 pt-3 pb-1 sm:px-6">
              <Clock className="size-3.5 shrink-0 text-muted-foreground" />
              {recents.map((term) => (
                <button
                  key={term}
                  onClick={() => setQ(term)}
                  className="shrink-0 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  {term}
                </button>
              ))}
            </div>
          )}
          <HeroBanner movies={trending.data} />
          <div className="relative z-10 -mt-12 space-y-1 pb-10 sm:-mt-16">
            <ChannelsRow />
            {!!watchlist.data?.length && (
              <ContentRow title="My List" movies={watchlist.data.map((w) => ({ id: w.tmdb_id, title: w.title ?? "", poster_path: w.poster_path, backdrop_path: null, overview: "", vote_average: 0, genre_ids: [], popularity: 0, media_type: w.media_type }))} />
            )}
            <ContentRow title="Trending now" movies={trending.data} isLoading={trending.isLoading} showRank />
            <ContentRow title="Popular" movies={popular.data} isLoading={popular.isLoading} />
            <ContentRow title="In theaters" movies={nowPlaying.data} isLoading={nowPlaying.isLoading} />
            <ContentRow title="Top rated movies" movies={topMovies.data} isLoading={topMovies.isLoading} />
            <ContentRow title="Top rated shows" movies={topTV.data} isLoading={topTV.isLoading} />
            <ContentRow title="Anime" movies={anime.data} isLoading={anime.isLoading} />
            <ContentRow title="K-Drama" movies={kdrama.data} isLoading={kdrama.isLoading} />
            <FreeContentRow title="Free full movies" movies={YOUTUBE_MOVIES.map((m) => ({ ...m, source: "youtube" as const }))} />
          </div>
        </>
      )}
    </div>
  );
}
