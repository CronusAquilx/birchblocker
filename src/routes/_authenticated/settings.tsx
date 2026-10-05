import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { getModelStatus } from "@/lib/astra/status.functions";
import { supabase } from "@/integrations/supabase/client";
import { MobileMenuButton } from "@/components/astra/AppShell";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ACCENTS, resetPrefs, setPrefs, usePrefs, type Prefs } from "@/lib/astra/prefs";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — Astra" }] }),
  component: SettingsPage,
});

const TABS = ["Layout", "Appearance", "Essences", "Proxy", "Privacy", "AI"] as const;
type TabName = (typeof TABS)[number];

const UA_GROUPS: Record<string, string[]> = {
  Desktop: ["Chrome · Windows", "Chrome · macOS", "Safari · macOS", "Firefox · Windows", "Edge · Windows"],
  Mobile: ["Safari · iPhone", "Safari · iPad", "Chrome · Android"],
  TV: ["Google TV / Chromecast", "YouTube TV (Cobalt)", "Samsung TV (Tizen)", "LG TV (webOS)", "Amazon Fire TV", "Apple TV (tvOS)"],
  Console: ["PlayStation 5", "Xbox Series X", "Nintendo Switch"],
  Other: ["Googlebot", "Bingbot"],
};

function Row({ title, desc, children }: { title: string; desc?: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-4 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{title}</div>
        {desc && <div className="mt-0.5 text-xs text-muted-foreground">{desc}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="label-mono">{title}</h2>
      <div className="mt-2 divide-y rounded-lg border bg-card/40">{children}</div>
    </section>
  );
}

function Choice<T extends string>({ value, options, onChange }: { value: T; options: { v: T; label: string; sub?: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="grid gap-2 p-3 sm:grid-cols-2">
      {options.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className={cn("rounded-md border px-3 py-2.5 text-left transition", value === o.v ? "border-star bg-accent" : "hover:bg-accent/50")}
        >
          <div className="text-sm font-medium">{o.label}</div>
          {o.sub && <div className="text-xs text-muted-foreground">{o.sub}</div>}
        </button>
      ))}
    </div>
  );
}

