import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import MovieCard from "@/components/movies/MovieCard";
import { usePerson } from "@/lib/movies/hooks";
import { img } from "@/lib/movies/tmdb";

export const Route = createFileRoute("/_authenticated/movies/person/$id")({
  head: () => ({ meta: [{ title: "Profile — Astra Movies" }] }),
  component: PersonPage,
});

function PersonPage() {
  const { id } = Route.useParams();
  const { data: person, isLoading } = usePerson(Number(id));
  const [expanded, setExpanded] = useState(false);
  if (isLoading) return <div className="h-full animate-pulse bg-muted" />;
  if (!person)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-muted-foreground">Profile not found.</p>
        <Link to="/movies" className="text-star underline">Back to Movies</Link>
      </div>
    );
  const credits = [...(person.combined_credits?.cast ?? [])]
    .filter((m, i, arr) => arr.findIndex((x) => x.id === m.id) === i)
    .filter((m) => Boolean(m.poster_path) || Boolean(m.title || m.name));

  return (
    <div className="h-full overflow-y-auto">
      <div className="relative h-56 min-h-56 bg-gradient-to-b from-muted/40 to-background">
        {person.profile_path && (
          <img src={img(person.profile_path, "w500")} alt={person.name} className="absolute inset-0 mx-auto h-full object-cover opacity-60 [mask-image:linear-gradient(to_bottom,black_40%,transparent)]" />
        )}
        <Link to="/movies" className="absolute left-3 top-3 rounded-full bg-background/70 p-2"><ArrowLeft className="size-5" /></Link>
        <div className="absolute bottom-4 left-4 flex items-end gap-4">
          {person.profile_path && <img src={img(person.profile_path, "w185")} alt={person.name} className="hidden w-28 rounded-lg border shadow-xl sm:block" />}
          <div>
            <h1 className="font-display text-3xl">{person.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {person.known_for_department ?? "Acting"}
              {person.birthday ? ` · Born ${(person.birthday ?? "").slice(0, 4)}` : ""}
              {person.place_of_birth ? ` · ${person.place_of_birth}` : ""}
            </p>
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-4xl p-5">
        {person.biography && (
          <p className={expanded ? "leading-relaxed" : "leading-relaxed [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:6] overflow-hidden"}>
            {person.biography}
          </p>
        )}
        {person.biography && person.biography.length > 400 && (
          <button onClick={() => setExpanded((e) => !e)} className="mt-1 text-sm text-star hover:underline">
            {expanded ? "Show less" : "Read more"}
          </button>
        )}
        <h2 className="label-mono mt-8">Appears in</h2>
        <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {credits.map((m) => <MovieCard key={m.id} movie={{ ...m, media_type: m.media_type ?? "movie" }} compact />)}
          {credits.length === 0 && <p className="col-span-full text-sm text-muted-foreground">No credited titles found.</p>}
        </div>
      </div>
      <div className="pb-10" />
    </div>
  );
}
