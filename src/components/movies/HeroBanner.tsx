import { useState, useEffect } from 'react';
import { Link } from '@tanstack/react-router';
import { Play, Info } from 'lucide-react';
import { backdrop, type TMDBMovie } from '@/lib/movies/tmdb';

interface Props {
  movies: TMDBMovie[] | undefined;
}

export default function HeroBanner({ movies }: Props) {
  const [current, setCurrent] = useState(0);
  const featured = (movies || [])
    .filter((item) => !item.media_type || item.media_type === 'movie' || item.media_type === 'tv')
    .slice(0, 5);

  useEffect(() => {
    if (featured.length === 0) return;
    const timer = setInterval(() => setCurrent((c) => (c + 1) % featured.length), 8000);
    return () => clearInterval(timer);
  }, [featured.length]);

  const movie = featured[current];
  if (!movie) {
    return <div className="relative h-[70vh] sm:h-[80vh] bg-secondary/30 animate-pulse" />;
  }

  const title = movie.title || movie.name || 'Untitled';
  const type = movie.media_type === 'tv' || (!movie.media_type && (Boolean(movie.first_air_date) || (Boolean(movie.name) && !movie.title)))
    ? 'tv'
    : 'movie';

  return (
    <div className="relative h-[70vh] sm:h-[80vh] overflow-hidden">
      <img
        key={movie.id}
        src={backdrop(movie.backdrop_path)}
        alt={title}
        className="absolute inset-0 w-full h-full object-cover animate-in fade-in duration-700"
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />

      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-background/90 via-background/30 to-transparent" />

      <div className="absolute bottom-[18%] left-0 right-0 px-5 sm:px-8 max-w-[1400px] mx-auto">
        <div key={movie.id} className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <h1 className="font-serif text-5xl sm:text-7xl lg:text-8xl text-foreground mb-4 max-w-2xl tracking-[0.08em] leading-none">
            {title}
          </h1>
          <p className="text-sm sm:text-base text-foreground/80 max-w-xl line-clamp-2 mb-6">{movie.overview}</p>
          <div className="flex gap-2.5 flex-wrap">
            <Link
              to="/movies/watch/$type/$id"
              params={{ type, id: String(movie.id) }}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-foreground text-background font-semibold hover:opacity-90 transition-opacity shadow-lg"
            >
              <Play fill="currentColor" size={16} /> Watch now
            </Link>
            <Link
              to="/movies/title/$type/$id"
              params={{ type, id: String(movie.id) }}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-white/10 backdrop-blur-xl border border-white/15 text-white font-semibold hover:bg-white/15 transition-colors"
            >
              <Info size={16} /> More info
            </Link>
          </div>
        </div>

        <div className="flex gap-1.5 mt-8">
          {featured.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              aria-label={`Slide ${i + 1}`}
              className={`h-1 rounded-full transition-all duration-300 ${i === current ? 'w-6 bg-white' : 'w-1 bg-white/30'}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
