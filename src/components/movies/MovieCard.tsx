import { Link } from '@tanstack/react-router';
import { Star, Play } from 'lucide-react';
import { img, type TMDBMovie } from '@/lib/movies/tmdb';

interface Props {
  movie: TMDBMovie;
  index?: number;
  showRank?: boolean | undefined;
  compact?: boolean;
}

export default function MovieCard({ movie, index = 0, showRank, compact }: Props) {
  const title = movie.title || movie.name || 'Untitled';
  const year = (movie.release_date || movie.first_air_date || '').slice(0, 4);
  const mediaType = movie.media_type;
  if (mediaType && mediaType !== 'movie' && mediaType !== 'tv') return null;
  const type = mediaType === 'tv' || (!mediaType && (Boolean(movie.first_air_date) || (Boolean(movie.name) && !movie.title)))
    ? 'tv'
    : 'movie';
  const rating = movie.vote_average?.toFixed(1);
  const rank = (index ?? 0) + 1;

  if (showRank && rank <= 10) {
    return (
      <div className="relative flex items-end shrink-0 animate-in fade-in slide-in-from-bottom-2 duration-300">
        <span className={`${compact ? 'mr-[-18px] text-8xl' : 'mr-[-24px] text-[140px]'} pointer-events-none select-none pr-1 font-display leading-none text-transparent [-webkit-text-stroke:2px_var(--muted-foreground)]`}>
          {rank}
        </span>
        <Link to="/movies/title/$type/$id" params={{ type, id: String(movie.id) }} className={`group relative snap-start ${compact ? 'w-[130px]' : 'w-[42vw] max-w-[190px] min-w-[154px] sm:w-[180px] lg:w-[190px]'}`}>
          <div className="relative aspect-[2/3] overflow-hidden rounded-md border border-border shadow-xl">
            <img
              src={img(movie.poster_path)}
              alt={title}
              loading="lazy"
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }}
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background via-background/70 to-transparent p-2">
              <p className="line-clamp-1 text-xs font-semibold text-foreground">{title}</p>
            </div>
          </div>
        </Link>
      </div>
    );
  }

  return (
    <div className={`group relative shrink-0 snap-start ${compact ? 'w-[130px]' : 'w-[42vw] max-w-[190px] min-w-[154px] sm:w-[180px] lg:w-[190px]'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
      <Link to="/movies/title/$type/$id" params={{ type, id: String(movie.id) }}>
        <div className="relative aspect-[2/3] overflow-hidden rounded-md border border-border bg-card shadow-lg transition-all duration-300 group-hover:-translate-y-1 group-hover:border-star/40">
          <img
            src={img(movie.poster_path)}
            alt={title}
            loading="lazy"
            className="w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }}
          />

          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background via-background/80 to-transparent p-3 pt-10">
            <p className="line-clamp-1 text-sm font-semibold leading-tight text-foreground">{title}</p>
            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              {year && <span>{year}</span>}
              {rating && rating !== '0.0' && (
                <span className="flex items-center gap-0.5">
                  <Star size={9} className="text-star" fill="currentColor" />
                  <span className="text-star font-semibold">{rating}</span>
                </span>
              )}
            </div>
          </div>

          <div className="absolute inset-0 flex items-center justify-center bg-background/30 opacity-0 transition-opacity group-hover:opacity-100">
            <div className="flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg">
              <Play className="ml-0.5" size={18} fill="currentColor" />
            </div>
          </div>

          {year === String(new Date().getFullYear()) && (
            <div className="absolute top-2 left-2">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-star text-star-foreground">NEW</span>
            </div>
          )}
        </div>
      </Link>
    </div>
  );
}
