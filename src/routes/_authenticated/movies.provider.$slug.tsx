import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import MovieCard from "@/components/movies/MovieCard";
import { tmdb } from "@/lib/movies/tmdb";
import { getProvider } from "@/lib/movies/providers";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/movies/provider/$slug")({
  head: () => ({ meta: [{ title: "Channel — Astra Movies" }] }),
  component: ProviderPage,
});

function ProviderPage() {
  const { slug } = Route.useParams();
  const p = getProvider(slug);
  const [mode, setMode] = useState<"movie" | "tv">("movie");
  const q = useQuery({
    queryKey: ["provider", slug, mode],
    queryFn: async () => {
      const params = { with_watch_providers: String(p!.id), watch_region: "US", sort_by: "popularity.desc" };
      const r = mode === "movie" ? await tmdb.discover(params) : await tmdb.discoverTV(params);
      return r.map((m) => ({ ...m, media_type: mode }));
    },
    enabled: !!p,
  });
  if (!p) return <p className="p-6">Channel not found.</p>;
  return (
    <div className="h-full overflow-y-auto p-4">
      <Link to="/movies" className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="size-4" /> Movies</Link>
      <h1 className="mt-3 font-display text-4xl">{p.name}</h1>
      <div className="mt-3 flex gap-1.5">
        {(["movie", "tv"] as const).map((m) => (
          <button key={m} onClick={() => setMode(m)} className={cn("rounded-md border border-border px-3 py-1.5 text-sm", mode === m && "bg-accent")}>{m === "movie" ? "Movies" : "Shows"}</button>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {q.data?.map((m) => <MovieCard key={m.id} movie={m} compact />)}
      </div>
    </div>
  );
}
