import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { probeEndpoint } from "./provider.server";

export const getModelStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: models } = await context.supabase
      .from("models")
      .select("id, provider, config, display_name")
      .eq("enabled", true)
      .order("sort_order");
    const results = await Promise.all(
      (models ?? []).map(async (m) => ({ id: m.id, name: m.display_name, ...(await probeEndpoint(m)) })),
    );
    return results;
  });
