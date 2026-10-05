import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { takePending, threadQuery } from "@/lib/astra/data";
import { Composer } from "@/components/astra/Composer";
import { MessageView, Thinking } from "@/components/astra/MessageView";
import { MobileMenuButton } from "@/components/astra/AppShell";
import { AstraMark } from "@/components/astra/Mark";

export const Route = createFileRoute("/_authenticated/chat/$threadId")({
  head: () => ({ meta: [{ title: "Chat — Astra" }] }),
  component: ThreadPage,
});

function ThreadPage() {
  const { threadId } = Route.useParams();
  const { data, isLoading } = useQuery(threadQuery(threadId));
  if (isLoading)
    return (
      <div className="flex h-full items-center justify-center">
        <AstraMark className="size-6" pulsing />
      </div>
    );
  if (!data)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-muted-foreground">This chat doesn't exist.</p>
        <Link to="/chat" className="text-star underline">Start a new one</Link>
      </div>
    );
  return <ChatWindow key={threadId} threadId={threadId} title={data.thread.title} initial={data.messages} model={data.thread.model_id} level={data.thread.reasoning} />;
}

function ChatWindow({ threadId, title, initial, model, level }: { threadId: string; title: string; initial: UIMessage[]; model: string; level: string }) {
  const qc = useQueryClient();
  const [modelId, setModelId] = useState(model);
  const [reasoning, setReasoning] = useState(level);
  const settings = useRef({ modelId, reasoning });
  settings.current = { modelId, reasoning };
  const bottomRef = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, status, stop, error } = useChat({
    id: threadId,
    messages: initial,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      headers: async (): Promise<Record<string, string>> => {
        const { data } = await supabase.auth.getSession();
        return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {};
      },
      prepareSendMessagesRequest: ({ messages, headers }) => ({
        ...(headers ? { headers } : {}),
        body: { threadId, message: messages[messages.length - 1], ...settings.current },
      }),
    }),
    onFinish: () => {
      qc.invalidateQueries({ queryKey: ["threads"] });
      qc.removeQueries({ queryKey: ["thread", threadId] });
    },
  });

  useEffect(() => {
    const t = takePending(threadId);
    if (t) sendMessage({ text: t.text, ...(t.files ? { files: t.files } : {}) });
  }, [threadId, sendMessage]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, status]);

  function persist(patch: { model_id?: string; reasoning?: string }) {
    supabase.from("threads").update(patch).eq("id", threadId).then(() => {});
  }

  const busy = status === "submitted" || status === "streaming";
  const last = messages[messages.length - 1];
  const showThinking = status === "submitted" || (status === "streaming" && last?.role === "user");
  let errText: string | null = null;
  if (error) {
    try {
      errText = (JSON.parse(error.message) as { error?: string }).error ?? error.message;
    } catch {
      errText = error.message;
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3 md:px-6">
        <MobileMenuButton />
        <h1 className="min-w-0 flex-1 truncate text-sm font-medium">{title}</h1>
      </header>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-7 px-4 py-8 md:px-6">
          {messages.map((m) => (
            <MessageView key={m.id} message={m} />
          ))}
          {showThinking && <Thinking />}
          {errText && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
              <div>
                {errText}{" "}
                <Link to="/settings" className="underline">Check connection</Link>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>
      <div className="mx-auto w-full max-w-3xl px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-6">
        <Composer
          onSend={(text, files) => sendMessage({ text, ...(files ? { files } : {}) })}
          onStop={stop}
          busy={busy}
          modelId={modelId}
          reasoning={reasoning}
          onModel={(id) => {
            setModelId(id);
            persist({ model_id: id });
          }}
          onReasoning={(id) => {
            setReasoning(id);
            persist({ reasoning: id });
          }}
          autoFocusKey={threadId}
        />
      </div>
    </div>
  );
}
