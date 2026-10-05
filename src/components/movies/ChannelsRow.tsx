import { Link } from '@tanstack/react-router';
import { PROVIDER_LIST } from '@/lib/movies/providers';

export default function ChannelsRow() {
  return (
    <section className="mb-8">
      <div className="px-4 sm:px-6 mb-3">
        <h2 className="font-serif text-xl sm:text-2xl text-foreground tracking-wide">Channels & Apps</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Tap to browse everything on that service</p>
      </div>
      <div className="flex gap-3 overflow-x-auto px-4 sm:px-6 pb-2 scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {PROVIDER_LIST.map((c) => (
          <Link
            key={c.slug}
            to="/movies/provider/$slug"
            params={{ slug: c.slug }}
            className={`${c.bg} shrink-0 w-[160px] h-[72px] rounded-2xl border border-white/5 flex items-center justify-center shadow-lg hover:scale-[1.04] hover:border-white/20 transition-all cursor-pointer`}
            aria-label={c.name}
          >
            <span className={`${c.text} ${c.font} text-xl`}>{c.label}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
