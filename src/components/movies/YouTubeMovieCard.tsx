import { Link } from '@tanstack/react-router';
import { Play } from 'lucide-react';

interface Props {
  title: string;
  year: string;
  videoId: string;
  poster: string;
  source?: 'youtube' | 'archive';
  index?: number;
}

export default function YouTubeMovieCard({ title, year, videoId, poster, source = 'youtube', index = 0 }: Props) {
  return (
    <div className="group relative w-[42vw] max-w-[190px] min-w-[154px] shrink-0 snap-start animate-in fade-in slide-in-from-bottom-2 duration-300 sm:w-[180px] lg:w-[190px]">
      <Link to="/movies/free/$videoId" params={{ videoId }} search={{ source }}>
        <div className="relative aspect-[2/3] overflow-hidden rounded-md border border-border bg-card">
          <img
            src={poster}
            alt={title}
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
            onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-3">
            <p className="text-sm font-semibold text-foreground line-clamp-2">{title}</p>
            <p className="text-xs text-muted-foreground">{year}</p>
            <div className="mt-2 flex items-center gap-1 text-xs text-star font-medium">
              <Play size={12} /> Watch Free
            </div>
          </div>
          <div className="absolute top-2 left-2">
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-star text-star-foreground">
              {source === 'archive' ? 'FREE' : 'YT'}
            </span>
          </div>
        </div>
        <div className="mt-2 px-1">
          <p className="text-sm font-medium text-foreground/90 line-clamp-1">{title}</p>
          <p className="text-xs text-muted-foreground">{year} • Free</p>
        </div>
      </Link>
    </div>
  );
}
