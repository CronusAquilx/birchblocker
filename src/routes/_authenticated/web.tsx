import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { searchUrl, usePrefs, type Prefs } from "@/lib/astra/prefs";
import { openProxied } from "@/lib/astra/proxy";
import { ExternalLink, Globe, Plus, Search, X } from "lucide-react";
import { webSearch } from "@/lib/astra/web.functions";
import { MobileMenuButton } from "@/components/astra/AppShell";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/web")({
  head: () => ({ meta: [{ title: "Web — Astra" }] }),
  validateSearch: (s: Record<string, unknown>): { q?: string } => (typeof s["q"] === "string" && s["q"] ? { q: s["q"] } : {}),
  component: Web,
});

type Result = { title: string; url: string; snippet: string };
type Tab = { id: number; title: string; query: string; results: Result[] | null; url: string | null; loading: boolean };
let nextId = 1;
const blank = (): Tab => ({ id: nextId++, title: "New tab", query: "", results: null, url: null, loading: false });

function Web() {
  const search = useServerFn(webSearch);
  const { q: initialQ } = Route.useSearch();
  const prefs = usePrefs();
  const [tabs, setTabs] = useState<Tab[]>(() => [blank()]);
  const [active, setActive] = useState(tabs[0]!.id);
  const [input, setInput] = useState(initialQ ?? "");
  const tab = tabs.find((t) => t.id === active) ?? tabs[0]!;
  const patch = (id: number, p: Partial<Tab>) => setTabs((ts) => ts.map((t) => (t.id === id ? { ...t, ...p } : t)));

  useEffect(() => {
    if (initialQ) void go(undefined, initialQ);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQ]);

  async function go(e?: React.FormEvent, override?: string) {
    e?.preventDefault();
    const q = (override ?? input).trim();
    if (!q) return;
    const id = tab.id;
    if (/^https?:\/\/\S+$/i.test(q) || /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(q)) {
      const url = q.startsWith("http") ? q : `https://${q}`;
      if (prefs.openLinksInNewTab) { window.open(url, "_blank", "noopener"); return; }
      patch(id, { url, title: new URL(url).hostname, query: q });
      return;
    }
    const ext = searchUrl(q, prefs.searchEngine);
    if (ext) { window.open(ext, "_blank", "noopener"); return; }
    patch(id, { loading: true, query: q, title: q, url: null });
    const { results } = await search({ data: { q } }).catch(() => ({ results: [] as Result[] }));
    patch(id, { results, loading: false });
  }

  function newTab() {
    const t = blank();
    setTabs((ts) => [...ts, t]);
    setActive(t.id);
    setInput("");
  }
  function close(id: number) {
    setTabs((ts) => {
      const rest = ts.filter((t) => t.id !== id);
      const next = rest.length ? rest : [blank()];
      if (id === active) setActive(next[next.length - 1]!.id);
      return next;
    });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 overflow-x-auto border-b px-2 pt-2">
        <MobileMenuButton />
        {tabs.map((t) => (
          <div key={t.id} className={cn("group flex max-w-48 shrink-0 items-center gap-1.5 rounded-t-md border border-b-0 px-3 py-1.5 text-xs", t.id === tab.id ? "bg-card" : "text-muted-foreground")}>
            <button className="flex min-w-0 items-center gap-1.5" onClick={() => { setActive(t.id); setInput(t.query); }}>
              <Globe className="size-3 shrink-0" /><span className="truncate">{t.title}</span>
            </button>
            <button onClick={() => close(t.id)} aria-label="Close tab"><X className="size-3" /></button>
          </div>
        ))}
        <button onClick={newTab} className="rounded p-1.5 text-muted-foreground hover:bg-accent" aria-label="New tab"><Plus className="size-4" /></button>
      </div>
      <form onSubmit={go} className="flex items-center gap-2 border-b bg-card px-3 py-2">
        <Search className="size-4 text-muted-foreground" />
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Search the web or type a website address"
          className="flex-1 bg-transparent text-sm outline-none" />
        {tab.url && <a href={tab.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground" aria-label="Open in new window"><ExternalLink className="size-4" /></a>}
      </form>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab.url ? (
          prefs.proxyEnabled ? (
            <ProxiedFrame key={tab.url} url={tab.url} title={tab.title} prefs={prefs} />
          ) : (
            <div className="flex h-full flex-col">
              <iframe key={tab.url} src={tab.url} title={tab.title} className="w-full flex-1 bg-background" sandbox="allow-scripts allow-same-origin allow-forms allow-popups" />
              <p className="border-t px-3 py-1.5 text-xs text-muted-foreground">Page blank? Some sites don't allow being shown inside other apps — use the open-in-new-window button.</p>
            </div>
          )
        ) : tab.loading ? (
          <p className="p-6 text-sm text-muted-foreground">Searching…</p>
        ) : tab.results ? (
          <div className="mx-auto max-w-2xl space-y-5 px-4 py-6">
            {tab.results.length === 0 && <p className="text-sm text-muted-foreground">No results.</p>}
            {tab.results.map((r) => (
              <div key={r.url}>
                <button onClick={() => { patch(tab.id, { url: r.url, title: r.title }); setInput(r.url); }} className="text-left text-base text-star hover:underline">{r.title}</button>
                <div className="truncate text-xs text-muted-foreground">{r.url}</div>
                <p className="mt-1 text-sm">{r.snippet}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <h1 className="font-display text-4xl">Search anything</h1>
            <p className="text-sm text-muted-foreground">Open as many tabs as you like.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ProxiedFrame({ url, title, prefs }: { url: string; title: string; prefs: Prefs }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    openProxied(ref.current!, url, prefs)
      .then(() => { if (!cancelled) setStatus("ready"); })
      .catch(() => { if (!cancelled) setStatus("error"); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, prefs.transport, prefs.wisp]);
  return (
    <div className="flex h-full flex-col">
      <iframe ref={ref} title={title} className="w-full flex-1 bg-background" />
      <p className="border-t px-3 py-1.5 text-xs text-muted-foreground">
        {status === "loading" && "Starting the proxy…"}
        {status === "error" && "The proxy couldn't start — try reloading the page."}
        {status === "ready" && "Loaded through the Astra proxy."}
      </p>
    </div>
  );
}
