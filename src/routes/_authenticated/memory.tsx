import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { MobileMenuButton } from "@/components/astra/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/memory")({
  head: () => ({ meta: [{ title: "Memory — Astra" }] }),
  component: MemoryPage,
});

function MemoryPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const { data } = useQuery({
    queryKey: ["memories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("memories").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || !user) return;
    const { error } = await supabase.from("memories").insert({ user_id: user.id, content: text.trim() });
    if (error) { toast.error("Couldn't save that"); return; }
    setText("");
    qc.invalidateQueries({ queryKey: ["memories"] });
  }
  async function remove(id: string) {
    await supabase.from("memories").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["memories"] });
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="flex h-12 items-center px-3 md:hidden"><MobileMenuButton /></header>
      <div className="mx-auto w-full max-w-2xl px-4 py-8 md:py-14">
        <h1 className="font-display text-4xl">Memory</h1>
        <p className="mt-2 text-sm text-muted-foreground">Facts Astra keeps in mind in every chat. Only you can see them.</p>
        <form onSubmit={add} className="mt-6 flex gap-2">
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. I prefer TypeScript examples" />
          <Button type="submit">Remember</Button>
        </form>
        <ul className="mt-6 divide-y rounded-lg border">
          {data?.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted-foreground">Nothing remembered yet.</li>}
          {data?.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-4 py-3 text-sm">
              <span className="flex-1">{m.content}</span>
              <button onClick={() => remove(m.id)} className="text-muted-foreground hover:text-destructive" aria-label="Forget">
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
