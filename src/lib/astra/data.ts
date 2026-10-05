import { queryOptions } from "@tanstack/react-query";
import type { UIMessage } from "ai";
import { supabase } from "@/integrations/supabase/client";

export const threadsQuery = queryOptions({
  queryKey: ["threads"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("threads")
      .select("id, title, updated_at, model_id, reasoning")
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return data;
  },
});

export const threadQuery = (id: string) =>
  queryOptions({
    queryKey: ["thread", id],
    queryFn: async () => {
      const { data: thread, error } = await supabase.from("threads").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      if (!thread) return null;
      const { data: rows, error: mErr } = await supabase
        .from("messages")
        .select("id, ui_id, role, parts")
        .eq("thread_id", id)
        .order("created_at");
      if (mErr) throw mErr;
      const messages: UIMessage[] = (rows ?? []).map((r) => ({
        id: r.ui_id ?? r.id,
        role: r.role as UIMessage["role"],
        parts: r.parts as UIMessage["parts"],
      }));
      return { thread, messages };
    },
    staleTime: Infinity,
  });

export const modelsQuery = queryOptions({
  queryKey: ["models"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("models")
      .select("id, provider, display_name, description, context_length, capabilities, usage_multiplier")
      .eq("enabled", true)
      .order("sort_order");
    if (error) throw error;
    return data;
  },
});

export const levelsQuery = queryOptions({
  queryKey: ["reasoning_levels"],
  queryFn: async () => {
    const { data, error } = await supabase.from("reasoning_levels").select("*").order("sort_order");
    if (error) throw error;
    return data;
  },
});

/** One-shot handoff of the first message from the new-chat screen to the thread page. */
let pending: { threadId: string; text: string; files?: import("ai").FileUIPart[] } | null = null;
export const setPending = (p: typeof pending) => (pending = p);
export const takePending = (threadId: string) => {
  if (pending?.threadId !== threadId) return null;
  const t = pending;
  pending = null;
  return t;
};
