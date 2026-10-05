import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bot, Brain, Film, Gamepad2, Globe, LayoutGrid, Search, Settings } from "lucide-react";
import { usePrefs } from "@/lib/astra/prefs";
import { MobileMenuButton } from "@/components/astra/AppShell";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/home")({
  head: () => ({
    meta: [
      { title: "Home — Astra" },
      { name: "description", content: "Your Astra launcher: AI, web, movies and games in one place." },
      { property: "og:title", content: "Home — Astra" },
      { property: "og:description", content: "Your Astra launcher: AI, web, movies and games in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Home,
});

const APPS = [
  { to: "/games", label: "Games", icon: Gamepad2 },
  { to: "/chat", label: "AI", icon: Bot },
  { to: "/movies", label: "Movies", icon: Film },
  { to: "/web", label: "Web", icon: Globe },
  { to: "/memory", label: "Memory", icon: Brain },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

function Home() {
  const p = usePrefs();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="flex h-12 items-center px-3 md:hidden"><MobileMenuButton /></header>
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-4 py-12 text-center">
        {p.showClock && (
          <div className="label-mono mb-4">{now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</div>
        )}
        <h1 className={cn("font-display text-7xl text-star md:text-8xl", p.glowTitle && "title-glow")}>{p.homeName || "astra"}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{p.tagline}</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (q.trim()) navigate({ to: "/web", search: { q: q.trim() } });
          }}
          className="mt-8 flex w-full max-w-md items-center gap-2 rounded-xl border bg-card/60 px-4 py-2.5 backdrop-blur"
        >
          <Search className="size-4 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search for anything!" className="flex-1 bg-transparent text-sm outline-none" />
        </form>
        <div className="mt-10 flex flex-wrap justify-center gap-6">
          {APPS.map((a) => (
            <Link key={a.to} to={a.to} className="group flex w-16 flex-col items-center gap-2">
              <span className="flex size-14 items-center justify-center rounded-full border bg-card/60 transition group-hover:border-star group-hover:text-star">
                <a.icon className="size-5" />
              </span>
              <span className="text-xs">{a.label}</span>
            </Link>
          ))}
          <Link to="/settings" className="group flex w-16 flex-col items-center gap-2">
            <span className="flex size-14 items-center justify-center rounded-full border bg-card/60 text-muted-foreground transition group-hover:border-star">
              <LayoutGrid className="size-5" />
            </span>
            <span className="text-xs text-muted-foreground">Layout</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
