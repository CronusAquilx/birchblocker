import { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import MovieCard from './MovieCard';
import { type TMDBMovie } from '@/lib/movies/tmdb';
import { Button } from '@/components/ui/button';

interface Props {
  title: string;
  movies: TMDBMovie[] | undefined;
  isLoading?: boolean | undefined;
  showRank?: boolean | undefined;
}

function SkeletonCard() {
  return (
    <div className="w-[42vw] max-w-[190px] min-w-[154px] shrink-0 sm:w-[180px] lg:w-[190px]">
      <div className="aspect-[2/3] animate-pulse rounded-md bg-secondary/60" />
      <div className="mt-2 h-4 w-3/4 rounded bg-secondary/40 animate-pulse" />
      <div className="mt-1 h-3 w-1/2 rounded bg-secondary/30 animate-pulse" />
    </div>
  );
}

export default function ContentRow({ title, movies, isLoading, showRank }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (dir: 'left' | 'right') => {
    const amount = Math.max(320, (scrollRef.current?.clientWidth ?? 400) * 0.82);
    scrollRef.current?.scrollBy({ left: dir === 'left' ? -amount : amount, behavior: 'smooth' });
  };

  const filtered = movies?.filter((m) => !m.media_type || m.media_type === 'movie' || m.media_type === 'tv');

  return (
    <section className="mb-9">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 pb-3 sm:px-6">
        <h2 className="min-w-0 truncate font-display text-2xl text-foreground sm:text-3xl">{title}</h2>
        <div className="flex gap-1">
          <Button type="button" variant="ghost" size="icon" onClick={() => scroll('left')} aria-label={`Scroll ${title} left`} className="rounded-full text-muted-foreground"><ChevronLeft /></Button>
          <Button type="button" variant="ghost" size="icon" onClick={() => scroll('right')} aria-label={`Scroll ${title} right`} className="rounded-full text-muted-foreground"><ChevronRight /></Button>
        </div>
      </div>
      <div ref={scrollRef} className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 scroll-smooth [scrollbar-width:none] sm:gap-4 sm:px-6 [&::-webkit-scrollbar]:hidden">
        {isLoading
          ? Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)
          : filtered?.map((m, i) => <MovieCard key={m.id} movie={m} index={i} showRank={showRank} />)}
      </div>
    </section>
  );
}
