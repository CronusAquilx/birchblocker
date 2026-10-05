import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const DEV_ACCOUNTS = { qais: "qaisdev@gmail.org", chance: "chancedev@gmail.com" } as const;

/** Admin-mode sign-in: checks the access code server-side and returns a one-time login token for a dev account. */
export const devSignIn = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ code: z.string().max(32), account: z.enum(["qais", "chance"]) }).parse(d))
  .handler(async ({ data }) => {
    await new Promise((r) => setTimeout(r, 800)); // slow down guessing
    const expected = process.env["ADMIN_ACCESS_CODE"];
    if (!expected || data.code !== expected) return { ok: false as const, error: "Wrong code" };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = DEV_ACCOUNTS[data.account];
    const { data: list } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    let id = list?.users.find((u) => u.email?.toLowerCase() === email)?.id;
    if (!id) {
      const password = crypto.randomUUID() + crypto.randomUUID();
      const { data: created, error } = await supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error || !created.user) return { ok: false as const, error: "Couldn't create the dev account" };
      id = created.user.id;
    }
    await supabaseAdmin.from("user_roles").upsert({ user_id: id, role: "admin" }, { onConflict: "user_id,role" });
    const { data: link, error } = await supabaseAdmin.auth.admin.generateLink({ type: "magiclink", email });
    if (error || !link.properties?.hashed_token) return { ok: false as const, error: "Couldn't sign in" };
    return { ok: true as const, tokenHash: link.properties.hashed_token };
  });
