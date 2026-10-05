import { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import YouTubeMovieCard from './YouTubeMovieCard';
import { Button } from '@/components/ui/button';

interface FreeMovie {
  title: string;
  year: string;
  videoId: string;
  poster: string;
  source: 'youtube' | 'archive';
}

interface Props {
  title: string;
  movies: FreeMovie[];
}

export default function FreeContentRow({ title, movies }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const scroll = (dir: 'left' | 'right') => {
    const amount = Math.max(320, (scrollRef.current?.clientWidth ?? 400) * 0.82);
    scrollRef.current?.scrollBy({ left: dir === 'left' ? -amount : amount, behavior: 'smooth' });
  };

  if (!movies.length) return null;

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-3 px-4 sm:px-6">
        <h2 className="font-display text-2xl text-foreground sm:text-3xl">{title}</h2>
        <div className="flex gap-1">
          <Button type="button" variant="ghost" size="icon" onClick={() => scroll('left')} aria-label={`Scroll ${title} left`} className="rounded-full text-muted-foreground"><ChevronLeft /></Button>
          <Button type="button" variant="ghost" size="icon" onClick={() => scroll('right')} aria-label={`Scroll ${title} right`} className="rounded-full text-muted-foreground"><ChevronRight /></Button>
        </div>
      </div>
      <div ref={scrollRef} className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 scroll-smooth [scrollbar-width:none] sm:gap-4 sm:px-6 [&::-webkit-scrollbar]:hidden">
        {movies.map((m, i) => (
          <YouTubeMovieCard key={m.videoId} {...m} index={i} />
        ))}
      </div>
    </section>
  );
}
