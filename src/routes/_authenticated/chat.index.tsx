import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { setPending } from "@/lib/astra/data";
import { Composer } from "@/components/astra/Composer";
import { MobileMenuButton } from "@/components/astra/AppShell";
import { AstraMark } from "@/components/astra/Mark";

export const Route = createFileRoute("/_authenticated/chat/")({
  head: () => ({ meta: [{ title: "New chat — Astra" }] }),
  component: NewChat,
});

function NewChat() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [modelId, setModelId] = useState("astra");
  const [reasoning, setReasoning] = useState("medium");
  const [busy, setBusy] = useState(false);

  async function start(text: string, files?: import("ai").FileUIPart[]) {
    if (!user) return;
    setBusy(true);
    const { data, error } = await supabase
      .from("threads")
      .insert({ user_id: user.id, model_id: modelId, reasoning })
      .select("id")
      .single();
    setBusy(false);
    if (error || !data) { toast.error("Couldn't start a chat"); return; }
    setPending({ threadId: data.id, text, ...(files ? { files } : {}) });
    qc.invalidateQueries({ queryKey: ["threads"] });
    navigate({ to: "/chat/$threadId", params: { threadId: data.id } });
  }

  const name = user?.user_metadata?.["full_name"]?.split(" ")[0] ?? user?.email?.split("@")[0];

  return (
    <div className="flex h-full flex-col sky">
      <header className="flex h-12 items-center px-3 md:hidden">
        <MobileMenuButton />
      </header>
      <div className="flex flex-1 flex-col items-center justify-center px-4 pb-[env(safe-area-inset-bottom)]">
        <div className="w-full max-w-2xl">
          <div className="mb-8 text-center animate-rise">
            <AstraMark className="mx-auto size-7" />
            <h1 className="mt-4 font-display text-4xl md:text-5xl">
              Good to see you{name ? <>, <em>{name}</em></> : ""}.
            </h1>
          </div>
          <Composer
            onSend={start}
            busy={busy}
            modelId={modelId}
            reasoning={reasoning}
            onModel={setModelId}
            onReasoning={setReasoning}
          />
        </div>
      </div>
    </div>
  );
}
