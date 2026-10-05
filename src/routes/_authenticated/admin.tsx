import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { MobileMenuButton } from "@/components/astra/AppShell";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Dev dashboard — Astra" }] }),
  component: Admin,
});

const PRESETS = [
  { name: "Ollama", base: "https://your-ollama-host:11434/v1", model: "llama3.1" },
  { name: "Groq", base: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile" },
  { name: "OpenRouter", base: "https://openrouter.ai/api/v1", model: "meta-llama/llama-3.3-70b-instruct:free" },
  { name: "Together", base: "https://api.together.xyz/v1", model: "meta-llama/Llama-3.3-70B-Instruct-Turbo" },
  { name: "Mistral", base: "https://api.mistral.ai/v1", model: "open-mistral-nemo" },
];

function Admin() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: isAdmin, isLoading } = useQuery({
    queryKey: ["is-admin", user?.id],
    enabled: !!user,
    queryFn: async () => (await supabase.rpc("has_role", { _user_id: user!.id, _role: "admin" })).data ?? false,
  });
  const stats = useQuery({
    queryKey: ["admin-stats"],
    enabled: !!isAdmin,
    queryFn: async () => {
      const [profiles, usage, models, tools, keys] = await Promise.all([
        supabase.from("profiles").select("id, display_name, created_at").order("created_at", { ascending: false }),
        supabase.from("usage_events").select("user_id, units, input_tokens, output_tokens, created_at").order("created_at", { ascending: false }).limit(5000),
        supabase.from("models").select("*").order("sort_order"),
        supabase.from("tools").select("*").order("sort_order"),
        supabase.from("provider_keys").select("id, name, base_url, created_at").order("created_at"),
      ]);
      return { profiles: profiles.data ?? [], usage: usage.data ?? [], models: models.data ?? [], tools: tools.data ?? [], keys: keys.data ?? [] };
    },
  });
  const [form, setForm] = useState({ name: "", base: "", key: "", model: "" });
  const [saving, setSaving] = useState(false);

  if (isLoading) return null;
  if (!isAdmin) return <div className="p-8 text-sm">Dev access only. <Link to="/chat" className="underline">Back</Link></div>;
  const d = stats.data;
  const refresh = () => { qc.invalidateQueries({ queryKey: ["admin-stats"] }); qc.invalidateQueries({ queryKey: ["models"] }); };

  async function addProvider() {
    if (!form.name || !form.base || !form.model) { toast.error("Name, address and model are required"); return; }
    setSaving(true);
    const { data: pk, error } = await supabase.from("provider_keys")
      .insert({ name: form.name, base_url: form.base.trim(), api_key: form.key.trim() || null }).select("id").single();
    if (!error && pk) {
      const id = `${form.name}-${form.model}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60);
      const { error: e2 } = await supabase.from("models").upsert({
        id, provider: form.name.toLowerCase(), display_name: `${form.name} · ${form.model}`,
        config: { providerKeyId: pk.id, model: form.model }, enabled: true, sort_order: 50,
      });
      if (e2) toast.error(e2.message); else { toast.success("Added — pick it in the model menu"); setForm({ name: "", base: "", key: "", model: "" }); }
    } else toast.error(error?.message ?? "Failed");
    setSaving(false);
    refresh();
  }

  const totalUnits = d?.usage.reduce((a, r) => a + Number(r.units), 0) ?? 0;
  const perUser = new Map<string, number>();
  d?.usage.forEach((r) => perUser.set(r.user_id, (perUser.get(r.user_id) ?? 0) + Number(r.units)));

  return (
    <div className="h-full overflow-y-auto">
      <header className="flex h-12 items-center px-3 md:hidden"><MobileMenuButton /></header>
      <div className="mx-auto max-w-4xl space-y-10 px-4 py-8">
        <div>
          <h1 className="font-display text-4xl">Dev dashboard</h1>
          <p className="text-sm text-muted-foreground">Unlimited usage is on for dev accounts.</p>
        </div>

        <section className="grid grid-cols-3 gap-3">
          {[["Users", d?.profiles.length ?? 0], ["Replies", d?.usage.length ?? 0], ["Units used", totalUnits.toFixed(1)]].map(([l, v]) => (
            <div key={l} className="rounded-lg border bg-card p-4"><div className="label-mono">{l}</div><div className="mt-1 text-2xl">{v}</div></div>
          ))}
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-medium">Connect an AI provider</h2>
          <p className="text-sm text-muted-foreground">Any OpenAI-compatible service works. Keys are only visible to dev accounts.</p>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button key={p.name} onClick={() => setForm({ ...form, name: p.name, base: p.base, model: p.model })} className="rounded-sm border px-2 py-1 text-xs hover:bg-accent">{p.name}</button>
            ))}
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {([["name", "Name"], ["base", "Server address"], ["key", "API key (optional)"], ["model", "Model name"]] as const).map(([k, l]) => (
              <input key={k} type={k === "key" ? "password" : "text"} placeholder={l} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                className="rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-ring" />
            ))}
          </div>
          <button disabled={saving} onClick={addProvider} className="rounded-md bg-star px-4 py-2 text-sm text-star-foreground disabled:opacity-50">Add provider</button>
          {d?.keys.map((k) => (
            <div key={k.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
              <span>{k.name} <span className="text-muted-foreground">{k.base_url}</span></span>
              <button className="text-xs text-destructive" onClick={async () => { await supabase.from("provider_keys").delete().eq("id", k.id); refresh(); }}>Remove</button>
            </div>
          ))}
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-medium">Models</h2>
          {d?.models.map((m) => (
            <div key={m.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
              <span>{m.display_name} <span className="label-mono">{m.id}</span></span>
              <Switch checked={m.enabled} onCheckedChange={async (v) => { await supabase.from("models").update({ enabled: v }).eq("id", m.id); refresh(); }} />
            </div>
          ))}
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-medium">Tools</h2>
          {d?.tools.map((t) => (
            <div key={t.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
              <span>{t.display_name} <span className="text-muted-foreground">{t.description}</span></span>
              <Switch checked={t.enabled} onCheckedChange={async (v) => { await supabase.from("tools").update({ enabled: v }).eq("id", t.id); refresh(); }} />
            </div>
          ))}
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-medium">Users</h2>
          {d?.profiles.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
              <span>{p.display_name ?? p.id}</span>
              <span className="label-mono">{(perUser.get(p.id) ?? 0).toFixed(1)} units · joined {new Date(p.created_at).toLocaleDateString()}</span>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