function SettingsPage() {
  const p = usePrefs();
  const [tab, setTab] = useState<TabName>("Layout");
  const set = (x: Partial<Prefs>) => setPrefs(x);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="flex h-12 items-center px-3 md:hidden"><MobileMenuButton /></header>
      <div className="mx-auto w-full max-w-2xl px-4 py-8 md:py-14">
        <div className="flex items-end justify-between">
          <h1 className="font-display text-4xl">Settings</h1>
          <Button variant="ghost" size="sm" onClick={() => { resetPrefs(); toast("Settings reset"); }}>Reset all</Button>
        </div>
        <div className="mt-6 flex gap-1 overflow-x-auto rounded-lg border p-1">
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)} className={cn("shrink-0 rounded-md px-3 py-1.5 text-sm", tab === t ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground")}>
              {t}
            </button>
          ))}
        </div>

        {tab === "Layout" && (
          <>
            <Card title="App layout">
              <Choice
                value={p.layout}
                onChange={(layout) => set({ layout })}
                options={[
                  { v: "classic", label: "Classic", sub: "Full sidebar with chats list" },
                  { v: "launcher", label: "Launcher", sub: "Icon rail, address bar & home screen" },
                ]}
              />
            </Card>
            <Card title="Home screen">
              <Row title="Title"><Input className="w-44" value={p.homeName} onChange={(e) => set({ homeName: e.target.value })} /></Row>
              <Row title="Tagline"><Input className="w-56" value={p.tagline} onChange={(e) => set({ tagline: e.target.value })} /></Row>
              <Row title="Show clock"><Switch checked={p.showClock} onCheckedChange={(showClock) => set({ showClock })} /></Row>
            </Card>
            <Card title="Browsing">
              <Row title="Search engine" desc="Astra keeps results inside the app; others open in a new tab.">
                <Select value={p.searchEngine} onValueChange={(v) => set({ searchEngine: v as Prefs["searchEngine"] })}>
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="astra">Astra</SelectItem>
                    <SelectItem value="duckduckgo">DuckDuckGo</SelectItem>
                    <SelectItem value="google">Google</SelectItem>
                    <SelectItem value="bing">Bing</SelectItem>
                  </SelectContent>
                </Select>
              </Row>
              <Row title="Open websites in a new tab"><Switch checked={p.openLinksInNewTab} onCheckedChange={(openLinksInNewTab) => set({ openLinksInNewTab })} /></Row>
            </Card>
          </>
        )}

        {tab === "Appearance" && <Appearance p={p} set={set} />}

        {tab === "Essences" && (
          <>
            <Card title="Background">
              <Choice
                value={p.background}
                onChange={(background) => set({ background })}
                options={[
                  { v: "plain", label: "Plain" },
                  { v: "dots", label: "Dot grid" },
                  { v: "grid", label: "Lines" },
                  { v: "glow", label: "Accent glow" },
                ]}
              />
            </Card>
            <Card title="Effects">
              <Row title="Glowing home title"><Switch checked={p.glowTitle} onCheckedChange={(glowTitle) => set({ glowTitle })} /></Row>
              <Row title="Reduce motion" desc="Turns off animations everywhere."><Switch checked={p.reduceMotion} onCheckedChange={(reduceMotion) => set({ reduceMotion })} /></Row>
            </Card>
          </>
        )}

        {tab === "Proxy" && (
          <>
            <Card title="Proxy">
              <Row title="Proxy websites" desc="Route the Web tab through your proxy server."><Switch checked={p.proxyEnabled} onCheckedChange={(proxyEnabled) => set({ proxyEnabled })} /></Row>
              <Row title="Proxy games" desc="Route games through Scramjet. Doesn't apply to cloud or emulated games."><Switch checked={p.proxyGames} onCheckedChange={(proxyGames) => set({ proxyGames })} /></Row>
              <Row title="Wisp server" desc="Only used by Epoxy and Libcurl. If no Wisp server is reachable, Astra relay is used automatically.">
                <Input className="w-56" placeholder="wss://your-wisp/" value={p.wisp} onChange={(e) => set({ wisp: e.target.value })} />
              </Row>
            </Card>
            <Card title="Transport">
              <Choice value={p.transport} onChange={(transport) => set({ transport })} options={[
                { v: "astra", label: "Astra relay", sub: "through Astra's server · works on school wifi" },
                { v: "epoxy", label: "Epoxy", sub: "slim TLS · needs Wisp" },
                { v: "libcurl", label: "Libcurl", sub: "OpenSSL TLS · fallback" },
              ]} />
            </Card>
            <Card title="Browser identity">
              <Choice value={p.identity} onChange={(identity) => set({ identity })} options={[
                { v: "mirror", label: "Mirror", sub: "real · coherent" },
                { v: "disguise", label: "Disguise", sub: "synthetic · coherent" },
              ]} />
            </Card>
            <Card title="User agent">
              <Row title="Sent with every proxied request" desc="Sites often serve a lighter page to TVs and consoles.">
                <Select value={p.userAgent} onValueChange={(userAgent) => set({ userAgent })}>
                  <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Default</SelectItem>
                    {Object.entries(UA_GROUPS).map(([g, list]) => (
                      <SelectGroup key={g}>
                        <SelectLabel>{g}</SelectLabel>
                        {list.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              </Row>
            </Card>
            <p className="mt-3 text-xs text-muted-foreground">Powered by Scramjet. Leave the Wisp server empty to use the default public server.</p>
          </>
        )}

        {tab === "Privacy" && (
          <Card title="Stealth">
            <Row title="Tab cloak" desc="Disguise the browser tab title."><Switch checked={p.tabCloak} onCheckedChange={(tabCloak) => set({ tabCloak })} /></Row>
            <Row title="Cloak title"><Input className="w-44" value={p.cloakTitle} onChange={(e) => set({ cloakTitle: e.target.value })} /></Row>
            <Row title="Panic key" desc="Press it anywhere to leave instantly."><Input className="w-20 text-center" maxLength={1} value={p.panicKey} onChange={(e) => set({ panicKey: e.target.value })} /></Row>
            <Row title="Panic website"><Input className="w-56" value={p.panicUrl} onChange={(e) => set({ panicUrl: e.target.value })} /></Row>
          </Card>
        )}

        {tab === "AI" && <AISettings />}
      </div>
    </div>
  );
}

function Appearance({ p, set }: { p: Prefs; set: (x: Partial<Prefs>) => void }) {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  useEffect(() => setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light"), []);
  function applyTheme(t: "dark" | "light") {
    setTheme(t);
    document.documentElement.classList.toggle("dark", t === "dark");
    localStorage.setItem("astra-theme", t);
  }
  return (
    <>
      <Card title="Theme">
        <Row title="Mode">
          <div className="inline-flex rounded-md border p-0.5">
            {(["dark", "light"] as const).map((t) => (
              <button key={t} onClick={() => applyTheme(t)} className={cn("rounded px-4 py-1.5 text-sm capitalize", theme === t ? "bg-accent text-foreground" : "text-muted-foreground")}>{t}</button>
            ))}
          </div>
        </Row>
        <Row title="Accent color">
          <div className="flex gap-2">
            {(Object.keys(ACCENTS) as Prefs["accent"][]).map((a) => (
              <button
                key={a}
                aria-label={a}
                onClick={() => set({ accent: a })}
                className={cn("size-6 rounded-full border-2", p.accent === a ? "border-foreground" : "border-transparent", a === "star" && "bg-star")}
                style={ACCENTS[a] ? { background: ACCENTS[a] } : undefined}
              />
            ))}
          </div>
        </Row>
      </Card>
      <Card title="Size & shape">
        <Row title={`Text size · ${p.fontScale}%`}><Slider className="w-40" min={85} max={125} step={5} value={[p.fontScale]} onValueChange={([v]) => set({ fontScale: v ?? 100 })} /></Row>
        <Row title={`Corner roundness · ${p.radius.toFixed(2)}`}><Slider className="w-40" min={0} max={1.2} step={0.1} value={[p.radius]} onValueChange={([v]) => set({ radius: v ?? 0.3 })} /></Row>
        <Row title="Density">
          <div className="inline-flex rounded-md border p-0.5">
            {(["compact", "comfortable"] as const).map((d) => (
              <button key={d} onClick={() => set({ density: d })} className={cn("rounded px-3 py-1.5 text-sm capitalize", p.density === d ? "bg-accent text-foreground" : "text-muted-foreground")}>{d}</button>
            ))}
          </div>
        </Row>
      </Card>
    </>
  );
}

function AISettings() {
  const fetchStatus = useServerFn(getModelStatus);
  const { data, isFetching, refetch } = useQuery({ queryKey: ["model-status"], queryFn: () => fetchStatus() });
  const { data: usage } = useQuery({
    queryKey: ["usage-today"],
    queryFn: async () => {
      const since = new Date();
      since.setUTCHours(0, 0, 0, 0);
      const { data } = await supabase.from("usage_events").select("units, input_tokens, output_tokens").gte("created_at", since.toISOString());
      return (data ?? []).reduce(
        (a, r) => ({ units: a.units + Number(r.units), tokens: a.tokens + r.input_tokens + r.output_tokens, n: a.n + 1 }),
        { units: 0, tokens: 0, n: 0 },
      );
    },
  });
  const { data: tools } = useQuery({
    queryKey: ["tools"],
    queryFn: async () => (await supabase.from("tools").select("*").order("sort_order")).data ?? [],
  });
  return (
    <>
      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="label-mono">Model server</h2>
          <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn("size-3.5", isFetching && "animate-spin")} /> Check
          </Button>
        </div>
        <div className="mt-2 divide-y rounded-lg border">
          {data?.map((m) => (
            <div key={m.id} className="flex items-center gap-3 px-4 py-3">
              <span className={cn("size-2 rounded-full", m.reachable ? "bg-success" : m.configured ? "bg-destructive" : "bg-muted-foreground")} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{m.name}</div>
                <div className="text-xs text-muted-foreground">{m.detail}{m.modelName ? ` · ${m.modelName}` : ""}</div>
              </div>
            </div>
          ))}
          {!data && <div className="px-4 py-3 text-sm text-muted-foreground">Checking…</div>}
        </div>
      </section>
      <section className="mt-8">
        <h2 className="label-mono">Usage today</h2>
        <div className="mt-2 rounded-lg border p-4">
          <div className="flex items-baseline gap-2">
            <span className="font-display text-3xl">{(usage?.units ?? 0).toFixed(1)}</span>
            <span className="text-sm text-muted-foreground">/ 500 units</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-star" style={{ width: `${Math.min(100, ((usage?.units ?? 0) / 500) * 100)}%` }} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{usage?.n ?? 0} replies · {(usage?.tokens ?? 0).toLocaleString()} tokens. Resets at midnight UTC.</p>
        </div>
      </section>
      <Card title="Tools">
        {tools?.map((t) => (
          <div key={t.id} className="flex items-center gap-3 px-4 py-2.5">
            <span className={cn("size-2 rounded-full", t.enabled ? "bg-success" : "bg-muted-foreground")} />
            <div className="flex-1">
              <div className="text-sm">{t.display_name}</div>
              <div className="text-xs text-muted-foreground">{t.description}</div>
            </div>
          </div>
        ))}
      </Card>
    </>
  );
}
